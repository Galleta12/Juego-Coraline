/**
 * Capturas rapidas de una escena, sin recorrerla.
 *
 * Para mirar como queda algo sin pagar los minutos que tarda una suite
 * de QA completa.
 *
 *   node scripts/shots.mjs <Escena> [segundos] [nombre]
 */
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scene = process.argv[2] ?? "ForestLevelScene";
const waits = (process.argv[3] ?? "3").split(",").map(Number);
const name = process.argv[4] ?? "shot";

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
await sleep(500);
await page.evaluate((k) => {
  window.__state.set({ selectedHero: "red", hasPickaxe: true, hasGun: true, cake: 5, tutorialDone: true });
  const g = window.__game;
  for (const s of g.scene.getScenes(true)) s.scene.stop();
  g.scene.start(k);
}, scene);
await page.waitForFunction((k) => window.__game.scene.getScene(k).sys.settings.status === 5,
  { timeout: 30000 }, scene);

let t = 0;
for (const w of waits) {
  await sleep(Math.max(0, w * 1000 - t));
  t = w * 1000;
  const file = `${name}-${w}s.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
