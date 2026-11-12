// src/fecha.ts — el «día» del Bardo es el de Madrid; los crons de Cloudflare van en UTC
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

const FORMATO = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Madrid",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

function partes(ms: number): { fecha: string; segundos: number } {
  const p = Object.fromEntries(FORMATO.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    segundos: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second),
  };
}

export const fechaMadrid = (ms: number): string => partes(ms).fecha;

// 21:00 y 22:00 UTC caen antes de la medianoche de Madrid o justo en ella, en invierno y en verano
export const fechaObjetivo = (programadaMs: number): string => fechaMadrid(programadaMs + 4 * HORA_MS);

export type Tarea = "generar" | "reintentar" | "publicar" | "reintentar-publicar";
const TAREAS: Record<number, Tarea> = { 21: "generar", 22: "reintentar", 7: "publicar", 8: "reintentar-publicar" };
export const tareaDeHora = (programadaMs: number): Tarea | null => TAREAS[new Date(programadaMs).getUTCHours()] ?? null;

// Solo se usa con un tope de una hora, y en la última hora del día no hay cambios de hora
export const segundosHastaMedianoche = (ahoraMs: number): number => Math.max(1, 86_400 - partes(ahoraMs).segundos);

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
export function esFechaValida(s: string): boolean {
  const m = RE_FECHA.exec(s);
  if (!m) return false;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === s;
}

export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + n * DIA_MS).toISOString().slice(0, 10);
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${d} de ${MESES[m - 1]} de ${a}`;
}

export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)} ${a}`;
}
