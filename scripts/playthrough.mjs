/**
 * QA funcional: recorre los mecanismos del juego uno a uno y comprueba
 * que hacen lo que dicen. Complementa a qa.mjs, que solo mira el arte.
 *
 *   node scripts/playthrough.mjs
 */
import puppeteer from "puppeteer-core";

const URL = process.env.QA_URL ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FALLO"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404")) pageErrors.push(m.text());
});

/** Recarga y deja el juego en la escena pedida con el estado dado. */
async function enter(scene, patch) {
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForSelector("#game canvas");
  await page.waitForFunction(() => Boolean(window.__game?.isRunning));
  await sleep(350);
  await page.keyboard.press("Space");
  await sleep(450);
  if (patch) await page.evaluate((p) => window.__state.set(p), patch);
  if (scene !== "IntroScene") {
    await page.evaluate((k) => {
      window.__game.scene.stop("IntroScene");
      window.__game.scene.start(k);
    }, scene);
    await sleep(1400);
  }
}

const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__state.get())));
const scn = (key) => page.evaluate((k) => k, key);

/* ── 1. Controles y salto ────────────────────────────────────────── */
await enter("ForestScene", { hasPickaxe: false, tookPill: false, checkpoint: null });

let p0 = await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  return { x: s.player.x, y: s.player.y };
});
await page.keyboard.down("KeyD");
await sleep(900);
let p1 = await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  return { x: s.player.x, y: s.player.y };
});
check("caminar a la derecha", p1.x - p0.x > 80, `${(p1.x - p0.x).toFixed(0)}px`);

await page.keyboard.up("KeyD");
await sleep(700);

/**
 * Salta y devuelve cuanto subio, en pixeles. El muestreo corre dentro de
 * la pagina: desde fuera, cada lectura es un viaje de ida y vuelta y la
 * cima del salto se pierde entre medias.
 */
async function jumpHeight(holdMs) {
  await page.evaluate(() => {
    const s = window.__game.scene.getScene("ForestScene");
    window.__base = s.player.y;
    window.__peak = s.player.y;
    window.__sampler = setInterval(() => {
      window.__peak = Math.min(window.__peak, s.player.y);
    }, 8);
  });

  await page.keyboard.down("Space");
  await sleep(holdMs);
  await page.keyboard.up("Space");
  await sleep(1100);

  return page.evaluate(() => {
    clearInterval(window.__sampler);
    return window.__base - window.__peak;
  });
}

const tap = await jumpHeight(40);
check("un toque corto salta", tap > 10, `${tap.toFixed(0)}px`);

const hold = await jumpHeight(600);
check("mantener salta mas alto", hold > tap + 12, `toque ${tap.toFixed(0)}px vs mantenido ${hold.toFixed(0)}px`);

/* ── 2. Recoger el pico ──────────────────────────────────────────── */
await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  const m = s.level.items.find((i) => i.kind === "pickaxe");
  s.player.setPosition(m.x, m.y + 8);
});
await sleep(700);
check("recoger el pico", (await state()).hasPickaxe);

/* ── 3. Romper un bloque con el pico ─────────────────────────────── */
const blocksBefore = await page.evaluate(
  () => window.__game.scene.getScene("ForestScene").level.blocks.getLength(),
);
await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  const b = s.level.blocks.getChildren()[0];
  s.player.setPosition(b.x - 16, b.y + 8);
});
await sleep(400);
for (let i = 0; i < 4; i++) {
  await page.keyboard.press("KeyE");
  await sleep(400);
}
const blocksAfter = await page.evaluate(
  () => window.__game.scene.getScene("ForestScene").level.blocks.getLength(),
);
check("el pico rompe bloques", blocksAfter < blocksBefore, `${blocksBefore} -> ${blocksAfter}`);

/* ── 4. La torta cura ────────────────────────────────────────────── */
await page.evaluate(() => window.__state.set({ cakeHealth: 1 }));
await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  const m = s.level.items.find((i) => i.kind === "cake");
  s.player.setPosition(m.x, m.y + 8);
});
await sleep(700);
check("la torta cura", (await state()).cakeHealth === 2, `vida=${(await state()).cakeHealth}`);

/* ── 5. La pastilla altera la realidad ───────────────────────────── */
await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  const m = s.level.items.find((i) => i.kind === "pill");
  s.player.setPosition(m.x, m.y + 8);
});
await sleep(2600);
const afterPill = await state();
const repainted = await page.evaluate(() => {
  const s = window.__game.scene.getScene("ForestScene");
  return s.level.solids.getChildren()[0].texture.key;
});
check("la pastilla cambia el estado", afterPill.tookPill && afterPill.reality === "altered");
check("la pastilla repinta el mundo", repainted.includes("altered"), repainted);

/* ── 6. Cafe: velocidad temporal ─────────────────────────────────── */
await enter("TunnelScene", { hasPickaxe: true, tookPill: true, reality: "altered", checkpoint: null });
await page.evaluate(() => {
  const s = window.__game.scene.getScene("TunnelScene");
  const m = s.level.items.find((i) => i.kind === "coffee");
  s.player.setPosition(m.x, m.y + 8);
});
await sleep(700);
const coffee = await page.evaluate(() => {
  const s = window.__game.scene.getScene("TunnelScene");
  return { active: s.player.coffeeActive, ms: s.player.coffeeRemainingMs };
});
check("el cafe se activa", coffee.active && coffee.ms > 6000, `${(coffee.ms / 1000).toFixed(1)}s`);

/* ── 7. Maquina de escribir: guarda ──────────────────────────────── */
await page.evaluate(() => {
  const s = window.__game.scene.getScene("TunnelScene");
  const m = s.level.items.find((i) => i.kind === "typewriter");
  s.player.setPosition(m.x - 14, m.y + 8);
});
await sleep(400);
for (let i = 0; i < 3; i++) {
  await page.keyboard.press("KeyE");
  await sleep(400);
}
const cp = (await state()).checkpoint;
check("la maquina de escribir guarda", cp !== null && cp.scene === "TunnelScene");

/* ── 8. Boss: tres golpes y muere ────────────────────────────────── */
await enter("BossScene", { hasPickaxe: true, cakeHealth: 4, bossDefeated: false, leonSupportUsed: false });
await sleep(2600);

let hits = 0;
for (let attempt = 0; attempt < 120 && hits < 3; attempt++) {
  const phase = await page.evaluate(() => window.__game.scene.getScene("BossScene").phase);
  if (phase === "vulnerable") {
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("BossScene");
      s.player.setPosition(s.boss.x - 18, 232);
    });
    await sleep(120);
    await page.keyboard.press("KeyE");
    await sleep(420);
    hits = await page.evaluate(() => window.__game.scene.getScene("BossScene").hits);
  } else if (phase === "dead") {
    break;
  } else {
    // Apartarse del golpe telegrafiado.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("BossScene");
      s.player.setPosition(70, 232);
    });
    await sleep(300);
  }
}
check("el boss cae en 3 golpes", (await state()).bossDefeated, `golpes=${hits}`);

/* ── 9. Diamante ─────────────────────────────────────────────────── */
await sleep(1800);
await page.evaluate(() => {
  const s = window.__game.scene.getScene("BossScene");
  s.player.setPosition(332, 232);
});
await sleep(1200);
check("se recoge el diamante", (await state()).diamondCollected);

/* ── 10. Creeper del NO ──────────────────────────────────────────── */
await enter("InvitationScene", {
  bossDefeated: true,
  diamondCollected: true,
  creeperTriggered: false,
  acceptedMission: false,
});
await sleep(1200);
await page.keyboard.down("KeyA");
await sleep(2600);
await page.keyboard.up("KeyA");
await sleep(600);
check("el creeper explota al acercarse al NO", (await state()).creeperTriggered);

await sleep(4800); // reaparicion tras la explosion
const afterBoom = await page.evaluate(() => {
  const s = window.__game.scene.getScene("InvitationScene");
  return { x: s.player.x, noSign: s.noSign === null };
});
check("el NO desaparece y reaparece la jugadora", afterBoom.noSign && afterBoom.x > 180, `x=${afterBoom.x.toFixed(0)}`);

/* ── 11. El SI acepta ────────────────────────────────────────────── */
await page.keyboard.down("KeyD");
await sleep(3200);
await page.keyboard.up("KeyD");
await sleep(600);
check("caminar al SI acepta la mision", (await state()).acceptedMission);

/* ── 12. Agenda y envio ──────────────────────────────────────────── */
await enter("ScheduleScene", { acceptedMission: true });
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await sleep(200);
await page.keyboard.press("Space"); // fecha -> hora
await sleep(200);
await page.keyboard.press("ArrowRight");
await sleep(200);
await page.keyboard.press("ArrowUp"); // volver a fecha
await sleep(250);
const backOk = await page.evaluate(() => window.__game.scene.getScene("ScheduleScene").step);
check("se puede volver atras antes de confirmar", backOk === "time" || backOk === "date", backOk);

await page.keyboard.press("Space");
await sleep(200);
await page.keyboard.press("Space");
await sleep(200);
await page.keyboard.press("Space"); // confirmar
await sleep(3000);

const finalState = await state();
const activeScene = await page.evaluate(() =>
  window.__game.scene.getScenes(true).map((s) => s.scene.key).join(","),
);
check(
  "se guardan fecha y hora",
  Boolean(finalState.selectedDate && finalState.selectedTime),
  `${finalState.selectedDate} ${finalState.selectedTime}`,
);
check("llega a la pantalla final", activeScene.includes("ConfirmationScene"), activeScene);

/* ── Resumen ─────────────────────────────────────────────────────── */
console.log("\n--- ERRORES DE PAGINA ---");
console.log(pageErrors.length ? [...new Set(pageErrors)].join("\n") : "ninguno");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasadas`);

await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
