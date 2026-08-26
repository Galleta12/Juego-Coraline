import type Phaser from "phaser";
import { INK, css } from "@/config/palette";

/**
 * Estilos de texto.
 *
 * Dos familias y nada mas: una gotica para titulos, que lleva el tono de
 * cuento oscuro, y una serif legible para todo lo demas. Se cargan desde
 * index.html y BootScene espera a que esten listas antes de arrancar,
 * porque Phaser mide el texto al crearlo y con la fuente a medio cargar
 * el resultado queda descuadrado.
 */

export const DISPLAY = '"Grenze Gotisch", "Iowan Old Style", Georgia, serif';
export const BODY = '"Crimson Pro", Georgia, "Times New Roman", serif';

type Style = Phaser.Types.GameObjects.Text.TextStyle;

export const title = (size = 54, color: number = INK.bone): Style => ({
  fontFamily: DISPLAY,
  fontSize: `${size}px`,
  color: css(color),
  align: "center",
});

export const body = (size = 22, color: number = INK.bone): Style => ({
  fontFamily: BODY,
  fontSize: `${size}px`,
  color: css(color),
  align: "center",
  wordWrap: { width: 620, useAdvancedWrap: true },
});

export const label = (size = 15, color: number = INK.thread): Style => ({
  fontFamily: BODY,
  fontSize: `${size}px`,
  color: css(color),
  align: "center",
});

/** Texto de dialogo del guia: mismo cuerpo, alineado a la izquierda. */
export const dialogue = (size = 21): Style => ({
  fontFamily: BODY,
  fontSize: `${size}px`,
  color: css(INK.bone),
  align: "left",
  wordWrap: { width: 520, useAdvancedWrap: true },
});

/** Sombra suave para que el texto se lea sobre cualquier fondo. */
export function shadow<T extends Phaser.GameObjects.Text>(text: T): T {
  text.setShadow(0, 3, "rgba(0,0,0,0.75)", 6, false, true);
  return text;
}

/** Espera a que las fuentes web esten listas. Nunca falla, solo espera. */
export async function fontsReady(): Promise<void> {
  if (!("fonts" in document)) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* si algo falla, se usan las fuentes de respaldo */
  }
}
