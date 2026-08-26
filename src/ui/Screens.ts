import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { audio } from "@/systems/AudioSystem";
import { GLOW_TEX, buildGlow } from "@/ui/Atmosphere";

/**
 * Piezas para las pantallas finales, que ya no son juego sino laminas.
 *
 * En esas pantallas los botones YA ESTAN DIBUJADOS en el fondo — los
 * carteles de diamantes, pelicula y NO, o los tres platos. Volver a
 * pintarlos encima quedaria como un parche sobre la ilustracion, asi
 * que lo que se hace es poner zonas sensibles justo donde caen, con un
 * resplandor que se enciende al pasar por encima.
 *
 * Las zonas se declaran en fracciones del fondo, no en pixeles: la
 * lamina se escala para cubrir la pantalla y en pixeles fijos se
 * descolocarian en cuanto cambie el tamaño de la ventana.
 */

export interface SpotBox {
  /** Centro y tamaño, en fracciones del ancho y alto de la lamina. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pone la lamina cubriendo la pantalla y la devuelve. */
export function fitCover(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  const img = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key);
  const k = Math.max(GAME_WIDTH / img.width, GAME_HEIGHT / img.height);
  return img.setScale(k);
}

export interface HotspotOptions {
  color: number;
  onPick: () => void;
  /** Texto que aparece al pasar por encima. */
  hint?: string;
}

/**
 * Una zona clicable sobre un trozo dibujado del fondo.
 *
 * No dibuja el boton: lo ilumina. Al pasar por encima enciende un
 * resplandor y levanta un poco la zona; al pulsar, da un golpe de luz.
 */
export class Hotspot {
  readonly zone: Phaser.GameObjects.Zone;
  private readonly glow: Phaser.GameObjects.Rectangle;
  private readonly ring: Phaser.GameObjects.Rectangle;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    bg: Phaser.GameObjects.Image,
    box: SpotBox,
    private readonly opts: HotspotOptions,
  ) {
    // De fracciones de la lamina a pixeles de pantalla, contando la
    // escala con la que se ha colocado el fondo.
    const w = box.w * bg.displayWidth;
    const h = box.h * bg.displayHeight;
    const x = bg.x + (box.x - 0.5) * bg.displayWidth;
    const y = bg.y + (box.y - 0.5) * bg.displayHeight;

    this.glow = scene.add
      .rectangle(x, y, w, h, opts.color, 0)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.ring = scene.add
      .rectangle(x, y, w, h)
      .setDepth(21)
      .setStrokeStyle(3, opts.color, 0);

    this.zone = scene.add
      .zone(x, y, w, h)
      .setDepth(22)
      .setInteractive({ useHandCursor: true });

    this.zone.on("pointerover", () => this.hover(true));
    this.zone.on("pointerout", () => this.hover(false));
    this.zone.on("pointerdown", () => {
      if (!this.enabled) return;
      this.punch();
      opts.onPick();
    });
  }

  /**
   * ¿Esta el raton lo bastante cerca?
   *
   * Lo usa el boton del NO para escaparse ANTES de que lo pulsen. Se
   * mide contra el rectangulo, no contra el centro: si no, acercarse
   * por una esquina no contaba y el boton se dejaba pillar.
   */
  isPointerNear(px: number, py: number, margin: number): boolean {
    const halfW = this.zone.width / 2 + margin;
    const halfH = this.zone.height / 2 + margin;
    return Math.abs(px - this.zone.x) < halfW && Math.abs(py - this.zone.y) < halfH;
  }

  private hover(on: boolean): void {
    if (!this.enabled) return;
    if (on) audio.sfx.uiHover();

    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: on ? 0.22 : 0,
      duration: 220,
    });
    this.scene.tweens.add({
      targets: this.ring,
      // strokeAlpha no es animable, asi que se mueve el alfa del objeto.
      alpha: on ? 1 : 0,
      duration: 220,
    });
    if (on) this.ring.setStrokeStyle(3, this.opts.color, 0.9);
  }

  private punch(): void {
    audio.sfx.uiSelect();
    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: 0.6,
      duration: 90,
      yoyo: true,
    });
  }

  /** Aparta la zona y todo lo que la acompaña. */
  moveBy(dx: number, dy: number, duration: number): void {
    const targets = [this.glow, this.ring, this.zone];
    // Se queda dentro de la pantalla: apartandose siempre en la misma
    // direccion acababa fuera del lienzo y ya no se podia ni intentar.
    const nx = Phaser.Math.Clamp(this.zone.x + dx, GAME_WIDTH * 0.18, GAME_WIDTH * 0.82);
    const ny = Phaser.Math.Clamp(this.zone.y + dy, GAME_HEIGHT * 0.2, GAME_HEIGHT * 0.86);

    this.scene.tweens.add({
      targets,
      x: nx,
      y: ny,
      duration,
      ease: "Back.easeOut",
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }

  get x(): number {
    return this.zone.x;
  }

  get y(): number {
    return this.zone.y;
  }

  get width(): number {
    return this.zone.width;
  }

  get height(): number {
    return this.zone.height;
  }
}

/** Lo minimo que necesita `glowPulse`: cualquier zona con posicion y tamaño. */
export interface Pulsable {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DodgeButtonOptions {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  onPick: () => void;
}

/**
 * Un boton de verdad que huye del raton.
 *
 * A diferencia de `Hotspot` — que ilumina un cartel ya dibujado en el
 * fondo y nunca mueve pixeles — este ES el cartel: una imagen suelta
 * que se puede reposicionar. Hace falta para el NO de la eleccion:
 * el cartel tiene que apartarse de verdad, no solo su zona de clic.
 */
export class DodgeButton {
  readonly image: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  /** La escala que da `setDisplaySize`, no 1 — el hover parte de aqui. */
  private readonly baseScale: number;
  private enabled = true;
  private hovered = false;

  constructor(
    private readonly scene: Phaser.Scene,
    opts: DodgeButtonOptions,
  ) {
    buildGlow(scene);

    this.glow = scene.add
      .image(opts.x, opts.y, GLOW_TEX)
      .setDisplaySize(opts.w * 1.3, opts.h * 1.9)
      .setTint(opts.color)
      .setAlpha(0.16)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.image = scene.add
      .image(opts.x, opts.y, opts.key)
      .setDepth(22)
      .setInteractive({ useHandCursor: true });
    // Cabe DENTRO de la caja, no la rellena. `w`/`h` vienen de medir el
    // hueco del cartel viejo, y este boton es un dibujo nuevo con su
    // propio aspecto — casi seguro distinto. Rellenar con
    // `setDisplaySize(w, h)` lo estira sin avisar; con esto, como mucho
    // sale un pelin mas bajo que el hueco, nunca deformado.
    this.baseScale = Math.min(opts.w / this.image.width, opts.h / this.image.height);
    this.image.setScale(this.baseScale);

    this.image.on("pointerover", () => this.hover(true));
    this.image.on("pointerout", () => this.hover(false));
    this.image.on("pointerdown", () => {
      if (!this.enabled) return;
      this.punch();
      opts.onPick();
    });
  }

  /** ¿Esta el raton lo bastante cerca? Igual que en `Hotspot`. */
  isPointerNear(px: number, py: number, margin: number): boolean {
    const halfW = this.image.displayWidth / 2 + margin;
    const halfH = this.image.displayHeight / 2 + margin;
    return Math.abs(px - this.image.x) < halfW && Math.abs(py - this.image.y) < halfH;
  }

  private hover(on: boolean): void {
    if (!this.enabled || this.hovered === on) return;
    this.hovered = on;
    if (on) audio.sfx.uiHover();

    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: on ? 0.4 : 0.16,
      duration: 220,
    });
    this.scene.tweens.add({
      targets: this.image,
      scale: this.baseScale * (on ? 1.04 : 1),
      duration: 220,
      ease: "Quad.easeOut",
    });
  }

  private punch(): void {
    audio.sfx.uiSelect();
    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: 0.7,
      duration: 90,
      yoyo: true,
    });
  }

  /** Aparta el boton de verdad, imagen incluida. */
  moveBy(dx: number, dy: number, duration: number): void {
    const nx = Phaser.Math.Clamp(this.image.x + dx, GAME_WIDTH * 0.18, GAME_WIDTH * 0.82);
    const ny = Phaser.Math.Clamp(this.image.y + dy, GAME_HEIGHT * 0.2, GAME_HEIGHT * 0.86);

    this.scene.tweens.add({
      targets: [this.image, this.glow],
      x: nx,
      y: ny,
      duration,
      ease: "Back.easeOut",
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.image.setInteractive({ useHandCursor: true });
    else this.image.disableInteractive();
  }

  get x(): number {
    return this.image.x;
  }

  get y(): number {
    return this.image.y;
  }

  get width(): number {
    return this.image.displayWidth;
  }

  get height(): number {
    return this.image.displayHeight;
  }
}

/** Llama la atencion sobre una zona, sin pulsarla. */
export function glowPulse(scene: Phaser.Scene, spot: Pulsable, color: number): void {
  const halo = scene.add
    .rectangle(spot.x, spot.y, spot.width, spot.height, color, 0.3)
    .setDepth(19)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: halo,
    fillAlpha: 0,
    scaleX: 1.12,
    scaleY: 1.12,
    duration: 620,
    repeat: 2,
    onComplete: () => halo.destroy(),
  });
}

/**
 * Ambiente para las laminas del final.
 *
 * Las pantallas de eleccion son ilustraciones fijas, y una imagen que no
 * se mueve se lee como una pantalla de carga: se mira una vez y se
 * pulsa. Esto le da aire — motas que suben, un latido de luz y algun
 * destello — sin tapar el dibujo ni distraer de los carteles, que es de
 * lo que va la pantalla.
 *
 * Todo va por DEBAJO de las zonas clicables, asi que nada de esto roba
 * un clic.
 */
export function screenAmbience(scene: Phaser.Scene, tint: number): void {
  // Motas flotando hacia arriba, como polvo en un local con poca luz.
  scene.time.addEvent({
    delay: 260,
    loop: true,
    callback: () => {
      const x = Math.random() * GAME_WIDTH;
      const p = scene.add
        .circle(x, GAME_HEIGHT + 12, 1.4 + Math.random() * 2.6, tint, 0.5)
        .setDepth(8)
        .setBlendMode(Phaser.BlendModes.ADD);

      scene.tweens.add({
        targets: p,
        y: -20,
        // Se va ladeando: subir en linea recta parece una barra de
        // progreso, no polvo.
        x: x + (Math.random() - 0.5) * 130,
        alpha: 0,
        duration: 7000 + Math.random() * 5000,
        onComplete: () => p.destroy(),
      });
    },
  });

  // Latido de luz sobre toda la lamina: muy suave, solo para que el
  // cuadro respire.
  const glow = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, tint, 0.05)
    .setOrigin(0)
    .setDepth(9)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: glow,
    fillAlpha: 0.11,
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  // Y de vez en cuando un destello suelto, como un reflejo.
  scene.time.addEvent({
    delay: 1700,
    loop: true,
    callback: () => {
      const s = scene.add
        .circle(
          Math.random() * GAME_WIDTH,
          GAME_HEIGHT * (0.15 + Math.random() * 0.6),
          2 + Math.random() * 3,
          0xfff3d0,
          0.85,
        )
        .setDepth(10)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: s,
        alpha: 0,
        scale: 3.2,
        duration: 900 + Math.random() * 700,
        onComplete: () => s.destroy(),
      });
    },
  });
}

/** Chispas en un punto. Para los impactos de las pantallas finales. */
export function spark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const p = scene.add
      .circle(x, y, 3 + Math.random() * 5, color, 0.95)
      .setDepth(63)
      .setBlendMode(Phaser.BlendModes.ADD);
    const a = Math.random() * Math.PI * 2;
    const d = 60 + Math.random() * 220;
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      scale: 0.2,
      duration: 500 + Math.random() * 420,
      onComplete: () => p.destroy(),
    });
  }
}
