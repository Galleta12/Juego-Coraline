/**
 * Muestra tipografica. Solo desarrollo: sirve para revisar la fuente
 * bitmap ampliada y cazar glifos rotos, que a 1x no se ven.
 *
 *   npm run dev  ->  http://localhost:5173/dev/specimen.html
 */
import { textCanvas } from "../src/art/PixelCanvas";

const SAMPLES: [string, string][] = [
  ["Mayúsculas", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  ["Minúsculas", "abcdefghijklmnopqrstuvwxyz"],
  ["Cifras", "0123456789"],
  ["Signos", ".,:;!?¿¡-_·…'\"/()[]%+=*#✓⚠♦"],
  ["Acentos altos", "ÁÉÍÓÚÜÑ"],
  ["Acentos bajos", "áéíóúüñ"],
  ["Frase 1", "No debería ser difícil. Espero."],
  ["Frase 2", "¿Me ayudas a encontrar diamantes en Minecraft?"],
  ["Frase 3", "Sobrevive a la mamá de Coraline."],
  ["Frase 4", "EXPEDICIÓN CONFIRMADA ✓"],
  ["Frase 5", "Tasa de supervivencia estimada: 37%."],
  ["Frase 6", "La torta de chocolate arregla casi todo."],
  ["Toast real", "Encuentra un pico.  No debería ser difícil. Espero."],
  ["Pares", "AÁ EÉ IÍ OÓ UÚ NÑ aá eé ií oó uú nñ"],
];

const SCALE = 6;
const out = document.getElementById("out")!;

for (const [label, text] of SAMPLES) {
  const heading = document.createElement("h2");
  heading.textContent = label;
  out.appendChild(heading);

  const src = textCanvas(text);
  const view = document.createElement("canvas");
  view.width = src.width * SCALE;
  view.height = src.height * SCALE;
  const g = view.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, view.width, view.height);
  out.appendChild(view);
}
