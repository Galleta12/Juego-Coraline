import Phaser from "phaser";
import { cutTo } from "@/ui/Transition";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";

/**
 * El remate: cuatro laminas y una cancion.
 *
 * Es el momento del juego. La pelea acaba, entra la carta del jefe, y
 * aqui arranca Fuerza Regida a la vez que la primera lamina: mision
 * completada, aunque, solo queria, asi que. Cuatro tiempos que llevan
 * de "ganaste" a la pregunta de verdad.
 *
 * No se puede saltar ninguna. El corte va pegado a la musica y
 * adelantar una lamina lo descuadra.
 *
 * ── Por que esto NO es un pase de diapositivas ────────────────────────
 *
 * Antes lo parecia, y por dos motivos concretos:
 *
 *   1. Cada lamina se fundia a NEGRO del todo antes de que entrara la
 *      siguiente. Ese hueco en negro entre imagen e imagen es
 *      exactamente lo que hace un PowerPoint.
 *   2. Las cuatro se movian igual: mismo acercamiento, misma curva
 *      `Sine.easeInOut` — que arranca despacio y FRENA al final. Una
 *      imagen que frena se lee como una diapositiva que ya llego a su
 *      sitio.
 *
 * Ahora se encadenan — la nueva entra por encima mientras la anterior
 * se va, sin negro de por medio — y cada una tiene su propio recorrido:
 * una se acerca, otra se aleja, otra baja, otra sube. Y el movimiento va
 * a velocidad CONSTANTE (`Linear`) de principio a fin, incluso durante
 * el cruce: mientras algo sigue moviendose, el ojo lo lee como una
 * camara y no como una foto puesta en pantalla.
 */

const BEATS = ["screens/beat-1", "screens/beat-2", "screens/beat-3", "screens/beat-4"];

/** Lo que se queda cada lamina, ya sin contar el cruce. */
const HOLD_MS = 3000;
/** Lo que dura el cruce de una lamina a la siguiente. */
const CROSS_MS = 900;

/**
 * El recorrido de camara de cada lamina.
 *
 * `from`/`to` son multiplicadores del tamaño de ajuste, y `dx`/`dy` el
 * desplazamiento total en pixeles. Van a contrapelo unos de otros a
 * proposito: dos acercamientos seguidos, aunque sean lentos, se leen
 * como el mismo efecto repetido.
 */
const MOVES = [
  { from: 1.0, to: 1.13, dx: -30, dy: 6 }, // se acerca, derivando a la izquierda
  { from: 1.15, to: 1.02, dx: 26, dy: -8 }, // se aleja, abriendo el plano
  { from: 1.02, to: 1.14, dx: 8, dy: 22 }, // se acerca bajando
  { from: 1.1, to: 1.22, dx: -10, dy: -26 }, // sube al cielo
] as const;

export class FinaleScene extends Phaser.Scene {
  constructor() {
    super(S.Finale);
  }

  preload(): void {
    queue(this, BEATS);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(INK.void);
    // La cancion arranca EXACTAMENTE con la primera lamina, y sigue
    // sonando por encima de todo lo que viene despues: la eleccion, el
    // calendario y el ticket comparten la misma clave de musica, asi
    // que no se corta en ningun momento.
    void audio.playMusic("finale");
    void this.run();
  }

  private async run(): Promise<void> {
    // Motas y resplandor viven fuera de las laminas y NO se reinician
    // entre una y otra: son el ambiente de toda la secuencia. Antes se
    // creaban y destruian con cada lamina, y ese corte del ambiente
    // marcaba el cambio todavia mas.
    this.ambience();

    let previous: Phaser.GameObjects.Image | null = null;
    for (const [i, key] of BEATS.entries()) {
      previous = await this.beat(key, i, previous);
    }

    // La ultima se queda un momento a solas antes del corte.
    await this.wait(400);
    if (previous) {
      this.tweens.add({ targets: previous, alpha: 0, duration: 600 });
    }
    cutTo(this, S.Choice, { fadeMs: 700 });
  }

  /**
   * Una lamina. Entra encima de la anterior y la releva.
   *
   * Devuelve su imagen para que la siguiente sepa a quien tiene que ir
   * apagando mientras ella aparece.
   */
  private beat(
    key: string,
    index: number,
    previous: Phaser.GameObjects.Image | null,
  ): Promise<Phaser.GameObjects.Image | null> {
    return new Promise((resolve) => {
      if (!this.textures.exists(key)) {
        resolve(previous);
        return;
      }

      // Cabiendo entera, no cubriendo.
      //
      // El lienzo va en modo ENVELOP y en un monitor ancho recorta hasta
      // 44 px arriba y abajo; el texto de estas cartas vive cerca del
      // borde y se perdia una linea entera. Con margen cabe siempre.
      //
      // El margen es algo mayor que antes (0.86 en vez de 0.9) porque
      // ahora las laminas se acercan hasta un 22%: sin ese aire de mas,
      // el propio movimiento las sacaria del area segura.
      const img = this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key)
        .setDepth(10 + index)
        .setAlpha(0);
      const fit = Math.min(GAME_WIDTH / img.width, GAME_HEIGHT / img.height) * 0.86;

      const move = MOVES[index] ?? MOVES[0];
      img.setScale(fit * move.from);
      img.setPosition(GAME_WIDTH / 2 - move.dx / 2, GAME_HEIGHT / 2 - move.dy / 2);

      // El recorrido dura TODO lo que la lamina esta en pantalla, cruces
      // incluidos, y a velocidad constante: nunca llega a pararse, que
      // es lo que la separa de una diapositiva.
      this.tweens.add({
        targets: img,
        scale: fit * move.to,
        x: GAME_WIDTH / 2 + move.dx / 2,
        y: GAME_HEIGHT / 2 + move.dy / 2,
        duration: CROSS_MS * 2 + HOLD_MS,
        ease: "Linear",
      });

      // El cruce: esta aparece mientras la anterior se va, a la vez.
      this.tweens.add({ targets: img, alpha: 1, duration: CROSS_MS, ease: "Sine.easeInOut" });
      if (previous) {
        const old = previous;
        this.tweens.add({
          targets: old,
          alpha: 0,
          duration: CROSS_MS,
          ease: "Sine.easeInOut",
          // Se destruye al terminar de irse, no antes: mientras se cruza
          // tiene que seguir viendose por debajo de la nueva.
          onComplete: () => old.destroy(),
        });
      }

      // Un destello suave en el relevo, como el fogonazo de un proyector
      // al cambiar de rollo. Marca el compas sin cortar nada.
      if (index > 0) {
        this.cameras.main.flash(360, 255, 240, 210, true);
        audio.sfx.whoosh();
      }

      this.time.delayedCall(CROSS_MS + HOLD_MS, () => resolve(img));
    });
  }

  /**
   * Ambiente continuo: motas y un latido de luz sobre todo.
   *
   * Se monta una sola vez para la secuencia entera. El color va del
   * calido de las tres primeras laminas — interior, luz de vela — al
   * frio de la ultima, que es cielo abierto, y ese viraje acompaña al
   * cambio de tono sin que haya que cortar nada.
   */
  private ambience(): void {
    const glow = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffb35c, 0)
      .setOrigin(0)
      .setDepth(40)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      fillAlpha: 0.11,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Del ambar al azul, justo cuando entra la ultima lamina.
    const tint = { r: 255, g: 179, b: 92 };
    this.tweens.add({
      targets: tint,
      r: 191,
      g: 228,
      b: 255,
      delay: (CROSS_MS + HOLD_MS) * 3,
      duration: CROSS_MS,
      onUpdate: () => {
        glow.setFillStyle(
          Phaser.Display.Color.GetColor(Math.round(tint.r), Math.round(tint.g), Math.round(tint.b)),
          glow.fillAlpha,
        );
      },
    });

    this.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        const x = Math.random() * GAME_WIDTH;
        const p = this.add
          .circle(
            x,
            GAME_HEIGHT + 10,
            1.5 + Math.random() * 3,
            Phaser.Display.Color.GetColor(
              Math.round(tint.r),
              Math.round(tint.g),
              Math.round(tint.b),
            ),
            0.55,
          )
          .setDepth(41)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: p,
          y: -20,
          x: x + (Math.random() - 0.5) * 150,
          alpha: 0,
          duration: 3600 + Math.random() * 2800,
          onComplete: () => p.destroy(),
        });
      },
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }
}
