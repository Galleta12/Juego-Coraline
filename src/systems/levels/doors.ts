/**
 * Sala de las dos puertas.
 *
 *   #  suelo      P  inicio      Y  puerta del SI   N  puerta del NO
 *
 * Un recinto de una sola pantalla y suelo liso. No hay nada que
 * esquivar ni nada que picar: aqui solo se camina hacia una de las dos
 * puertas, y esa es toda la mecanica que hace falta.
 */

const W = 30;

export const DOORS_MAP: readonly string[] = [
  "..............................",
  "..............................",
  "..............................",
  "..............................",
  "..............................",
  "..............................",
  "........Y..........N..........",
  "..............P...............",
  "##############################",
  "##############################",
];

export const DOORS_WIDTH = W;
