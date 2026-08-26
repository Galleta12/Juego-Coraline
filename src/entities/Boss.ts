import Phaser from "phaser";
import { audio } from "@/systems/AudioSystem";
import { burstAt } from "@/systems/Terrain";
import { flash, hitStop, impactRing, sparks } from "@/ui/Effects";

/**
 * La Otra Madre.
 *
 * Ahora VUELA. No pisa el suelo en toda la pelea: se queda flotando por
 * encima de la guarida y baja solo para embestir. Antes caminaba y
 * saltaba, y una arana de tres metros andando de un lado a otro se
 * leia como un enemigo grande, no como algo de lo que huir.
 *
 * Tiene exactamente dos ataques, y los dos se ven venir:
 *
 *   * **Embestida.** Se prepara arriba, cierra las piernas en punta y
 *     se deja caer en diagonal hacia donde este la jugadora. Se esquiva
 *     apartandose cuando marca el sitio.
 *   * **Cebollas.** Abre la boca — mucho — y escupe cebollas en tanda.
 *     Se pueden devolver a tiros, que es de donde sale el dano de
 *     verdad.
 *
 * La vida es alta a proposito: la pelea anterior se acababa en menos de
 * medio minuto y es el climax del juego.
 */

export const BOSS_ART = {
  /** Flotando en el sitio: el aleteo lento de las patas. */
  idle: ["boss/float-1", "boss/float-2", "boss/float-3", "boss/float-4", "boss/float-5"],
  /** Desplazandose por el aire, inclinada hacia delante. */
  fly: ["boss/fly-1", "boss/fly-2", "boss/fly-3", "boss/fly-4"],
  /** La embestida: prepara, junta las patas, cae, impacta. */
  dive: ["boss/dive-1", "boss/dive-2", "boss/dive-3", "boss/dive-4"],
  /** Abre la boca y escupe. */
  spit: ["boss/spit-1", "boss/spit-2", "boss/spit-3", "boss/spit-4", "boss/spit-5"],
  /** Se desploma. */
  death: [
    "boss/death-1",
    "boss/death-2",
    "boss/death-3",
    "boss/death-4",
    "boss/death-5",
  ],
} as const;

export const bossArtKeys = (): string[] => [
  ...BOSS_ART.idle,
  ...BOSS_ART.fly,
  ...BOSS_ART.dive,
  ...BOSS_ART.spit,
  ...BOSS_ART.death,
];

export const BOSS = {
  /**
   * Vida total, repartida en cuatro cuartos.
   *
   * Del 4/4 al 2/4 pelea sola la jugadora. En la mitad aparece el totem
   * y Leon se lleva un cuarto. El ultimo cuarto vuelve a ser suyo.
   *
   * Subida de 40 a 72: con la vida vieja se moria en veinte segundos y
   * ni daba tiempo a ver los dos ataques.
   */
  maxHp: 72,
  bulletDamage: 1,
  /** Una cebolla devuelta vale por cinco balas: premia el riesgo. */
  onionDamage: 5,
  scale: 0.42,
  /**
   * Lo rapido que se coloca flotando de un sitio a otro.
   *
   * Subida: a 190 se dejaba adelantar andando y nunca llegaba a estar
   * encima de nadie. Ahora persigue de verdad.
   */
  flySpeed: 280,
  /** A que altura sobre el suelo se queda planeando. */
  hoverY: 150,
  /**
   * Espera entre ataques.
   *
   * Bajada de 900 a 520. Con la pausa larga la pelea era un turno suyo
   * y un turno tuyo, y daba tiempo a caminar tranquilamente fuera de
   * cualquier peligro: no llegaba a tocar ni una vez.
   */
  restMs: 520,
  contactDamage: 1,
  /**
   * Aviso antes de soltar cada cebolla, y antes de dejarse caer.
   *
   * Se acortan, pero NO se quitan: el aviso es lo que separa "dificil"
   * de "injusto". Sigue habiendo tiempo de apartarse, solo que ahora
   * hay que estar mirando.
   */
  onionTelegraphMs: 420,
  diveTelegraphMs: 520,
} as const;

type Mode = "rising" | "hover" | "reposition" | "windup" | "diving" | "recover" | "spit" | "hurt" | "dead";

export interface BossHooks {
  /** Lanza una cebolla desde la boca. */
  throwOnion(x: number, y: number, targetX: number, targetY: number): void;
  /** Telaraña: ralentiza sin quitar vida. */
  castWeb(x: number, y: number): void;
  onDamage(hpLeft: number, maxHp: number): void;
  onDeath(): void;
}

export class Boss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  private hp: number = BOSS.maxHp;
  private mode: Mode = "rising";
  private nextActionAt = 0;
  private facing: 1 | -1 = -1;
  private readonly backlight: Phaser.GameObjects.Ellipse;

  /** A donde va flotando ahora mismo. */
  private goal = { x: 0, y: 0 };
  /** Altura del suelo de la sala, para no bajar mas de la cuenta. */
  private floorY: number;
  private bob = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly hooks: BossHooks,
  ) {
    super(scene, x, y, BOSS_ART.idle[0]);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.floorY = y;
    this.goal = { x, y: y - BOSS.hoverY };

    this.setOrigin(0.5, 1).setScale(BOSS.scale).setDepth(17);
    // Hitbox generosa hacia dentro: el arte tiene mucho aire alrededor
    // y con el cuerpo completo se cobraban golpes que no tocaban nada.
    this.body.setSize(this.width * 0.38, this.height * 0.72);
    this.body.setOffset(this.width * 0.31, this.height * 0.28);
    // Vuela: ni gravedad ni suelo. Se mueve a mano en `tick`.
    this.body.setAllowGravity(false);
    this.body.setCollideWorldBounds(false);

    // Contraluz.
    //
    // El arte de la jefa no es oscuro de por si, pero la gradacion de la
    // guarida y la viñeta se la comen en cuanto se acerca a un borde de
    // la pantalla. Un halo detras la despega del fondo siempre.
    this.backlight = scene.add
      .ellipse(x, y, this.displayWidth * 0.9, this.displayHeight * 0.9, 0x8a1030, 0.3)
      .setOrigin(0.5, 0.72)
      .setDepth(16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    scene.tweens.add({
      targets: this.backlight,
      scaleX: 1.1,
      scaleY: 1.08,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.followBacklight, this);

    this.registerAnimations();
    this.setAlpha(0);
  }

  private followBacklight(): void {
    if (!this.active) return;
    this.backlight.setPosition(this.x, this.y).setAlpha(this.alpha * 0.55);
  }

  private registerAnimations(): void {
    const a = this.scene.anims;
    const make = (key: string, keys: readonly string[], rate: number, repeat: number) => {
      if (a.exists(key)) return;
      const frames = keys.filter((k) => this.scene.textures.exists(k));
      if (frames.length === 0) return;
      a.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: rate, repeat });
    };

    make("boss-idle", BOSS_ART.idle, 6, -1);
    make("boss-fly", BOSS_ART.fly, 9, -1);
    make("boss-rise", BOSS_ART.idle, 7, 0);
    // Embestida: los dos primeros son la preparacion, los dos ultimos
    // la caida en punta y el impacto.
    make("boss-windup", [BOSS_ART.dive[0]!], 1, -1);
    make("boss-spear", [BOSS_ART.dive[0]!, BOSS_ART.dive[1]!], 11, 0);
    make("boss-drop", [BOSS_ART.dive[2]!], 1, -1);
    make("boss-impact", [BOSS_ART.dive[3]!], 1, 0);
    make("boss-mouth", BOSS_ART.spit, 10, 0);
    make("boss-death", BOSS_ART.death, 7, 0);
    make("boss-hurt", [BOSS_ART.idle[1] ?? BOSS_ART.idle[0]!], 1, 0);
  }

  get isDead(): boolean {
    return this.mode === "dead";
  }

  get health(): number {
    return this.hp;
  }

  /** Entrada: sube desde el suelo y se queda flotando. */
  rise(): Promise<void> {
    return new Promise((resolve) => {
      this.setAlpha(0);
      audio.sfx.bossRoar();
      this.play("boss-rise", true);
      this.scene.tweens.add({
        targets: this,
        alpha: 1,
        y: this.floorY - BOSS.hoverY,
        duration: 1500,
        ease: "Cubic.easeOut",
        onComplete: () => {
          this.play("boss-idle", true);
          this.mode = "hover";
          this.nextActionAt = this.scene.time.now + BOSS.restMs;
          resolve();
        },
      });
    });
  }

  hit(amount: number, byOnion: boolean): void {
    if (this.mode === "dead") return;
    this.hp = Math.max(0, this.hp - amount);
    this.hooks.onDamage(this.hp, BOSS.maxHp);

    const cx = this.x;
    const cy = this.y - this.displayHeight * 0.5;

    if (byOnion) {
      // Devolverle una cebolla es el golpe bueno y tiene que sentirse.
      flash(this.scene, 0xe4f2c0, 150);
      hitStop(this.scene, 90);
      impactRing(this.scene, cx, cy, 0xc9e08a, 130);
      burstAt(this.scene, cx, cy, 22, 0xc9e08a);
      audio.sfx.bossHurt();
      // Un empujon hacia arriba: se nota que le ha dolido.
      this.goal.y = Math.max(this.floorY - BOSS.hoverY * 1.6, this.goal.y - 40);
      this.mode = "hurt";
      this.play("boss-hurt", true);
      this.nextActionAt = this.scene.time.now + 420;
    } else {
      sparks(this.scene, cx, cy, this.facing === 1 ? 0 : Math.PI, 0xff6a8a, 8);
      this.setTintFill(0xffdada);
      this.scene.time.delayedCall(60, () => {
        if (this.active) this.clearTint();
      });
    }

    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.mode = "dead";
    this.setVelocity(0, 0);
    this.body.enable = false;
    this.setScale(BOSS.scale);
    this.play("boss-death", true);
    audio.sfx.bossRoar();

    // Se desploma: ya no vuela.
    this.scene.tweens.add({
      targets: this,
      y: this.floorY,
      angle: 18,
      duration: 900,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.scene.cameras.main.shake(420, 0.014);
        burstAt(this.scene, this.x, this.y - this.displayHeight * 0.5, 34, 0xff6a8a);
        this.scene.tweens.add({
          targets: [this, this.backlight],
          alpha: 0,
          scaleY: BOSS.scale * 0.7,
          duration: 900,
          onComplete: () => this.hooks.onDeath(),
        });
      },
    });
  }

  tick(target: Phaser.Physics.Arcade.Sprite, onContact: () => void): void {
    if (this.mode === "dead" || this.mode === "rising") return;

    const now = this.scene.time.now;
    const dx = target.x - this.x;

    // Solo la caida de la embestida hace dano de contacto. Antes se
    // comprobaba en cualquier modo, y como en "recover" se queda quieta
    // pegada al suelo — la ventana pensada para dispararle SIN riesgo —
    // acercarse a rematarla a tiros ya contaba como toque y quitaba vida
    // sola, sin que hubiera embestido nada.
    if (this.mode === "diving" && Math.abs(dx) < 70 && Math.abs(target.y - this.y) < 120) {
      onContact();
    }

    if (this.mode !== "diving") {
      this.facing = dx > 0 ? 1 : -1;
      this.setFlipX(this.facing === -1);
    }

    switch (this.mode) {
      case "hurt":
        this.drift(0.5);
        if (now > this.nextActionAt) this.toHover(now);
        return;

      case "recover":
        this.drift(0.7);
        if (now > this.nextActionAt) this.toHover(now);
        return;

      case "windup":
        // Se acerca de verdad a donde va a caer: a 0.25 se quedaba tan
        // atras que la embestida caia lejos de la marca y jamas tocaba.
        this.drift(0.5);
        return;

      case "spit":
        // Aqui si se queda casi quieta: no necesita desplazarse para
        // escupir, y es lo que hace que se pueda leer lo que va a pasar.
        this.drift(0.25);
        return;

      case "diving":
        // Cae libre hasta tocar la altura del suelo.
        if (this.y >= this.floorY - 6) this.landDive();
        return;

      case "reposition":
        this.drift(1);
        if (now > this.nextActionAt || this.closeToGoal()) this.toHover(now);
        return;

      case "hover":
      default:
        // Mientras espera, NO se queda parada: se coloca encima de la
        // jugadora. Antes flotaba en su sitio y bastaba con andar a la
        // otra punta de la sala para que no pasara nada.
        // Fuera del alcance de contacto (70px): si se quedaba a 60,
        // planear cerca ya contaba como toque y quitaba vida sola,
        // sin que hubiera embestido ni escupido nada.
        this.goal.x = target.x + (this.facing === 1 ? -110 : 110);
        this.goal.y = this.floorY - BOSS.hoverY - Math.sin(this.bob * 0.4) * 30;
        this.drift(1);

        if (now < this.nextActionAt) return;
        // Solo dos ataques, alternando con algo de azar. Las cebollas
        // salen mas cuando le queda poca vida: la pelea se acelera.
        if (Math.random() < (this.hp <= BOSS.maxHp * 0.5 ? 0.58 : 0.45)) {
          this.startSpit(target);
        } else {
          this.startDive(target);
        }
    }
  }

  /** Vuelve a planear y se coloca en un sitio nuevo. */
  private toHover(now: number): void {
    this.mode = "hover";
    this.play("boss-idle", true);
    this.setAngle(0);
    this.nextActionAt = now + BOSS.restMs;
  }

  private closeToGoal(): boolean {
    return Phaser.Math.Distance.Between(this.x, this.y, this.goal.x, this.goal.y) < 30;
  }

  /**
   * Movimiento de vuelo.
   *
   * Se acerca a su objetivo sin llegar nunca del todo y ondea arriba y
   * abajo. Sin el ondeo se quedaba clavada en el aire y parecia pegada
   * con chinchetas.
   */
  private drift(speedScale: number): void {
    this.bob += 0.02;
    const goalY = this.goal.y + Math.sin(this.bob) * 14;

    const vx = (this.goal.x - this.x) * 1.6 * speedScale;
    const vy = (goalY - this.y) * 1.9 * speedScale;
    this.setVelocity(
      Phaser.Math.Clamp(vx, -BOSS.flySpeed, BOSS.flySpeed),
      Phaser.Math.Clamp(vy, -BOSS.flySpeed, BOSS.flySpeed),
    );

    if (Math.abs(vx) > 60) this.play("boss-fly", true);
    else this.play("boss-idle", true);
  }

  /**
   * Embestida.
   *
   * Se coloca ENCIMA de la jugadora, marca el sitio con una sombra en
   * el suelo, y solo entonces se deja caer. La sombra es lo que hace
   * que sea esquivable: sin ella caeria del cielo sin aviso.
   */
  private startDive(target: Phaser.Physics.Arcade.Sprite): void {
    this.mode = "windup";
    this.play("boss-windup", true);
    audio.sfx.bossRoar();

    // Apunta a donde ESTARA, no a donde esta.
    //
    // Adelantando un poco segun su velocidad, la embestida cae encima
    // de quien sigue corriendo. Antes marcaba el sitio exacto y bastaba
    // con no pararse nunca para que no acertara jamas.
    const body = target.body as Phaser.Physics.Arcade.Body | undefined;
    const lead = body ? Phaser.Math.Clamp(body.velocity.x * 0.28, -140, 140) : 0;
    const aimX = target.x + lead;
    this.goal = { x: aimX, y: this.floorY - BOSS.hoverY * 1.5 };

    // Sombra creciente donde va a caer.
    const mark = this.scene.add
      .ellipse(aimX, this.floorY - 4, 40, 14, 0xff6a8a, 0.5)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: mark,
      scaleX: 3.2,
      scaleY: 2.4,
      alpha: 0.85,
      duration: BOSS.diveTelegraphMs,
      onComplete: () => mark.destroy(),
    });

    this.scene.time.delayedCall(BOSS.diveTelegraphMs, () => {
      if (this.mode !== "windup") return;
      this.play("boss-spear", true);
      audio.sfx.bossSlam();

      // Cae en vertical desde donde este, en punta.
      this.scene.time.delayedCall(180, () => {
        if (this.mode !== "windup") return;
        this.mode = "diving";
        this.play("boss-drop", true);
        this.setVelocity(0, 1150);
      });
    });
  }

  private landDive(): void {
    this.mode = "recover";
    this.setVelocity(0, 0);
    this.setY(this.floorY);
    this.play("boss-impact", true);

    audio.sfx.bossSlam();
    this.scene.cameras.main.shake(340, 0.013);
    impactRing(this.scene, this.x, this.y, 0xff6a8a, 170);
    burstAt(this.scene, this.x, this.y, 22, 0x8a3a52);

    // Se queda un momento clavada en el suelo: es la ventana para
    // dispararle sin riesgo, y es lo que hace la pelea justa.
    this.goal = { x: this.x, y: this.floorY - BOSS.hoverY };
    this.nextActionAt = this.scene.time.now + 620;
  }

  /**
   * Boca de cebollas.
   *
   * Abre la boca entera y escupe una tanda. Cada cebolla se anuncia
   * antes de salir; se pueden esquivar y, mejor todavia, devolver.
   */
  private startSpit(target: Phaser.Physics.Arcade.Sprite): void {
    this.mode = "spit";
    this.play("boss-mouth", true);
    audio.sfx.bossRoar();

    const shots = this.hp <= BOSS.maxHp * 0.5 ? 4 : 3;
    this.nextActionAt = this.scene.time.now + BOSS.restMs + shots * 520;

    for (let i = 0; i < shots; i++) {
      const at = 320 + i * 520;
      const mouth = () => ({
        x: this.x + this.facing * this.displayWidth * 0.18,
        y: this.y - this.displayHeight * 0.66,
      });

      this.scene.time.delayedCall(at, () => {
        if (this.mode !== "spit") return;
        const m = mouth();
        this.telegraph(m.x, m.y);
      });
      this.scene.time.delayedCall(at + BOSS.onionTelegraphMs, () => {
        if (this.mode !== "spit") return;
        const m = mouth();
        this.hooks.throwOnion(m.x, m.y, target.x, target.y - 40);
      });
    }

    this.scene.time.delayedCall(320 + shots * 520, () => {
      if (this.mode === "spit") this.toHover(this.scene.time.now);
    });
  }

  /**
   * Aviso de cebolla.
   *
   * Un destello que se hincha en la boca, con su sonido. Es lo que
   * convierte el ataque en algo que se puede esquivar en vez de en algo
   * que simplemente pasa.
   */
  private telegraph(x: number, y: number): void {
    audio.sfx.onionCharge();
    const warn = this.scene.add
      .circle(x, y, 6, 0xc9e08a, 0.8)
      .setDepth(23)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: warn,
      radius: 26,
      alpha: 0,
      duration: BOSS.onionTelegraphMs,
      ease: "Quad.easeOut",
      onUpdate: () => warn.setRadius(warn.radius),
      onComplete: () => warn.destroy(),
    });
  }

  /** La sala le dice donde esta el suelo, para calcular su altura. */
  setFloor(y: number): void {
    this.floorY = y;
    this.goal.y = y - BOSS.hoverY;
  }

  override destroy(fromScene?: boolean): void {
    this.scene?.events.off(Phaser.Scenes.Events.UPDATE, this.followBacklight, this);
    this.backlight.destroy();
    super.destroy(fromScene);
  }
}
