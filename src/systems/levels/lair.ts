/**
 * Arena de la Otra Madre.
 *
 *   #  suelo      S  roca        =  plataforma
 *   P  inicio     c  torta       M  la jefa
 *
 * Un recinto cerrado de dos pantallas. Aqui no se recorre nada: se
 * pelea, y hace falta sitio para esquivar sin salirse de la camara.
 *
 * Tres alturas de plataformas escalonadas y bien solapadas. Con un
 * suelo liso la pelea era plana — se reducia a andar a izquierda y
 * derecha — y las cebollas se esquivaban siempre igual. Trepando se
 * puede saltar por encima de ellas, caer sobre la jefa y quitarse de en
 * medio cuando salta.
 */

const W = 62;
const solid = (): string => "#".repeat(W);

/**
 * Fila del recinto: muros a los lados y el interior que se le pase.
 *
 * Se construye asi y no con padEnd porque una fila corta acababa
 * rellenandose con puntos DETRAS del muro derecho, y abria un boquete
 * por el que la jefa se salia de la arena.
 */
const row = (inner = ""): string => `SS${inner.padEnd(W - 4, ".").slice(0, W - 4)}SS`;

/**
 * Cielo de la guarida.
 *
 * Doce filas de aire por encima del recinto. La Otra Madre ahora VUELA,
 * y con el techo pegado a las repisas no tenia por donde subir: se
 * quedaba rozando las plataformas y la embestida no llegaba a leerse
 * como una caida.
 *
 * Ademas la camara se aleja para que quepan las dos, y con la arena
 * antigua — diez filas, 320 px — la vista era mas alta que el mapa y se
 * veia el vacio por debajo del suelo.
 */
const SKY = 12;

export const LAIR_MAP: readonly string[] = [
  ...Array.from({ length: SKY }, () => row()),
  row(".........................................................."),
  // Piso alto: dos repisas cortas, para saltar por encima de todo
  row("......====................====................====......"),
  row(".........................................................."),
  // Piso medio: el mas util, cruza casi toda la arena
  row("...=======.......=======........=======.......=======....."),
  row(".....c................................................c..."),
  // Piso bajo: escalones para subir desde el suelo
  row(".=====.....=====......=====......=====.....=====.........."),
  row(".........................................................."),
  row("...P.......................M.............................."),
  solid(),
  solid(),
];

export const LAIR_WIDTH = W;
