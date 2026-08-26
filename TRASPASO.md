# Expedición Diamante — contexto y trabajo pendiente

Pega esto entero al empezar el chat nuevo.

---

## Qué es esto

`C:\Users\Usuario\Desktop\juegoangies` — **"La búsqueda de diamantes"**, un
mini juego web hecho con **Phaser 3 + TypeScript + Vite**, física Arcade,
960×540 lógicos, solo escritorio, para desplegar en Vercel.

**Su único propósito** es terminar preguntándole a **Vio** (mi ex) si quiere
jugar Minecraft conmigo. Es una invitación, no un juego serio.

### Reglas de tono que no se negocian

- **No puede sentirse como una confesión amorosa.** La reacción que busco es
  *"JAJAJA no puedo creer que hizo un juego para preguntarme esto"*. Ningún
  texto romántico, sobre todo al final.
- **Dificultad casi nula, cero frustración.** Es un vehículo para una
  pregunta, no un reto. Morir en el nivel 1 es un fallo de diseño.
- **Las referencias que a ella le gustan tienen que notarse** y son la parte
  que no se recorta: helado celeste, tulipanes morados y el ramo, Luna (la
  gata), la torta de chocolate, la pistola Monster, Snoopy y el café.
- **Estética**: Coraline + Fran Bow + Resident Evil 4 + Minecraft. Cel
  shaded, contornos gruesos, nada fotorrealista.
- Duración objetivo: **5–7 minutos**.

### Cómo trabajo

- Pregunta antes de asumir. Si algo es ambiguo, pregúntamelo.
- **Usa las skills y los MCP que tengas disponibles.** Tengo instaladas
  skills de desarrollo de juegos 2D (`2d-games`, `phaser-gamedev`,
  `game-art`, `game-design`, `playwright-testing`) y servidores MCP —
  Playwright y Photopea entre ellos. Úsalos cuando encajen con lo que
  estés haciendo en vez de ir a mano.
- **No uses el bot de QA a cada rato: tarda muchísimo.** Úsalo solo cuando
  sea imprescindible para verificar algo que no puedas ver de otra forma.
  Cuando acabes, dime qué debo probar y lo pruebo yo.
- Para mirar una escena rápido sin pagar una suite entera:
  `npm run shots -- <Escena> <segundos> <nombre>`
  (ej. `npm run shots -- TunnelScene 3,7 tunel`).
- **No edites `src/` mientras corre un script de QA**: recarga el servidor
  en caliente y el test falla por eso, no por el juego.

---

## Estado actual

### Escenas ya montadas

`BootScene → StorybookScene → CharacterSelectScene → TutorialScene →
ProPlayerTransitionScene → ForestLevelScene → TunnelScene → BossScene →
ProHelpScene → TrueMissionScene → ScheduleScene → TicketScene`, más
`HudScene` en paralelo.

- **StorybookScene**: el cuaderno de 4 páginas (arte de `libro_intrduction.png`).
  **Esta me gusta, no la toques.**
- **ForestLevelScene**: nivel en V, 3072×992 px. Baja por la izquierda en
  repisas dispersas, la llave abajo, sube por un rincón contra el muro
  derecho hasta la puerta. Cebollas cruzando como peligro.
- **TunnelScene**: pasillo liso de 6720 px, sin bloques, Luna sí, Itward no.
- **BossScene**: la Otra Madre con cebollas devolvibles + tótem de Leon.
- **TrueMissionScene**: sala de dos puertas SÍ/NO donde se responde caminando.
- **ScheduleScene**: calendario estilo tablero de trapo.

### Comandos

```
npm run dev          # servidor en localhost:5173
npm run build        # typecheck + build
npm run assets       # reprocesa TODO el arte
npm run extras       # solo cuaderno, lata Monster y cebolla
npm run shots        # capturas rápidas de una escena
npm run qa:all       # las cuatro suites (lento)
```

### Música (ya puesta)

En `public/assets/audio/`, declarada en `src/config/music.ts`:

| Clave | Archivo | Dónde |
| --- | --- | --- |
| `intro` | intro.mp3 | Cuaderno y selección |
| `tutorial` | tutorial.mp3 | Tutorial |
| `forest` | bosque.mp3 | Bosque |
| `tunnel` | tunel.mp3 | Túnel |
| `boss` | jefa.mp3 | Pelea |
| `victory` | *(silencio a propósito)* | Celebración |
| `finale` | final.mp3 (Fuerza Regida) | Del corte con las letras al final |

**La música solo se corta cuando cambia la CLAVE, no la escena.** Por eso
la canción del final usa la misma clave en las pantallas finales y suena
entera sin reiniciarse.

### Cosas que cuestan tiempo redescubrir

- El pack de arte mezcla estilos: las heroínas y Snoopy son cel-shaded, el
  gato/aldeano/Leon/pistola son casi fotorrealistas. Se unifican con
  estilizado por código + gradación de color por escena.
- **Revisa el arte procesado, no solo el código.** Varias veces el fallo
  estaba en el pipeline: el croma por tono se comía los morados legítimos,
  algunas poses vienen dibujadas a otra escala, los retratos hay que
  encuadrarlos sobre la cara.
- El correo se configura con **`OWNER_EMAIL`** (no `EXPEDITION_TO_EMAIL`).
- Los `.mp3` son de varios MB: el QA debe cargar con
  `waitUntil: "domcontentloaded"`, no `networkidle2`.

---

## PENDIENTE — trabajo a medias

### 1. Tiles nuevos (a medio integrar)

Hay dos hojas, `tiles1.png` y `tiles2.png`, con terreno y adornos sobre
fondo transparente. Ya escribí `scripts/process_tiles.py` que las separa
por componentes conexas y saca:

- Terreno para `forest`, `tunnel`, `lair` (ground-top, ground-fill, stone,
  breakable, platform)
- 23 adornos en `props/`: árbol con farol, pozo, poste indicador, puerta,
  barril, caja, columpio, escalera, tocón, valla, farola, farol colgante,
  rocas, vagoneta, **gato negro**, cascada, setas, cristales, coral,
  planta luminosa, roca colgante, lianas.

**Falta:**
- `npm run assets` sigue llamando a `generate_tiles.py` (el generador viejo
  y feo) **después**, así que pisa los tiles buenos. Hay que quitar
  `generate_tiles.py` de la cadena y meter `process_tiles.py`.
- Los adornos no se usan todavía en ninguna escena. Hay que **colocarlos**
  por el bosque, el tutorial y la cueva (árboles, gato, farolas, setas…).
- Algunos recortes de cueva quedaron regulares; revisar visualmente.

### 2. Partículas de café

Hay `particulas-cafe.png` (gotas y granos de café). Falta:
- Extraerlo a sprites sueltos.
- Usarlo como **aura permanente sobre el personaje mientras el café está
  activo**, no solo un chispazo al recogerlo.
- **Solo se puede tener un café a la vez.** Si ya hay boost activo y coges
  otra taza, esa taza no vale — hay que esperar a que se acabe.

### 3. Arreglos sueltos que quedaron sin hacer

- **Luna sigue flotando**, no toca el suelo. (Ya lo intenté una vez ajustando
  el cuerpo; sigue mal. Hay que medirlo de verdad.)
- **Tutorial: el aldeano aparece muy cerca** → más lejos, y que camine **más
  lento**.
- **Nivel 1: algunas cebollas (no todas) deben teledirigirse hacia mí**, para
  tener que destruirlas.
- **La animación de caminar no me gusta** → mejorarla, añadir frames.
- **El texto de Itward en la intro del nivel 1 debe ir sincronizado** con lo
  que pasa en la cámara.
- **En el tutorial hay un bloque demasiado alto para saltar** → bajarlo.
- **La cueva (túnel)**: que en algún punto **descienda**, no sea todo plano.

---

## PENDIENTE — cambios grandes nuevos

### 4. Primera escena: escribir el nombre

`backgorund_primera_escena_ticket_despeus_eleccion.png` **contiene dos
imágenes que hay que separar**:
- Izquierda: fondo "PON TU NOMBRE PARA EMPEZAR" con un campo de texto.
- Derecha: el **ticket** en blanco (para la escena final).

La escena de nombre va **antes de todo**. Solo se aceptan tres nombres,
sin importar mayúsculas: **Angie, Vio, Violeta**. Cualquier otra cosa
muestra: *"ups, este juego no es para ti"*.

### 5. Tutorial más corto

- Menos texto del esqueleto. Ahora dice cosas innecesarias.
- Al principio solo: **"Hola, me llamo Itward"** (ojo: el guía ahora se
  llama **Itward**, no Mortimer — hay que cambiarlo en
  `src/config/strings.ts`, constante `GUIDE_NAME`).
- Ir al grano: *"coge la pistola Monster, en esta actualización tienes
  munición infinita"*, y ya.

### 6. Transiciones animadas entre escenas

Hay cuatro PNG:
- `transicion_despues_tutorial.png`
- `trastion_despues_nivel1.png`
- `transicion_despues_cave.png`
- `transicion_despues_boss.png`

Se usan como cartas de transición al terminar cada tramo. **Cada una tiene
que durar más de un segundo**, lo suficiente para que se lean las
referencias.

### 7. Nivel final contra la jefa — rehacer

- **Cámara más alejada** al empezar.
- **La madre ahora VUELA.** Dos ataques: se lanza contra ti, y te tira
  cebollas.
- **Itward solo sale al principio**, con todo bloqueado (ni ella ni tú os
  movéis). Dice: *"ahora derrótala para pasar la misión"*.
- **Luna se va**, e Itward dice: *"lamentablemente Luna no te puede
  acompañar en esta parte"*.
- **Más vida**, que no muera tan rápido.
- Sprite sheet nuevo: **`boss_improved.png`**. Hay que entenderlo bien y
  montar las animaciones correctamente.

### 8. Después de vencerla

- Me gusta la lluvia de tortas/tulipanes/helado que ya cae. Se queda.
- Después entra `transicion_despues_boss.png` y **arranca la canción de
  Fuerza Regida**.
- Pasan **los 4 backgrounds de transición**, cada uno más de un segundo.

### 9. Escena final — ya no es el juego, son los backgrounds

`background_elecion.png`: tres paneles — **¿QUIERES ENCONTRAR DIAMANTES?**,
**¿VER UNA PELÍCULA?** y **NO.** Se elige con clic normal.

- **Si intenta darle a cualquiera de las dos opciones buenas antes de haber
  probado el NO**, no le deja, y sale literalmente:
  *"Ah... primero fíjate qué pasaría si dices que no."*
- **La primera vez que intenta darle al NO**: sale un texto grande que cubre
  la pantalla, animado línea a línea con tiempo de sobra para leer:
  - *"Ah..."*
  - *"Ni modo, no se puede."*
  - *"Qué pena."*
  - *"Una cebolla para ti."*
  y después **una cebolla sale volando hacia la pantalla**. Esto solo pasa
  la primera vez.
- **Después de eso, el NO simplemente se aleja** cuando intenta pulsarlo.
- Cuando dice que **SÍ**, pasa a la siguiente imagen: **elegir la comida**.

Ojo: `elecion_comida.png` es idéntico a `background_elecion.png` (mismo
archivo). Hace falta la imagen buena de elección de comida.

- **Dale vida a estos backgrounds**: glows al seleccionar una opción,
  animaciones, partículas.
- Después de elegir comida hay una **transición final**
  (`depeus_de_eligir_comida.png` — "BUENAS ELECCIONES, GERTRUDIS ACEPTA").
- Todo ese rato suena la misma canción de Fuerza Regida, sin cortarse.
- Y **después sale el calendario**.

### 10. Calendario — está buggeado

- Al hacer clic al principio no funciona.
- Las fechas disponibles deben ser **solo a partir del 28 de agosto**.
  (Ahora la ventana está en `shared/contracts.ts`, `WINDOW.firstDate`.)

### 11. Ticket final

Usa la **imagen derecha** de
`backgorund_primera_escena_ticket_despeus_eleccion.png`. Encima va el texto
con lo que eligió: **la actividad, la hora y la comida**.

### 12. Personaje principal nuevo

Hay `improved_caroline_red.png` e `improved_caroline_rubia.png`. Son el
personaje principal a partir de ahora.

- Hay que rehacer las animaciones con ellas y **asegurarse de que todo
  tiene sentido** (caminar, saltar, caer, picar).
- **En la selección de personaje ahora solo se ve el PELO**, no la cara, y
  ahí se elige sí o no.
- Recuerda: la azul ya no existe, solo **rubia y pelirroja**.

---

## Preguntas que tengo pendientes de contestar

1. `elecion_comida.png` es el mismo archivo que `background_elecion.png`.
   ¿Cuál es la imagen buena de elección de comida, y qué opciones de comida
   hay exactamente?
2. Las opciones de comida, ¿son clicables sobre el fondo (hay zonas
   marcadas) o hay que dibujar botones encima?
3. El calendario: ¿del 28 de agosto hasta qué día? ¿Y las horas siguen
   siendo entre semana desde las 14:00, sábado desde las 12:00 y domingo
   desde las 10:00?
4. En el ticket, ¿qué texto exacto quiero que salga además de actividad,
   hora y comida?
