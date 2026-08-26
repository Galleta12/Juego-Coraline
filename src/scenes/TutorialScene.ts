import Phaser from "phaser";
import { reportProgress } from "@/systems/Api";
import { COFFEE, GAME_HEIGHT, GAME_WIDTH, HEALTH, PLAYER, TILE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { TUTORIAL } from "@/config/strings";
import { CAT_ART, DOG, GUIDE, HERO_POSES, ITEM, WEAPON, heroKey, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { clock, coffeeRemaining, damage, DEFAULT_SKIN, getState, heal, refill, setState } from "@/systems/GameState";
import { Input } from "@/systems/Input";
import { buildTerrain, burstAt, groundYAt, hitBreakable, type BuiltTerrain } from "@/systems/Terrain";
import { buildParallax, preloadParallax } from "@/systems/Parallax";
import { decorArtKeys, scatterDecor } from "@/systems/Decor";
import { TUTORIAL_MAP } from "@/systems/levels/tutorial";
import { Player } from "@/entities/Player";
import { BulletPool } from "@/entities/Weapon";
import { Guide } from "@/entities/Guide";
import { Cat } from "@/companions/Cat";
import { Villager, villagerArtKeys } from "@/entities/Villager";
import { Creeper, creeperArtKeys } from "@/entities/Creeper";
import { Dog } from "@/companions/Dog";
import { SceneGrade } from "@/ui/Grade";
import { Crosshair } from "@/ui/Crosshair";
import { coffeeRush, dust, flash, impactRing } from "@/ui/Effects";
import { CoffeeAura, coffeeArtKeys } from "@/ui/CoffeeAura";
import { cardArtKeys, showCard } from "@/ui/Transition";
import { label as uiLabel, shadow, title } from "@/ui/text";
import type { HudScene } from "@/scenes/HudScene";

/**
 * Tutorial jugable.
 *
 * Cada mecanica se presenta y se practica antes de pasar a la
 * siguiente: el guia explica, la jugadora lo hace, y solo entonces
 * continua. Nada avanza por temporizador — si no lo ha probado, el
 * tutorial espera.
 */
export class TutorialScene extends Phaser.Scene {
  private player!: Player;
  private input2!: Input;
  private terrain!: BuiltTerrain;
  private guide!: Guide;
  private bullets!: BulletPool;
  private cat: Cat | null = null;
  private crosshair!: Crosshair;
  private aura: CoffeeAura | null = null;

  private pickups!: Phaser.Physics.Arcade.Group;
  private foes: (Villager | Creeper)[] = [];

  /** Objetos ya posados en el suelo, esperando a que los recoja. */
  private readyDrops: {
    sprite: Phaser.GameObjects.Image;
    kind: "cake" | "coffee";
    beam: Phaser.GameObjects.Rectangle;
    halo: Phaser.GameObjects.Arc;
  }[] = [];
  private door: Phaser.GameObjects.Image | null = null;
  private keySprite: Phaser.GameObjects.Image | null = null;

  private walked = false;
  private jumped = false;
  private brokeBlock = false;
  private tookCake = false;
  private tookCoffee = false;
  private gotKey = false;
  private finished = false;

  private spawn = { x: 0, y: 0 };

  /**
   * Objeto que el guion espera ahora mismo.
   *
   * La red de seguridad de proximidad solo puede sacar este. Antes sacaba
   * cualquiera que estuviera cerca, y por eso la torta y el cafe salian
   * de golpe mucho antes de que les tocara.
   */
  private expecting: string | null = null;

  constructor() {
    super(S.Tutorial);
  }

  /* ── Carga ───────────────────────────────────────────────────────── */

  preload(): void {
    const skin = getState().selectedHero ?? DEFAULT_SKIN;
    queue(this, [
      ...HERO_POSES.map((p) => heroKey(skin, p)),
      ...Object.values(GUIDE),
      ...Object.values(CAT_ART),
      ...Object.values(DOG),
      ITEM.cake,
      ITEM.coffee,
      ITEM.can,
      ITEM.canBig,
      ITEM.key,
      ITEM.door,
      WEAPON.gun,
      WEAPON.gunFiring,
      ...villagerArtKeys(),
      ...creeperArtKeys(),
      ...["ground-top", "ground-fill", "stone", "breakable", "platform"].map(
        (t) => `tiles/forest/${t}`,
      ),
      ...decorArtKeys("forest"),
      ...coffeeArtKeys(),
    ]);
    preloadParallax(this, "forest");
  }

  /* ── Montaje ─────────────────────────────────────────────────────── */

  create(): void {
    this.resetFlags();
    setState({ checkpoint: S.Tutorial });

    this.cameras.main.fadeIn(600, 8, 6, 14);
    new SceneGrade(this, "tutorial");
    void audio.playMusic("tutorial");
    void audio.preloadTrack("forest");

    this.terrain = buildTerrain(this, TUTORIAL_MAP, "forest");
    this.physics.world.setBounds(0, 0, this.terrain.widthPx, this.terrain.heightPx + 200);
    buildParallax(this, "forest", this.terrain.widthPx);
    // Mas suelto que en el bosque: aqui se enseña a jugar y lo que hay
    // que mirar son los bloques y los objetos, no el decorado.
    scatterDecor(this, TUTORIAL_MAP, "forest", {
      avoid: Object.values(this.terrain.markers).flat(),
      spacing: 8,
      density: 0.4,
    });

    this.spawnPlayer();
    this.aura = new CoffeeAura(this);
    this.bullets = new BulletPool(this);
    this.spawnPickups();
    this.setupColliders();
    this.setupCamera();

    if (!this.scene.isActive(S.Hud)) this.scene.launch(S.Hud);
    this.time.delayedCall(60, () => this.hud?.refresh());

    this.crosshair = new Crosshair(this);
    // Flota bien alto: a poca altura se cruzaba con las plataformas.
    this.guide = new Guide(this, this.player.x + 150, this.player.y - 170);
    void this.runTutorial();
  }

  private resetFlags(): void {
    this.walked = false;
    this.jumped = false;
    this.brokeBlock = false;
    this.tookCake = false;
    this.tookCoffee = false;
    this.gotKey = false;
    this.finished = false;
    this.cat = null;
    this.foes = [];
    this.readyDrops = [];
    this.door = null;
    this.keySprite = null;
    // El tutorial empieza siempre de cero: es donde se aprende.
    setState({ hasGun: false, hasKey: false, coffeeUntil: 0 });
    refill();
  }

  private get hud(): HudScene | undefined {
    return this.scene.get(S.Hud) as HudScene | undefined;
  }

  private marker(symbol: string): { x: number; y: number } | null {
    return this.terrain.markers[symbol]?.[0] ?? null;
  }

  private spawnPlayer(): void {
    const m = this.marker("P") ?? { x: TILE * 4, y: TILE * 13 };
    this.spawn = { x: m.x, y: m.y + TILE / 2 };
    this.player = new Player(this, this.spawn.x, this.spawn.y);
  }

  private spawnPickups(): void {
    this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });

    const add = (symbol: string, texture: string, scale: number, kind: string) => {
      const m = this.marker(symbol);
      if (!m) return null;
      const s = this.physics.add.sprite(m.x, m.y, texture).setScale(scale).setDepth(12);
      (s.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      s.setData("kind", kind);
      s.setVisible(false);
      this.pickups.add(s);
      return s;
    };

    add("g", WEAPON.gun, 0.42, "gun");
    add("c", ITEM.cake, 0.42, "cake");
    add("f", ITEM.coffee, 0.42, "coffee");

    // La llave se ve desde el principio, encerrada entre bloques: hay
    // que entender que se dispara para sacarla, sin que nadie lo diga.
    const k = this.marker("k");
    if (k) {
      this.keySprite = this.add.image(k.x, k.y, ITEM.key).setScale(0.44).setDepth(11);
      this.add
        .circle(k.x, k.y, 28, INK.gold, 0.24)
        .setDepth(10)
        .setBlendMode(Phaser.BlendModes.ADD);
    }

    const d = this.marker("D");
    if (d) {
      // Bien grande: es la salida del tutorial y tiene que cantar.
      this.door = this.add
        .image(d.x, d.y + TILE / 2, ITEM.door)
        .setOrigin(0.5, 1)
        .setScale(2.4)
        .setDepth(8);
    }
  }

  private setupColliders(): void {
    this.physics.add.collider(this.player, this.terrain.solids);
    this.physics.add.collider(this.player, this.terrain.breakables);
    this.physics.add.collider(this.player, this.terrain.platforms, undefined, () => {
      // S baja por la plataforma: se ignora la colision un instante.
      return !this.player.isDropping;
    });

    // Los proyectiles chocan con el terreno y rompen bloques.
    this.physics.add.collider(this.bullets.group, this.terrain.solids, (b) => {
      this.bullets.hit(b as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.collider(this.bullets.group, this.terrain.breakables, (b, block) => {
      this.bullets.hit(b as Phaser.Physics.Arcade.Sprite);
      if (hitBreakable(this, this.terrain, block as never)) this.brokeBlock = true;
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

  private collect(item: Phaser.Physics.Arcade.Sprite): void {
    if (!item.visible) return;
    const armedAt = (item.getData("armedAt") as number | undefined) ?? 0;
    if (this.time.now < armedAt) return;
    const kind = item.getData("kind") as string;

    switch (kind) {
      case "pickaxe":
        // Ya no existe, pero el marcador "p" puede seguir en mapas
        // viejos: se ignora en vez de romper.
        audio.sfx.key();
        break;
      case "gun":
        setState({ hasGun: true });
        audio.sfx.key();
        break;
      case "cake": {
        if (getState().cake >= getState().maxCake) return;
        heal(1);
        audio.sfx.cake();
        this.hud?.flashHeal();
        this.tookCake = true;
        break;
      }
      case "coffee":
        this.tookCoffee = true;
        coffeeRush(this, item.x, item.y);
        // Snoopy entra justo despues de recogerlo, no antes: primero se
        // ve el cafe en el suelo, se camina hasta el, y entonces aparece
        // el con su numerito.
        this.time.delayedCall(320, () => {
          void new Dog(this).deliver(this.player.x + 90, this.player.y);
        });
        break;
      default:
        break;
    }

    this.hud?.refresh();
    burstAt(this, item.x, item.y, 14, INK.gold);
    for (const extra of ["glow", "arrow", "tag", "beam"]) {
      (item.getData(extra) as Phaser.GameObjects.GameObject | undefined)?.destroy();
    }
    item.destroy();
  }

  /** Golpe de pico: rompe bloques y revienta la diana. */

  /**
   * Enemigo de practica.
   *
   * Aparece a la derecha, camina hacia la heroina y suelta el objeto que
   * toque al caer. Enseña a disparar peleando de verdad, que es mucho
   * mejor que dispararle a una diana que no se mueve.
   */
  private spawnFoe(kind: "villager" | "creeper", drop: "cake" | "coffee"): Promise<void> {
    // Lejos, pero dentro del encuadre.
    //
    // A 230 px aparecia practicamente encima y no daba tiempo ni a
    // apuntar; a 420 se salia de la pantalla y parecia que el tutorial
    // se habia colgado esperando algo invisible. 360 es lo que cabe
    // justo por el borde, y ademas viene despacio.
    const x = this.player.x + 360;
    const y = this.player.y;

    const foe: Villager | Creeper =
      kind === "villager" ? new Villager(this, x, y, "normal") : new Creeper(this, x, y);
    // A la mitad de velocidad: aqui se esta aprendiendo a disparar.
    if (foe instanceof Villager) foe.speedScale = 0.5;
    // Suelta lo suyo muera como muera: a tiros, a picotazos o de un
    // zarpazo. Antes solo lo hacia si moria de un disparo.
    foe.onDeath = (dx, dy) => this.dropFrom(dx, dy, drop);
    this.foes.push(foe);

    this.physics.add.collider(foe, this.terrain.solids);
    this.physics.add.collider(foe, this.terrain.breakables);
    this.physics.add.collider(foe, this.terrain.platforms);
    this.physics.add.overlap(this.bullets.group, foe, (a, b) => {
      const enemy = (a === foe ? a : b) as Villager | Creeper;
      const bullet = (a === foe ? b : a) as Phaser.Physics.Arcade.Sprite;
      const body = bullet.body as Phaser.Physics.Arcade.Body | null;
      const angle = body ? Math.atan2(body.velocity.y, body.velocity.x) : 0;
      this.bullets.hit(bullet);
      enemy.hit(1, angle);
    });

    // Entra andando desde fuera de pantalla.
    foe.setAlpha(0);
    this.tweens.add({ targets: foe, alpha: 1, duration: 500 });
    audio.sfx.villagerGroan();

    return new Promise((resolve) => {
      const check = () => {
        if (foe.active) return;
        this.events.off(Phaser.Scenes.Events.UPDATE, check);
        resolve();
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, check);
    });
  }

  /** Lo que suelta un enemigo al caer, en el sitio donde cayo. */
  /**
   * Suelta un objeto que cae en arco hasta el suelo.
   *
   * Sin fisica a proposito. Con gravedad y rebote el objeto se hundia en
   * el tile, salia despedido por debajo del mapa y habia que rescatarlo
   * con un temporizador; ademas nunca quedaba del todo quieto. Aqui se
   * calcula donde esta el suelo y se le anima el salto: siempre aterriza
   * donde se ve, y se queda ahi.
   */
  private dropFrom(x: number, y: number, kind: "cake" | "coffee"): void {
    // Cae a un par de pasos, nunca encima de ella: los enemigos de
    // practica mueren pegados y el objeto se recogia solo antes de que
    // el guia acabara la frase.
    const away = x >= this.player.x ? 1 : -1;
    const gap = Math.max(0, 190 - Math.abs(x - this.player.x));
    const dropX = Phaser.Math.Clamp(x + away * gap, 60, this.terrain.widthPx - 60);
    const landY = (this.groundBelow(dropX, y - 40) ?? y) - 22;

    const s = this.add
      .image(x, y - 40, kind === "cake" ? ITEM.cake : ITEM.coffee)
      .setScale(0.62)
      .setDepth(30);

    // Haz de luz sobre el sitio donde va a quedarse.
    const beam = this.add
      .rectangle(dropX, landY - 130, 30, 260, INK.gold, 0.16)
      .setDepth(29)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    const halo = this.add
      .circle(dropX, landY, 34, INK.gold, 0.22)
      .setDepth(29)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    audio.sfx.cake();

    // Sube, gira y cae. Al tocar suelo, polvo y ya no se mueve mas.
    this.tweens.add({ targets: s, x: dropX, duration: 620, ease: "Sine.easeOut" });
    this.tweens.add({ targets: s, angle: 360, duration: 620 });
    this.tweens.chain({
      targets: s,
      tweens: [
        { y: y - 130, duration: 260, ease: "Quad.easeOut" },
        { y: landY, duration: 360, ease: "Quad.easeIn" },
      ],
      onComplete: () => {
        s.setAngle(0);
        dust(this, dropX, landY + 14, 6);
        impactRing(this, dropX, landY, kind === "cake" ? INK.cake : INK.gold, 60);
        this.tweens.add({ targets: [beam, halo], alpha: 1, duration: 320 });
        this.readyDrops.push({ sprite: s, kind, beam, halo });
      },
    });
  }

  private waitUntil(check: () => boolean, timeoutMs = 45_000): Promise<void> {
    if (check()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const started = this.time.now;
      const tick = () => {
        if (check() || this.time.now - started > timeoutMs) {
          this.events.off(Phaser.Scenes.Events.UPDATE, tick);
          resolve();
        }
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, tick);
    });
  }

  private async runTutorial(): Promise<void> {
    await this.wait(700);
    await this.guide.enter(this.player.x + 150, this.player.y - 150);

    await this.guide.say(TUTORIAL.greet);
    await this.guide.say(TUTORIAL.name);
    await this.guide.say(TUTORIAL.nameAside);
    await this.guide.say(TUTORIAL.rules);
    this.showControls();

    await this.guide.say(TUTORIAL.move);
    await this.guide.say(TUTORIAL.jump);
    this.guide.hideBubble();
    this.hud?.setObjective("Camina con A y D, y salta con ESPACIO");
    await this.waitUntil(() => this.walked && this.jumped);
    this.hud?.clearObjective();

    // ── Pistola ──
    //
    // El pico ya no existe: era una segunda arma con su propia tecla que
    // solo servia para abrir bloques, y el juego se entiende mejor con
    // una sola cosa en la mano. Los bloques ahora se rompen a tiros.
    await this.beat();
    this.expecting = "gun";
    await this.approach("g");
    this.guide.point();
    this.revealPickup("gun", "PISTOLA");
    this.hud?.announce("RECOGE LA PISTOLA", "Camina hasta ella", 3200, 0x9bef4f);
    await this.guide.say(TUTORIAL.gunIntro);
    this.hud?.setObjective("Recoge la PISTOLA MONSTER");
    await this.waitUntil(() => getState().hasGun);
    this.expecting = null;
    this.hud?.clearObjective();

    // El comentario espera a que el cartel se haya ido del todo: antes
    // hablaba a la vez que la celebracion, y el cartel vive muy por
    // encima del globo (9200 contra 30) — se lo tapaba entero y el
    // texto no llegaba a leerse.
    await this.monsterPickupBurst();
    await this.guide.say(TUTORIAL.gunName);
    this.guide.hideBubble();
    this.hud?.announce("PISTOLA MONSTER", TUTORIAL.gunHowTo, 2800, 0x9bef4f);

    // ── Romper un bloque a tiros ──
    await this.beat();
    await this.guide.say(TUTORIAL.shootBlocks);
    this.guide.hideBubble();
    this.hud?.setObjective("Dispara a un bloque agrietado");
    await this.waitUntil(() => this.brokeBlock);
    this.hud?.clearObjective();

    // ── Primer enemigo: enseña a disparar, y suelta la torta ──
    await this.beat();
    await this.guide.say(TUTORIAL.enemyWarn);

    // Aparece en el momento exacto en que lo nombra.
    //
    // Antes salia unas lineas despues y la frase se quedaba colgada
    // señalando a un bosque vacio.
    const villagerDown = this.spawnFoe("villager", "cake");
    await this.guide.say(TUTORIAL.enemyName);

    // Se le quita una porcion antes de la pelea, para que la torta que
    // suelte el aldeano sirva de algo: curarse a vida llena no ensena.
    damage(1);
    this.hud?.refresh();
    this.hud?.flashDamage();
    this.cameras.main.shake(180, 0.006);
    audio.sfx.hurt();
    await this.guide.say(TUTORIAL.cakeIntro);
    await this.guide.say(TUTORIAL.enemyShoot);
    this.guide.hideBubble();
    this.hud?.setObjective("Dispárale con CLIC IZQUIERDO");
    await villagerDown;
    this.hud?.clearObjective();

    await this.guide.say(TUTORIAL.enemyDown);
    await this.guide.say(TUTORIAL.enemyDrops);
    await this.guide.say(TUTORIAL.cakeName);
    // El globo se cierra ANTES del cartel: los dos a la vez se pisaban.
    this.guide.hideBubble();
    this.hud?.setObjective("Recoge la TORTA para recuperar vida");
    await this.waitUntil(() => this.tookCake);
    this.hud?.clearObjective();
    await this.wait(250);
    this.hud?.announce("VIDA RECUPERADA", "La torta arregla casi todo", 2400, INK.cake);
    await this.wait(2600);

    // ── Segundo enemigo: el creeper, y suelta el cafe ──
    await this.beat();
    await this.guide.say(TUTORIAL.creeperWarn);

    // Igual que el aldeano: sale cuando lo nombra.
    const creeperDown = this.spawnFoe("creeper", "coffee");
    await this.guide.say(TUTORIAL.creeperName);
    await this.guide.say(TUTORIAL.creeperShoot);
    this.guide.hideBubble();
    this.hud?.setObjective("Dispárale ANTES de que llegue");
    await creeperDown;
    this.hud?.clearObjective();

    this.hud?.setObjective("Recoge el CAFÉ");
    await this.waitUntil(() => this.tookCoffee);
    this.hud?.clearObjective();

    // Snoopy ya ha entrado al recogerlo, y el cafe ya esta activo: lo
    // hace `pickUpDrops`. Aqui solo se le da tiempo a su numerito.
    await this.wait(1900);
    await this.guide.say(TUTORIAL.dogIntro);
    await this.guide.say(TUTORIAL.dogJob);

    await this.guide.say(TUTORIAL.coffeeFast);
    await this.guide.say(TUTORIAL.coffeeHigh);
    await this.guide.say(TUTORIAL.coffeeWarn);
    this.guide.hideBubble();

    // ── Luna ──
    await this.beat();
    await this.guide.say(TUTORIAL.catIntro);
    this.spawnCat();
    // Con mas tiempo que el resto: la formula por defecto (largo del
    // texto) le daba el minimo, 900ms, y una frase tan corta se leia a
    // medias antes de desaparecer.
    await this.guide.say(TUTORIAL.catName, 1900);
    await this.guide.say(TUTORIAL.catKnows);
    this.guide.hideBubble();

    // ── Llave y puerta ──
    await this.beat();
    this.hud?.setObjective("Rompe los bloques y coge la LLAVE");
    await this.waitUntil(() => this.gotKey, 120_000);
    this.hud?.clearObjective();
    this.hud?.announce(TUTORIAL.keyGot, "", 2200, INK.gold);
    await this.guide.say(TUTORIAL.keyDoor);
    await this.guide.leave();

    this.hud?.setObjective("Ve a la puerta y pulsa E para abrirla");
    await this.waitUntil(() => this.finished, 120_000);
    this.hud?.clearObjective();
    this.toProPlayer();
  }

  /**
   * Altura del suelo bajo un punto.
   *
   * La usa `dropFrom` para saber donde posar el botin, y el QA para
   * comprobar que efectivamente aterriza ahi.
   */
  groundBelow(x: number, fromY: number): number | null {
    return groundYAt(this.terrain, x, fromY);
  }

  /** Recoge por cercania lo que ya esta posado en el suelo. */
  private pickUpDrops(): void {
    for (const d of [...this.readyDrops]) {
      if (Math.abs(this.player.x - d.sprite.x) > 46) continue;
      if (Math.abs(this.player.y - d.sprite.y) > 90) continue;

      this.readyDrops = this.readyDrops.filter((o) => o !== d);
      burstAt(this, d.sprite.x, d.sprite.y, 14, INK.gold);
      d.sprite.destroy();
      d.beam.destroy();
      d.halo.destroy();

      if (d.kind === "cake") {
        heal(1);
        audio.sfx.cake();
        this.hud?.flashHeal();
        this.tookCake = true;
      } else {
        this.tookCoffee = true;
        coffeeRush(this, this.player.x, this.player.y - 40);
        this.activateCoffee();
        this.time.delayedCall(320, () => {
          void new Dog(this).deliver(this.player.x + 90, this.player.y);
        });
      }
      this.hud?.refresh();
    }
  }

  private hurtFromFoe(fromX: number): void {
    if (!this.player.takeHit(fromX)) return;
    const left = damage(HEALTH.villagerDamage);
    this.hud?.refresh();
    this.hud?.flashDamage();
    // En el tutorial nadie muere: se deja siempre media torta. Perder la
    // partida aprendiendo a disparar seria el peor recibimiento posible.
    if (left <= 0) {
      refill();
      this.hud?.refresh();
    }
  }

  private foeBlast(x: number, y: number, radius: number): void {
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < radius) {
      this.hurtFromFoe(x);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }

  /**
   * Respiro entre bloques del tutorial.
   *
   * Sin esto, en cuanto se cumplia un objetivo ya estaba saliendo el
   * siguiente objeto y el guia hablando encima. Cada mecanica necesita
   * un momento de silencio antes de la siguiente.
   */
  private beat(): Promise<void> {
    this.guide.hideBubble();
    return this.wait(1400);
  }

  /** Lleva al guia junto a un marcador y espera a que llegue la jugadora. */
  private async approach(symbol: string): Promise<void> {
    const m = this.marker(symbol);
    if (!m) return;
    this.tweens.add({
      targets: this.guide.sprite,
      x: m.x + 70,
      y: m.y - 170,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    await this.waitUntil(() => Math.abs(this.player.x - m.x) < 190);
  }

  /**
   * Saca un objeto a la vista con todo lo que hace falta para que no
   * haya duda: halo, flecha que baja senalando y su nombre debajo. Un
   * objeto brillante en un bosque oscuro se pierde; esto no.
   */
  private revealPickup(kind: string, label?: string): void {
    for (const obj of this.pickups.getChildren()) {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.getData("kind") !== kind) continue;
      // Una sola vez. Revelar dos veces dejaba adornos duplicados y el
      // segundo pisaba la referencia del primero, asi que al recogerlo
      // quedaba uno colgado en el sitio para siempre.
      if (s.getData("revealed")) continue;
      s.setData("revealed", true);

      s.setVisible(true).setAlpha(0).setScale(0.2);
      this.tweens.add({
        targets: s,
        alpha: 1,
        scale: 0.52,
        duration: 460,
        ease: "Back.easeOut",
      });

      // Halo fijo, sin latido. El parpadeo constante de todo a la vez
      // cansaba la vista y no aportaba nada.
      const glow = this.add
        .circle(s.x, s.y, 40, INK.gold, 0)
        .setDepth(11)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, fillAlpha: 0.26, duration: 460 });
      s.setData("glow", glow);

      // Chispas al aparecer: el aviso es el momento, no un adorno que
      // se queda encima molestando.
      burstAt(this, s.x, s.y, 12, INK.gold);

      if (label) {
        const tag = this.add
          .text(s.x, s.y + 46, label, uiLabel(14, INK.gold))
          .setOrigin(0.5)
          .setDepth(13)
          .setAlpha(0);
        tag.setLetterSpacing(3);
        this.tweens.add({ targets: tag, alpha: 1, duration: 400, delay: 200 });
        s.setData("tag", tag);
      }
    }
  }

  /**
   * Celebracion al conseguir la pistola Monster.
   *
   * Latas saliendo despedidas, chispazo verde y el logo latiendo: el
   * arma es la broma de marca del juego y merece un momento propio.
   *
   * Devuelve una promesa que resuelve cuando el cartel se ha ido del
   * todo. El globo del guia vive a profundidad 30 y el cartel a 9200+,
   * asi que mientras el cartel esta en pantalla se lo come entero —
   * antes se hablaban a la vez y el texto del guia no se llegaba a ver.
   */
  private monsterPickupBurst(): Promise<void> {
    const x = this.player.x;
    const y = this.player.y - 60;

    flash(this, 0x9bef4f, 160);
    impactRing(this, x, y, 0x9bef4f, 120);
    this.cameras.main.shake(220, 0.006);
    audio.sfx.coffee();

    // Latas girando hacia fuera.
    for (let i = 0; i < 7; i++) {
      const can = this.add.image(x, y, ITEM.canBig).setScale(0.24).setDepth(34);
      const a = -Math.PI / 2 + (i - 3) * 0.34;
      const dist = 130 + Math.random() * 90;
      this.tweens.add({
        targets: can,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist + 140,
        angle: (Math.random() - 0.5) * 900,
        alpha: 0,
        duration: 1100 + Math.random() * 400,
        ease: "Quad.easeIn",
        onComplete: () => can.destroy(),
      });
    }

    // Chispas de energia subiendo.
    for (let i = 0; i < 26; i++) {
      const p = this.add
        .rectangle(x + (Math.random() - 0.5) * 70, y, 3, 9, 0x9bef4f, 0.9)
        .setDepth(33);
      this.tweens.add({
        targets: p,
        y: y - 90 - Math.random() * 130,
        alpha: 0,
        duration: 600 + Math.random() * 500,
        onComplete: () => p.destroy(),
      });
    }

    // La lata grande que sube, gira y estalla.
    const hero = this.add.image(x, y, ITEM.canBig).setScale(0.16).setDepth(35);
    this.tweens.chain({
      targets: hero,
      tweens: [
        { scale: 0.62, y: y - 80, angle: 380, duration: 520, ease: "Back.easeOut" },
        { scale: 0.9, alpha: 0, duration: 260, ease: "Quad.easeIn" },
      ],
      onComplete: () => hero.destroy(),
    });

    return this.monsterSign();
  }

  /**
   * Cartel de la pistola, pegado a la lata.
   *
   * El nombre venia como un aviso mas del HUD, en el centro y sin
   * relacion con nada. Puesto al lado de la lata que sube se lee como lo
   * que es: la marca del arma.
   */
  private monsterSign(): Promise<void> {
    return new Promise<void>((resolve) => {
      const cx = GAME_WIDTH / 2;
      const cy = GAME_HEIGHT / 2 - 10;

      // La lata dibujada, no el icono del pack: es el logo del arma y
      // tiene que verse como tal.
      const can = this.add
        .image(cx - 150, cy, ITEM.canBig)
        .setScrollFactor(0)
        .setDepth(9200)
        .setScale(0)
        .setAngle(-14);

      const name = shadow(
        this.add.text(cx + 26, cy - 18, "PISTOLA", title(38, 0x9bef4f)).setOrigin(0.5).setAlpha(0),
      );
      name.setLetterSpacing(4).setScrollFactor(0).setDepth(9201);

      const brand = shadow(
        this.add.text(cx + 26, cy + 22, "MONSTER", title(38, 0xdff5c0)).setOrigin(0.5).setAlpha(0),
      );
      brand.setLetterSpacing(6).setScrollFactor(0).setDepth(9201);

      const sub = this.add
        .text(cx + 26, cy + 58, "Munición infinita", uiLabel(15, INK.bone))
        .setOrigin(0.5)
        .setAlpha(0)
        .setScrollFactor(0)
        .setDepth(9201);

      this.tweens.add({ targets: can, scale: 0.72, angle: 6, duration: 520, ease: "Back.easeOut" });
      this.tweens.add({ targets: name, alpha: 1, x: cx + 36, duration: 400, delay: 180 });
      this.tweens.add({ targets: brand, alpha: 1, x: cx + 36, duration: 400, delay: 320 });
      this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 520 });

      // Remate: una lata grande que cae de golpe sobre el cartel y lo
      // sella. Es la marca del arma y tiene que quedarse en la retina.
      this.time.delayedCall(1700, () => {
        const stamp = this.add
          .image(cx + 36, cy - 130, ITEM.canBig)
          .setScrollFactor(0)
          .setDepth(9202)
          .setScale(0.8)
          .setAlpha(0)
          .setAngle(-22);

        this.tweens.add({
          targets: stamp,
          y: cy + 4,
          alpha: 1,
          scale: 0.34,
          angle: 8,
          duration: 380,
          ease: "Quad.easeIn",
          onComplete: () => {
            audio.sfx.blockBreak();
            this.cameras.main.shake(180, 0.006);
            burstAt(this, cx + 36, cy + 4, 16, 0x9bef4f);
            impactRing(this, cx + 36, cy + 4, 0x9bef4f, 130);
          },
        });

        this.time.delayedCall(1300, () => {
          this.tweens.add({
            targets: [can, name, brand, sub, stamp],
            alpha: 0,
            duration: 500,
            onComplete: () => {
              can.destroy();
              name.destroy();
              brand.destroy();
              sub.destroy();
              stamp.destroy();
              resolve();
            },
          });
        });
      });
    });
  }

  private activateCoffee(): void {
    setState({ coffeeUntil: clock() + COFFEE.durationMs });
    // "Decisiones cuestionables fueron tomadas" no daba tiempo a
    // leerse; el subtitulo se acorto a lo que de verdad describe.
    this.hud?.announce("CAFFEINE RUSH", "Cambio de ciclo", 2600, INK.gold);
    this.cameras.main.flash(220, 217, 164, 65);
  }

  private spawnCat(): void {
    if (this.cat) return;
    const x = this.player.x - 120;
    this.cat = new Cat(this, x, this.player.y);
    this.physics.add.collider(this.cat, this.terrain.solids);
    this.physics.add.collider(this.cat, this.terrain.breakables);
    // Con su nombre, su maullido y sus motas: aparecia sin mas y no
    // habia forma de saber que la gata del dialogo era esa.
    this.cat.arrive();
  }

  private showControls(): void {
    const lines = [
      "A  D   caminar",
      "W / ESPACIO   saltar",
      "RATÓN   apuntar",
      "CLIC   disparar",
      "E   abrir puerta",
    ];
    // Arriba a la izquierda, debajo del HUD: abajo en el centro caia
    // justo en el camino de la heroina y tapaba lo que estaba picando.
    const panel = this.add.container(268, 128).setScrollFactor(0).setDepth(900);

    const bg = this.add.graphics();
    bg.fillStyle(INK.void, 0.86);
    bg.fillRoundedRect(-140, -74, 280, 148, 4);
    bg.lineStyle(1.5, INK.thread, 0.8);
    bg.strokeRoundedRect(-140, -74, 280, 148, 4);
    panel.add(bg);

    lines.forEach((line, i) => {
      const t = this.add
        .text(-120, -58 + i * 23, line, uiLabel(13, INK.bone))
        .setOrigin(0, 0);
      panel.add(t);
    });

    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 400 });
    this.time.delayedCall(16_000, () =>
      this.tweens.add({
        targets: panel,
        alpha: 0,
        duration: 600,
        onComplete: () => panel.destroy(),
      }),
    );
  }

  private toProPlayer(): void {
    if (this.scene.key !== S.Tutorial) return;
    setState({ tutorialDone: true });
    void reportProgress("tutorial");
    audio.sfx.door();
    this.cameras.main.fadeOut(700, 8, 6, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop(S.Hud);
      this.scene.start(S.ProPlayerTransition);
    });
  }

  /**
   * Red de seguridad: cualquier objeto se revela al acercarse, aunque el
   * guion no haya llegado a ese paso. Un objeto invisible por un
   * desfase del guion se lee como un objeto que falta.
   */
  private revealNearby(): void {
    if (!this.expecting) return;
    for (const obj of this.pickups.getChildren()) {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.visible || s.getData("kind") !== this.expecting) continue;
      if (Math.abs(this.player.x - s.x) < 260) this.revealPickup(this.expecting);
    }
  }

  /* ── Bucle ───────────────────────────────────────────────────────── */

  override update(_time: number, delta: number): void {
    this.player.tick(this.input2 ?? (this.input2 = new Input(this)), delta);
    this.aura?.tick(this.player.x, this.player.y, delta);

    if (Math.abs(this.player.body.velocity.x) > 40) this.walked = true;
    if (!this.player.body.blocked.down && this.player.body.velocity.y < -100) this.jumped = true;

    const st = getState();
    if (this.input2.wantsShoot && st.hasGun && this.player.weapon.canFire(this.time.now)) {
      this.player.weapon.fire(this.time.now);
      this.crosshair.kick();
      const m = this.player.weapon.muzzle();
      this.bullets.fire(m.x, m.y, this.player.weapon.aimAngle);
    }
    if (this.input2.justPressed("m")) audio.setMuted(!audio.isMuted);

    this.guide.follow(this.player.x, this.player.y, this.terrain.widthPx);
    this.guide.tick(delta);
    this.pickUpDrops();

    // Enemigos de practica: se mueven y pegan como los del bosque.
    this.foes = this.foes.filter((f) => f.active);
    for (const foe of this.foes) {
      if (foe instanceof Villager) {
        foe.tick(this.player, () => this.hurtFromFoe(foe.x));
      } else {
        foe.tick(this.player, (bx, by, r) => this.foeBlast(bx, by, r));
      }
    }

    // La llave se recoge al tocarla, una vez despejados los bloques.
    if (this.keySprite && !this.gotKey) {
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y - PLAYER.height / 2,
        this.keySprite.x,
        this.keySprite.y,
      );
      if (d < 44) {
        this.gotKey = true;
        setState({ hasKey: true });
        audio.sfx.key();
        burstAt(this, this.keySprite.x, this.keySprite.y, 16, INK.gold);
        this.keySprite.destroy();
        this.keySprite = null;
        this.hud?.refresh();
      }
    }

    // Puerta: con la llave y pulsando E.
    if (this.door && st.hasKey && !this.finished) {
      const near = Math.abs(this.player.x - this.door.x) < 70;
      this.door.setTint(near ? 0xffe9a8 : 0xffffff);
      if (near && this.input2.consumeInteract()) {
        this.finished = true;
        this.tweens.add({ targets: this.door, alpha: 0, scaleY: 0.2, duration: 600 });
      }
    }

    if (this.cat) {
      this.cat.tick(this.player, [], [], () => undefined);
    }

    this.revealNearby();
    this.hud?.setCoffee(coffeeRemaining());

    // Caida al vacio: reaparece cerca, sin castigo acumulado.
    if (this.player.y > this.terrain.heightPx + 120) {
      damage(1);
      this.hud?.refresh();
      this.hud?.flashDamage();
      if (getState().cake <= 0) refill();
      this.player.respawnAt(this.spawn.x, this.spawn.y);
      this.cameras.main.flash(200, 40, 10, 20);
    }
  }
}

/**
 * Corte entre el tutorial y el bosque.
 *
 * Antes aqui habia una pantalla de letras preguntando "¿eres realmente
 * pro player?". Se quito por una lamina dibujada — y esa lamina ahora
 * son DOS, una detras de otra: la duda ("pero... quiero comprobar
 * algo") y el remate ("¿eres pro player? ah...."). Partirlo en dos deja
 * respirar el chiste en vez de soltarlo entero de golpe.
 */
export class ProPlayerTransitionScene extends Phaser.Scene {
  constructor() {
    super(S.ProPlayerTransition);
  }

  preload(): void {
    queue(this, cardArtKeys());
  }

  create(): void {
    this.cameras.main.setBackgroundColor(INK.void);
    // Sin fundido de entrada: la primera carta trae el suyo y
    // encadenar los dos deja la pantalla en negro mas tiempo del que
    // hace falta.
    // Sin musica aqui: la del tutorial no deberia seguir sonando de
    // fondo durante el chiste, y la del bosque ya arranca sola al
    // entrar en ForestLevelScene.
    audio.stopMusic();
    void this.run();
  }

  private async run(): Promise<void> {
    // Cada una con tiempo de sobra para leerse: son dos ahora, asi que
    // cada mitad del chiste tiene que aguantar solita, no repartirse el
    // tiempo que antes tenia una carta sola.
    //
    // No saltables: el tutorial entero se juega a base de CLICS —
    // disparar, avanzar el cuaderno — asi que en cuanto entraba esta
    // pantalla, el primer clic (a veces el mismo con el que se disparo
    // el ultimo tiro) la saltaba de largo antes de dar tiempo a leerla.
    await showCard(this, "tutorial1", { holdMs: 2700, skippable: false });
    await showCard(this, "tutorial2", { holdMs: 2900, skippable: false });
    this.scene.start(S.Forest);
  }
}
