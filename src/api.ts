// src/api.ts — API pública: GET sin clave, CORS abierto, ETag
import type { Env } from "./env";
import { fechaMadrid } from "./fecha";
import { hash32 } from "./generar/sorteo";
import { claveCliente, decodificar, json, redirigir, responder } from "./http/util";
import { cacheControl, diaParaMostrar } from "./lectura";
import { resolverSigno, SIGNOS } from "./signos";
import { aAscii } from "./texto";

/** Las rutas que documenta public/openapi.json (un test comprueba que coinciden) */
export const RUTAS_API = ["/api/v1/signos", "/api/v1/hoy", "/api/v1/signos/{signo}", "/api/v1/dias/{fecha}"] as const;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  // If-None-Match no es una cabecera «simple»: sin esto, revalidar a mano desde otro origen no pasa el preflight
  "access-control-allow-headers": "if-none-match",
  "access-control-expose-headers": "etag, x-bardo-consejo",
  "access-control-max-age": "86400",
};
const JSON_UTF8 = "application/json; charset=utf-8";

const MENSAJES = {
  signo_desconocido: "Ese signo no figura en mis pergaminos. Mira /api/v1/signos",
  fecha_invalida: "Esa fecha no la entiendo. Escríbela como AAAA-MM-DD",
  fuera_de_rango: "El Bardo no ve tan lejos",
  ruta_desconocida: "Aquí no hay profecía que valga",
  metodo: "Solo GET, HEAD y OPTIONS: el Bardo canta, no escucha",
  demasiadas: "Calma, que los astros no van tan rápido",
} as const;

const error = (codigo: keyof typeof MENSAJES, status: number, extra: Record<string, string> = {}) =>
  json({ error: codigo, mensaje: MENSAJES[codigo] }, status, { ...CORS, ...extra });

export async function api(request: Request, env: Env, ahoraMs: number): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") return error("metodo", 405, { allow: "GET, HEAD, OPTIONS" });
  const { success } = await env.RL.limit({ key: claveCliente(request) });
  if (!success) return error("demasiadas", 429, { "retry-after": "60" });

  const url = new URL(request.url);
  const ruta = url.pathname;
  if (ruta === "/api/v1/signos") {
    const signos = SIGNOS.map(({ slug, nombre, emoji, alias }) => ({ slug, nombre, emoji, alias }));
    return responder(request, JSON.stringify({ signos }), JSON_UTF8, "public, max-age=86400", CORS);
  }
  const hoy = fechaMadrid(ahoraMs);
  if (ruta === "/api/v1/hoy") return responderDia(request, env, hoy, ahoraMs, null);

  let m = /^\/api\/v1\/signos\/([^/]+)$/.exec(ruta);
  if (m) {
    const pedido = decodificar(m[1]);
    const signo = resolverSigno(pedido);
    if (!signo) return error("signo_desconocido", 404);
    if (signo.slug !== pedido) return redirigir(url, `/api/v1/signos/${signo.slug}`, CORS);
    return responderDia(request, env, url.searchParams.get("fecha") ?? hoy, ahoraMs, signo.slug);
  }
  m = /^\/api\/v1\/dias\/([^/]+)$/.exec(ruta);
  if (m) return responderDia(request, env, decodificar(m[1]), ahoraMs, null);
  return error("ruta_desconocida", 404);
}

async function responderDia(request: Request, env: Env, fecha: string, ahoraMs: number, signo: string | null): Promise<Response> {
  const c = await diaParaMostrar(env, fecha, ahoraMs);
  if (!c.ok) return error(c.error, c.error === "fecha_invalida" ? 400 : 404);
  const { dia } = c;
  // El consejo: el «Evita» del signo pedido o, para el día entero, uno del día elegido por la fecha
  const elegida = signo ? dia.profecias.find((p) => p.signo === signo)! : dia.profecias[hash32(dia.fecha) % dia.profecias.length];
  const cuerpo = signo ? { fecha: dia.fecha, ...elegida } : { fecha: dia.fecha, profecias: dia.profecias };
  return responder(request, JSON.stringify(cuerpo), JSON_UTF8, cacheControl(dia, ahoraMs), {
    ...CORS,
    "x-bardo-consejo": aAscii(`Evita ${elegida.evita}`),
  });
}
