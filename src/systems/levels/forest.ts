/**
 * Mapa del bosque: baja por un lado y sube por el otro.
 *
 *   #  suelo      S  roca        B  bloque rompible   =  plataforma
 *   P  inicio     D  puerta      k  llave             L  Luna
 *   v  aldeano    V  aldeano alto   x  creeper
 *
 * El recorrido tiene forma de V y es mucho mas ancho que alto: se
 * empieza arriba a la izquierda, se baja en escalera desplazandose hacia
 * la derecha, la llave espera en el fondo, y desde ahi se sube por la
 * pared derecha hasta la puerta. La puerta queda en el extremo opuesto
 * al de salida, arriba, y se ve desde casi todo el nivel.
 *
 * Asi la vuelta no es desandar el camino: son dos mitades distintas.
 *
 * Todos los saltos hacia arriba son de 64 px. La heroina sube 113, asi
 * que no hay ni un tramo que exija clavar el salto — el brief pide cero
 * frustracion y quedarse encerrada abajo es la peor de todas.
 */

const W = 96;

/** Fila con las dos paredes del recinto y el interior que se le pase. */
const row = (inner = ""): string => `SS${inner.padEnd(W - 4, ".").slice(0, W - 4)}SS`;

/** Escribe una repisa y sus marcadores sobre una fila ya construida. */
function withLedge(base: string, from: number, len: number, extra = ""): string {
  const cells = base.split("");
  for (let i = from; i < from + len && i < W - 2; i++) {
    if (cells[i] === ".") cells[i] = "=";
  }
  for (const spec of extra.split(" ")) {
    if (!spec) continue;
    const [col, ch] = spec.split(":");
    const c = Number(col);
    if (Number.isFinite(c) && ch) cells[c] = ch;
  }
  return cells.join("");
}

// Cuatro filas de aire sobre la cima: el guia flota y necesita techo.
const HEIGHT = 31;
const rows: string[] = Array.from({ length: HEIGHT }, () => row());

const put = (r: number, from: number, len: number, extra = ""): void => {
  const base = rows[r];
  if (base) rows[r] = withLedge(base, from, len, extra);
};

/* ── Cima izquierda: donde empieza ─────────────────────────────────── */
rows[5] = row("...P........L");
// Suelo de salida. Se corta a media pantalla: por ahi se baja.
rows[6] = "SS" + "#".repeat(20) + ".".repeat(W - 4 - 20) + "SS";

/* ── Bajada: repisas repartidas, no una diagonal ───────────────────── */
//
// Escrita a mano, tramo por tramo. Una escalera perfecta se lee de un
// vistazo y bajarla es apretar una tecla: aqui las repisas cambian de
// largo y de sitio, a veces hay dos a la misma altura y a veces hay que
// retroceder un poco para encontrar por donde seguir.
//
// La regla que no se rompe: entre una repisa y la de arriba hay como
// mucho dos filas — 64 px, frente a los 113 que sube un salto — y se
// solapan lo suficiente para volver. Variado, pero nunca imposible.
type Step = { row: number; from: number; len: number; mark?: string };

const DOWN: Step[] = [
  { row: 4, from: 20, len: 14 },
  { row: 6, from: 16, len: 9 },
  { row: 6, from: 28, len: 12, mark: "v" },
  { row: 8, from: 12, len: 8 },
  { row: 8, from: 24, len: 16 },
  { row: 10, from: 34, len: 11 },
  { row: 10, from: 18, len: 7 },
  { row: 12, from: 28, len: 9 },
  { row: 12, from: 42, len: 13, mark: "x" },
  { row: 14, from: 36, len: 8 },
  { row: 14, from: 50, len: 10 },
  { row: 16, from: 44, len: 12, mark: "V" },
  { row: 16, from: 60, len: 8 },
  { row: 18, from: 52, len: 9 },
  { row: 18, from: 66, len: 11 },
  { row: 20, from: 58, len: 10 },
  { row: 20, from: 72, len: 9 },
  { row: 22, from: 50, len: 12 },
  { row: 22, from: 66, len: 8 },
  { row: 24, from: 40, len: 14 },
  { row: 24, from: 58, len: 9 },
];

for (const d of DOWN) {
  put(d.row + 3, d.from, d.len, d.mark ? `${d.from + Math.floor(d.len / 2)}:${d.mark}` : "");
}

/* ── Fondo: la llave, tras una pared que hay que picar ─────────────── */
const FLOOR = 29;
const keyCol = 44;
rows[FLOOR] = "SS" + "#".repeat(W - 4) + "SS";
rows[HEIGHT - 1] = "#".repeat(W);

for (let r = FLOOR - 3; r < FLOOR; r++) {
  const cells = rows[r]!.split("");
  for (let c = keyCol; c < keyCol + 7; c++) cells[c] = "B";
  if (r === FLOOR - 2) {
    cells[keyCol + 1] = ".";
    cells[keyCol + 2] = ".";
    cells[keyCol + 3] = "k";
    cells[keyCol + 4] = ".";
    cells[keyCol + 5] = ".";
  }
  rows[r] = cells.join("");
}

/* ── Subida: rincon pegado a la pared derecha ──────────────────────── */
//
// Todas las repisas de vuelta llegan hasta el muro. Asi se sube
// simplemente pegandose a la derecha y saltando: no hay que medir donde
// acaba cada una ni frenar a tiempo.
//
// Con escalones cortos y desplazados la heroina se pasaba de largo con
// la carrerilla, caia al fondo y volvia a empezar. Un rincon es
// imposible de fallar, que es lo que se quiere aqui.
const UP_FROM = 76;
const UP_ENEMIES: Record<number, string> = { 3: "v", 7: "x" };

let upRow = FLOOR - 2;
let step = 0;
while (upRow > 8) {
  const mark = UP_ENEMIES[step];
  put(upRow, UP_FROM, W - 2 - UP_FROM, mark ? `${UP_FROM + 6}:${mark}` : "");
  upRow -= 2;
  step += 1;
}

/* ── La puerta, arriba a la derecha ────────────────────────────────── */
const doorRow = 7;
const doorCol = W - 8;
put(doorRow, UP_FROM, W - 2 - UP_FROM);
const above = rows[doorRow - 1];
if (above) {
  const cells = above.split("");
  cells[doorCol] = "D";
  rows[doorRow - 1] = cells.join("");
}

export const FOREST_MAP: readonly string[] = rows;

export const FOREST_HEIGHT = rows.length;
export const FOREST_WIDTH = W;
