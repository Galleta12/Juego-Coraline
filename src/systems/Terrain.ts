import Phaser from "phaser";
import { TILE } from "@/config/game";
import { audio } from "@/systems/AudioSystem";
import { hitStop, impactRing, sparks } from "@/ui/Effects";

/**
 * Terreno por tiles, con bloques destructibles al estilo Terraria.
 *
 * Los mapas se escriben como dibujos ASCII: se leen de un vistazo y se
 * ajustan sin abrir un editor de tilemaps, que para cuatro niveles
 * cortos seria mas herramienta que juego.
 *
 * No todo es rompible a proposito. Solo los tiles marcados como `B`
 * ceden al pico; la roca y el suelo aguantan, para que la jugadora no
 * pueda desmontar el nivel entero por accidente.
 */

export const Cell = {
  Empty: ".",
  Ground: "#",
  Stone: "S",
  Breakable: "B",
  Platform: "=",
} as const;

export type SceneKind = "forest" | "tunnel" | "lair";

export interface TerrainMarkers {
  /** Todo lo que no es terreno: puntos de aparicion, objetos, enemigos. */
  [symbol: string]: { x: number; y: number }[];
}

export interface BuiltTerrain {
  solids: Phaser.Physics.Arcade.StaticGroup;
  platforms: Phaser.Physics.Arcade.StaticGroup;
  breakables: Phaser.Physics.Arcade.StaticGroup;
  markers: TerrainMarkers;
  widthPx: number;
  heightPx: number;
}

const TERRAIN_CHARS = new Set<string>([
  Cell.Empty,
  Cell.Ground,
  Cell.Stone,
  Cell.Breakable,
  Cell.Platform,
]);

const tex = (scene: SceneKind, name: string): string => `tiles/${scene}/${name}`;

/** Centro del tile en pixeles del mundo. */
const cx = (col: number): number => col * TILE + TILE / 2;
const cy = (row: number): number => row * TILE + TILE / 2;

export function buildTerrain(
  scene: Phaser.Scene,
  rows: readonly string[],
  kind: SceneKind,
): BuiltTerrain {
  const height = rows.length;
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);

  const solids = scene.physics.add.staticGroup();
  const platforms = scene.physics.add.staticGroup();
  const breakables = scene.physics.add.staticGroup();
  const markers: TerrainMarkers = {};

  const at = (col: number, row: number): string => rows[row]?.[col] ?? Cell.Empty;
  const solidAt = (col: number, row: number): boolean => {
    const c = at(col, row);
    return c === Cell.Ground || c === Cell.Stone || c === Cell.Breakable;
  };

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const ch = at(col, row);
      const x = cx(col);
      const y = cy(row);

      if (!TERRAIN_CHARS.has(ch)) {
        // Cualquier otro caracter es un marcador para la escena.
        (markers[ch] ??= []).push({ x, y });
        continue;
      }

      switch (ch) {
        case Cell.Ground: {
          // Cara de superficie si arriba esta despejado; relleno si no.
          const covered = solidAt(col, row - 1);
          const t = solids.create(x, y, tex(kind, covered ? "ground-fill" : "ground-top"));
          t.setDisplaySize(TILE, TILE).setDepth(5).refreshBody();
          break;
        }
        case Cell.Stone: {
          const t = solids.create(x, y, tex(kind, "stone"));
          t.setDisplaySize(TILE, TILE).setDepth(5).refreshBody();
          break;
        }
        case Cell.Breakable: {
          const b = breakables.create(x, y, tex(kind, "breakable")) as
            Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
          b.setDisplaySize(TILE, TILE).setDepth(6).refreshBody();
          b.setData("hp", 2);
          break;
        }
        case Cell.Platform: {
          // 22 px de alto, como el tile: aplastarla a 14 perdia el canto
          // iluminado, que es justo lo que la hace visible de lejos.
          const p = platforms.create(x, row * TILE + 11, tex(kind, "platform")) as
            Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
          p.setDisplaySize(TILE, 22).setDepth(7).refreshBody();
          // Solo se pisa desde arriba: se puede subir a traves.
          p.body.checkCollision.down = false;
          p.body.checkCollision.left = false;
          p.body.checkCollision.right = false;
          break;
        }
        default:
          break;
      }
    }
  }

  return {
    solids,
    platforms,
    breakables,
    markers,
    widthPx: width * TILE,
    heightPx: height * TILE,
  };
}

/**
 * Altura del suelo bajo un punto.
 *
 * Recorre el terreno solido y las repisas buscando la superficie mas
 * alta que quede por debajo de `fromY`. Se usa para dejar caer objetos
 * sin fisica: se calcula donde van a aterrizar y se les anima el arco.
 *
 * Con fisica de verdad el botin rebotaba, se hundia en el tile y acababa
 * colandose por debajo del mapa — un objeto con rebote sobre un cuerpo
 * estatico se separa mal y termina escapando.
 *
 * Devuelve `null` si ahi abajo no hay nada.
 */
export function groundYAt(
  terrain: BuiltTerrain,
  x: number,
  fromY: number,
): number | null {
  let best: number | null = null;

  const consider = (group: Phaser.Physics.Arcade.StaticGroup) => {
    for (const obj of group.getChildren()) {
      const t = obj as Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
      if (!t.active) continue;
      if (Math.abs(t.x - x) > TILE / 2) continue;
      const top = t.y - t.displayHeight / 2;
      if (top < fromY - 4) continue;
      if (best === null || top < best) best = top;
    }
  };

  consider(terrain.solids);
  consider(terrain.platforms);
  consider(terrain.breakables);
  return best;
}

/**
 * Golpea un bloque rompible. Devuelve true si se ha destruido.
 *
 * Dos golpes, no uno: un solo impacto se siente accidental, y tres ya
 * cansa cuando hay que abrir un hueco entero.
 */
export function hitBreakable(
  scene: Phaser.Scene,
  terrain: BuiltTerrain,
  block: Phaser.Types.Physics.Arcade.SpriteWithStaticBody,
  fromAngle = 0,
): boolean {
  const hp = ((block.getData("hp") as number) ?? 1) - 1;
  block.setData("hp", hp);

  if (hp > 0) {
    audio.sfx.pickaxeHit();
    scene.tweens.add({
      targets: block,
      scaleX: block.scaleX * 0.86,
      scaleY: block.scaleY * 0.92,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    impactRing(scene, block.x, block.y, 0xe8d3a0, 30);
    sparks(scene, block.x, block.y, fromAngle, 0xd9b877, 7);
    burstAt(scene, block.x, block.y, 5);
    hitStop(scene, 40);
    return false;
  }

  audio.sfx.blockBreak();
  impactRing(scene, block.x, block.y, 0xffe9a8, 52);
  sparks(scene, block.x, block.y, fromAngle, 0xd9b877, 12);
  burstAt(scene, block.x, block.y, 16);
  hitStop(scene, 70);
  terrain.breakables.remove(block, true, true);
  return true;
}

/** Escombros al picar. Pequeno, pero sin esto el golpe no se siente. */
export function burstAt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  tint: number = 0xb99a7a,
): void {
  for (let i = 0; i < count; i++) {
    const p = scene.add
      .rectangle(x, y, 4 + Math.random() * 4, 4 + Math.random() * 4, tint)
      .setDepth(30);
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 90;
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed + 30,
      alpha: 0,
      angle: (Math.random() - 0.5) * 240,
      duration: 380 + Math.random() * 320,
      onComplete: () => p.destroy(),
    });
  }
}
