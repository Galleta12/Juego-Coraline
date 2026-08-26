import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, TILE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { TRUE_MISSION } from "@/config/strings";
import { CAT_ART, GUIDE, HERO_POSES, ITEM, heroKey, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { DEFAULT_SKIN, getState, setState } from "@/systems/GameState";
import { Input } from "@/systems/Input";
import { buildTerrain, burstAt, type BuiltTerrain } from "@/systems/Terrain";
import { buildParallax, preloadParallax } from "@/systems/Parallax";
import { DOORS_MAP } from "@/systems/levels/doors";
import { Player } from "@/entities/Player";
import { Guide } from "@/entities/Guide";
import { creeperArtKeys } from "@/entities/Creeper";
import { Cat } from "@/companions/Cat";
import { SceneGrade } from "@/ui/Grade";
import { light, motes } from "@/ui/Atmosphere";
import { flash, impactRing } from "@/ui/Effects";
import { label, shadow, title } from "@/ui/text";

/**
 * La pregunta de verdad.
 *
 * Todo el juego existe por esta sala. Dos puertas, una pregunta, y se
 * responde caminando: pulsar un boton habria sido responder un
 * formulario, y andar hasta una puerta es tomar una decision.
 *
 * El orden importa. Si va derecha al SÍ, el guia la para: hay que
 * asomarse al NO primero. El remate del juego esta detras de esa
 * puerta, y un remate que se puede saltar no es un remate.
 */
export class TrueMissionScene extends Phaser.Scene {
  private player!: Player;
  private controls!: Input;
  private terrain!: BuiltTerrain;
  private guide!: Guide;
  private cat!: Cat;

  private yesDoor!: Phaser.GameObjects.Image;
  private noDoor: Phaser.GameObjects.Image | null = null;
  private yesTag!: Phaser.GameObjects.Text;
  private noTag: Phaser.GameObjects.Text | null = null;

  private triedNo = false;
  private busy = true;
  private done = false;

  constructor() {
    super(S.TrueMission);
  }

  preload(): void {
    const skin = getState().selectedHero ?? DEFAULT_SKIN;
    queue(this, [
      ...HERO_POSES.map((p) => heroKey(skin, p)),
      ...Object.values(GUIDE),
      ...Object.values(CAT_ART),
      ...creeperArtKeys(),
      ITEM.door,
      ...["ground-top", "ground-fill", "stone", "breakable", "platform"].map(
        (t) => `tiles/lair/${t}`,
      ),
    ]);
    preloadParallax(this, "lair");
  }

  create(): void {
    this.triedNo = false;
    this.busy = true;
    this.done = false;
    this.noDoor = null;
    this.noTag = null;

    this.cameras.main.fadeIn(900, 8, 6, 14);
    new SceneGrade(this, "trueMission");
    void audio.playMusic("finale");
    setState({ checkpoint: S.TrueMission });

    this.terrain = buildTerrain(this, DOORS_MAP, "lair");
    this.physics.world.setBounds(0, 0, this.terrain.widthPx, this.terrain.heightPx);
    buildParallax(this, "lair", this.terrain.widthPx);

    // Una sola pantalla: la camara no se mueve, se ve la sala entera.
    this.cameras.main.setBounds(0, 0, this.terrain.widthPx, this.terrain.heightPx);
    this.cameras.main.centerOn(this.terrain.widthPx / 2, this.terrain.heightPx / 2);

    this.spawnPlayer();
    this.buildDoors();
    this.ambience();

    this.cat = new Cat(this, this.player.x - 80, this.player.y - 20);
    this.physics.add.collider(this.cat, this.terrain.solids);

    // El guia flota a media altura, no arriba del todo: ahi arriba su
    // globo se salia de la pantalla y no se leia lo que decia.
    this.guide = new Guide(this, this.terrain.widthPx - 150, this.player.y - 150);

    void this.intro();
  }

  private marker(symbol: string): { x: number; y: number } | undefined {
    return this.terrain.markers[symbol]?.[0];
  }

  private spawnPlayer(): void {
    const p = this.marker("P") ?? { x: 460, y: 260 };
    this.player = new Player(this, p.x, p.y);
    this.controls = new Input(this);
    this.player.lockControls(true);
    this.player.weapon.setVisible(false);
    this.physics.add.collider(this.player, this.terrain.solids);
  }

  private buildDoors(): void {
    const y = this.marker("P")?.y ?? 260;

    const make = (x: number, text: string, color: number) => {
      const door = this.add
        .image(x, y + TILE / 2, ITEM.door)
        .setOrigin(0.5, 1)
        .setScale(2.1)
        .setDepth(8);

      const tag = shadow(
        this.add
          .text(x, y - door.displayHeight - 18, text, title(30, color))
          .setOrigin(0.5)
          .setDepth(30),
      );
      tag.setLetterSpacing(5);

      light(this, x, y - 90, { color, radius: 190, intensity: 0.3 });
      return { door, tag };
    };

    const yes = make(this.marker("Y")?.x ?? 300, TRUE_MISSION.yes, 0x8ee08e);
    this.yesDoor = yes.door;
    this.yesTag = yes.tag;

    const no = make(this.marker("N")?.x ?? 640, TRUE_MISSION.no, 0xe0708a);
    this.noDoor = no.door;
    this.noTag = no.tag;
  }

  private ambience(): void {
    motes(this, { color: 0xd8c8ff, count: 20, driftY: -12, scrollFactor: 0.2 });
  }

  /* ── Guion ───────────────────────────────────────────────────────── */

  private async intro(): Promise<void> {
    const heading = shadow(
      this.add
        .text(GAME_WIDTH / 2, 46, TRUE_MISSION.title, label(14, INK.boneDim))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(40)
        .setAlpha(0),
    );
    heading.setLetterSpacing(6);
    this.tweens.add({ targets: heading, alpha: 1, duration: 700 });

    await this.wait(900);

    const question = shadow(
      this.add
        .text(GAME_WIDTH / 2, 108, TRUE_MISSION.question, title(30, INK.diamond))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(40)
        .setWordWrapWidth(720, true)
        .setAlign("center")
        .setAlpha(0),
    );
    this.tweens.add({
      targets: question,
      alpha: 1,
      y: 100,
      duration: 800,
      ease: "Cubic.easeOut",
    });
    audio.sfx.uiConfirm();

    await this.wait(1400);

    const hint = shadow(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, TRUE_MISSION.hint, label(15, INK.bone))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(40)
        .setAlpha(0),
    );
    this.tweens.add({ targets: hint, alpha: 1, duration: 500 });

    this.player.lockControls(false);
    this.busy = false;
  }

  /**
   * Se acerca al SÍ sin haber visto el NO.
   *
   * No es por castigar: el chiste del NO es el final del juego, y
   * dejar que se lo salte seria tirar el remate a la basura.
   */
  private async blockYes(): Promise<void> {
    this.busy = true;
    setState({ guideBlockedYes: true });

    audio.sfx.uiDeny();
    this.player.lockControls(true);
    // La empuja un paso atras: se nota que la puerta no la deja pasar.
    this.player.setVelocityX(this.player.x < this.yesDoor.x ? -180 : 180);
    this.tweens.add({
      targets: this.yesDoor,
      x: this.yesDoor.x + 8,
      duration: 60,
      yoyo: true,
      repeat: 3,
    });

    await this.guide.enter(this.player.x + 130, this.player.y - 140);
    await this.guide.say(TRUE_MISSION.blockHey);
    await this.guide.say(TRUE_MISSION.blockFirst);
    await this.guide.say(TRUE_MISSION.blockKnow);
    this.guide.hideBubble();

    // Y señala el NO, por si acaso.
    if (this.noTag) {
      this.tweens.add({
        targets: this.noTag,
        scale: 1.3,
        duration: 340,
        yoyo: true,
        repeat: 2,
      });
    }

    this.player.lockControls(false);
    this.busy = false;
  }

  /** El NO. Dura poco. */
  private async openNo(): Promise<void> {
    if (this.triedNo || !this.noDoor) return;
    this.busy = true;
    this.triedNo = true;
    setState({ triedNo: true });

    this.player.lockControls(true);
    audio.sfx.door();

    // La puerta se abre. Y de dentro no sale nada bueno.
    this.tweens.add({
      targets: this.noDoor,
      scaleX: 2.4,
      alpha: 0.75,
      duration: 500,
    });
    const dark = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(500);
    this.tweens.add({ targets: dark, fillAlpha: 0.55, duration: 600 });

    await this.wait(500);

    // El siseo antes que la imagen: se oye venir.
    const hiss = audio.startHiss();
    hiss.setIntensity(0.4);

    const creeper = this.add
      .sprite(this.noDoor.x, this.noDoor.y, "enemies/creeper/idle")
      .setOrigin(0.5, 1)
      .setScale(0.66)
      .setDepth(510);
    if (!this.anims.exists("creeper-walk")) {
      this.anims.create({
        key: "creeper-walk",
        frames: ["enemies/creeper/walk-1", "enemies/creeper/walk-2", "enemies/creeper/walk-3"].map(
          (k) => ({ key: k }),
        ),
        frameRate: 8,
        repeat: -1,
      });
    }
    creeper.play("creeper-walk");

    // Camina hacia la jugadora mientras el siseo sube.
    await this.tweenPromise(creeper, { x: this.player.x + 90 }, 1500, (t) =>
      hiss.setIntensity(0.4 + t * 0.6),
    );

    creeper.setTexture("enemies/creeper/charge");
    await this.tweenPromise(creeper, { scaleX: 0.95, scaleY: 0.86 }, 650);

    hiss.stop();
    audio.sfx.creeperExplode();
    flash(this, 0xdff5c0, 220);
    this.cameras.main.shake(500, 0.016);
    impactRing(this, creeper.x, creeper.y - 40, 0x9bef4f, 250);
    burstAt(this, creeper.x, creeper.y - 40, 30, 0x9bef4f);
    creeper.destroy();

    // Y se lleva la puerta del NO por delante.
    const gone = this.noDoor;
    const goneTag = this.noTag;
    this.noDoor = null;
    this.noTag = null;
    this.tweens.add({
      targets: [gone, goneTag],
      alpha: 0,
      angle: 26,
      y: gone.y + 30,
      duration: 520,
      onComplete: () => {
        gone.destroy();
        goneTag?.destroy();
      },
    });

    await this.wait(500);
    this.tweens.add({
      targets: dark,
      fillAlpha: 0,
      duration: 800,
      onComplete: () => dark.destroy(),
    });

    await this.guide.enter(this.player.x + 130, this.player.y - 140);
    await this.guide.say(TRUE_MISSION.laugh);
    await this.guide.say(TRUE_MISSION.unavailable);
    await this.guide.say(TRUE_MISSION.tough);
    await this.guide.say(TRUE_MISSION.shame);
    this.guide.hideBubble();

    // Queda una sola puerta. No hay nada mas que decidir.
    this.tweens.add({
      targets: [this.yesDoor, this.yesTag],
      scale: "*=1.12",
      duration: 600,
      ease: "Back.easeOut",
    });

    this.player.lockControls(false);
    this.busy = false;
  }

  /** El SÍ, ya de verdad. */
  private async acceptYes(): Promise<void> {
    this.busy = true;
    this.done = true;
    setState({ acceptedMission: true });

    audio.sfx.uiConfirm();
    this.player.lockControls(true);
    flash(this, INK.diamond, 320);
    burstAt(this, this.yesDoor.x, this.yesDoor.y - 60, 24, INK.gold);

    await this.guide.enter(this.player.x + 130, this.player.y - 140);
    await this.guide.say(TRUE_MISSION.accepted);
    await this.guide.say(TRUE_MISSION.cool);
    this.guide.hideBubble();

    // Entra por la puerta.
    this.tweens.add({
      targets: this.player,
      x: this.yesDoor.x,
      alpha: 0,
      duration: 700,
    });
    audio.sfx.door();

    this.cameras.main.fadeOut(900, 8, 6, 14);
    this.time.delayedCall(1000, () => this.scene.start(S.Schedule));
  }

  /* ── Bucle ───────────────────────────────────────────────────────── */

  override update(_time: number, delta: number): void {
    if (this.done) return;

    this.player.tick(this.controls, delta);
    this.cat.tick(this.player, [], [], () => undefined);
    this.guide.follow(this.player.x, this.player.y, this.terrain.widthPx);
    this.guide.tick(delta);

    if (this.busy) return;

    const near = (x: number): boolean => Math.abs(this.player.x - x) < 56;

    if (this.noDoor && near(this.noDoor.x)) {
      void this.openNo();
      return;
    }

    if (near(this.yesDoor.x)) {
      if (this.triedNo) void this.acceptYes();
      else void this.blockYes();
    }
  }

  /* ── Utilidades ──────────────────────────────────────────────────── */

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }

  private tweenPromise(
    target: Phaser.GameObjects.GameObject,
    props: Record<string, number>,
    duration: number,
    onProgress?: (t: number) => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        targets: target,
        ...props,
        duration,
        onUpdate: (tween) => onProgress?.(tween.progress),
        onComplete: () => resolve(),
      });
    });
  }
}
