/** Captura una URL a PNG. Herramienta de desarrollo. */
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: Number(process.argv[4] ?? 1500), height: Number(process.argv[5] ?? 1200) },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
await page.goto(process.argv[2], { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: process.argv[3], fullPage: true });
await browser.close();
console.log("ok:", process.argv[3]);
