import Phaser from "phaser";

/**
 * Piezas de tela cosida.
 *
 * El calendario del juego imita un tablero de trapo con botones: paneles
 * de fieltro, pespunte blanco alrededor y botones de cuatro agujeros en
 * las esquinas. Todo se dibuja aqui a mano para que no dependa de ningun
 * archivo de imagen y se pueda recolorear a voluntad.
 *
 * El pespunte es lo que vende el efecto. Un rectangulo con borde
 * parece una caja de interfaz; un rectangulo con puntadas parece tela.
 *
 * ── Por que esto pinta a TEXTURA y no a Graphics ──────────────────────
 *
 * Un `Graphics` de Phaser no guarda un dibujo: guarda la LISTA DE
 * ORDENES y las vuelve a ejecutar en cada fotograma. Cada panel cosido
 * son unas sesenta puntadas sueltas, cada una con su `beginPath` y su
 * `strokePath`.
 *
 * El calendario llega a tener a la vez cuarenta casillas de dia y hasta
 * veintiseis franjas de hora, y todas son paneles cosidos: pasaban de
 * cuatro mil ordenes de dibujo POR FOTOGRAMA. De ahi venia que la
 * pantalla fuera a tirones y que pulsar una fecha tardara en responder —
 * no era la logica de las fechas, era el repintado.
 *
 * Ahora cada combinacion de tamaño y estilo se dibuja UNA vez a una
 * textura y lo que se pone en pantalla son imagenes, que para la tarjeta
 * grafica es un cuadrado con una foto encima. La cache vive en el gestor
 * de texturas de Phaser, asi que se comparte entre todas las casillas
 * del mismo tamaño y sobrevive a los cambios de escena.
 */

export interface PanelStyle {
  fill: number;
  fillAlpha?: number;
  stitch?: number;
  stitchAlpha?: number;
  radius?: number;
}

/** Cuanto sobresale la sombra por la derecha y por abajo. */
const SHADOW_X = 3;
const SHADOW_Y = 4;

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

  const run = (from: [number, number], to: [number, number]): void => {
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

/**
 * Dibuja una vez y devuelve la clave de la textura.
 *
 * `scene.make.graphics` con `add:false` crea un Graphics suelto que no
 * entra en la lista de dibujo: sirve de lienzo y se tira en cuanto la
 * textura esta hecha.
 */
function bake(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return key;
}

/**
 * Boton de cuatro agujeros, centrado en (x, y).
 *
 * El radio y el color son lo unico que cambia entre unos y otros, asi
 * que la cache va por esos dos: en el calendario hay decenas de botones
 * y casi todos son el mismo dibujo repetido.
 */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r = 9,
  color = 0x181226,
): Phaser.GameObjects.Image {
  // Un pixel de margen: el trazo del contorno se sale medio pixel del
  // radio y sin holgura la textura lo recorta.
  const pad = 2;
  const size = r * 2 + pad * 2;
  const key = bake(scene, `stitch-btn-${r}-${color.toString(16)}`, size, size, (g) => {
    const c = r + pad;
    g.fillStyle(color, 1);
    g.fillCircle(c, c, r);
    g.lineStyle(1.4, 0x000000, 0.45);
    g.strokeCircle(c, c, r);
    g.fillStyle(0x000000, 0.5);
    const o = r * 0.34;
    for (const [dx, dy] of [
      [-o, -o],
      [o, -o],
      [-o, o],
      [o, o],
    ] as [number, number][]) {
      g.fillCircle(c + dx, c + dy, r * 0.16);
    }
  });
  return scene.add.image(x, y, key).setOrigin(0.5);
}

/**
 * Panel de fieltro con pespunte.
 *
 * `x`/`y` son la esquina superior izquierda del panel, igual que cuando
 * esto dibujaba con Graphics: la sombra sobresale por fuera y va dentro
 * de la textura, asi que el origen (0,0) la coloca exactamente donde
 * estaba.
 */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle,
): Phaser.GameObjects.Image {
  const {
    fill,
    fillAlpha = 1,
    stitch = 0xf0e6d2,
    stitchAlpha = 0.55,
    radius = 8,
  } = style;

  const key = `stitch-panel-${Math.round(w)}x${Math.round(h)}-${fill.toString(16)}-${fillAlpha}-${stitch.toString(16)}-${stitchAlpha}-${radius}`;
  bake(scene, key, w + SHADOW_X, h + SHADOW_Y, (g) => {
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(SHADOW_X, SHADOW_Y, w, h, radius);

    g.fillStyle(fill, fillAlpha);
    g.fillRoundedRect(0, 0, w, h, radius);
    g.lineStyle(2, 0x000000, 0.4);
    g.strokeRoundedRect(0, 0, w, h, radius);

    stitchRect(g, 0, 0, w, h, stitch, stitchAlpha);
  });

  return scene.add.image(x, y, key).setOrigin(0, 0);
}

/** Cinta de titulo, con las puntas recortadas. */
export function banner(
  scene: Phaser.Scene,
  cx: number,
  y: number,
  w: number,
  h: number,
  fill = 0x5a2848,
): Phaser.GameObjects.Image {
  // Los hilos sueltos salen 26 px por cada lado; la textura tiene que
  // dejarles sitio o quedan cortados a ras.
  const tail = 28;
  const key = `stitch-banner-${Math.round(w)}x${Math.round(h)}-${fill.toString(16)}`;
  bake(scene, key, w + tail * 2, h + SHADOW_Y, (g) => {
    const x = tail;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x + SHADOW_X, SHADOW_Y, w, h, 6);

    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, 0, w, h, 6);
    g.lineStyle(2, 0x000000, 0.4);
    g.strokeRoundedRect(x, 0, w, h, 6);

    stitchRect(g, x, 0, w, h, 0xf0e6d2, 0.6);

    g.lineStyle(1.4, 0xf0e6d2, 0.3);
    const mid = x + w / 2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(mid + s * (w / 2), h * 0.4);
      g.lineTo(mid + s * (w / 2 + 26), h * 0.24);
      g.strokePath();
    }
  });

  return scene.add.image(cx, y, key).setOrigin(0.5, 0);
}
