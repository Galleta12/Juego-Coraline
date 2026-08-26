import Phaser from "phaser";
import { ENEMY } from "@/config/game";
import { audio } from "@/systems/AudioSystem";
import { burstAt } from "@/systems/Terrain";
import { impactRing, sparks } from "@/ui/Effects";

/**
 * Aldeano.
 *
 * Patrulla su trozo de bosque hasta que la jugadora entra en su radio;
 * entonces se lanza. Da la vuelta al llegar a un borde, asi que nunca
 * se tira solo a un hueco: un enemigo que se suicida hace que el nivel
 * parezca roto.
 *
 * Dos variantes con el mismo comportamiento y distinto arte. La
 * alterada aparece despues de la pastilla y es mas rapida.
 */

export type VillagerVariant = "normal" | "altered";

const ART = {
  normal: {
    idle: "enemies/villager/idle",
    walk: [
      "enemies/villager/walk-1",
      "enemies/villager/walk-2",
      "enemies/villager/walk-3",
    ],
    lunge: "enemies/villager/lunge",
    jump: "enemies/villager/jump-attack",
  },
  altered: {
    idle: "enemies/villager/altered/villager-altered-idle",
    walk: [
      "enemies/villager/walk-1",
      "enemies/villager/walk-2",
      "enemies/villager/walk-3",
    ],
    lunge: "enemies/villager/altered/villager-altered-lunge",
    jump: "enemies/villager/jump-attack",
  },
} as const;

export const villagerArtKeys = (): string[] => [
  ...new Set([
    ...Object.values(ART.normal).flat(),
    ...Object.values(ART.altered).flat(),
  ]),
];

export class Villager extends Phaser.Physics.Arcade.Sprite {
  /**
   * Multiplicador de velocidad.
   *
   * El tutorial lo baja: alli el aldeano no esta para matar a nadie,
   * esta para que le disparen mientras el guia explica, y a velocidad
   * normal llegaba encima antes de que terminara la frase.
   */
  speedScale = 1;

  declare body: Phaser.Physics.Arcade.Body;

  private hp = ENEMY.villagerHp;
  private dir: 1 | -1 = 1;
  private lunging = false;
  private nextLungeAt = 0;
  private nextJumpAt = 0;

  /**
   * Que soltar al caer.
   *
   * Vive aqui y no en cada sitio que le pega. Antes cada punto de dano
   * — bala, pico, zarpazo del gato — tenia que acordarse de soltar el
   * botin por su cuenta, y el pico y el gato no lo hacian: matabas a uno
   * y no caia nada.
   */
  onDeath?: (x: number, y: number) => void;
  private dying = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    public variant: VillagerVariant = "normal",
  ) {
    super(scene, x, y, ART[variant].idle);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1).setScale(0.72).setDepth(16);
    // El cuerpo se mide sobre la textura porque el lienzo del pack
    // cambia cada vez que se reprocesa el arte.
    this.body.setSize(this.width * 0.42, this.height * 0.8);
    this.body.setOffset(this.width * 0.29, this.height * 0.2);
    this.setCollideWorldBounds(true);

    this.registerAnimations();
    this.play(this.key("walk"));
    this.dir = Math.random() < 0.5 ? 1 : -1;

    if (variant === "altered") this.setTint(0xd88ad8);
  }

  /**
   * Pasa a la variante alterada sin reconstruir el sprite.
   *
   * La pastilla cambia el mundo a media partida; destruir y recrear a
   * cada enemigo perderia su posicion y su estado, y se veria el
   * parpadeo.
   */
  turnAltered(): void {
    if (this.dying || this.variant === "altered") return;
    (this as { variant: VillagerVariant }).variant = "altered";
    this.registerAnimations();
    this.setTexture(ART.altered.idle);
    this.play(this.key("walk"), true);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.2,
      duration: 120,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.setAlpha(1),
    });
    this.setTint(0xd88ad8);
  }

  private key(name: string): string {
    return `villager-${this.variant}-${name}`;
  }

  private registerAnimations(): void {
    const a = this.scene.anims;
    const art = ART[this.variant];
    const make = (key: string, keys: readonly string[], rate: number, repeat: number) => {
      if (a.exists(key)) return;
      a.create({ key, frames: keys.map((k) => ({ key: k })), frameRate: rate, repeat });
    };
    make(this.key("idle"), [art.idle], 1, -1);
    // Ida y vuelta por los tres frames: seis pasos por ciclo en vez de
    // tres, que es lo que hacia que la caminata se viera a tirones.
    make(this.key("walk"), [...art.walk, art.walk[1], art.idle, art.walk[1]], 9, -1);
    make(this.key("lunge"), [art.lunge, art.jump, art.lunge], 9, 0);
  }

  get isDying(): boolean {
    return this.dying;
  }

  /** true si este golpe lo ha matado. */
  hit(amount: number, fromAngle: number): boolean {
    if (this.dying) return false;
    this.hp -= amount;

    sparks(this.scene, this.x, this.y - this.displayHeight * 0.5, fromAngle, 0xb84a5a, 8);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.35,
      duration: 60,
      yoyo: true,
      onComplete: () => this.setAlpha(1),
    });

    if (this.hp > 0) {
      audio.sfx.villagerHurt();
      // Retroceso: sin esto se puede quedar pegado a la jugadora
      // recibiendo golpes sin que se note que le duelen.
      this.setVelocityX(Math.cos(fromAngle) * -160);
      return false;
    }

    this.die();
    return true;
  }

  private die(): void {
    this.dying = true;
    this.body.setEnable(false);
    audio.sfx.villagerDie();
    this.onDeath?.(this.x, this.y);
    burstAt(this.scene, this.x, this.y - this.displayHeight * 0.5, 16, 0xb84a5a);
    impactRing(this.scene, this.x, this.y - this.displayHeight * 0.5, 0xb84a5a, 60);

    this.scene.tweens.add({
      targets: this,
      angle: this.dir * 84,
      alpha: 0,
      y: this.y + 14,
      duration: 420,
      ease: "Quad.easeIn",
      onComplete: () => this.destroy(),
    });
  }

  /**
   * @param onHit se llama si alcanza a la jugadora
   */
  tick(target: Phaser.Physics.Arcade.Sprite, onHit: () => void): void {
    if (this.dying || !this.body.enable) return;

    const now = this.scene.time.now;
    const dx = target.x - this.x;
    const gap = Math.abs(dx);
    const sameFloor = Math.abs(target.y - this.y) < 110;
    const onGround = this.body.blocked.down || this.body.touching.down;

    // Alcance de cuerpo a cuerpo.
    if (gap < 54 && sameFloor) {
      onHit();
    }

    if (this.lunging) {
      if (onGround) this.setVelocityX(this.dir * ENEMY.chaserSpeed * 1.9 * this.speedScale);
      return;
    }

    if (gap < ENEMY.chaseRange && sameFloor) {
      // Persecucion.
      this.dir = dx > 0 ? 1 : -1;
      this.setVelocityX(this.dir * ENEMY.chaserSpeed * this.speedScale);
      this.play(this.key("walk"), true);


      if (gap < ENEMY.lungeRange && now > this.nextLungeAt && onGround) {
        this.nextLungeAt = now + ENEMY.lungeCooldownMs;
        this.lunging = true;
        this.setVelocity(this.dir * ENEMY.chaserSpeed * 2.1 * this.speedScale, -330);
        this.play(this.key("lunge"), true);
        audio.sfx.villagerGroan();
        this.scene.time.delayedCall(620, () => {
          this.lunging = false;
        });
      }
    } else {
      // Patrulla. Si topa con un muro, se da la vuelta.
      if (this.body.blocked.left) this.dir = 1;
      if (this.body.blocked.right) this.dir = -1;
      this.setVelocityX(this.dir * ENEMY.villagerSpeed);
      this.play(this.key("walk"), true);
    }

    // Salta muros y repisas, persiguiendo o patrullando.
    //
    // Va fuera de la rama de persecucion: ahi dentro se lo comia el
    // brinco del lunge y en la practica no saltaba nunca. El impulso es
    // el mismo que el de la heroina, asi que llega a donde ella llega.
    if (onGround && now > this.nextJumpAt) {
      const wall = this.body.blocked.left || this.body.blocked.right;
      const above = target.y < this.y - 60 && gap < ENEMY.chaseRange;
      if (wall || above) {
        this.setVelocityY(-640);
        this.nextJumpAt = now + 450;
      }
    }

    this.setFlipX(this.dir === -1);
  }
}
