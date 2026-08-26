/**
 * Todo el texto del juego.
 *
 * Centralizado a proposito: el tono es la mitad de la broma y tenerlo
 * disperso entre escenas hace imposible revisarlo de una pasada.
 */

export const BOOK = {
  page1: "La verdad, necesito tu ayuda con algo.",
  page2: "Pero primero me gustaría que vieras esto.",
  hint: "Clic para pasar la página",
} as const;

export const SELECT = {
  title: "SELECCIONA TU PERSONAJE",
  names: { blonde: "RUBIA", red: "PELIRROJA" },
  confirm: "¿Segura?",
  yes: "SÍ",
  change: "CAMBIAR",
} as const;

/**
 * Como se llama el guia. Cambia esta linea y cambia en todo el juego.
 */
export const GUIDE_NAME = "Itward";

/**
 * Tutorial.
 *
 * Va al grano a proposito. La version larga explicaba cada cosa con
 * tres frases y el juego entero dura cinco minutos: el tutorial se
 * comia el principio y la gracia no esta aqui, esta al final.
 *
 * Se queda lo que hay que saber para jugar y una linea de broma por
 * mecanica. Todo lo demas se corto.
 */
export const TUTORIAL = {
  greet: "Hola, me llamo " + GUIDE_NAME + ".",
  name: "",
  nameAside: "",
  rules: "",
  move: "Muévete con WASD.",
  jump: "Espacio para saltar.",

  gunIntro: "Coge la pistola Monster.",
  gunName: "Esa es la pistola Monster. En esta actualización, munición infinita.",
  shootBlocks: "Los bloques agrietados también se rompen a tiros. Ahí dentro hay llaves.",
  gunHowTo: "RATÓN apuntar · CLIC disparar",

  enemyWarn: "Vaya. Hablando de eso…",
  enemyName: "Un aldeano. No es de los amables.",
  enemyShoot: "Apunta y dispara.",
  enemyDown: "Perfecto.",
  enemyDrops: "Y mira lo que suelta.",

  creeperWarn: "Ese de ahí explota si te acercas.",
  creeperName: "Dispárale de lejos.",
  creeperShoot: "",

  cakeIntro: "",
  cakeName: "Torta de chocolate.",
  cakeRule: "Cinco porciones. Cinco vidas.",

  dogIntro: "Ah, sí. Snoopy.",
  dogJob: "",
  coffeeTitle: "CAFFEINE BOOST",
  coffeeFast: "Café: disparas más rápido y saltas más alto.",
  coffeeHigh: "",
  coffeeWarn: "Solo uno a la vez.",

  catIntro: "",
  catName: "Luna te acompaña.",
  catKnows: "",

  keyDoor: "Eso abre la puerta.",
  keyGot: "LLAVE DE BOTÓN",
  interact: "E para abrir",
} as const;

export const PRO_PLAYER = {
  before: "Antes de que me ayudes con el problema real…",
  check: "Necesito comprobar una cosa.",
  question: "¿ERES REALMENTE PRO PLAYER?",
  subtitle: "CERTIFICACIÓN MINERA — EXAMEN PRÁCTICO",
} as const;

export const FOREST = {
  objective: "Baja a por la llave",
  hintTitle: "LA LLAVE ABAJO · LA PUERTA AL OTRO LADO",
  hintSub: "Baja a por ella y sube por la derecha",
  doorUp: "LA PUERTA ESTÁ ARRIBA",
  doorUpSub: "Al otro lado, subiendo por la derecha",
  keyGot: "LLAVE DE BOTÓN CONSEGUIDA",
  back: "Vuelve a la puerta",
  intro: [
    "Bienvenida al bosque.",
    "Baja hasta el fondo. Ahí abajo hay una llave.",
    "Y la puerta está al otro lado, arriba del todo.",
    "Ah, y una cosa más.",
    "Cuidado con las cebollas.",
    "Sí. Cebollas. Cruzan volando. No preguntes.",
    "Luna se encarga de los aldeanos. Yo me voy.",
  ],
  keyTaken: [
    "Ahí está.",
    "Ahora sube por la derecha. La puerta está arriba.",
  ],
  doorLocked: "Necesitas la llave",
  doorOpen: "E para abrir",
} as const;

export const TUNNEL_TXT = {
  guide1: "Perfecto.",
  guide2: "Según mi horario criminal…",
  guide3: "…ahora toca atravesar un túnel que definitivamente no está vivo.",
  guide4: "Probablemente.",
} as const;

export const BOSS_TXT = {
  name: "LA OTRA MADRE",
  lunaLeaves: "Luna no puede acompañarte aquí.",
  beatHer: "Ahora derrótala para pasar la misión.",
  onionWarn1: "Cuidado.",
  onionWarn2: "Esquiva a tu peor enemigo.",
  onionWarn3: "La cebolla.",
  finalKey: "LLAVE FINAL",
  won1: "Bien.",
  won2: "Ganaste.",
  won3: "Sinceramente, no esperaba que lo consiguieras.",
} as const;

export const PRO_HELP = {
  lines: [
    "Bien.",
    "Ya eres oficialmente pro player.",
    "Ahora que eres pro…",
    "…necesito ayuda.",
  ],
} as const;

export const TRUE_MISSION = {
  title: "VERDADERA MISIÓN",
  question: "¿Me ayudarías a encontrar diamantes en Minecraft?",
  hint: "Camina hasta una puerta",
  yes: "SÍ",
  no: "NO",

  blockHey: "Ey, ey, ey.",
  blockFirst: "Antes de entrar ahí…",
  blockKnow: "…fíjate qué pasaría si dices que no.",

  laugh: "JAJAJAJAJA.",
  unavailable: "Parece que esa opción no está disponible.",
  tough: "Ni modo.",
  shame: "Qué pena.",

  accepted: "Ahh.",
  cool: "Chévere.",
} as const;

export const SCHEDULE = {
  title: "Selecciona un día",
  timeTitle: "Horas disponibles",
  pickDayFirst: "Elige primero un día del calendario",
  scroll: "rueda para ver más",
  confirm: "CONFIRMAR EXPEDICIÓN",
  back: "CAMBIAR",
  sending: "ENVIANDO…",
} as const;

/**
 * El resguardo final, reducido a lo que de verdad importa.
 *
 * Antes llevaba encima nueve textos — titular, numero de expediente, tres
 * lineas de datos, a nombre de quien, dos avisos, una firma, un sello y
 * un agradecimiento — y el hueco claro del papel no da para tanto: todo
 * salia diminuto y encima se pisaba. Ahora son cuatro cosas y se leen.
 */
export const TICKET = {
  confirmed: "LISTO",
  date: (d: string) => `Fecha: ${d}`,
  time: (t: string) => `Hora: ${t}`,
  plan: (p: string) => `Actividad: ${p}`,
  forWho: (n: string) => `Nombre: ${n}`,
  contact: "Se pondrán en contacto con usted ese día.",
} as const;

export const NAME_SCREEN = {
  hint: "ESCRIBE Y PULSA ENTER",
  notForYou: "ups, este juego no es para ti",
} as const;

/**
 * La eleccion final, ya fuera del juego.
 *
 * El NO hay que probarlo antes de poder decir que si. La primera vez
 * contesta con una escenita y le tira una cebolla; a partir de ahi el
 * boton se aparta solo cuando intenta pulsarlo.
 */
export const CHOICE = {
  /** Empujon, una sola vez, si elige sin haber probado el NO. */
  mustTryNo: "Ah... pero fíjate qué hubiera pasado si le dabas al no.",
  /** La escenita del NO. Pasa una vez y nunca mas. */
  noLines: ["Ah... no se puede.", "Ni modo...", "Qué pena...", "Ten una cebolla."],
  foodTitle: "¿Y de comer?",
} as const;

export const MOBILE = {
  title: "ESTA AVENTURA NECESITA TECLADO Y MOUSE",
  body: "Para una mejor experiencia, ábrela desde una computadora.",
} as const;

export const HUD_TXT = {
  cake: "TORTA",
  key: "LLAVE",
  coffee: "CAFÉ",
} as const;
