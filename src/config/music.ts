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
   * Reservada, sin pista. Ya no la usa nadie.
   *
   * Existia para dejar la guarida en silencio durante la celebracion. Ese
   * silencio sigue estando, pero ahora lo hace `BossScene` a mano
   * (`audio.stopMusic()` y un segundo de espera) porque hace falta que
   * dure EXACTAMENTE un segundo antes de que entre la cancion del final:
   * con un cambio de pista normal se cruzaban las dos en un fundido y el
   * corte no se notaba.
   */
  victory: none(),

  /**
   * La cancion del final.
   *
   * Arranca en la celebracion de la guarida — un segundo despues de que
   * se corte la de la jefa — y NO se vuelve a tocar: la carta del jefe,
   * las laminas, "esta no era la mision", la eleccion, el calendario y
   * el resguardo comparten todos esta misma clave, y `playMusic` no
   * reinicia una pista que ya esta sonando. Suena entera y de corrido
   * por todo el tramo final.
   */
  finale: { file: "final.mp3", volume: 0.62, loop: true },
};

/** Cuánto dura el fundido entre pistas, en milisegundos. */
export const CROSSFADE_MS = 900;

/** Volumen general de la música. Los efectos van aparte. */
export const MUSIC_MASTER = 0.7;
