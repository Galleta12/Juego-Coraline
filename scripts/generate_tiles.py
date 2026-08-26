"""
Genera los tiles de terreno muestreando los fondos del pack.

El pack no trae terreno y el platformer no existe sin el. En vez de
inventar una paleta, se extraen los colores dominantes de cada fondo
(forest, tunnel, lair) y se dibujan los tiles con ellos: asi el suelo
pertenece al mismo mundo que lo que se ve detras, que es justo lo que
falla cuando el terreno viene de otra fuente.

Produce, por escenario:
  ground-top   cara superior, la que se pisa
  ground-fill  relleno de debajo
  stone        roca, no rompible
  breakable    bloque que se pica
  platform     plataforma atravesable

    python scripts/generate_tiles.py
"""

from __future__ import annotations

import json
import os
import sys
import colorsys
import math
from collections import Counter

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Se muestrea el pack de fondos en uso, no el antiguo: si el terreno
# copia colores de una imagen que ya no se ve, no pega con nada.
SRC = os.path.join(ROOT, "_incoming", "bgpack")
DST = os.path.join(ROOT, "public", "assets", "art", "tiles")
MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

TILE = 64          # se genera al doble y el juego lo dibuja a 32
LUMA = np.array([0.299, 0.587, 0.114])
SCENES = ("forest", "tunnel", "lair")


def dominant_colors(path: str, n: int = 6) -> list[tuple[int, int, int]]:
    """Colores mas frecuentes del fondo, ignorando lo casi negro."""
    img = Image.open(path).convert("RGB").resize((160, 90), Image.LANCZOS)
    px = np.asarray(img).reshape(-1, 3).astype(np.int32)
    lum = px @ np.array([0.299, 0.587, 0.114])
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    # Fuera el negro de fondo y fuera el croma: estos originales llevan
    # marco magenta y si se cuela, el terreno sale rosa fluorescente.
    keep = (lum > 26) & ~((r > 150) & (g < 90) & (b > 150))
    px = px[keep]
    if len(px) == 0:
        return [(60, 50, 70)] * n
    # Cuantizar burdo y contar: mas estable que k-means para esto.
    q = (px // 26 * 26).astype(np.int32)
    counts = Counter(map(tuple, q))
    common = [c for c, _ in counts.most_common(n * 3)]
    common.sort(key=lambda c: sum(c))       # de oscuro a claro
    step = max(1, len(common) // n)
    picked = common[::step][:n]
    while len(picked) < n:
        picked.append(picked[-1])
    return [tuple(int(v) for v in c) for c in picked]  # type: ignore[misc]


def shade(color: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(c * factor))) for c in color)  # type: ignore[return-value]


def noise_field(seed: int, size: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    small = rng.random((size // 8, size // 8))
    img = Image.fromarray((small * 255).astype(np.uint8)).resize(
        (size, size), Image.BILINEAR
    )
    return np.asarray(img, dtype=np.float32) / 255.0


def base_tile(color: tuple[int, int, int], seed: int, grain: float = 0.16) -> np.ndarray:
    """Un tile plano con grano suave, para que no parezca un rectangulo."""
    field = noise_field(seed, TILE)
    tint = 1.0 + (field - 0.5) * grain * 2
    return np.clip(np.array(color, dtype=np.float32) * tint[..., None], 0, 255)


def add_outline(rgb: np.ndarray, color: tuple[int, int, int], px: int = 3) -> np.ndarray:
    """Contorno oscuro en el borde del tile: el estilo del pack lo pide."""
    out = rgb.copy()
    c = np.array(color, dtype=np.float32)
    out[:px, :] = c
    out[-px:, :] = c
    out[:, :px] = c
    out[:, -px:] = c
    return out


# Tono base de la tierra. Los tiles se mezclan hacia aqui para que el
# suelo se lea como material y no como mas cielo: si comparten tono, la
# jugadora no distingue donde puede pisar.
EARTH = np.array([96, 74, 62], dtype=np.float32)
# A cero: el terreno usa el color del fondo tal cual. Mezclarlo hacia
# tierra lo volvia gris y dejaba de pertenecer al escenario.
EARTH_MIX = 0.0


# Cuanta saturacion conserva el terreno. El fondo puede permitirse
# morados intensos porque esta lejos y desenfocado; el suelo ocupa
# el primer plano y a plena saturacion sale neon.
SATURATION = 0.42


def toward_earth(color: tuple[int, int, int]) -> tuple[int, int, int]:
    c = np.array(color, dtype=np.float32)
    mixed = c * (1 - EARTH_MIX) + EARTH * EARTH_MIX
    # Se conserva el tono del escenario, pero apagado.
    lum = float(mixed @ LUMA)
    muted = lum + (mixed - lum) * SATURATION
    return tuple(int(max(0, min(255, v))) for v in muted)  # type: ignore[return-value]


def normalize(rgb: np.ndarray, target: float) -> np.ndarray:
    """
    Lleva el tile a un brillo objetivo conservando el tono.

    Los fondos del pack son muy oscuros, asi que su paleta tal cual da un
    suelo que se funde con el decorado. En un platformer eso es un
    problema de jugabilidad, no de estetica: hay que ver donde se pisa.
    """
    mean = float((rgb @ LUMA).mean())
    if mean < 1.0:
        return rgb
    return np.clip(rgb * (target / mean), 0, 255)


def emboss_top(rgb: np.ndarray, color: tuple[int, int, int], height: int) -> np.ndarray:
    """Banda superior mas clara: lee como 'esto es la superficie'."""
    out = rgb.copy()
    c = np.array(color, dtype=np.float32)
    for y in range(height):
        t = 1.0 - y / height
        out[y] = out[y] * (1 - t * 0.85) + c * (t * 0.85)
    return out


def save(arr: np.ndarray, alpha: np.ndarray | None, rel: str, manifest: dict) -> int:
    a = np.full(arr.shape[:2], 255.0) if alpha is None else alpha
    img = Image.fromarray(
        np.dstack([np.clip(arr, 0, 255), a]).astype(np.uint8), "RGBA"
    )
    out = os.path.join(DST, rel + ".webp")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "WEBP", quality=92, method=6)
    manifest[f"tiles/{rel}"] = {
        "path": f"assets/art/tiles/{rel}.webp",
        "w": img.width,
        "h": img.height,
        "family": "tiles",
    }
    return os.path.getsize(out)


def scene_hue(path: str) -> float:
    """Tono dominante del fondo, en 0..1."""
    colors = dominant_colors(path, 5)
    # Se promedia en el circulo de tono para no romper en el rojo.
    xs, ys = 0.0, 0.0
    for c in colors:
        h, sat, _ = colorsys.rgb_to_hsv(*[v / 255 for v in c])
        if sat < 0.12:
            continue
        xs += math.cos(h * 2 * math.pi)
        ys += math.sin(h * 2 * math.pi)
    if xs == 0 and ys == 0:
        return 0.72
    return (math.atan2(ys, xs) / (2 * math.pi)) % 1.0


def tone(hue: float, sat: float, val: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hsv_to_rgb(hue, sat, val)
    return (int(r * 255), int(g * 255), int(b * 255))


def build_scene(scene: str, manifest: dict) -> int:
    src = os.path.join(SRC, f"{scene}-mid.png")
    if not os.path.exists(src):
        print(f"  aviso: falta {src}")
        return 0

    # Del fondo se toma solo el TONO. Saturacion y brillo se fijan aqui:
    # el fondo puede permitirse morados intensos porque esta lejos, pero
    # el suelo ocupa el primer plano y a esa saturacion sale neon.
    hue = scene_hue(src)
    total = 0
    seed = abs(hash(scene)) % 10_000

    edge = tone(hue, 0.40, 0.09)
    surface = tone(hue, 0.20, 0.60)

    # Suelo: cara superior clara sobre cuerpo apagado.
    fill = base_tile(tone(hue, 0.26, 0.30), seed)
    top = emboss_top(fill.copy(), surface, 16)
    total += save(add_outline(top, edge), None, f"{scene}/ground-top", manifest)

    body = add_outline(base_tile(tone(hue, 0.26, 0.19), seed + 1), edge)
    total += save(body, None, f"{scene}/ground-fill", manifest)

    # Roca: mas fria y algo mas clara que la tierra.
    stone = base_tile(tone(hue, 0.14, 0.28), seed + 2, grain=0.26)
    total += save(add_outline(stone, edge), None, f"{scene}/stone", manifest)

    # Bloque rompible: el mas claro de todos y con grieta visible. Tiene
    # que cantar a distancia que ese se puede picar.
    br = base_tile(tone(hue, 0.30, 0.52), seed + 3, grain=0.2)
    br = add_outline(br, edge, 4)
    crack = np.array(tone(hue, 0.45, 0.08), dtype=np.float32)
    rng = np.random.default_rng(seed + 7)
    x, y = TILE // 2, 8
    for _ in range(TILE - 18):
        br[y:y + 2, x:x + 2] = crack
        x = int(np.clip(x + rng.integers(-2, 3), 6, TILE - 8))
        y += 1
    total += save(br, None, f"{scene}/breakable", manifest)

    # Plataforma: solo la franja de arriba, el resto transparente.
    #
    # Se dibuja mas alta y mucho mas clara que el resto del terreno. En
    # el pozo del bosque, con la camara alejada, una franja fina y oscura
    # era literalmente invisible y no se veia donde se podia pisar.
    plat = np.zeros((TILE, TILE, 3), dtype=np.float32)
    alpha = np.zeros((TILE, TILE), dtype=np.float32)
    band = 22
    plat[:band] = base_tile(tone(hue, 0.22, 0.60), seed + 4, grain=0.18)[:band]
    # Canto superior iluminado: es lo que dice "aqui se pisa".
    plat[:4] = np.array(tone(hue, 0.10, 0.86), dtype=np.float32)
    plat[4:6] = np.array(tone(hue, 0.18, 0.70), dtype=np.float32)
    plat[band - 4:band] = np.array(edge, dtype=np.float32)
    alpha[:band] = 255.0
    # Los cuatro pixeles de abajo se desvanecen: asi la plataforma no
    # corta en seco contra el fondo.
    alpha[band - 4:band] = np.linspace(255.0, 150.0, 4)[:, None]
    total += save(plat, alpha, f"{scene}/platform", manifest)

    print(f"  {scene}: 5 tiles  |  tono {hue:.2f}")
    return total


def main() -> int:
    if not os.path.isdir(SRC):
        print(f"No encuentro los fondos en {SRC}")
        return 1
    if not os.path.exists(MANIFEST):
        print("Falta src/art/assets.json — ejecuta antes process_assets.py")
        return 1

    with open(MANIFEST, encoding="utf-8") as f:
        data = json.load(f)
    manifest = data["assets"]

    # Limpiar tiles anteriores para no dejar huerfanos en el manifiesto.
    for key in [k for k in manifest if k.startswith("tiles/")]:
        del manifest[key]

    print("Generando terreno desde los fondos del pack\n")
    total = sum(build_scene(s, manifest) for s in SCENES)

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": manifest}, f, indent=2, ensure_ascii=False)

    print(f"\nlisto: {len(SCENES) * 5} tiles, {total / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
