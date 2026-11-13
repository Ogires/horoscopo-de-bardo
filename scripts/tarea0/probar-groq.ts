// scripts/tarea0/probar-groq.ts
// [ESFUERZO=low|medium] [MODELOS=a,b] [PAUSA_S=65] [GUARDAR_JSON=ruta] npx tsx scripts/tarea0/probar-groq.ts [AAAA-MM-DD]
// Lee GROQ_API_KEY de ARCHIVO_VARS (por defecto la de IFC) sin mostrarla. Simula 3 días seguidos.
// MODELOS es la cadena de modelos, separados por comas (por defecto, solo openai/gpt-oss-120b).
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";
import { generarDia, type DiaGenerado, type Esfuerzo } from "../../src/generar/cadena";
import { sumarDias } from "../../src/fecha";
import { sortearDia } from "../../src/generar/sorteo";
import { SIGNO_POR_SLUG } from "../../src/signos";

const nombre = (slug: string) => SIGNO_POR_SLUG.get(slug)!.nombre;

const ruta = process.env.ARCHIVO_VARS ?? "../interview-fight-club/.dev.vars";
const linea = readFileSync(ruta, "utf8").split(/\r?\n/).find((l) => l.startsWith("GROQ_API_KEY="));
if (!linea) throw new Error(`No hay GROQ_API_KEY en ${ruta}`);
const apiKey = linea.slice("GROQ_API_KEY=".length).trim().replace(/^"|"$/g, "");

const esfuerzo = (process.env.ESFUERZO ?? "low") as Esfuerzo;
if (esfuerzo !== "low" && esfuerzo !== "medium") throw new Error(`ESFUERZO debe ser low o medium, no ${esfuerzo}`);
const modelos = (process.env.MODELOS ?? "openai/gpt-oss-120b").split(",").map((m) => m.trim()).filter(Boolean);
if (!modelos.length) throw new Error("MODELOS está vacío");
console.log(`reasoning_effort: ${esfuerzo} · modelos: ${modelos.join(" → ")}`);

// Groq limita a 8K tokens por minuto y cada llamada pide ~4.000 más el tope de salida:
// sin pausa, el segundo día daría 429 y caería al banco sin que se note. Qwen 3.8 tiene
// además un tope de 1.000 tokens de salida por minuto y cada llamada saca ~1.900: PAUSA_S=130
const PAUSA_MS = Number(process.env.PAUSA_S ?? 65) * 1000;

interface Uso {
  modelo: string;
  entrada?: number;
  salida?: number;
  razonamiento?: number;
  /** Si Groq no da los tokens de razonamiento (Qwen), lo largo del razonamiento en caracteres */
  razonamientoCaracteres?: number;
  tiempoGroq?: number;
  http?: number;
}
let usos: Uso[] = [];

// Envoltorio de fetch solo para medir: uso de tokens, cabeceras de cupo y, si Groq
// rechaza la petición, el cuerpo del error (generarDia solo guarda el código)
const fetchReal = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const r = await fetchReal(input, init);
  const copia = r.clone();
  const modelo = String(JSON.parse(String(init?.body ?? "{}")).model ?? "?");
  if (!r.ok) {
    usos.push({ modelo, http: r.status });
    console.log(`   [groq] ${modelo} HTTP ${r.status}: ${(await copia.text()).slice(0, 600)}`);
  } else {
    const cuerpo = (await copia.json()) as { usage?: Record<string, unknown>; choices?: { message?: { reasoning?: string } }[] };
    const u = cuerpo.usage ?? {};
    const razonamiento = (u.completion_tokens_details as { reasoning_tokens?: number } | undefined)?.reasoning_tokens;
    const textoRazonado = cuerpo.choices?.[0]?.message?.reasoning;
    const uso: Uso = {
      modelo,
      entrada: u.prompt_tokens as number,
      salida: u.completion_tokens as number,
      razonamiento,
      razonamientoCaracteres: textoRazonado === undefined ? undefined : [...textoRazonado].length,
      tiempoGroq: u.total_time as number,
    };
    usos.push(uso);
    console.log(
      `   [groq] ${modelo} · entrada ${uso.entrada} · salida ${uso.salida}` +
        (razonamiento === undefined ? "" : ` (razonamiento ${razonamiento})`) +
        (uso.razonamientoCaracteres === undefined ? "" : ` · razonamiento devuelto: ${uso.razonamientoCaracteres} caracteres`) +
        ` · total ${u.total_tokens} · tiempo Groq ${u.total_time ?? "?"} s · cola ${u.queue_time ?? "?"} s` +
        ` · cupo restante/min ${r.headers.get("x-ratelimit-remaining-tokens") ?? "?"}` +
        ` · peticiones restantes/día ${r.headers.get("x-ratelimit-remaining-requests") ?? "?"}`,
    );
  }
  return r;
}) as typeof fetch;

const inicio = process.argv[2] ?? "2026-11-13";
const historial = new Map<string, string[]>();
const dias: (DiaGenerado & { fecha: string; ms: number; usos: Uso[]; ganchos: Record<string, string> })[] = [];
for (let i = 0; i < 3; i++) {
  if (i > 0) await esperar(PAUSA_MS);
  const fecha = sumarDias(inicio, i);
  const t0 = Date.now();
  usos = [];
  const g = await generarDia(fecha, { claves: { groq: apiKey }, modelos, historial, esfuerzo });
  const ms = Date.now() - t0;
  const ganchos = Object.fromEntries(sortearDia(fecha).map((s) => [s.signo, s.gancho]));
  dias.push({ ...g, fecha, ms, usos, ganchos });
  const reservas = g.fallos.filter((f) => f.endsWith(":matiz_reserva")).length;
  const ia = g.profecias.filter((p) => p.origen === "ia").length;
  console.log(
    `\n=== ${fecha} · ${g.modelo ?? "BANCO"} · ${g.tokens} tokens · ${ms} ms · IA ${ia} / banco ${12 - ia}` +
      ` · matices de reserva ${reservas} · fallos: ${g.fallos.join(", ") || "ninguno"}`,
  );
  for (const p of g.profecias) {
    console.log(`${nombre(p.signo)} [${p.origen}] (${[...p.texto].length}) ${p.texto}`);
    console.log(`   Gancho: ${ganchos[p.signo]}`);
    console.log(`   Evita: ${p.evita} · Compatible: ${p.compatible.signo}, ${p.compatible.matiz}`);
    // Al prompt solo vuelve lo que escribió la IA: el banco ya está entero en el filtro de copias
    // y, si se le enseña al modelo, lo parafrasea al día siguiente
    if (p.origen === "ia") historial.set(p.signo, [p.texto, ...(historial.get(p.signo) ?? [])]);
  }
  if (g.descartadas.length) {
    console.log("--- Descartadas (matiz_reserva: se publicó el texto con un matiz de la lista)");
    for (const d of g.descartadas) {
      console.log(`${nombre(d.signo)} · ${d.modelo} · ${d.motivo} (${[...d.texto].length}) ${d.texto}`);
      console.log(`   Evita (${[...d.evita].length}): ${d.evita} · Matiz (${[...d.matiz].length}): ${d.matiz}`);
    }
  }
}
// Sin la key: solo lo que devolvió generarDia y el uso medido, para preparar la revisión del tono
if (process.env.GUARDAR_JSON) writeFileSync(process.env.GUARDAR_JSON, JSON.stringify({ esfuerzo, modelos, dias }, null, 2));
