/** Resolucion, fisica y ritmo. Un solo sitio que tocar para reequilibrar. */

/**
 * 960x540 logicos, 16:9 exacto. El arte se guarda al doble para que
 * aguante 1080p; Phaser escala la escena entera al tamano de la ventana.
 */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/**
 * Margen que puede quedar fuera de pantalla.
 *
 * El lienzo escala en modo ENVELOP: cubre la ventana entera y recorta
 * lo que sobra. En un monitor muy ancho se pierden unos 36 px logicos
 * por arriba y por abajo, asi que nada importante — HUD, carteles,
 * avisos — puede vivir mas cerca del borde que esto.
 */
export const SAFE = 44;

/** Lado del tile del terreno destructible. */
export const TILE = 32;

export const PHYSICS = {
  gravityY: 1800,
} as const;

export const PLAYER = {
  width: 34,
  height: 76,
  speed: 260,
  jumpVelocity: -640,
  /** Frames de gracia tras salir de una plataforma. */
  coyoteMs: 120,
  /** Un salto pulsado justo antes de tocar suelo sigue valiendo. */
  jumpBufferMs: 140,
  /** Al soltar el salto se corta la subida: altura variable. */
  jumpCutMultiplier: 0.42,
  invulnerableMs: 1400,
  /** Cadencia del arma, en milisegundos entre disparos. */
  fireRateMs: 260,
  pickaxeCooldownMs: 380,
  pickaxeReach: 74,
} as const;

export const COFFEE = {
  durationMs: 8000,
  fireRateMultiplier: 0.5, // la mitad de espera = el doble de cadencia
  jumpMultiplier: 1.22,
  speedMultiplier: 1.15,
} as const;

export const HEALTH = {
  max: 5,
  /** El zarpazo del gato quita media torta. */
  catDamage: 0.5,
  /**
   * Media torta por roce, torta y media por explosion.
   *
   * Con dano entero el bosque vaciaba las cinco tortas en cinco
   * segundos de contacto, y el brief pide dificultad casi nula.
   */
  villagerDamage: 0.5,
  creeperDamage: 1.5,
} as const;

export const ENEMY = {
  /**
   * Dos disparos y cae.
   *
   * Con tres, cada aldeano era una pequena pelea y el nivel se convertia
   * en una sucesion de tiroteos. Dos se siente rapido sin llegar a ser
   * gratis.
   */
  villagerHp: 2,
  villagerSpeed: 74,
  /**
   * Velocidad de persecucion.
   *
   * Subida: antes se dejaban perder andando hacia atras y no llegaban a
   * dar miedo nunca. Siguen sin poder matar de un golpe — la dificultad
   * esta en la presion, no en el dano.
   */
  chaserSpeed: 142,
  /** A partir de aqui te ven y van a por ti. */
  chaseRange: 430,
  /** Distancia a la que se lanzan. */
  lungeRange: 250,
  lungeCooldownMs: 1400,
  creeperHp: 2,
  creeperSpeed: 58,
  /**
   * Distancia a la que el creeper empieza a sisear.
   *
   * Corta a proposito: con 300 px se oian tres a la vez desde el otro
   * lado del nivel y el siseo se convertia en ruido de fondo constante.
   * El susto funciona cuando suena uno y esta cerca.
   */
  creeperHissRange: 150,
  /** Distancia a la que empieza a hincharse. Luego ya no hay vuelta. */
  creeperFuseRange: 105,
  creeperFuseMs: 1150,
  creeperBlastRadius: 145,
} as const;

export const CAT = {
  /** Distancia a la que se queda detras de la jugadora. */
  followGap: 96,
  speed: 300,
  /** Solo ataca aldeanos, y solo dentro de este radio. */
  attackRange: 120,
  attackCooldownMs: 2200,
  /** Con un creeper mas cerca que esto, se espanta y no ataca. */
  scaredRange: 200,
} as const;

/** Ritmo objetivo: la experiencia entera entre 5 y 7 minutos. */
export const PACING = {
  tutorialMs: 70_000,
  forestMs: 140_000,
  tunnelMs: 60_000,
  bossMs: 110_000,
} as const;
