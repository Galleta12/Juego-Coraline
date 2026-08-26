import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { SCHEDULE } from "@/config/strings";
import { CELEBRATION, DOG, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { confirmBooking } from "@/systems/Api";
import { setState } from "@/systems/GameState";
import { SceneGrade } from "@/ui/Grade";
import { banner, button, panel } from "@/ui/Stitched";
import { motes } from "@/ui/Atmosphere";
import { WINDOW, slotIsAllowed } from "@shared/contracts";
import { body, label, shadow, title } from "@/ui/text";

/**
 * Agenda de la expedicion.
 *
 * Un tablero de trapo con botones: el mes a la izquierda, las horas a
 * la derecha, Snoopy con su cafe abajo y tulipanes morados a los lados.
 * Todo cosido, como el mundo de la Otra Madre.
 *
 * Lo que se puede elegir sale del contrato compartido, no de aqui: si un
 * dia o una hora no aparece es porque el servidor tampoco los
 * aceptaria.
 */

const DAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** Colores del tablero. */
const C = {
  cloth: 0x1b1a3a,
  paper: 0xe8e0cc,
  paperInk: 0x2a2038,
  bannerFill: 0x5a2848,
  slotFill: 0x574080,
  hourPanel: 0x2e2750,
  hourChip: 0xe4dcc6,
} as const;

/** Franjas validas de un dia, segun el contrato. */
function slotsFor(date: string): string[] {
  const out: string[] = [];
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m < 60; m += WINDOW.slotMinutes) {
      const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      if (slotIsAllowed(date, t)) out.push(t);
    }
  }
  return out;
}

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export class ScheduleScene extends Phaser.Scene {
  private date = "";
  private slot = "";
  private busy = false;

  private hourLayer!: Phaser.GameObjects.Container;
  private dayCells: Phaser.GameObjects.Container[] = [];

  constructor() {
    super(S.Schedule);
  }

  preload(): void {
    queue(this, [...Object.values(DOG), ...Object.values(CELEBRATION)]);
  }

  create(): void {
    this.date = "";
    this.slot = "";
    this.busy = false;
    this.dayCells = [];

    this.cameras.main.fadeIn(800, 8, 6, 14);
    new SceneGrade(this, "trueMission");
    setState({ checkpoint: S.Schedule });

    // El HUD del juego se queda corriendo por encima de esta escena y
    // se come los primeros clics del calendario. Aqui ya no hay vidas
    // ni objetivo que ensenar, asi que se apaga.
    if (this.scene.isActive(S.Hud)) this.scene.stop(S.Hud);

    // Al llegar desde un fundido con el boton pulsado, Phaser se queda
    // con el puntero hundido y el primer clic de verdad no cuenta.
    this.input.enabled = true;
    this.input.setTopOnly(false);

    this.background();
    this.calendar();
    this.hourPanel();
    this.decor();
  }

  /* ── Fondo ───────────────────────────────────────────────────────── */

  private background(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, C.cloth).setOrigin(0).setDepth(-10);

    // Acolchado: rombos tenues, como una manta cosida.
    const g = this.add.graphics().setDepth(-9);
    g.lineStyle(1, 0x2e2b58, 0.5);
    for (let x = -GAME_HEIGHT; x < GAME_WIDTH + GAME_HEIGHT; x += 54) {
      g.lineBetween(x, 0, x + GAME_HEIGHT, GAME_HEIGHT);
      g.lineBetween(x, GAME_HEIGHT, x + GAME_HEIGHT, 0);
    }

    // Ventana con la luna, arriba a la izquierda.
    const wx = 56;
    const wy = 74;
    const win = this.add.graphics().setDepth(-8);
    win.fillStyle(0x0e1030, 1);
    win.fillRoundedRect(wx - 32, wy - 32, 64, 64, 10);
    win.lineStyle(3, 0x3a3468, 1);
    win.strokeRoundedRect(wx - 32, wy - 32, 64, 64, 10);
    win.lineBetween(wx, wy - 32, wx, wy + 32);
    win.lineBetween(wx - 32, wy, wx + 32, wy);
    win.fillStyle(0xdfe4ff, 0.85);
    win.fillCircle(wx + 9, wy - 11, 9);
    win.fillStyle(0x0e1030, 1);
    win.fillCircle(wx + 14, wy - 15, 8);
    for (let i = 0; i < 8; i++) {
      win.fillStyle(0xdfe4ff, 0.3 + Math.random() * 0.4);
      win.fillCircle(wx - 24 + Math.random() * 48, wy - 24 + Math.random() * 48, 1.1);
    }

    motes(this, { color: 0xd8c8ff, count: 16, driftY: -10, scrollFactor: 0 });
  }

  /* ── Calendario ──────────────────────────────────────────────────── */

  private calendar(): void {
    const px = 200;
    const py = 78;
    const pw = 470;
    const ph = 398;

    panel(this, px, py, pw, ph, { fill: C.paper });
    banner(this, px + pw / 2, py - 32, 300, 50, C.bannerFill);

    shadow(
      this.add.text(px + pw / 2, py - 7, SCHEDULE.title, title(25, 0xf3ead4)).setOrigin(0.5),
    ).setDepth(3);

    const corners: [number, number][] = [
      [px + 16, py + 16],
      [px + pw - 16, py + 16],
      [px + 16, py + ph - 16],
      [px + pw - 16, py + ph - 16],
    ];
    for (const [bx, by] of corners) button(this, bx, by, 8);

    // La ventana empieza a finales de mes y se mete en el siguiente, asi
    // que la rejilla NO se corta con el cambio de mes: se siguen
    // dibujando dias hasta cubrir el ultimo de la ventana.
    //
    // Antes solo se pintaba el mes del primer dia y todo septiembre se
    // perdia: quedaban cuatro dias para elegir y, si no le venia bien
    // ninguno, no habia nada que hacer.
    const first = new Date(`${WINDOW.firstDate}T12:00:00`);
    const last = new Date(`${WINDOW.lastDate}T12:00:00`);
    const year = first.getFullYear();
    const month = first.getMonth();

    const monthName = MONTHS[month] ?? "";
    const cap = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    const endName = MONTHS[last.getMonth()] ?? "";
    const heading =
      last.getMonth() === month
        ? `${cap(monthName)} ${year}`
        : `${cap(monthName)} — ${cap(endName)} ${last.getFullYear()}`;

    this.add
      .text(px + pw / 2, py + 40, heading, body(22, C.paperInk))
      .setOrigin(0.5);

    // Cabecera de la semana, sobre su tira oscura.
    const gx = px + 24;
    const gy = py + 74;
    const cw = (pw - 48) / 7;
    const chH = 25;

    const strip = this.add.graphics();
    strip.fillStyle(0x4a4068, 1);
    strip.fillRoundedRect(gx, gy, cw * 7, chH, 4);
    DAY_HEADERS.forEach((d, i) => {
      this.add.text(gx + cw * (i + 0.5), gy + chH / 2, d, label(12, 0xe8e0cc)).setOrigin(0.5);
    });

    // Rejilla, empezando en lunes. Se cuentan los dias desde el uno del
    // mes de inicio hasta el ultimo de la ventana, aunque eso cruce al
    // mes siguiente.
    // getDay: 0 = domingo. Se convierte a lunes = 0.
    const startCol = (new Date(year, month, 1).getDay() + 6) % 7;
    // Siete filas para cubrir agosto y septiembre. A 44 de alto la
    // ultima se salia por debajo del tablero.
    const rowH = 36;

    const start = new Date(year, month, 1);
    const total =
      Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1;

    for (let i = 0; i < total; i++) {
      const day = new Date(year, month, 1 + i);
      const idx = startCol + i;
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const cx = gx + cw * (col + 0.5);
      const cy = gy + chH + 10 + row * rowH + rowH / 2;

      const d = day.getDate();
      const dateStr = iso(day.getFullYear(), day.getMonth(), d);

      if (slotsFor(dateStr).length === 0) {
        this.add.text(cx, cy, String(d), body(18, 0x8f8674)).setOrigin(0.5).setAlpha(0.5);
        continue;
      }
      this.dayCells.push(this.dayCell(cx, cy, cw - 8, rowH - 8, d, dateStr));
    }
  }

  /** Un dia disponible: parche de tela morada que se puede pulsar. */
  private dayCell(
    cx: number,
    cy: number,
    w: number,
    h: number,
    day: number,
    dateStr: string,
  ): Phaser.GameObjects.Container {
    const g = panel(this, -w / 2, -h / 2, w, h, {
      fill: C.slotFill,
      stitchAlpha: 0.7,
      radius: 6,
    });
    const t = this.add.text(0, 0, String(day), body(18, 0xf3ead4)).setOrigin(0.5);

    const c = this.add.container(cx, cy, [g, t]).setSize(w, h).setDepth(4);
    c.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    c.setData("date", dateStr);

    c.on("pointerover", () => {
      if (this.busy) return;
      audio.sfx.uiHover();
      this.tweens.add({ targets: c, scale: 1.1, duration: 130 });
    });
    c.on("pointerout", () => this.tweens.add({ targets: c, scale: 1, duration: 130 }));
    c.on("pointerdown", () => {
      if (this.busy) return;
      this.pickDate(dateStr);
    });

    return c;
  }

  /* ── Horas ───────────────────────────────────────────────────────── */

  private hourPanel(): void {
    const px = 702;
    const py = 78;
    const pw = 214;
    const ph = 398;

    panel(this, px, py, pw, ph, { fill: C.hourPanel, stitchAlpha: 0.45 });
    button(this, px + pw - 18, py + 18, 9);
    button(this, px + 18, py + ph - 18, 9);

    panel(this, px + 18, py + 18, pw - 36, 32, {
      fill: 0x5f5090,
      stitchAlpha: 0.5,
      radius: 5,
    });
    this.add
      .text(px + pw / 2, py + 34, SCHEDULE.timeTitle, label(13, 0xefe7d3))
      .setOrigin(0.5);

    this.hourLayer = this.add.container(0, 0).setDepth(4);
    this.showHourPlaceholder();
  }

  private showHourPlaceholder(): void {
    this.hourLayer.removeAll(true);
    this.hourLayer.add(
      this.add
        .text(809, 268, SCHEDULE.pickDayFirst, label(13, 0x9a92b8))
        .setOrigin(0.5)
        .setWordWrapWidth(166, true)
        .setAlign("center"),
    );
  }

  private pickDate(dateStr: string): void {
    this.date = dateStr;
    audio.sfx.uiSelect();

    // El dia elegido se queda marcado y el resto se apaga.
    for (const c of this.dayCells) {
      const isPick = c.getData("date") === dateStr;
      this.tweens.add({ targets: c, alpha: isPick ? 1 : 0.42, duration: 200 });
      if (isPick) this.tweens.add({ targets: c, scale: 1.14, duration: 200, yoyo: true });
    }

    this.showHours(slotsFor(dateStr));
  }

  private showHours(slots: string[]): void {
    this.hourLayer.removeAll(true);

    const px = 702;
    const pw = 214;
    // La lista empieza por debajo de la cabecera del panel.
    //
    // Antes arrancaba en 132 y la cabecera "Horas disponibles" acaba en
    // 126: la primera franja quedaba pegada y se leian encima.
    const top = 158;
    const chipH = 31;
    const gap = 6;
    const viewH = 300;

    const strip = this.add.container(0, 0);

    slots.forEach((t, i) => {
      const y = top + i * (chipH + gap);
      const w = pw - 52;

      const g = panel(this, -w / 2, -chipH / 2, w, chipH, {
        fill: C.hourChip,
        stitch: 0x6a5a3a,
        stitchAlpha: 0.5,
        radius: 5,
      });
      const dot = button(this, -w / 2 + 16, 0, 6, 0x3a2f24);
      const txt = this.add.text(6, 0, t, body(17, 0x2a2038)).setOrigin(0.5);

      const c = this.add.container(px + pw / 2, y, [g, dot, txt]).setSize(w, chipH);
      c.setInteractive(
        new Phaser.Geom.Rectangle(-w / 2, -chipH / 2, w, chipH),
        Phaser.Geom.Rectangle.Contains,
      );
      c.on("pointerover", () => {
        if (this.busy) return;
        audio.sfx.uiHover();
        this.tweens.add({ targets: c, scale: 1.05, duration: 120 });
      });
      c.on("pointerout", () => this.tweens.add({ targets: c, scale: 1, duration: 120 }));
      c.on("pointerdown", () => {
        if (this.busy) return;
        void this.confirm(t);
      });

      strip.add(c);
    });

    this.hourLayer.add(strip);

    // La lista se recorta al panel y se mueve con la rueda.
    const mask = this.make
      .graphics({}, false)
      .fillRect(px + 10, top - 24, pw - 20, viewH)
      .createGeometryMask();
    strip.setMask(mask);

    const maxY = Math.max(0, slots.length * (chipH + gap) - viewH + 20);
    if (maxY === 0) return;

    // Barra de desplazamiento a la derecha del panel.
    //
    // Sin ella no habia forma de saber que quedaban horas mas abajo: la
    // lista simplemente se cortaba y parecia que eso era todo.
    const railX = px + pw - 14;
    const railTop = top - 18;
    const railH = viewH - 24;
    const rail = this.add.graphics().setDepth(6);
    rail.fillStyle(0x1a1530, 0.9);
    rail.fillRoundedRect(railX - 4, railTop, 8, railH, 4);

    const thumbH = Math.max(34, railH * (viewH / (slots.length * (chipH + gap))));
    const thumb = this.add
      .rectangle(railX, railTop + thumbH / 2, 8, thumbH, 0xb49ae0, 0.95)
      .setDepth(7);

    const place = (): void => {
      const t = maxY === 0 ? 0 : -strip.y / maxY;
      thumb.setY(railTop + thumbH / 2 + t * (railH - thumbH));
    };

    // Flecha que late al pie de la lista: la señal mas obvia de que hay
    // mas cosas debajo.
    const arrow = this.add.graphics().setDepth(7);
    arrow.fillStyle(0xb49ae0, 1);
    arrow.fillTriangle(-9, -5, 9, -5, 0, 7);
    arrow.setPosition(px + pw / 2, railTop + railH + 16);
    this.tweens.add({
      targets: arrow,
      y: arrow.y + 6,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    const hint = this.add
      .text(px + pw / 2, railTop + railH + 34, SCHEDULE.scroll, label(11, 0xb49ae0))
      .setOrigin(0.5);

    this.hourLayer.add([rail, thumb, arrow, hint]);

    const scrollBy = (dy: number): void => {
      if (!strip.active) return;
      strip.y = Phaser.Math.Clamp(strip.y - dy, -maxY, 0);
      place();
      // Al llegar al fondo la flecha ya no hace falta.
      const atEnd = strip.y <= -maxY + 2;
      arrow.setAlpha(atEnd ? 0 : 1);
      hint.setAlpha(atEnd ? 0 : 1);
    };

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => scrollBy(dy * 0.5),
    );
    // Tambien se puede arrastrar la barra o pulsar la flecha.
    arrow.setInteractive(
      new Phaser.Geom.Rectangle(-16, -12, 32, 26),
      Phaser.Geom.Rectangle.Contains,
    );
    arrow.on("pointerdown", () => scrollBy(-140));

    place();
  }

  /* ── Confirmacion ────────────────────────────────────────────────── */

  private async confirm(time: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.slot = time;

    audio.sfx.uiConfirm();
    setState({ selectedDate: this.date, selectedTime: this.slot });

    const veil = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0918, 0)
      .setOrigin(0)
      .setDepth(500);
    this.tweens.add({ targets: veil, fillAlpha: 0.82, duration: 400 });

    const sending = shadow(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, SCHEDULE.sending, title(28, INK.gold))
        .setOrigin(0.5)
        .setDepth(501)
        .setAlpha(0),
    );
    this.tweens.add({ targets: sending, alpha: 1, duration: 300 });
    this.tweens.add({
      targets: sending,
      scale: 1.05,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Si la red falla, el cliente devuelve un resultado neutro: la
    // reserva se da por buena igual. Un problema de infraestructura no
    // puede costarle el final a quien esta jugando.
    await confirmBooking(this.date, this.slot);
    await this.wait(1000);

    this.cameras.main.fadeOut(700, 8, 6, 14);
    this.time.delayedCall(800, () => this.scene.start(S.Ticket));
  }

  /* ── Adorno ──────────────────────────────────────────────────────── */

  private decor(): void {
    // Snoopy con su cafe, abajo a la izquierda.
    this.add
      .image(104, GAME_HEIGHT - 4, DOG.offer)
      .setOrigin(0.5, 1)
      .setScale(0.66)
      .setDepth(6);

    // Tulipanes a los dos lados.
    this.add
      .image(38, GAME_HEIGHT - 172, CELEBRATION.bouquet)
      .setOrigin(0.5, 1)
      .setScale(0.58)
      .setAngle(-6)
      .setDepth(2);
    this.add
      .image(GAME_WIDTH - 36, GAME_HEIGHT - 6, CELEBRATION.bouquet)
      .setOrigin(0.5, 1)
      .setScale(0.66)
      .setAngle(7)
      .setDepth(6);
    this.add
      .image(GAME_WIDTH - 90, GAME_HEIGHT - 12, CELEBRATION.tulipPink)
      .setOrigin(0.5, 1)
      .setScale(0.3)
      .setAngle(-10)
      .setDepth(5);

    // Botones sueltos por el tablero.
    for (const [x, y, r] of [
      [168, 40, 11],
      [944, 132, 9],
      [22, 306, 8],
      [674, 512, 10],
      [392, 518, 8],
    ] as const) {
      button(this, x, y, r);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }
}
