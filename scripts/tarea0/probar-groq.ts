// scripts/tarea0/probar-groq.ts — npx tsx scripts/tarea0/probar-groq.ts [AAAA-MM-DD]
// Lee GROQ_API_KEY de ARCHIVO_VARS (por defecto la de IFC) sin mostrarla. Simula 3 días seguidos.
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";
import { generarDia } from "../../src/generar/cadena";
import { sumarDias } from "../../src/fecha";
import { SIGNO_POR_SLUG } from "../../src/signos";

const ruta = process.env.ARCHIVO_VARS ?? "../interview-fight-club/.dev.vars";
const linea = readFileSync(ruta, "utf8").split(/\r?\n/).find((l) => l.startsWith("GROQ_API_KEY="));
if (!linea) throw new Error(`No hay GROQ_API_KEY en ${ruta}`);
const apiKey = linea.slice("GROQ_API_KEY=".length).trim().replace(/^"|"$/g, "");

// Groq limita a 8K tokens por minuto y cada llamada pide ~4.500 más el tope de salida:
// sin pausa, el segundo día daría 429 y caería al banco sin que se note
const PAUSA_MS = 65_000;

// Envoltorio de fetch solo para medir: uso de tokens, cabeceras de cupo y, si Groq
// rechaza la petición, el cuerpo del error (generarDia solo guarda el código)
const fetchReal = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const r = await fetchReal(input, init);
  const copia = r.clone();
  if (!r.ok) {
    console.log(`   [groq] HTTP ${r.status}: ${(await copia.text()).slice(0, 600)}`);
  } else {
    const u = ((await copia.json()) as { usage?: Record<string, unknown> }).usage ?? {};
    const razonamiento = (u.completion_tokens_details as { reasoning_tokens?: number } | undefined)?.reasoning_tokens;
    console.log(
      `   [groq] entrada ${u.prompt_tokens} · salida ${u.completion_tokens}` +
        (razonamiento === undefined ? "" : ` (razonamiento ${razonamiento})`) +
        ` · total ${u.total_tokens} · tiempo Groq ${u.total_time ?? "?"} s · cola ${u.queue_time ?? "?"} s` +
        ` · cupo restante/min ${r.headers.get("x-ratelimit-remaining-tokens") ?? "?"}` +
        ` · peticiones restantes/día ${r.headers.get("x-ratelimit-remaining-requests") ?? "?"}`,
    );
  }
  return r;
}) as typeof fetch;

const inicio = process.argv[2] ?? "2026-11-13";
const historial = new Map<string, string[]>();
for (let i = 0; i < 3; i++) {
  if (i > 0) await esperar(PAUSA_MS);
  const fecha = sumarDias(inicio, i);
  const t0 = Date.now();
  const g = await generarDia(fecha, { apiKey, modelos: ["openai/gpt-oss-120b"], historial });
  console.log(`\n=== ${fecha} · ${g.modelo ?? "BANCO"} · ${g.tokens} tokens · ${Date.now() - t0} ms · fallos: ${g.fallos.join(", ") || "ninguno"}`);
  for (const p of g.profecias) {
    console.log(`${SIGNO_POR_SLUG.get(p.signo)!.nombre} [${p.origen}] (${[...p.texto].length}) ${p.texto}`);
    console.log(`   Evita: ${p.evita} · Compatible: ${p.compatible.signo}, ${p.compatible.matiz}`);
    historial.set(p.signo, [p.texto, ...(historial.get(p.signo) ?? [])]);
  }
}
