import { HEALTH } from "@/config/game";
import { S, type SceneKey } from "@/config/scenes";

/**
 * Estado que sobrevive a los cambios de escena y a un refresco.
 *
 * Se guarda en localStorage porque el brief pide que morir devuelva a la
 * escena actual, no al principio del juego, y que no se pierdan ni el
 * personaje elegido ni el progreso.
 */

/**
 * Los dos personajes elegibles.
 *
 * La azul se retiro a peticion del usuario: se queda solo la rubia y la
 * pelirroja. El tipo ya no la incluye, asi que cualquier referencia
 * suelta la caza el compilador.
 */
export type Skin = "blonde" | "red";
export const SKINS: readonly Skin[] = ["blonde", "red"];

/** A quien se juega si por lo que sea no hay ninguna elegida. */
export const DEFAULT_SKIN: Skin = "red";

export interface GameState {
  selectedHero: Skin | null;

  cake: number;
  maxCake: number;

  hasPickaxe: boolean;
  hasGun: boolean;
  hasKey: boolean;
  hasFinalKey: boolean;

  coffeeUntil: number;

  tutorialDone: boolean;
  bossDefeated: boolean;
  diamondCollected: boolean;
  acceptedMission: boolean;

  /** El gag del creeper del NO y el aviso del guia solo pasan una vez. */
  triedNo: boolean;
  guideBlockedYes: boolean;
  onionWarningShown: boolean;

  checkpoint: SceneKey;

  selectedDate?: string;
  selectedTime?: string;
  /** Lo que escribio en la primera pantalla. */
  playerName?: string;
  /** Que eligio hacer: diamantes o pelicula. */
  selectedActivity?: string;
  sessionId: string;
}

const STORAGE_KEY = "expedicion-diamante:v1";

function freshSession(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const INITIAL: GameState = {
  selectedHero: null,
  cake: HEALTH.max,
  maxCake: HEALTH.max,
  hasPickaxe: false,
  hasGun: false,
  hasKey: false,
  hasFinalKey: false,
  coffeeUntil: 0,
  tutorialDone: false,
  bossDefeated: false,
  diamondCollected: false,
  acceptedMission: false,
  triedNo: false,
  guideBlockedYes: false,
  onionWarningShown: false,
  checkpoint: S.Tutorial,
  sessionId: freshSession(),
};

let state: GameState = load();

function load(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL };
    const saved = JSON.parse(raw) as Partial<GameState>;
    // Se fusiona con INITIAL para que anadir campos nuevos no rompa
    // partidas guardadas de una version anterior.
    return { ...INITIAL, ...saved, sessionId: INITIAL.sessionId };
  } catch {
    return { ...INITIAL };
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* modo incognito o cuota llena: el juego sigue, solo no recuerda */
  }
}

export function getState(): Readonly<GameState> {
  return state;
}

/** Unico punto por el que pasa todo cambio de estado. */
export function setState(patch: Partial<GameState>): void {
  state = { ...state, ...patch };
  persist();
}

export function resetProgress(): void {
  state = { ...INITIAL, sessionId: freshSession() };
  persist();
}

/** Devuelve la vida resultante, ya recortada al rango valido. */
export function damage(amount = 1): number {
  const next = Math.max(0, Math.round((state.cake - amount) * 2) / 2);
  setState({ cake: next });
  return next;
}

export function heal(amount = 1): number {
  const next = Math.min(state.maxCake, Math.round((state.cake + amount) * 2) / 2);
  setState({ cake: next });
  return next;
}

export function refill(): void {
  setState({ cake: state.maxCake });
}

/**
 * Marca de tiempo para el cafe.
 *
 * Reloj de pared, no el de Phaser. El de Phaser cuenta desde que arranca
 * el juego, y como el estado se guarda en localStorage, al recargar la
 * pagina el reloj volvia a cero mientras `coffeeUntil` seguia siendo un
 * numero enorme: el cafe quedaba activo para siempre y la barra del HUD
 * salia llena sin haber tocado ninguno.
 */
export const clock = (): number => Date.now();

export function isCoffeeActive(): boolean {
  return clock() < state.coffeeUntil;
}

/** Cuanto le queda al cafe, en milisegundos. 0 si no hay. */
export function coffeeRemaining(): number {
  return Math.max(0, state.coffeeUntil - clock());
}
