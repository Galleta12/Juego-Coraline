import Phaser from "phaser";
import { DOG } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";

/**
 * Snoopy.
 *
 * No es un companero: es un cameo. Entra corriendo cada vez que aparece
 * un cafe, lo entrega, celebra y se va. Dura menos de tres segundos a
 * proposito — la gracia esta en que nadie lo explique.
 */
export class Dog {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Corre hasta `x`, entrega el cafe y se va por donde vino.
   * Resuelve cuando ha terminado de entregarlo, no cuando se ha ido:
   * asi el efecto del cafe empieza en el momento correcto.
   */
  deliver(x: number, groundY: number): Promise<void> {
    const fromLeft = true;
    const startX = fromLeft ? x - 420 : x + 420;

    const dog = this.scene.add
      .sprite(startX, groundY, DOG.appear)
      .setOrigin(0.5, 1)
      .setScale(0.62)
      .setDepth(19)
      .setFlipX(!fromLeft);

    audio.sfx.dogArrive();

    return new Promise<void>((resolve) => {
      // 1. Entra corriendo, con un rebote que sugiere trote.
      this.scene.tweens.add({
        targets: dog,
        x: x - 46,
        duration: 800,
        ease: "Quad.easeOut",
      });
      const hop = this.scene.tweens.add({
        targets: dog,
        y: groundY - 10,
        duration: 160,
        yoyo: true,
        repeat: 4,
        ease: "Sine.easeOut",
      });

      // 2. Ofrece el cafe.
      this.scene.time.delayedCall(840, () => {
        hop.remove();
        dog.setY(groundY).setTexture(DOG.offer);
        this.scene.tweens.add({
          targets: dog,
          scaleX: 0.68,
          scaleY: 0.68,
          duration: 220,
          yoyo: true,
        });
        audio.sfx.coffee();
        resolve();
      });

      // 3. Celebra y se marcha.
      this.scene.time.delayedCall(1500, () => {
        dog.setTexture(DOG.dance);
        this.scene.tweens.add({
          targets: dog,
          angle: { from: -8, to: 8 },
          duration: 140,
          yoyo: true,
          repeat: 4,
        });
      });
      this.scene.time.delayedCall(2400, () => {
        this.scene.tweens.add({
          targets: dog,
          x: startX,
          alpha: 0,
          duration: 700,
          ease: "Quad.easeIn",
          onComplete: () => dog.destroy(),
        });
      });
    });
  }
}
