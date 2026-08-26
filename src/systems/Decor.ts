import Phaser from "phaser";
import { TILE } from "@/config/game";
import { hasArt } from "@/systems/Art";
import type { SceneKind } from "@/systems/Terrain";
import { light } from "@/ui/Atmosphere";

/**
 * Adornos repartidos por el nivel.
 *
 * Los arboles, faroles, setas y cristales salen de las hojas de tiles y
 * se colocan aqui, no en el mapa ASCII. Escribirlos a mano en el mapa
 * obligaria a mover cada adorno cada vez que se retoca una repisa, y el
 * bosque tiene mas de veinte.
 *
 * En vez de eso se leen las superficies del propio mapa y se siembra
 * sobre ellas. El sorteo va con semilla fija: el nivel se ve igual en
 * cada partida, que es lo que se quiere de un decorado — si cambiara
 * cada vez, sacar capturas para comparar no serviria de nada.
 */

interface Prop {
  key: string;
  /** Alto en pixeles del mundo. */
  h: number;
  /** Cuantas veces mas probable que uno de peso 1. */
  weight?: number;
  /** Halo de luz, para lo que brilla por si mismo. */
  glow?: { color: number; radius: number; intensity?: number };
  /** Cuelga del techo en vez de apoyarse en el suelo. */
  hangs?: boolean;
  /** Se dibuja detras del terreno. Para las piezas grandes. */
  behind?: boolean;
}

const p = (key: string, h: number, extra: Partial<Prop> = {}): Prop => ({
  key: `props/${key}`,
  h,
  ...extra,
});

const WARM = { color: 0xffc978, radius: 150, intensity: 0.4 };
const COLD = { color: 0x7fd6ff, radius: 120, intensity: 0.34 };
const VIOLET = { color: 0xc08bff, radius: 120, intensity: 0.3 };

/**
 * Que se planta en cada escena.
 *
 * El bosque lleva madera y luz calida; la cueva, piedra y cristal frio.
 * Nada de mezclarlos: un farol de jardin bajo tierra rompe el sitio.
 */
const SETS: Record<SceneKind, Prop[]> = {
  forest: [
    p("tree-lantern", 300, { weight: 3, glow: WARM, behind: true }),
    p("stump", 96, { weight: 2 }),
    p("fence", 84, { weight: 2 }),
    p("lamppost", 250, { weight: 2, glow: WARM }),
    p("signpost", 140),
    p("well", 180, { behind: true }),
    p("swing", 190, { behind: true }),
    p("rock-big", 104, { weight: 2 }),
    p("rock-small", 74, { weight: 3 }),
    p("barrel", 100),
    p("crate", 100),
    p("mushrooms", 110, { weight: 2, glow: COLD }),
    p("glow-plant", 108, { glow: WARM }),
    p("ladder", 180, { behind: true }),
    p("vines", 170, { hangs: true, weight: 3, behind: true }),
  ],
  tunnel: [
    p("crystals", 92, { weight: 3, glow: VIOLET }),
    p("crystals-blue", 100, { weight: 3, glow: COLD }),
    p("crystals-tall", 132, { weight: 2, glow: VIOLET }),
    p("mushrooms", 110, { weight: 3, glow: COLD }),
    p("rock-big", 104, { weight: 2 }),
    p("rock-small", 74, { weight: 3 }),
    p("coral", 100, { glow: { color: 0xff6a8a, radius: 100, intensity: 0.3 } }),
    p("coral-pink", 110, { glow: VIOLET }),
    p("pillar", 230, { behind: true }),
    p("mossy-pillar", 230, { behind: true }),
    p("stone-arch", 250, { behind: true, weight: 2 }),
    p("waterfall", 280, { behind: true, glow: COLD }),
    p("cart", 104),
    p("barrel", 100),
    p("hang-rock", 170, { hangs: true, weight: 3, behind: true }),
    p("chain", 150, { hangs: true, weight: 2, behind: true }),
    p("vines", 170, { hangs: true, weight: 2, behind: true }),
  ],
  lair: [
    p("crystals-tall", 132, { weight: 2, glow: VIOLET }),
    p("pillar", 230, { behind: true, weight: 2 }),
    p("mossy-pillar", 230, { behind: true }),
    p("stone-arch", 250, { behind: true }),
    p("rock-big", 104, { weight: 2 }),
    p("spike-fence", 100, { weight: 2 }),
    p("chain", 150, { hangs: true, weight: 3, behind: true }),
    p("hang-rock", 170, { hangs: true, weight: 2, behind: true }),
  ],
};

/**
 * Cuanto se llena cada escena.
 *
 * El tunel es un pasillo largo y liso con una sola fila donde apoyar
 * cosas: con el espaciado del bosque se cruzaban cien metros sin ver
 * nada. La guarida va al reves — es una pelea, y el suelo tiene que
 * quedar despejado.
 */
const TUNING: Record<SceneKind, { spacing: number; density: number }> = {
  forest: { spacing: 5, density: 0.5 },
  tunnel: { spacing: 4, density: 0.7 },
  lair: { spacing: 9, density: 0.35 },
};

/** Claves de arte que hay que cargar para decorar esta escena. */
export function decorArtKeys(kind: SceneKind): string[] {
  return SETS[kind].map((d) => d.key).filter(hasArt);
}

const SOLID = new Set(["#", "S", "B"]);

/** Todo lo que sembramos va detras de enemigos (16) y heroina (20). */
const DEPTH_FRONT = 9;
const DEPTH_BEHIND = 2;

export interface DecorOptions {
  /** Puntos que hay que dejar despejados, en pixeles del mundo. */
  avoid?: { x: number; y: number }[];
  /** Cuantas columnas separan como minimo dos adornos. */
  spacing?: number;
  /** Cuantos sitios validos de cada tantos se usan. */
  density?: number;
}

/**
 * Siembra los adornos sobre el mapa.
 *
 * Devuelve los objetos creados por si la escena quiere moverlos o
 * quitarlos despues.
 */
export function scatterDecor(
  scene: Phaser.Scene,
  rows: readonly string[],
  kind: SceneKind,
  opts: DecorOptions = {},
): Phaser.GameObjects.Image[] {
  const set = SETS[kind].filter((d) => hasArt(d.key));
  if (set.length === 0) return [];

  const tune = TUNING[kind];
  const { avoid = [], spacing = tune.spacing, density = tune.density } = opts;
  // Semilla fija: el decorado tiene que salir igual en cada partida.
  const rng = new Phaser.Math.RandomDataGenerator([`decor-${kind}`]);

  const at = (col: number, r: number): string => rows[r]?.[col] ?? ".";
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);

  const floors: { col: number; row: number }[] = [];
  const ceils: { col: number; row: number }[] = [];
  const ledges: { col: number; row: number }[] = [];

  for (let col = 1; col < width - 1; col++) {
    for (let r = 1; r < rows.length; r++) {
      const here = SOLID.has(at(col, r));
      if (here && at(col, r - 1) === ".") {
        floors.push({ col, row: r });
      }
      // Techo de verdad: cara inferior de una masa — solido encima y
      // hueco debajo, sin salirse del mapa.
      //
      // Sin la comprobacion de "solido encima" el suelo del tunel
      // contaba como techo y las estalactitas colgaban por debajo del
      // pasillo, en el vacio.
      if (
        here &&
        SOLID.has(at(col, r - 1)) &&
        r + 2 < rows.length &&
        at(col, r + 1) === "." &&
        at(col, r + 2) === "."
      ) {
        ceils.push({ col, row: r });
      }
      if (at(col, r) === "=") {
        if (at(col, r - 1) === ".") ledges.push({ col, row: r });
        // De las repisas cuelgan lianas y cadenas: es de lo poco que
        // hay a media altura de lo que agarrarse.
        if (at(col, r + 1) === "." && at(col, r + 2) === ".") {
          ceils.push({ col, row: r });
        }
      }
    }
  }

  const tooClose = (x: number, y: number): boolean =>
    avoid.some((a) => Math.abs(a.x - x) < TILE * 3 && Math.abs(a.y - y) < TILE * 4);

  const out: Phaser.GameObjects.Image[] = [];

  const sow = (
    spots: { col: number; row: number }[],
    pool: Prop[],
    hanging: boolean,
    gap: number,
    chance: number,
  ): void => {
    if (pool.length === 0) return;

    // Ruleta por peso: los adornos de relleno salen mas que los raros.
    const bag: Prop[] = [];
    for (const d of pool) for (let i = 0; i < (d.weight ?? 1); i++) bag.push(d);

    let lastCol = -Infinity;
    let last: Prop | null = null;

    for (const spot of spots) {
      if (spot.col - lastCol < gap) continue;
      if (rng.frac() > chance) continue;

      const x = spot.col * TILE + TILE / 2;
      const surface = hanging ? (spot.row + 1) * TILE : spot.row * TILE;
      if (tooClose(x, surface)) continue;

      // Dos tiradas para no repetir el de al lado: en el suelo del
      // fondo salia tocon-roca-tocon-roca y se leia como un patron.
      let def = bag[rng.between(0, bag.length - 1)]!;
      if (def === last) def = bag[rng.between(0, bag.length - 1)]!;
      last = def;

      const img = scene.add
        .image(x, surface, def.key)
        // Apoyado por los pies, o colgado por la cabeza.
        .setOrigin(0.5, hanging ? 0 : 1)
        .setDepth(def.behind ? DEPTH_BEHIND : DEPTH_FRONT);

      // Tamano suelto: dos tocones calcados uno al lado del otro se ven
      // copiados y pegados.
      img.setScale((def.h * rng.realInRange(0.86, 1.16)) / img.height);
      if (rng.frac() < 0.5) img.setFlipX(true);

      if (def.glow) {
        light(scene, x, surface - (hanging ? -def.h * 0.4 : def.h * 0.45), {
          ...def.glow,
          depth: def.behind ? DEPTH_BEHIND - 1 : DEPTH_FRONT - 1,
        });
      }

      out.push(img);
      lastCol = spot.col;
    }
  };

  const standing = set.filter((d) => !d.hangs);
  const hanging = set.filter((d) => d.hangs);
  sow(floors, standing, false, spacing + 2, density);

  // El tunel es un pasillo sin techo dibujado — su techo es el fondo. Se
  // cuelga entonces del borde de arriba del mundo, que es justo donde la
  // cueva del fondo se cierra: sin esto la cueva no tiene estalactitas.
  const roof =
    ceils.length > 0
      ? ceils
      : Array.from({ length: width - 2 }, (_, i) => ({ col: i + 1, row: -1 }));
  sow(roof, hanging, true, spacing, density);

  // Las repisas atravesables solo reciben adornos de fondo. Sirven para
  // llenar la mitad de arriba del nivel, que si no queda pelada — pero
  // tienen que quedar DETRAS, porque un barril encima de la repisa
  // esconde donde se pisa.
  sow(ledges, standing.filter((d) => d.behind), false, spacing + 6, density * 0.7);
  return out;
}
