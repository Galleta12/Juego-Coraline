import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { art, bg, bgAltered, parallaxFactor, queue } from "@/systems/Art";

/**
 * Fondo por capas.
 *
 * Tres capas a distinta velocidad: la lejana casi no se mueve, la
 * cercana casi acompana al suelo. Es lo que da profundidad a un mundo
 * plano, y con las capas del pack se nota de verdad.
 */

export type ParallaxScene = "forest" | "tunnel" | "lair";

export interface Parallax {
  /** Cambia a las capas de realidad alterada, con fundido. */
  alter(durationMs?: number): void;
}

export function parallaxKeys(scene: ParallaxScene, altered = false): string[] {
  const layers = SINGLE_LAYER.has(scene)
    ? (["far"] as const)
    : (["far", "mid", "near"] as const);
  return altered && scene === "forest"
    ? layers.map((l) => bgAltered(l))
    : layers.map((l) => bg(scene, l));
}

export function preloadParallax(
  loader: Phaser.Scene,
  scene: ParallaxScene,
  withAltered = false,
): void {
  queue(loader, parallaxKeys(scene));
  if (withAltered && scene === "forest") queue(loader, parallaxKeys(scene, true));
}

/**
 * Freno del parallax por escena.
 *
 * El tunel es una perspectiva unica — un agujero que se aleja hacia un
 * punto de fuga — y no un decorado de capas independientes. Deslizando
 * sus tres capas a velocidades distintas, los circulos concentricos se
 * descuadran y la cueva se convierte en una mancha. Aqui se frena casi
 * del todo: queda algo de profundidad y el dibujo se mantiene entero.
 *
 * El bosque y la guarida si son capas de verdad (arboles delante de
 * arboles) y se quedan como las declara el pack.
 */
const DAMPING: Record<ParallaxScene, number> = {
  forest: 1,
  tunnel: 0.22,
  lair: 1,
};

/**
 * Escenas que se dibujan con una sola capa.
 *
 * Las tres capas del tunel son la MISMA cueva concentrica con distinta
 * transparencia. Apiladas y desplazadas entre si, los circulos se
 * interfieren y el resultado es un moire morado donde no se distingue
 * nada. La capa de fondo sola ya es el dibujo entero — la cueva con su
 * punto de luz al final — y se ve muchisimo mejor.
 */
const SINGLE_LAYER = new Set<ParallaxScene>(["tunnel"]);

/**
 * Ajuste vertical del fondo, en pixeles de textura.
 *
 * Positivo sube el dibujo en pantalla. El tunel lo necesita: su punto de
 * fuga esta en el centro de la imagen y, centrado sin mas, caia justo
 * por debajo de la linea del suelo — el pasillo parecia hundirse en vez
 * de alejarse.
 */
const VERTICAL_NUDGE: Record<ParallaxScene, number> = {
  forest: 0,
  tunnel: 96,
  lair: 0,
};

export function buildParallax(
  scene: Phaser.Scene,
  kind: ParallaxScene,
  worldWidth: number,
): Parallax {
  const layers = ["far", "mid", "near"] as const;
  const normal: Phaser.GameObjects.TileSprite[] = [];
  const altered: Phaser.GameObjects.TileSprite[] = [];

  // El lienzo se hace mas grande que la pantalla y se centra.
  //
  // Con la camara alejada — la presentacion del pozo la baja a 0.62 — se
  // ve mas mundo del que cabe en 960x540, y un tileSprite del tamano
  // justo dejaba franjas negras arriba y a los lados.
  const COVER = 2.2;
  const w = GAME_WIDTH * COVER;
  const h = GAME_HEIGHT * COVER;
  const ox = -(w - GAME_WIDTH) / 2;
  const oy = -(h - GAME_HEIGHT) / 2;

  /**
   * Cuanto hay que ampliar la textura para tapar el alto del lienzo.
   *
   * Sin esto el dibujo se repetia en vertical y se veian bandas: los
   * fondos miden 800 px de alto y el lienzo ampliado pide casi 1000.
   * Se escala la textura, no se repite.
   */
  const tileScale = (key: string): number => Math.max(1, h / art(key).h);

  /**
   * Desplazamiento base para centrar la textura en el lienzo.
   *
   * El lienzo es mas ancho que la pantalla y la textura, ampliada para
   * cubrir el alto, no llega a llenarlo: sin esto se veia el 74%
   * IZQUIERDO del dibujo. En el bosque apenas se nota, pero el tunel es
   * una perspectiva con su punto de fuga en el centro, y ese punto se
   * quedaba fuera de cuadro: la cueva se leia como una mancha.
   */
  const baseOffset = (key: string): { x: number; y: number } => {
    const k = tileScale(key);
    const e = art(key);
    return {
      x: Math.max(0, (e.w - w / k) / 2),
      y: (e.h - h / k) / 2 + (VERTICAL_NUDGE[kind] ?? 0),
    };
  };

  const build = (key: string): Phaser.GameObjects.TileSprite => {
    const t = scene.add.tileSprite(ox, oy, w, h, key).setOrigin(0).setScrollFactor(0);
    const k = tileScale(key);
    t.setTileScale(k, k);
    const base = baseOffset(key);
    t.setTilePosition(base.x, base.y);
    return t;
  };

  const used = SINGLE_LAYER.has(kind) ? (["far"] as const) : layers;

  used.forEach((layer, i) => {
    // La capa cercana se atenua: esta justo detras de la accion y a
    // plena opacidad competia con la heroina y los enemigos.
    const dim = layer === "near" ? 0.72 : 1;
    normal.push(build(bg(kind, layer)).setDepth(i - 10).setAlpha(dim));

    if (kind === "forest" && scene.textures.exists(bgAltered(layer))) {
      altered.push(build(bgAltered(layer)).setDepth(i - 10).setAlpha(0));
    }
  });

  // Las capas se desplazan segun la camara, no segun el mundo: asi el
  // fondo funciona con cualquier ancho de nivel.
  scene.events.on(Phaser.Scenes.Events.UPDATE, () => {
    const sx = scene.cameras.main.scrollX;
    const sy = scene.cameras.main.scrollY;
    used.forEach((layer, i) => {
      // El factor lo declara el propio pack de fondos, no lo inventamos.
      const speed = parallaxFactor(bg(kind, layer)) * (DAMPING[kind] ?? 1);
      // Se divide por la escala de la textura: setTilePosition trabaja
      // en pixeles de textura, no de pantalla, y sin esto el fondo se
      // movia mas rapido de lo que dice su factor.
      const t = normal[i];
      const k = t ? t.tileScaleX : 1;
      const base = baseOffset(bg(kind, layer));
      const px = base.x + (sx * speed) / k;
      const py = base.y + (sy * speed * 0.5) / k;
      t?.setTilePosition(px, py);
      altered[i]?.setTilePosition(px, py);
    });
  });

  void worldWidth;

  return {
    alter(durationMs = 900) {
      if (altered.length === 0) return;
      altered.forEach((a, i) =>
        scene.tweens.add({
          targets: a,
          alpha: used[i] === "near" ? 0.72 : 1,
          duration: durationMs,
        }),
      );
      normal.forEach((n) =>
        scene.tweens.add({ targets: n, alpha: 0, duration: durationMs }),
      );
    },
  };
}
