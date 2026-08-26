import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";

/**
 * Ambiente de escena: luz y motas.
 *
 * Un nivel oscuro sin nada que se mueva parece apagado, no tenebroso.
 * Estas dos piezas — farolillos que laten y motas que flotan — cuestan
 * casi nada y hacen que el sitio parezca vivo.
 *
 * Todo se dibuja por debajo del gameplay y sin fisica: es decorado, y
 * no puede estorbar a nadie.
 */

/**
 * Circulo con degradado, compartido por todo el juego.
 *
 * Lo usan las lamparas y las motas de los niveles, y tambien los
 * contraluces de la pantalla de eleccion: un resplandor de verdad tiene
 * que ir difuminado, y una forma plana de Phaser se ve como un disco
 * recortado sobre el fondo negro.
 */
export const GLOW_TEX = "gfx-glow";

/** Genera la textura del resplandor una vez por escena. */
export function buildGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_TEX)) return;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return;

  const c = size / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  // Muchas paradas: con tres se ven los anillos del degradado.
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    grad.addColorStop(t, `rgba(255,255,255,${((1 - t) ** 2.2).toFixed(4)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  scene.textures.addCanvas(GLOW_TEX, canvas);
}

export interface LightOptions {
  color?: number;
  radius?: number;
  intensity?: number;
  /** Cuanto acompaña a la camara. 1 = fijo al mundo. */
  scrollFactor?: number;
  depth?: number;
}

/** Foco de luz en un punto del mundo. Late despacio. */
export function light(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: LightOptions = {},
): Phaser.GameObjects.Image {
  buildGlow(scene);
  const {
    color = 0xffd9a0,
    radius = 180,
    intensity = 0.35,
    scrollFactor = 1,
    depth = 3,
  } = opts;

  const lamp = scene.add
    .image(x, y, GLOW_TEX)
    .setDisplaySize(radius * 2, radius * 2)
    .setTint(color)
    .setAlpha(intensity)
    .setDepth(depth)
    .setScrollFactor(scrollFactor)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: lamp,
    alpha: intensity * 1.45,
    scaleX: lamp.scaleX * 1.08,
    scaleY: lamp.scaleY * 1.08,
    duration: 1400 + Math.random() * 900,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  return lamp;
}

export interface MoteOptions {
  color?: number;
  count?: number;
  /** Hacia donde suben, en pixeles por segundo. Negativo sube. */
  driftY?: number;
  depth?: number;
  scrollFactor?: number;
}

/**
 * Motas de luz flotando por toda la pantalla.
 *
 * Van fijas a la camara y no al mundo: asi llenan siempre el encuadre
 * sin tener que sembrar el nivel entero de particulas.
 */
export function motes(scene: Phaser.Scene, opts: MoteOptions = {}): void {
  buildGlow(scene);
  const {
    color = 0xffe0b0,
    count = 26,
    driftY = -18,
    depth = 4,
    scrollFactor = 0.2,
  } = opts;

  for (let i = 0; i < count; i++) {
    const size = 3 + Math.random() * 9;
    const m = scene.add
      .image(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, GLOW_TEX)
      .setDisplaySize(size * 4, size * 4)
      .setTint(color)
      .setAlpha(0.06 + Math.random() * 0.16)
      .setDepth(depth)
      .setScrollFactor(scrollFactor)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Vaiven horizontal y subida constante, cada una a su ritmo: si van
    // acompasadas se nota que son un bucle.
    const sway = 20 + Math.random() * 46;
    scene.tweens.add({
      targets: m,
      x: m.x + (Math.random() < 0.5 ? sway : -sway),
      duration: 2600 + Math.random() * 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    scene.tweens.add({
      targets: m,
      alpha: 0.02,
      duration: 1800 + Math.random() * 2200,
      yoyo: true,
      repeat: -1,
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      if (!m.active) return;
      m.y += (driftY * delta) / 1000;
      if (m.y < -20) m.y = GAME_HEIGHT + 20;
      if (m.y > GAME_HEIGHT + 20) m.y = -20;
    });
  }
}
