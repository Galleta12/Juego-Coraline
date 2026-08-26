"""
Procesa el pack de fondos transparentes y lo deja listo para el parallax.

El pack ya viene con alfa de verdad: las capas `mid` y `near` traen
recortado el cielo y el hueco de juego, y la `far` es opaca entera. Eso
hace que aqui no haya que adivinar nada — antes se calculaba la
transparencia a ojo por luminancia y se comia trozos del dibujo.

El trabajo que queda es solo de tamano y formato: escalar a 1920 de
ancho y guardar en WebP, que pesa una decima parte que el PNG.

    python scripts/process_backgrounds.py
"""

from __future__ import annotations

import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_incoming", "bgpack_alpha")
MANIFEST_IN = os.path.join(SRC, "background-manifest.json")
DST = os.path.join(ROOT, "public", "assets", "art", "backgrounds")
MANIFEST_OUT = os.path.join(ROOT, "src", "art", "assets.json")
FACTORS_OUT = os.path.join(ROOT, "src", "art", "parallax.json")

CHROMA = np.array([255.0, 0.0, 255.0])

# Ancho final. El juego mide 960 de ancho, asi que con 1920 hay margen
# para desplazar la capa sin que se acabe la imagen.
TARGET_W = 1920

# De nombre de archivo a nivel del juego.
LEVELS = ("forest-altered", "forest", "tunnel", "lair")
LAYERS = ("far", "mid", "near")


def split_name(file: str) -> tuple[str, str] | None:
    """`forest-altered-mid.png` -> ("forest-altered", "mid")."""
    stem = os.path.splitext(file)[0]
    for layer in LAYERS:
        if not stem.endswith(f"-{layer}"):
            continue
        level = stem[: -len(layer) - 1]
        if level in LEVELS:
            return level, layer
    return None


def despill(img: Image.Image) -> Image.Image:
    """
    Quita el magenta que quedo mezclado en los bordes.

    El recorte del pack es bueno, pero en el contorno siempre sobrevive
    una franja de pixeles medio magenta. Sobre un fondo oscuro se ve
    como un halo rosa alrededor de cada arbol.
    """
    a = np.asarray(img).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:4] / 255.0

    # Solo se toca donde el alfa es parcial: dentro del dibujo no.
    edge = (alpha > 0.02) & (alpha < 0.98)
    clean = np.where(edge, np.clip((rgb - (1.0 - alpha) * CHROMA) / np.maximum(alpha, 0.05), 0, 255), rgb)

    return Image.fromarray(
        np.dstack([clean, alpha * 255.0]).astype(np.uint8), "RGBA"
    )


def process(entry: dict) -> tuple[str, dict] | None:
    file = entry["file"]
    parts = split_name(file)
    if not parts:
        print(f"  aviso: no se de que nivel es {file}")
        return None

    src = os.path.join(SRC, file)
    if not os.path.exists(src):
        print(f"  aviso: falta {file}")
        return None

    level, layer = parts
    out = despill(Image.open(src).convert("RGBA"))

    scale = TARGET_W / out.width
    out = out.resize((TARGET_W, max(1, round(out.height * scale))), Image.LANCZOS)

    name = f"{level}-{layer}"
    rel = f"{level}/{name}.webp"
    path = os.path.join(DST, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path, "WEBP", quality=86, method=6)

    return f"backgrounds/{level}/{name}", {
        "path": f"assets/art/backgrounds/{rel}",
        "w": out.width,
        "h": out.height,
        "family": "backgrounds",
        "factor": entry["parallax_factor"],
    }


def main() -> int:
    # Se borra la carpeta entera antes de escribir.
    #
    # Los nombres de nivel han cambiado entre packs y quedaban capas
    # viejas colgadas en carpetas equivocadas; el juego cargaba unas y
    # otras mezcladas sin que nada avisara.
    if os.path.isdir(DST):
        shutil.rmtree(DST)

    if not os.path.isdir(SRC):
        print(f"No encuentro el pack de fondos en {SRC}")
        return 1
    if not os.path.exists(MANIFEST_IN):
        print(f"Falta {MANIFEST_IN}")
        return 1

    with open(MANIFEST_IN, encoding="utf-8") as f:
        pack = json.load(f)

    print(f"{pack['pack_name']} — {len(pack['backgrounds'])} capas\n")

    added: dict[str, dict] = {}
    factors: dict[str, float] = {}
    total = 0

    for entry in pack["backgrounds"]:
        result = process(entry)
        if not result:
            continue
        key, meta = result
        added[key] = {k: v for k, v in meta.items() if k != "factor"}
        factors[key] = meta["factor"]
        total += os.path.getsize(os.path.join(ROOT, "public", meta["path"]))
        print(f"  {key:46} {meta['w']}x{meta['h']}  factor {meta['factor']}")

    # Fusion con el manifiesto general, sin tocar lo que no es fondo.
    existing: dict[str, dict] = {}
    if os.path.exists(MANIFEST_OUT):
        with open(MANIFEST_OUT, encoding="utf-8") as f:
            existing = json.load(f).get("assets", {})
    for key in [k for k in existing if k.startswith("backgrounds/")]:
        del existing[key]
    existing.update(added)

    with open(MANIFEST_OUT, "w", encoding="utf-8") as f:
        json.dump({"assets": existing}, f, indent=2, ensure_ascii=False)
    with open(FACTORS_OUT, "w", encoding="utf-8") as f:
        json.dump({"factors": factors}, f, indent=2, ensure_ascii=False)

    print(f"\nlisto: {len(added)} capas, {total / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
