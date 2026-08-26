import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { CHOICE } from "@/config/strings";
import { ITEM, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { getState, setState } from "@/systems/GameState";
import { buildVignette } from "@/ui/Grade";
import { DodgeButton, Hotspot, fitCover, glowPulse, screenAmbience, spark } from "@/ui/Screens";
import { fontsReady, title } from "@/ui/text";

/**
 * La eleccion de verdad: diamantes, pelicula o NO.
 *
 * Ya no es el juego — es la lamina, y se elige con el raton. Los tres
 * paneles estan dibujados en el fondo, asi que aqui no se pintan
 * botones: se ponen zonas sensibles encima, calcadas a donde cae cada
 * cartel.
 *
 * La regla del NO es el chiste central. No deja decir que si sin haber
 * probado antes que pasa si dice que no; la primera vez que lo pulsa se
 * lleva la escenita y una cebolla en la cara, y a partir de ahi el
 * cartel se aparta solo cada vez que intenta darle.
 */

/**
 * Donde cae cada cartel, en fracciones del fondo.
 *
 * Medidas sobre la lamina nueva (`nuevo_eleccion_background.png`,
 * 1672x941): su relacion de aspecto es practicamente 16:9 — la misma
 * que el juego —, asi que `fitCover` la recorta menos de un pixel y las
 * fracciones de la imagen suelta valen tal cual, sin tener que medirlas
 * sobre una captura ya montada como antes.
 *
 * El NO ya NO esta pintado en la lamina — se borro al procesar (ver
 * `erase_no_button` en `process_screens.py`) — asi que su caja no es
 * una zona de clic sobre arte fijo: es donde nace el boton de verdad.
 */
const SPOTS = {
  diamonds: { x: 0.361, y: 0.5277, w: 0.2494, h: 0.4326 },
  movie: { x: 0.6236, y: 0.5277, w: 0.2482, h: 0.4326 },
  // Mas chico que el hueco viejo del cartel: con el tamaño original el
  // margen de esquive (ver DODGE_MARGIN) quedaba mas pequeño que el
  // propio boton, y el raton podia entrar en su zona de clic sin llegar
  // a estar "cerca" del centro — se le podia dar sin que huyera a tiempo.
  no: { x: 0.4949, y: 0.8363, w: 0.28, h: 0.11 },
} as const;

/**
 * Que tan lejos tiene que estar el raton para que el NO ya no huya.
 *
 * Mayor que medio boton: si no, hay un anillo justo encima del cartel
 * donde el raton ya esta dentro de la zona de clic pero todavia no se
 * considera "cerca", y ahi es donde se colaba el click.
 */
const DODGE_MARGIN = 140;

export class ChoiceScene extends Phaser.Scene {
  private noSpot!: DodgeButton;
  private busy = false;
  /** Cuantas veces se ha apartado el NO, para ir alternando de lado. */
  private dodges = 0;
  /** Freno del esquive: `update` corre cada frame. */
  private nextDodgeAt = 0;

  constructor() {
    super(S.Choice);
  }

  preload(): void {
    queue(this, ["screens/choice", "screens/no-button", ITEM.onion]);
  }

  async create(): Promise<void> {
    this.busy = false;
    this.dodges = 0;
    this.nextDodgeAt = 0;

    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(800, 8, 6, 14);
    // La cancion viene sonando desde el jefe y NO se corta aqui: es la
    // misma clave de musica, asi que sigue de largo.
    void audio.playMusic("finale");

    const bg = fitCover(this, "screens/choice");
    bg.setDepth(0);
    // La lamina no se queda quieta: motas, latido de luz y destellos.
    screenAmbience(this, 0xd9a441);
    buildVignette(this);

    // El fondo NO se acerca ni se aleja, aunque le daria vida: las zonas
    // clicables se calculan una sola vez a partir del tamaño de la
    // lamina, asi que en cuanto esta se mueve dejan de caer sobre los
    // carteles dibujados. El ambiente lo ponen las motas y el latido de
    // luz, que no arrastran nada.
    await fontsReady();

    const spot = (
      name: "diamonds" | "movie",
      color: number,
      onPick: () => void,
    ): Hotspot => new Hotspot(this, bg, SPOTS[name], { color, onPick });

    spot("diamonds", INK.diamond, () => this.choose("diamantes"));
    spot("movie", INK.gold, () => this.choose("película"));

    // El NO es un boton de verdad, no una zona sobre arte fijo — ver el
    // comentario de SPOTS. Se calcula la misma conversion de fraccion a
    // pixeles que usa `Hotspot` por dentro, para que nazca clavado en
    // el hueco que dejo la lamina al borrarlo.
    const noBox = SPOTS.no;
    this.noSpot = new DodgeButton(this, {
      key: "screens/no-button",
      x: bg.x + (noBox.x - 0.5) * bg.displayWidth,
      y: bg.y + (noBox.y - 0.5) * bg.displayHeight,
      w: noBox.w * bg.displayWidth,
      h: noBox.h * bg.displayHeight,
      color: INK.blood,
      onPick: () => this.pressNo(),
    });

    // Ademas del chequeo por frame en `update`, uno por cada movimiento
    // del raton: un click siempre llega despues de un `pointermove` a
    // esas coordenadas, asi que esto lo aparta ANTES de que el click
    // llegue a procesarse, sin depender de que toque el siguiente frame.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.busy || !this.noSpot || !getState().triedNo) return;
      if (this.noSpot.isPointerNear(p.worldX, p.worldY, DODGE_MARGIN)) this.dodge();
    });
  }

  /** Diamantes o pelicula. Solo valen si ya probo el NO. */
  private choose(what: string): void {
    if (this.busy) return;

    if (!getState().triedNo) {
      this.scold();
      return;
    }

    this.busy = true;
    audio.sfx.uiConfirm();
    setState({ selectedActivity: what });

    this.cameras.main.fadeOut(700, 8, 6, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // De aqui se va directo a la lamina de Gertrudis. La eleccion de
      // comida se quito entera del juego.
      this.scene.start(S.Gertrudis);
    });
  }

  /** "Primero fijate que pasaria si dices que no." */
  private scold(): void {
    audio.sfx.uiDeny();
    this.busy = true;

    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.24, CHOICE.mustTryNo, title(26, INK.bone))
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0);
    t.setShadow(0, 3, "#0a0710", 8, true, true);

    // Un empujon al cartel del NO para que quede claro de que habla.
    glowPulse(this, this.noSpot, INK.blood);

    this.tweens.add({
      targets: t,
      alpha: 1,
      y: GAME_HEIGHT * 0.21,
      duration: 340,
      hold: 2100,
      yoyo: true,
      onComplete: () => {
        t.destroy();
        this.busy = false;
      },
    });
  }

  private pressNo(): void {
    if (this.busy) return;

    // Solo se puede pulsar la PRIMERA vez. A partir de ahi el boton se
    // escapa antes de que el raton llegue, asi que este camino ya no se
    // recorre — el esquive lo lleva `update`.
    if (!getState().triedNo) void this.noTheFirstTime();
  }

  /**
   * El NO huye del raton.
   *
   * Una vez que ya sabe lo que pasa si dice que no, el cartel deja de
   * dejarse pulsar: en cuanto el puntero se acerca, se va a otro sitio.
   * Antes solo se apartaba DESPUES de haberlo pulsado, y eso permitia
   * decir que no una y otra vez — que es justo lo contrario del chiste.
   */
  override update(): void {
    if (this.busy || !this.noSpot) return;
    if (!getState().triedNo) return;

    const p = this.input.activePointer;
    if (!p) return;

    if (this.noSpot.isPointerNear(p.worldX, p.worldY, DODGE_MARGIN)) this.dodge();
  }

  /**
   * La primera vez que dice que no.
   *
   * Cuatro lineas, una detras de otra y con tiempo de sobra para
   * leerlas, y al final una cebolla que sale volando hacia la pantalla.
   * Pasa una sola vez.
   */
  private async noTheFirstTime(): Promise<void> {
    this.busy = true;
    setState({ triedNo: true });
    audio.sfx.uiDeny();

    const veil = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, INK.void, 0)
      .setOrigin(0)
      .setDepth(50);
    this.tweens.add({ targets: veil, fillAlpha: 0.82, duration: 500 });

    for (const [i, line] of CHOICE.noLines.entries()) {
      await this.bigLine(line, i === CHOICE.noLines.length - 1);
    }

    await this.throwOnion();

    this.tweens.add({ targets: veil, fillAlpha: 0, duration: 600 });
    this.time.delayedCall(600, () => {
      veil.destroy();
      this.busy = false;
    });
  }

  /** Una linea enorme, centrada, que entra y sale sola. */
  private bigLine(text: string, hold: boolean): Promise<void> {
    return new Promise((resolve) => {
      const t = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, text, title(58, INK.bone))
        .setOrigin(0.5)
        .setDepth(60)
        .setAlpha(0)
        .setScale(0.86);
      t.setShadow(0, 4, "#0a0710", 12, true, true);

      this.tweens.add({
        targets: t,
        alpha: 1,
        scale: 1,
        duration: 420,
        ease: "Back.easeOut",
        // La ultima se queda mas rato: es la que anuncia la cebolla.
        hold: hold ? 1500 : 1100,
        yoyo: true,
        onComplete: () => {
          t.destroy();
          resolve();
        },
      });
    });
  }

  /** La cebolla sale volando hacia la pantalla. */
  private throwOnion(): Promise<void> {
    return new Promise((resolve) => {
      const onion = this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, ITEM.onion)
        .setDepth(62)
        .setScale(0.12)
        .setAlpha(0);

      audio.sfx.uiSelect();
      this.tweens.add({
        targets: onion,
        alpha: 1,
        scale: 3.4,
        angle: 420,
        duration: 900,
        ease: "Quad.easeIn",
        onComplete: () => {
          // Impacto: la pantalla tiembla y la cebolla se deshace.
          this.cameras.main.shake(320, 0.016);
          audio.sfx.hurt();
          spark(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.62, 0xd8b25a, 22);
          onion.destroy();
          this.time.delayedCall(420, resolve);
        },
      });
    });
  }

  /**
   * El NO se aparta.
   *
   * A partir de la segunda vez ya no hay escena: el cartel se va a otro
   * sitio y no se deja pulsar. Alterna de lado para que se note que la
   * esta esquivando a proposito.
   */
  private dodge(): void {
    // Con freno: `update` corre cada frame y sin esto el cartel saldria
    // disparado sin parar mientras el raton siguiera cerca.
    const now = this.time.now;
    if (now < this.nextDodgeAt) return;
    this.nextDodgeAt = now + 420;

    audio.sfx.uiHover();
    this.dodges += 1;

    // Huye en direccion CONTRARIA al raton, no a un lado fijo: asi se
    // lee como que la esta esquivando, no como que se teletransporta.
    const p = this.input.activePointer;
    const away = p && p.worldX > this.noSpot.x ? -1 : 1;

    const dx = away * GAME_WIDTH * (0.22 + Math.random() * 0.12);
    const dy = (this.dodges % 2 === 0 ? -1 : 1) * GAME_HEIGHT * 0.14;

    this.noSpot.moveBy(dx, dy, 300);
  }
}
