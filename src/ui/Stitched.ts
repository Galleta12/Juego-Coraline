import Phaser from "phaser";

/**
 * Piezas de tela cosida.
 *
 * El calendario del juego imita un tablero de trapo con botones: paneles
 * de fieltro, pespunte blanco alrededor y botones de cuatro agujeros en
 * las esquinas. Todo se dibuja aqui con Graphics para que no dependa de
 * ningun archivo de imagen y se pueda recolorear a voluntad.
 *
 * El pespunte es lo que vende el efecto. Un rectangulo con borde
 * parece una caja de interfaz; un rectangulo con puntadas parece tela.
 */

export interface PanelStyle {
  fill: number;
  fillAlpha?: number;
  stitch?: number;
  stitchAlpha?: number;
  radius?: number;
  /** Botones en las esquinas. */
  buttons?: boolean;
  buttonColor?: number;
}

/** Puntada discontinua siguiendo el contorno de un rectangulo. */
function stitchRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
): void {
  const dash = 7;
  const gap = 5;
  g.lineStyle(1.6, color, alpha);

  const run = (
    from: [number, number],
    to: [number, number],
  ): void => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(d + dash, len);
      g.beginPath();
      g.moveTo(from[0] + ux * d, from[1] + uy * d);
      g.lineTo(from[0] + ux * e, from[1] + uy * e);
      g.strokePath();
    }
  };

  const i = 7; // el pespunte va por dentro del borde
  run([x + i, y + i], [x + w - i, y + i]);
  run([x + w - i, y + i], [x + w - i, y + h - i]);
  run([x + w - i, y + h - i], [x + i, y + h - i]);
  run([x + i, y + h - i], [x + i, y + i]);
}

/** Boton de cuatro agujeros. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r = 9,
  color = 0x181226,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(1.4, 0x000000, 0.45);
  g.strokeCircle(x, y, r);
  g.fillStyle(0x000000, 0.5);
  const o = r * 0.34;
  const holes: [number, number][] = [
    [-o, -o],
    [o, -o],
    [-o, o],
    [o, o],
  ];
  for (const [dx, dy] of holes) {
    g.fillCircle(x + dx, y + dy, r * 0.16);
  }
  return g;
}

/**
 * Panel de fieltro con pespunte.
 *
 * Devuelve el Graphics para poder meterlo en un contenedor; las
 * coordenadas son relativas al origen que se le pase.
 */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle,
): Phaser.GameObjects.Graphics {
  const {
    fill,
    fillAlpha = 1,
    stitch = 0xf0e6d2,
    stitchAlpha = 0.55,
    radius = 8,
  } = style;

  const g = scene.add.graphics();
  // Sombra suave debajo: despega la tela del fondo.
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 3, y + 4, w, h, radius);

  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(2, 0x000000, 0.4);
  g.strokeRoundedRect(x, y, w, h, radius);

  stitchRect(g, x, y, w, h, stitch, stitchAlpha);
  return g;
}

/** Cinta de titulo, con las puntas recortadas. */
export function banner(
  scene: Phaser.Scene,
  cx: number,
  y: number,
  w: number,
  h: number,
  fill = 0x5a2848,
): Phaser.GameObjects.Graphics {
  const x = cx - w / 2;
  const g = scene.add.graphics();

  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 3, y + 4, w, h, 6);

  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, 6);
  g.lineStyle(2, 0x000000, 0.4);
  g.strokeRoundedRect(x, y, w, h, 6);

  stitchRect(g, x, y, w, h, 0xf0e6d2, 0.6);

  // Hilos sueltos a los lados, como una cinta cosida a mano.
  g.lineStyle(1.4, 0xf0e6d2, 0.3);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * (w / 2), y + h * 0.4);
    g.lineTo(cx + s * (w / 2 + 26), y + h * 0.24);
    g.strokePath();
  }

  return g;
}
