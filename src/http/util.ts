// src/http/util.ts
export function json(datos: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

async function sha256Hex(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function coincideEtag(cabecera: string | null, etag: string): boolean {
  if (!cabecera) return false;
  return cabecera.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);
}

// Respuesta con ETag: Camo y los clientes de la API revalidan y casi siempre reciben un 304
export async function responder(request: Request, cuerpo: string, tipo: string, cache: string, extra: Record<string, string> = {}): Promise<Response> {
  const etag = `"${(await sha256Hex(cuerpo)).slice(0, 16)}"`;
  const headers = { "content-type": tipo, "cache-control": cache, etag, ...extra };
  if (coincideEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : cuerpo, { headers });
}

export function redirigir(url: URL, ruta: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 308, headers: { location: `${ruta}${url.search}`, ...extra } });
}

// IPv6: un cliente suele tener un /64 entero
export function claveIp(ip: string): string {
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapeada) return mapeada[1];
  if (!ip.includes(":")) return ip;
  const [cabeza, cola] = ip.toLowerCase().split("::");
  const a = cabeza ? cabeza.split(":") : [];
  const b = cola ? cola.split(":") : [];
  const grupos = [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return `${grupos.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

export const claveCliente = (request: Request) => claveIp(request.headers.get("cf-connecting-ip") ?? "0.0.0.0");

export function decodificar(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}
