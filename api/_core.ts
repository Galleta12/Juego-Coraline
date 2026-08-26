import {
  validateBooking,
  validateOpen,
  validateProgress,
  type ApiResponse,
  type BookingRequest,
  type GameOpenRequest,
  type ProgressEvent,
  type ProgressRequest,
} from "../shared/contracts.js";

/**
 * Logica compartida por las dos funciones serverless.
 *
 * Vercel ignora los archivos que empiezan por "_" al generar rutas, asi
 * que este modulo no se expone como endpoint.
 *
 * Regla que atraviesa todo el archivo: si el correo falla, se registra y
 * se responde ok igual. Un problema de infraestructura no puede costarle
 * la partida a quien esta jugando.
 */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

function json(body: ApiResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function humanDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parsed);
}

const SHELL = (title: string, rows: string, footer: string): string => `<!doctype html>
<div style="background:#08060e;color:#e6dccb;font-family:Georgia,serif;padding:32px">
  <p style="letter-spacing:.3em;font-size:11px;color:#7c4a86;margin:0 0 16px">AUTORIDAD MINERA</p>
  <h1 style="font-size:20px;letter-spacing:.06em;margin:0 0 20px;color:#4ee0d8">${title}</h1>
  ${rows}
  <p style="font-size:12px;color:#8d8497;margin:22px 0 0">${footer}</p>
</div>`;

const row = (k: string, v: string): string =>
  `<p style="margin:0 0 6px"><span style="color:#8d8497">${k}:</span> <strong>${v}</strong></p>`;

/* ── Envio ─────────────────────────────────────────────────────────── */

async function sendMail(subject: string, html: string): Promise<"sent" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_EMAIL;
  const from = process.env.EXPEDITION_FROM_EMAIL ?? "onboarding@resend.dev";
  if (!key || !to) return "failed";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error("resend fallo", res.status, await res.text().catch(() => ""));
    return "failed";
  }
  return "sent";
}

/**
 * Envia si hay proveedor configurado; si no, lo deja en los logs. En los
 * dos casos la respuesta es ok: el cliente no debe notar la diferencia.
 */
async function deliver(subject: string, html: string, logPayload: unknown): Promise<Response> {
  if (process.env.MAIL_PROVIDER?.toLowerCase() !== "resend") {
    console.log("[sin proveedor de correo]", subject, JSON.stringify(logPayload));
    return json({ ok: true, delivery: "logged" });
  }
  try {
    const result = await sendMail(subject, html);
    if (result === "sent") return json({ ok: true, delivery: "sent" });
    console.log("[envio fallido, queda en logs]", subject, JSON.stringify(logPayload));
    return json({ ok: true, delivery: "logged" });
  } catch (err) {
    console.error("error enviando", err);
    console.log("[excepcion, queda en logs]", subject, JSON.stringify(logPayload));
    return json({ ok: true, delivery: "logged" });
  }
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function preflight(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return json({ ok: false, delivery: "failed", message: "Usa POST" }, 405);
  }
  return null;
}

/* ── Apertura del juego ────────────────────────────────────────────── */

export async function handleGameOpen(request: Request): Promise<Response> {
  const early = preflight(request);
  if (early) return early;

  const body = await readJson(request);
  if (!validateOpen(body)) {
    return json({ ok: false, delivery: "failed", message: "Datos invalidos" }, 400);
  }
  const v = body as GameOpenRequest;

  // La IP no se guarda por defecto. Solo se toca si CAPTURE_IP lo pide, y
  // aun entonces se trunca: basta para saber de donde viene, no para
  // identificar a nadie.
  let origin = "no registrada";
  if (process.env.CAPTURE_IP === "true") {
    const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (raw.includes(".")) origin = `${raw.split(".").slice(0, 2).join(".")}.x.x`;
    else if (raw.includes(":")) origin = `${raw.split(":").slice(0, 3).join(":")}::x`;
  }

  // Entrar a jugar y quedarse en la puerta no es lo mismo, y el correo
  // tiene que distinguirlo desde el asunto: si llego desde el movil, no
  // vio el juego siquiera.
  const html = SHELL(
    v.blocked ? "ENTRÓ DESDE EL MÓVIL (NO PUDO JUGAR)" : "ALGUIEN ABRIÓ EL JUEGO",
    [
      row("Su hora", esc(v.localTime ?? new Date(v.timestamp).toLocaleString("es-ES"))),
      row("Dispositivo", esc(v.platform)),
      row("Ventana", `${v.viewport.w}×${v.viewport.h}`),
      row("Pantalla", `${v.screen.w}×${v.screen.h}`),
      row("Idioma", esc(v.language)),
      row("Zona horaria", esc(v.timezone)),
      row("Navegador", esc(v.userAgent.slice(0, 180))),
      row("Sesión", esc(v.sessionId)),
      row("Origen", esc(origin)),
    ].join(""),
    v.blocked
      ? "Abrió el link en un teléfono, así que le salió el aviso de que se juega en PC."
      : "Aviso automático de apertura. Se envía una vez por sesión.",
  );

  return deliver(
    v.blocked ? "Alguien abrió el juego desde el móvil" : "Alguien abrió el juego",
    html,
    { ...v, origin },
  );
}

/* ── Progreso ──────────────────────────────────────────────────────── */

/**
 * Como se lee cada hito en el asunto y el titular del correo.
 *
 * Un texto por evento en vez de armarlo con condicionales: son seis y no
 * van a crecer, y asi el correo que llega al movil se entiende de un
 * vistazo sin abrirlo.
 */
const PROGRESS_COPY: Record<ProgressEvent, { subject: string; title: string }> = {
  name: { subject: "escribió su nombre", title: "ENTRÓ Y PUSO SU NOMBRE" },
  tutorial: { subject: "pasó el tutorial", title: "PASÓ EL TUTORIAL" },
  forest: { subject: "pasó el nivel 1", title: "PASÓ EL NIVEL 1 (EL BOSQUE)" },
  tunnel: { subject: "pasó la cueva", title: "PASÓ EL NIVEL DE LA CUEVA" },
  boss: { subject: "venció a la jefa", title: "VENCIÓ A LA OTRA MADRE" },
  choice: { subject: "está en la elección", title: "SE ENCUENTRA EN LA ELECCIÓN" },
};

export async function handleProgress(request: Request): Promise<Response> {
  const early = preflight(request);
  if (early) return early;

  const body = await readJson(request);
  if (!validateProgress(body)) {
    return json({ ok: false, delivery: "failed", message: "Datos invalidos" }, 400);
  }
  const v = body as ProgressRequest;
  const copy = PROGRESS_COPY[v.event];
  const who = v.playerName?.trim() ? v.playerName.trim() : "Sin nombre todavía";

  const html = SHELL(
    copy.title,
    [
      row("Quién", esc(who)),
      row("Su hora", esc(v.localTime || new Date(v.timestamp).toLocaleString("es-ES"))),
      row("Zona horaria", esc(v.timezone ?? "—")),
      row("Dispositivo", esc(v.platform ?? "—")),
      row("Navegador", esc((v.userAgent ?? "").slice(0, 180))),
      row("Sesión", esc(v.sessionId)),
    ].join(""),
    "Aviso automático de progreso.",
  );

  return deliver(`${who} ${copy.subject}`, html, v);
}

/* ── Reserva ───────────────────────────────────────────────────────── */

export async function handleBooking(request: Request): Promise<Response> {
  const early = preflight(request);
  if (early) return early;

  const body = await readJson(request);
  // La validacion se repite aqui a proposito: el frontend puede mentir,
  // y el calendario permitido es una regla de negocio, no de interfaz.
  if (!validateBooking(body)) {
    return json({ ok: false, delivery: "failed", message: "Franja no disponible" }, 400);
  }
  const v = body as BookingRequest;

  const who = v.playerName?.trim() ? v.playerName.trim() : "Sin nombre";
  const activity = v.activity?.trim() ? v.activity.trim() : "sin especificar";

  const html = SHELL(
    "NUEVA EXPEDICIÓN CONFIRMADA",
    [
      row("Quién", esc(who)),
      row("Qué quiere hacer", esc(activity)),
      row("Fecha", `${esc(v.date)} (${esc(humanDate(v.date))})`),
      row("Hora", esc(v.time)),
      row("Personaje elegido", esc(v.hero)),
      row("Su hora al confirmar", esc(v.localTime ?? "—")),
      row("Zona horaria", esc(v.timezone ?? "—")),
      row("Dispositivo", esc(v.platform ?? "—")),
      row("Navegador", esc((v.userAgent ?? "").slice(0, 180))),
      row("Sesión", esc(v.sessionId)),
    ].join(""),
    "Tasa de supervivencia estimada: 37%.",
  );

  return deliver(
    `${who} agendó: ${activity} — ${v.date} ${v.time}`,
    html,
    v,
  );
}
