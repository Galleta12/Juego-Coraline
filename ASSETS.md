# Manifiesto de assets

Dónde va cada archivo y cómo se llama. Los prompts para generarlos están
en el **[Cuaderno de assets](https://claude.ai/code/artifact/812023dc-649d-442a-b591-15d602dfe3c1)**.

**Nada es obligatorio.** El cargador usa el arte generado por código como
respaldo para todo lo que no encuentre, así que puedes ir soltando piezas
de una en una y verlas aparecer. El juego nunca se rompe por un archivo
que falte.

---

## Reglas

| | |
| --- | --- |
| **Formato** | PNG con transparencia real (magenta ya recortado) |
| **Tamaño** | Guárdalo grande. El juego escala solo; reducir a mano pierde definición |
| **Personajes** | Lienzo cuadrado, pies tocando el borde inferior, misma escala entre poses |
| **Fondos** | Apaisados, repetibles en horizontal |
| **Nombres** | Exactos, en minúscula, con guiones. El cargador los busca literalmente |

> **Un PNG por pose, no hojas de sprites.** Es deliberado: calcular frames
> de una hoja recortada a mano es frágil y falla en silencio. Un archivo
> por pose no tiene esa clase de error.

---

## `characters/`

Tres colores de pelo. Genera uno y cambia el tono en Photopea — no
generes tres personajes distintos.

| Archivo | Qué es | Paso |
| --- | --- | --- |
**Estados vs ciclos.** Un *estado* es una pose fija que el juego muestra
tal cual (quieta, saltando). Un *ciclo* son fotogramas que se alternan
para dar movimiento (correr, caminar). Los ciclos llevan sufijo numérico
y todos sus fotogramas deben tener el cuerpo del mismo tamaño.

| Archivo | Qué es | Paso |
| --- | --- | --- |
| `heroine-blue-idle.png` | Quieta, brazos relajados | 2 |
| `heroine-blue-jump.png` | Subiendo, rodillas recogidas | 2 |
| `heroine-blue-fall.png` | Cayendo, piernas buscando suelo | 2 |
| `heroine-blue-run-1.png` | Ciclo: contacto, pierna derecha | 2 |
| `heroine-blue-run-2.png` | Ciclo: paso, cuerpo en lo alto | 2 |
| `heroine-blue-run-3.png` | Ciclo: contacto, pierna izquierda | 2 |
| `heroine-blue-pickaxe.png` | Golpe de pico | 3 |
| `heroine-blue-shoot.png` | Disparando | 3 |
| `heroine-blonde-*.png` | Las mismas ocho, pelo rubio | 2–3 |
| `heroine-red-*.png` | Las mismas ocho, pelo pelirrojo | 2–3 |
| `cat-idle.png` | Sentado, observando | 4 |
| `cat-alert.png` | Erizado, avisando | 4 |
| `cat-attack.png` | Zarpazo, garras fuera | 4 |
| `cat-walk-1/2/3.png` | Ciclo de caminar | 4 |
| `cat-jump.png` | Saltando, cuerpo estirado | 4 |
| `cat-fall.png` | Cayendo, patas recogidas | 4 |
| `ally-idle.png` | El refuerzo, arma baja | 7 |
| `ally-shoot.png` | El refuerzo, disparando | 7 |
| `guide-idle.png` | El guía alto, en reposo | 14 |
| `guide-point.png` | El guía explicando | 14 |
| `dog-appear.png` | El perro entrando con la taza | 15 |
| `dog-offer.png` | Ofreciendo el café | 15 |
| `dog-dance.png` | Celebrando | 15 |

## `enemies/`

| Archivo | Qué es | Paso |
| --- | --- | --- |
| `bomber-idle.png` | Criatura verde, en reposo | 5 |
| `bomber-charge.png` | Hinchada, a punto de estallar | 5 |
| `villager-idle.png` | Aldeano infectado, encorvado | 6 |
| `villager-lunge.png` | Abalanzándose | 6 |
| `villager-walk-1/2/3.png` | Ciclo de arrastre | 6 |
| `bomber-altered-idle.png` | Corrompido tras la pastilla | 18 |
| `bomber-altered-charge.png` | Corrompido, a punto de estallar | 18 |
| `villager-altered-idle.png` | Corrompido, botón por ojo | 18 |
| `villager-altered-lunge.png` | Corrompido, abalanzándose | 18 |

## `boss/`

Lienzo **vertical**, no cuadrado. Es alta y estrecha.

| Archivo | Qué es | Paso |
| --- | --- | --- |
| `mother-idle.png` | En reposo, patas plegadas | 8 |
| `mother-attack.png` | Erguida, atacando | 9 |

## `items/`

Salen todos de una sola rejilla (paso 10). Recórtalos con el mismo alto
de lienzo entre sí.

| Archivo | Qué es |
| --- | --- |
| `cake.png` | Torta de chocolate — cura |
| `coffee.png` | Café — velocidad temporal |
| `pill.png` | Pastilla — cambia la realidad |
| `pickaxe.png` | Pico — recogible |
| `key.png` | Llave con ojo de botón |
| `door.png` | Puerta cerrada |
| `tulip-pink.png` | Tulipán rosa — celebración final |
| `tulip-yellow.png` | Tulipán amarillo — celebración final |
| `icecream.png` | Helado de cucurucho |
| `petals.png` | Pétalos y confeti cayendo |

## `backgrounds/` — el parallax

**Estas tres capas por escenario SON el parallax.** No hay un archivo
"fondo" aparte: el efecto de profundidad se consigue moviendo cada capa
a distinta velocidad cuando la cámara avanza.

Si generas el escenario como una sola imagen, todo se mueve igual y el
efecto no existe. Tienen que ir separadas.

Son 12 archivos: tres capas × tres escenarios, más las tres del bosque
corrompido.

| Archivo | Capa | Velocidad de parallax |
| --- | --- | --- |
| `forest-far.png` | Luna, niebla | muy lenta |
| `forest-mid.png` | Árboles, **el ciervo** | media |
| `forest-near.png` | Maleza (solo tercio inferior) | rápida |
| `forest-altered-far.png` | La luna convertida en ojo | muy lenta |
| `forest-altered-mid.png` | Árboles con botones cosidos | media |
| `forest-altered-near.png` | Raíces vueltas hilo y tela | rápida |
| `tunnel-far.png` | Punto de fuga | muy lenta |
| `tunnel-mid.png` | Paredes de tela, botones | media |
| `tunnel-near.png` | Pliegues enmarcando | rápida |
| `lair-far.png` | Sala vacía, ventana | muy lenta |
| `lair-mid.png` | Telarañas de hilo | media |
| `lair-near.png` | Hebras en las esquinas | rápida |

> Las capas media y cercana necesitan **transparencia**: se ven encima de
> la lejana. Si las guardas con fondo opaco, tapan todo lo de detrás.

## `audio/` (opcional)

Si dejas un archivo, sustituye a la pieza sintetizada. Acepta `.mp3`,
`.ogg` o `.wav`.

`intro` · `forest` · `altered` · `tunnel` · `boss` · `outro`

---

## Progreso

- [ ] Paso 1 — hoja de referencia de la protagonista
- [ ] Pasos 2–3 — poses de la protagonista
- [ ] Recolor a pelirroja y azul
- [ ] Paso 4 — el gato
- [ ] Pasos 5–6 — enemigos
- [ ] Paso 7 — el refuerzo
- [ ] Pasos 8–9 — la villana
- [ ] Paso 10 — objetos
- [ ] Pasos 11–13 — los nueve fondos
- [ ] Paso 14 — el guía
- [ ] Paso 15 — el perro del café
- [ ] Paso 16 — tulipanes y helado
- [ ] Paso 17 — el bosque corrompido
- [ ] Paso 18 — enemigos corrompidos
