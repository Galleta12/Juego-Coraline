import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1280, height: 760 },
  args: ["--window-size=1280,800","--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__game?.isRunning), { timeout: 20000 });
await page.keyboard.press("Space"); await sleep(400);
await page.evaluate(() => {
  window.__state.set({ selectedHero: "red", hasPickaxe: true, hasGun: true, cake: 5 });
  const g = window.__game;
  for (const s of g.scene.getScenes(true)) s.scene.stop();
  g.scene.start("ForestLevelScene");
});
await page.waitForFunction(() => window.__game.scene.getScene("ForestLevelScene").sys.settings.status === 5, { timeout: 20000 });
await sleep(3000);
// Activar cafe DESPUES de que la escena este viva, con el reloj del juego.
const on = await page.evaluate(() => {
  const sc = window.__game.scene.getScene("ForestLevelScene");
  window.__state.set({ coffeeUntil: Date.now() + 60000 });
  const parts = sc.children.list.filter((o) => o.type === "Image" && o.texture?.key?.startsWith("fx/coffee"));
  return { particulas: parts.length };
});
console.log("particulas de cafe en escena:", on.particulas);
await sleep(2500);
const vis = await page.evaluate(() => {
  const sc = window.__game.scene.getScene("ForestLevelScene");
  const parts = sc.children.list.filter((o) => o.type === "Image" && o.texture?.key?.startsWith("fx/coffee"));
  return { total: parts.length, visibles: parts.filter((p) => p.visible && p.alpha > 0.1).length };
});
console.log("tras activar el cafe -> total:", vis.total, "visibles:", vis.visibles);
await page.screenshot({ path: "qa-shots/cafe-aura.png" });
await browser.close();
