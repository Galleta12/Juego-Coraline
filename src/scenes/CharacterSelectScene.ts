import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SAFE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { SELECT } from "@/config/strings";
import { queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { SKINS, setState, type Skin } from "@/systems/GameState";
import { GLOW_TEX, buildGlow } from "@/ui/Atmosphere";
import { SceneGrade } from "@/ui/Grade";
import { label, shadow, title } from "@/ui/text";

/**
 * Seleccion de personaje.
 *
 * La pantalla entera es una lamina dibujada — titulo, las dos melenas y
 * sus nombres vienen ya en el PNG — asi que aqui no se pinta ni el
 * titulo ni los marcos: se ilumina lo que ya esta dibujado, igual que en
 * las pantallas del final.
 *
 * Se ve el PELO y nada mas: las dos estan de espaldas. La cara se ve por
 * primera vez dentro del juego, y eso lo resuelve la lamina, que trae
 * las melenas a 442x527 — el problema de antes era que una pose de
 * juego ampliada salia blanda, no la idea.
 *
 * Cada panel se recorta aparte (`screens/select-<skin>`) y se planta
 * clavado encima de su hueco en la lamina. Esa copia es la que se mueve:
 * el fondo no se toca, y como la copia solo CRECE nunca deja ver el
 * hueco de debajo.
 */

const BG = "screens/select";

const PANEL_ART: Record<Skin, string> = {
  blonde: "screens/select-blonde",
  red: "screens/select-red",
};

/** La lamina, en sus propios pixeles. */
const LAMINA = { w: 1638, h: 960 } as const;

/**
 * Donde empieza y acaba lo DIBUJADO dentro de la lamina.
 *
 * De la primera fila del titulo a la ultima de los nombres. El resto es
 * fondo vacio, y es lo que se puede dejar fuera de pantalla sin perder
 * nada.
 */
const CONTENT = { top: 23, bottom: 832 } as const;

/**
 * Donde cae cada panel dentro de la lamina, en pixeles de la lamina.
 *
 * Son las lineas del marco dibujado, medidas sobre el PNG, y son las
 * MISMAS cajas con las que `process_screens.py` saca los recortes: si se
 * cambian aqui hay que cambiarlas alli o la copia deja de encajar.
 */
const PANEL_BOX: Record<Skin, { x: number; y: number; w: number; h: number }> = {
  blonde: { x: 290, y: 222, w: 442, h: 527 },
  red: { x: 907, y: 221, w: 445, h: 527 },
};

/** El acento de cada una es su propio color de pelo. */
const HAIR: Record<Skin, number> = {
  blonde: 0xe8c24a,
  red: 0xd2312c,
};

/**
 * Alto y ancho de la fila de la pregunta.
 *
 * Cae sobre la franja de los nombres dibujados, que para entonces ya
 * estan apagados por el velo. Es el unico sitio que queda por dentro del
 * margen seguro: el modo ENVELOP recorta hasta 44 px por arriba y por
 * abajo en pantallas anchas.
 */
const ROW = GAME_HEIGHT - SAFE - 22;
const BTN_H = 32;
const BTN_W = 136;

const DEPTH = {
  bg: 0,
  motes: 3,
  halo: 4,
  copy: 5,
  ring: 6,
  veil: 10,
  chosenHalo: 11,
  chosenCopy: 12,
  chosenRing: 13,
  ui: 20,
  hit: 30,
} as const;

interface Slot {
  skin: Skin;
  hair: number;
  copy: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  /** Escala de reposo del contraluz, que no es cuadrado. */
  haloScale: { x: number; y: number };
  ring: Phaser.GameObjects.Rectangle;
  hit: Phaser.GameObjects.Zone;
  /** Centro y tamano del panel, ya en pixeles de pantalla. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Escala de reposo de la copia. */
  base: number;
  hovered: boolean;
}

export class CharacterSelectScene extends Phaser.Scene {
  private slots: Slot[] = [];
  private chosen: Skin | null = null;
  private confirmLayer: Phaser.GameObjects.Container | null = null;
  private veil: Phaser.GameObjects.Rectangle | null = null;
  /** Escala de la lamina: de pixeles del PNG a pixeles de pantalla. */
  private k = 1;

  constructor() {
    super(S.CharacterSelect);
  }

  preload(): void {
    queue(this, [BG, ...SKINS.map((s) => PANEL_ART[s])]);
  }

  create(): void {
    this.slots = [];
    this.chosen = null;
    this.confirmLayer = null;
    this.veil = null;

    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(600, 8, 6, 14);
    new SceneGrade(this, "select");
    void audio.playMusic("intro");

    // Lo DIBUJADO de la lamina, metido entero en el margen seguro.
    //
    // Antes se colocaba a lo ancho y pegada arriba, y el titulo quedaba
    // a 13 px del borde: en una pantalla mas ancha que 16:9 el modo
    // ENVELOP recorta hasta 44 px por arriba y se comia media linea.
    // Ahora manda el contenido — del titulo a los nombres — y lo que
    // sobra son dos dedos de fondo a los lados, que ni se ven con la
    // vineta encima.
    this.k = (GAME_HEIGHT - SAFE * 2) / (CONTENT.bottom - CONTENT.top);
    const top = SAFE - CONTENT.top * this.k;

    const bg = this.add.image(GAME_WIDTH / 2, top, BG).setOrigin(0.5, 0);
    bg.setScale(this.k).setDepth(DEPTH.bg);

    buildGlow(this);

    this.ambience();

    for (const skin of SKINS) this.slots.push(this.makeSlot(skin));
  }

  /**
   * Vida para la lamina.
   *
   * Una ilustracion quieta se lee como una pantalla de carga. Motas
   * subiendo y un latido de luz muy flojo bastan para que la pantalla
   * respire; todo por debajo de las zonas clicables, asi que nada de
   * esto roba un clic.
   */
  private ambience(): void {
    this.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => {
        const x = Math.random() * GAME_WIDTH;
        const p = this.add
          .circle(x, GAME_HEIGHT + 10, 1 + Math.random() * 2.2, 0xd9c7a0, 0.4)
          .setDepth(DEPTH.motes)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: p,
          y: -20,
          // Ladeandose: subir recto parece una barra de progreso.
          x: x + (Math.random() - 0.5) * 120,
          alpha: 0,
          duration: 6500 + Math.random() * 4500,
          onComplete: () => p.destroy(),
        });
      },
    });

    const pulse = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x7c4a86, 0.03)
      .setOrigin(0)
      .setDepth(DEPTH.motes)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: pulse,
      fillAlpha: 0.09,
      duration: 2800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private makeSlot(skin: Skin): Slot {
    const box = PANEL_BOX[skin];
    const w = box.w * this.k;
    const h = box.h * this.k;
    // De pixeles de la lamina a pixeles de pantalla: la lamina va
    // centrada a lo ancho y colgada del margen seguro por arriba.
    const x = GAME_WIDTH / 2 + (box.x + box.w / 2 - LAMINA.w / 2) * this.k;
    const y = SAFE + (box.y + box.h / 2 - CONTENT.top) * this.k;
    const hair = HAIR[skin];

    // Contraluz del color de su pelo, detras del panel. Es lo que hace
    // que de un vistazo se lea de quien es cada melena.
    //
    // Con degradado, no con una elipse plana: sobre un fondo casi negro
    // una forma solida no parece luz, parece un disco de color pegado
    // detras del cuadro.
    const halo = this.add
      .image(x, y, GLOW_TEX)
      .setDisplaySize(w * 1.7, h * 1.5)
      .setTint(hair)
      // Apagado: se encienden al entrar en la escena, uno detras de otro.
      .setAlpha(0)
      .setDepth(DEPTH.halo)
      .setBlendMode(Phaser.BlendModes.ADD);

    const copy = this.add.image(x, y, PANEL_ART[skin]).setDepth(DEPTH.copy);
    copy.setDisplaySize(w, h);
    const base = copy.scaleX;

    // El marco YA esta dibujado en la lamina: esto solo lo enciende.
    const ring = this.add
      .rectangle(x, y, w, h)
      .setDepth(DEPTH.ring)
      .setStrokeStyle(2, hair, 0.9)
      .setAlpha(0);

    const hit = this.add
      .zone(x, y, w + 20, h + 40)
      .setDepth(DEPTH.hit)
      .setInteractive({ useHandCursor: true });

    const slot: Slot = {
      skin,
      hair,
      copy,
      halo,
      haloScale: { x: halo.scaleX, y: halo.scaleY },
      ring,
      hit,
      x,
      y,
      w,
      h,
      base,
      hovered: false,
    };

    hit.on("pointerover", () => this.hover(slot, true));
    hit.on("pointerout", () => this.hover(slot, false));
    hit.on("pointerdown", () => this.pick(slot));

    this.awaken(slot);

    // Y unas chispas del color de su pelo saliendo de la melena, muy de
    // vez en cuando. Es lo que las diferencia estando quietas.
    this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => this.emberFrom(slot, slot.hovered ? 3 : 1),
    });

    return slot;
  }

  /**
   * La pantalla se enciende.
   *
   * Los dos contraluces se prenden uno detras de otro y su marco da un
   * destello al hacerlo. Es lo unico que puede entrar animado: la copia
   * del panel no puede aparecer con un fundido porque debajo esta el
   * MISMO dibujo en la lamina, asi que aparecer no se veria — solo se
   * puede jugar con la luz.
   */
  private awaken(slot: Slot): void {
    const delay = slot.skin === "blonde" ? 300 : 620;

    this.tweens.add({
      targets: slot.halo,
      alpha: 0.16,
      duration: 620,
      delay,
      ease: "Quad.easeOut",
      onComplete: () => this.breathe(slot),
    });

    this.tweens.add({
      targets: slot.ring,
      alpha: 0.6,
      duration: 340,
      delay,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  /**
   * Respiracion de reposo del contraluz.
   *
   * Una desfasada de la otra: si las dos laten igual parece un parpadeo
   * de la pantalla y no dos personajes. Mata antes lo que hubiera
   * corriendo sobre el halo — si no, el latido y el fundido del hover se
   * pelean por el mismo alfa y el resultado parpadea.
   */
  private breathe(slot: Slot): void {
    this.tweens.killTweensOf(slot.halo);
    slot.halo.setAlpha(0.16);
    this.tweens.add({
      targets: slot.halo,
      alpha: 0.24,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: slot.skin === "blonde" ? 0 : 1100,
    });
  }

  /** Chispas del color del pelo subiendo desde el panel. */
  private emberFrom(slot: Slot, count: number): void {
    for (let i = 0; i < count; i++) {
      const ex = slot.x + (Math.random() - 0.5) * slot.w * 0.8;
      const ey = slot.y + slot.h * (0.1 + Math.random() * 0.35);
      const p = this.add
        .circle(ex, ey, 1.2 + Math.random() * 2, slot.hair, 0.75)
        .setDepth(DEPTH.ring)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: p,
        y: ey - 70 - Math.random() * 90,
        x: ex + (Math.random() - 0.5) * 50,
        alpha: 0,
        scale: 0.4,
        duration: 1400 + Math.random() * 900,
        onComplete: () => p.destroy(),
      });
    }
  }

  private hover(slot: Slot, on: boolean): void {
    if (this.confirmLayer) return;
    if (slot.hovered === on) return;
    this.setHover(slot, on);
  }

  private setHover(slot: Slot, on: boolean): void {
    slot.hovered = on;
    if (on) audio.sfx.uiHover();

    // Crece MAS de lo que sube. Si subiera mas de lo que crece, por
    // abajo asomaria el panel de la lamina y se veria doble.
    this.tweens.add({
      targets: slot.copy,
      scale: on ? slot.base * 1.06 : slot.base,
      y: on ? slot.y - 6 : slot.y,
      duration: 260,
      ease: "Quad.easeOut",
    });
    this.tweens.killTweensOf(slot.halo);
    this.tweens.add({
      targets: slot.halo,
      alpha: on ? 0.5 : 0.16,
      scaleX: slot.haloScale.x * (on ? 1.1 : 1),
      scaleY: slot.haloScale.y * (on ? 1.1 : 1),
      duration: 280,
      ease: "Quad.easeOut",
      // Al soltarla vuelve a respirar; mientras esta encima, no, o el
      // latido se comeria el resalte.
      onComplete: on ? undefined : () => this.breathe(slot),
    });
    this.tweens.add({
      targets: slot.ring,
      alpha: on ? 1 : 0,
      scale: on ? 1.06 : 1,
      duration: 260,
    });

    if (on) this.emberFrom(slot, 5);
  }

  private pick(slot: Slot): void {
    if (this.confirmLayer) return;
    this.chosen = slot.skin;
    audio.sfx.uiSelect();

    // Golpe de luz en el panel elegido.
    const flash = this.add
      .rectangle(slot.x, slot.y, slot.w, slot.h, 0xfff3d0, 0.5)
      .setDepth(DEPTH.chosenRing)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      fillAlpha: 0,
      scale: 1.1,
      duration: 420,
      onComplete: () => flash.destroy(),
    });
    this.emberFrom(slot, 14);

    this.spotlight(slot);
    this.showConfirm(slot);
  }

  /**
   * Foco sobre la elegida.
   *
   * Un velo cubre la pantalla y la elegida se queda POR ENCIMA: asi la
   * otra melena y los rotulos de la lamina se apagan solos, sin tener
   * que taparlos con nada.
   */
  private spotlight(slot: Slot): void {
    const veil = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, INK.void, 0)
      .setOrigin(0)
      .setDepth(DEPTH.veil);
    this.veil = veil;
    this.tweens.add({ targets: veil, fillAlpha: 0.72, duration: 320 });

    slot.copy.setDepth(DEPTH.chosenCopy);
    slot.halo.setDepth(DEPTH.chosenHalo);
    slot.ring.setDepth(DEPTH.chosenRing);

    for (const other of this.slots) {
      if (other === slot) continue;
      other.hit.disableInteractive();
      // Primero se mata el latido y DESPUES se apaga: al reves, el
      // killTweensOf se llevaba por delante el propio fundido.
      this.tweens.killTweensOf(other.halo);
      this.tweens.add({ targets: other.halo, alpha: 0, duration: 240 });
      this.tweens.add({ targets: other.ring, alpha: 0, duration: 240 });
    }
  }

  /**
   * La pregunta, en la franja de abajo y en UNA sola fila.
   *
   * No es un cuadro en medio de la pantalla a proposito: lo que hay que
   * mirar para decidir es la melena, y un panel centrado la tapaba justo
   * cuando toca fijarse en ella.
   *
   * Y en una fila porque el lienzo va en modo ENVELOP: en una pantalla
   * muy ancha se recortan hasta 44 px logicos por abajo (`SAFE`), y
   * apilando pregunta y botones el segundo renglon caia dentro de lo que
   * se pierde.
   */
  private showConfirm(slot: Slot): void {
    const layer = this.add.container(0, 0).setDepth(DEPTH.ui);
    this.confirmLayer = layer;

    // Franja oscura bajo la melena: los nombres vienen dibujados en la
    // lamina y, aun apagados por el velo, se leian por detras de la
    // pregunta. Empieza por debajo del panel, asi que no la tapa.
    const band = this.add
      .rectangle(0, ROW - 20, GAME_WIDTH, GAME_HEIGHT - (ROW - 20), INK.void, 0.93)
      .setOrigin(0);
    layer.add(band);

    const ask = shadow(
      this.add
        .text(0, ROW, `${SELECT.names[slot.skin]} · ${SELECT.confirm}`, title(26, INK.bone))
        .setOrigin(0, 0.5),
    );
    ask.setLetterSpacing(3);
    layer.add(ask);

    // Todo el grupo centrado: la pregunta lleva el nombre dentro, asi
    // que su ancho cambia con el personaje y no vale una x fija.
    const gap = 22;
    const step = BTN_W + 14;
    const total = ask.width + gap + BTN_W + step;
    const left = (GAME_WIDTH - total) / 2;

    ask.setX(left);
    const yesX = left + ask.width + gap + BTN_W / 2;

    layer.add(this.button(yesX, ROW, SELECT.yes, slot.hair, () => this.confirm()));
    layer.add(
      this.button(yesX + step, ROW, SELECT.change, INK.boneDim, () => this.cancel()),
    );

    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 240, delay: 120 });
  }

  private button(
    x: number,
    y: number,
    text: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const draw = (a: number) => {
      g.clear();
      g.fillStyle(INK.void, 0.72);
      g.fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 3);
      g.lineStyle(1.5, color, a);
      g.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 3);
    };
    draw(0.5);

    const t = this.add.text(0, 0, text, label(16, INK.bone)).setOrigin(0.5);
    t.setLetterSpacing(3);
    c.add([g, t]);

    const hit = this.add
      .rectangle(0, 0, BTN_W, BTN_H, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => {
      draw(1);
      audio.sfx.uiHover();
    });
    hit.on("pointerout", () => draw(0.5));
    hit.on("pointerdown", onClick);
    c.add(hit);

    return c;
  }

  private cancel(): void {
    audio.sfx.uiDeny();
    const layer = this.confirmLayer;
    this.confirmLayer = null;
    this.chosen = null;

    if (layer) {
      this.tweens.add({
        targets: layer,
        alpha: 0,
        duration: 180,
        onComplete: () => layer.destroy(),
      });
    }

    const veil = this.veil;
    this.veil = null;
    if (veil) {
      this.tweens.add({
        targets: veil,
        fillAlpha: 0,
        duration: 240,
        onComplete: () => veil.destroy(),
      });
    }

    // Todo vuelve al reposo: depths, halos y la respiracion de cada una.
    for (const slot of this.slots) {
      slot.copy.setDepth(DEPTH.copy);
      slot.halo.setDepth(DEPTH.halo);
      slot.ring.setDepth(DEPTH.ring);
      this.setHover(slot, false);
      slot.hit.setInteractive({ useHandCursor: true });
    }
  }

  private confirm(): void {
    if (!this.chosen) return;
    audio.sfx.uiConfirm();
    setState({ selectedHero: this.chosen });

    this.cameras.main.fadeOut(560, 8, 6, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(S.Tutorial);
    });
  }
}
