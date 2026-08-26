import Phaser from "phaser";
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
 * Antes de esto habia una pantalla de letras sobre negro contando lo
 * mismo. Estas laminas lo cuentan mejor y ademas estan dibujadas.
 */

const BEATS = ["screens/beat-1", "screens/beat-2", "screens/beat-3", "screens/beat-4"];

/** Lo que se queda cada lamina en pantalla. */
const HOLD_MS = 3400;
const FADE_MS = 750;

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
    for (const [i, key] of BEATS.entries()) {
      await this.beat(key, i);
    }

    this.cameras.main.fadeOut(700, 8, 6, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(S.Choice);
    });
  }

  /** Una lamina: entra, respira con su ambiente, y se va. */
  private beat(key: string, index: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.textures.exists(key)) {
        resolve();
        return;
      }

      // Cabiendo entera, no cubriendo.
      //
      // Antes iba con `fitCover`, que llena la pantalla recortando lo
      // que sobra por los lados. Estas cuatro laminas son 16:9 casi
      // exacto, igual que el juego, asi que en un monitor normal no se
      // notaba — pero el lienzo va en modo ENVELOP y en uno mas ancho
      // recorta hasta 44px arriba y abajo, y el texto de estas cartas
      // vive cerca del borde: se comia una linea entera. Con margen de
      // sobra la lamina entera cabe siempre, texto incluido.
      const img = this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key)
        .setDepth(10)
        .setAlpha(0);
      const fit = Math.min(GAME_WIDTH / img.width, GAME_HEIGHT / img.height) * 0.9;
      img.setScale(fit);
      const base = fit;

      // La ultima es el cielo azul: su ambiente es claro y frio, y las
      // tres primeras son de interior con luz de vela.
      const warm = index < 3;
      const tint = warm ? 0xffb35c : 0xbfe4ff;

      const glow = this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, tint, 0)
        .setOrigin(0)
        .setDepth(11)
        .setBlendMode(Phaser.BlendModes.ADD);

      const bits: Phaser.GameObjects.GameObject[] = [img, glow];

      // Motas subiendo, del color de la lamina.
      const dust = this.time.addEvent({
        delay: 150,
        loop: true,
        callback: () => {
          const x = Math.random() * GAME_WIDTH;
          const p = this.add
            .circle(x, GAME_HEIGHT + 10, 1.5 + Math.random() * 3, tint, 0.55)
            .setDepth(12)
            .setBlendMode(Phaser.BlendModes.ADD);
          bits.push(p);
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

      this.tweens.add({ targets: img, alpha: 1, duration: FADE_MS });
      // Acercamiento lento: la camara se mete en el dibujo.
      this.tweens.add({
        targets: img,
        scale: base * 1.06,
        duration: HOLD_MS + FADE_MS,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: glow,
        fillAlpha: 0.12,
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.time.delayedCall(FADE_MS + HOLD_MS, () => {
        dust.remove();
        this.tweens.add({
          targets: bits,
          alpha: 0,
          duration: FADE_MS,
          onComplete: () => {
            for (const b of bits) b.destroy();
            resolve();
          },
        });
      });
    });
  }
}
