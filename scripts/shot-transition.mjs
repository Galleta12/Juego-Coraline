import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
page.on("pageerror", e => console.error("pageerror:", e.message));
const cards = [
  ["tree", "SECTOR 01", "EL BOSQUE", 0x7c4a86],
  ["spider", "SECTOR 03", "LA OTRA MADRE", 0x8e1c28],
  ["stag", "ARCHIVO", "MISIÓN PENDIENTE", 0xd63b47],
];
for (const [motif, eyebrow, title, accent] of cards) {
  await page.goto("http://localhost:5173", { waitUntil: "networkidle2" });
  await page.waitForFunction(() => Boolean(window.__game?.isRunning));
  await new Promise(r => setTimeout(r, 400));
  await page.keyboard.press("Space");
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate((m, e, t, a) => {
    window.__game.scene.stop("IntroScene");
    window.__game.scene.start("TransitionScene",
      { motif: m, eyebrow: e, title: t, accent: a, next: "IntroScene" });
  }, motif, eyebrow, title, accent);
  await new Promise(r => setTimeout(r, 1400));
  await page.screenshot({ path: `${OUT}/transition-${motif}.png` });
  console.log("capturada", motif);
}
await browser.close();
