"""
Saca las particulas de cafe de `particulas-cafe.png`.

La lamina viene con fondo marron, no transparente: son gotas claras y
granos oscuros sobre un degradado del mismo color. Ni un umbral de
brillo ni un croma sirven, porque el fondo esta justo en medio de los
dos. Lo que si funciona es medir cuanto se aparta cada pixel del fondo
local — el degradado se cancela solo — y quedarse con lo que destaca,
sea por arriba o por abajo.

El alfa se deja suave a proposito. Son particulas: un recorte a cuchillo
se ve como una pegatina, y un borde que se desvanece se funde con la
escena.

    python scripts/process_coffee.py
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "particulas-cafe.png")
DST = os.path.join(ROOT, "public", "assets", "art")
MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

# Cuantas piezas de cada clase se guardan.
BEANS = 4
DROPS = 6


def save(img: Image.Image, rel: str, added: dict) -> None:
    path = os.path.join(DST, f"{rel}.webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=92, method=6)
    added[rel] = {
        "path": f"assets/art/{rel}.webp",
        "w": img.width,
        "h": img.height,
        "family": rel.split("/")[0],
    }


def main() -> int:
    if not os.path.exists(SRC):
        print(f"No encuentro {SRC}")
        return 1

    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
    grey = rgb.mean(axis=2)

    # Fondo local: un desenfoque ancho. Lo que sobresale de el son las
    # gotas y los granos; el degradado marron desaparece de la resta.
    base = ndimage.uniform_filter(grey, size=95)
    rel = grey - base

    bright = rel > 26   # gotas: brillan
    dark = rel < -24    # granos: son mas oscuros que el fondo

    out: dict[str, dict] = {}

    def harvest(mask: np.ndarray, prefix: str, count: int, lo: int, hi: int) -> int:
        mask = ndimage.binary_closing(mask, np.ones((3, 3)))
        labels, n = ndimage.label(mask)
        if n == 0:
            return 0

        objs = ndimage.find_objects(labels)
        cand: list[tuple[float, int, tuple]] = []
        for i, sl in enumerate(objs, start=1):
            if sl is None:
                continue
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            if not (lo <= h <= hi and lo <= w <= hi):
                continue
            area = float((labels[sl] == i).sum())
            # Cuanto llena su caja: las piezas compactas y limpias son
            # las que quedan bien de particula.
            fill = area / max(1.0, h * w)
            if fill < 0.45:
                continue
            cand.append((area * fill, i, sl))

        cand.sort(reverse=True)
        saved = 0
        for score, i, sl in cand[:count]:
            pad = 4
            y0 = max(0, sl[0].start - pad)
            y1 = min(grey.shape[0], sl[0].stop + pad)
            x0 = max(0, sl[1].start - pad)
            x1 = min(grey.shape[1], sl[1].stop + pad)

            piece = rgb[y0:y1, x0:x1]
            # Alfa por contraste con el fondo, suavizado: el borde se
            # apaga en vez de cortarse.
            strength = np.abs(rel[y0:y1, x0:x1])
            alpha = np.clip((strength - 8.0) / 26.0, 0.0, 1.0) * 255.0
            alpha = ndimage.gaussian_filter(alpha, sigma=1.0)

            # Apagar los bordes del recorte. Si una gota llega justo al
            # limite, el corte deja un canto recto que en movimiento se
            # lee como un cuadrado en vez de como una salpicadura.
            hh, ww = alpha.shape
            fy = np.clip(np.minimum(np.arange(hh), hh - 1 - np.arange(hh)) / 3.0, 0, 1)
            fx = np.clip(np.minimum(np.arange(ww), ww - 1 - np.arange(ww)) / 3.0, 0, 1)
            alpha *= fy[:, None] * fx[None, :]

            img = Image.fromarray(
                np.dstack([piece, alpha]).clip(0, 255).astype(np.uint8), "RGBA"
            )
            save(img, f"fx/{prefix}-{saved + 1}", out)
            saved += 1
        return saved

    got_beans = harvest(dark, "coffee-bean", BEANS, 26, 110)
    got_drops = harvest(bright, "coffee-drop", DROPS, 10, 90)
    print(f"  {got_beans} granos, {got_drops} gotas")

    existing: dict[str, dict] = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            existing = json.load(f).get("assets", {})
    existing.update(out)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": existing}, f, indent=2, ensure_ascii=False)

    print(f"listo: {len(out)} particulas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
