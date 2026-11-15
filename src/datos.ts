// src/datos.ts — una fila por día; la idempotencia vive en las consultas
import type { Dia, Profecia } from "./tipos";

interface Fila {
  fecha: string;
  profecias: string;
  modelo: string | null;
  creado_ms: number;
  telegram_ms: number | null;
}

export async function leerDia(db: D1Database, fecha: string): Promise<Dia | null> {
  const f = await db
    .prepare("SELECT fecha, profecias, modelo, creado_ms, telegram_ms FROM dias WHERE fecha = ?")
    .bind(fecha)
    .first<Fila>();
  return f ? { ...f, profecias: JSON.parse(f.profecias) as Profecia[] } : null;
}

// INSERT OR IGNORE: si el día ya existe no se pisa (devuelve false)
export async function guardarDia(db: D1Database, fecha: string, profecias: Profecia[], modelo: string | null, ahoraMs: number): Promise<boolean> {
  const r = await db
    .prepare("INSERT OR IGNORE INTO dias (fecha, profecias, modelo, creado_ms) VALUES (?, ?, ?, ?)")
    .bind(fecha, JSON.stringify(profecias), modelo, ahoraMs)
    .run();
  return r.meta.changes === 1;
}

/**
 * Textos de la IA de los días anteriores a `antesDe`, por signo y del más reciente al más antiguo.
 * Los del banco no van: en el prompt el modelo los parafrasea, y el banco entero ya está en el
 * filtro de copias de la cadena.
 */
export async function historial(db: D1Database, antesDe: string, dias = 14): Promise<Map<string, string[]>> {
  const { results } = await db
    .prepare("SELECT profecias FROM dias WHERE fecha < ? ORDER BY fecha DESC LIMIT ?")
    .bind(antesDe, dias)
    .all<{ profecias: string }>();
  return historialDe(results);
}

/** El historial a partir de filas ya leídas: las de la D1 del Worker o las de `wrangler d1 execute --json` */
export function historialDe(filas: readonly { profecias: string }[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const fila of filas) {
    for (const p of JSON.parse(fila.profecias) as Profecia[]) {
      if (p.origen === "ia") mapa.set(p.signo, [...(mapa.get(p.signo) ?? []), p.texto]);
    }
  }
  return mapa;
}

const literal = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * El INSERT de un día para `wrangler d1 execute --file` (scripts/sembrar.ts), que no admite parámetros.
 * Sin reemplazar, como guardarDia: no pisa un día que ya existe. Reemplazando, cambia las profecías y el
 * modelo, pero conserva creado_ms y telegram_ms: un día ya publicado no vuelve a salir en el canal.
 */
export function sqlSembrar(fecha: string, profecias: Profecia[], modelo: string | null, ahoraMs: number, reemplazar: boolean): string {
  const valores = `(${literal(fecha)}, ${literal(JSON.stringify(profecias))}, ${modelo === null ? "NULL" : literal(modelo)}, ${Math.trunc(ahoraMs)})`;
  return reemplazar
    ? `INSERT INTO dias (fecha, profecias, modelo, creado_ms) VALUES ${valores} ON CONFLICT(fecha) DO UPDATE SET profecias = excluded.profecias, modelo = excluded.modelo;`
    : `INSERT OR IGNORE INTO dias (fecha, profecias, modelo, creado_ms) VALUES ${valores};`;
}

// Se reserva antes de enviar: si D1 falla después del envío, el reintento no duplica el mensaje
export async function reservarTelegram(db: D1Database, fecha: string): Promise<boolean> {
  const r = await db.prepare("UPDATE dias SET telegram_ms = -1 WHERE fecha = ? AND telegram_ms IS NULL").bind(fecha).run();
  return r.meta.changes === 1;
}

export async function confirmarTelegram(db: D1Database, fecha: string, ms: number): Promise<void> {
  await db.prepare("UPDATE dias SET telegram_ms = ? WHERE fecha = ?").bind(ms, fecha).run();
}

// Solo deshace la reserva (-1): un día ya publicado no vuelve a quedar pendiente
export async function liberarTelegram(db: D1Database, fecha: string): Promise<void> {
  await db.prepare("UPDATE dias SET telegram_ms = NULL WHERE fecha = ? AND telegram_ms = -1").bind(fecha).run();
}
