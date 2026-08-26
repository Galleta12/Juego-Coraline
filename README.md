# Expedición Diamante

Mini juego web de 3–5 minutos. Una autoridad minera cuestionablemente
profesional recluta a la agente **Vio**, la manda a un bosque oscuro, le
altera la realidad con una pastilla, la hace pelear con la mamá de
Coraline y, cuando por fin encuentra el diamante, admite que ese no era
el objetivo.

Phaser 3 · TypeScript · Vite · Arcade Physics. Sin assets externos: todo
el arte, la fuente y la música se generan por código.

---

## Arrancar

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>. El juego es de teclado; en móvil muestra
una pantalla pidiendo abrirlo en computadora.

| Tecla | Acción |
| --- | --- |
| `A` `D` o `←` `→` | Caminar |
| `Espacio` (o `W` / `↑`) | Saltar — mantener salta más alto |
| `E`, `Enter` o clic | Pico / interactuar |
| `M` | Silenciar |

---

## Estructura

```
src/
  art/          Sprites, tiles y fuente bitmap, todo dibujado en código
    sprites/    Un archivo por familia (jugadora, objetos, enemigos…)
  audio/        Motor de síntesis y las seis atmósferas
  config/       Constantes, paleta y TODOS los textos del juego
  core/         Estado de partida, claves de escena, bus de eventos
  entities/     Jugadora y enemigos
  scenes/       Una escena por sección + HUD y transiciones
  systems/      Entrada, constructor de niveles, cliente del endpoint
  ui/           Texto con la fuente bitmap
shared/         Contrato cliente ↔ servidor (tipos + validación)
api/            Función serverless (Vercel)
netlify/        La misma función para Netlify
dev/            Muestra tipográfica, solo desarrollo
scripts/        QA automatizado
```

**Dónde tocar cada cosa:**

- Textos y nombre de la agente → [`src/config/strings.ts`](src/config/strings.ts)
- Dificultad, velocidad, salto, duración del café → [`src/config/gameConfig.ts`](src/config/gameConfig.ts)
- Colores de las dos realidades → [`src/config/palette.ts`](src/config/palette.ts)
- Mapas de los niveles (dibujos ASCII) → [`src/systems/levels.ts`](src/systems/levels.ts)

---

## Desplegar

Funciona igual en Vercel y en Netlify; los dos archivos de configuración
están incluidos.

### Vercel

```bash
npx vercel
```

La ruta `/api/confirm-expedition` se crea sola desde `api/`.

### Netlify

```bash
npx netlify deploy --prod
```

`netlify.toml` redirige `/api/confirm-expedition` a la función
equivalente, así que el cliente llama a la misma ruta en ambos.

> Arrastrar la carpeta `dist` a Netlify también publica el juego, pero
> **sin** la función: la fecha no llegaría por correo.

---

## Recibir la fecha por correo

Sin configurar nada, el endpoint responde correctamente y deja la
respuesta en los logs. El juego **nunca se rompe** si el correo falla.

Para que llegue el email:

1. Crea una cuenta en [resend.com](https://resend.com) (gratis, 100
   correos/día) y genera una API key.
2. En Vercel (*Settings → Environment Variables*) o Netlify
   (*Site settings → Environment variables*), añade:

| Variable | Valor |
| --- | --- |
| `MAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | tu API key |
| `OWNER_EMAIL` | `svilchez010@gmail.com` |
| `EXPEDITION_FROM_EMAIL` | `onboarding@resend.dev` |

Los nombres tienen que ser exactamente esos: son los que lee
`sendMail` en [`api/_core.ts`](api/_core.ts).

3. Vuelve a desplegar.

Llegan **dos** correos distintos: uno cuando alguien abre el juego
(una vez por sesión) y otro cuando confirma la fecha.

Ver [`.env.example`](.env.example). Para cambiar a Supabase, Discord u
otro destino, solo hay que tocar `sendMail` en
[`api/_core.ts`](api/_core.ts): el resto del flujo no cambia.

---

## Música

Ya está puesta. Cada pista vive en `public/assets/audio/` y se declara en
[`src/config/music.ts`](src/config/music.ts):

| Clave | Archivo | Dónde suena |
| --- | --- | --- |
| `intro` | `intro.mp3` | Cuaderno de apertura y selección de personaje |
| `tutorial` | `tutorial.mp3` | Tutorial |
| `forest` | `bosque.mp3` | El pozo del bosque, también tras la pastilla |
| `tunnel` | `tunel.mp3` | El túnel |
| `boss` | `jefa.mp3` | La pelea contra la Otra Madre |
| `victory` | *(silencio)* | La celebración, a propósito |
| `finale` | `final.mp3` | Del corte con las letras hasta el resguardo |

Dos cosas que importan y no se ven en la tabla:

- **La música solo se corta cuando cambia la clave**, no la escena. Por eso
  la canción del final usa la misma clave en las cuatro pantallas que
  quedan: entra en el corte a las letras y sigue sonando entera.
- **La celebración va en silencio a propósito.** La pista de la jefa se
  apaga, quedan los efectos, y la canción entra de golpe en el corte.
  Ese golpe se pierde si suena algo de fondo mientras tanto.

Cada escena descarga por adelantado la pista de la siguiente, para que
el cambio no llegue tarde.

---

## Arte suelto: el cuaderno y la lata

Las cuatro páginas del cuaderno salen de `libro_intrduction.png` y la
lata grande de `monster.png`. Las corta
[`scripts/process_extras.py`](scripts/process_extras.py). Si cambias esa
imagen, vuelve a ejecutar:

```bash
npm run extras
```

El fondo no se recorta: se difuminan los bordes para que el cuaderno se
funda con el negro de la escena. Intentar recortarlo por relleno vaciaba
las páginas, porque el papel es otro degradado suave.

---

## QA

Dos scripts, ambos contra un Chrome headless del sistema. Necesitan el
servidor de desarrollo corriendo en otra terminal.

```bash
node scripts/playthrough.mjs
```

18 comprobaciones funcionales: caminar, salto corto contra salto
mantenido, pico, bloques, torta, café, pastilla, máquina de escribir,
boss, diamante, creeper, elección, agenda y envío.

```bash
node scripts/qa.mjs qa-shots
```

Captura cada escena a PNG para revisar el arte.

```bash
npm run dev
```

Con el servidor arriba, <http://localhost:5173/dev/specimen.html> muestra
la fuente bitmap ampliada.

Si Chrome no está en la ruta habitual, usa `CHROME_PATH=...`.

---

## Notas de diseño

- **Cero frustración.** No hay pantalla de derrota: al quedarte sin
  torta se repone la vida y reapareces en el último suelo firme.
- **El salto lleva las tres ayudas clásicas**: coyote time, buffer de
  salto y altura variable. Son invisibles y son la diferencia entre un
  salto que engancha y uno que molesta.
- **Todo el arte se genera en memoria.** No hay red que pueda fallar al
  desplegar ni assets que se pierdan.
- **El texto usa una fuente bitmap propia de 5×10**, con acentos y signos
  de apertura españoles, porque una fuente del navegador sale suavizada y
  pelea con el pixel art.
