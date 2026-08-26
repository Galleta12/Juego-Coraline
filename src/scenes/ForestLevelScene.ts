import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, TILE } from "@/config/game";
import { S } from "@/config/scenes";
import { FOREST } from "@/config/strings";
import { ITEM, queue } from "@/systems/Art";

import { audio } from "@/systems/AudioSystem";
import { FOREST_MAP } from "@/systems/levels/forest";
import { burstAt } from "@/systems/Terrain";
import type { Creeper } from "@/entities/Creeper";
import type { Villager } from "@/entities/Villager";
import { LevelScene } from "@/scenes/LevelScene";
import { light, motes } from "@/ui/Atmosphere";
import { flash, impactRing } from "@/ui/Effects";
import { shadow, title as uiTitle } from "@/ui/text";

/**
 * El bosque.
 *
 * Primer nivel de verdad, en forma de V: se baja por la izquierda, la
 * llave espera en el fondo y se sube por la derecha hasta la puerta.
 * Las dos mitades no se parecen, asi que la vuelta no es desandar.
 *
 * El peligro no son los enemigos — hay cinco en todo el nivel — sino las
 * cebollas, que cruzan volando de lado a lado. Van despacio y se ven
 * llegar: se esquivan andando o saltando, y son lo que da ritmo al
 * descenso sin obligar a pelear.
 *
 * El guia dice lo suyo al principio y se marcha. A partir de ahi se baja
 * sola, con Luna detras.
 */
/** Zoom de la vista general del principio. */
const OVERVIEW_ZOOM = 0.5;

/**
 * Cada cuanto cruza una cebolla, en milisegundos.
 *
 * Espaciadas: en un descenso de un minuto pasan unas diez. Aunque te
 * comieras todas, sales viva — el brief pide cero frustracion y morir en
 * el primer nivel de un juego de cinco minutos es lo contrario.
 */
const ONION_EVERY_MS = 5200;

/**
 * Velocidad de crucero.
 *
 * Lenta a proposito: tarda unos siete segundos en cruzar la pantalla, asi
 * que se ve venir desde el otro extremo y da tiempo de sobra a decidir si
 * se salta, se pasa por debajo o se le dispara.
 */
const ONION_SPEED = 112;

/**
 * Alturas a las que vuelan, medidas desde los pies de la heroina.
 *
 * Solo dos, y bien separadas: una obliga a saltar y la otra a NO saltar.
 * Con alturas al azar la mitad de las veces caian justo a la altura del
 * pecho, donde no hay nada que hacer, y eso no es esquivar: es que te
 * toque o no.
 */
const ONION_LANES = [-26, -132] as const;

export class ForestLevelScene extends LevelScene {
  private altered = false;
  private onions: {
    sprite: Phaser.GameObjects.Image;
    halo: Phaser.GameObjects.Arc;
    vx: number;
    /** Si corrige el rumbo hacia la jugadora. */
    homing: boolean;
  }[] = [];

  /** Alterna las dos alturas en vez de sortearlas. */
  private onionLane = 0;

  constructor() {
    super(S.Forest, {
      map: FOREST_MAP,
      kind: "forest",
      parallax: "forest",
      grade: "forest",
      music: "forest",
      nextMusic: "tunnel",
      next: S.Tunnel,
      objective: FOREST.objective,
      keyGot: FOREST.keyGot,
      backObjective: FOREST.back,
      withCat: true,
      // El guia no acompaña en el bosque: dice las reglas al principio y
      // se marcha. A partir de ahi ella baja sola, con Luna detras.
      withGuide: false,
      withAltered: true,
      card: "forest",
      progress: "forest",
    });
  }

  override create(): void {
    this.altered = false;
    this.onions = [];
    this.onionLane = 0;
    super.create();
    this.lightShaft();
  }

  protected override preloadExtra(): void {
    queue(this, [ITEM.onion]);
  }

  /**
   * Cebollas cruzando el bosque.
   *
   * Salen del lateral por el que no esta la jugadora y atraviesan la
   * pantalla en horizontal, despacio y con un halo detras. No persiguen
   * ni apuntan: estan ahi, y esquivarlas es cosa de andar o de saltar.
   *
   * Es lo que da tension al descenso sin llenar el nivel de enemigos,
   * que es justo lo que se pidio.
   */
  private launchOnion(): void {
    if (this.finished) return;

    const cam = this.cameras.main;
    const left = cam.scrollX - 60;
    const right = cam.scrollX + cam.width + 60;

    // Entra por el lado contrario al que mira, para que la vea venir de
    // frente en vez de aparecerle por detras.
    const fromLeft = this.player.direction === 1;
    const x = fromLeft ? left : right;
    const vx = fromLeft ? ONION_SPEED : -ONION_SPEED;

    // Una de las dos alturas: por abajo se salta, por arriba se pasa
    // andando. Siempre hay una salida.
    const lane = ONION_LANES[this.onionLane % ONION_LANES.length]!;
    this.onionLane += 1;
    const y = this.player.y + lane;

    // Del tamano de un objeto que se recoge, no de un enemigo. Lo que la
    // hace visible es el halo, no el bulto.
    const sprite = this.add
      .image(x, y, ITEM.onion)
      .setScale(0.42)
      .setDepth(24);
    // Y de morro hacia ella: se lee de un vistazo que viene a por ti.
    // El dibujo mira hacia arriba, asi que se gira noventa grados de
    // base para que el eje largo quede en la direccion del vuelo.
    sprite.setAngle(fromLeft ? 90 : -90);

    const halo = this.add
      .circle(x, y, 34, 0xc9e08a, 0.32)
      .setDepth(23)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Cabeceo en vez de vuelta entera: girando sobre si misma no se
    // sabia hacia donde apuntaba.
    this.tweens.add({
      targets: sprite,
      angle: sprite.angle + (fromLeft ? 12 : -12),
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    // El halo late: un objeto que se mueve despacio y ademas respira se
    // encuentra con el rabillo del ojo.
    this.tweens.add({
      targets: halo,
      scale: 1.35,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    audio.sfx.onionCharge();

    // Una de cada tres persigue.
    //
    // Las que van rectas se esquivan andando y ya esta; estas corrigen
    // el rumbo hacia ella, asi que hay que destruirlas de un disparo o
    // apartarse de verdad. Solo una de cada tres: si persiguieran todas
    // el descenso dejaria de ser un paseo y pasaria a ser una pelea, y
    // este nivel no va de eso.
    const homing = this.onionLane % 3 === 0;
    if (homing) {
      halo.setFillStyle(0xff8a6a, 0.4);
      sprite.setTint(0xffc0a0);
    }

    this.onions.push({ sprite, halo, vx, homing });
  }

  private tickOnions(delta: number): void {
    const cam = this.cameras.main;
    const step = delta / 1000;

    for (const o of [...this.onions]) {
      o.sprite.x += o.vx * step;

      if (o.homing) {
        // Corrige despacio hacia ella. Lento a proposito: tiene que
        // poder dejarse atras cambiando de altura, no ser inevitable.
        const dy = this.player.y - 20 - o.sprite.y;
        o.sprite.y += Phaser.Math.Clamp(dy, -70, 70) * step * 1.4;
        o.sprite.angle += (o.vx > 0 ? 1 : -1) * 90 * step;
      } else {
        // Ondula un poco: una linea recta perfecta se lee como un decorado.
        o.sprite.y += Math.sin(o.sprite.x / 90) * 26 * step;
      }
      o.halo.setPosition(o.sprite.x, o.sprite.y);

      // Estela corta, para que se lea la direccion de un vistazo.
      if (Math.random() < 0.3) {
        const t = this.add
          .circle(o.sprite.x, o.sprite.y, 5, 0xc9e08a, 0.35)
          .setDepth(22)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: t,
          alpha: 0,
          scale: 0.2,
          duration: 520,
          onComplete: () => t.destroy(),
        });
      }

      const out =
        o.sprite.x < cam.scrollX - 200 || o.sprite.x > cam.scrollX + cam.width + 200;
      const hit =
        Phaser.Math.Distance.Between(o.sprite.x, o.sprite.y, this.player.x, this.player.y - 34) <
        42;

      // Tambien se pueden reventar de un tiro. Da algo que hacer con la
      // pistola durante el descenso, y quien prefiera esquivar tampoco
      // pierde nada.
      const shot = this.shootOnion(o.sprite.x, o.sprite.y);

      if (!out && !hit && !shot) continue;

      this.onions = this.onions.filter((x) => x !== o);
      if (hit || shot) {
        audio.sfx.onionSplat();
        impactRing(this, o.sprite.x, o.sprite.y, 0xc9e08a, 70);
        burstAt(this, o.sprite.x, o.sprite.y, 12, 0xc9e08a);
      }
      if (hit) {
        // Media torta, y con el parpadeo de invulnerabilidad de por
        // medio: dos cebollas seguidas no pueden encadenarse.
        this.hurtPlayer(0.5, o.sprite.x);
      }
      o.sprite.destroy();
      o.halo.destroy();
    }
  }

  /** ¿Hay una bala encima de esta cebolla? Si la hay, se gasta. */
  private shootOnion(x: number, y: number): boolean {
    for (const obj of this.bullets.group.getChildren()) {
      const b = obj as Phaser.Physics.Arcade.Sprite;
      if (!b.active) continue;
      if (Phaser.Math.Distance.Between(b.x, b.y, x, y) > 46) continue;
      this.bullets.hit(b);
      return true;
    }
    return false;
  }

  protected override onUpdate(delta: number): void {
    this.tickOnions(delta);
  }

  /**
   * Luz del pozo.
   *
   * Bajando a oscuras no se ve la siguiente repisa y el descenso se
   * convierte en un salto de fe. Un farolillo por tramo marca donde se
   * pisa sin dejar de ser un bosque de noche.
   */
  private lightShaft(): void {
    const w = this.terrain.widthPx;
    const h = this.terrain.heightPx;
    for (let y = 200; y < h; y += 190) {
      const left = (y / 190) % 2 < 1;
      light(this, left ? w * 0.22 : w * 0.78, y, {
        color: 0xffcf9a,
        radius: 210,
        intensity: 0.2,
      });
    }
    // La cima, donde estan la puerta y el punto de partida: si el
    // arranque esta a oscuras no se ve ni por donde se entra al pozo.
    light(this, w * 0.2, 110, { color: 0xffe9a8, radius: 300, intensity: 0.3 });
    light(this, w * 0.6, 110, { color: 0xffcf9a, radius: 240, intensity: 0.22 });

    // Y un resplandor al fondo, donde esta la llave.
    light(this, w / 2, h - 120, { color: 0xffe9a8, radius: 320, intensity: 0.3 });
    motes(this, { color: 0xffd9a0, count: 16, driftY: -20, scrollFactor: 0.4, depth: 7 });
  }

  /**
   * Presentacion del pozo.
   *
   * La camara se aleja y baja hasta la llave antes de devolver el
   * control. Es la forma mas corta de explicar el nivel: no hace falta
   * decir "baja", se ve que hay que bajar.
   */
  /**
   * Presentacion del nivel.
   *
   * Primero una vista general — la camara se aleja hasta que cabe el
   * nivel entero — para que se entienda la forma de V de un vistazo.
   * Luego vuelve con la heroina y ahi es donde entra el guia a explicar:
   * la llave abajo, la puerta arriba al otro lado, y las cebollas.
   *
   * Durante todo esto no se puede mover. Es medio minuto y solo pasa una
   * vez, y sale mas a cuenta que descubrir el nivel a base de morir.
   */
  protected async intro(): Promise<void> {
    const cam = this.cameras.main;
    const w = this.terrain.widthPx;
    const h = this.terrain.heightPx;

    this.player.lockControls(true);
    cam.stopFollow();

    // Vista general: alejada, pero no tanto como para que no se vea
    // nada. Cabiendo el nivel entero los sprites quedaban del tamano de
    // una mosca, asi que en vez de encogerlo se recorre.
    cam.setZoom(OVERVIEW_ZOOM);
    cam.centerOn(this.player.x + 300, this.player.y + 120);

    // El guion va PEGADO a lo que enseña la camara.
    //
    // Antes el recorrido pasaba en silencio y el guia soltaba las siete
    // frases despues, con la camara ya quieta: decia "ahi abajo hay una
    // llave" cuando la llave llevaba rato fuera de plano. Ahora cada
    // linea cae mientras se esta mirando aquello de lo que habla.
    //
    // Durante el recorrido las frases van como cartel fijo a la
    // pantalla, no en el globo del guia: la camara esta en la otra
    // punta del nivel y el globo no se veria.
    await this.caption(FOREST.intro[0] ?? "", 1200);

    // Baja hasta la llave, siguiendo la ruta.
    const keyX = this.keySprite?.x ?? w / 2;
    const keyY = this.keySprite?.y ?? h - 100;
    const goingDown = this.panTo(keyX, keyY - 60, 2300);
    await this.caption(FOREST.intro[1] ?? "", 2000);
    await goingDown;
    this.flashKey();
    await this.wait(700);

    // Y sube por la derecha hasta la puerta.
    const goingUp = this.panTo(this.door?.x ?? w - 200, (this.door?.y ?? 140) - 60, 2100);
    await this.caption(FOREST.intro[2] ?? "", 1900);
    await goingUp;
    this.flashDoor();
    await this.wait(700);

    // Y ahora se acerca a ella.
    this.tweens.add({
      targets: cam,
      zoom: 1,
      duration: 1400,
      ease: "Cubic.easeInOut",
    });
    await this.panTo(this.player.x, this.player.y - 40, 1600);
    await this.wait(200);

    // El resto ya se lo dice a la cara, con la camara puesta encima.
    await this.guide.enter(this.player.x + 190, this.player.y - 10);
    for (const line of FOREST.intro.slice(3)) {
      await this.guide.say(line);
    }
    this.guide.hideBubble();
    await this.guide.leave();

    cam.startFollow(this.player, true, 0.1, 0.12);
    this.player.lockControls(false);
    this.hud?.announce(FOREST.hintTitle, FOREST.hintSub, 4200, 0xffe9a8);
    this.hud?.setObjective(FOREST.objective);

    // Y a partir de aqui, cebollas. La primera tarda un poco: nadie
    // quiere comerse una en el primer segundo de nivel.
    this.time.addEvent({
      delay: ONION_EVERY_MS,
      startAt: ONION_EVERY_MS - 1400,
      loop: true,
      callback: () => this.launchOnion(),
    });
  }

  /**
   * Señal permanente sobre la puerta, para la vuelta.
   *
   * Esta arriba y en el extremo opuesto: subiendo la pared derecha es
   * facil pasarsela. Un haz de luz que llega hasta el fondo dice donde
   * hay que ir sin tener que escribirlo.
   */
  private markDoor(): void {
    if (!this.door) return;
    const beam = this.add
      .rectangle(this.door.x, this.door.y, 52, this.terrain.heightPx, 0xffe9a8, 0)
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, fillAlpha: 0.16, duration: 800 });
    light(this, this.door.x, this.door.y - 70, {
      color: 0xffe9a8,
      radius: 280,
      intensity: 0.46,
    });
  }

  /** Guiño a la puerta, durante la presentacion. */
  private flashDoor(): void {
    if (!this.door) return;
    audio.sfx.door();
    impactRing(this, this.door.x, this.door.y - 60, 0xffe9a8, 170);
  }

  /** Guiño a la llave para que no haya duda de que es el objetivo. */
  private flashKey(): void {
    if (!this.keySprite) return;
    audio.sfx.key();
    impactRing(this, this.keySprite.x, this.keySprite.y, 0xffe9a8, 140);
    this.tweens.add({
      targets: this.keySprite,
      scale: 0.8,
      duration: 420,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  private panTo(x: number, y: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.cameras.main.pan(x, y, ms, "Sine.easeInOut", false, (_c, progress) => {
        if (progress === 1) resolve();
      });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }

  /**
   * Cartel fijo a la pantalla, para hablar mientras la camara viaja.
   *
   * Va anclado a la vista y no al mundo, asi que se lee igual con la
   * camara en cualquier punto del nivel y a cualquier zoom.
   */
  private caption(text: string, ms: number): Promise<void> {
    if (!text.trim()) return Promise.resolve();

    return new Promise((resolve) => {
      // Hay que deshacer el zoom a mano.
      //
      // Durante la intro la camara esta alejada, y aunque el cartel no
      // haga scroll, el zoom SI le afecta: salia a media altura y
      // encogido a la mitad. Se compensa la escala y se recoloca
      // respecto al centro de la vista, que es el ancla real de un
      // objeto sin scroll.
      const z = this.cameras.main.zoom;
      const place = (target: number): number =>
        GAME_HEIGHT / 2 + (target - GAME_HEIGHT / 2) / z;

      const t = shadow(
        this.add
          .text(GAME_WIDTH / 2, place(GAME_HEIGHT - 74), text, uiTitle(24, 0xf0e6d2))
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setScale(1 / z)
          .setDepth(9000)
          .setWordWrapWidth(720 * z, true)
          .setAlign("center")
          .setAlpha(0),
      );

      this.tweens.add({
        targets: t,
        alpha: 1,
        y: place(GAME_HEIGHT - 84),
        duration: 340,
        hold: Math.max(300, ms - 700),
        yoyo: true,
        onComplete: () => {
          t.destroy();
          resolve();
        },
      });
    });
  }

  protected override onKeyTaken(): void {
    this.markDoor();
    this.alterWorld();
    this.time.delayedCall(3000, () =>
      this.hud?.announce(FOREST.doorUp, FOREST.doorUpSub, 3400, 0xffe9a8),
    );
    void (async () => {
      await this.guide.enter(this.player.x + 130, this.player.y - 150);
      await this.guide.monologue(FOREST.keyTaken);
      this.guide.hideBubble();
      await this.guide.leave();
    })();
  }

  /**
   * La pastilla que guardaba la llave.
   *
   * Cogerla vuelve el bosque tenebroso: fondo alterado, tinte mas
   * enfermo y aldeanos cambiados. La vuelta a la puerta se recorre por
   * el mismo mapa y no se parece en nada al camino de ida.
   */
  private alterWorld(): void {
    if (this.altered) return;
    this.altered = true;

    const pill = this.add
      .image(this.player.x, this.player.y - 60, ITEM.pill)
      .setScale(0.1)
      .setDepth(40);

    // La pastilla aparece y se disuelve: si el mundo cambia por su
    // culpa, tiene que verse quien lo hizo.
    this.tweens.chain({
      targets: pill,
      tweens: [
        { scale: 0.7, angle: 300, duration: 480, ease: "Back.easeOut" },
        { scale: 2.4, alpha: 0, duration: 420, ease: "Quad.easeIn" },
      ],
      onComplete: () => pill.destroy(),
    });

    this.time.delayedCall(520, () => {
      audio.sfx.bossRoar();
      flash(this, 0x4a1240, 420);
      this.cameras.main.shake(520, 0.008);
      this.parallax.alter(1100);
      this.grade.to("forestAltered", 1100);

      for (const v of this.villagers) v.turnAltered();
      for (const c of this.creepers) c.turnAltered();

      this.spawnAlteredWave();
    });
  }

  /**
   * Refuerzos para el camino de vuelta.
   *
   * Sin esto la vuelta seria un paseo por un mapa ya vaciado, que es lo
   * contrario de lo que promete el cambio de ambiente.
   */
  private spawnAlteredWave(): void {
    const floorY = this.terrain.heightPx - TILE * 4;

    for (let i = 0; i < 7; i++) {
      const x = this.terrain.widthPx * (0.18 + i * 0.1);
      // Nada aparece encima de la jugadora: verlo materializarse en la
      // cara se lee como trampa, no como susto.
      if (Math.abs(x - this.player.x) < 300) continue;

      const e: Villager | Creeper =
        i % 3 === 2 ? this.addCreeper(x, floorY, true) : this.addVillager(x, floorY, "altered");

      const sx = e.scaleX;
      const sy = e.scaleY;
      e.setAlpha(0).setScale(sx * 1.6, sy * 1.6);
      this.tweens.add({
        targets: e,
        alpha: 1,
        scaleX: sx,
        scaleY: sy,
        duration: 420,
        delay: i * 90,
        ease: "Quad.easeOut",
      });
    }
  }
}
