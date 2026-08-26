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
import { motes } from "@/ui/Atmosphere";
import { closeCalendar, openCalendar } from "@/ui/CalendarDom";
import { cutTo } from "@/ui/Transition";
import { shadow, title } from "@/ui/text";

/**
 * Agenda de la expedicion.
 *
 * Esta escena ya casi no dibuja nada: pone el fondo de tela, los
 * tulipanes y a Snoopy, y encima abre el calendario de VERDAD, que es
 * HTML (`@/ui/CalendarDom`).
 *
 * El calendario estaba dibujado en el lienzo, casilla a casilla, con las
 * areas de clic calculadas a mano. Funcionaba, pero arrastraba una
 * familia entera de problemas propios de reinventar un boton: clics que
 * no entraban mientras la casilla se animaba, celdas que al agrandarse
 * tapaban a la vecina, una lista de horas recortada y desplazada a mano,
 * y cuarenta paneles cosidos repintandose en cada fotograma. Con botones
 * del navegador nada de eso puede pasar, y encima se adapta solo al
 * ancho de la ventana.
 *
 * Lo que se puede elegir sale del contrato compartido, no de aqui: si un
 * dia o una hora no aparece es porque el servidor tampoco los aceptaria.
 */
export class ScheduleScene extends Phaser.Scene {
  private busy = false;

  constructor() {
    super(S.Schedule);
  }

  preload(): void {
    queue(this, [...Object.values(DOG), ...Object.values(CELEBRATION)]);
  }

  create(): void {
    this.busy = false;

    this.cameras.main.fadeIn(800, 8, 6, 14);
    new SceneGrade(this, "trueMission");
    setState({ checkpoint: S.Schedule });

    // El HUD del juego se queda corriendo por encima de esta escena. Aqui
    // ya no hay vidas ni objetivo que enseñar, asi que se apaga.
    if (this.scene.isActive(S.Hud)) this.scene.stop(S.Hud);

    this.background();
    this.decor();

    // La cancion sigue sonando, pero bastante mas bajita: aqui se esta
    // eligiendo una fecha y hay que leer numeros pequeños, no vivir un
    // climax. Vuelve a subir de golpe al confirmar.
    audio.duckMusic(true, 600, 0.45);

    // Si la escena se apaga por lo que sea, el velo del calendario no
    // puede quedarse pegado por encima del juego.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => closeCalendar());

    void this.run();
  }

  private async run(): Promise<void> {
    const { date, time } = await openCalendar();
    if (this.busy) return;
    this.busy = true;

    // Recompensa: la cancion vuelve a su volumen despues de todo el rato
    // bajita mientras elegia.
    audio.duckMusic(false, 400);
    setState({ selectedDate: date, selectedTime: time });

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
    await confirmBooking(date, time);
    await this.wait(900);

    cutTo(this, S.Ticket, { fadeMs: 700 });
  }

  /* ── Fondo ───────────────────────────────────────────────────────── */

  private background(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1b1a3a).setOrigin(0).setDepth(-10);

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
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }
}
