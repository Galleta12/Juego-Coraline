import Phaser from "phaser";
import { ENEMY } from "@/config/game";
import { audio, type HissHandle } from "@/systems/AudioSystem";
import { burstAt } from "@/systems/Terrain";
import { flash, impactRing, sparks } from "@/ui/Effects";

/**
 * Creeper.
 *
 * Se acerca despacio, sisea cada vez mas fuerte y, dentro del radio de
 * mecha, empieza la cuenta atras. A partir de ahi ya no hay marcha
 * atras: hincha, parpadea y explota.
 *
 * El aviso es generoso a proposito. El brief pide susto, no castigo:
 * hay tiempo de sobra para correr o para dispararle antes.
 */

const ART = {
  idle: "enemies/creeper/idle",
  walk: [
    "enemies/creeper/walk-1",
    "enemies/creeper/walk-2",
    "enemies/creeper/walk-3",
  ],
  charge: "enemies/creeper/charge",
  alteredIdle: "enemies/creeper/altered/bomber-altered-idle",
  alteredCharge: "enemies/creeper/altered/bomber-altered-charge",
} as const;

export const creeperArtKeys = (): string[] => [
  ART.idle,
  ...ART.walk,
  ART.charge,
  ART.alteredIdle,
  ART.alteredCharge,
];

export class Creeper extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  private hp = ENEMY.creeperHp;
  private fuseStartedAt = -1;
  private exploded = false;
  private hiss: HissHandle | null = null;
  private dir: 1 | -1 = -1;

  /** Que suelta al caer abatido. Ver Villager.onDeath. */
  onDeath?: (x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private altered = false,
  ) {
    super(scene, x, y, altered ? ART.alteredIdle : ART.idle);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1).setScale(0.7).setDepth(16);
    this.body.setSize(this.width * 0.5, this.height * 0.78);
    this.body.setOffset(this.width * 0.25, this.height * 0.22);
    this.setCollideWorldBounds(true);

    this.registerAnimations();
    this.play("creeper-walk");
  }

  private registerAnimations(): void {
    const a = this.scene.anims;
    const make = (key: string, keys: readonly string[], rate: number, repeat: number) => {
      if (a.exists(key)) return;
      a.create({ key, frames: keys.map((k) => ({ key: k })), frameRate: rate, repeat });
    };
    make("creeper-idle", [ART.idle], 1, -1);
    // Ciclo de ida y vuelta para que el balanceo no salte de golpe.
    make(
      "creeper-walk",
      [...ART.walk, ART.walk[1], ART.idle, ART.walk[1]],
      8,
      -1,
    );
    make("creeper-charge", [ART.charge, ART.idle], 10, -1);
    make("creeper-altered-charge", [ART.alteredCharge, ART.alteredIdle], 12, -1);
  }

  /** Pasa a la variante alterada. Ver Villager.turnAltered. */
  turnAltered(): void {
    if (this.exploded || this.altered) return;
    this.altered = true;
    this.setTexture(ART.alteredIdle);
    this.play("creeper-walk", true);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.2,
      duration: 120,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.setAlpha(1),
    });
  }

  get isFusing(): boolean {
    return this.fuseStartedAt >= 0;
  }

  /** true si este golpe lo ha matado. Muere sin explotar. */
  hit(amount: number, fromAngle: number): boolean {
    if (this.exploded) return false;
    this.hp -= amount;
    sparks(this.scene, this.x, this.y - this.displayHeight * 0.5, fromAngle, 0x6ec46e, 8);

    if (this.hp > 0) {
      audio.sfx.villagerHurt();
      return false;
    }

    // Abatido a tiempo: se deshincha en vez de estallar. Es la
    // recompensa por reaccionar rapido, y solo asi suelta botin: si
    // explota no queda nada que recoger.
    this.exploded = true;
    this.stopHiss();
    this.body.setEnable(false);
    this.onDeath?.(this.x, this.y);
    burstAt(this.scene, this.x, this.y - this.displayHeight * 0.5, 14, 0x6ec46e);
    this.scene.tweens.add({
      targets: this,
      scaleY: 0.1,
      scaleX: 0.95,
      alpha: 0,
      duration: 260,
      onComplete: () => this.destroy(),
    });
    return true;
  }

  private stopHiss(): void {
    this.hiss?.stop();
    this.hiss = null;
  }

  private detonate(onBlast: (x: number, y: number, radius: number) => void): void {
    if (this.exploded) return;
    this.exploded = true;
    this.stopHiss();
    this.body.setEnable(false);

    const x = this.x;
    const y = this.y - this.displayHeight * 0.4;

    // Suelta lo suyo aunque explote.
    //
    // Antes solo soltaba si lo abatias a tiempo, y en el tutorial eso
    // significaba que dejarlo estallar te dejaba esperando para siempre
    // un cafe que ya no iba a aparecer.
    this.onDeath?.(this.x, this.y);

    audio.sfx.creeperExplode();
    flash(this.scene, 0xdff5c0, 130);
    this.scene.cameras.main.shake(300, 0.012);
    impactRing(this.scene, x, y, 0x9bef4f, ENEMY.creeperBlastRadius);
    impactRing(this.scene, x, y, 0xdff5c0, ENEMY.creeperBlastRadius * 0.6);
    burstAt(this.scene, x, y, 30, 0x9bef4f);

    onBlast(x, y, ENEMY.creeperBlastRadius);
    this.destroy();
  }

  tick(
    target: Phaser.Physics.Arcade.Sprite,
    onBlast: (x: number, y: number, radius: number) => void,
  ): void {
    if (this.exploded || !this.body.enable) return;

    const now = this.scene.time.now;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

    // El siseo sube segun se acerca: es la mitad del susto.
    if (dist < ENEMY.creeperHissRange) {
      this.hiss ??= audio.startHiss();
      this.hiss.setIntensity(1 - dist / ENEMY.creeperHissRange);
    } else {
      this.stopHiss();
    }

    if (this.fuseStartedAt >= 0) {
      const t = (now - this.fuseStartedAt) / ENEMY.creeperFuseMs;
      // Hincha y parpadea. Se queda quieto: perseguir mientras explota
      // no dejaria escapar a nadie.
      this.setVelocityX(0);
      this.setScale(0.7 + t * 0.4, 0.7 + t * 0.32);
      this.setTintFill(Math.floor(t * 9) % 2 === 0 ? 0xffffff : 0x9bef4f);
      if (t >= 1) this.detonate(onBlast);
      return;
    }

    if (dist < ENEMY.creeperFuseRange) {
      this.fuseStartedAt = now;
      this.play(this.altered ? "creeper-altered-charge" : "creeper-charge", true);
      return;
    }

    // Acercamiento. Se da la vuelta ante un muro.
    const dx = target.x - this.x;
    if (Math.abs(dx) > 12) this.dir = dx > 0 ? 1 : -1;
    if (this.body.blocked.left) this.dir = 1;
    if (this.body.blocked.right) this.dir = -1;

    const speed = dist < ENEMY.creeperHissRange ? ENEMY.creeperSpeed * 1.6 : ENEMY.creeperSpeed;
    this.setVelocityX(this.dir * speed);
    this.setFlipX(this.dir === -1);

    // Salta muros y repisas. Sin esto se quedaban atascados contra el
    // primer escalon del pozo y no llegaban nunca.
    const onGround = this.body.blocked.down || this.body.touching.down;
    const wall = this.body.blocked.left || this.body.blocked.right;
    if (onGround && (wall || target.y < this.y - 70)) this.setVelocityY(-600);

    this.play("creeper-walk", true);
  }

  override destroy(fromScene?: boolean): void {
    this.stopHiss();
    super.destroy(fromScene);
  }
}
