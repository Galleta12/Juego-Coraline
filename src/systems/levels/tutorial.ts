/**
 * Mapa del tutorial.
 *
 * Se escribe como dibujo ASCII: se lee de un vistazo y se reajusta sin
 * abrir un editor de tilemaps.
 *
 *   #  suelo      S  roca        B  bloque rompible   =  plataforma
 *   P  inicio     p  pico        g  pistola           t  diana
 *   c  torta      f  cafe        k  llave             D  puerta
 *   L  Luna
 *
 * El recorrido va de izquierda a derecha y cada bloque de terreno
 * introduce una sola mecanica: caminar, picar, disparar, curarse,
 * acelerar y abrir. Nada se enseña dos veces.
 */

const W = 70;
const pad = (row: string): string => row.padEnd(W, ".");

/** Fila de suelo con huecos, para no contar puntos a mano. */
function ground(pits: readonly (readonly [number, number])[] = []): string {
  const cells = new Array<string>(W).fill("#");
  for (const [start, len] of pits) {
    for (let i = start; i < start + len; i++) cells[i] = ".";
  }
  return cells.join("");
}

/*
 * Alturas, medidas y no estimadas.
 *
 * Con gravedad 1800 y un impulso de 640, un salto sube 114 px — tres
 * filas y media — y con cafe llega a 169, algo mas de cinco.
 *
 * Las dos repisas estaban colocadas por encima de eso: la del cafe a
 * seis filas (192 px) y la del salto suelto a cuatro (128 px). Ninguna
 * de las dos se podia alcanzar, ni bebiendose el cafe. Ahora la del
 * cafe queda a cuatro filas — imposible sin cafe, comoda con el, que es
 * justo lo que tiene que ensenar — y la suelta a tres, al alcance de un
 * salto normal.
 */
export const TUTORIAL_MAP: readonly string[] = [
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  pad(""),
  // Plataforma para probar el salto con cafe: cuatro filas de altura.
  pad("...........................====="),
  // Salto opcional temprano, a tres filas, y muro de practica.
  pad("..............====..BB..............................BBBBB"),
  pad("....................BB..............................BB.BB"),
  // Fila de objetos, a ras de suelo
  pad("....P.......p...........g.....t.....c.....f.........BBkBB......D"),
  ground(),
  ground(),
  ground(),
];

/** Columna donde aparece Luna, una vez presentada. */
export const CAT_SPAWN_COL = 40;
