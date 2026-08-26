import Phaser from "phaser";
import { audio } from "@/systems/AudioSystem";
import { burstAt } from "@/systems/Terrain";
import { impactRing, sparks } from "@/ui/Effects";

/**
 * Cebolla.
 *
 * Sale de las manos de la Otra Madre buscando a la jugadora. De un
 * disparo se le da la vuelta y vuelve a su dueña, y entonces duele de
 * verdad.
 *
 * Vuela despacio y gira mucho a proposito: tiene que verse venir desde
 * lejos, porque es a la vez el peligro y la solucion.
 */

export const ONION_ART = {
  idle: "boss/projectiles/onion-idle",
  throw: "boss/projectiles/onion-throw",
  glow: "boss/projectiles/onion-glow",
  burst: "boss/projectiles/onion-burst",
} as const;

export const onionArtKeys = (): string[] => Object.values(ONION_ART);

const SPEED = 300;
/** Al devolverla va mas rapido: se siente como un contraataque. */
const RETURN_SPEED = 620;

export class Onion extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  private returned = false;
  private spent = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
  ) {
    super(scene, x, y, ONION_ART.throw);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(0.62).setDepth(24);
    this.body.setAllowGravity(false);
    this.body.setCircle(this.width * 0.42, this.width * 0.08, this.height * 0.08);

    const a = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.setVelocity(Math.cos(a) * SPEED, Math.sin(a) * SPEED);

    scene.tweens.add({ targets: this, angle: 360, duration: 900, repeat: -1 });
    audio.sfx.onionThrow();

    // Un halo detras: sobre el fondo oscuro de la guarida la cebolla
    // sola se perdia entre la telaraña.
    const halo = scene.add.image(x, y, ONION_ART.glow).setScale(0.9).setDepth(23).setAlpha(0.6);
    halo.setBlendMode(Phaser.BlendModes.ADD);
    scene.events.on(Phaser.Scenes.Events.UPDATE, () => {
      if (!this.active) {
        halo.destroy();
        return;
      }
      halo.setPosition(this.x, this.y);
    });
  }

  get isReturned(): boolean {
    return this.returned;
  }

  /** La devuelve hacia quien la lanzo. Solo se puede una vez. */
  reflect(towardX: number, towardY: number): void {
    if (this.returned || this.spent) return;
    this.returned = true;

    this.setTexture(ONION_ART.glow);
    this.setScale(0.8);
    audio.sfx.projectileHit();
    impactRing(this.scene, this.x, this.y, 0xc9e08a, 60);
    sparks(this.scene, this.x, this.y, 0, 0xc9e08a, 8);

    const a = Phaser.Math.Angle.Between(this.x, this.y, towardX, towardY);
    this.setVelocity(Math.cos(a) * RETURN_SPEED, Math.sin(a) * RETURN_SPEED);
    this.scene.tweens.add({ targets: this, angle: 720, duration: 500, repeat: -1 });
  }

  /** Estalla y desaparece. */
  burst(): void {
    if (this.spent) return;
    this.spent = true;
    this.body.setEnable(false);

    audio.sfx.onionSplat();
    const puff = this.scene.add.image(this.x, this.y, ONION_ART.burst).setScale(0.5).setDepth(25);
    this.scene.tweens.add({
      targets: puff,
      scale: 1.3,
      alpha: 0,
      duration: 320,
      onComplete: () => puff.destroy(),
    });
    burstAt(this.scene, this.x, this.y, 10, 0xc9e08a);
    this.destroy();
  }
}
