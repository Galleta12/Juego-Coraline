/**
 * Mapa del tunel.
 *
 *   #  suelo      P  inicio      D  puerta
 *   v  aldeano    V  aldeano alto   x  creeper   L  Luna
 *
 * Un pasillo largo, sin un solo bloque que picar. El tunel no es un
 * puzle: es el trecho de miedo entre el bosque y la guarida, y todo lo
 * que hay que hacer es cruzarlo esquivando lo que sale.
 *
 * El suelo va bien abajo, casi al borde de la pantalla. El fondo es una
 * cueva que se aleja hacia un punto de luz, y con el suelo a media
 * altura se comia justo la mitad que da la sensacion de profundidad.
 */

const W = 210;
const H = 14;

/**
 * El suelo BAJA en dos escalones.
 *
 * Antes era plano de punta a punta, y seis mil setecientos pixeles de
 * linea recta se cruzaban sin levantar la vista: el final se veia igual
 * que el principio. Con dos descensos se nota que la cueva se hunde
 * hacia dentro.
 *
 * Solo baja, nunca sube: para avanzar no hay que saltar nada.
 */
const STEPS: readonly (readonly [number, number])[] = [
  // [desde esta columna, cuantas filas mas abajo queda el suelo]
  [0, 0],
  [70, 1],
  [140, 2],
];

/** En que fila empieza el suelo para una columna dada. */
function floorRow(col: number): number {
  let drop = 0;
  for (const [from, d] of STEPS) if (col >= from) drop = d;
  return H - 3 + drop;
}

/**
 * Donde va cada cosa, columna a columna.
 *
 * Repartidos de sobra: uno cada quinientos pixeles, mas o menos. El
 * tunel asusta por lo que suena y por lo largo que es, no por la
 * cantidad de cosas que hay que matar.
 */
const MARKERS =
  "...P....L...........x.................v...................V..............x" +
  ".................v...................x................V............v" +
  "................x.................v..................V.............D";

function build(): string[] {
  // El mapa NO crece con los escalones: el suelo baja dentro del alto
  // de siempre. Al anadirle filas por abajo el suelo pasaba a tener
  // cinco de grosor y se comia media pantalla como un ladrillo.
  const rows = Array.from({ length: H }, () => ".".repeat(W).split(""));

  for (let col = 0; col < W; col++) {
    for (let r = floorRow(col); r < H; r++) rows[r]![col] = "#";
  }

  // Los marcadores van justo encima del suelo de SU columna, que con
  // los escalones ya no es siempre el mismo.
  for (let col = 0; col < Math.min(MARKERS.length, W); col++) {
    const ch = MARKERS[col];
    if (!ch || ch === ".") continue;
    rows[floorRow(col) - 1]![col] = ch;
  }

  return rows.map((r) => r.join(""));
}

export const TUNNEL_MAP: readonly string[] = build();

export const TUNNEL_WIDTH = W;
