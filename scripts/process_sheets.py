"""
Recorta las hojas de la heroina y de la jefa.

La heroina llega en UNA lamina por personaje con las seis animaciones de
cuerpo — `rubia_usar_sprite_sheet.png` y `roja_usar_sprite_sheet.png` —
mas una lamina APARTE solo para el reposo, con varios fotogramas de
idle (`rubia_usar_idle.png`, `roja_usar_idle.png`). Las de cuerpo traen
transparencia de verdad; las de idle no siempre — la rubia si, la
pelirroja llega con un cuadriculado casi blanco aplanado a opaco, que
hay que quitar aparte.

La jefa sigue viniendo en hojas de croma verde, una por animacion, y esa
parte no ha cambiado.

    python scripts/process_sheets.py
"""

from __future__ import annotations

import json
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_incoming", "sheets")
DST = os.path.join(ROOT, "public", "assets", "art")
MANIFEST = os.path.join(ROOT, "src", "art", "assets.json")

# Alto de salida. Todas las poses se guardan igual para que el personaje
# no "crezca" al cambiar de animacion.
HERO_H = 260
BOSS_H = 300

# ── Las laminas de la heroina ───────────────────────────────────────
#
# Seis filas, siempre en este orden:
#
#   1  andar        6 fotogramas
#   2  correr       6
#   3  salto        6 en la rubia, 4 en la pelirroja
#   4  disparo      4   <-- NO se recorta, ver mas abajo
#   5  golpe        3
#   6  de espaldas  1
#
# La fila del salto es la que hacia falta. Las hojas viejas traian
# cuatro poses de salto y las cuatro estaban en cuclillas, asi que el
# aire habia que sacarlo de otra lamina a base de recortes; estas traen
# el impulso, el AIRE y el ATERRIZAJE dibujados aparte.
#
# La del disparo se salta a proposito: en esos fotogramas lleva una
# pistola negra en la mano, y el juego dibuja el arma como sprite
# suelto — la pistola Monster, que es una de las referencias que tienen
# que verse. Usandolos se le verian dos armas a la vez.
HERO_SHEET = {
    "blonde": {
        "file": "rubia_usar_sprite_sheet.png",
        # Fila 3: de pie, impulso, aire, caida, aterrizaje, de pie.
        "counts": (6, 6, 6, 4, 3, 1),
        "jump": {"rise": 2, "air": 3, "fall": 4, "land": 5},
        "idle_file": "rubia_usar_idle.png",
        "idle_count": 5,
    },
    "red": {
        "file": "roja_usar_sprite_sheet.png",
        # Fila 3: cuclillas, impulso, aire, aterrizaje. No hay pose de
        # caida propia, asi que bajando se repite la del aire: es la
        # pose recogida y cayendo se lee igual de bien.
        "counts": (6, 6, 4, 4, 3, 1),
        "jump": {"rise": 2, "air": 3, "fall": 3, "land": 4},
        # La primera version (`roja_usar_idle.png`) no traia alfa de
        # verdad: el fondo era un cuadriculado casi blanco aplanado a
        # opaco, y en los huecos entre rizos del pelo se colaban flecos
        # blancos que `unchroma_checker` no podia distinguir de fondo de
        # verdad. Esta viene con transparencia real, como la de la
        # rubia, y no pasa por `unchroma_checker` en absoluto.
        "idle_file": "nuevo_red_dile_arreglado.png",
        "idle_count": 6,
    },
}

# Como se llama lo que sale de cada fila. `None` = fila que no se corta.
ROW_NAMES = ("walk-{i}", "run-{i}", "jump", None, "hit-{i}", "back")


BOSS_SHEETS = [
    ("float-{i}", "mother-float-5", 5),
    ("fly-{i}", "mother-fly-horizontal-4", 4),
    ("dive-{i}", "mother-dive-4", 4),
    ("spit-{i}", "mother-spit-5", 5),
    ("death-{i}", "mother-death-5", 5),
]


def unchroma(img: Image.Image) -> Image.Image:
    """
    Quita el verde y deja el borde limpio.

    El croma se detecta por dominancia del canal verde, no por igualdad
    con un color: el PNG trae el verde ligeramente sucio por la
    compresion, y comparar contra #00FF00 exacto dejaba una costra
    alrededor de la figura.
    """
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    # Cuanto verde tiene de mas respecto a su vecino mas fuerte.
    #
    # Esta es la medida buena. Antes se pedia verde brillante Y muy
    # separado del rojo y del azul a la vez (g>90, diferencias>45), y
    # con eso el croma apagado del filo no llegaba a contar como fondo:
    # quedaba pegado a las zapatillas, a la mano y en el hueco entre el
    # brazo y el cuerpo, en forma de manchas verdes.
    greenness = g - np.maximum(r, b)

    # Tres zonas: fondo, borde y figura.
    SOLID = 26.0  # a partir de aqui es candidato a fondo
    EDGE = 4.0  # por debajo de aqui es figura limpia

    candidate = greenness > SOLID

    # LA ROPA VERDE NO ES CROMA.
    #
    # La rubia lleva una chaqueta verdosa, y marcando como fondo todo lo
    # que tirase a verde se le abrian agujeros en la ropa. Hay dos cosas
    # que separan el croma de una prenda verde:
    #
    #   * el croma es verde PURO y luminoso — rojo y azul por los
    #     suelos —, mientras que un verde de tela va mezclado con gris;
    #   * y sobre todo, el croma es el fondo: se llega a el desde el
    #     borde de la lamina. La chaqueta esta rodeada de personaje.
    #
    # Asi que se conserva lo que sea verde apagado y ademas quede
    # encerrado dentro de la figura.
    pure = greenness > 70

    labels, n = ndimage.label(candidate)
    if n:
        outer = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
        outer.discard(0)
        touching = np.isin(labels, list(outer)) if outer else np.zeros_like(candidate)
    else:
        touching = np.zeros_like(candidate)

    # Fondo = el croma de fuera, mas las bolsas de croma PURO que quedan
    # atrapadas dentro (el hueco entre el brazo y el cuerpo, por
    # ejemplo). Un verde apagado y encerrado es tela, y se queda.
    green = touching | (candidate & pure)

    fg = ~green

    # NO se erosiona el contorno.
    #
    # Antes se comia un pixel de todo el borde para matar el halo verde,
    # y eso arrasaba con los mechones finos de pelo y los dedos: la
    # heroina salia con trozos cortados. Con croma no hace falta —
    # basta con despintar el verde que quede.
    #
    # Tampoco se rellenan huecos: un pixel verde es fondo este donde
    # este. Al rellenarlos, el verde de entre el pelo y el brazo se
    # marcaba como figura conservando su color, y aparecian parches
    # fosforitos sobre el personaje.
    #
    # Y solo se quitan motas de un pixel, con una apertura minima que no
    # llega a tocar nada del dibujo.
    fg = ndimage.binary_opening(fg, np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool))

    rgb = a.copy()

    # Despill a fondo: TODO lo que tenga verde de mas se lo baja al
    # nivel de sus vecinos. Sin el, el filo de la figura conserva un
    # borde verdoso que sobre los morados del juego canta muchisimo.
    # Solo en el filo: teñir tambien la ropa verde le quitaria el color.
    limit = np.maximum(rgb[..., 0], rgb[..., 2])
    fringe = fg & (greenness > EDGE)
    rgb[..., 1] = np.where(fringe, limit + greenness * 0.12, g)

    # El borde se desvanece en vez de cortarse: los pixeles que estan a
    # medio camino entre croma y figura — las puntas del pelo, el filo
    # de una zapatilla — quedan medio transparentes en lugar de
    # sobrevivir enteros y verdes.
    ramp = np.clip((SOLID - greenness) / (SOLID - EDGE), 0.0, 1.0)
    alpha = np.where(fg, ramp * 255.0, 0.0)
    alpha = ndimage.uniform_filter(alpha, size=2)

    out = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def split(img: Image.Image, count: int) -> list[Image.Image]:
    """Parte la fila en sus fotogramas buscando las columnas vacias."""
    cut = unchroma(img)

    # Fuera los desperdicios del generador.
    #
    # Alguna hoja trae, ademas de las poses, un dibujo suelto y diminuto
    # en una esquina — en la de recibir golpe hay una cabeza pequena
    # abajo a la izquierda. Cae en la misma columna que la primera pose
    # y la arrastra, asi que ese fotograma salia destrozado.
    arr = np.asarray(cut).copy()
    labels, n = ndimage.label(arr[..., 3] > 40)
    if n > 1:
        sizes = ndimage.sum(arr[..., 3] > 40, labels, range(1, n + 1))
        biggest = sizes.max()
        keep = [i + 1 for i, s in enumerate(sizes) if s > biggest * 0.15]
        arr[..., 3] = np.where(np.isin(labels, keep), arr[..., 3], 0)
        cut = Image.fromarray(arr, "RGBA")

    alpha = np.asarray(cut)[..., 3]

    col = (alpha > 40).sum(axis=0)
    on = col > 2

    runs: list[tuple[int, int]] = []
    start = None
    for x, v in enumerate(on):
        if v and start is None:
            start = x
        elif not v and start is not None:
            if x - start > 10:
                runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, len(on)))

    # Si salen de mas, se quedan los mas anchos: lo demas son chispas
    # sueltas del disparo o motas del croma.
    if len(runs) > count:
        runs = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:count])

    out: list[Image.Image] = []
    for x0, x1 in runs:
        piece = cut.crop((max(0, x0 - 3), 0, min(cut.width, x1 + 3), cut.height))
        box = piece.getbbox()
        out.append(piece.crop(box) if box else piece)
    return out


def save(img: Image.Image, rel: str, added: dict) -> None:
    path = os.path.join(DST, f"{rel}.webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=94, method=6)
    added[rel] = {
        "path": f"assets/art/{rel}.webp",
        "w": img.width,
        "h": img.height,
        "family": rel.split("/")[0],
    }


def do_sheet(
    path: str, pattern: str, count: int, out_h: int, prefix: str, added: dict
) -> None:
    if not os.path.exists(path):
        print(f"  falta {os.path.basename(path)}")
        return

    got = split(Image.open(path), count)
    flag = "" if len(got) == count else f"  <-- esperaba {count}"
    print(f"  {os.path.basename(path):34} {len(got)} frames{flag}")
    if not got:
        return

    # UN SOLO factor de escala para toda la hoja, sacado del fotograma
    # mas alto.
    #
    # Esto era el fallo gordo de las animaciones. Antes cada fotograma
    # se estiraba por separado hasta la misma altura, y eso destroza la
    # animacion: en el salto, la pose recogida del punto alto — que es
    # mas baja porque la figura va encogida — se ampliaba hasta el
    # tamano de la pose de pie y parecia que se agachaba. De ahi que el
    # salto "hiciera crunch" y que la hoja se viera bien pero el juego
    # no.
    #
    # Con un factor comun, las proporciones entre poses se respetan: la
    # que va encogida SE VE encogida.
    tallest = max(p.height for p in got)
    k = out_h / tallest

    for i, piece in enumerate(got, start=1):
        piece = piece.resize(
            (max(1, round(piece.width * k)), max(1, round(piece.height * k))),
            Image.LANCZOS,
        )
        save(piece, f"{prefix}/{pattern.format(i=i)}", added)


def portraits(added: dict) -> None:
    """
    Los retratos de la pantalla de eleccion.

    Salen de las hojas `improved_*`, que traen un retrato grande con la
    CARA en la columna izquierda. Las hojas de croma no tienen ninguno:
    son solo ciclos de animacion, y ampliar una figurita de 260 px para
    llenar el hueco daba una cara borrosa.

    Aqui no se quita el fondo a proposito. El retrato viene con su
    propio fondo rosado y encaja como una foto enmarcada, que es
    justo lo que hace falta en esa pantalla.
    """
    box = (10, 16, 250, 286)
    for skin, filename in (
        ("red", "improved_caroline_red.png"),
        ("blonde", "improved_caroline_rubia.png"),
    ):
        src = os.path.join(ROOT, filename)
        if not os.path.exists(src):
            print(f"  falta {filename}")
            continue
        face = Image.open(src).convert("RGB").crop(box)
        # Al doble, que se ve grande en pantalla.
        face = face.resize((face.width * 2, face.height * 2), Image.LANCZOS)
        save(face, f"ui/portrait-{skin}", added)
        print(f"  retrato {skin:7} {face.width}x{face.height}")


# ── La heroina, hoja completa ───────────────────────────────────────


def row_bands(alpha: np.ndarray, count: int = 6) -> list[tuple[int, int]]:
    """
    Parte la lamina en sus filas buscando los valles.

    No se reparte en franjas iguales: las filas no miden lo mismo — la
    del golpe va encorvada y ocupa menos — y con un reparto regular los
    cortes caen dentro de las figuras. Se cogen los `count - 1` renglones
    mas vacios, obligandolos a estar separados entre si.
    """
    prof = ndimage.uniform_filter1d((alpha > 24).sum(axis=1).astype(float), 9)
    margin = 90
    picked: list[int] = []
    for y in sorted(range(margin, len(prof) - 70), key=lambda i: prof[i]):
        if all(abs(y - p) >= 110 for p in picked):
            picked.append(y)
            if len(picked) == count - 1:
                break
    cuts = sorted(picked)
    edges = [0, *cuts, alpha.shape[0]]
    return [(edges[i], edges[i + 1]) for i in range(count)]


def hero_frames(
    alpha: np.ndarray,
) -> tuple[np.ndarray, list[list[tuple[tuple[int, int, int, int], int]]]]:
    """
    Reparte la lamina en figuras: devuelve el mapa de etiquetas y, por
    fila, la caja de cada pose con su etiqueta.

    Tres pasos, y los tres hacen falta:

    1. Dentro de cada banda se etiquetan las figuras y se tira lo que
       sea mucho mas pequeno que sus vecinas — los rayos del disparo y
       el trozo de la figura de la fila de al lado que asoma por encima
       del corte. Esto da el numero de poses y su columna, que es lo
       fiable.

    2. Cada pixel se asigna a la semilla mas cercana, y se tira entero
       lo que caiga en un borron sin ninguna semilla: asi una figura
       recupera lo que le quedaba fuera de su banda y el fogonazo del
       disparo, que va suelto en el aire, no se pega a nadie.

    3. La CAJA no basta. Las poses de la rubia se tocan — el pie de una
       se apoya en el pelo de la de abajo, y la del aire lleva la melena
       metida en la fila de arriba —, asi que en el rectangulo de una
       pose caen trozos de la vecina. Por eso hace falta la etiqueta:
       al recortar se borra todo lo que no sea de esta figura.
    """
    mask = alpha > 60
    seed = np.zeros(mask.shape, np.int32)
    rows: list[list[int]] = []
    count = 0

    for y0, y1 in row_bands(alpha):
        band = mask[y0:y1]
        lab, n = ndimage.label(band)
        if not n:
            rows.append([])
            continue

        sizes = ndimage.sum(band, lab, range(1, n + 1))
        biggest = sizes.max()
        ids = []
        for i in range(1, n + 1):
            if sizes[i - 1] <= biggest * 0.4:
                continue
            count += 1
            seed[y0:y1][lab == i] = count
            ids.append(count)
        rows.append(ids)

    if not count:
        return seed, [[] for _ in rows]

    _, near = ndimage.distance_transform_edt(seed == 0, return_indices=True)
    labels = np.where(mask, seed[near[0], near[1]], 0)

    # Los borrones que no contienen ninguna semilla son desperdicio del
    # generador — el fogonazo del disparo, una mota — y se van enteros.
    # Sin esto, el reparto por cercania se los pega a la pose que
    # tengan mas a mano, que suele ser de otra fila.
    blobs, n = ndimage.label(mask)
    seeded = np.zeros(n + 1, bool)
    seeded[np.unique(np.where(seed > 0, blobs, 0))] = True
    labels = np.where(seeded[blobs], labels, 0)

    found = ndimage.find_objects(labels)

    out = []
    for ids in rows:
        boxes = []
        for i in ids:
            rows_, cols = found[i - 1]
            boxes.append(((cols.start, rows_.start, cols.stop, rows_.stop), i))
        boxes.sort(key=lambda item: item[0][0])
        out.append(boxes)
    return labels, out


def frame_image(
    sheet: np.ndarray, labels: np.ndarray, box: tuple[int, int, int, int], lid: int
) -> Image.Image:
    """El recorte de una pose, con lo que no es suyo borrado."""
    x0, y0, x1, y1 = box
    part = sheet[y0:y1, x0:x1].copy()
    part[..., 3] = np.where(labels[y0:y1, x0:x1] == lid, part[..., 3], 0)
    return Image.fromarray(part, "RGBA")


def unchroma_checker(img: Image.Image) -> Image.Image:
    """
    Quita el fondo de las hojas de idle nuevas.

    No traen alfa de verdad: el fondo es un cuadriculado casi blanco (dos
    tonos a menos de 15 niveles de diferencia — pensado para leerse como
    "aqui no hay nada" en un editor) que salio aplanado a RGB opaco en
    vez de quedar transparente.

    Por color solo no se separa: la suela de las zapatillas es TAN clara
    como el cuadriculado. Lo que los distingue es la posicion, no el
    tono — el cuadriculado es el fondo, se llega a el desde el borde de
    la lamina; la suela esta encerrada dentro de la figura. Mismo truco
    que `unchroma()` usa con el croma verde atrapado entre el brazo y el
    cuerpo.
    """
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    grey = rgb.mean(axis=2)

    candidate = grey > 225
    labels, n = ndimage.label(candidate)
    if n:
        outer = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
        outer.discard(0)
        touching = np.isin(labels, list(outer)) if outer else np.zeros_like(candidate)
    else:
        touching = np.zeros_like(candidate)

    fg = ~touching
    fg = ndimage.binary_closing(fg, np.ones((3, 3)))
    fg = ndimage.binary_fill_holes(np.pad(fg, 2))[2:-2, 2:-2]

    labels2, n2 = ndimage.label(fg)
    if n2:
        sizes = ndimage.sum(fg, labels2, range(1, n2 + 1))
        biggest = sizes.max()
        keep = [i + 1 for i, s in enumerate(sizes) if s > biggest * 0.03]
        fg = np.isin(labels2, keep)

    # El filo se desvanece en vez de cortarse, dos pixeles de ancho —
    # igual que en `unchroma()`, para que no quede dentado.
    alpha = ndimage.uniform_filter(np.where(fg, 255.0, 0.0), size=2)
    out = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def idle_frames(
    alpha: np.ndarray, count: int
) -> tuple[np.ndarray, list[tuple[tuple[int, int, int, int], int]]] | None:
    """
    Las figuras de una hoja de idle: una sola fila, `count` poses.

    Mismo reparto por cercania que `hero_frames`, pero sin bandas — aqui
    solo hay una fila. Hace falta igual: las poses de idle vienen MUY
    juntas, casi tocandose, y el pelo de una roza el hombro de la
    siguiente. Sin el reparto por cercania, dos figuras pegadas salen en
    un mismo recorte y la caja de la primera invade la segunda.

    Devuelve `None` si no salen exactamente `count` figuras: mejor
    dejar el idle como estaba que dejar una pose descuadrada.
    """
    mask = alpha > 60
    lab, n = ndimage.label(mask)
    if not n:
        return None

    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    biggest = sizes.max()
    ids = [i + 1 for i in range(n) if sizes[i] > biggest * 0.15]
    if len(ids) != count:
        return None

    seed = np.where(np.isin(lab, ids), lab, 0)
    _, near = ndimage.distance_transform_edt(seed == 0, return_indices=True)
    labels = np.where(mask, seed[near[0], near[1]], 0)

    found = ndimage.find_objects(labels)
    boxes = []
    for i in ids:
        rows_, cols = found[i - 1]
        boxes.append(((cols.start, rows_.start, cols.stop, rows_.stop), i))
    boxes.sort(key=lambda item: item[0][0])
    return labels, boxes


def cut_idle(spec: dict) -> list[Image.Image] | None:
    """
    La animacion de reposo, de su propia lamina.

    Independiente del `k` de la lamina de cuerpo a proposito: son dos
    dibujos sueltos, generados aparte, y nada garantiza que compartan la
    misma escala nativa. De hecho no la comparten — probado a mano, el
    factor de la lamina de cuerpo deja a la heroina de pie a mas de
    900px de alto en vez de 260. Este ficha su PROPIA pose mas alta y
    apunta al mismo HERO_H que todo lo demas: el resultado mide igual
    aunque el origen no tuviera por que.
    """
    src = os.path.join(ROOT, spec["idle_file"])
    if not os.path.exists(src):
        print(f"  falta {spec['idle_file']}")
        return None

    arr = np.asarray(Image.open(src).convert("RGBA")).copy()

    # ¿Alfa de verdad, o un cuadriculado aplanado a opaco?
    if arr[..., 3].min() > 250:
        arr = np.asarray(unchroma_checker(Image.fromarray(arr, "RGBA"))).copy()
    else:
        arr[..., 3] = np.where(arr[..., 3] < 12, 0, arr[..., 3])

    result = idle_frames(arr[..., 3], spec["idle_count"])
    if result is None:
        print(f"  {spec['idle_file']}: no salieron {spec['idle_count']} figuras — no se toca")
        return None
    labels, boxes = result

    tallest = max(box[3] - box[1] for box, _ in boxes)
    k = HERO_H / tallest

    return [scaled(frame_image(arr, labels, box, lid), k) for box, lid in boxes]


def scaled(img: Image.Image, k: float) -> Image.Image:
    """
    Reescala respetando el alfa.

    Con premultiplicado, y no a pelo: fuera de la figura la lamina
    guarda un fondo marron oscuro con alfa 0, y al reescalar sin mas ese
    color se cuela en el filo y deja un reborde sucio alrededor del
    pelo.
    """
    a = np.asarray(img).astype(np.float32)
    al = a[..., 3:4] / 255.0
    pre = np.dstack([a[..., :3] * al, a[..., 3]])

    size = (max(1, round(img.width * k)), max(1, round(img.height * k)))
    small = Image.fromarray(pre.clip(0, 255).astype(np.uint8), "RGBA").resize(
        size, Image.LANCZOS
    )

    b = np.asarray(small).astype(np.float32)
    rgb = np.clip(b[..., :3] / np.maximum(b[..., 3:4], 1.0) * 255.0, 0, 255)
    return Image.fromarray(
        np.dstack([rgb, b[..., 3]]).clip(0, 255).astype(np.uint8), "RGBA"
    )


def cut_hero(skin: str, spec: dict, added: dict) -> bool:
    """Recorta la lamina entera de un personaje. False si algo no cuadra."""
    src = os.path.join(ROOT, spec["file"])
    if not os.path.exists(src):
        print(f"  falta {spec['file']}")
        return False

    arr = np.asarray(Image.open(src).convert("RGBA")).copy()
    # El filo mas tenue fuera: es un halo de luz de la propia lamina y
    # sobre los fondos del juego se ve como una gasa alrededor.
    arr[..., 3] = np.where(arr[..., 3] < 12, 0, arr[..., 3])

    labels, rows = hero_frames(arr[..., 3])

    got = tuple(len(r) for r in rows)
    if got != tuple(spec["counts"]):
        print(f"  {skin}: filas {got}, esperaba {tuple(spec['counts'])} — no se toca")
        return False

    # El reposo, de su propia lamina — ver `cut_idle`. Se valida antes
    # de tocar nada mas: si su hoja no cuadra, mejor abortar la heroina
    # entera que dejarla sin pose de pie.
    idle = cut_idle(spec)
    if idle is None:
        return False

    # UN SOLO factor para toda la lamina.
    #
    # Aqui esta la consistencia de las animaciones. Escalando cada pose
    # a la misma altura, la del aire — que va recogida y mide menos — se
    # inflaba hasta el tamano de la de pie y parecia que se agachaba en
    # pleno salto. Con un factor comun para toda la hoja, la que va
    # encogida SE VE encogida y ninguna pose cambia de tamano al pasar
    # de una animacion a otra.
    # La referencia es la fila de ANDAR, no la pose mas alta de la
    # lamina: es la que se ve de pie y la unica que significa lo mismo
    # en las dos hojas. Asi las dos heroinas miden igual en el juego,
    # que es lo que espera el cuerpo fisico — con la pose mas alta,
    # cualquier fotograma raro cambiaria el tamano de todo el personaje.
    tallest = max(box[3] - box[1] for box, _ in rows[0])
    k = HERO_H / tallest

    pieces: list[tuple[str, Image.Image]] = []
    for row, name in zip(rows, ROW_NAMES):
        if name is None:
            continue
        if name == "jump":
            for role, index in spec["jump"].items():
                box, lid = row[index - 1]
                pieces.append((f"jump-{role}", frame_image(arr, labels, box, lid)))
            continue
        for i, (box, lid) in enumerate(row, start=1):
            pieces.append((name.format(i=i), frame_image(arr, labels, box, lid)))

    # Solo se borra lo viejo cuando el recorte nuevo ya esta entero en
    # memoria: si algo falla, el juego se queda con el arte que tenia.
    out_dir = os.path.join(DST, "characters", "heroine", skin)
    shutil.rmtree(out_dir, ignore_errors=True)

    for pose, piece in pieces:
        save(scaled(piece, k), f"characters/heroine/{skin}/{pose}", added)

    # El idle NO pasa por `scaled(piece, k)`: `cut_idle` ya lo entrega a
    # HERO_H con su PROPIO factor (ver alli el porque). Escalarlo aqui
    # otra vez con el `k` de esta lamina lo doblaria de tamano.
    for i, frame in enumerate(idle, start=1):
        save(frame, f"characters/heroine/{skin}/idle-{i}", added)

    total = len(pieces) + len(idle)
    print(f"  {skin:7} {total} poses  (factor {k:.3f}, mas alta {tallest}px)")
    return True


def main() -> int:
    added: dict[str, dict] = {}

    hero_ok = True
    print("=== heroinas ===")
    for skin, spec in HERO_SHEET.items():
        hero_ok &= cut_hero(skin, spec, added)

    # Las caras siguen saliendo de las hojas `improved`: las laminas de
    # animacion son de cuerpo entero y no traen ningun retrato.
    portraits(added)

    print("\n=== boss ===")
    base = os.path.join(SRC, "boss")
    for pattern, fname, count in BOSS_SHEETS:
        do_sheet(
            os.path.join(base, f"{fname}.png"), pattern, count, BOSS_H, "boss", added
        )

    existing: dict[str, dict] = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            existing = json.load(f).get("assets", {})

    # Las poses viejas se van del manifiesto, no solo del disco: las
    # hojas anteriores dejaban claves (`jump-1..4`, `air-*`) que ya no
    # existen, y una escena que las pida se queda sin textura.
    if hero_ok:
        existing = {
            k: v for k, v in existing.items() if not k.startswith("characters/heroine/")
        }

    existing.update(added)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"assets": existing}, f, indent=2, ensure_ascii=False)

    print(f"\nlisto: {len(added)} piezas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
