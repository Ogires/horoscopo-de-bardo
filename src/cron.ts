// src/cron.ts — cuatro tareas idempotentes según la hora programada (diseño, sección 3.2)
import { confirmarTelegram, guardarDia, historial, leerDia, liberarTelegram, reservarTelegram } from "./datos";
import type { Env } from "./env";
import { fechaMadrid, fechaObjetivo, tareaDeHora } from "./fecha";
import { generarDia, modelosDe, type DiaGenerado } from "./generar/cadena";
import { canalDe, enviarTelegram, textoTelegram } from "./telegram";
import { escapar } from "./texto";

export interface DepsCron {
  db: D1Database;
  generar: (fecha: string, historial: Map<string, string[]>) => Promise<DiaGenerado>;
  telegram: (chat: string, texto: string) => Promise<boolean>;
  /** null si el canal aún no existe o no hay bot: publicar no hace nada */
  canal: string | null;
  /** Chat del administrador; null: sin avisos */
  avisos: string | null;
  urlPublica: string;
  ahora: () => number;
}

export function depsCron(env: Env): DepsCron {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() || null;
  return {
    db: env.DB,
    generar: (fecha, historial) =>
      generarDia(fecha, {
        claves: { groq: env.GROQ_API_KEY, zai: env.ZAI_API_KEY },
        modelos: modelosDe(env),
        historial,
        // GLM-5.3 no admite apagar el razonamiento (thinking disabled da 400): con pensar, la cadena
        // lo activa y pide el ligero
        pensar: true,
        zaiUrl: env.ZAI_URL,
      }),
    telegram: (chat, texto) => (token ? enviarTelegram(token, chat, texto) : Promise.resolve(false)),
    canal: token ? canalDe(env.TELEGRAM_CANAL) : null,
    avisos: (token && env.TELEGRAM_AVISOS?.trim()) || null,
    urlPublica: env.URL_PUBLICA,
    ahora: () => Date.now(),
  };
}

const avisar = async (d: DepsCron, texto: string): Promise<void> => {
  if (d.avisos) await d.telegram(d.avisos, `🪕 ${escapar(texto)}`).catch(() => false);
};

export async function ejecutarCron(programadaMs: number, d: DepsCron): Promise<string> {
  const tarea = tareaDeHora(programadaMs);
  if (tarea === "generar" || tarea === "reintentar") {
    const fecha = fechaObjetivo(programadaMs);
    if (await leerDia(d.db, fecha)) return `${tarea}:ya_existe`;
    const g = await d.generar(fecha, await historial(d.db, fecha));
    // Lo que la validación tiró, para revisar el prompt en los logs
    console.log(JSON.stringify({ evento: "generacion", fecha, modelo: g.modelo, tokens: g.tokens, fallos: g.fallos, descartadas: g.descartadas }));
    if (g.modelo === null && tarea === "generar") return "generar:ia_caida";
    await guardarDia(d.db, fecha, g.profecias, g.modelo, d.ahora());
    if (g.modelo === null) await avisar(d, `El día ${fecha} ha salido entero del banco. Fallos: ${g.fallos.join(", ").slice(0, 500)}`);
    return `${tarea}:${g.modelo ?? "banco"}`;
  }
  if (tarea === "publicar" || tarea === "reintentar-publicar") {
    // Sin canal todavía: ni se reserva ni se marca el día, que se publicará cuando lo haya
    if (!d.canal) return `${tarea}:sin_canal`;
    const reintento = tarea === "reintentar-publicar";
    const fecha = fechaMadrid(programadaMs);
    const dia = await leerDia(d.db, fecha);
    if (!dia) {
      if (reintento) await avisar(d, `No hay día ${fecha} que publicar en el canal`);
      return `${tarea}:sin_dia`;
    }
    if (dia.telegram_ms === -1) {
      if (reintento) await avisar(d, `La publicación del ${fecha} quedó a medias: revisa el canal`);
      return `${tarea}:en_curso`;
    }
    if (dia.telegram_ms !== null) return `${tarea}:ya_publicado`;
    if (!(await reservarTelegram(d.db, fecha))) return `${tarea}:en_curso`;
    if (await d.telegram(d.canal, textoTelegram(fecha, dia.profecias, d.urlPublica))) {
      await confirmarTelegram(d.db, fecha, d.ahora());
      return `${tarea}:publicado`;
    }
    await liberarTelegram(d.db, fecha);
    if (reintento) await avisar(d, `No se pudo publicar el día ${fecha} en el canal`);
    return `${tarea}:fallo`;
  }
  return "sin_tarea";
}
