/**
 * QA del tramo final: tunel, jefa, victoria, pregunta, agenda y ticket.
 *
 * Recorre la cadena entera y guarda una captura de cada escena. La
 * pelea se resuelve por codigo (golpes directos a la jefa) porque lo
 * que se comprueba aqui es el guion y las transiciones, no la punteria.
 *
 * Las banderas anti-throttling son imprescindibles: sin ellas la
 * pestana baja a 1 fps y el QA reporta fallos que no existen.
 *
 *   node scripts/qa_endgame.mjs [carpeta-de-salida]
 */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const URL = process.env.QA_URL ?? "http://localhost:5173";
const OUT = process.argv[2] ?? "qa-endgame";
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

  // Un gesto real antes de nada.
  //
  // El navegador no deja arrancar el AudioContext sin interaccion del
  // usuario. Saltando a las escenas por codigo ese gesto no existe y la
  // musica no suena nunca: no es un fallo del juego, es que faltaba
  // pulsar algo.
  await page.keyboard.press("Space");
  await sleep(1200);

  const goto = async (key, extraState = {}) => {
    await page.evaluate(
      ({ key, extraState }) => {
        window.__state.set({
          selectedHero: "blue",
          hasPickaxe: true,
          hasGun: true,
          cake: 5,
          tutorialDone: true,
          ...extraState,
        });
        const g = window.__game;
        for (const s of g.scene.getScenes(true)) s.scene.stop();
        g.scene.start(key);
      },
      { key, extraState },
    );
    await page.waitForFunction(
      (k) => window.__game.scene.getScene(k).sys.settings.status === 5,
      { timeout: 30000 },
      key,
    );
    await sleep(1600);
  };

  const activeScenes = () =>
    page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));

  const canvas = await page.$("#game canvas");
  const box = await canvas.boundingBox();
  const clickAt = async (fx, fy) => {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  };

  /* ── Tunel ─────────────────────────────────────────────────────── */

  await goto("TunnelScene");
  const tunnel = await page.evaluate(() => {
    const s = window.__game.scene.getScene("TunnelScene");
    return {
      x: Math.round(s.player?.x ?? -1),
      w: s.terrain?.widthPx ?? -1,
      gotKey: Boolean(s.gotKey),
      enemies: (s.villagers?.length ?? 0) + (s.creepers?.length ?? 0),
    };
  });
  check("el túnel arranca", tunnel.x > 0 && tunnel.w > 1000, `x=${tunnel.x} ancho=${tunnel.w}`);
  check("el túnel no pide llave", tunnel.gotKey, "puerta abierta de salida");
  check("el túnel tiene enemigos", tunnel.enemies > 4, `${tunnel.enemies}`);
  await page.screenshot({ path: join(OUT, "01-tunel.png") });

  /* ── Jefa ──────────────────────────────────────────────────────── */

  await goto("BossScene");
  await page.screenshot({ path: join(OUT, "02-jefa-cara.png") });
  await sleep(4200);

  const bossUp = await page.evaluate(() => {
    const s = window.__game.scene.getScene("BossScene");
    return { hp: s.boss?.health ?? -1, started: Boolean(s.started) };
  });
  check("la jefa aparece", bossUp.hp > 0, `${bossUp.hp} de vida`);
  const musicaJefa = await page.evaluate(() => window.__audioDebug?.());
  check("suena la musica de la jefa", musicaJefa?.key === "boss",
    musicaJefa ? `pista "${musicaJefa.key}"` : "nada");
  check("la pelea empieza", bossUp.started);
  await page.screenshot({ path: join(OUT, "03-jefa-pelea.png") });

  // Dejar que lance cebollas y devolver una por codigo.
  //
  // Se sondea en bucle en vez de mirar un instante: la jefa elige
  // ataque al azar y una sola muestra puede caer entre dos tandas.
  const onionTest = await page.evaluate(async () => {
    const s = window.__game.scene.getScene("BossScene");
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      seen = Math.max(seen, s.onions.filter((o) => o.active).length);
      if (seen > 0) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    const o = s.onions.find((x) => x.active && !x.isReturned);
    if (o) o.reflect(s.boss.x, s.boss.y - s.boss.displayHeight * 0.55);
    await new Promise((r) => setTimeout(r, 900));
    return { before: seen, reflected: Boolean(o), hp: s.boss.health };
  });
  check("la jefa lanza cebollas", onionTest.before > 0, `${onionTest.before} en el aire`);
  await page.screenshot({ path: join(OUT, "04-cebollas.png") });

  // Bajarle la vida a la mitad para que suba el totem.
  await page.evaluate(async () => {
    const s = window.__game.scene.getScene("BossScene");
    while (s.boss.health > s.boss.constructor.name && false) break;
    const half = 40 * 0.5;
    while (s.boss.health > half) s.boss.hit(1, false);
    await new Promise((r) => setTimeout(r, 1600));
  });
  const totem = await page.evaluate(() => {
    const s = window.__game.scene.getScene("BossScene");
    return { up: Boolean(s.totem), used: window.__state.get().leonUsed };
  });
  check("el tótem sube a media vida", totem.up && !totem.used);
  await page.screenshot({ path: join(OUT, "05-totem.png") });

  // Ir hasta el totem: Leon entra y baja un cuarto.
  await page.evaluate(async () => {
    const s = window.__game.scene.getScene("BossScene");
    s.player.setPosition(s.totem.x, s.totem.y - 40);
    await new Promise((r) => setTimeout(r, 900));
  });
  const leon = await page.evaluate(() => window.__state.get().leonUsed);
  check("llegar al tótem trae a Leon", leon);
  await page.screenshot({ path: join(OUT, "06-leon.png") });

  await sleep(12000);
  const quarter = await page.evaluate(() => {
    const s = window.__game.scene.getScene("BossScene");
    return { hp: s.boss.health, cat: Boolean(s.cat?.active) };
  });
  check("Leon la deja en un cuarto", quarter.hp <= 10 && quarter.hp > 0, `${quarter.hp} de vida`);
  check("Luna sigue presente en la pelea", quarter.cat);

  // Rematarla: la victoria pasa en esta misma escena.
  await page.evaluate(async () => {
    const s = window.__game.scene.getScene("BossScene");
    while (s.boss.health > 0) s.boss.hit(1, false);
    await new Promise((r) => setTimeout(r, 2600));
  });
  await sleep(2500);
  const beaten = await page.evaluate(() => ({
    st: window.__state.get(),
    scene: window.__game.scene.isActive("BossScene"),
  }));
  check("la jefa cae", beaten.st.bossDefeated);
  check("la celebración es en la misma escena", beaten.scene);
  await page.screenshot({ path: join(OUT, "07-celebracion.png") });

  /* ── Puente de letras ──────────────────────────────────────────── */

  await page.waitForFunction(() => window.__game.scene.isActive("ProHelpScene"), {
    timeout: 30000,
  });
  check("sale el puente de letras", true);

  // La cancion del final tiene que entrar justo aqui, en el corte a las
  // letras, y seguir sonando sin cortarse hasta el resguardo.
  const musicaFinal = await page.evaluate(async () => {
    for (let i = 0; i < 24; i++) {
      const a = window.__audioDebug?.();
      if (a?.key === "finale") return a;
      await new Promise((r) => setTimeout(r, 250));
    }
    return window.__audioDebug?.() ?? null;
  });
  check("la cancion del final entra con las letras", musicaFinal?.key === "finale",
    musicaFinal ? `pista "${musicaFinal.key}"` : "nada");
  await sleep(3000);
  await page.screenshot({ path: join(OUT, "08-pro-ayuda.png") });

  /* ── Las dos puertas ───────────────────────────────────────────── */

  await page.waitForFunction(() => window.__game.scene.isActive("TrueMissionScene"), {
    timeout: 40000,
  });
  await page.waitForFunction(
    () => {
      const s = window.__game.scene.getScene("TrueMissionScene");
      return s.player && !s.player.controlsLocked;
    },
    { timeout: 40000 },
  );
  await sleep(600);

  const doors = await page.evaluate(() => {
    const s = window.__game.scene.getScene("TrueMissionScene");
    return { yes: Boolean(s.yesDoor), no: Boolean(s.noDoor), cat: Boolean(s.cat?.active) };
  });
  check("hay dos puertas", doors.yes && doors.no);
  check("Luna la acompaña hasta el final", doors.cat);
  await page.screenshot({ path: join(OUT, "09-dos-puertas.png") });

  // Caminar al SI primero: el guia tiene que pararla.
  await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TrueMissionScene");
    s.player.setPosition(s.yesDoor.x, s.player.y);
    await new Promise((r) => setTimeout(r, 400));
  });
  await sleep(6000);
  const blocked = await page.evaluate(() => ({
    flag: window.__state.get().guideBlockedYes,
    accepted: window.__state.get().acceptedMission,
    scene: window.__game.scene.isActive("TrueMissionScene"),
  }));
  check("el SÍ está bloqueado al principio", blocked.flag && !blocked.accepted && blocked.scene);
  await page.screenshot({ path: join(OUT, "10-si-bloqueado.png") });

  // Ahora al NO: el creeper.
  await page.evaluate(async () => {
    const s = window.__game.scene.getScene("TrueMissionScene");
    s.player.setPosition(s.noDoor.x, s.player.y);
  });
  await sleep(3200);
  await page.screenshot({ path: join(OUT, "11-creeper.png") });
  await sleep(11000);
  const afterNo = await page.evaluate(() => {
    const s = window.__game.scene.getScene("TrueMissionScene");
    return { tried: window.__state.get().triedNo, noGone: !s.noDoor, busy: s.busy };
  });
  check("el NO desaparece con el creeper", afterNo.tried && afterNo.noGone);
  await page.screenshot({ path: join(OUT, "12-solo-si.png") });

  // Y ahora el SI si vale.
  await page.evaluate(() => {
    const s = window.__game.scene.getScene("TrueMissionScene");
    s.player.setPosition(s.yesDoor.x, s.player.y);
  });
  await page.waitForFunction(() => window.__game.scene.isActive("ScheduleScene"), {
    timeout: 40000,
  });
  check("el SÍ lleva a la agenda", true);

  /* ── Agenda ────────────────────────────────────────────────────── */

  await sleep(1600);
  await page.screenshot({ path: join(OUT, "13-agenda.png") });
  const days = await page.evaluate(() => {
    const s = window.__game.scene.getScene("ScheduleScene");
    return s.dayCells.length;
  });
  check("hay días disponibles en el calendario", days >= 5, `${days} días`);

  await page.evaluate(() => {
    const s = window.__game.scene.getScene("ScheduleScene");
    s.dayCells[0].emit("pointerdown");
  });
  await sleep(1200);
  await page.screenshot({ path: join(OUT, "14-horas.png") });
  const slots = await page.evaluate(() => {
    const s = window.__game.scene.getScene("ScheduleScene");
    const strip = s.hourLayer.list.find((o) => o.type === "Container");
    return strip ? strip.list.length : 0;
  });
  check("hay franjas horarias", slots > 3, `${slots} franjas`);

  await page.evaluate(() => {
    const s = window.__game.scene.getScene("ScheduleScene");
    const strip = s.hourLayer.list.find((o) => o.type === "Container");
    strip.list[0].emit("pointerdown");
  });

  /* ── Ticket ────────────────────────────────────────────────────── */

  await page.waitForFunction(() => window.__game.scene.isActive("TicketScene"), {
    timeout: 20000,
  });
  await sleep(3600);
  const booked = await page.evaluate(() => window.__state.get());
  check("queda fecha y hora guardadas", Boolean(booked.selectedDate && booked.selectedTime),
    `${booked.selectedDate} ${booked.selectedTime}`);

  const musicaTicket = await page.evaluate(() => window.__audioDebug?.());
  check("la cancion no se corta hasta el final", musicaTicket?.key === "finale",
    musicaTicket ? `pista "${musicaTicket.key}"` : "nada");
  await page.screenshot({ path: join(OUT, "14-ticket.png") });

  check("sin errores en consola", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones ok`);
  console.log(`capturas en ${OUT}/`);
  return failed === 0 ? 0 : 1;
}

main().then((c) => process.exit(c));
