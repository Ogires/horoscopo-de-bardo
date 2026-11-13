// src/http/cabeceras.ts — A02: cabeceras en todas las respuestas (run_worker_first: también estáticos)
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Si la ruta ya trae su CSP (la tarjeta SVG), se respeta
export function conCabeceras(r: Response): Response {
  const h = new Headers(r.headers);
  if (!h.has("content-security-policy")) h.set("content-security-policy", CSP);
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  h.set("x-frame-options", "DENY");
  h.set("strict-transport-security", "max-age=31536000");
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
