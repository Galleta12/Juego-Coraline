/**
 * ═══════════════════════════════════════════════════════════════════
 *  MÚSICA — este archivo es para ti
 * ═══════════════════════════════════════════════════════════════════
 *
 * Para poner música en una escena:
 *
 *   1. Deja el archivo en  public/assets/audio/
 *   2. Escribe su nombre abajo, en la escena que le toque
 *   3. Ya está. El juego hace el crossfade solo.
 *
 * Acepta .mp3, .ogg y .wav. Si una entrada queda vacía, esa escena
 * simplemente va sin música: el juego nunca se rompe por eso.
 *
 * El volumen es 0..1 y se puede ajustar pista por pista, porque los
 * archivos no suelen venir todos al mismo nivel.
 */

export interface Track {
  /** Nombre del archivo dentro de public/assets/audio/. Vacío = sin música. */
  file: string;
  /** 0..1 */
  volume: number;
  loop: boolean;
}

const none = (): Track => ({ file: "", volume: 0.6, loop: true });

/**
 * Una pista por clave, no por escena.
 *
 * Escenas distintas pueden compartir clave, y eso es intencionado: la
 * musica solo se corta cuando la clave cambia. Asi la cancion del final
 * arranca en la pantalla de las letras y sigue sonando entera por la
 * sala de las puertas, el calendario y el resguardo, en vez de volver a
 * empezar en cada pantalla.
 */
export const MUSIC: Record<string, Track> = {
  /** Cuaderno de apertura y seleccion de personaje. */
  intro: { file: "intro.mp3", volume: 0.55, loop: true },

  tutorial: { file: "tutorial.mp3", volume: 0.5, loop: true },

  /** El bosque, tambien despues de la pastilla: no se corta al alterarse. */
  forest: { file: "bosque.mp3", volume: 0.5, loop: true },

  tunnel: { file: "tunel.mp3", volume: 0.55, loop: true },
  boss: { file: "jefa.mp3", volume: 0.6, loop: true },

  /**
   * Silencio durante la celebracion en la guarida.
   *
   * A proposito: la de la jefa se apaga, quedan solo los efectos de la
   * lluvia de tortas, y la cancion entra de golpe en el corte a las
   * letras. Ese golpe se pierde si suena algo de fondo mientras tanto.
   */
  victory: none(),

  /** Del corte con las letras hasta el resguardo, sin interrupcion. */
  finale: { file: "final.mp3", volume: 0.62, loop: true },
};

/** Cuánto dura el fundido entre pistas, en milisegundos. */
export const CROSSFADE_MS = 900;

/** Volumen general de la música. Los efectos van aparte. */
export const MUSIC_MASTER = 0.7;
