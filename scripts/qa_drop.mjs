/**
 * QA del botin del tutorial.
 *
 * El aldeano de practica tiene que morir y dejar la torta EN EL SUELO,
 * visible y recogible andando hasta ella. Es lo que el guia anuncia con
 * "mira lo que suelta", asi que si no aparece la frase queda huerfana.
 */
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "  ok  " : " FALLO"}  ${n}${d ? `  — ${d}` : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1280, height: 760 },
  args: ["--window-size=1280,800", "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__game?.isRunning), { timeout: 20000 });
await page.evaluate(() => {
  window.__state.set({ selectedHero: "blue", hasPickaxe: true, hasGun: true, cake: 5 });
  const g = window.__game;
  for (const s of g.scene.getScenes(true)) s.scene.stop();
  g.scene.start("TutorialScene");
});
await page.waitForFunction(() => window.__game.scene.getScene("TutorialScene").sys.settings.status === 5, { timeout: 30000 });
await sleep(2000);

// Invocar el aldeano de practica directamente y matarlo.
const drop = await page.evaluate(async () => {
  const s = window.__game.scene.getScene("TutorialScene");
  s.spawnFoe("villager", "cake");
  await new Promise((r) => setTimeout(r, 800));
  const foe = s.foes[s.foes.length - 1];
  const murioEn = { x: Math.round(foe.x), y: Math.round(foe.y) };

  // Numero fijo de golpes, nunca un while: al morir `hit` devuelve
  // false y el sprite sigue activo mientras cae, asi que un bucle
  // "mientras siga activo" bloquearia la pestana entera.
  for (let i = 0; i < 6; i++) foe.hit(1, 0);

  // Tiempo para que acabe el arco de caida.
  await new Promise((r) => setTimeout(r, 1800));

  const cam = s.cameras.main;
  const d = s.readyDrops.find((x) => x.kind === "cake");
  const suelo = d ? s.groundBelow(d.sprite.x, d.sprite.y - 40) : null;

  return {
    muerto: !foe.active,
    murioEn,
    jugadoraX: Math.round(s.player.x),
    hayTorta: Boolean(d),
    visible: d ? d.sprite.visible && d.sprite.alpha > 0.5 : false,
    x: d ? Math.round(d.sprite.x) : null,
    y: d ? Math.round(d.sprite.y) : null,
    suelo: suelo === null ? null : Math.round(suelo),
    enPantalla: d ? d.sprite.x > cam.scrollX && d.sprite.x < cam.scrollX + cam.width : false,
    distancia: d ? Math.round(Math.abs(d.sprite.x - s.player.x)) : null,
  };
});

check("el aldeano de practica muere", drop.muerto);
check("suelta la torta", drop.hayTorta, `en (${drop.x}, ${drop.y})`);
check("la torta se ve", drop.visible && drop.enPantalla, "visible y dentro de la camara");
check(
  "la torta queda posada en el suelo",
  drop.suelo !== null && Math.abs(drop.y - drop.suelo) < 30,
  `torta y=${drop.y}, suelo y=${drop.suelo}`,
);
check(
  "cae a un par de pasos, no encima",
  drop.distancia !== null && drop.distancia > 90 && drop.distancia < 320,
  `${drop.distancia} px de la jugadora`,
);

// Y se recoge andando hasta ella.
const picked = await page.evaluate(async () => {
  const s = window.__game.scene.getScene("TutorialScene");
  const d = s.readyDrops.find((x) => x.kind === "cake");
  if (!d) return { ok: false, vida: window.__state.get().cake };
  window.__state.set({ cake: 3 });
  s.player.setPosition(d.sprite.x, d.sprite.y - 10);
  await new Promise((r) => setTimeout(r, 600));
  return { ok: window.__state.get().cake > 3, vida: window.__state.get().cake };
});
check("se recoge andando hasta ella", picked.ok, `torta ${picked.vida}`);

// El creeper que explota tambien tiene que soltar: si no, el tutorial
// se queda esperando un cafe que ya no va a existir.
const boom = await page.evaluate(async () => {
  const s = window.__game.scene.getScene("TutorialScene");
  s.spawnFoe("creeper", "coffee");
  await new Promise((r) => setTimeout(r, 700));
  const foe = s.foes[s.foes.length - 1];
  foe.detonate(() => undefined);
  await new Promise((r) => setTimeout(r, 1800));
  const d = s.readyDrops.find((x) => x.kind === "coffee");
  return { hay: Boolean(d), x: d ? Math.round(d.sprite.x) : null };
});
check("el creeper suelta el café aunque explote", boom.hay, `en x=${boom.x}`);

check("sin errores", errors.length === 0, errors.slice(0, 2).join(" | "));

await page.screenshot({ path: "qa-drop.png" });
await browser.close();
const bad = results.filter((r) => !r).length;
console.log(`\n${results.length - bad}/${results.length} comprobaciones ok`);
process.exit(bad === 0 ? 0 : 1);
