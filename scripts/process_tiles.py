"""
Extrae el terreno y los adornos de las hojas de tiles.

`tiles2.png` trae bloques de tierra con musgo, ladrillo, roca de cueva y
un monton de objetos sueltos — arboles, faroles, cajas, un gato negro.
Todo sobre fondo transparente, asi que cada pieza se separa sola por
componentes conexas del canal alfa.

De ahi salen dos cosas distintas:

  * **Terreno.** El juego dibuja tiles de 32x32, y los bloques de la hoja
    son anchos. Se recorta un cuadrado de la zona que interesa — la
    franja con musgo para la superficie, el cuerpo para el relleno — y se
    ajusta para que repita sin costura visible.

  * **Adornos.** Se guardan enteros, tal cual vienen, y las escenas los
    colocan por el nivel.

    python scripts/process_tiles.py
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "tiles2.png")
DST = os.path.join(ROOT, "public", "assets", "art")
MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

# Tamano de salida de los tiles de terreno. Doble de los 32 logicos, para
# que aguanten pantallas grandes.
TILE_OUT = 64

# Piezas de la hoja, por indice de lectura (arriba-abajo, izquierda-derecha).
#
# Los indices salen de la hoja de contacto que genera este mismo script
# con --contact; estan fijados a mano porque elegir "el bloque con musgo
# bonito" no es algo que se pueda automatizar.
# Los dibujos de la hoja son pequenos — el bloque de tierra del bosque
# mide 124x80 — asi que el recorte se toma SIEMPRE cuadrado: (pieza,
# y0, y1) marca la franja horizontal y el lado sale de su altura.
#
# Con recortes rectangulares el tile se estiraba hasta el doble al
# cuadrarlo a 64x64 y el suelo salia a rayas verticales.
TERRAIN = {
    # nombre           pieza  franja (y0, y1)
    #
    # La superficie y el relleno de cada escena salen de la MISMA pieza —
    # la franja de arriba y el cuerpo de abajo. Sacandolos de dibujos
    # distintos el suelo no casaba: la cara verde sobre un cuerpo rosa.
    "forest/ground-top": (18, 0.00, 0.55),
    "forest/ground-fill": (18, 0.55, 1.00),
    "forest/stone": (59, 0.00, 1.00),
    # La cueva sale del ladrillo morado, no de la roca redonda.
    #
    # Antes las dos usaban la pieza 119, que es un pedrusco con la cara
    # abombada: al cuadrarlo a 64x64 quedaba una mancha borrosa sin
    # arriba ni abajo, y el suelo del tunel se leia como una tela morada
    # en vez de como piedra. El ladrillo tiene junta y relieve, asi que
    # aguanta el recorte y se repite sin cantar.
    "lair/ground-top": (84, 0.00, 0.50),
    "lair/ground-fill": (89, 0.00, 0.50),
    "lair/stone": (89, 0.00, 1.00),
    "tunnel/ground-top": (84, 0.00, 0.50),
    "tunnel/ground-fill": (89, 0.00, 0.50),
    "tunnel/stone": (89, 0.00, 1.00),
}

# La repisa atravesable sale del MISMO recorte que la superficie del
# suelo de su escena, solo que aplastado a media altura.
#
# Asi la repisa y el suelo son el mismo material y el nivel se lee como
# una pieza. Sacandola de otro dibujo distinto parecian dos juegos de
# tiles mezclados.
PLATFORM = ("forest", "lair", "tunnel")

# Adornos, enteros. Alto final en pixeles.
#
# El tercer valor, opcional, recorta dentro de la pieza. Varios dibujos
# de la hoja se tocan y salen pegados de la separacion por componentes
# — el cartel viene con un barril al lado, las setas con una liana — y
# hay que quedarse solo con la parte que interesa.
PROPS: dict[str, tuple] = {
    # nombre                pieza  alto  (recorte opcional)
    "props/tree-lantern": (8, 300),
    "props/well": (9, 190),
    "props/signpost": (10, 150, (0.00, 0.00, 0.70, 1.00)),
    "props/door-arch": (12, 240),
    "props/barrel": (24, 110),
    "props/crate": (25, 110),
    "props/swing": (31, 200),
    "props/ladder": (32, 190),
    "props/stump": (33, 100),
    "props/fence": (34, 90),
    "props/lamppost": (36, 260),
    "props/lantern": (49, 130),
    "props/rock-big": (57, 110),
    "props/rock-small": (47, 80),
    "props/cart": (64, 110),
    "props/black-cat": (83, 150),
    "props/waterfall": (93, 300),
    "props/mushrooms": (118, 130, (0.00, 0.03, 0.62, 0.53)),
    "props/crystals": (107, 100),
    "props/crystals-blue": (104, 110),
    "props/crystals-tall": (117, 140),
    "props/coral": (99, 110),
    "props/coral-pink": (66, 120),
    "props/glow-plant": (106, 120),
    "props/hang-rock": (108, 190),
    "props/vines": (103, 190, (0.12, 0.10, 1.00, 1.00)),
    "props/stone-arch": (78, 260),
    "props/pillar": (63, 240),
    "props/mossy-pillar": (72, 240),
    "props/spike-fence": (73, 110),
    "props/chain": (82, 160),
}


def pieces(img: Image.Image) -> list[tuple[int, int, int, int]]:
    """Cajas de cada dibujo de la hoja, en orden de lectura."""
    alpha = np.asarray(img)[..., 3]
    labels, n = ndimage.label(alpha > 120)
    out: list[tuple[int, int, int, int]] = []
    for i in range(1, n + 1):
        ys, xs = np.where(labels == i)
        if len(ys) < 900:
            continue
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        if box[2] - box[0] < 18 or box[3] - box[1] < 18:
            continue
        out.append(box)
    out.sort(key=lambda b: (b[1] // 60, b[0]))
    return out


def band(piece: Image.Image, y0: float, y1: float) -> Image.Image:
    """Cuadrado tomado de la franja (y0, y1) de la pieza, centrado."""
    w, h = piece.size
    top = int(h * y0)
    side = min(max(8, int(h * (y1 - y0))), w, h)
    top = min(top, h - side)
    left = (w - side) // 2
    return piece.crop((left, top, left + side, top + side))


def crack(img: Image.Image, seed: int) -> Image.Image:
    """
    Aclara el tile y le dibuja una grieta en zigzag.

    El bloque rompible sale del MISMO muro que la roca normal, porque
    mezclar dos dibujos distintos se leia como dos materiales sin
    relacion. Lo que lo distingue es la grieta y que esta mas claro:
    tiene que cantar a distancia que ese se puede picar.
    """
    a = np.asarray(img).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] * 1.22 + 16, 0, 255)

    h, w = a.shape[:2]
    rng = np.random.default_rng(seed)
    x = w // 2
    for y in range(3, h - 3):
        a[y:y + 2, max(0, x - 1):x + 2, :3] *= 0.34
        x = int(np.clip(x + rng.integers(-2, 3), 4, w - 5))
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")


def solidify(img: Image.Image) -> Image.Image:
    """
    Rellena los huecos y deja el tile completamente opaco.

    Las piezas de roca vienen con el borde recortado — estalactitas,
    esquinas irregulares — y un tile de suelo con transparencia deja
    agujeros por los que se ve el fondo al repetirlo. Se tapan con el
    color medio de la propia pieza, que es el que menos canta.
    """
    a = np.asarray(img).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:4] / 255.0

    visible = alpha[..., 0] > 0.6
    if not visible.any():
        return img
    fill = np.median(rgb[visible], axis=0)

    out = rgb * alpha + fill[None, None, :] * (1.0 - alpha)
    return Image.fromarray(
        np.dstack([out, np.full(alpha.shape, 255.0)]).clip(0, 255).astype(np.uint8),
        "RGBA",
    )


def seamless(img: Image.Image) -> Image.Image:
    """
    Suaviza los bordes izquierdo y derecho para que el tile repita.

    Se mezcla cada borde con el opuesto en una franja estrecha. No es un
    tileado perfecto — el dibujo es a mano — pero quita la linea vertical
    que se ve cuando se repiten veinte tiles seguidos.
    """
    a = np.asarray(img).astype(np.float32)
    w = a.shape[1]
    band = max(2, w // 8)
    ramp = np.linspace(0.5, 0.0, band, dtype=np.float32)[None, :, None]

    left = a[:, :band].copy()
    right = a[:, -band:].copy()
    a[:, :band] = left * (1 - ramp) + right[:, ::-1] * ramp
    a[:, -band:] = right * (1 - ramp[:, ::-1]) + left[:, ::-1] * ramp[:, ::-1]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")


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
    if not os.path.exists(SHEET):
        print(f"No encuentro {SHEET}")
        return 1

    sheet = Image.open(SHEET).convert("RGBA")
    boxes = pieces(sheet)
    print(f"{len(boxes)} piezas en la hoja\n")

    added: dict[str, dict] = {}

    for name, (idx, y0, y1) in TERRAIN.items():
        sub = band(sheet.crop(boxes[idx]), y0, y1)
        tile = seamless(solidify(sub.resize((TILE_OUT, TILE_OUT), Image.LANCZOS)))
        save(tile, f"tiles/{name}", added)
        print(f"  tiles/{name:22} desde pieza {idx} ({sub.width}px)")

    for scene in PLATFORM:
        idx, y0, y1 = TERRAIN[f"{scene}/stone"]
        stone = band(sheet.crop(boxes[idx]), y0, y1)
        br = crack(
            solidify(stone.resize((TILE_OUT, TILE_OUT), Image.LANCZOS)),
            abs(hash(scene)) % 9973,
        )
        save(seamless(br), f"tiles/{scene}/breakable", added)

        # La repisa atravesable es la franja de arriba del suelo, la que
        # se pisa, en proporcion 2:1.
        idx, y0, y1 = TERRAIN[f"{scene}/ground-top"]
        piece = sheet.crop(boxes[idx])
        w, h = piece.size
        side = min(max(8, int(h * (y1 - y0) * 0.62)), h)
        wide = min(side * 2, w)
        left = (w - wide) // 2
        top = min(int(h * y0), h - side)
        sub = piece.crop((left, top, left + wide, top + side))
        plat = seamless(solidify(sub.resize((TILE_OUT, TILE_OUT // 2), Image.LANCZOS)))
        save(plat, f"tiles/{scene}/platform", added)
        print(f"  tiles/{scene}/breakable + platform")

    for name, spec in PROPS.items():
        idx, height = spec[0], spec[1]
        piece = sheet.crop(boxes[idx])
        if len(spec) > 2:
            w, h = piece.size
            c = spec[2]
            piece = piece.crop((int(w * c[0]), int(h * c[1]), int(w * c[2]), int(h * c[3])))
            # Reajustar a lo que queda dibujado: si no, el recorte deja
            # margen transparente y el adorno se apoya en el aire.
            piece = piece.crop(piece.getbbox() or (0, 0, piece.width, piece.height))
        k = height / piece.height
        prop = piece.resize((max(1, round(piece.width * k)), height), Image.LANCZOS)
        save(prop, name, added)

    print(f"\n  {len(PROPS)} adornos")

    existing: dict[str, dict] = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            existing = json.load(f).get("assets", {})
    existing.update(added)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": existing}, f, indent=2, ensure_ascii=False)

    print(f"\nlisto: {len(added)} imagenes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
