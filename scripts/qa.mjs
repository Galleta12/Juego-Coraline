/**
 * QA automatizado del juego.
 *
 * Abre el juego en un Chrome controlado, recorre las escenas y guarda
 * una captura de cada una.
 *
 * Las banderas anti-throttling son imprescindibles: una pestana en
 * segundo plano baja a 1 fps y las animaciones dejan de avanzar, asi que
 * sin ellas el QA reporta fallos que no existen.
 *
 *   node scripts/qa.mjs [carpeta-de-salida]
 */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const URL = process.env.QA_URL ?? "http://localhost:5173";
const OUT = process.argv[2] ?? "qa-shots";
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
    console.error(`No encuentro Chrome en ${CHROME}. Usa CHROME_PATH=...`);
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
      // Sin esto la pestana baja a 1 fps y nada se anima.
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
  await sleep(600);

  // Comprobar que el bucle corre a velocidad normal antes de nada.
  const fps = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    return Math.round(window.__game.loop.actualFps);
  });
  check("el bucle corre a velocidad normal", fps > 30, `${fps} fps`);

  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`        captura ${name}`);
  };

  const goTo = async (scene, patch) => {
    await page.evaluate(
      (key, p) => {
        if (p) window.__state.set(p);
        const g = window.__game;
        g.scene.getScenes(true).forEach((s) => {
          if (s.scene.key !== key) g.scene.stop(s.scene.key);
        });
        g.scene.start(key);
      },
      scene,
      patch ?? null,
    );
    await sleep(1400);
  };

  /* ── 1. Arranque y libro ──────────────────────────────────────── */
  await shot("01-boot");
  await page.keyboard.press("Space");
  await sleep(3000);
  let scene = await page.evaluate(() =>
    window.__game.scene.getScenes(true).map((s) => s.scene.key).join(","),
  );
  check("el arranque lleva al libro", scene.includes("StorybookScene"), scene);

  // La musica del cuaderno tiene que estar sonando de verdad, no solo
  // declarada en el config.
  const musicaIntro = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      const a = window.__audioDebug?.();
      if (a?.key) return a;
      await new Promise((r) => setTimeout(r, 250));
    }
    return window.__audioDebug?.() ?? null;
  });
  check("suena la musica del cuaderno", musicaIntro?.key === "intro",
    musicaIntro ? `pista "${musicaIntro.key}"` : "sin sonda de audio");
  await shot("02-libro");

  // El cuaderno tiene cuatro estados: tapa, dos paginas y contratapa.
  await page.keyboard.press("Space");
  await sleep(1600);
  await shot("03-libro-pagina-1");
  await page.keyboard.press("Space");
  await sleep(1600);
  await shot("03b-libro-pagina-2");

  const paginas = await page.evaluate(() => {
    const s = window.__game.scene.getScene("StorybookScene");
    return { pagina: s.page, textura: s.sheet.texture.key };
  });
  check("las paginas del cuaderno avanzan", paginas.pagina === 2,
    `pagina ${paginas.pagina}, ${paginas.textura}`);

  await page.keyboard.press("Space");
  await sleep(1400);
  await shot("03c-libro-contratapa");
  await page.keyboard.press("Space");
  await sleep(2600);
  scene = await page.evaluate(() =>
    window.__game.scene.getScenes(true).map((s) => s.scene.key).join(","),
  );
  check("el libro lleva a la seleccion", scene.includes("CharacterSelectScene"), scene);
  await shot("04-seleccion");

  /* ── 2. Seleccion de personaje ────────────────────────────────── */
  const picked = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("CharacterSelectScene");
    // La ultima, sea cual sea: el reparto de personajes ha cambiado y
    // un indice fijo se rompe cada vez que se anade o se quita una.
    const slot = s.slots[s.slots.length - 1];
    s.hover(slot, true);
    await new Promise((r) => setTimeout(r, 300));
    s.pick(slot);
    await new Promise((r) => setTimeout(r, 500));
    return Boolean(s.confirmLayer);
  });
  check("el retrato abre el dialogo de confirmacion", picked);
  await shot("05-confirmacion");

  await page.evaluate(async () => {
    const s = window.__game.scene.getScene("CharacterSelectScene");
    s.confirm();
    await new Promise((r) => setTimeout(r, 1200));
  });
  await sleep(2600);
  const hero = await page.evaluate(() => window.__state.get().selectedHero);
  check("guarda el personaje elegido", hero === "red", String(hero));

  /* ── 3. Tutorial ──────────────────────────────────────────────── */
  await sleep(2000);
  const tut = await page.evaluate(() => {
    const s = window.__game.scene.getScene("TutorialScene");
    if (!s?.player) return null;
    return {
      escenas: window.__game.scene.getScenes(true).map((x) => x.scene.key).join(","),
      solidos: s.terrain.solids.getLength(),
      rompibles: s.terrain.breakables.getLength(),
      guiaAlpha: Number((s.guide?.sprite.alpha ?? 0).toFixed(2)),
    };
  });
  check("el tutorial monta el terreno", (tut?.solidos ?? 0) > 100, `${tut?.solidos} tiles`);
  check("el HUD corre en paralelo", (tut?.escenas ?? "").includes("HudScene"), tut?.escenas);
  await sleep(3000);
  const guideAlpha = await page.evaluate(
    () => window.__game.scene.getScene("TutorialScene").guide?.sprite.alpha ?? 0,
  );
  check("el guia aparece", guideAlpha > 0.8, `alpha ${guideAlpha.toFixed(2)}`);
  await shot("06-tutorial");

  /* ── 4. Movimiento y salto ────────────────────────────────────── */
  const before = await page.evaluate(
    () => window.__game.scene.getScene("TutorialScene").player.x,
  );
  await page.keyboard.down("KeyD");
  await sleep(1100);
  await page.keyboard.up("KeyD");
  await sleep(300);
  const after = await page.evaluate(
    () => window.__game.scene.getScene("TutorialScene").player.x,
  );
  check("caminar avanza", after - before > 120, `${Math.round(after - before)} px`);

  const jump = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TutorialScene");
    const base = s.player.y;
    let peak = base;
    const id = setInterval(() => {
      peak = Math.min(peak, s.player.y);
    }, 8);
    return { base, id: String(id) };
  });
  await page.keyboard.down("Space");
  await sleep(500);
  await page.keyboard.up("Space");
  await sleep(1200);
  const height = await page.evaluate((base) => {
    const s = window.__game.scene.getScene("TutorialScene");
    return base - s.player.__peak;
  }, jump.base).catch(() => null);
  void height;

  const jumped = await page.evaluate(() => {
    const s = window.__game.scene.getScene("TutorialScene");
    return s.jumped === true;
  });
  check("el salto se registra", jumped);

  /* ── 5. Pico y bloques ────────────────────────────────────────── */
  const mined = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TutorialScene");
    window.__state.set({ hasPickaxe: true });
    const block = s.terrain.breakables.getChildren()[0];
    const antes = s.terrain.breakables.getLength();
    s.player.setPosition(block.x - 40, block.y + 16);
    // El cuerpo mira hacia el raton, asi que hay que apuntar al bloque
    // o el pico golpea al lado contrario.
    s.input.activePointer.worldX = block.x + 60;
    s.input.activePointer.worldY = block.y;
    s.player.tick(s.input2, 16);
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 4; i++) {
      s.player.mine();
      await new Promise((r) => setTimeout(r, 420));
    }
    return { antes, despues: s.terrain.breakables.getLength() };
  });
  check("el pico rompe bloques", mined.despues < mined.antes, `${mined.antes} -> ${mined.despues}`);

  /* ── 6. Pistola y apuntado ────────────────────────────────────── */
  const aim = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TutorialScene");
    window.__state.set({ hasGun: true });
    await new Promise((r) => setTimeout(r, 200));
    const p = s.input.activePointer;
    // El apuntado es suave: gira un poco por frame hacia el raton, asi
    // que hay que dejarlo asentarse antes de leer el angulo. Con un solo
    // tick el test medía el camino, no el destino.
    const settle = () => {
      for (let i = 0; i < 24; i++) s.player.tick(s.input2, 16);
    };
    // Apuntar arriba a la derecha y luego abajo a la izquierda.
    p.worldX = s.player.x + 300;
    p.worldY = s.player.y - 300;
    settle();
    const a1 = s.player.weapon.aimAngle;
    p.worldX = s.player.x - 300;
    p.worldY = s.player.y + 100;
    settle();
    const a2 = s.player.weapon.aimAngle;
    return { a1, a2, visible: s.player.weapon.sprite.visible };
  });
  check("el arma se ve al conseguirla", aim.visible);
  check(
    "el arma apunta al raton",
    Math.abs(aim.a1 - aim.a2) > 1.5,
    `${aim.a1.toFixed(2)} -> ${aim.a2.toFixed(2)}`,
  );

  const shots = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TutorialScene");
    // En aire libre: disparando pegado a un bloque, el proyectil impacta
    // antes de que de tiempo a contarlo y el test mentiria.
    s.player.setPosition(300, 380);
    await new Promise((r) => setTimeout(r, 60));
    const m = s.player.weapon.muzzle();
    s.bullets.fire(m.x, m.y, -0.6);
    await new Promise((r) => setTimeout(r, 40));
    const vivos = s.bullets.group.getChildren().filter((b) => b.active);
    return {
      n: vivos.length,
      vx: Math.round(vivos[0]?.body?.velocity.x ?? 0),
      visible: vivos[0]?.visible ?? false,
    };
  });
  check(
    "los proyectiles salen y se mueven",
    shots.n > 0 && Math.abs(shots.vx) > 100 && shots.visible,
    `${shots.n} activos, vx=${shots.vx}`,
  );

  /* ── 7. Torta y cafe ──────────────────────────────────────────── */
  const health = await page.evaluate(async () => {
    window.__state.set({ cake: 2 });
    const s = window.__game.scene.getScene("TutorialScene");
    const hud = window.__game.scene.getScene("HudScene");
    hud.refresh();
    const antes = window.__state.get().cake;
    const item = s.pickups.getChildren().find((i) => i.getData("kind") === "cake");
    if (!item) return { antes, despues: antes, sinItem: true };
    item.setVisible(true);
    s.player.setPosition(item.x, item.y + 30);
    await new Promise((r) => setTimeout(r, 400));
    return { antes, despues: window.__state.get().cake };
  });
  check("la torta cura", health.despues > health.antes, `${health.antes} -> ${health.despues}`);

  const coffee = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TutorialScene");
    s.activateCoffee();
    await new Promise((r) => setTimeout(r, 200));
    return window.__state.get().coffeeUntil - s.time.now;
  });
  check("el cafe se activa", coffee > 6000, `${(coffee / 1000).toFixed(1)} s`);
  await shot("07-tutorial-jugando");

  /* ── 8. Luna ──────────────────────────────────────────────────── */
  const cat = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TutorialScene");
    s.spawnCat();
    await new Promise((r) => setTimeout(r, 800));
    return { existe: Boolean(s.cat), x: Math.round(s.cat?.x ?? 0) };
  });
  check("Luna aparece", cat.existe, `x=${cat.x}`);

  /* ── 9. Escena puente y nivel 1 ───────────────────────────────── */
  await goTo("ProPlayerTransitionScene");
  await sleep(3600);
  await shot("08-pro-player");
  const bridge = await page.evaluate(() =>
    window.__game.scene.getScenes(true).map((s) => s.scene.key).join(","),
  );
  check("la escena puente se monta", bridge.includes("ProPlayerTransition"), bridge);

  /* ── Resumen ──────────────────────────────────────────────────── */
  console.log("\n--- ERRORES DE PAGINA ---");
  console.log(errors.length ? [...new Set(errors)].join("\n") : "ninguno");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasadas`);

  await browser.close();
  return failed.length || errors.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
