import Phaser from "phaser";
import { COFFEE, PLAYER } from "@/config/game";
import { WEAPON } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { isCoffeeActive } from "@/systems/GameState";
import { BULLET_TEX, buildBullet } from "@/ui/Grade";
import { impactRing, sparks } from "@/ui/Effects";

/**
 * Donde esta la empunadura dentro del sprite, en fraccion 0..1.
 *
 * Medido sobre el arte del pack: la masa de la mitad inferior esta en el
 * lado izquierdo, que es el mango colgando. O sea que el canon apunta a
 * la DERECHA y el angulo 0 ya es correcto sin darle media vuelta.
 */
const GRIP_X = 0.26;
const GRIP_Y = 0.56;

/** Suavizado del giro. Mas bajo = mas pesada, mas alto = mas nerviosa. */
const AIM_SMOOTHING = 0.28;

/**
 * La pistola Monster.
 *
 * Es un sprite aparte del cuerpo, anclado a la altura de las manos y
 * rotado hacia el puntero. Un sprite de disparo estatico no sirve: la
 * jugadora tiene que ver que apunta a donde mira el raton, tambien
 * mientras corre, salta o cae.
 */
export class Weapon {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private lastShotAt = -Infinity;
  private recoil = 0;
  private angle = 0;

  constructor(private readonly scene: Phaser.Scene) {
    // El arte del pack apunta a la IZQUIERDA. Se voltea de base para que
    // el angulo 0 signifique "apuntando a la derecha", que es lo que
    // espera el resto del codigo. Sin esto el arma salia girada 180.
    this.sprite = scene.add
      .image(0, 0, WEAPON.gun)
      .setScale(0.42)
      // El origen va en la empunadura, no en el centro: es el punto
      // sobre el que debe girar el arma.
      .setOrigin(GRIP_X, GRIP_Y)
      .setDepth(21)
      .setVisible(false);

    this.flash = scene.add
      .image(0, 0, WEAPON.gunFiring)
      .setScale(0.42)
      .setOrigin(GRIP_X, GRIP_Y)
      .setDepth(22)
      .setVisible(false);
  }

  setVisible(v: boolean): void {
    this.sprite.setVisible(v);
    if (!v) this.flash.setVisible(false);
  }

  get aimAngle(): number {
    return this.angle;
  }

  /** Punta del canon, de donde sale el disparo y el fogonazo. */
  muzzle(): { x: number; y: number } {
    const len = this.sprite.displayWidth * (1 - GRIP_X) * 0.92;
    return {
      x: this.sprite.x + Math.cos(this.angle) * len,
      y: this.sprite.y + Math.sin(this.angle) * len,
    };
  }

  /**
   * Coloca el arma en las manos y la orienta al puntero.
   *
   * El giro se interpola en vez de saltar al angulo exacto: seguir al
   * raton al instante se siente rigido y hace temblar el arma con
   * cualquier microdesplazamiento del cursor. Apuntando a la izquierda
   * se voltea en Y para que el arma no quede boca abajo.
   */
  aim(handX: number, handY: number, targetX: number, targetY: number): void {
    const target = Phaser.Math.Angle.Between(handX, handY, targetX, targetY);
    // RotateTo respeta el camino corto: sin esto, cruzar el eje daria
    // una vuelta completa en el sentido equivocado.
    this.angle = Phaser.Math.Angle.RotateTo(
      this.angle,
      target,
      AIM_SMOOTHING * Math.PI,
    );

    // El retroceso empuja el arma hacia atras un instante.
    this.recoil = Math.max(0, this.recoil - 0.9);
    const back = this.recoil;

    const x = handX - Math.cos(this.angle) * back;
    const y = handY - Math.sin(this.angle) * back;
    const aimingLeft = Math.cos(this.angle) < 0;

    this.sprite.setPosition(x, y).setRotation(this.angle).setFlipY(aimingLeft);
    this.flash.setPosition(x, y).setRotation(this.angle).setFlipY(aimingLeft);
  }

  /** ¿Puede disparar ya? Depende de la cadencia y del cafe. */
  canFire(now: number): boolean {
    const rate = isCoffeeActive()
      ? PLAYER.fireRateMs * COFFEE.fireRateMultiplier
      : PLAYER.fireRateMs;
    return now - this.lastShotAt >= rate;
  }

  fire(now: number): void {
    this.lastShotAt = now;
    this.recoil = 7;
    audio.sfx.gunShot();

    this.flash.setVisible(true).setAlpha(1);
    this.scene.tweens.add({
      targets: this.flash,
      alpha: 0,
      duration: 90,
      onComplete: () => this.flash.setVisible(false),
    });

    const m = this.muzzle();
    for (let i = 0; i < 5; i++) {
      const p = this.scene.add
        .circle(m.x, m.y, 2 + Math.random() * 2, 0x8bd94a, 0.9)
        .setDepth(23);
      const spread = this.angle + (Math.random() - 0.5) * 1.1;
      const dist = 14 + Math.random() * 26;
      this.scene.tweens.add({
        targets: p,
        x: m.x + Math.cos(spread) * dist,
        y: m.y + Math.sin(spread) * dist,
        alpha: 0,
        duration: 200 + Math.random() * 160,
        onComplete: () => p.destroy(),
      });
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.flash.destroy();
  }
}

const BULLET_SPEED = 720;
const BULLET_LIFE_MS = 1400;

/**
 * Proyectil Monster. Verde, rapido y con estela: tiene que verse a donde
 * fue el disparo aunque falle.
 */
export class BulletPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(private readonly scene: Phaser.Scene) {
    buildBullet(scene);
    // defaultKey no es opcional: sin el, get() crea sprites sin textura
    // ni cuerpo utilizable y los disparos no llegan a existir.
    this.group = scene.physics.add.group({
      defaultKey: BULLET_TEX,
      allowGravity: false,
      maxSize: 48,
    });
  }

  fire(x: number, y: number, angle: number): void {
    const b = this.group.get(x, y, BULLET_TEX) as Phaser.Physics.Arcade.Sprite | null;
    if (!b) return;

    b.setActive(true).setVisible(true).setDepth(20);
    b.setScale(0.9).setRotation(angle).clearTint();
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setSize(12, 8, true);
    b.setPosition(x, y);
    this.scene.physics.velocityFromRotation(angle, BULLET_SPEED, body.velocity);

    b.setData(
      "expires",
      this.scene.time.delayedCall(BULLET_LIFE_MS, () => this.recycle(b)),
    );
  }

  recycle(b: Phaser.Physics.Arcade.Sprite): void {
    const timer = b.getData("expires") as Phaser.Time.TimerEvent | undefined;
    timer?.remove();
    b.setActive(false).setVisible(false);

    const body = b.body as Phaser.Physics.Arcade.Body;
    body.stop();
    // Y se apaga el cuerpo, no solo el sprite.
    //
    // `setActive(false)` esconde el objeto pero Arcade sigue mirando su
    // cuerpo: la bala gastada seguia solapando al enemigo un frame tras
    // otro y le descontaba vida cada vez. Con dos puntos de vida, morian
    // de un solo disparo.
    body.enable = false;
  }

  /** Impacto: recicla el proyectil y deja chispas. */
  hit(b: Phaser.Physics.Arcade.Sprite): void {
    const { x, y } = b;
    const angle = b.rotation;
    this.recycle(b);
    audio.sfx.projectileHit();
    impactRing(this.scene, x, y, 0x9bef4f, 26);
    sparks(this.scene, x, y, angle, 0xd6ff8a, 8);
    for (let i = 0; i < 6; i++) {
      const p = this.scene.add
        .circle(x, y, 2 + Math.random() * 2, 0x9bef4f, 0.9)
        .setDepth(24);
      const a = Math.random() * Math.PI * 2;
      const d = 10 + Math.random() * 24;
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        duration: 240,
        onComplete: () => p.destroy(),
      });
    }
  }
}
