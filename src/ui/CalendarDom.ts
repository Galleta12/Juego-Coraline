import { audio } from "@/systems/AudioSystem";
import { WINDOW, slotIsAllowed } from "@shared/contracts";

/**
 * El calendario, en HTML de verdad.
 *
 * Es la unica pantalla del juego que NO se dibuja en el lienzo, y es a
 * proposito. Dibujado con Phaser cada casilla era un contenedor con su
 * area de clic puesta a mano, y eso arrastraba una familia entera de
 * problemas que aqui sencillamente no existen:
 *
 *   * clics que no entraban porque la casilla estaba a medio animar,
 *   * casillas agrandadas al pasar por encima que tapaban a la vecina,
 *   * una lista de horas que habia que recortar y desplazar a mano,
 *   * y todo ello repintandose entero en cada fotograma.
 *
 * Un boton del navegador siempre se deja pulsar, se desplaza solo, se
 * adapta al ancho de la ventana y no cuesta nada de dibujar. El juego
 * sigue detras, en pausa visual bajo el velo.
 *
 * Los dias y las horas NO se inventan aqui: salen del mismo contrato que
 * valida el servidor (`slotIsAllowed`), asi que no puede ofrecerse una
 * franja que luego el backend rechace.
 */

const DAY_NAMES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Los dias de la ventana que tienen al menos una franja libre. */
function availableDays(): string[] {
  const out: string[] = [];
  const first = new Date(`${WINDOW.firstDate}T12:00:00`);
  const last = new Date(`${WINDOW.lastDate}T12:00:00`);
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const key = iso(d);
    if (slotsFor(key).length > 0) out.push(key);
  }
  return out;
}

/** Franjas validas de un dia, segun el contrato compartido. */
export function slotsFor(date: string): string[] {
  const out: string[] = [];
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m < 60; m += WINDOW.slotMinutes) {
      const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      if (slotIsAllowed(date, t)) out.push(t);
    }
  }
  return out;
}

/** "sábado 29 de agosto", sin el año: la cita es de esta semana. */
export function prettyDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return `${dias[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export interface CalendarResult {
  date: string;
  time: string;
}

/**
 * Abre el calendario y resuelve cuando confirma fecha y hora.
 *
 * No resuelve hasta que dice que SI en la pregunta de confirmacion: si
 * dice que no, vuelve a elegir y la promesa sigue esperando.
 */
export function openCalendar(): Promise<CalendarResult> {
  const root = document.getElementById("cal");
  if (!root) return Promise.reject(new Error("falta #cal en el HTML"));

  return new Promise<CalendarResult>((resolve) => {
    let picked: string | null = null;
    let slot: string | null = null;

    const box = document.createElement("div");
    box.className = "cal-box";
    root.replaceChildren(box);
    root.setAttribute("data-on", "");

    /* ── Paso 1: el dia ─────────────────────────────────────────── */
    const title = document.createElement("h2");
    title.className = "cal-title";
    title.id = "caltitle";
    title.textContent = "¿Qué día?";

    const sub = document.createElement("p");
    sub.className = "cal-sub";
    sub.textContent = "Elige un día para la expedición";

    const grid = document.createElement("div");
    grid.className = "cal-grid";

    /* ── Paso 2: la hora ────────────────────────────────────────── */
    const stepTime = document.createElement("div");
    stepTime.className = "cal-step cal-hidden";
    const askTime = document.createElement("p");
    askTime.className = "cal-ask";
    const slots = document.createElement("div");
    slots.className = "cal-slots";
    stepTime.append(askTime, slots);

    /* ── Paso 3: confirmar ──────────────────────────────────────── */
    const stepOk = document.createElement("div");
    stepOk.className = "cal-step cal-hidden";
    const askOk = document.createElement("p");
    askOk.className = "cal-ask";
    const actions = document.createElement("div");
    actions.className = "cal-actions";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "cal-yes";
    yes.textContent = "Sí, confirmar";
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "No, cambiar";
    actions.append(yes, no);
    stepOk.append(askOk, actions);

    box.append(title, sub, grid, stepTime, stepOk);

    /* ── Comportamiento ─────────────────────────────────────────── */

    const showSlots = (date: string): void => {
      askTime.textContent = `${prettyDate(date)} — ¿a qué hora?`;
      slots.replaceChildren();
      for (const t of slotsFor(date)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cal-slot";
        b.textContent = t;
        b.addEventListener("click", () => {
          slot = t;
          audio.sfx.uiSelect();
          askOk.textContent = `¿Segura? ${prettyDate(date)} a las ${t}`;
          stepOk.classList.remove("cal-hidden");
          stepOk.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        slots.append(b);
      }
      stepTime.classList.remove("cal-hidden");
      // Elegir otro dia invalida la hora y la confirmacion anteriores:
      // si no, se podia confirmar una hora que ya no correspondia al dia
      // que estaba marcado.
      slot = null;
      stepOk.classList.add("cal-hidden");
    };

    for (const day of availableDays()) {
      const d = new Date(`${day}T12:00:00`);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cal-day";
      b.setAttribute("aria-pressed", "false");
      const mes = MONTHS[d.getMonth()] ?? "";
      b.innerHTML = `${d.getDate()} <small>${DAY_NAMES[d.getDay()]} · ${mes.slice(0, 3)}</small>`;
      b.addEventListener("click", () => {
        picked = day;
        audio.sfx.uiSelect();
        for (const other of grid.children) {
          other.setAttribute("aria-pressed", other === b ? "true" : "false");
        }
        showSlots(day);
      });
      grid.append(b);
    }

    no.addEventListener("click", () => {
      audio.sfx.uiDeny();
      slot = null;
      stepOk.classList.add("cal-hidden");
    });

    yes.addEventListener("click", () => {
      if (!picked || !slot) return;
      audio.sfx.uiConfirm();
      // Se cierra ANTES de resolver: quien recibe el resultado arranca el
      // fundido a la pantalla siguiente, y el velo no puede quedarse por
      // encima del juego mientras tanto.
      close();
      resolve({ date: picked, time: slot });
    });

    function close(): void {
      root!.removeAttribute("data-on");
      root!.replaceChildren();
    }
  });
}

/** Cierra el calendario pase lo que pase. Para el apagado de la escena. */
export function closeCalendar(): void {
  const root = document.getElementById("cal");
  if (!root) return;
  root.removeAttribute("data-on");
  root.replaceChildren();
}
