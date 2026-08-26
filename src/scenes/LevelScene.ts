import Phaser from "phaser";
import { reportProgress } from "@/systems/Api";
import type { ProgressEvent } from "@shared/contracts";
import { COFFEE, GAME_HEIGHT, GAME_WIDTH, HEALTH, TILE } from "@/config/game";
import { GRADES, INK } from "@/config/palette";
import { S, type SceneKey } from "@/config/scenes";
import { CAT_ART, GUIDE, HERO_POSES, ITEM, WEAPON, heroKey, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import {
  clock,
  damage,
  DEFAULT_SKIN,
  getState,
  heal,
  isCoffeeActive,
  refill,
  setState,
} from "@/systems/GameState";
import { Input } from "@/systems/Input";
import {
  buildTerrain,
  burstAt,
  groundYAt,
  hitBreakable,
  type BuiltTerrain,
  type SceneKind,
} from "@/systems/Terrain";
import {
  buildParallax,
  preloadParallax,
  type Parallax,
  type ParallaxScene,
} from "@/systems/Parallax";
import { decorArtKeys, scatterDecor } from "@/systems/Decor";
import { Player } from "@/entities/Player";
import { BulletPool } from "@/entities/Weapon";
import { Guide } from "@/entities/Guide";
import { Villager, villagerArtKeys, type VillagerVariant } from "@/entities/Villager";
import { Creeper, creeperArtKeys } from "@/entities/Creeper";
import { Cat } from "@/companions/Cat";
import { SceneGrade } from "@/ui/Grade";
import { Crosshair } from "@/ui/Crosshair";
import { coffeeRush, dust, flash, impactRing } from "@/ui/Effects";
import { motes } from "@/ui/Atmosphere";
import { cardArtKeys, showCard, type CardKey } from "@/ui/Transition";
import { CoffeeAura, coffeeArtKeys } from "@/ui/CoffeeAura";
import { Dog } from "@/companions/Dog";
import { label as uiLabel, shadow } from "@/ui/text";
import type { HudScene } from "@/scenes/HudScene";

/**
 * Base de los niveles de plataformas.
 *
 * Bosque y tunel comparten casi todo: terreno por tiles, aldeanos,
 * creepers, Luna detras, una llave al fondo y una puerta que la pide.
 * Lo que cambia es el mapa, el ambiente y el guion, y eso es justo lo
 * que declara cada subclase.
 *
 * Se escribio asi despues de tener el bosque entero: duplicarlo para el
 * tunel habria significado arreglar cada fallo dos veces.
 */

export interface LevelConfig {
  /** Dibujo ASCII del nivel. */
  map: readonly string[];
  /** Familia de tiles. */
  kind: SceneKind;
  /** Pack de fondos del parallax. */
  parallax: ParallaxScene;
  grade: keyof typeof GRADES;
  music: string;
  /** A donde se sale por la puerta. */
  next: SceneKey;
  objective: string;
  /** Texto del cartel al conseguir la llave. */
  keyGot: string;
  backObjective: string;
  /** Luna acompaña en este nivel. */
  withCat: boolean;
  /** El guia flota detras durante todo el nivel. */
  withGuide: boolean;
  /** Pista del nivel siguiente, para tenerla lista antes del corte. */
  nextMusic?: string;
  /** Precargar tambien los fondos alterados. */
  withAltered: boolean;
  /** Carta de transicion que se ensena al terminar el nivel. */
  card?: CardKey;
  /** Hito que se avisa por correo al salir por la puerta. */
  progress?: ProgressEvent;
}

type LootKind = "cake" | "coffee";

const DOOR_LOCKED = "Te falta la llave";
const DOOR_OPEN = "Pulsa  E  para abrir la puerta";

export abstract class LevelScene extends Phaser.Scene {
  protected player!: Player;
  protected controls!: Input;
  protected terrain!: BuiltTerrain;
  protected bullets!: BulletPool;
  protected guide!: Guide;
  protected cat: Cat | null = null;
  protected crosshair!: Crosshair;
  protected aura: CoffeeAura | null = null;
  protected parallax!: Parallax;
  protected grade!: SceneGrade;

  protected villagers: Villager[] = [];
  protected creepers: Creeper[] = [];
  protected pickups!: Phaser.Physics.Arcade.Group;

  /** Botin ya posado en el suelo, esperando a que lo recojan. */
  private loot: {
    sprite: Phaser.GameObjects.Image;
    kind: LootKind;
    halo: Phaser.GameObjects.Arc;
  }[] = [];

  protected door: Phaser.GameObjects.Image | null = null;
  protected keySprite: Phaser.GameObjects.Image | null = null;
  private keyGlow: Phaser.GameObjects.Arc | null = null;
  private doorHint: Phaser.GameObjects.Text | null = null;

  protected gotKey = false;
  protected finished = false;
  protected spawn = { x: 0, y: 0 };
  /**
   * Los enemigos duermen los primeros segundos.
   *
   * Sin esto el primer aldeano ya venia corriendo mientras el guia
   * hablaba, y la partida empezaba recibiendo golpes.
   */
  private wakeAt = 0;

  constructor(
    key: SceneKey,
    protected readonly config: LevelConfig,
  ) {
    super(key);
  }

  /* ── Carga ───────────────────────────────────────────────────────── */

  preload(): void {
    const skin = getState().selectedHero ?? DEFAULT_SKIN;
    queue(this, [
      ...HERO_POSES.map((p) => heroKey(skin, p)),
      ...Object.values(GUIDE),
      ...Object.values(CAT_ART),
      ...villagerArtKeys(),
      ...creeperArtKeys(),
      ITEM.cake,
      ITEM.coffee,
      ITEM.key,
      ITEM.door,
      ITEM.pill,
      ITEM.can,
      WEAPON.gun,
      WEAPON.gunFiring,
      ...["ground-top", "ground-fill", "stone", "breakable", "platform"].map(
        (t) => `tiles/${this.config.kind}/${t}`,
      ),
      ...decorArtKeys(this.config.kind),
      ...coffeeArtKeys(),
      ...cardArtKeys(),
    ]);
    preloadParallax(this, this.config.parallax, this.config.withAltered);
    this.preloadExtra();
  }

  /** Arte propio de la subclase. */
  protected preloadExtra(): void {}

  /* ── Montaje ─────────────────────────────────────────────────────── */

  create(): void {
    this.villagers = [];
    this.creepers = [];
    this.loot = [];
    this.gotKey = false;
    this.finished = false;
    this.door = null;
    this.keySprite = null;
    this.keyGlow = null;
    this.doorHint = null;
    this.cat = null;

    this.wakeAt = this.time.now + 3500;

    setState({ checkpoint: this.scene.key as SceneKey, hasKey: false, hasFinalKey: false });

    this.cameras.main.fadeIn(700, 8, 6, 14);
    this.grade = new SceneGrade(this, this.config.grade);
    void audio.playMusic(this.config.music);
    if (this.config.nextMusic) void audio.preloadTrack(this.config.nextMusic);

    this.terrain = buildTerrain(this, this.config.map, this.config.kind);
    this.physics.world.setBounds(0, 0, this.terrain.widthPx, this.terrain.heightPx + 200);
    this.parallax = buildParallax(this, this.config.parallax, this.terrain.widthPx);
    this.decorate();

    this.spawnPlayer();
    this.aura = new CoffeeAura(this);
    this.bullets = new BulletPool(this);
    this.spawnEnemies();
    this.spawnPickups();
    this.setupColliders();
    this.setupCamera();

    if (!this.scene.isActive(S.Hud)) this.scene.launch(S.Hud);
    this.time.delayedCall(60, () => {
      this.hud?.refresh();
      this.hud?.setObjective(this.config.objective);
    });

    this.crosshair = new Crosshair(this);
    this.ambience();

    if (this.config.withCat) {
      // A la derecha y sobre suelo firme: pegada al muro izquierdo se
      // pasaba el arranque chocando y saltando para desatascarse.
      this.cat = new Cat(this, this.player.x + 70, this.player.y - 20);
      this.physics.add.collider(this.cat, this.terrain.solids);
      this.physics.add.collider(this.cat, this.terrain.platforms);
    }

    this.guide = new Guide(this, this.player.x + 160, this.player.y - 170);
    void this.intro();
    this.onCreated();
  }

  /**
   * Adornos por el nivel.
   *
   * Se dejan libres los sitios marcados en el mapa — inicio, llave,
   * puerta, enemigos — porque un arbol delante de la puerta la esconde
   * y el nivel deja de leerse.
   */
  private decorate(): void {
    const avoid = Object.values(this.terrain.markers).flat();
    scatterDecor(this, this.config.map, this.config.kind, { avoid });
  }

  /**
   * Motas de polvo flotando.
   *
   * Un nivel donde solo se mueve la jugadora parece una ilustracion
   * quieta. Esto no cuesta nada y hace que el aire tenga cuerpo.
   */
  protected ambience(): void {
    motes(this, { color: 0xd8c8ff, count: 22, driftY: -14, scrollFactor: 0.25 });
    motes(this, { color: 0xffe0b0, count: 10, driftY: -26, scrollFactor: 0.45, depth: 6 });
  }

  /** Guion de apertura. */
  protected abstract intro(): Promise<void>;

  /** Enganche para montar lo propio de cada nivel. */
  protected onCreated(): void {}

  protected get hud(): HudScene | undefined {
    return this.scene.get(S.Hud) as HudScene | undefined;
  }

  protected marker(symbol: string): { x: number; y: number } | undefined {
    return this.terrain.markers[symbol]?.[0];
  }

  protected markers(symbol: string): { x: number; y: number }[] {
    return this.terrain.markers[symbol] ?? [];
  }

  private spawnPlayer(): void {
    const p = this.marker("P") ?? { x: 120, y: 300 };
    this.spawn = { x: p.x, y: p.y };
    this.player = new Player(this, p.x, p.y);
    this.controls = new Input(this);
  }

  protected addVillager(x: number, y: number, variant: VillagerVariant = "normal"): Villager {
    const v = new Villager(this, x, y, variant);
    v.onDeath = (dx, dy) => this.dropLoot(dx, dy);
    this.bindEnemy(v);
    this.villagers.push(v);
    return v;
  }

  protected addCreeper(x: number, y: number, altered = false): Creeper {
    const c = new Creeper(this, x, y, altered);
    c.onDeath = (dx, dy) => this.dropLoot(dx, dy);
    this.bindEnemy(c);
    this.creepers.push(c);
    return c;
  }

  /**
   * Botin de un enemigo caido.
   *
   * Es la unica fuente de torta y de cafe del nivel: antes estaban
   * sembrados por el mapa y no habia razon para pelear.
   *
   * Cae en arco, sin fisica. Con gravedad y rebote el objeto se hundia
   * en el tile y acababa colandose por debajo del mapa; asi se calcula
   * donde esta el suelo y se anima el salto, y siempre aterriza donde se
   * ve.
   */
  protected dropLoot(x: number, y: number): void {
    // Cuatro de cada cinco son torta: cura, mientras que el cafe solo
    // acelera. A partes iguales acabas sin forma de recuperarte.
    const isCake = Math.random() < 0.8;
    const kind: LootKind = isCake ? "cake" : "coffee";

    // Un paso al lado, para que no se recoja sola al morir el enemigo
    // pegado a la jugadora.
    const away = x >= this.player.x ? 1 : -1;
    const gap = Math.max(0, 120 - Math.abs(x - this.player.x));
    const dropX = Phaser.Math.Clamp(x + away * gap, 40, this.terrain.widthPx - 40);
    const landY = (groundYAt(this.terrain, dropX, y - 40) ?? y) - 18;

    const sprite = this.add
      .image(x, y - 30, isCake ? ITEM.cake : ITEM.coffee)
      .setScale(0.4)
      .setDepth(26);

    const halo = this.add
      .circle(dropX, landY, 26, isCake ? INK.cake : INK.gold, 0)
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({ targets: sprite, x: dropX, duration: 560, ease: "Sine.easeOut" });
    this.tweens.add({ targets: sprite, angle: 360, duration: 560 });
    this.tweens.chain({
      targets: sprite,
      tweens: [
        { y: y - 110, duration: 230, ease: "Quad.easeOut" },
        { y: landY, duration: 330, ease: "Quad.easeIn" },
      ],
      onComplete: () => {
        sprite.setAngle(0);
        dust(this, dropX, landY + 12, 5);
        this.tweens.add({ targets: halo, fillAlpha: 0.22, duration: 300 });
        this.loot.push({ sprite, kind, halo });
      },
    });

    // No se queda ahi para siempre: a los 18 s se disuelve.
    this.time.delayedCall(18_000, () => {
      const entry = this.loot.find((l) => l.sprite === sprite);
      if (!entry) return;
      this.loot = this.loot.filter((l) => l !== entry);
      this.tweens.add({
        targets: [sprite, halo],
        alpha: 0,
        duration: 800,
        onComplete: () => {
          sprite.destroy();
          halo.destroy();
        },
      });
    });
  }

  /** Recoge por cercania lo que ya esta posado en el suelo. */
  private pickUpLoot(): void {
    const st = getState();

    for (const l of [...this.loot]) {
      if (Math.abs(this.player.x - l.sprite.x) > 44) continue;
      if (Math.abs(this.player.y - l.sprite.y) > 86) continue;
      if (l.kind === "cake" && st.cake >= st.maxCake) continue;
      // Un cafe a la vez. Si ya hay boost, la taza se queda donde esta
      // y hay que volver a por ella cuando se acabe — recogerla ahora
      // solo serviria para desperdiciarla.
      if (l.kind === "coffee" && isCoffeeActive()) continue;

      this.loot = this.loot.filter((o) => o !== l);
      burstAt(this, l.sprite.x, l.sprite.y, 12, INK.gold);
      l.sprite.destroy();
      l.halo.destroy();

      if (l.kind === "cake") {
        heal(1);
        audio.sfx.cake();
        this.hud?.flashHeal();
      } else {
        setState({ coffeeUntil: clock() + COFFEE.durationMs });
        audio.sfx.coffee();
        coffeeRush(this, this.player.x, this.player.y - 40);
        void new Dog(this).deliver(this.player.x + 90, this.player.y);
      }
      this.hud?.refresh();
    }
  }

  private bindEnemy(e: Phaser.Physics.Arcade.Sprite): void {
    this.physics.add.collider(e, this.terrain.solids);
    this.physics.add.collider(e, this.terrain.breakables);
    this.physics.add.collider(e, this.terrain.platforms);
    // Ojo con el orden: cuando Phaser cruza un grupo con un sprite
    // suelto invierte los argumentos del callback, asi que hay que
    // mirar cual de los dos es el enemigo en vez de darlo por hecho.
    this.physics.add.overlap(this.bullets.group, e, (a, b) => {
      const enemy = (a === e ? a : b) as Villager | Creeper;
      const bullet = (a === e ? b : a) as Phaser.Physics.Arcade.Sprite;
      const body = bullet.body as Phaser.Physics.Arcade.Body | null;
      const angle = body ? Math.atan2(body.velocity.y, body.velocity.x) : 0;
      this.bullets.hit(bullet);
      enemy.hit(1, angle);
    });
  }

  private spawnEnemies(): void {
    for (const m of this.markers("v")) this.addVillager(m.x, m.y + TILE / 2);
    for (const m of this.markers("V")) {
      // Los "altos" son el mismo aldeano un poco mas grande: variedad
      // visual sin pedir arte nuevo.
      this.addVillager(m.x, m.y + TILE / 2).setScale(0.9);
    }
    for (const m of this.markers("x")) this.addCreeper(m.x, m.y + TILE / 2);
  }

  private spawnPickups(): void {
    this.pickups = this.physics.add.group();

    const add = (symbol: string, texture: string, scale: number, kind: string) => {
      for (const m of this.markers(symbol)) {
        const s = this.physics.add.sprite(m.x, m.y, texture).setScale(scale).setDepth(12);
        (s.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        s.setData("kind", kind);
        this.pickups.add(s);
      }
    };

    // Solo lo que el mapa marque a mano. La torta y el cafe ya no se
    // siembran por el nivel: los sueltan los enemigos al caer, que da
    // un motivo para pelear en vez de para esquivar.
    add("c", ITEM.cake, 0.4, "cake");
    add("f", ITEM.coffee, 0.4, "coffee");

    const k = this.marker("k");
    if (k) {
      this.keySprite = this.add.image(k.x, k.y, ITEM.key).setScale(0.46).setDepth(11);
      // Halo fijo. El latido constante de todos los objetos a la vez
      // llenaba la pantalla de parpadeos.
      this.keyGlow = this.add
        .circle(k.x, k.y, 30, INK.gold, 0.26)
        .setDepth(10)
        .setBlendMode(Phaser.BlendModes.ADD);
      // Un haz fino hacia arriba: se ve desde lejos y no parpadea.
      this.add
        .rectangle(k.x, k.y - 130, 3, 260, INK.gold, 0.1)
        .setDepth(9)
        .setBlendMode(Phaser.BlendModes.ADD);
    }

    const d = this.marker("D");
    if (d) {
      // El arte de la puerta mide 73x80: a escala 1 pasa por cuadro
      // colgado. Tiene que ser mas alta que la heroina para leerse.
      this.door = this.add
        .image(d.x, d.y + TILE / 2, ITEM.door)
        .setOrigin(0.5, 1)
        .setScale(1.9)
        .setDepth(8);
      // Apagada hasta que aparezca la llave.
      this.door.setTint(0x6a6480);
    }
  }

  private setupColliders(): void {
    const t = this.terrain;

    this.physics.add.collider(this.player, t.solids);
    this.physics.add.collider(this.player, t.breakables);
    this.physics.add.collider(this.player, t.platforms, undefined, () => !this.player.isDropping);

    // Las balas chocan con la roca, pero NO con las repisas: son finas y
    // atravesables, y no poder disparar de un piso a otro convertia cada
    // tiro en un ensayo de posicion.
    this.physics.add.collider(this.bullets.group, t.solids, (b) => {
      this.bullets.hit(b as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.collider(this.bullets.group, t.breakables, (b, block) => {
      this.bullets.hit(b as Phaser.Physics.Arcade.Sprite);
      hitBreakable(this, t, block as never);
    });

    this.physics.add.overlap(this.player, this.pickups, (_p, item) => {
      this.collect(item as Phaser.Physics.Arcade.Sprite);
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.terrain.widthPx, Math.max(GAME_HEIGHT, this.terrain.heightPx));
    cam.startFollow(this.player, true, 0.1, 0.12);
    cam.setDeadzone(180, 120);
  }

  /* ── Interaccion ─────────────────────────────────────────────────── */

  protected collect(item: Phaser.Physics.Arcade.Sprite): void {
    if (!item.active) return;
    const kind = item.getData("kind") as string;
    const st = getState();

    switch (kind) {
      case "cake":
        if (st.cake >= st.maxCake) return;
        heal(1);
        audio.sfx.cake();
        this.hud?.flashHeal();
        break;
      case "coffee":
        // Un cafe a la vez: con boost activo la taza no se recoge.
        if (isCoffeeActive()) return;
        setState({ coffeeUntil: clock() + COFFEE.durationMs });
        audio.sfx.coffee();
        coffeeRush(this, item.x, item.y);
        // Snoopy entra a servirlo cada vez, en cualquier nivel.
        void new Dog(this).deliver(this.player.x + 90, this.player.y);
        break;
      case "can":
        // La lata cura media torta: premio de la ruta alta.
        if (st.cake >= st.maxCake) return;
        heal(0.5);
        audio.sfx.coffee();
        this.hud?.flashHeal();
        break;
      default:
        break;
    }

    this.hud?.refresh();
    burstAt(this, item.x, item.y, 12, INK.gold);
    item.destroy();
  }

  /** El pico rompe bloques y tambien sirve de arma cuerpo a cuerpo. */

  protected hurtPlayer(amount: number, fromX: number): void {
    if (!this.player.takeHit(fromX)) return;
    const left = damage(amount);
    this.hud?.refresh();
    this.hud?.flashDamage();
    this.grade.pulse(0.16);
    if (left <= 0) this.die();
  }

  private blast(x: number, y: number, radius: number): void {
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < radius) {
      this.hurtPlayer(HEALTH.creeperDamage, x);
    }

    // La explosion abre el terreno rompible: es la via alterna a picar.
    for (const obj of this.terrain.breakables.getChildren()) {
      const block = obj as Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
      if (!block.active) continue;
      if (Phaser.Math.Distance.Between(block.x, block.y, x, y) > radius) continue;
      hitBreakable(this, this.terrain, block);
      hitBreakable(this, this.terrain, block);
    }
  }

  protected takeKey(): void {
    if (this.gotKey || !this.keySprite) return;
    this.gotKey = true;
    setState({ hasKey: true });

    audio.sfx.key();
    impactRing(this, this.keySprite.x, this.keySprite.y, INK.gold, 90);
    burstAt(this, this.keySprite.x, this.keySprite.y, 20, INK.gold);
    this.cameras.main.shake(180, 0.005);

    // La llave vuela hasta la jugadora: deja claro quien la lleva ahora.
    this.tweens.add({
      targets: this.keySprite,
      x: this.player.x,
      y: this.player.y - 50,
      scale: 0.1,
      duration: 420,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.keySprite?.destroy();
        this.keySprite = null;
      },
    });
    this.keyGlow?.destroy();
    this.keyGlow = null;

    this.onKeyTaken();

    this.hud?.announce(this.config.keyGot, this.config.backObjective, 2800, INK.gold);
    this.hud?.setObjective(this.config.backObjective);
    this.door?.clearTint();
  }

  /** Lo que pasa en este nivel al coger la llave. */
  protected onKeyTaken(): void {}

  /**
   * Salida por la puerta.
   *
   * El cambio de escena tiene que notarse: la puerta se abre de golpe,
   * traga la pantalla en luz y solo entonces corta. Un fundido a negro
   * sin mas parecia que el juego se habia colgado.
   */
  protected openDoor(): void {
    if (this.finished || !this.door) return;
    this.finished = true;

    // La puerta suena a puerta, y encima el aire del corte: son dos
    // cosas distintas — la cerradura y el tramo que se acaba — y juntas
    // el cambio de escena se lee como un acontecimiento.
    audio.sfx.door();
    this.time.delayedCall(180, () => audio.sfx.whoosh());
    this.time.delayedCall(560, () => audio.sfx.chime());
    // Clavada, no solo sin controles: a partir de aqui `update` sale por
    // la primera linea y ya no corre ni `syncBody` ni la red que la
    // devuelve arriba si se sale del mapa (ver `Player.freeze`).
    this.player.freeze();
    this.hud?.clearObjective();
    if (this.config.progress) {
      const hito = this.config.progress;
      void reportProgress(hito);
    }
    burstAt(this, this.door.x, this.door.y - 40, 26, INK.gold);
    impactRing(this, this.door.x, this.door.y - 60, INK.gold, 180);

    // 1. La puerta se abre y suelta luz.
    const beam = this.add
      .rectangle(this.door.x, this.door.y, 10, this.door.displayHeight, 0xffe9c0, 0)
      .setOrigin(0.5, 1)
      .setDepth(30)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: beam,
      fillAlpha: 0.9,
      scaleX: 9,
      duration: 520,
      ease: "Quad.easeIn",
    });
    this.tweens.add({ targets: this.door, alpha: 0.2, duration: 520 });
    this.cameras.main.zoomTo(1.28, 900, "Quad.easeIn");

    // 2. La luz se come la pantalla.
    let wash: Phaser.GameObjects.Rectangle | undefined;
    this.time.delayedCall(540, () => {
      flash(this, 0xffe9c0, 500);
      wash = this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffe9c0, 0)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(9600);
      this.tweens.add({ targets: wash, fillAlpha: 1, duration: 480 });
    });

    // 3. La carta del tramo que se acaba de terminar, y despues corta.
    this.time.delayedCall(1150, () => {
      const card = this.config.card;
      if (!card) {
        this.scene.start(this.config.next);
        return;
      }
      // El destello se queda solido en profundidad 9600 hasta que algo
      // lo quita — y nada lo hacia. La carta se dibuja a 900-902, muy
      // por debajo, asi que quedaba tapada entera detras de un blanco
      // liso: se veia "la pantalla muy blanca" y ninguna imagen. Fuera
      // antes de que la carta entre, igual que el corte a negro que ya
      // pasa cuando el tramo no lleva carta.
      wash?.destroy();
      // No saltable: se llega aqui recien disparando o haciendo clic
      // para moverse, y con el salto activado por defecto ese mismo
      // clic residual cerraba la carta antes de que diera tiempo a
      // leerla.
      void showCard(this, card, { skippable: false }).then(() =>
        this.scene.start(this.config.next),
      );
    });
  }

  protected die(): void {
    if (this.finished) return;
    this.finished = true;
    audio.sfx.die();
    refill();
    this.hud?.refresh();
    this.cameras.main.fadeOut(600, 40, 4, 20);
    this.time.delayedCall(700, () => this.scene.restart());
  }

  /* ── Bucle ───────────────────────────────────────────────────────── */

  override update(_time: number, delta: number): void {
    if (this.finished) return;

    this.player.tick(this.controls, delta);
    this.aura?.tick(this.player.x, this.player.y, delta);

    if (this.controls.wantsShoot && this.player.weapon.canFire(this.time.now)) {
      this.player.weapon.fire(this.time.now);
      this.crosshair.kick();
      const m = this.player.weapon.muzzle();
      this.bullets.fire(m.x, m.y, this.player.weapon.aimAngle);
    }
    if (this.controls.justPressed("m")) audio.setMuted(!audio.isMuted);

    // El guia va detras todo el rato, no solo cuando habla.
    if (this.config.withGuide) {
      this.guide.follow(this.player.x, this.player.y, this.terrain.widthPx);
      this.guide.tick(delta);
    }

    this.villagers = this.villagers.filter((e) => e.active);
    this.creepers = this.creepers.filter((e) => e.active);

    // Solo se mueve lo que esta cerca: ni gasto en enemigos fuera de
    // pantalla ni persecuciones que empiezan a medio mapa de distancia.
    if (this.time.now > this.wakeAt) {
      const near = (e: Phaser.GameObjects.Sprite) =>
        Math.abs(e.x - this.player.x) < 760;

      for (const v of this.villagers) {
        if (!near(v)) continue;
        v.tick(this.player, () => this.hurtPlayer(HEALTH.villagerDamage, v.x));
      }
      for (const c of this.creepers) {
        if (!near(c) && !c.isFusing) continue;
        c.tick(this.player, (x, y, r) => this.blast(x, y, r));
      }
    }

    // Luna: ataca aldeanos, huye de creepers. Los aldeanos no pueden
    // hacerle nada, asi que no hay nada que proteger.
    this.cat?.tick(this.player, this.villagers, this.creepers, (victim) => {
      const from = victim.x < (this.cat?.x ?? 0) ? Math.PI : 0;
      (victim as Villager).hit(HEALTH.catDamage * 2, from);
      dust(this, victim.x, victim.y, 4);
    });

    if (this.keySprite && !this.gotKey) {
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y - 30,
        this.keySprite.x,
        this.keySprite.y,
      );
      if (d < 56) this.takeKey();
    }

    this.pickUpLoot();
    this.updateDoor();
    this.onUpdate(delta);

    // Caida al vacio: se vuelve al inicio sin castigo de vida. Un hueco
    // no deberia costar la partida en un juego de cinco minutos.
    if (this.player.y > this.terrain.heightPx + 120) {
      this.player.respawnAt(this.spawn.x, this.spawn.y - 40);
    }
  }

  /** Enganche por nivel dentro del bucle. */
  protected onUpdate(_delta: number): void {}

  private updateDoor(): void {
    if (!this.door || this.finished) return;

    const near = Math.abs(this.player.x - this.door.x) < 74;
    if (!near) {
      this.door.setTint(this.gotKey ? 0xffffff : 0x6a6480);
      this.doorHint?.setVisible(false);
      return;
    }

    if (this.gotKey) {
      this.door.setTint(0xffe9a8);
      this.showDoorHint(DOOR_OPEN);
      if (this.controls.consumeInteract()) this.openDoor();
    } else {
      this.showDoorHint(DOOR_LOCKED);
    }
  }

  /**
   * Aviso de la puerta, anclado a la pantalla.
   *
   * Antes se dibujaba encima de la puerta, en coordenadas del mundo. En
   * el pozo la puerta esta arriba del todo y el cartel quedaba fuera de
   * la camara: llegabas a la puerta y no sabias que habia que pulsar E.
   * Ahora sale abajo en el centro y siempre se ve.
   */
  private showDoorHint(text: string): void {
    if (!this.door) return;
    this.doorHint ??= shadow(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 58, text, uiLabel(17, INK.bone))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(9400),
    );
    this.doorHint.setText(text).setVisible(true);
  }
}
