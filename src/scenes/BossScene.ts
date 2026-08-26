import Phaser from "phaser";
import { reportProgress } from "@/systems/Api";
import { COFFEE, GAME_HEIGHT, GAME_WIDTH, HEALTH, TILE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { BOSS_TXT } from "@/config/strings";
import { CAT_ART, CELEBRATION, DOG, GUIDE, HERO_POSES, ITEM, WEAPON, heroKey, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import {
  clock,
  damage,
  DEFAULT_SKIN,
  getState,
  isCoffeeActive,
  refill,
  setState,
} from "@/systems/GameState";
import { Input } from "@/systems/Input";
import { buildTerrain, burstAt, type BuiltTerrain } from "@/systems/Terrain";
import { buildParallax, preloadParallax } from "@/systems/Parallax";
import { decorArtKeys, scatterDecor } from "@/systems/Decor";
import { LAIR_MAP } from "@/systems/levels/lair";
import { Player } from "@/entities/Player";
import { BulletPool } from "@/entities/Weapon";
import { Boss, BOSS, BOSS_ART, bossArtKeys } from "@/entities/Boss";
import { Onion, onionArtKeys } from "@/entities/Onion";
import { Guide } from "@/entities/Guide";
import { Cat } from "@/companions/Cat";
import { SceneGrade } from "@/ui/Grade";
import { Crosshair } from "@/ui/Crosshair";
import { coffeeRush, flash, impactRing } from "@/ui/Effects";
import { CoffeeAura, coffeeArtKeys } from "@/ui/CoffeeAura";
import { cardArtKeys, showCard } from "@/ui/Transition";
import { light, motes } from "@/ui/Atmosphere";
import { label as uiLabel, shadow, title as uiTitle } from "@/ui/text";
import type { HudScene } from "@/scenes/HudScene";

/**
 * La guarida.
 *
 * Un solo recinto y una sola pelea. La Otra Madre tira cebollas; el
 * chiste es que hay que esquivarlas, y el remate es que devolverlas de
 * un disparo es lo que la tumba.
 *
 * Se pelea sola de principio a fin. Antes, a media vida, aparecia un
 * totem que traia a Leon a descargar unos tiros y le quitaba a la jefa
 * un cuarto de la vida; se quito entero — la pelea se sostiene sin esa
 * ayuda y sin el rodeo de cruzar la sala a buscarlo.
 */
/**
 * Camara de la pelea.
 *
 * Empieza alejada y se aleja mas cuando la jefa se separa. Nunca se
 * acerca al nivel del resto del juego: aqui hace falta ver la sala
 * entera para leer por donde viene la embestida.
 */
const BOSS_CAM = {
  zoom: 0.78,
  minZoom: 0.5,
} as const;

export class BossScene extends Phaser.Scene {
  private player!: Player;
  private controls!: Input;
  private terrain!: BuiltTerrain;
  private bullets!: BulletPool;
  private crosshair!: Crosshair;
  private aura: CoffeeAura | null = null;
  private grade!: SceneGrade;
  private boss!: Boss;

  private onions: Onion[] = [];
  private guide!: Guide;
  private cat!: Cat;
  private webs: { x: number; y: number; radius: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private pickups!: Phaser.Physics.Arcade.Group;

  private hpBack!: Phaser.GameObjects.Rectangle;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpLabel!: Phaser.GameObjects.Text;


  private started = false;
  private finished = false;
  private slowUntil = 0;
  private spawn = { x: 0, y: 0 };

  constructor() {
    super(S.Boss);
  }

  /* ── Carga ───────────────────────────────────────────────────────── */

  preload(): void {
    const skin = getState().selectedHero ?? DEFAULT_SKIN;
    queue(this, [
      ...HERO_POSES.map((p) => heroKey(skin, p)),
      ...bossArtKeys(),
      ...onionArtKeys(),
      ...Object.values(DOG),
      ...Object.values(GUIDE),
      ...Object.values(CAT_ART),
      ITEM.cake,
      ITEM.icecream,
      ...Object.values(CELEBRATION),
      WEAPON.gun,
      WEAPON.gunFiring,
      ...["ground-top", "ground-fill", "stone", "breakable", "platform"].map(
        (t) => `tiles/lair/${t}`,
      ),
      ...decorArtKeys("lair"),
      ...coffeeArtKeys(),
      ...cardArtKeys(),
      ITEM.coffee,
    ]);
    preloadParallax(this, "lair");
  }

  /* ── Montaje ─────────────────────────────────────────────────────── */

  create(): void {
    this.onions = [];
    this.webs = [];
    this.started = false;
    this.finished = false;
    this.slowUntil = 0;

    setState({ checkpoint: S.Boss, hasFinalKey: false });

    this.cameras.main.fadeIn(900, 10, 2, 8);
    this.grade = new SceneGrade(this, "boss");
    void audio.playMusic("boss");
    // La cancion del final tiene que entrar clavada en el corte a las
    // letras, asi que se descarga desde que empieza la pelea.
    void audio.preloadTrack("finale");

    this.terrain = buildTerrain(this, LAIR_MAP, "lair");
    this.physics.world.setBounds(0, 0, this.terrain.widthPx, this.terrain.heightPx + 200);
    buildParallax(this, "lair", this.terrain.widthPx);
    scatterDecor(this, LAIR_MAP, "lair", {
      avoid: Object.values(this.terrain.markers).flat(),
    });

    this.lightUpLair();
    this.spawnPlayer();
    this.aura = new CoffeeAura(this);
    this.bullets = new BulletPool(this);
    this.spawnPickups();
    this.setupColliders();

    // Camara alejada, y NO pegada a la heroina.
    //
    // La Otra Madre vuela: siguiendo solo a la jugadora se salia de
    // cuadro por arriba cada vez que subia, y esquivar algo que no se
    // ve no es esquivar. La camara se coloca entre las dos y se aleja
    // lo que haga falta para que quepan siempre — es la unica forma de
    // que la pelea sea justa.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.terrain.widthPx, Math.max(GAME_HEIGHT, this.terrain.heightPx));
    cam.setZoom(BOSS_CAM.zoom);
    cam.centerOn(this.player.x, this.player.y - 90);

    if (!this.scene.isActive(S.Hud)) this.scene.launch(S.Hud);
    this.time.delayedCall(60, () => this.hud?.refresh());

    this.crosshair = new Crosshair(this);

    // Luna entra con ella, pero se va antes de que empiece la pelea:
    // esta no es su pelea y el guia lo dice en voz alta. Se marcha
    // durante la escena de apertura, no de golpe.
    this.cat = new Cat(this, this.player.x - 70, this.player.y - 20);
    this.physics.add.collider(this.cat, this.terrain.solids);
    this.physics.add.collider(this.cat, this.terrain.platforms);

    // A la altura de la cara, no en el techo: arriba del todo su globo
    // se salia de la pantalla y no se leia lo que decia.
    this.guide = new Guide(this, this.player.x + 170, this.player.y - 90);
    this.buildBossBar();
    this.spawnBoss();
    void this.openingScene();
  }

  private get hud(): HudScene | undefined {
    return this.scene.get(S.Hud) as HudScene | undefined;
  }

  /**
   * Mantiene a las dos en pantalla.
   *
   * La camara apunta al punto medio entre la heroina y la jefa, y se
   * aleja cuando se separan. Es la regla de la pelea: la Otra Madre
   * vuela, y tiene que verse SIEMPRE.
   */
  private frameBoth(): void {
    const cam = this.cameras.main;
    const alive = this.boss.active && !this.boss.isDead;

    const midX = alive ? (this.player.x + this.boss.x) / 2 : this.player.x;
    const midY = alive ? (this.player.y + this.boss.y) / 2 - 40 : this.player.y - 90;

    // Cuanto hay que abarcar, con un margen para que ninguna de las dos
    // quede pegada al borde.
    const spanX = alive ? Math.abs(this.player.x - this.boss.x) + 420 : GAME_WIDTH;
    const spanY = alive ? Math.abs(this.player.y - this.boss.y) + 340 : GAME_HEIGHT;

    // No alejarse mas de lo que da el mapa: pasado ese punto la vista
    // es mas grande que la arena y asoma el vacio por los bordes.
    const floor = Math.max(
      BOSS_CAM.minZoom,
      GAME_HEIGHT / Math.max(GAME_HEIGHT, this.terrain.heightPx),
      GAME_WIDTH / Math.max(GAME_WIDTH, this.terrain.widthPx),
    );

    const fit = Math.min(GAME_WIDTH / spanX, GAME_HEIGHT / spanY);
    const zoom = Phaser.Math.Clamp(fit, floor, BOSS_CAM.zoom);

    // Todo con suavizado: saltos de zoom en mitad de una esquiva marean.
    cam.setZoom(Phaser.Math.Linear(cam.zoom, zoom, 0.05));
    cam.centerOn(
      Phaser.Math.Linear(cam.midPoint.x, midX, 0.08),
      Phaser.Math.Linear(cam.midPoint.y, midY, 0.08),
    );
  }

  /** Luna se marcha por donde vinieron. */
  private catLeaves(): void {
    const away = this.cat.x - 420;
    this.tweens.add({
      targets: this.cat,
      x: away,
      alpha: 0,
      duration: 1400,
      ease: "Quad.easeIn",
      onComplete: () => this.cat.destroy(),
    });
  }

  private marker(symbol: string): { x: number; y: number } | undefined {
    return this.terrain.markers[symbol]?.[0];
  }

  private spawnPlayer(): void {
    const p = this.marker("P") ?? { x: 160, y: 300 };
    this.spawn = { x: p.x, y: p.y };
    this.player = new Player(this, p.x, p.y);
    this.controls = new Input(this);
    this.player.lockControls(true);
  }

  /**
   * En la guarida no hay vida: solo cafe.
   *
   * Antes la sala arrancaba con tortas repartidas, flotando y
   * parpadeando desde el primer segundo. Eran dos problemas en uno:
   * regalaban toda la vida antes de empezar, y el parpadeo llenaba la
   * pantalla de cosas moviendose justo cuando habia que mirar a la
   * jefa.
   *
   * Ahora la sala empieza vacia y va saliendo una taza de vez en
   * cuando, siempre DESPUES de que arranque la pelea. El cafe no cura:
   * da velocidad y cadencia, que es lo que hace falta aqui.
   */
  private spawnPickups(): void {
    this.pickups = this.physics.add.group();
  }

  /** Suelta una taza en un sitio libre de la sala. */
  private dropCoffee(): void {
    if (this.finished || !this.started) return;
    // Una sola a la vez, y ninguna mientras el boost sigue activo: dos
    // tazas en el suelo convierten la pelea en un pasillo de recogida.
    if (this.pickups.countActive(true) > 0 || isCoffeeActive()) return;

    const spots = this.terrain.markers.c ?? [];
    if (spots.length === 0) return;
    const m = spots[Math.floor(Math.random() * spots.length)]!;

    const s = this.physics.add.sprite(m.x, m.y, ITEM.coffee).setScale(0.42).setDepth(12);
    (s.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    s.setData("kind", "coffee");
    this.pickups.add(s);

    // Entra con un destello para que se vea aparecer: si sale sin mas,
    // en mitad de la pelea no se entera nadie.
    s.setAlpha(0).setScale(0.1);
    impactRing(this, m.x, m.y, 0xffcf6a, 90);
    this.tweens.add({
      targets: s,
      alpha: 1,
      scale: 0.42,
      duration: 320,
      ease: "Back.easeOut",
    });

    // Y a partir de ahi se queda QUIETA.
    //
    // Antes latia con un vaiven infinito, y en mitad de la pelea eso es
    // una cosa mas moviendose en pantalla justo cuando hay que mirar a
    // la jefa y a las cebollas. La taza se encuentra por el halo fijo
    // que tiene debajo, no por el meneo.
    const halo = this.add
      .circle(m.x, m.y, 30, 0xffcf6a, 0.22)
      .setDepth(11)
      .setBlendMode(Phaser.BlendModes.ADD);
    s.setData("halo", halo);
  }

  /**
   * Iluminacion de la guarida.
   *
   * El recinto estaba tan oscuro que no se distinguia el suelo del
   * fondo. Farolillos repartidos, brasas subiendo y — al fondo del
   * todo, donde solo lo ve quien mire — la silueta de Snoopy montando
   * guardia.
   */
  private lightUpLair(): void {
    const w = this.terrain.widthPx;
    const floor = this.terrain.heightPx - TILE * 2;

    // Farolillos colgados a lo largo del recinto.
    const lamps = 7;
    for (let i = 0; i < lamps; i++) {
      const x = (w * (i + 0.5)) / lamps;
      const y = floor - 190 - (i % 3) * 46;

      light(this, x, y, {
        color: i % 3 === 0 ? 0xff9a6a : 0xffd9a0,
        radius: 150 + (i % 3) * 40,
        intensity: 0.3,
      });

      // El propio farolillo: un punto brillante con su cordel.
      const cord = this.add
        .rectangle(x, y - 120, 1, 240, 0xffd9a0, 0.12)
        .setDepth(3);
      const bulb = this.add.circle(x, y, 4, 0xffe9c0, 0.85).setDepth(4);
      this.tweens.add({
        targets: [bulb, cord],
        alpha: 0.45,
        duration: 1200 + i * 140,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Charcos de luz en el suelo, para que se lea donde se pisa.
    for (let i = 0; i < 5; i++) {
      light(this, (w * (i + 0.5)) / 5, floor + 24, {
        color: 0xd88a70,
        radius: 210,
        intensity: 0.16,
      });
    }

    // Brasas subiendo.
    motes(this, { color: 0xffb478, count: 30, driftY: -22, scrollFactor: 0.35 });
    motes(this, { color: 0xd0a0ff, count: 14, driftY: -9, scrollFactor: 0.15, depth: 2 });

    this.snoopyCameos(w, floor);
  }

  /**
   * Snoopy, al fondo.
   *
   * Tres siluetas muy tenues y a distinto ritmo de parallax: no son
   * decorado del nivel, son un guiño para quien se pare a mirar.
   */
  private snoopyCameos(w: number, floor: number): void {
    const cameos: { x: number; y: number; art: string; scale: number; alpha: number }[] = [
      { x: w * 0.2, y: floor - 40, art: DOG.appear, scale: 0.62, alpha: 0.2 },
      { x: w * 0.55, y: floor - 150, art: DOG.dance, scale: 0.44, alpha: 0.16 },
      { x: w * 0.86, y: floor - 30, art: DOG.offer, scale: 0.66, alpha: 0.24 },
    ];

    cameos.forEach((c, i) => {
      const dog = this.add
        .image(c.x, c.y, c.art)
        .setOrigin(0.5, 1)
        .setScale(c.scale)
        .setAlpha(c.alpha)
        .setDepth(1)
        .setScrollFactor(0.55 + i * 0.12)
        .setTint(0x6a4a70);

      // Respira. Una silueta quieta se lee como una mancha del fondo.
      this.tweens.add({
        targets: dog,
        alpha: c.alpha * 1.9,
        duration: 2400 + i * 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: dog,
        scaleY: c.scale * 1.03,
        duration: 1700 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  private spawnBoss(): void {
    const m = this.marker("M") ?? { x: this.terrain.widthPx * 0.6, y: 300 };
    this.boss = new Boss(this, m.x, m.y + TILE / 2, {
      throwOnion: (x, y, tx, ty) => this.onions.push(new Onion(this, x, y, tx, ty)),
      castWeb: (x, y) => this.castWeb(x, y),
      onDamage: (hp, max) => this.updateBossBar(hp, max),
      onDeath: () => this.onBossDeath(),
    });
    // Ya no choca con nada: vuela por encima de la sala y solo baja
    // cuando embiste. Con colisiones se enganchaba en las repisas a
    // media caida y se quedaba colgada.
    this.boss.setFloor(m.y + TILE / 2);
  }

  private setupColliders(): void {
    const t = this.terrain;
    this.physics.add.collider(this.player, t.solids);
    this.physics.add.collider(this.player, t.platforms, undefined, () => !this.player.isDropping);

    // Las balas solo paran contra la roca. Con tres pisos de repisas,
    // que las frenaran hacia imposible acertarle desde otra altura.
    this.physics.add.collider(this.bullets.group, t.solids, (b) => {
      this.bullets.hit(b as Phaser.Physics.Arcade.Sprite);
    });

    // Solo cafe: aqui no se cura.
    this.physics.add.overlap(this.player, this.pickups, (_p, item) => {
      const s = item as Phaser.Physics.Arcade.Sprite;
      if (isCoffeeActive()) return;

      setState({ coffeeUntil: clock() + COFFEE.durationMs });
      audio.sfx.coffee();
      coffeeRush(this, s.x, s.y);
      this.hud?.refresh();
      burstAt(this, s.x, s.y, 12, 0xffcf6a);
      (s.getData("halo") as Phaser.GameObjects.Arc | undefined)?.destroy();
      s.destroy();
    });
  }

  /* ── Barra de vida de la jefa ────────────────────────────────────── */

  private buildBossBar(): void {
    // Abajo, no arriba: arriba ya viven el objetivo y los carteles del
    // HUD, y los tres juntos eran ilegibles.
    const w = 420;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT - 46;

    this.hpBack = this.add
      .rectangle(x, y, w, 12, 0x2a0a14, 0.85)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(8100)
      .setStrokeStyle(2, 0x7a2038, 0.9)
      .setAlpha(0);

    this.hpFill = this.add
      .rectangle(x + 2, y + 2, w - 4, 8, 0xc03050)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(8101)
      .setAlpha(0);

    this.hpLabel = shadow(
      this.add
        .text(GAME_WIDTH / 2, y - 22, BOSS_TXT.name, uiTitle(20, 0xf0c8d4))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(8102)
        .setAlpha(0),
    );
    this.hpLabel.setLetterSpacing(3);
  }

  private showBossBar(): void {
    this.tweens.add({
      targets: [this.hpBack, this.hpFill, this.hpLabel],
      alpha: 1,
      duration: 500,
    });
  }

  private updateBossBar(hp: number, max: number): void {
    this.tweens.add({
      targets: this.hpFill,
      displayWidth: Math.max(0, (416 * hp) / max),
      duration: 240,
      ease: "Quad.easeOut",
    });
    // Cuanto menos le queda, mas roja: se lee sin mirar el numero.
    this.hpFill.setFillStyle(hp / max < 0.34 ? 0xff4a5a : 0xc03050);
  }

  /* ── Guion ───────────────────────────────────────────────────────── */

  private async openingScene(): Promise<void> {
    // Primer plano de la cara antes de la pelea. Es lo unico que hace
    // este arte y merece salir una vez.
    const face = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BOSS_ART.idle[0]!)
      .setScrollFactor(0)
      .setDepth(8200)
      .setScale(0.9)
      .setAlpha(0);

    await this.tweenPromise(face, { alpha: 1, scale: 1.02 }, 700);
    audio.sfx.bossRoar();
    this.cameras.main.shake(500, 0.008);
    await this.wait(900);
    await this.tweenPromise(face, { alpha: 0, scale: 1.3 }, 600);
    face.destroy();

    await this.boss.rise();
    this.showBossBar();
    this.updateBossBar(BOSS.maxHp, BOSS.maxHp);

    // Itward habla con TODO parado: ni ella se mueve ni la jefa ataca.
    // Es el unico momento de calma de la pelea y se nota que es a
    // proposito.
    await this.guide.enter(this.player.x + 150, this.player.y - 90);
    await this.guide.say(BOSS_TXT.lunaLeaves);

    // Luna se va por donde vinieron.
    this.catLeaves();
    await this.wait(700);

    await this.guide.say(BOSS_TXT.beatHer);
    this.guide.hideBubble();
    await this.guide.leave();

    this.player.lockControls(false);
    this.started = true;

    // A partir de aqui, y solo a partir de aqui, van saliendo tazas.
    // La primera tarda: nadie necesita cafe en el primer segundo.
    this.time.addEvent({
      delay: 14000,
      startAt: 6000,
      loop: true,
      callback: () => this.dropCoffee(),
    });
    this.time.delayedCall(6800, () => this.hud?.setObjective("Devuélvele las cebollas"));

    // El aviso de las cebollas, en el sitio donde estorba menos.
    if (!getState().onionWarningShown) {
      setState({ onionWarningShown: true });
      this.hud?.announce(BOSS_TXT.onionWarn2, BOSS_TXT.onionWarn3, 3200, 0xc9e08a);
      // El consejo espera a que el cartel se retire: los dos a la vez
      // eran una pared de texto encima de la pelea.
      this.time.delayedCall(3600, () =>
        this.tip("Dispara a la cebolla para devolvérsela"),
      );
    }
  }

  /** Cartel de ayuda flotante, alto y fuera del camino. */
  private tip(text: string): void {
    const t = shadow(
      this.add
        .text(GAME_WIDTH / 2, 96, text, uiLabel(15, INK.bone))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(8102)
        .setAlpha(0),
    );
    this.tweens.add({ targets: t, alpha: 1, duration: 300 });
    this.time.delayedCall(5200, () =>
      this.tweens.add({ targets: t, alpha: 0, duration: 400, onComplete: () => t.destroy() }),
    );
  }

  /* ── Ataques ─────────────────────────────────────────────────────── */

  /**
   * Telaraña: ralentiza unos segundos, no quita vida.
   *
   * Se dibuja con hilos de verdad — radios y arcos — en vez de con un
   * circulo relleno. El circulo parecia una pompa de jabon y no se
   * entendia que era lo que frenaba.
   */
  private castWeb(x: number, y: number): void {
    const radius = 72;
    const gfx = this.add.graphics().setDepth(14).setAlpha(0);
    const spokes = 9;

    gfx.lineStyle(1.4, 0xece6f6, 0.5);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      gfx.beginPath();
      gfx.moveTo(x, y);
      gfx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      gfx.strokePath();
    }
    gfx.lineStyle(1.1, 0xd8d0e8, 0.38);
    for (const r of [radius * 0.35, radius * 0.62, radius * 0.9]) {
      gfx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        // Los hilos concentricos cuelgan un poco entre radio y radio.
        const sag = i % 2 === 0 ? 1 : 0.88;
        const px = x + Math.cos(a) * r * sag;
        const py = y + Math.sin(a) * r * sag;
        if (i === 0) gfx.moveTo(px, py);
        else gfx.lineTo(px, py);
      }
      gfx.strokePath();
    }

    const web = { x, y, radius, gfx };
    this.webs.push(web);
    this.tweens.add({ targets: gfx, alpha: 1, duration: 240 });

    this.time.delayedCall(5000, () => {
      this.tweens.add({
        targets: gfx,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          this.webs = this.webs.filter((w) => w !== web);
          gfx.destroy();
        },
      });
    });
  }

  private hurtPlayer(amount: number, fromX: number): void {
    if (this.finished) return;
    if (!this.player.takeHit(fromX)) return;
    const left = damage(amount);
    this.hud?.refresh();
    this.hud?.flashDamage();
    this.grade.pulse(0.2);
    if (left <= 0) this.die();
  }

  /* ── Final ───────────────────────────────────────────────────────── */

  /**
   * Victoria, aqui mismo.
   *
   * Sin cambio de escena: la Otra Madre cae, el esqueleto sale a decir
   * lo suyo y del techo empiezan a caer tortas, ramos de tulipanes y
   * helados. Cortar a una pantalla de victoria aparte enfriaba el
   * momento justo cuando mas caliente estaba.
   */
  private onBossDeath(): void {
    if (this.finished) return;
    this.finished = true;

    this.hud?.clearObjective();
    setState({ bossDefeated: true, diamondCollected: true });
    void reportProgress("boss");

    // La barra vacia colgada en pantalla queda como un resto del HUD.
    this.tweens.add({
      targets: [this.hpBack, this.hpFill, this.hpLabel],
      alpha: 0,
      duration: 700,
    });

    for (const o of this.onions) o.burst();
    this.onions = [];
    for (const w of this.webs) w.gfx.destroy();
    this.webs = [];

    // Clavada donde esta, no solo sin controles.
    //
    // A partir de aqui `update` sale por la primera linea, asi que ya no
    // se llama a `player.tick()` — y con el, ni `syncBody` (que recoloca
    // el cuerpo bajo los pies en cada fotograma) ni la red de seguridad
    // que la devuelve arriba si se sale del mapa. Entre las dos cosas la
    // heroina terminaba cayendose del mundo en plena celebracion.
    this.player.freeze();
    void this.celebrate();
  }

  private async celebrate(): Promise<void> {
    flash(this, 0xffe9a8, 900);
    audio.sfx.victory();

    // La musica de la pelea se corta EN SECO, un segundo de silencio, y
    // entonces entra la cancion del final.
    //
    // El silencio es el que hace el efecto: sin el, la cancion se
    // solapaba con la pista de la jefa en un fundido cruzado y el cambio
    // no se notaba. Y arrancandola aqui — y no dos pantallas mas
    // adelante — la cancion acompaña ya toda la celebracion, la carta y
    // todo el tramo final sin volver a empezar nunca (misma clave de
    // pista en todas esas escenas: `playMusic` no la reinicia).
    audio.stopMusic();
    this.time.delayedCall(1000, () => void audio.playMusic("finale"));

    this.grade.to("victory", 1400);
    this.cameras.main.shake(400, 0.006);

    await this.wait(900);

    this.hud?.announce("¡GANASTE!", "", 3200, INK.gold);
    // La lluvia de tortas, tulipanes y helado se queda: es el premio.
    this.rain();

    // Y ya no habla nadie.
    //
    // Aqui el guia soltaba tres frases de felicitacion. Se quitaron: lo
    // que viene despues son las laminas, y llegar a ellas leyendo texto
    // le roba el golpe al corte con la cancion.
    await this.wait(3400);

    this.scene.stop(S.Hud);

    // La carta del jefe cierra la pelea, todavia en silencio.
    // Aqui NO se baja el volumen, y es la unica carta que se libra.
    //
    // La cancion del final acaba de entrar hace unos segundos, despues
    // del silencio que sigue a la pelea. Agacharla justo ahora se oiria
    // como que algo va mal con el audio: es su momento de arrancar, no
    // de apartarse. Los efectos del corte si suenan, como en todas.
    await showCard(this, "boss", { holdMs: 2200, skippable: false, duckAudio: false });

    this.cameras.main.fadeOut(600, 8, 6, 14);
    this.time.delayedCall(700, () => this.scene.start(S.Finale));
  }

  /**
   * Lluvia de celebracion.
   *
   * Tortas de chocolate, ramos de tulipanes morados y el helado
   * celeste, cayendo sin parar. Es lo unico que se ve en pantalla y
   * tiene que notarse.
   */
  private rain(): void {
    const arts = [
      ITEM.cake,
      ITEM.cake,
      CELEBRATION.bouquet,
      CELEBRATION.tulipPink,
      CELEBRATION.tulipYellow,
      ITEM.icecream,
      CELEBRATION.icecream,
      CELEBRATION.petals,
    ];

    this.time.addEvent({
      delay: 110,
      loop: true,
      callback: () => {
        const cam = this.cameras.main;
        const x = cam.scrollX + Math.random() * GAME_WIDTH;
        const art = arts[Math.floor(Math.random() * arts.length)]!;
        const p = this.add
          .image(x, cam.scrollY - 60, art)
          .setScale(0.22 + Math.random() * 0.28)
          .setDepth(60);

        this.tweens.add({
          targets: p,
          y: cam.scrollY + GAME_HEIGHT + 80,
          x: x + (Math.random() - 0.5) * 190,
          angle: (Math.random() - 0.5) * 620,
          duration: 2600 + Math.random() * 2200,
          ease: "Quad.easeIn",
          onComplete: () => p.destroy(),
        });
      },
    });
  }

  private die(): void {
    if (this.finished) return;
    this.finished = true;
    audio.sfx.die();

    // La torta se rellena ANTES de reiniciar, igual que en los niveles.
    //
    // Sin esto la pelea volvia a empezar con la vida a cero: el primer
    // golpe la mataba otra vez y no habia forma de salir del bucle mas
    // que recargando la pagina. Los niveles ya lo hacian; a la guarida
    // se le habia quedado sin poner.
    refill();
    this.hud?.refresh();

    this.cameras.main.fadeOut(700, 40, 4, 20);
    this.time.delayedCall(800, () => this.scene.restart());
  }

  /* ── Bucle ───────────────────────────────────────────────────────── */

  override update(_time: number, delta: number): void {
    if (this.finished) return;

    // La telaraña ralentiza: se comprueba antes de mover.
    const caught = this.webs.some(
      (w) => Phaser.Math.Distance.Between(this.player.x, this.player.y, w.x, w.y) < w.radius,
    );
    if (caught) this.slowUntil = this.time.now + 260;
    const slowed = this.time.now < this.slowUntil;

    this.player.tick(this.controls, slowed ? delta * 0.45 : delta);
    this.aura?.tick(this.player.x, this.player.y, delta);
    if (slowed) this.player.setVelocityX(this.player.body.velocity.x * 0.45);

    if (this.started) {
      if (this.controls.wantsShoot && this.player.weapon.canFire(this.time.now)) {
        this.player.weapon.fire(this.time.now);
        this.crosshair.kick();
        const m = this.player.weapon.muzzle();
        this.bullets.fire(m.x, m.y, this.player.weapon.aimAngle);
      }
    }
    if (this.controls.justPressed("m")) audio.setMuted(!audio.isMuted);

    if (this.started && !this.boss.isDead) {
      this.boss.tick(this.player, () => this.hurtPlayer(BOSS.contactDamage, this.boss.x));

    }

    // Luna solo acompaña, y solo hasta que se marcha.
    if (this.cat.active) this.cat.tick(this.player, [], [], () => undefined);

    // El guia solo esta en la escena de apertura y en la de victoria.
    this.guide.tick(delta);

    this.frameBoth();

    this.tickBullets();
    this.tickOnions();

    if (this.player.y > this.terrain.heightPx + 120) {
      this.player.respawnAt(this.spawn.x, this.spawn.y - 40);
    }
  }

  /** Las balas hieren a la jefa y devuelven cebollas. */
  private tickBullets(): void {
    for (const obj of this.bullets.group.getChildren()) {
      const b = obj as Phaser.Physics.Arcade.Sprite;
      if (!b.active) continue;

      // Cebolla en el aire: un roce basta para devolverla. La hitbox es
      // generosa porque acertarle es la gracia, no el reto.
      for (const o of this.onions) {
        if (!o.active || o.isReturned) continue;
        if (Phaser.Math.Distance.Between(b.x, b.y, o.x, o.y) > 46) continue;
        o.reflect(this.boss.x, this.boss.y - this.boss.displayHeight * 0.55);
        this.bullets.hit(b);
        break;
      }

      if (!b.active || this.boss.isDead) continue;
      if (Phaser.Geom.Rectangle.Overlaps(b.getBounds(), this.boss.getBounds())) {
        this.bullets.hit(b);
        this.boss.hit(BOSS.bulletDamage, false);
      }
    }
  }

  private tickOnions(): void {
    this.onions = this.onions.filter((o) => o.active);

    for (const o of this.onions) {
      // Fuera de la arena: se recoge sola.
      if (o.x < -60 || o.x > this.terrain.widthPx + 60 || o.y < -60 || o.y > this.terrain.heightPx + 60) {
        o.burst();
        continue;
      }

      if (o.isReturned) {
        if (this.boss.isDead) continue;
        if (Phaser.Geom.Rectangle.Overlaps(o.getBounds(), this.boss.getBounds())) {
          o.burst();
          this.boss.hit(BOSS.onionDamage, true);
        }
        continue;
      }

      if (Phaser.Math.Distance.Between(o.x, o.y, this.player.x, this.player.y - 34) < 44) {
        o.burst();
        this.hurtPlayer(HEALTH.villagerDamage, o.x);
      }
    }
  }

  /* ── Utilidades de guion ─────────────────────────────────────────── */

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private tweenPromise(
    target: Phaser.GameObjects.GameObject,
    props: Record<string, number>,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ targets: target, ...props, duration, onComplete: () => resolve() });
    });
  }
}
