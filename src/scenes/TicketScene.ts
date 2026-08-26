import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { GUIDE_NAME, TICKET } from "@/config/strings";
import { CELEBRATION, DOG, ITEM, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { getState } from "@/systems/GameState";
import { SceneGrade } from "@/ui/Grade";
import { body, label, shadow, title } from "@/ui/text";

/**
 * El resguardo.
 *
 * Ultima pantalla. Un billete con aire de tramite oficial para algo
 * que no lo tiene de ninguna manera: ese contraste es el remate del
 * juego entero.
 *
 * No hay boton de continuar. Aqui se acaba, y se queda en pantalla.
 */

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
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
];

/**
 * Sin el ano.
 *
 * El billete es estrecho y "sabado 29 de agosto de 2026" se salia del
 * papel por los dos lados. El ano no aporta nada aqui: la cita es de
 * esta semana.
 */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export class TicketScene extends Phaser.Scene {
  constructor() {
    super(S.Ticket);
  }

  preload(): void {
    queue(this, [
      ...Object.values(CELEBRATION),
      ...Object.values(DOG),
      ITEM.key,
      ITEM.cake,
      "screens/ticket-blank",
    ]);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(900, 20, 14, 8);
    new SceneGrade(this, "victory");
    void audio.playMusic("finale");

    void this.run();
  }

  private async run(): Promise<void> {
    const st = getState();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // El billete entra girado y se endereza: se lee como un papel que
    // alguien acaba de dejar sobre la mesa.
    const card = this.add.container(cx, cy).setAlpha(0).setAngle(-6).setScale(0.86);

    // El papel es la lamina dibujada — el resguardo con los botones y la
    // sombrilla de Umbrella — no un rectangulo pintado por codigo. Se
    // ajusta al alto de la pantalla dejando aire arriba y abajo.
    const paper = this.add.image(0, 0, "screens/ticket-blank");
    const k = (GAME_HEIGHT * 0.88) / paper.height;
    paper.setScale(k);
    card.add(paper);

    // Medidas del papel ya escalado: todo lo que va encima se coloca
    // relativo a esto y no a numeros sueltos.
    const w = paper.displayWidth;
    const h = paper.displayHeight;

    // Todo el texto vive dentro del hueco claro del papel, que ocupa
    // mas o menos el 74% del ancho y del 22% al 80% del alto. Fuera de
    // ahi se monta sobre el marco decorado y no se lee.
    const inner = w * 0.74;

    const heading = shadow(
      this.add.text(0, -h * 0.29, TICKET.confirmed, title(23, 0x7a4a12)).setOrigin(0.5),
    );
    heading.setLetterSpacing(1);
    card.add(heading);

    const file = this.add
      .text(
        0,
        -h * 0.245,
        TICKET.file(st.sessionId.slice(0, 8).toUpperCase()),
        label(12, 0x4a3524),
      )
      .setOrigin(0.5);
    card.add(file);

    // Lo que eligio: el plan, el dia y la hora. La comida se quito del
    // juego, asi que tampoco sale aqui.
    //
    // Los textos van en tinta casi negra y a mayor tamano que antes: el
    // papel de la lamina es claro y con el marron suave de antes no se
    // leia nada.
    const lines: string[] = [
      TICKET.plan(st.selectedActivity ?? "diamantes"),
      TICKET.date(prettyDate(st.selectedDate ?? "")),
      TICKET.time(st.selectedTime ?? ""),
    ];
    lines.forEach((text, i) => {
      const t = this.add
        .text(0, -h * 0.14 + i * 34, text, body(19, 0x140c06))
        .setOrigin(0.5)
        .setWordWrapWidth(inner, true)
        .setAlign("center");
      card.add(t);
    });

    const who = st.playerName?.trim();
    if (who) {
      const forWho = this.add
        .text(0, -h * 0.14 + lines.length * 34 + 18, TICKET.forWho(who), label(14, 0x4a3524))
        .setOrigin(0.5);
      card.add(forWho);
    }

    const note = this.add
      .text(0, h * 0.205, TICKET.reserved, label(13, 0x4a3524))
      .setOrigin(0.5)
      .setWordWrapWidth(inner, true)
      .setAlign("center");
    const contact = this.add
      .text(0, h * 0.265, TICKET.contact, label(13, 0x4a3524))
      .setOrigin(0.5)
      .setWordWrapWidth(inner, true)
      .setAlign("center");
    card.add([note, contact]);

    const sign = this.add
      .text(inner / 2, h * 0.315, `— ${GUIDE_NAME}`, label(14, 0x4a3524))
      .setOrigin(1, 0.5);
    card.add(sign);

    this.tweens.add({
      targets: card,
      alpha: 1,
      angle: 0,
      scale: 1,
      duration: 900,
      ease: "Back.easeOut",
    });
    audio.sfx.uiConfirm();

    await this.wait(1200);

    // Sello. Cae de golpe y se queda torcido, como los de verdad.
    //
    // Va anclado al papel y en la franja baja del hueco claro: con
    // coordenadas de pantalla sueltas caia fuera del billete, sobre el
    // fondo, y tachaba las lineas de aviso.
    const stamp = this.add
      .container(cx - w * 0.04, cy + h * 0.345)
      .setAlpha(0)
      .setScale(2.2)
      .setAngle(-9);
    const ring = this.add
      .rectangle(0, 0, Math.min(230, w * 0.66), 40, 0x000000, 0)
      .setStrokeStyle(3, 0xc0506a, 0.8);
    const stampText = this.add
      .text(0, 0, TICKET.stamp, label(10, 0xe0808a))
      .setOrigin(0.5);
    stampText.setLetterSpacing(2);
    stamp.add([ring, stampText]);

    this.tweens.add({
      targets: stamp,
      alpha: 0.8,
      scale: 1,
      duration: 260,
      ease: "Quad.easeIn",
      onComplete: () => {
        audio.sfx.blockBreak();
        this.cameras.main.shake(160, 0.004);
      },
    });

    await this.wait(1100);

    const thanks = shadow(
      this.add
        .text(cx, GAME_HEIGHT - 52, TICKET.thanks, label(13, INK.boneDim))
        .setOrigin(0.5)
        .setWordWrapWidth(760, true)
        .setAlign("center")
        .setAlpha(0),
    );
    this.tweens.add({ targets: thanks, alpha: 1, duration: 800 });

    this.celebrate();
  }

  /** Petalos y flores cayendo, sin fin. Es la ultima pantalla. */
  private celebrate(): void {
    const arts = [
      CELEBRATION.petals,
      CELEBRATION.tulipPink,
      CELEBRATION.tulipYellow,
      CELEBRATION.icecream,
    ];
    this.time.addEvent({
      delay: 170,
      loop: true,
      callback: () => {
        const x = Math.random() * GAME_WIDTH;
        const art = arts[Math.floor(Math.random() * arts.length)]!;
        const p = this.add
          .image(x, -40, art)
          .setScale(0.16 + Math.random() * 0.2)
          .setAlpha(0.5 + Math.random() * 0.45)
          .setDepth(-1);
        this.tweens.add({
          targets: p,
          y: GAME_HEIGHT + 50,
          x: x + (Math.random() - 0.5) * 200,
          angle: (Math.random() - 0.5) * 600,
          duration: 5200 + Math.random() * 3200,
          onComplete: () => p.destroy(),
        });
      },
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
