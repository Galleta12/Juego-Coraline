"""
Revisa las animaciones fotograma a fotograma.

Monta una tira por animacion con los frames alineados y una linea de
suelo comun. Es la unica forma de ver si un frame esta a otra escala o
desplazado: en movimiento se percibe como un salto, pero no se sabe cual
de los frames tiene la culpa.

Ademas avisa por consola de los frames cuyo alto o cuyo centro se sale
de lo que hace el resto de su animacion.

    python scripts/check_anims.py [salida.png]
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public", "assets", "art")

# Cada entrada es (nombre, [rutas de frames]).
ANIMS: list[tuple[str, list[str]]] = [
    ("heroina reposo", ["characters/heroine/blue/idle"]),
    ("heroina correr", [f"characters/heroine/blue/run-{i}" for i in (1, 2, 3)]),
    ("heroina aire", ["characters/heroine/blue/jump", "characters/heroine/blue/fall"]),
    (
        "heroina pico",
        [
            "characters/heroine/blue/idle",
            "characters/heroine/blue/pickaxe-attack",
            "characters/heroine/blue/pickaxe-attack",
            "characters/heroine/blue/idle",
        ],
    ),
    ("gato caminar", [f"companions/cat/walk-{i}" for i in (1, 2, 3)]),
    ("gato estados", ["companions/cat/idle", "companions/cat/alert", "companions/cat/attack"]),
    ("gato aire", ["companions/cat/jump", "companions/cat/fall"]),
    ("guia volar", ["characters/guide/guide-fly-1", "characters/guide/guide-fly-2"]),
    ("guia hablar", ["characters/guide/guide-talk-1", "characters/guide/guide-talk-2"]),
    ("perro", ["companions/dog/dog-appear", "companions/dog/dog-offer", "companions/dog/dog-dance"]),
    ("aldeano caminar", [f"enemies/villager/walk-{i}" for i in (1, 2, 3)]),
    ("creeper caminar", [f"enemies/creeper/walk-{i}" for i in (1, 2, 3)]),
    ("madre acercarse", [f"boss/mother/approach-{i}" for i in (1, 2, 3)]),
    ("madre atacar", [f"boss/mother/attack-{i}" for i in (1, 2, 3, 4)]),
    ("madre muerte", [f"boss/mother/death-{i}" for i in (1, 2, 3, 4, 5)]),
]

CELL_H = 150
PAD = 12


def load(rel: str) -> Image.Image | None:
    p = os.path.join(ART, rel + ".webp")
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None


def metrics(img: Image.Image) -> tuple[int, int, int]:
    """Alto dibujado, centro horizontal y fila de los pies."""
    a = np.asarray(img)[..., 3]
    rows = np.where(a.max(axis=1) > 8)[0]
    cols = np.where(a.max(axis=0) > 8)[0]
    if len(rows) == 0 or len(cols) == 0:
        return 0, 0, 0
    return (
        int(rows[-1] - rows[0] + 1),
        int((cols[0] + cols[-1]) // 2),
        int(rows[-1]),
    )


def main() -> int:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "anim-check.png"

    strips: list[tuple[str, list[Image.Image]]] = []
    problems: list[str] = []

    for name, keys in ANIMS:
        frames = [load(k) for k in keys]
        if any(f is None for f in frames):
            problems.append(f"{name}: faltan frames")
            continue
        real = [f for f in frames if f is not None]

        stats = [metrics(f) for f in real]
        heights = [h for h, _, _ in stats if h > 0]
        feet = [ft for _, _, ft in stats if ft > 0]
        if heights:
            spread = (max(heights) - min(heights)) / max(heights)
            if spread > 0.18:
                problems.append(
                    f"{name}: los frames cambian de alto un {spread * 100:.0f}% "
                    f"({min(heights)}..{max(heights)}px) — se vera como un salto"
                )
        if feet and (max(feet) - min(feet)) > 14:
            problems.append(
                f"{name}: los pies bailan {max(feet) - min(feet)}px entre frames"
            )
        strips.append((name, real))

    if not strips:
        print("No hay nada que revisar.")
        return 1

    width = max(
        sum(round(f.width * CELL_H / max(1, f.height)) + PAD for f in fr) + 260
        for _, fr in strips
    )
    height = len(strips) * (CELL_H + PAD * 2) + PAD

    sheet = Image.new("RGB", (width, height), (22, 17, 30))
    draw = ImageDraw.Draw(sheet)

    y = PAD
    for name, frames in strips:
        draw.text((10, y + CELL_H // 2 - 6), name, fill=(200, 190, 210))
        # Linea de suelo comun: si un frame no la toca, flota.
        base = y + CELL_H
        draw.line([(250, base), (width - 10, base)], fill=(70, 55, 90), width=1)

        x = 250
        for f in frames:
            scale = CELL_H / max(1, f.height)
            im = f.resize(
                (max(1, round(f.width * scale)), CELL_H), Image.LANCZOS
            )
            sheet.paste(im, (x, y), im)
            draw.rectangle(
                [x, y, x + im.width, y + CELL_H], outline=(52, 40, 68), width=1
            )
            x += im.width + PAD
        y += CELL_H + PAD * 2

    sheet.save(out_path)
    print(f"tira de animaciones: {out_path}\n")

    if problems:
        print("PROBLEMAS DETECTADOS:")
        for p in problems:
            print("  -", p)
    else:
        print("Todas las animaciones tienen frames consistentes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
