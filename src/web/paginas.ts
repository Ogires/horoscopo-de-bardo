// src/web/paginas.ts — HTML renderizado en el Worker; todo el texto pasa por escapar()
import type { Env } from "../env";
import { fechaLarga, fechaMadrid, sumarDias } from "../fecha";
import { responder } from "../http/util";
import { cacheControl, diaParaMostrar, type DiaLeido } from "../lectura";
import { SIGNO_POR_SLUG } from "../signos";
import { canalDe } from "../telegram";
import { entreComillas, escapar as e } from "../texto";

/** El repo público del proyecto, enlazado en el pie */
const REPO = "https://github.com/Ogires/horoscopo-de-bardo";

interface Marco {
  titulo: string;
  descripcion: string;
  ruta: string;
  cuerpo: string;
}

// Solo un canal público (@nombre) tiene enlace en t.me
function enlaceTelegram(env: Pick<Env, "TELEGRAM_CANAL">): string | null {
  const canal = canalDe(env.TELEGRAM_CANAL);
  return canal && /^@[A-Za-z0-9_]{5,32}$/.test(canal) ? `https://t.me/${canal.slice(1)}` : null;
}

function documento(env: Env, m: Marco): string {
  const url = env.URL_PUBLICA;
  const telegram = enlaceTelegram(env);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(m.titulo)}</title>
<meta name="description" content="${e(m.descripcion)}">
<link rel="canonical" href="${e(url + m.ruta)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="Horóscopo de Bardo">
<meta property="og:title" content="${e(m.titulo)}">
<meta property="og:description" content="${e(m.descripcion)}">
<meta property="og:url" content="${e(url + m.ruta)}">
<meta property="og:image" content="${e(url)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="627">
<meta property="og:image:alt" content="Horóscopo de Bardo: el horóscopo diario de doce lenguajes de programación">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4ead5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16110c" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fuentes/im-fell-english-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/estilos.css">
<script src="/copiar.js" defer></script>
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera"><a class="marca" href="/"><svg class="sello" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="30"/><polygon points="32,10 35.4,23.7 47.6,16.4 40.3,28.6 54,32 40.3,35.4 47.6,47.6 35.4,40.3 32,54 28.6,40.3 16.4,47.6 23.7,35.4 10,32 23.7,28.6 16.4,16.4 28.6,23.7"/></svg> Horóscopo de Bardo</a>
<nav aria-label="Principal"><a href="/api/">API</a>${telegram ? ` <a href="${e(telegram)}">Telegram</a>` : ""}</nav></header>
<main id="contenido">${m.cuerpo}</main>
<footer class="pie"><p>Cada noche, un bardo pesimista escribe el horóscopo de doce lenguajes de programación. Lo redacta una IA (GLM-5.3) y, si falla, tira de profecías escritas de antemano.</p>
<p><a href="${REPO}">Código fuente</a> · <a href="/api/">API pública</a> · Sin cookies ni rastreo</p></footer>
</body>
</html>`;
}

function rejilla(dia: DiaLeido): string {
  return `<ul class="rejilla">${dia.profecias
    .map((p) => {
      const s = SIGNO_POR_SLUG.get(p.signo)!;
      return `<li class="signo"><h2><a href="/${s.slug}"><span class="emoji" aria-hidden="true">${s.emoji}</span> ${e(s.nombre)}</a></h2><p>${e(p.texto)}</p></li>`;
    })
    .join("")}</ul>`;
}

export function fragmentos(slug: string, nombre: string, url: string) {
  const enlace = `${url}/${slug}`;
  const img = `${url}/tarjeta/${slug}.svg`;
  return {
    picture: `<a href="${enlace}">\n  <picture>\n    <source media="(prefers-color-scheme: dark)" srcset="${img}?tema=oscuro">\n    <img alt="Horóscopo de Bardo: ${nombre}" src="${img}?tema=claro">\n  </picture>\n</a>`,
    markdown: `[![Horóscopo de Bardo: ${nombre}](${img})](${enlace})`,
  };
}

function cuerpoSigno(env: Env, dia: DiaLeido, slug: string): string {
  const s = SIGNO_POR_SLUG.get(slug)!;
  const p = dia.profecias.find((x) => x.signo === slug)!;
  const c = SIGNO_POR_SLUG.get(p.compatible.signo)!;
  const f = fragmentos(s.slug, s.nombre, env.URL_PUBLICA);
  const telegram = enlaceTelegram(env);
  return `<article class="profecia">
<h1><span class="emoji" aria-hidden="true">${s.emoji}</span> ${e(s.nombre)}</h1>
<p class="fecha"><a href="/h/${dia.fecha}">${e(fechaLarga(dia.fecha))}</a></p>
<blockquote><p>${e(entreComillas(p.texto))}</p></blockquote>
<dl>
<div><dt>Puerto de la suerte</dt><dd>${p.puerto.numero} (${e(p.puerto.servicio)})</dd></div>
<div><dt>Compatible con</dt><dd><a href="/${c.slug}">${e(c.nombre)}</a>, ${e(p.compatible.matiz)}</dd></div>
<div><dt>Evita</dt><dd>${e(p.evita)}</dd></div>
</dl>
${p.origen === "banco" ? '<p class="origen">Sacado del archivo del Bardo.</p>' : ""}
</article>
<section class="readme" aria-labelledby="t-readme">
<h2 id="t-readme">Ponlo en tu README de GitHub</h2>
<p>La tarjeta cambia cada día a medianoche (hora de Madrid).</p>
<img class="vista" src="/tarjeta/${s.slug}.svg" alt="" width="495">
<h3>Con el tema claro u oscuro de GitHub</h3>
<pre><code id="frag-picture">${e(f.picture)}</code></pre>
<button type="button" data-copiar="frag-picture">Copiar HTML</button>
<h3>O en una línea de Markdown</h3>
<pre><code id="frag-md">${e(f.markdown)}</code></pre>
<button type="button" data-copiar="frag-md">Copiar Markdown</button>
<p class="estado" role="status" id="estado-copia"></p>
<p>También en la <a href="/api/">API</a>: <code>GET /api/v1/signos/${s.slug}</code>${telegram ? `. Y cada mañana, en el <a href="${e(telegram)}">canal de Telegram</a>` : ""}.</p>
</section>
<p class="volver"><a href="/">← Los doce signos de hoy</a></p>`;
}

// Antes del lanzamiento solo existe hoy: el día anterior daría 404
function navArchivo(fecha: string, hoy: string, lanzamiento: string): string {
  const anterior = fecha > lanzamiento ? `<a rel="prev" href="/h/${sumarDias(fecha, -1)}">← Día anterior</a>` : "";
  const siguiente = fecha < hoy ? `<a rel="next" href="/h/${sumarDias(fecha, 1)}">Día siguiente →</a>` : "";
  return anterior || siguiente ? `<nav class="archivo" aria-label="Archivo">${anterior}${siguiente}</nav>` : "";
}

function cuerpoDia(dia: DiaLeido, hoy: string, lanzamiento: string): string {
  return `<h1>El horóscopo del ${e(fechaLarga(dia.fecha))}</h1>${rejilla(dia)}${navArchivo(dia.fecha, hoy, lanzamiento)}`;
}

const noEncontrada = (env: Env) =>
  new Response(
    documento(env, {
      titulo: "El Bardo no ve tan lejos · Horóscopo de Bardo",
      descripcion: "Ese día no está en los pergaminos del Bardo.",
      ruta: "/",
      cuerpo: '<div class="aviso"><h1>El Bardo no ve tan lejos</h1><p>Ese día no está en sus pergaminos.</p><p><a href="/">Vuelve al horóscopo de hoy</a>.</p></div>',
    }),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );

export async function pagina(request: Request, env: Env, tipo: "portada" | "signo" | "dia", param: string, ahoraMs: number): Promise<Response> {
  const hoy = fechaMadrid(ahoraMs);
  const c = await diaParaMostrar(env, tipo === "dia" ? param : hoy, ahoraMs);
  if (!c.ok) return noEncontrada(env);
  const { dia } = c;
  let marco: Marco;
  if (tipo === "portada") {
    marco = {
      titulo: "Horóscopo de Bardo",
      descripcion: "El horóscopo diario de doce lenguajes de programación, escrito por un bardo pesimista. Tu signo es tu lenguaje.",
      ruta: "/",
      cuerpo: `<div class="entrada"><h1>El horóscopo de hoy</h1><p class="fecha">${e(fechaLarga(dia.fecha))}</p><p class="lema">Tu signo es tu lenguaje. Un bardo pesimista canta sus desgracias del día.</p></div>${rejilla(dia)}${navArchivo(dia.fecha, hoy, env.FECHA_LANZAMIENTO)}`,
    };
  } else if (tipo === "signo") {
    const s = SIGNO_POR_SLUG.get(param)!;
    const p = dia.profecias.find((x) => x.signo === param)!;
    marco = { titulo: `${s.nombre} · Horóscopo de Bardo`, descripcion: p.texto, ruta: `/${s.slug}`, cuerpo: cuerpoSigno(env, dia, param) };
  } else {
    marco = {
      titulo: `${fechaLarga(dia.fecha)} · Horóscopo de Bardo`,
      descripcion: `El horóscopo de doce lenguajes de programación del ${fechaLarga(dia.fecha)}.`,
      ruta: `/h/${dia.fecha}`,
      cuerpo: cuerpoDia(dia, hoy, env.FECHA_LANZAMIENTO),
    };
  }
  return responder(request, documento(env, marco), "text/html; charset=utf-8", cacheControl(dia, ahoraMs));
}
