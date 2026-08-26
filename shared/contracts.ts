/**
 * Contrato compartido entre el juego y las funciones serverless.
 *
 * Vive fuera de src/ a proposito: lo importan los dos lados, y asi el
 * compilador avisa si uno cambia y el otro no.
 */

/* ── Apertura del juego ────────────────────────────────────────────── */

export interface GameOpenRequest {
  sessionId: string;
  timestamp: string;
  /** Cadena de navegador, tal cual la reporta el cliente. */
  userAgent: string;
  platform: "desktop" | "mobile";
  viewport: { w: number; h: number };
  screen: { w: number; h: number };
  language: string;
  timezone: string;
}

/* ── Reserva ───────────────────────────────────────────────────────── */

export interface BookingRequest {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm en 24h */
  time: string;
  hero: "blue" | "blonde" | "red";
  sessionId: string;
}

export interface ApiResponse {
  ok: boolean;
  /** "sent" si salio el correo, "logged" si no habia proveedor. */
  delivery: "sent" | "logged" | "failed";
  message?: string;
}

/* ── Validacion ────────────────────────────────────────────────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEROES = new Set(["blue", "blonde", "red"]);

/**
 * Ventana de la expedicion. El backend valida con estas mismas reglas:
 * no basta con que el frontend se porte bien.
 */
export const WINDOW = {
  // Del 28 de agosto hasta el final de la primera semana de
  // septiembre: lo que se pidio. Da diez dias para elegir sin que el
  // calendario se llene de casillas que nadie va a usar.
  firstDate: "2026-08-28",
  lastDate: "2026-09-06",
  /**
   * Primera hora disponible por dia de la semana (0 = domingo).
   *
   * Entre semana desde las 2, el sabado desde las 12 y el domingo todo
   * el dia — entendiendo "todo el dia" como a partir de las 10, que
   * ofrecer las cuatro de la madrugada no le sirve a nadie.
   */
  earliestHour: [10, 14, 14, 14, 14, 14, 12] as const,
  lastHour: 22,
  slotMinutes: 30,
} as const;

export function slotIsAllowed(date: string, time: string): boolean {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return false;
  if (date < WINDOW.firstDate || date > WINDOW.lastDate) return false;

  const when = new Date(`${date}T${time}:00`);
  if (Number.isNaN(when.getTime())) return false;

  const [h, m] = time.split(":").map(Number) as [number, number];
  if (m % WINDOW.slotMinutes !== 0) return false;

  const dow = new Date(`${date}T12:00:00`).getDay();
  const earliest = WINDOW.earliestHour[dow] ?? 14;
  return h >= earliest && h <= WINDOW.lastHour;
}

export function validateBooking(input: unknown): input is BookingRequest {
  if (typeof input !== "object" || input === null) return false;
  const v = input as Record<string, unknown>;
  if (typeof v.date !== "string" || typeof v.time !== "string") return false;
  if (typeof v.hero !== "string" || !HEROES.has(v.hero)) return false;
  if (typeof v.sessionId !== "string" || v.sessionId.length > 128) return false;
  return slotIsAllowed(v.date, v.time);
}

export function validateOpen(input: unknown): input is GameOpenRequest {
  if (typeof input !== "object" || input === null) return false;
  const v = input as Record<string, unknown>;
  return (
    typeof v.sessionId === "string" &&
    v.sessionId.length > 0 &&
    v.sessionId.length <= 128 &&
    typeof v.timestamp === "string"
  );
}
