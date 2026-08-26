import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { GRADES, type Grade } from "@/config/palette";

/**
 * Gradacion de escena: una capa de tinte y una vineta por encima de todo.
 *
 * Es lo que hace que los assets pertenezcan al mismo mundo. El pack
 * mezcla dibujo cel-shaded con renders casi fotorrealistas; cuando todos
 * comparten la misma luz, el ojo deja de leerlos como piezas sueltas.
 */

export const VIGNETTE_TEX = "gfx-vignette";
export const BULLET_TEX = "gfx-bullet";

/**
 * Textura del proyectil Monster.
 *
 * Se genera en vez de venir del pack: un grupo de fisica sin textura por
 * defecto crea sprites sin cuerpo valido, y los disparos no salian.
 */
export function buildBullet(scene: Phaser.Scene): void {
  if (scene.textures.exists(BULLET_TEX)) return;

  const w = 24;
  const h = 10;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return;

  // Nucleo claro con halo verde: se ve el trazo aunque el disparo falle.
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(155,239,79,0)");
  grad.addColorStop(0.45, "rgba(155,239,79,0.85)");
  grad.addColorStop(1, "rgba(233,255,208,1)");
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(0, h / 2 - 3, w, 6, 3);
  g.fill();

  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.arc(w - 5, h / 2, 3.4, 0, Math.PI * 2);
  g.fill();

  scene.textures.addCanvas(BULLET_TEX, canvas);
}

/** Genera la textura de vineta una vez, en el arranque. */
export function buildVignette(scene: Phaser.Scene): void {
  if (scene.textures.exists(VIGNETTE_TEX)) return;

  // A baja resolucion el degradado se estira y salen anillos
  // concentricos. A tamano completo el banding desaparece.
  const w = GAME_WIDTH;
  const h = GAME_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return;

  const grad = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.92);
  // Muchas paradas suaves en vez de tres: el ojo detecta los saltos.
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    grad.addColorStop(t, `rgba(0,0,0,${(t * t * 0.98).toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  scene.textures.addCanvas(VIGNETTE_TEX, canvas);
}

const DEPTH = 9000;

/**
 * Cuanto mas grandes que la pantalla se dibujan las capas de ambiente.
 *
 * Van fijadas a la camara pero el zoom tambien las encoge, asi que hay
 * que dibujarlas con margen. 2.2 cubre hasta zoom 0.45, y la vista
 * general del bosque — la mas alejada del juego — se queda en 0.5.
 */
const COVER = 2.2;

export class SceneGrade {
  private readonly tintLayer: Phaser.GameObjects.Rectangle;
  private readonly vignette: Phaser.GameObjects.Image;
  private current: Grade;

  constructor(private readonly scene: Phaser.Scene, gradeName: keyof typeof GRADES) {
    this.current = GRADES[gradeName] ?? GRADES.forest!;

    // Mas grandes que la pantalla, y centradas.
    //
    // Van fijadas a la camara, pero el zoom tambien las encoge: con el
    // tamano justo, al alejar la camara — la presentacion del bosque
    // baja a 0.55 — la capa de color solo cubria un trozo y se veia como
    // un cuadrado negro plantado en medio del nivel.
    const w = GAME_WIDTH * COVER;
    const h = GAME_HEIGHT * COVER;
    const ox = -(w - GAME_WIDTH) / 2;
    const oy = -(h - GAME_HEIGHT) / 2;

    this.tintLayer = scene.add
      .rectangle(ox, oy, w, h, this.current.tint, this.current.strength)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.vignette = scene.add
      .image(ox, oy, VIGNETTE_TEX)
      .setOrigin(0)
      .setDisplaySize(w, h)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setAlpha(this.current.vignette);
  }

  /** Cambia la gradacion con un fundido: la pastilla lo usa. */
  to(gradeName: keyof typeof GRADES, durationMs = 600): void {
    const next = GRADES[gradeName];
    if (!next) return;
    this.current = next;

    this.tintLayer.setFillStyle(next.tint, this.tintLayer.alpha);
    this.scene.tweens.add({
      targets: this.tintLayer,
      alpha: next.strength,
      duration: durationMs,
    });
    this.scene.tweens.add({
      targets: this.vignette,
      alpha: next.vignette,
      duration: durationMs,
    });
  }

  /** Pulso de vineta: para golpes y sustos. */
  pulse(amount = 0.2, durationMs = 220): void {
    this.scene.tweens.add({
      targets: this.vignette,
      alpha: Math.min(1, this.current.vignette + amount),
      duration: durationMs * 0.35,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => this.vignette.setAlpha(this.current.vignette),
    });
  }

  destroy(): void {
    this.tintLayer.destroy();
    this.vignette.destroy();
  }
}
