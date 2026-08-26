import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { TICKET } from "@/config/strings";
import { CELEBRATION, DOG, ITEM, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { getState } from "@/systems/GameState";
import { SceneGrade } from "@/ui/Grade";
import { body, title } from "@/ui/text";

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
    const k = (GAME_HEIGHT * 0.92) / paper.height;
    paper.setScale(k);
    card.add(paper);

    // Medidas del papel ya escalado: todo lo que va encima se coloca
    // relativo a esto y no a numeros sueltos.
    const w = paper.displayWidth;
    const h = paper.displayHeight;

    // Papeleta lisa detras del texto.
    //
    // El billete dibujado NO tiene un hueco claro utilizable: en el
    // centro hay niebla clara, pero a la izquierda entran el arbol y la
    // casa y a la derecha el edificio de la R.P.D., los dos casi negros.
    // Escribiendo directamente encima, media linea caia sobre la parte
    // oscura y desaparecia — daba igual el color de la tinta, porque el
    // fondo cambia de claro a negro dentro de la misma linea.
    //
    // Con una papeleta lisa por debajo el contraste deja de depender de
    // por donde caiga cada palabra, y ademas se lee como una pegatina
    // pegada al resguardo, que es justo lo que es.
    const noteW = w * 0.82;
    const noteH = h * 0.5;
    const note = this.add.graphics();
    note.fillStyle(0x000000, 0.25);
    note.fillRoundedRect(-noteW / 2 + 3, -noteH / 2 + 4, noteW, noteH, 10);
    note.fillStyle(0xe9e0c8, 0.95);
    note.fillRoundedRect(-noteW / 2, -noteH / 2, noteW, noteH, 10);
    note.lineStyle(2, 0x7a5a34, 0.5);
    note.strokeRoundedRect(-noteW / 2, -noteH / 2, noteW, noteH, 10);
    card.add(note);

    // El ancho util es el de la papeleta menos un margen.
    const inner = noteW - 34;

    // Cuatro cosas y un aviso. Nada mas.
    //
    // El hueco claro del papel es estrecho y antes se le metian nueve
    // textos distintos: salian a doce puntos, apretados unos contra
    // otros, y no se leia ninguno. Con menos lineas cabe el tamaño que
    // hace falta para leerlas de un vistazo, que es de lo que se trata.
    const heading = this.add
      .text(0, -noteH / 2 + 34, TICKET.confirmed, title(34, 0x6a3d0e))
      .setOrigin(0.5);
    heading.setLetterSpacing(6);
    card.add(heading);

    // Tinta casi negra sobre el papel claro: los marrones suaves de
    // antes se perdian contra el fondo del billete.
    const lines: string[] = [
      TICKET.date(prettyDate(st.selectedDate ?? "")),
      TICKET.time(st.selectedTime ?? ""),
      TICKET.plan(st.selectedActivity ?? "diamantes"),
    ];
    const who = st.playerName?.trim();
    if (who) lines.push(TICKET.forWho(who));

    // Repartidas por el centro de la papeleta, no apiladas desde arriba:
    // asi el bloque queda centrado sea cual sea el numero de lineas (el
    // nombre puede faltar).
    const step = 32;
    const top = -((lines.length - 1) * step) / 2;
    lines.forEach((text, i) => {
      const t = this.add
        .text(0, top + i * step, text, body(20, 0x140c06))
        .setOrigin(0.5)
        .setWordWrapWidth(inner, true)
        .setAlign("center");
      card.add(t);
    });

    // El aviso, abajo del todo y separado del bloque de datos.
    const contact = this.add
      .text(0, noteH / 2 - 42, TICKET.contact, body(16, 0x4a3524))
      .setOrigin(0.5)
      .setWordWrapWidth(inner, true)
      .setAlign("center");
    card.add(contact);

    this.tweens.add({
      targets: card,
      alpha: 1,
      angle: 0,
      scale: 1,
      duration: 900,
      ease: "Back.easeOut",
    });
    audio.sfx.uiConfirm();
    // Campanita de remate: es el final del juego, no un cambio de
    // pantalla mas.
    this.time.delayedCall(420, () => audio.sfx.chime());

    // El sello, la firma y el agradecimiento se quitaron enteros.
    // Cruzaban por encima de las lineas de datos — que es justo lo unico
    // que hay que poder leer aqui — y ninguno decia nada que no dijera
    // ya el propio resguardo.

    await this.wait(900);
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
