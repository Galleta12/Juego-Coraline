"""
Prepara las pantallas completas del tramo final.

Son laminas que se ven enteras — la de escribir el nombre, las cuatro
cartas de transicion, las dos de eleccion y el ticket — asi que aqui no
hay que recortar nada de dentro: solo separar las que vienen dos en una
lamina, ajustar el tamaño y pasarlas a webp.

    python scripts/process_screens.py
"""

from __future__ import annotations

import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "public", "assets", "art")
MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

# El juego mide 960x540 logicos. Se guardan al doble de ancho para que
# aguanten pantallas grandes sin verse blandas.
MAX_W = 1920

# La lamina del nombre trae DOS imagenes pegadas, separadas por una
# franja negra que empieza en x=797: a la izquierda la pantalla de
# escribir el nombre, a la derecha el ticket en blanco del final.
SPLIT = {
    # De aqui solo se saca el ticket. La pantalla del nombre venia
    # tambien en esta lamina, pero al partirla quedaba en 797 px de
    # ancho y salia blanda; ahora llega aparte y apaisada.
    "backgorund_primera_escena_ticket_despeus_eleccion.png": [
        ("screens/ticket-blank", (813, 0, 1521, 1024)),
    ],
}

# La lamina de eleccion de personaje se guarda ENTERA y ademas por
# paneles. La escena necesita las dos melenas sueltas para poder
# animarlas encima del fondo: si solo hubiera la lamina completa no se
# podria mover una sin mover la otra.
#
# Las cajas son las lineas del marco dibujado, medidas sobre la lamina.
# Aqui no se recorta el negro ni se ajusta nada: el trozo tiene que
# encajar clavado donde estaba, y cualquier recorte extra lo descoloca.
PIECES = {
    "selection_personaje.png": [
        ("screens/select-blonde", (290, 222, 732, 749)),
        ("screens/select-red", (907, 221, 1352, 748)),
    ],
}

# Opacas que traen un filo de un par de pixeles casi negro alrededor
# del dibujo y necesitan el mismo recorte que las laminas partidas.
# Las demas entradas de WHOLE no se tocan: llevan años calibradas a
# pixel por otras escenas (paneles, zonas de clic) y cualquier cambio
# en su recorte las descuadra.
TRIM_EDGES = {
    "background_transicion_depues_tutoria1l.png",
    "background_transicion_depues_tutorial2.png",
    "boss_beat_1.png",
    "boss_beat_2.png",
    "boss_beat_3.png",
    "boss_beat_4.png",
}

WHOLE = {
    "selection_personaje.png": "screens/select",
    "nombre_image.png": "screens/name-bg",
    # El NO ya no viene pintado en la lamina: se borra al procesar (ver
    # `erase_no_button`) porque ahora es un boton suelto que se aparta
    # del raton, y necesita salir de la lamina para poder moverse.
    "nuevo_eleccion_background.png": "screens/choice",
    "botton_no.png": "screens/no-button",
    "gertudris_acepta.png": "screens/gertrudis",
    # El tutorial ya no cierra con una sola lamina: son dos, una
    # detras de otra (el remate del chiste va en la segunda). La
    # version de una sola pieza (`transicion_despues_tutorial.png`)
    # se queda sin usar.
    "background_transicion_depues_tutoria1l.png": "screens/after-tutorial-1",
    "background_transicion_depues_tutorial2.png": "screens/after-tutorial-2",
    "trastion_despues_nivel1.png": "screens/after-forest",
    "transicion_despues_cave.png": "screens/after-cave",
    "transicion_despues_boss.png": "screens/after-boss",
    # Las cuatro cartas del remate del jefe. Antes salian recortadas en
    # cuadrante de una sola lamina compuesta, y el corte se comia un
    # filo de la vecina — quedaba una franja clara pegada al borde de
    # una de las cuatro. Llegan sueltas y enteras, sin ese problema.
    "boss_beat_1.png": "screens/beat-1",
    "boss_beat_2.png": "screens/beat-2",
    "boss_beat_3.png": "screens/beat-3",
    "boss_beat_4.png": "screens/beat-4",
}


def erase_no_button(img: Image.Image) -> Image.Image:
    """
    Borra el cartel "NO" que trae pintado `nuevo_eleccion_background.png`.

    El boton del NO ahora es una pieza suelta (`botton_no.png`) que se
    aparta del raton en la escena — y para que se pueda mover, el hueco
    que deja tiene que estar VACIO, no con el cartel viejo pintado
    debajo asomando cuando el de verdad se va a otro lado.

    Se rellena por reconstruccion (`cv2.inpaint`, metodo de Telea): la
    zona alrededor del cartel es una repisa oscura bastante lisa, y el
    algoritmo la extiende hacia dentro sin dejar costura. Probado a
    mano contra un relleno liso: un parche de color plano se notaba
    muchisimo mas que dejar que el propio degradado de la repisa se
    complete solo.

    Caja medida a ojo sobre la lamina, con margen de sobra para
    llevarse el marco dorado entero — quedarse corto deja un borde
    fantasma.
    """
    rgb = np.asarray(img.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    mask = np.zeros(rgb.shape[:2], dtype=np.uint8)
    x0, y0, x1, y1 = 495, 712, 1160, 862
    mask[y0:y1, x0:x1] = 255
    mask = cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=2)

    out = cv2.inpaint(bgr, mask, 9, cv2.INPAINT_TELEA)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def trim_black(img: Image.Image) -> Image.Image:
    """Quita el marco negro que rodea a la lamina."""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    lit = a.max(axis=2) > 26

    rows = np.flatnonzero(lit.any(axis=1))
    cols = np.flatnonzero(lit.any(axis=0))
    if rows.size == 0 or cols.size == 0:
        return img
    return img.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))


def save(img: Image.Image, rel: str, added: dict) -> None:
    if img.width > MAX_W:
        k = MAX_W / img.width
        img = img.resize((MAX_W, max(1, round(img.height * k))), Image.LANCZOS)

    path = os.path.join(DST, f"{rel}.webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Las transiciones vienen con transparencia y hay que conservarla.
    img.save(path, "WEBP", quality=90, method=6)
    added[rel] = {
        "path": f"assets/art/{rel}.webp",
        "w": img.width,
        "h": img.height,
        "family": rel.split("/")[0],
    }
    print(f"  {rel:28} {img.width}x{img.height}")


def main() -> int:
    added: dict[str, dict] = {}

    for filename, parts in SPLIT.items():
        src = os.path.join(ROOT, filename)
        if not os.path.exists(src):
            print(f"  falta {filename}")
            continue
        sheet = Image.open(src).convert("RGBA")
        for rel, box in parts:
            piece = sheet.crop(box)
            # Las dos laminas vienen sobre una cama negra con margen. Sin
            # recortarla, el ticket sale con franjas negras arriba y
            # abajo y parece pegado sobre un rectangulo.
            save(trim_black(piece), rel, added)

    for filename, parts in PIECES.items():
        src = os.path.join(ROOT, filename)
        if not os.path.exists(src):
            print(f"  falta {filename}")
            continue
        sheet = Image.open(src).convert("RGBA")
        for rel, box in parts:
            save(sheet.crop(box), rel, added)

    for filename, rel in WHOLE.items():
        src = os.path.join(ROOT, filename)
        if not os.path.exists(src):
            print(f"  falta {filename}")
            continue
        img = Image.open(src).convert("RGBA")

        if filename == "nuevo_eleccion_background.png":
            img = erase_no_button(img).convert("RGBA")

        # Recorte al contenido: las laminas transparentes traen mucho
        # margen alrededor del dibujo, y centrarlas en pantalla con ese
        # margen las deja descuadradas.
        #
        # Las opacas no tienen margen transparente que recortar por ahi
        # — sale el lienzo entero, `getbbox()` no hace nada — pero las
        # que vienen en TRIM_EDGES si traen un filo de un par de pixeles
        # casi negro alrededor del dibujo, y ese lo quita `trim_black()`.
        # No se aplica a las demas opacas a ciegas: varias escenas miden
        # sus zonas de clic o sus paneles en pixeles exactos de estas
        # laminas, y recortarles hasta un pixel de mas las descuadra.
        if filename in TRIM_EDGES:
            img = trim_black(img)
        box = img.getbbox()
        if box:
            img = img.crop(box)
        save(img, rel, added)

    existing: dict[str, dict] = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            existing = json.load(f).get("assets", {})
    existing.update(added)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": existing}, f, indent=2, ensure_ascii=False)

    print(f"\nlisto: {len(added)} pantallas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
