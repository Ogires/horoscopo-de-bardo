// src/telegram.ts — mensaje diario del canal y envío (el bot solo envía: sin webhook ni comandos)
import { fechaLarga } from "./fecha";
import { SIGNO_POR_SLUG } from "./signos";
import { escapar } from "./texto";
import type { Profecia } from "./tipos";

/** El valor de TELEGRAM_CANAL mientras el canal no existe */
export const CANAL_PENDIENTE = "@pendiente";

/** El canal de TELEGRAM_CANAL, o null si aún no existe (vacío o @pendiente) */
export function canalDe(valor: string | undefined): string | null {
  const canal = valor?.trim() ?? "";
  return canal && canal !== CANAL_PENDIENTE ? canal : null;
}

// parse_mode HTML: todo lo que no es etiqueta propia va escapado
export function textoTelegram(fecha: string, profecias: Profecia[], urlPublica: string): string {
  const bloques = profecias.map((p) => {
    const s = SIGNO_POR_SLUG.get(p.signo)!;
    return `${s.emoji} <b>${escapar(s.nombre)}</b>\n${escapar(p.texto)}`;
  });
  const host = new URL(urlPublica).host;
  return [`🪕 <b>Horóscopo de Bardo</b> · ${escapar(fechaLarga(fecha))}`, ...bloques, `<a href="${escapar(urlPublica)}">${escapar(host)}</a>`].join("\n\n");
}

// Nunca se registra la URL: lleva el token
export async function enviarTelegram(token: string, chat: string, texto: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: "HTML" }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
