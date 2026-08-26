import type Phaser from "phaser";
import manifest from "@/art/assets.json";
import parallax from "@/art/parallax.json";
import type { Skin } from "@/systems/GameState";

/**
 * Acceso al arte.
 *
 * Todo el juego pide texturas por clave logica y nunca por ruta. El
 * manifiesto lo genera scripts/process_assets.py, asi que si el pack
 * cambia basta con volver a ejecutarlo: aqui no se toca nada.
 */

interface Entry {
  path: string;
  w: number;
  h: number;
  family: string;
}

const ASSETS = manifest.assets as Record<string, Entry>;

export const artKeys = (): string[] => Object.keys(ASSETS);

export function art(key: string): Entry {
  const e = ASSETS[key];
  if (!e) throw new Error(`Textura desconocida: ${key}`);
  return e;
}

export function hasArt(key: string): boolean {
  return key in ASSETS;
}

/** Encola en el cargador de Phaser todo lo que esta escena necesita. */
export function queue(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const k of keys) {
    if (!hasArt(k) || scene.textures.exists(k)) continue;
    scene.load.image(k, art(k).path);
  }
}

/** Todas las claves cuyo nombre empieza por el prefijo dado. */
export function keysUnder(prefix: string): string[] {
  return artKeys().filter((k) => k.startsWith(prefix));
}

/* ── Atajos por familia ────────────────────────────────────────────── */

export const heroKey = (skin: Skin, pose: string): string =>
  `characters/heroine/${skin}/${pose}`;

/**
 * Poses de la heroina, tal y como salen de su lamina.
 *
 * Una sola hoja por personaje con todo dentro: seis tiempos de andar,
 * seis de correr, el salto, tres de recibir un golpe y una de espaldas.
 *
 * El salto va por NOMBRES y no por numeros — `jump-rise`, `jump-air`,
 * `jump-fall`, `jump-land` — porque cada uno se usa en un momento
 * distinto del salto y con numeros habia que ir al pipeline para
 * recordar cual era cual. Las dos hojas no traen los mismos
 * fotogramas (la rubia seis, la pelirroja cuatro), asi que el pipeline
 * reparte los papeles y aqui las dos tienen las mismas claves.
 *
 * `idle-1..N` es la animacion de estar quieta, de pie: no un solo
 * dibujo fijo, varios fotogramas de una hoja aparte
 * (`rubia_usar_idle.png`, `roja_usar_idle.png`) con la respiracion y el
 * pelo asentandose. Las dos hojas no traen el mismo numero de
 * fotogramas — la rubia cinco, la pelirroja seis — asi que se listan
 * hasta el maximo de las dos y cada personaje coge los que tiene: el
 * que no existe para su piel simplemente no se carga (`queue` mira
 * `hasArt` antes de encolar nada).
 */
export const HERO_POSES = [
  "idle-1",
  "idle-2",
  "idle-3",
  "idle-4",
  "idle-5",
  "idle-6",
  "walk-1",
  "walk-2",
  "walk-3",
  "walk-4",
  "walk-5",
  "walk-6",
  "run-1",
  "run-2",
  "run-3",
  "run-4",
  "run-5",
  "run-6",
  "jump-rise",
  "jump-air",
  "jump-fall",
  "jump-land",
  "hit-1",
  "hit-2",
  "hit-3",
  "back",
] as const;

/**
 * El retrato grande de cada heroina, a 480x540.
 *
 * Sale de las hojas `improved_*`, no de una pose de juego ampliada. YA
 * NO se usa en la pantalla de eleccion: esa es ahora una lamina
 * dibujada (`screens/select`) donde solo se ve el pelo. Se deja porque
 * el pipeline lo sigue generando y es la unica cara suelta que hay.
 */
export const portraitKey = (skin: Skin): string => `ui/portrait-${skin}`;

export const GUIDE = {
  idle: "characters/guide/guide-idle",
  fly1: "characters/guide/guide-fly-1",
  fly2: "characters/guide/guide-fly-2",
  point: "characters/guide/guide-point",
  talk1: "characters/guide/guide-talk-1",
  talk2: "characters/guide/guide-talk-2",
} as const;

export const CAT_ART = {
  idle: "companions/cat/idle",
  walk1: "companions/cat/walk-1",
  walk2: "companions/cat/walk-2",
  walk3: "companions/cat/walk-3",
  jump: "companions/cat/jump",
  fall: "companions/cat/fall",
  alert: "companions/cat/alert",
  attack: "companions/cat/attack",
} as const;

export const DOG = {
  appear: "companions/dog/dog-appear",
  offer: "companions/dog/dog-offer",
  dance: "companions/dog/dog-dance",
} as const;

export const ALLY = {
  appear1: "characters/ally/appear-1",
  appear2: "characters/ally/appear-2",
  idle: "characters/ally/idle",
  shoot: "characters/ally/shoot",
  shoot2: "characters/ally/shoot-2",
  disappear: "characters/ally/disappear",
} as const;

export const ITEM = {
  cake: "items/item-chocolate-cake",
  coffee: "items/item-coffee",
  pill: "items/item-pill",
  key: "items/item-button-key",
  door: "items/item-button-door",
  icecream: "items/item-icecream-blue",
  can: "items/monster-can",
  /** La lata grande y dibujada, para el cartel del arma. */
  canBig: "items/monster-can-big",
  /** La cebolla que cruza el bosque. */
  onion: "items/onion-big",
} as const;

export const WEAPON = {
  pickaxe: "weapons/diamond-pickaxe",
  gun: "weapons/monster-raygun",
  gunFiring: "weapons/monster-raygun-firing",
} as const;

export const CELEBRATION = {
  bouquet: "celebration/bouquet-purple-tulips",
  icecream: "celebration/icecream-celebration",
  petals: "celebration/petals",
  tulipPink: "celebration/tulip-pink",
  tulipYellow: "celebration/tulip-yellow",
} as const;

export type BgLevel = "forest" | "forest-altered" | "tunnel" | "lair";
export type BgLayer = "far" | "mid" | "near";

export const bg = (level: BgLevel, layer: BgLayer): string =>
  `backgrounds/${level}/${level}-${layer}`;

export const bgAltered = (layer: BgLayer): string => bg("forest-altered", layer);

/** Factor de scroll declarado por el propio pack de fondos. */
export function parallaxFactor(key: string): number {
  return (parallax.factors as Record<string, number>)[key] ?? 0.4;
}
