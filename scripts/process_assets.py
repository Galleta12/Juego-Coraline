"""
Procesa el pack de arte crudo y lo deja listo para el juego.

Los PNG que llegan son RGB de 1024px con fondo magenta, sin canal alfa,
y con estilos que no casan entre si: las protagonistas son cel-shaded
mientras que el gato, el aldeano, Leon o la torta son practicamente
fotorrealistas. El brief pide "2D cel-shaded, contornos gruesos, nada
fotorrealista", asi que aqui se unifican.

El pipeline hace cinco cosas:

  1. Quita el magenta por tono, no solo por distancia: asi caza tambien
     las sombras proyectadas en magenta oscuro.
  2. Elimina restos sueltos (etiquetas de texto tipo "IDLE" que traian
     algunas imagenes) quedandose solo con la figura principal.
  3. Estiliza: aplana los degradados, tinta las sombras hacia el violeta
     de la paleta y anade contorno oscuro. La fuerza depende de cuanto
     se aleje cada familia del estilo objetivo.
  4. Recorta con un marco COMUN por familia, para que las poses no
     bailen al cambiar de animacion.
  5. Reescala y guarda en WebP, que pesa una fraccion del PNG.

    python scripts/process_assets.py
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from collections import defaultdict

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_incoming", "pack")
DST = os.path.join(ROOT, "public", "assets", "art")
OUT_MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

CHROMA = np.array([255.0, 0.0, 255.0])
LUMA = np.array([0.299, 0.587, 0.114])

# ── Estilo objetivo ───────────────────────────────────────────────────
# Sacado de las protagonistas, que ya estan en el estilo correcto.
SHADOW_TINT = np.array([0.78, 0.72, 1.06])   # sombras hacia el violeta
OUTLINE_RGB = (22, 15, 30)

# Cuanto hay que corregir cada familia. Se aplica DESPUES de reescalar,
# asi que `outline` esta en pixeles finales y se ve de verdad.
#   levels : niveles de color por canal (menos = mas plano)
#   sat    : multiplicador de saturacion (el dibujo satura mas que la foto)
#   edges  : intensidad de las lineas interiores
#   outline: grosor del contorno exterior, en pixeles de salida
STYLE = {
    "characters/heroine": dict(levels=0, sat=1.00, edges=0.00, outline=2),
    "companions/dog":     dict(levels=0, sat=1.00, edges=0.00, outline=2),
    "characters/guide":   dict(levels=8, sat=1.08, edges=0.18, outline=3),
    "characters/ally":    dict(levels=6, sat=1.12, edges=0.28, outline=3),
    # Luna sale casi negra del pack y sobre el bosque nocturno se
    # confundia con el suelo. Se aclara y se le baja la saturacion para
    # que quede gris plomo, que es lo que se le pidio.
    "companions/cat":     dict(levels=6, sat=0.82, edges=0.24, outline=3, lift=1.75),
    "enemies/villager":   dict(levels=6, sat=1.10, edges=0.28, outline=3),
    "enemies/creeper":    dict(levels=6, sat=1.10, edges=0.22, outline=3),
    # La Mother viene casi negra y en pantalla no se distinguia nada.
    # Contra un fondo oscuro, un boss que no se ve no es atmosfera:
    # es un problema de jugabilidad.
    "boss/mother":        dict(levels=6, sat=1.18, edges=0.22, outline=4, lift=1.9),
    "boss/projectiles":   dict(levels=6, sat=1.12, edges=0.22, outline=2, lift=1.5),
    "items":              dict(levels=6, sat=1.12, edges=0.28, outline=3),
    "weapons":            dict(levels=6, sat=1.12, edges=0.28, outline=3),
    "celebration":        dict(levels=6, sat=1.12, edges=0.22, outline=3),
}
DEFAULT_STYLE = dict(levels=6, sat=1.10, edges=0.25, outline=3)

# Altura final en pixeles. El juego corre a 960x540 logicos y el arte se
# guarda al doble para que aguante pantallas de 1080p.
TARGET_HEIGHT = {
    "characters/heroine": 200,
    "characters/guide": 260,
    "characters/ally": 200,
    "companions/cat": 90,
    "companions/dog": 110,
    "enemies/creeper": 130,
    "enemies/villager": 190,
    "boss/mother": 520,
    "boss/projectiles": 70,
    "items": 80,
    "weapons": 90,
    # El ramo y los tulipanes no son objetos que se recojan: son
    # decorado grande del calendario y de la celebracion final. A 110 px
    # quedaban en una mancha ilegible.
    "celebration": 300,
}

BG_TRANSPARENT = ("-mid", "-near")


def family_of(rel: str) -> str:
    parts = rel.split("/")
    if parts[0] == "characters" and parts[1] == "heroine":
        return "characters/heroine"
    if len(parts) >= 2 and parts[0] in ("characters", "companions", "enemies", "boss"):
        return f"{parts[0]}/{parts[1]}"
    return parts[0]


# ── 1. Recorte del croma ──────────────────────────────────────────────

def chroma_alpha(rgb: np.ndarray, use_hue: bool = True) -> np.ndarray:
    """
    Alfa 0..1.

    El criterio de distancia caza el magenta plano del fondo. El de tono
    ademas caza las sombras proyectadas en magenta oscuro, pero es
    peligroso: tambien muerde los violetas legitimos. Por eso se puede
    desactivar — los fondos del juego son morados y con el tono activo
    se les borraban trozos del dibujo.
    """
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]

    # Criterio A: cerca del magenta puro.
    dist = np.linalg.norm(f - CHROMA, axis=-1)
    a_dist = np.clip((dist - 92.0) / (170.0 - 92.0), 0.0, 1.0)
    if not use_hue:
        return a_dist

    # Criterio B: tono magenta (rojo y azul altos, verde hundido).
    mx = f.max(axis=-1)
    magenta_ish = (np.minimum(r, b) - g) / np.maximum(mx, 1.0)
    a_hue = np.clip(1.0 - (magenta_ish - 0.28) / 0.22, 0.0, 1.0)

    return np.minimum(a_dist, a_hue)


def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Despeja el magenta mezclado en los pixeles del borde."""
    a = np.clip(alpha, 1e-3, 1.0)[..., None]
    clean = (rgb.astype(np.float32) - (1.0 - a) * CHROMA) / a
    return np.clip(clean, 0, 255)


# ── 2. Limpieza de restos ─────────────────────────────────────────────

def drop_stray_blobs(alpha: np.ndarray, keep_ratio: float = 0.06) -> np.ndarray:
    """
    Se queda con la figura principal y tira lo suelto.

    Algunas imagenes traen la etiqueta de la pose escrita debajo
    ("IDLE", "RUN") o un recorte de otra imagen pegado en una esquina.
    Como es texto claro sobre magenta, sobrevive al croma.

    No basta con mirar el tamano: el recorte de la esquina del ramo de
    tulipanes ocupaba un 10% del dibujo y pasaba el filtro. Tambien
    cuenta la distancia — un trozo que esta lejos de la figura y no la
    toca no forma parte de ella, por grande que sea.
    """
    mask = alpha > 0.35
    labels, n = ndimage.label(mask)
    if n <= 1:
        return alpha

    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    biggest = sizes.max()

    # Caja de la figura principal, con un margen generoso.
    ys, xs = np.where(labels == main)
    pad = 0.12 * max(alpha.shape)
    y0, y1 = ys.min() - pad, ys.max() + pad
    x0, x1 = xs.min() - pad, xs.max() + pad

    keep = {main}
    for i, size in enumerate(sizes):
        lbl = i + 1
        if lbl == main:
            continue
        # Muy pequeno: fuera sin mas.
        if size < biggest * keep_ratio:
            continue
        # Grande pero desconectado: solo se queda si cae dentro de la
        # caja de la figura, es decir, si plausiblemente es parte de ella.
        cy, cx = ndimage.center_of_mass(mask, labels, lbl)
        if y0 <= cy <= y1 and x0 <= cx <= x1:
            keep.add(lbl)

    survivors = np.isin(labels, list(keep))
    return np.where(survivors, alpha, 0.0)


# ── 3. Estilizado ─────────────────────────────────────────────────────

def stylize(rgb: np.ndarray, alpha: np.ndarray, cfg: dict) -> tuple[np.ndarray, np.ndarray]:
    """
    Convierte un render en algo que parece dibujado.

    Se aplica ya al tamano final: el grosor del contorno es en pixeles de
    salida, que es lo unico que se ve realmente en pantalla.
    """
    out = rgb.astype(np.float32)

    # Realce: sube el brillo conservando el tono, para el arte que llega
    # tan oscuro que se pierde contra el fondo.
    lift = cfg.get("lift", 1.0)
    if lift > 1.0:
        out = np.clip(out * lift, 0, 255)

    if cfg["levels"] > 0:
        # Subir saturacion: la foto es apagada, el dibujo no.
        lum = (out @ LUMA)[..., None]
        out = np.clip(lum + (out - lum) * cfg["sat"], 0, 255)

        # Aplanar degradados: es lo que separa un render de un dibujo.
        n = cfg["levels"]
        out = np.round(out / 255.0 * (n - 1)) / (n - 1) * 255.0

        # Virar las sombras hacia el violeta SIN oscurecerlas: se
        # renormaliza para conservar la luminancia original.
        lum = (out @ LUMA)[..., None]
        shade = np.clip(1.0 - lum / 150.0, 0.0, 1.0)
        tinted = out * SHADOW_TINT
        tint_lum = (tinted @ LUMA)[..., None]
        tinted = tinted * (lum / np.maximum(tint_lum, 1.0))
        out = np.clip(out * (1.0 - shade) + tinted * shade, 0, 255)

    # Lineas interiores: marcan los planos, como el entintado de un comic.
    if cfg["edges"] > 0:
        lum_img = Image.fromarray(np.clip(out @ LUMA, 0, 255).astype(np.uint8))
        e = np.asarray(lum_img.filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
        e = np.clip((e - 0.12) * 2.4, 0.0, 1.0) * cfg["edges"]
        out = out * (1.0 - e[..., None])

    # Contorno exterior. Antes se encoge la silueta un pixel: el borde
    # que deja el generador viene contaminado de magenta, y si no se
    # recorta reaparece como halo rosa sobre el pelo oscuro.
    if cfg["outline"] > 0:
        a_img = Image.fromarray((alpha * 255).astype(np.uint8))
        eroded = np.asarray(a_img.filter(ImageFilter.MinFilter(3)), dtype=np.float32) / 255.0
        alpha = np.minimum(alpha, eroded)

        k = cfg["outline"] * 2 + 1
        a_img = Image.fromarray((alpha * 255).astype(np.uint8))
        grown = np.asarray(a_img.filter(ImageFilter.MaxFilter(k)), dtype=np.float32) / 255.0
        ring = np.clip(grown - alpha, 0.0, 1.0)[..., None]
        out = out * (1.0 - ring) + np.array(OUTLINE_RGB, dtype=np.float32) * ring
        alpha = np.maximum(alpha, grown)

    return np.clip(out, 0, 255), alpha


# Familias cuyas poses deben medir lo mismo. El pack trae frames
# dibujados a escalas distintas —el golpe de pico de la heroina mide la
# mitad que su reposo— y al animarlas el personaje encoge de golpe.
NORMALIZE_POSES = (
    "characters/heroine",
    "companions/cat",
    "enemies/villager",
    "enemies/creeper",
    "characters/guide",
    "characters/ally",
    "boss/mother",
)


def drawn_height(img: Image.Image) -> int:
    a = np.asarray(img)[..., 3]
    rows = np.where(a.max(axis=1) > 8)[0]
    return int(rows[-1] - rows[0] + 1) if len(rows) else 0


def rescale_to(img: Image.Image, target_h: int) -> Image.Image:
    """
    Reescala el dibujo hasta la altura pedida, anclado a los pies.
    El lienzo no cambia: asi el marco comun del grupo sigue valiendo.
    """
    current = drawn_height(img)
    if current <= 0 or target_h <= 0:
        return img
    factor = target_h / current
    if abs(factor - 1.0) < 0.02:
        return img

    a = np.asarray(img)[..., 3]
    rows = np.where(a.max(axis=1) > 8)[0]
    cols = np.where(a.max(axis=0) > 8)[0]
    if len(rows) == 0 or len(cols) == 0:
        return img
    box = (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)

    content = img.crop(box)
    new_size = (max(1, round(content.width * factor)), max(1, round(content.height * factor)))
    content = content.resize(new_size, Image.LANCZOS)

    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    # Centrado en X y apoyado donde estaban los pies: si se anclara por
    # arriba, el personaje flotaria al cambiar de pose.
    x = (img.width - content.width) // 2
    y = box[3] - content.height
    out.paste(content, (x, max(0, y)))
    return out


def foot_row(img: Image.Image) -> int:
    """Fila mas baja con dibujo: donde apoya el personaje."""
    a = np.asarray(img)[..., 3]
    rows = np.where(a.max(axis=1) > 8)[0]
    return int(rows[-1]) if len(rows) else -1


def shift_feet_to(img: Image.Image, target_row: int) -> Image.Image:
    """
    Mueve el dibujo en vertical hasta apoyar en la fila pedida.

    Con el origen del sprite en los pies, si cada frame apoya a distinta
    altura el personaje da un brinco al cambiar de animacion. Esto es lo
    que corrige ese baile.
    """
    current = foot_row(img)
    if current < 0 or target_row < 0 or current == target_row:
        return img
    dy = target_row - current
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, dy))
    return out


def sky_alpha(rgb: np.ndarray) -> np.ndarray:
    """
    Alfa para la capa media de los fondos.

    Las capas del pack vienen como ilustraciones completas y opacas, asi
    que la media tapaba a la lejana y la luna no se veia nunca. Aqui el
    cielo claro entre los arboles se vuelve transparente y las siluetas
    oscuras se quedan: es lo que convierte tres imagenes en parallax.
    """
    lum = rgb.astype(np.float32) @ LUMA
    # Por debajo de 40 es silueta y se queda entera; por encima de 105 es
    # cielo y desaparece del todo.
    return np.clip(1.0 - (lum - 40.0) / 65.0, 0.0, 1.0)


# Familias cuyo dibujo es morado o violeta de por si.
#
# En estas el criterio de tono no se puede usar: se comeria los propios
# tulipanes y la pastilla junto con el fondo magenta. Se paga con alguna
# sombra magenta oscura que sobrevive en los bordes, que es mucho menos
# grave que perder la mitad del objeto.
PURPLE_FAMILIES = ("celebration/", "items/item-pill")


def cutout(path: str, is_opaque_bg: bool, is_bg: bool = False, keep_purple: bool = False) -> Image.Image:
    """Solo recorta el croma. El estilizado va despues, ya a escala final."""
    img = Image.open(path).convert("RGB")
    rgb = np.asarray(img)
    alpha = chroma_alpha(rgb, use_hue=not is_bg and not keep_purple)

    if is_bg and not is_opaque_bg and "-mid" in path.replace(os.sep, "/"):
        # Capa media: silueta opaca, cielo transparente.
        clean = decontaminate(rgb, alpha)
        a = np.minimum(alpha, sky_alpha(clean))
        out = np.dstack([clean, a * 255.0]).astype(np.uint8)
        return Image.fromarray(out, "RGBA")

    if is_opaque_bg:
        # La capa de fondo tiene que ser opaca, pero los originales vienen
        # con marco magenta (hasta el 100% de la fila inferior). Se quita
        # el croma y el hueco se rellena con el color mas oscuro de la
        # propia imagen, para que siga siendo una base solida.
        clean = decontaminate(rgb, alpha)
        opaque = alpha > 0.5
        if opaque.any():
            lum = clean @ np.array([0.299, 0.587, 0.114])
            floor = clean[opaque][np.argsort(lum[opaque])[: max(1, opaque.sum() // 50)]]
            fill = floor.mean(axis=0)
        else:
            fill = np.array([12.0, 8.0, 20.0])
        blended = clean * alpha[..., None] + fill * (1.0 - alpha[..., None])
        out = np.dstack([blended, np.full(rgb.shape[:2], 255.0)])
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")

    alpha = drop_stray_blobs(alpha)
    clean = decontaminate(rgb, alpha)
    out = np.dstack([clean, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def apply_style(img: Image.Image, fam: str, soften: float = 1.0) -> Image.Image:
    cfg = dict(STYLE.get(fam, DEFAULT_STYLE))
    if soften != 1.0:
        cfg["edges"] *= soften
        cfg["outline"] = 0
    data = np.asarray(img).astype(np.float32)
    rgb, alpha = data[..., :3], data[..., 3] / 255.0
    styled, alpha = stylize(rgb, alpha, cfg)
    return Image.fromarray(
        np.dstack([styled, alpha * 255.0]).astype(np.uint8), "RGBA"
    )


# ── 4-5. Marco comun, escala y guardado ───────────────────────────────

def content_bbox(img: Image.Image, threshold: int = 8):
    a = np.asarray(img)[..., 3]
    rows = np.where(a.max(axis=1) > threshold)[0]
    cols = np.where(a.max(axis=0) > threshold)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


PORTRAIT_HEIGHT = 360


def extract_portraits(manifest: dict) -> int:
    """
    Saca los retratos de seleccion de personaje.

    NO se usan las hojas de referencia: la de la pelirroja viene con la
    cara pintada del color del pelo, un defecto de generacion que no se
    arregla procesando. Las poses idle si estan limpias en los tres
    colores, asi que el retrato se recorta de ahi. Ademas quedan los
    tres de perfil y consistentes entre si.
    """
    # Se recortan los tres primero y se guardan despues, ya igualados.
    #
    # Cada melena ocupa un ancho distinto, asi que recortando cada uno a
    # su contenido salian tres retratos de tamanos distintos y en
    # pantalla uno se veia mucho mas cerca que los otros.
    heads: dict[str, Image.Image] = {}

    for skin in ("blue", "blonde", "red"):
        src = os.path.join(SRC, "characters", "heroine", skin, "idle.png")
        if not os.path.exists(src):
            print(f"  aviso: falta la pose idle de {skin}")
            continue

        rgb = np.asarray(Image.open(src).convert("RGB"))
        alpha = drop_stray_blobs(chroma_alpha(rgb))
        body = None
        rows = np.where((alpha > 0.4).max(axis=1))[0]
        cols = np.where((alpha > 0.4).max(axis=0))[0]
        if len(rows) == 0:
            print(f"  aviso: {skin} idle quedo vacio")
            continue
        body = (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)

        # La cabeza es el 34% superior del cuerpo. Se mide el ancho real
        # dentro de esa banda para no dejar aire a los lados.
        band_bottom = body[1] + int((body[3] - body[1]) * 0.34)
        band = alpha[body[1]:band_bottom] > 0.4
        band_cols = np.where(band.max(axis=0))[0]
        x0 = int(band_cols[0]) if len(band_cols) else body[0]
        x1 = int(band_cols[-1]) + 1 if len(band_cols) else body[2]
        y0, y1 = body[1], band_bottom

        # Encuadre anclado a la cara, no al pelo.
        #
        # Las tres miran a la derecha, asi que la cara esta siempre en
        # ese borde. La melena azul es mucho mas ancha que las otras dos
        # y, recortando por el contenido, su cabeza ocupaba una fraccion
        # mucho menor del retrato: en pantalla se veia mas pequena.
        # Fijando el ancho en proporcion al alto de la cabeza, las tres
        # quedan igual de cerca.
        pad = 12
        band_h = y1 - y0
        want_w = round(band_h * 1.08)
        right = min(rgb.shape[1], x1 + pad)
        left = max(0, right - want_w)
        box = (left, max(0, y0 - pad), right, min(rgb.shape[0], y1 + pad))

        clean = decontaminate(rgb, alpha)
        full = Image.fromarray(
            np.dstack([clean, alpha * 255.0]).astype(np.uint8), "RGBA"
        )
        head = full.crop(box)
        scale = PORTRAIT_HEIGHT / head.height
        head = head.resize(
            (max(1, round(head.width * scale)), PORTRAIT_HEIGHT), Image.LANCZOS
        )
        heads[skin] = apply_style(head, "characters/heroine")

    if not heads:
        return 0

    # Mismo lienzo para los tres, centrados: asi el marco de seleccion
    # encuadra igual a las tres y ninguna parece mas cerca que otra.
    width = max(h.width for h in heads.values())
    done = 0

    for skin, head in heads.items():
        canvas = Image.new("RGBA", (width, PORTRAIT_HEIGHT), (0, 0, 0, 0))
        canvas.alpha_composite(head, ((width - head.width) // 2, 0))

        rel = f"ui/portrait-{skin}.webp"
        out = os.path.join(DST, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        canvas.save(out, "WEBP", quality=92, method=6)
        manifest[f"ui/portrait-{skin}"] = {
            "path": f"assets/art/{rel}",
            "w": canvas.width,
            "h": canvas.height,
            "family": "ui",
        }
        done += 1
    return done


# Poses que NO se igualan por altura.
#
# La igualacion automatica mide el ALTO del dibujo, y estas dos son
# horizontales a proposito: el gato saltando y el del zarpazo miden la
# mitad de alto que sentado porque van estirados, no porque esten
# dibujados a otra escala — de ancho miden lo mismo que el resto de sus
# poses. Al igualarlos por altura se les colaba un x2,2 que los sacaba
# del lienzo, y lo que se salia se perdia: de ahi que a Luna le
# aparecieran la cola y las patas cortadas de un tajo recto al saltar.
#
# Antes esto se parcheaba encogiendolas a mano DESPUES de estirarlas, y
# eso no devuelve lo que ya se habia recortado.
KEEP_AS_DRAWN = {
    "companions/cat/jump.png",
    "companions/cat/attack.png",
}


def normalize_pose_heights(prepared: dict[str, Image.Image]) -> int:
    """
    Iguala la altura dibujada dentro de cada carpeta de poses.

    Se toma la mediana del grupo y se reescala lo que se aparte mas de un
    18%. La mediana, y no la media, porque basta un frame mal dibujado
    para arrastrar la media entera.
    """
    groups: dict[str, list[str]] = defaultdict(list)
    for rel in prepared:
        fam = family_of(rel)
        if fam in NORMALIZE_POSES:
            groups[os.path.dirname(rel)].append(rel)

    fixed = 0
    for members in groups.values():
        heights = [drawn_height(prepared[r]) for r in members]
        usable = sorted(h for h in heights if h > 0)
        if len(usable) < 3:
            continue
        median = usable[len(usable) // 2]
        for rel, h in zip(members, heights):
            if rel in KEEP_AS_DRAWN:
                continue
            if h > 0 and abs(h - median) / median > 0.18:
                prepared[rel] = rescale_to(prepared[rel], median)
                fixed += 1

        # Y una vez igualadas de alto, todas apoyan en la misma linea.
        feet = [foot_row(prepared[r]) for r in members]
        valid = sorted(f for f in feet if f >= 0)
        if not valid:
            continue
        base = valid[len(valid) // 2]
        for rel, f in zip(members, feet):
            if f >= 0 and abs(f - base) > 4:
                prepared[rel] = shift_feet_to(prepared[rel], base)
                fixed += 1
    return fixed


def main() -> int:
    if not os.path.isdir(SRC):
        print(f"No encuentro el pack en {SRC}")
        return 1

    files = []
    for root, _, names in os.walk(SRC):
        for n in names:
            if n.lower().endswith(".png"):
                rel = os.path.relpath(os.path.join(root, n), SRC).replace(os.sep, "/")
                if not rel.startswith("source_sheets/"):
                    files.append(rel)
    files.sort()
    print(f"{len(files)} imagenes que procesar\n")

    prepared: dict[str, Image.Image] = {}
    group_box: dict[str, tuple] = defaultdict(lambda: None)

    for i, rel in enumerate(files, 1):
        is_bg = rel.startswith("backgrounds/")
        opaque_bg = is_bg and not any(k in rel for k in BG_TRANSPARENT)
        keep_purple = any(rel.startswith(f) for f in PURPLE_FAMILIES)
        img = cutout(os.path.join(SRC, rel), opaque_bg, is_bg, keep_purple)
        prepared[rel] = img
        box = (0, 0, img.width, img.height) if opaque_bg else content_bbox(img)
        if box is None:
            print(f"  aviso: {rel} quedo vacio")
            box = (0, 0, img.width, img.height)
        g = os.path.dirname(rel)
        group_box[g] = union(group_box[g], box)
        if i % 25 == 0:
            print(f"  procesadas {i}/{len(files)}")

    # Igualar la altura del dibujo dentro de cada grupo de poses.
    fixed = normalize_pose_heights(prepared)
    if fixed:
        print(f"  poses reescaladas por venir a otra escala: {fixed}")
        group_box.clear()
        for rel, img in prepared.items():
            if rel.startswith("backgrounds/"):
                box = (0, 0, img.width, img.height)
            else:
                box = content_bbox(img) or (0, 0, img.width, img.height)
            g = os.path.dirname(rel)
            group_box[g] = union(group_box[g], box)

    # Limpieza quirurgica: solo lo que produce ESTE script. Borrar la
    # carpeta entera se llevaba por delante los tiles y los fondos, que
    # generan otros dos, y el terreno aparecia como textura ausente.
    OWNED = ("characters", "companions", "enemies", "boss", "items", "weapons", "celebration", "ui")
    for sub in OWNED:
        path = os.path.join(DST, sub)
        if os.path.isdir(path):
            shutil.rmtree(path)
    os.makedirs(DST, exist_ok=True)

    manifest: dict[str, dict] = {}
    total = 0

    for rel in files:
        img = prepared[rel].crop(group_box[os.path.dirname(rel)])
        fam = family_of(rel)

        if rel.startswith("backgrounds/"):
            # Los fondos solo se aplanan un poco: nada de contorno, que
            # ahi no hay silueta que marcar.
            img = apply_style(img, fam, soften=0.35)
        else:
            # Primero a tamano final, y el estilo despues: asi el grosor
            # del contorno es el que se ve en pantalla, no uno teorico.
            target = TARGET_HEIGHT.get(fam, 120)
            scale = target / max(1, img.height)
            img = img.resize(
                (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                Image.LANCZOS,
            )
            img = apply_style(img, fam)

        out_rel = rel[:-4] + ".webp"
        out_path = os.path.join(DST, out_rel)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        img.save(out_path, "WEBP", quality=88, method=6)
        total += os.path.getsize(out_path)

        manifest[rel[:-4]] = {
            "path": f"assets/art/{out_rel}",
            "w": img.width,
            "h": img.height,
            "family": fam,
        }

    n_portraits = extract_portraits(manifest)
    print(f"\nretratos de seleccion: {n_portraits}")

    # Los tiles los genera otro script y viven en el mismo manifiesto.
    # Sin esto, cada pasada por aqui los borraba y el terreno aparecia
    # como la textura de "falta" de Phaser: una rejilla verde.
    if os.path.exists(OUT_MANIFEST):
        with open(OUT_MANIFEST, encoding="utf-8") as f:
            previous = json.load(f).get("assets", {})
        for key, value in previous.items():
            if key.startswith("tiles/"):
                manifest.setdefault(key, value)

    os.makedirs(os.path.dirname(OUT_MANIFEST), exist_ok=True)
    with open(OUT_MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": manifest}, f, indent=2, ensure_ascii=False)

    src_bytes = sum(os.path.getsize(os.path.join(SRC, r)) for r in files)
    print(f"\nlisto: {len(files)} imagenes")
    print(f"  antes: {src_bytes / 1024 / 1024:6.1f} MB (PNG con magenta)")
    print(f"  ahora: {total / 1024 / 1024:6.1f} MB (WebP con alfa)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
