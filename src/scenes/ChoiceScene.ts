import Phaser from "phaser";
import { reportProgress } from "@/systems/Api";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { CHOICE } from "@/config/strings";
import { ITEM, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { setState } from "@/systems/GameState";
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
  // Medidas sobre `elecciones_nuevo_improved.png` (1536x1024) buscando
  // los valles oscuros del perfil de brillo: los dos marcos claros van
  // de x=350 a x=745 y de x=767 a x=1184, los dos entre y=300 e y=710.
  diamonds: { x: 0.3564, y: 0.4932, w: 0.25, h: 0.39 },
  movie: { x: 0.6351, y: 0.4932, w: 0.265, h: 0.39 },
  // El NO no esta dibujado en esta lamina: nace aqui, sobre el suelo
  // oscuro que queda por debajo de los dos marcos. Pequeño a proposito
  // — cuanto menos ocupa, mas margen de esquive le cabe alrededor.
  no: { x: 0.5, y: 0.79, w: 0.2, h: 0.085 },
} as const;

/**
 * Que tan lejos tiene que estar el raton para que el NO ya no huya.
 *
 * Bastante mayor que medio boton: si el margen se queda corto hay un
 * anillo justo encima del cartel donde el raton YA esta dentro de la
 * zona de clic pero todavia no cuenta como "cerca", y por ahi se colaba
 * el click.
 */
const DODGE_MARGIN = 190;

/**
 * Lo que tarda en apartarse. Muy corto: tiene que ser un respingo.
 *
 * Lo que queda de "a veces lo alcanzo" pasa MIENTRAS viaja — el raton se
 * cruza con el por el camino — asi que cuanto menos tiempo pase en el
 * aire, menos ocasiones hay de tocarlo.
 */
const DODGE_MS = 130;

/**
 * Minimo entre dos esquives.
 *
 * Medido persiguiendolo con un raton automatico a 1500 px/s — mas
 * rapido y mas certero que una mano — y contando cuantas veces el
 * puntero llega a caer encima:
 *
 *     freno 170 ms (mas que el vuelo) → 144 de 152. El cartel llega a su
 *       destino pero se queda ahi quieto el resto del freno, y el raton
 *       lo alcanza parado.
 *     freno 55 ms  → 11 de 152. Reacciona siempre, pero cada esquive
 *       cancela el anterior a medio camino y avanza a saltitos cortos.
 *     freno 90 ms  → 6 de 152. El punto justo: le da tiempo a alejarse
 *       de verdad y aun asi vuelve a reaccionar antes de que lo pillen.
 */
const DODGE_COOLDOWN_MS = 90;

export class ChoiceScene extends Phaser.Scene {
  private noSpot!: DodgeButton;
  private busy = false;
  /** El empujon del "fijate que hubiera pasado" sale una vez y ya. */
  private scolded = false;

  /**
   * Si ya vio la escenita del NO EN ESTA PARTIDA.
   *
   * Local a la escena, no guardado en el estado. Lo estaba, y el estado
   * vive en localStorage: bastaba con probar el NO una vez para que el
   * navegador lo recordara PARA SIEMPRE — al volver a jugar, el cartel
   * salia ya desactivado, el chiste no aparecia nunca mas y no habia
   * forma de recuperarlo salvo borrando los datos del sitio. Con la
   * bandera aqui, cada partida trae su escenita.
   */
  private sawNoScene = false;
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
    this.scolded = false;
    this.sawNoScene = false;
    this.dodges = 0;
    this.nextDodgeAt = 0;

    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(800, 8, 6, 14);
    // La cancion viene sonando desde el jefe y NO se corta aqui: es la
    // misma clave de musica, asi que sigue de largo.
    void audio.playMusic("finale");

    void reportProgress("choice");

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

    // Si ya vio la escenita, el cartel deja de ser pulsable de verdad.
    //
    // No basta con que `pressNo` no haga nada: perseguirlo y llegar a
    // hacerle clic — aunque no pase nada — rompe el chiste, que es que
    // no se puede. Apagado del todo, el unico final posible es no
    // alcanzarlo; el esquive pasa a ser la broma, no la cerradura.
    // Nada de leer el estado guardado aqui: cada partida empieza con el
    // cartel pulsable, para que la escenita del NO se pueda ver siempre.

    // Ademas del chequeo por frame en `update`, uno por cada movimiento
    // del raton: un click siempre llega despues de un `pointermove` a
    // esas coordenadas, asi que esto lo aparta ANTES de que el click
    // llegue a procesarse, sin depender de que toque el siguiente frame.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.busy || !this.noSpot || !this.sawNoScene) return;
      if (this.noSpot.isPointerNear(p.worldX, p.worldY, DODGE_MARGIN)) this.dodge();
    });
  }

  /**
   * Diamantes o pelicula.
   *
   * Si todavia no ha probado el NO, el primer intento no cuenta: sale el
   * empujon ("pero fijate que hubiera pasado si le dabas al no") y hay
   * que volver a elegir. Solo el primero — insistir en cada clic seria
   * dejarla encerrada en una pantalla por un chiste, y el chiste ya se
   * conto. A partir de ahi la eleccion vale aunque nunca le diera al NO.
   */
  private choose(what: string): void {
    if (this.busy) return;

    if (!this.sawNoScene && !this.scolded) {
      this.scolded = true;
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
    audio.duckMusic(true, 200);
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
        audio.duckMusic(false, 400);
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
    if (!this.sawNoScene) void this.noTheFirstTime();
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
    if (!this.sawNoScene) return;

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
    this.sawNoScene = true;
    setState({ triedNo: true });
    // A partir de este instante ya no se le puede dar: lo unico que
    // queda es verlo huir.
    this.noSpot.setEnabled(false);
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

    audio.duckMusic(false, 500);
    this.tweens.add({ targets: veil, fillAlpha: 0, duration: 600 });
    this.time.delayedCall(600, () => {
      veil.destroy();
      this.busy = false;
    });
  }

  /** Una linea enorme, centrada, que entra y sale sola. */
  private bigLine(text: string, hold: boolean): Promise<void> {
    return new Promise((resolve) => {
      // La cancion se aparta: estas son las frases del chiste y tienen
      // que leerse. Se devuelve el volumen al final de la escenita, no
      // linea por linea — subir y bajar cuatro veces seguidas se oye
      // como un fallo del audio.
      audio.duckMusic(true, 200);
      audio.sfx.typewriter();
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
    // Con freno: esto se comprueba en cada frame Y en cada movimiento del
    // raton, y sin el el cartel vibraria en el sitio.
    const now = this.time.now;
    if (now < this.nextDodgeAt) return;
    this.nextDodgeAt = now + DODGE_COOLDOWN_MS;

    audio.sfx.uiHover();
    this.dodges += 1;

    // Se va al rincon MAS LEJANO del raton, no "un poco hacia el otro
    // lado".
    //
    // Con un salto relativo el cartel se quedaba clavado: al llegar al
    // borde derecho, seguir empujandolo a la derecha no lo movia — el
    // recorte del area util devolvia la misma posicion — y ahi es donde
    // se le alcanzaba, quieto contra el tope mientras el raton llegaba
    // andando. Eligiendo entre nueve puntos fijos el que mas lejos queda
    // del cursor, siempre hay sitio a donde huir y siempre acaba lejos.
    const p = this.input.activePointer;
    const px = p?.worldX ?? GAME_WIDTH / 2;
    const py = p?.worldY ?? GAME_HEIGHT / 2;

    let best = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, d: -1 };
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.24, 0.52, 0.8]) {
        const x = GAME_WIDTH * fx;
        const y = GAME_HEIGHT * fy;
        // El azar rompe el patron: sin el siempre elegiria la misma
        // esquina para una posicion dada del raton y se volveria
        // predecible — que es otra forma de dejarse pillar.
        const d = Math.hypot(x - px, y - py) + Math.random() * 90;
        if (d > best.d) best = { x, y, d };
      }
    }

    this.noSpot.moveTo(best.x, best.y, DODGE_MS);
  }
}
