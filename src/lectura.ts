// src/lectura.ts — lo que ven la web, la API y la tarjeta
import { leerDia } from "./datos";
import type { Env } from "./env";
import { esFechaValida, fechaMadrid, segundosHastaMedianoche } from "./fecha";
import { diaDelBanco } from "./generar/banco";
import type { Profecia } from "./tipos";

export interface DiaLeido {
  fecha: string;
  profecias: Profecia[];
  modelo: string | null;
  /** Servido del banco porque no había fila o D1 falló */
  reserva: boolean;
}

export type Consulta = { ok: true; dia: DiaLeido } | { ok: false; error: "fecha_invalida" | "fuera_de_rango" };

export async function diaParaMostrar(env: Pick<Env, "DB" | "FECHA_LANZAMIENTO">, fecha: string, ahoraMs: number): Promise<Consulta> {
  if (!esFechaValida(fecha)) return { ok: false, error: "fecha_invalida" };
  const hoy = fechaMadrid(ahoraMs);
  // El día siguiente ya existe desde la víspera, pero no se enseña hasta la medianoche de Madrid
  if (fecha > hoy || (fecha < env.FECHA_LANZAMIENTO && fecha !== hoy)) return { ok: false, error: "fuera_de_rango" };
  try {
    const d = await leerDia(env.DB, fecha);
    if (d) return { ok: true, dia: { fecha, profecias: d.profecias, modelo: d.modelo, reserva: false } };
  } catch (e) {
    console.error(JSON.stringify({ evento: "d1_caido", mensaje: String(e).slice(0, 200) }));
  }
  return { ok: true, dia: { fecha, profecias: diaDelBanco(fecha), modelo: null, reserva: true } };
}

// Hoy, hasta la medianoche de Madrid con tope de una hora; la reserva, 60 s para que no se quede
// pegada; los días pasados, uno (sin immutable: un día se puede reemplazar)
export function cacheControl(dia: DiaLeido, ahoraMs: number): string {
  if (dia.reserva) return "public, max-age=60";
  if (dia.fecha === fechaMadrid(ahoraMs)) return `public, max-age=${Math.min(3600, segundosHastaMedianoche(ahoraMs))}`;
  return "public, max-age=86400";
}
