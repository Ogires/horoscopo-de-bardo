// tests/helpers.ts
import { env } from "cloudflare:test";
import { diaDelBanco } from "../src/generar/banco";
import { SIGNOS } from "../src/signos";
import type { Profecia } from "../src/tipos";

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const ZAI_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const fetchReal = globalThis.fetch.bind(globalThis);

export interface Llamada {
  url: string;
  cuerpo: any;
  cabeceras: Headers;
}

// El manejador devuelve una Response nueva en cada llamada, o null para dejar pasar la petición
export function interceptar(manejador: (url: string, cuerpo: any) => Response | null | Promise<Response | null>) {
  const llamadas: Llamada[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : null;
    const r = await manejador(url, cuerpo);
    if (!r) return fetchReal(input, init);
    llamadas.push({ url, cuerpo, cabeceras: new Headers(init?.headers) });
    return r;
  }) as typeof fetch;
  return llamadas;
}

export const restaurarFetch = () => {
  globalThis.fetch = fetchReal;
};

type Parcial = Partial<{ texto: string; evita: string; matiz: string }>;

// El filtro de copias mira todos los signos: el slug va cada pocas palabras para que
// ningún sexteto de un signo coincida con el de otro
const FRASES = ["os lo advierto", "el error de hoy", "volverá con la luna", "y nadie sabrá por", "qué compilaba ayer"];

export function profeciasIa(fecha: string, cambios: Record<string, Parcial> = {}) {
  return SIGNOS.map((s) => ({
    signo: s.slug,
    texto: `${s.nombre}: ${FRASES.map((f) => `${f} ${s.slug}`).join(", ")}, el ${fecha}.`,
    evita: "tocar producción antes del café",
    matiz: "a regañadientes",
    ...cambios[s.slug],
  }));
}

export const respuestaGroq = (profecias: unknown[], tokens = 4500) =>
  Response.json({ choices: [{ message: { content: JSON.stringify({ profecias }) } }], usage: { total_tokens: tokens } });

export async function insertarDia(fecha: string, o: { profecias?: Profecia[]; modelo?: string | null; telegram_ms?: number | null } = {}) {
  const profecias = o.profecias ?? diaDelBanco(fecha).map((p) => ({ ...p, origen: "ia" as const }));
  await env.DB.prepare("INSERT OR REPLACE INTO dias (fecha, profecias, modelo, creado_ms, telegram_ms) VALUES (?, ?, ?, ?, ?)")
    .bind(fecha, JSON.stringify(profecias), o.modelo === undefined ? "openai/gpt-oss-120b" : o.modelo, Date.now(), o.telegram_ms ?? null)
    .run();
  return profecias;
}
