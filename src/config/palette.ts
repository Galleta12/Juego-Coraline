/**
 * Paleta del juego, sacada del propio arte.
 *
 * Los assets vienen de fuentes distintas y algunos son practicamente
 * fotorrealistas. La gradacion de escena que usa estos tokens es lo que
 * los hace pertenecer al mismo mundo: cuando todo comparte la misma luz,
 * el ojo deja de notar que los dibujos no casan del todo.
 */

export const INK = {
  void: 0x08060e,
  ink: 0x140d1f,
  bruise: 0x2b1a3f,
  thread: 0x7c4a86,
  bone: 0xe6dccb,
  boneDim: 0x8d8497,
  gold: 0xd9a441,
  pill: 0xd63b47,
  blood: 0x8e1c28,
  diamond: 0x4ee0d8,
  herb: 0x4a8f4a,
  cake: 0x8a5230,
  creeper: 0x54a054,
} as const;

/** Gradacion por escena: tinte, fuerza y vineta. */
export interface Grade {
  tint: number;
  /** 0..1 — cuanto tine. Por encima de .35 se nota demasiado. */
  strength: number;
  /** 0..1 — cuanto se cierra la vineta. */
  vignette: number;
}

export const GRADES: Record<string, Grade> = {
  storybook: { tint: 0x2b1a3f, strength: 0.22, vignette: 0.75 },
  select: { tint: 0x2b1a3f, strength: 0.16, vignette: 0.6 },
  tutorial: { tint: 0x35306a, strength: 0.2, vignette: 0.5 },
  forest: { tint: 0x2a2050, strength: 0.28, vignette: 0.58 },
  forestAltered: { tint: 0x4a1240, strength: 0.32, vignette: 0.62 },
  tunnel: { tint: 0x3d0b3a, strength: 0.3, vignette: 0.66 },
  // La guarida se quedaba casi negra. Se aclara el tinte y se abre la
  // viñeta; el ambiente lo pone ahora la iluminacion de la escena, no la
  // oscuridad.
  boss: { tint: 0x6a2030, strength: 0.2, vignette: 0.5 },
  victory: { tint: 0xd9a441, strength: 0.14, vignette: 0.34 },
  trueMission: { tint: 0x2b1a3f, strength: 0.24, vignette: 0.6 },
};

export const css = (color: number): string =>
  `#${color.toString(16).padStart(6, "0")}`;
