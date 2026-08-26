"""
Arte suelto que el pipeline principal no sabe recortar.

Son imagenes que el usuario aporta una a una, sin fondo croma: cada una
necesita su propio criterio. Ahora mismo, el cuaderno de la introduccion
y la lata de Monster.

La hoja `libro_intrduction.png` trae los cuatro estados del cuaderno
sobre un degradado marron: tapa cerrada, pagina 1, pagina 2 y contratapa.
Aqui se separan y se les quita el fondo.

El fondo no es croma verde ni magenta, asi que no sirve el recorte por
color del pipeline principal. Tampoco vale el relleno desde las
esquinas: el papel de las paginas es otro degradado suave y la
propagacion se colaba dentro del cuaderno, dejandolo hueco.

Se resuelve por lo obvio: el degradado de fondo es marron muy oscuro,
practicamente el color de las escenas del juego, asi que en vez de
recortarlo se difuminan los bordes del recorte. El cuaderno se funde con
la escena y no se ve ningun rectangulo.

    python scripts/process_extras.py
"""

from __future__ import annotations

import json
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "libro_intrduction.png")
CAN_SRC = os.path.join(ROOT, "monster.png")
ONION_SRC = os.path.join(ROOT, "cebolla.png")
DST = os.path.join(ROOT, "public", "assets", "art", "ui")
MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

# Recortes sobre la hoja de 1536x1024.
#
# No estan puestos a ojo: salen de buscar, dentro de cada cuadrante, la
# caja donde hay detalle — el fondo es un degradado liso y el cuaderno
# no. A ojo se cortaba la esquina de laton y parte de la tapa derecha, y
# en pantalla parecia que la pagina estaba recortada.
PANELS: dict[str, tuple[int, int, int, int]] = {
    "book-cover": (75, 0, 638, 528),
    "book-page1": (632, 0, 1530, 520),
    "book-page2": (0, 480, 877, 1024),
    "book-back": (982, 492, 1408, 1024),
}

# Alto final en pixeles. El juego mide 540 de alto, asi que 620 deja
# margen para que el cuaderno llene la pantalla sin verse blando.
TARGET_H = 620

# Ancho del difuminado del borde, como fraccion del lado corto.
FEATHER = 0.10


def feather(img: Image.Image) -> Image.Image:
    """
    Difumina los cuatro bordes hasta alfa 0.

    El desvanecido es cuadratico, no lineal: arranca muy suave y solo se
    vuelve opaco cerca del centro, que es lo que hace que no se adivine
    donde acaba el recorte.
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    band = max(8, int(min(w, h) * FEATHER))

    ramp = np.ones(max(w, h), dtype=np.float32)
    edge = np.linspace(0.0, 1.0, band, dtype=np.float32) ** 2

    fx = ramp[:w].copy()
    fx[:band] = edge
    fx[-band:] = edge[::-1]
    fy = ramp[:h].copy()
    fy[:band] = edge
    fy[-band:] = edge[::-1]

    mask = np.outer(fy, fx)
    a = np.asarray(rgba).astype(np.float32)
    a[..., 3] *= mask
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def cut_by_diffusion(img: Image.Image, tolerance: float = 14.0) -> Image.Image:
    """
    Recorta un fondo continuo por difusion desde el borde.

    Un pixel pasa a ser fondo si se parece a un vecino que ya lo es. Con
    un degradado suave la marea avanza sin parar, y el contorno duro del
    objeto la detiene. Sirve para la lata — que va sobre un degradado
    negro y tiene el borde iluminado — pero NO para el cuaderno, cuyo
    papel es otro degradado suave por el que la marea se colaba dentro.
    """
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w = rgb.shape[:2]

    is_bg = np.zeros((h, w), dtype=bool)
    is_bg[0, :] = is_bg[-1, :] = is_bg[:, 0] = is_bg[:, -1] = True

    for _ in range(400):
        candidates = ndimage.binary_dilation(is_bg) & ~is_bg
        if not candidates.any():
            break
        accepted = np.zeros_like(candidates)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            neighbour_is_bg = np.roll(np.roll(is_bg, dy, 0), dx, 1)
            neighbour_rgb = np.roll(np.roll(rgb, dy, 0), dx, 1)
            similar = np.linalg.norm(rgb - neighbour_rgb, axis=-1) <= tolerance
            accepted |= candidates & neighbour_is_bg & similar
        if not accepted.any():
            break
        is_bg |= accepted

    alpha = np.where(is_bg, 0.0, 255.0)
    out = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")

    a = np.asarray(out)[..., 3]
    ys, xs = np.where(a > 20)
    if len(ys) == 0:
        return out
    return out.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def process_can(added: dict) -> None:
    """La lata de Monster, para el cartel de la pistola."""
    if not os.path.exists(CAN_SRC):
        print("  aviso: no encuentro monster.png")
        return

    can = cut_by_diffusion(Image.open(CAN_SRC))
    scale = 420 / can.height
    can = can.resize((max(1, round(can.width * scale)), 420), Image.LANCZOS)

    rel = "items/monster-can-big.webp"
    path = os.path.join(ROOT, "public", "assets", "art", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    can.save(path, "WEBP", quality=92, method=6)

    added["items/monster-can-big"] = {
        "path": f"assets/art/{rel}",
        "w": can.width,
        "h": can.height,
        "family": "items",
    }
    print(f"  lata Monster  {can.width}x{can.height}  {os.path.getsize(path)/1024:5.0f} KB")


def process_onion(added: dict) -> None:
    """La cebolla que cruza el bosque."""
    if not os.path.exists(ONION_SRC):
        print("  aviso: no encuentro cebolla.png")
        return

    onion = cut_by_diffusion(Image.open(ONION_SRC), tolerance=17.0)
    scale = 190 / onion.height
    onion = onion.resize((max(1, round(onion.width * scale)), 190), Image.LANCZOS)

    rel = "items/onion-big.webp"
    path = os.path.join(ROOT, "public", "assets", "art", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    onion.save(path, "WEBP", quality=92, method=6)

    added["items/onion-big"] = {
        "path": f"assets/art/{rel}",
        "w": onion.width,
        "h": onion.height,
        "family": "items",
    }
    print(f"  cebolla       {onion.width}x{onion.height}  {os.path.getsize(path)/1024:5.0f} KB")


def main() -> int:
    if not os.path.exists(SRC):
        print(f"No encuentro {SRC}")
        return 1

    sheet = Image.open(SRC)
    os.makedirs(DST, exist_ok=True)

    added: dict[str, dict] = {}
    for name, box in PANELS.items():
        panel = feather(sheet.crop(box))

        scale = TARGET_H / panel.height
        panel = panel.resize(
            (max(1, round(panel.width * scale)), TARGET_H), Image.LANCZOS
        )

        rel = f"ui/{name}.webp"
        panel.save(os.path.join(ROOT, "public", "assets", "art", rel), "WEBP", quality=92, method=6)
        added[f"ui/{name}"] = {
            "path": f"assets/art/{rel}",
            "w": panel.width,
            "h": panel.height,
            "family": "ui",
        }
        kb = os.path.getsize(os.path.join(ROOT, "public", "assets", "art", rel)) / 1024
        print(f"  {name:12} {panel.width}x{panel.height}  {kb:5.0f} KB")

    process_can(added)
    process_onion(added)

    existing: dict[str, dict] = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            existing = json.load(f).get("assets", {})
    existing.update(added)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": existing}, f, indent=2, ensure_ascii=False)

    print(f"\nlisto: {len(added)} paginas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
