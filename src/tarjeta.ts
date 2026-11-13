// src/tarjeta.ts — tarjeta para el README de GitHub; Camo no carga fuentes: fuentes del sistema
import type { Env } from "./env";
import { fechaCorta, fechaLarga, fechaMadrid } from "./fecha";
import { diaDelBanco } from "./generar/banco";
import { responder } from "./http/util";
import { diaParaMostrar } from "./lectura";
import { resolverSigno, SIGNO_POR_SLUG } from "./signos";
import { entreComillas, escapar } from "./texto";
import type { Profecia } from "./tipos";

export type TemaTarjeta = "claro" | "oscuro" | "auto";
export const CSP_SVG = "default-src 'none'; style-src 'unsafe-inline'";

const ANCHO = 495;
const MARGEN = 22;
// Conservador: en Linux la serif por defecto (DejaVu) es más ancha que Georgia
const CHARS_TEXTO = 50;
const CHARS_INFO = 60;

// Los mismos colores que la web (public/estilos.css): pergamino y tinta, con el rojo lacre de acento
export const COLORES = {
  claro: { fondo: "#f4ead5", borde: "#b89f74", texto: "#211912", suave: "#5c4a35", acento: "#9e1b1b" },
  oscuro: { fondo: "#16110c", borde: "#5a4834", texto: "#efe4cc", suave: "#c2b08e", acento: "#ec8a76" },
};

export function partirLineas(texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (let palabra of texto.split(/\s+/).filter(Boolean)) {
    // Una palabra más larga que la línea se corta con guion
    while ([...palabra].length > ancho) {
      if (actual) {
        lineas.push(actual);
        actual = "";
      }
      const cps = [...palabra];
      lineas.push(`${cps.slice(0, ancho - 1).join("")}-`);
      palabra = cps.slice(ancho - 1).join("");
    }
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if ([...candidata].length <= ancho) actual = candidata;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function estilos(tema: TemaTarjeta): string {
  const reglas = (c: (typeof COLORES)["claro"]) =>
    `.fondo{fill:${c.fondo};stroke:${c.borde}}.texto{fill:${c.texto}}.suave{fill:${c.suave}}.acento{fill:${c.acento}}.filete{stroke:${c.borde}}`;
  const base =
    "text{font-family:Georgia,'Times New Roman',serif}.titulo{font-size:16px;font-weight:700;letter-spacing:.04em}.profecia{font-size:14px;font-style:italic}.info{font-size:12px}.pie{font-size:11px}";
  if (tema === "claro") return base + reglas(COLORES.claro);
  if (tema === "oscuro") return base + reglas(COLORES.oscuro);
  return `${base}${reglas(COLORES.claro)}@media (prefers-color-scheme: dark){${reglas(COLORES.oscuro)}}`;
}

export function svgTarjeta(p: Profecia, fecha: string, tema: TemaTarjeta, host: string): string {
  const signo = SIGNO_POR_SLUG.get(p.signo)!;
  const compatible = SIGNO_POR_SLUG.get(p.compatible.signo)!;
  const texto = partirLineas(entreComillas(p.texto), CHARS_TEXTO);
  const info = [
    `Puerto de la suerte: ${p.puerto.numero} (${p.puerto.servicio})`,
    `Compatible con: ${compatible.nombre}, ${p.compatible.matiz}`,
    `Evita: ${p.evita}`,
  ].flatMap((l) => partirLineas(l, CHARS_INFO));

  let y = MARGEN + 14;
  const filas = [`<text x="${MARGEN}" y="${y}" class="titulo acento">${escapar(`${signo.emoji} ${signo.nombre.toUpperCase()} · ${fechaCorta(fecha)}`)}</text>`];
  y += 8;
  filas.push(`<line class="filete" x1="${MARGEN}" y1="${y}" x2="${ANCHO - MARGEN}" y2="${y}" stroke-width="1"/>`);
  for (const l of texto) filas.push(`<text x="${MARGEN}" y="${(y += 21)}" class="profecia texto">${escapar(l)}</text>`);
  y += 8;
  for (const l of info) filas.push(`<text x="${MARGEN}" y="${(y += 18)}" class="info suave">${escapar(l)}</text>`);
  y += 24;
  filas.push(`<text x="${ANCHO - MARGEN}" y="${y}" text-anchor="end" class="pie suave">— el Bardo · ${escapar(host)}</text>`);
  const alto = y + MARGEN - 6;
  const desc = `${signo.nombre}: ${p.texto} Puerto de la suerte: ${p.puerto.numero}. Compatible con ${compatible.nombre}, ${p.compatible.matiz}. Evita: ${p.evita}.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}" viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-labelledby="titulo desc">
<title id="titulo">${escapar(`Horóscopo de Bardo: ${signo.nombre}, ${fechaLarga(fecha)}`)}</title>
<desc id="desc">${escapar(desc)}</desc>
<style>${estilos(tema)}</style>
<rect class="fondo" x="0.5" y="0.5" width="${ANCHO - 1}" height="${alto - 1}" rx="10" stroke-width="1"/>
${filas.join("\n")}
</svg>`;
}

// Sin rate limit: Camo pide desde pocas IPs para todos los perfiles de GitHub
export async function tarjeta(request: Request, env: Env, pedido: string, ahoraMs: number): Promise<Response> {
  const signo = resolverSigno(pedido);
  if (!signo) return new Response("Signo desconocido", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const t = new URL(request.url).searchParams.get("tema");
  const tema: TemaTarjeta = t === "claro" || t === "oscuro" ? t : "auto";
  const hoy = fechaMadrid(ahoraMs);
  const c = await diaParaMostrar(env, hoy, ahoraMs);
  const profecias = c.ok ? c.dia.profecias : diaDelBanco(hoy);
  const p = profecias.find((x) => x.signo === signo.slug)!;
  const svg = svgTarjeta(p, hoy, tema, new URL(env.URL_PUBLICA).host);
  // GitHub pide no-cache para las imágenes que cambian; el ETag convierte la revalidación en un 304
  return responder(request, svg, "image/svg+xml; charset=utf-8", "no-cache, max-age=0", { "content-security-policy": CSP_SVG });
}
