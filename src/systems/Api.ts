import { getState } from "@/systems/GameState";
import type {
  ApiResponse,
  BookingRequest,
  GameOpenRequest,
} from "@shared/contracts";
import { slotIsAllowed } from "@shared/contracts";

/**
 * Cliente de las funciones serverless.
 *
 * Nada de lo que hay aqui puede romper el juego: si no hay red, si no
 * hay endpoint o si el servidor tarda, se devuelve un resultado neutro y
 * la partida sigue. Un problema de infraestructura no puede costarle la
 * experiencia a quien esta jugando.
 */

// Antes en 6000: si no hay servidor a mano (o esta lento), el clic de
// "confirmar hora" se quedaba mirando "Enviando..." hasta seis segundos
// antes de rendirse y seguir igual. Como un fallo de red ya devuelve un
// resultado neutro y la partida sigue sin enterarse, no hace falta
// esperar tanto para llegar al mismo sitio.
const TIMEOUT_MS = 2000;

async function post<T>(url: string, payload: T): Promise<ApiResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: true, delivery: "logged" };
    return (await res.json()) as ApiResponse;
  } catch {
    return { ok: true, delivery: "logged" };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Aviso de que alguien abrio el juego. Una vez por sesion. */
export async function reportOpen(): Promise<ApiResponse> {
  const payload: GameOpenRequest = {
    sessionId: getState().sessionId,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: matchMedia("(pointer:coarse)").matches ? "mobile" : "desktop",
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screen: { w: screen.width, h: screen.height },
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return post("/api/game-open", payload);
}

/** Confirmacion de la expedicion. */
export async function confirmBooking(date: string, time: string): Promise<ApiResponse> {
  const hero = getState().selectedHero ?? "blue";
  if (!slotIsAllowed(date, time)) {
    return { ok: false, delivery: "failed", message: "Franja no disponible" };
  }
  const payload: BookingRequest = {
    date,
    time,
    hero,
    sessionId: getState().sessionId,
  };
  return post("/api/booking", payload);
}
