/**
 * Comprueba que el calendario responde al PRIMER clic.
 *
 * El fallo que persigue: al entrar en la pantalla los primeros clics no
 * hacian nada y habia que insistir. Aqui se entra, se pulsa un dia una
 * sola vez y se mira si quedo seleccionado.
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

// Entrar en el calendario tal y como se llega jugando: con el HUD
// levantado, que es justo lo que tapaba los clics.
await page.evaluate(() => {
  window.__state.set({ selectedHero: "red", bossDefeated: true, acceptedMission: true });
  const g = window.__game;
  for (const s of g.scene.getScenes(true)) s.scene.stop();
  g.scene.start("HudScene");
  g.scene.start("ScheduleScene");
});
await page.waitForFunction(
  () => window.__game.scene.getScene("ScheduleScene").sys.settings.status === 5,
  { timeout: 20000 },
);
await sleep(1500);

// Primer dia disponible del calendario, en pixeles de pantalla.
const spot = await page.evaluate(() => {
  const sc = window.__game.scene.getScene("ScheduleScene");
  const cells = sc.children.list.filter(
    (o) => o.type === "Container" && o.getData && o.getData("date"),
  );
  if (cells.length === 0) return null;
  const c = cells[0];
  const cam = sc.cameras.main;
  const canvas = window.__game.canvas;
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / window.__game.scale.width;
  const sy = rect.height / window.__game.scale.height;
  return {
    date: c.getData("date"),
    total: cells.length,
    x: rect.left + (c.x - cam.scrollX) * sx,
    y: rect.top + (c.y - cam.scrollY) * sy,
  };
});

if (!spot) {
  console.log("FALLO: el calendario no tiene ni un dia disponible");
  await browser.close();
  process.exit(1);
}
console.log(`dias disponibles: ${spot.total}, primero ${spot.date}`);

// UN solo clic.
await page.mouse.click(spot.x, spot.y);
await sleep(700);

const picked = await page.evaluate(() => {
  const sc = window.__game.scene.getScene("ScheduleScene");
  // Si la fecha entro, la escena guarda la seleccion y aparecen horas.
  const texts = sc.children.list.filter((o) => o.type === "Text").map((t) => t.text);
  return { date: sc.date ?? "", horas: texts.filter((t) => /^\d{2}:\d{2}$/.test(t)).length };
});

console.log(`tras UN clic -> fecha="${picked.date}", horas visibles=${picked.horas}`);
console.log(picked.date ? "OK: responde al primer clic" : "FALLO: el primer clic no hace nada");

await page.screenshot({ path: "qa-shots/calendar.png" });
await browser.close();
