/**
 * QA del bosque.
 *
 * El bosque tiene forma de V y es mas ancho que alto: se baja por la
 * izquierda en escalera hacia la derecha, la llave espera en el fondo y
 * se sube por la pared derecha hasta la puerta. El bot deja pasar la
 * presentacion de camara, hace el descenso, comprueba que puede volver a
 * subir y que la llave y la puerta responden. Guarda capturas.
 *
 * Las banderas anti-throttling son imprescindibles: sin ellas la
 * pestana baja a 1 fps y el QA reporta fallos que no existen.
 *
 *   node scripts/qa_forest.mjs [carpeta-de-salida]
 */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const URL = process.env.QA_URL ?? "http://localhost:5173";
const OUT = process.argv[2] ?? "qa-forest";
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  ok  " : " FALLO"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`No encuentro Chrome en ${CHROME}`);
    return 1;
  }
  mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    defaultViewport: { width: 1280, height: 760 },
    args: [
      "--window-size=1280,800",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion",
    ],
  });

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    // El 404 de /api es normal en desarrollo: no hay funciones
    // serverless. El texto del mensaje no trae la URL, asi que hay que
    // mirar de donde vino.
    const from = m.location?.().url ?? "";
    if (m.type() !== "error") return;
    if (t.includes("/api/") || from.includes("/api/")) return;
    errors.push(`console: ${t}`);
  });

  // "domcontentloaded", no "networkidle2".
  //
  // Las pistas de musica pesan varios MB y se descargan en segundo
  // plano: con networkidle2 la espera no se cumplia nunca y el test
  // moria por timeout antes de empezar. Lo que de verdad indica que el
  // juego esta listo es la comprobacion de isRunning de la linea de
  // abajo, no que la red este en silencio.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#game canvas", { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__game?.isRunning), { timeout: 20000 });

  // Un gesto real: sin el, el navegador no arranca el AudioContext y la
  // musica no suena en el test aunque en el juego si lo haga.
  await page.keyboard.press("Space");
  await sleep(1200);

  // Saltar al bosque con el inventario del tutorial.
  await page.evaluate(() => {
    window.__state.set({
      selectedHero: "blue",
      hasPickaxe: true,
      hasGun: true,
      cake: 5,
      tutorialDone: true,
    });
    const g = window.__game;
    for (const s of g.scene.getScenes(true)) s.scene.stop();
    g.scene.start("ForestLevelScene");
  });

  await page.waitForFunction(
    () => window.__game.scene.getScene("ForestLevelScene").sys.settings.status === 5,
    { timeout: 30000 },
  );

  // La presentacion de camara bloquea los controles. Se espera a que los
  // devuelva en vez de dormir un rato fijo.
  await page.waitForFunction(
    () => {
      const s = window.__game.scene.getScene("ForestLevelScene");
      return s.player && !s.player.controlsLocked;
    },
    { timeout: 60000 },
  );
  await sleep(600);

  const snap = () =>
    page.evaluate(() => {
      const s = window.__game.scene.getScene("ForestLevelScene");
      return {
        x: Math.round(s.player?.x ?? -1),
        y: Math.round(s.player?.y ?? -1),
        villagers: s.villagers?.length ?? -1,
        creepers: s.creepers?.length ?? -1,
        worldW: s.terrain?.widthPx ?? -1,
        worldH: s.terrain?.heightPx ?? -1,
        contraMuro: Boolean(s.player?.body.blocked.left || s.player?.body.blocked.right),
        gotKey: Boolean(s.gotKey),
        cake: window.__state.get().cake,
        fps: Math.round(window.__game.loop.actualFps),
      };
    });

  const start = await snap();
  check("el nivel arranca", start.x > 0, `x=${start.x} y=${start.y}`);
  check(
    "el recorrido es horizontal",
    start.worldW > start.worldH * 2,
    `${start.worldW}x${start.worldH} px`,
  );
  check("empieza arriba a la izquierda", start.y < 200 && start.x < 400,
    `(${start.x}, ${start.y})`);
  check("hay pocos enemigos", start.villagers + start.creepers <= 8,
    `${start.villagers} aldeanos, ${start.creepers} creepers`);
  check("60 fps", start.fps >= 45, `${start.fps} fps`);

  const musica = await page.evaluate(async () => {
    for (let i = 0; i < 24; i++) {
      const a = window.__audioDebug?.();
      if (a?.key) return a;
      await new Promise((r) => setTimeout(r, 250));
    }
    return window.__audioDebug?.() ?? null;
  });
  check("suena la musica del bosque", musica?.key === "forest",
    musica ? `pista "${musica.key}"` : "nada");
  await page.screenshot({ path: join(OUT, "01-inicio.png") });

  // Bajar por el pozo: derecha hasta el boquete, y dejarse caer de
  // repisa en repisa pulsando S para atravesarlas.
  const canvas = await page.$("#game canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);

  // Las cebollas se miden aqui, antes del descenso: el bot no esquiva y
  // si se espera al final puede haber muerto y reiniciado la escena.
  const cebollas = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("ForestLevelScene");
    let vistas = 0;
    let vel = null;
    for (let i = 0; i < 40; i++) {
      if (s.onions.length > vistas) {
        vistas = s.onions.length;
        vel = Math.abs(Math.round(s.onions[0].vx));
      }
      if (vistas > 0) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    return { vistas, velocidad: vel };
  });
  check("cruzan cebollas", cebollas.vistas > 0, `${cebollas.vistas} en pantalla`);
  check("van despacio pero se ven", cebollas.velocidad !== null && cebollas.velocidad < 170,
    `${cebollas.velocidad} px/s`);

  let shot = 2;
  const marks = [];
  await page.keyboard.down("ArrowRight");
  for (let i = 0; i < 130; i++) {
    await sleep(450);
    // Salta y dispara mientras avanza.
    if (i % 3 === 0) {
      await page.keyboard.down("Space");
      await sleep(120);
      await page.keyboard.up("Space");
    }
    await page.mouse.down();
    await sleep(90);
    await page.mouse.up();

    const s = await snap();
    marks.push(s);
    if (i % 12 === 0 && shot <= 6) {
      await page.screenshot({ path: join(OUT, `0${shot++}-avance.png`) });
    }
    if (s.gotKey) break;
    // Al llegar al extremo se suelta la tecla: si no, el bot se queda
    // empotrado contra el muro recibiendo golpes hasta morir, y el test
    // acaba midiendo eso en vez del nivel.
    if (s.contraMuro && s.x > s.worldW * 0.9) break;
    // Esquivar cebollas: si hay una cerca y baja, saltar.
    //
    // Sin esto el bot es un saco de arena y el test solo medía cuanto
    // tarda en morir de pie, que no dice nada del nivel.
    const peligro = await page.evaluate(() => {
      const s = window.__game.scene.getScene("ForestLevelScene");
      if (!s.onions) return null;
      const p = s.player;
      const cerca = s.onions.find((o) => Math.abs(o.sprite.x - p.x) < 190);
      return cerca ? Math.round(cerca.sprite.y - p.y) : null;
    });
    if (peligro !== null && peligro > -70) {
      await page.keyboard.down("Space");
      await sleep(200);
      await page.keyboard.up("Space");
      await sleep(260);
    }

    // Bajar: S atraviesa la repisa en la que este parada.
    await page.keyboard.down("ArrowDown");
    await sleep(180);
    await page.keyboard.up("ArrowDown");
    if (i > 2 && Math.abs(s.y - marks[i - 1].y) < 3) {
      // Atascada: picar. El pico va con el boton derecho.
      for (let k = 0; k < 4; k++) {
        await page.mouse.down({ button: "right" });
        await sleep(80);
        await page.mouse.up({ button: "right" });
        await sleep(320);
      }
      await page.keyboard.down("Space");
      await sleep(140);
      await page.keyboard.up("Space");
    }
  }
  await page.keyboard.up("ArrowRight");
  await sleep(500);

  const mid = await snap();
  const descended = mid.y - start.y;
  check("baja y avanza de lado", descended > 300 && mid.x - start.x > 500,
    `${Math.round(descended)} px abajo, ${Math.round(mid.x - start.x)} px a la derecha`);
  check("no se queda sin torta al instante", mid.cake > 0, `torta ${mid.cake}`);

  await page.screenshot({ path: join(OUT, "07-final-ida.png") });

  // Subir de vuelta: es lo que hacia imposible acabar el nivel.
  const climb = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("ForestLevelScene");
    // Se deja en el fondo, a la derecha de la camara de la llave, que
    // es justo donde arranca la escalera de vuelta.
    window.__state.set({ cake: 5 });
    s.player.setPosition(s.terrain.widthPx * 0.76, s.terrain.heightPx - 90);
    await new Promise((r) => setTimeout(r, 700));
    return Math.round(s.player.y);
  });

  // Sube apuntando a la zona de solape.
  //
  // Las repisas se alternan de pared pero se solapan ocho tiles en el
  // centro del pozo. Ahi es donde se sube, y es donde apuntaria una
  // persona: el bot hace lo mismo en vez de zigzaguear a ciegas.
  // La subida es un rincon contra el muro derecho: basta con pegarse a
  // el y saltar, que es lo que haria cualquiera.
  const overlapX = await page.evaluate(
    () => window.__game.scene.getScene("ForestLevelScene").terrain.widthPx - 60,
  );

  let held = null;
  for (let i = 0; i < 34; i++) {
    const x = await page.evaluate(
      () => Math.round(window.__game.scene.getScene("ForestLevelScene").player.x),
    );
    const want = Math.abs(x - overlapX) < 40 ? null : x < overlapX ? "ArrowRight" : "ArrowLeft";
    if (want !== held) {
      if (held) await page.keyboard.up(held);
      if (want) await page.keyboard.down(want);
      held = want;
    }
    await page.keyboard.down("Space");
    await sleep(200);
    await page.keyboard.up("Space");
    await sleep(560);
  }
  if (held) await page.keyboard.up(held);
  await sleep(400);

  const climbed = await page.evaluate(() =>
    Math.round(window.__game.scene.getScene("ForestLevelScene").player.y),
  );
  check("se puede volver a subir", climb - climbed > 240, `subió ${climb - climbed} px`);
  await page.screenshot({ path: join(OUT, "07b-subiendo.png") });

  // Forzar la llave y comprobar la puerta.
  const doorTest = await page.evaluate(async () => {
    const g = window.__game;
    const s = g.scene.getScene("ForestLevelScene");
    s.takeKey?.();
    await new Promise((r) => setTimeout(r, 400));
    const hadKey = window.__state.get().hasKey;
    // Teletransportar a la puerta y pulsar E.
    s.player.setPosition(s.door.x, s.door.y - 60);
    await new Promise((r) => setTimeout(r, 700));
    return { hadKey, doorX: Math.round(s.door.x), objective: hadKey };
  });
  check("la llave se recoge", doorTest.hadKey, `puerta en x=${doorTest.doorX}`);
  await page.screenshot({ path: join(OUT, "08-puerta.png") });

  await page.keyboard.press("KeyE");
  await sleep(1600);
  const after = await page.evaluate(() => ({
    scenes: window.__game.scene.getScenes(true).map((s) => s.scene.key),
  }));
  check("la puerta cierra el nivel", !after.scenes.includes("ForestLevelScene"),
    after.scenes.join(", "));

  check("sin errores en consola", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones ok`);
  console.log(`capturas en ${OUT}/`);
  return failed === 0 ? 0 : 1;
}

main().then((c) => process.exit(c));
