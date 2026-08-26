/**
 * Comprueba la regla del NO en la pantalla de eleccion.
 *
 *   1. Sin haber probado el NO, pulsar DIAMANTES no debe dejar pasar.
 *   2. El primer NO suelta la escenita y la cebolla.
 *   3. A partir de ahi el NO se aparta al intentar pulsarlo.
 *   4. Y entonces SI se puede decir que si.
 */
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1280, height: 760 },
  args: ["--window-size=1280,800", "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__game?.isRunning), { timeout: 20000 });
await page.keyboard.press("Space");
await sleep(400);

await page.evaluate(() => {
  window.__state.set({ selectedHero: "red", triedNo: false });
  const g = window.__game;
  for (const s of g.scene.getScenes(true)) s.scene.stop();
  g.scene.start("ChoiceScene");
});
await page.waitForFunction(
  () => window.__game.scene.getScene("ChoiceScene").sys.settings.status === 5,
  { timeout: 20000 },
);
await sleep(1600);

/** Centro de una zona, en pixeles de pantalla. */
const spotAt = (which) =>
  page.evaluate((w) => {
    const sc = window.__game.scene.getScene("ChoiceScene");
    const zones = sc.children.list.filter((o) => o.type === "Zone");
    // El orden de creacion es: diamantes, pelicula, no.
    const z = zones[w];
    if (!z) return null;
    const canvas = window.__game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / window.__game.scale.width;
    const sy = rect.height / window.__game.scale.height;
    return { x: rect.left + z.x * sx, y: rect.top + z.y * sy };
  }, which);

const sceneKey = () =>
  page.evaluate(() =>
    window.__game.scene.getScenes(true).map((s) => s.scene.key).join(","),
  );

// 1. Decir que si antes de tiempo.
let p = await spotAt(0);
await page.mouse.click(p.x, p.y);
await sleep(900);
console.log(`1) tras pulsar DIAMANTES sin probar el NO -> escenas: ${await sceneKey()}`);
await page.screenshot({ path: "qa-shots/choice-scold.png" });

await sleep(2600);

// 2. El primer NO.
p = await spotAt(2);
await page.mouse.click(p.x, p.y);
await sleep(2200);
await page.screenshot({ path: "qa-shots/choice-no.png" });
console.log(`2) triedNo tras pulsar NO -> ${await page.evaluate(() => window.__state.get().triedNo)}`);

// Esperar a que acabe la escenita entera.
await sleep(9000);
await page.screenshot({ path: "qa-shots/choice-onion.png" });

// 3. El NO se aparta.
const before = await spotAt(2);
await page.mouse.click(before.x, before.y);
await sleep(700);
const after = await spotAt(2);
const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
console.log(`3) el NO se movio ${moved.toFixed(0)} px al intentar pulsarlo`);

// 4. Ahora si.
p = await spotAt(0);
await page.mouse.click(p.x, p.y);
await sleep(1400);
console.log(`4) tras pulsar DIAMANTES ya con el NO probado -> escenas: ${await sceneKey()}`);
await page.screenshot({ path: "qa-shots/choice-yes.png" });

await browser.close();
