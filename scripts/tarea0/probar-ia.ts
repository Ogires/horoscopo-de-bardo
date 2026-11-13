// scripts/tarea0/probar-ia.ts
// [MODELOS=a,b] [ESFUERZO=low|medium] [PENSAR=1] [DIAS=3] [PAUSA_S=65] [GUARDAR_JSON=ruta] npx tsx scripts/tarea0/probar-ia.ts [AAAA-MM-DD]
// Simula DIAS días seguidos (por defecto 3) con la cadena de MODELOS, separados por comas (por
// defecto, solo openai/gpt-oss-120b). Los que llevan el prefijo zai: van a Z.ai (ver cadena.ts).
// Keys, sin mostrarlas: GROQ_API_KEY de ARCHIVO_VARS (por defecto la de IFC) y ZAI_API_KEY del
// .dev.vars de este repo. Solo se exige la de los proveedores que estén en MODELOS.
// ESFUERZO es el reasoning_effort de Groq; PENSAR=1 activa el thinking de Z.ai.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as esperar } from "node:timers/promises";
import { generarDia, PREFIJO_ZAI, ZAI_URL, type DiaGenerado, type Esfuerzo } from "../../src/generar/cadena";
import { sumarDias } from "../../src/fecha";
import { sortearDia } from "../../src/generar/sorteo";
import { SIGNO_POR_SLUG } from "../../src/signos";

const nombre = (slug: string) => SIGNO_POR_SLUG.get(slug)!.nombre;

const esfuerzo = (process.env.ESFUERZO ?? "low") as Esfuerzo;
if (esfuerzo !== "low" && esfuerzo !== "medium") throw new Error(`ESFUERZO debe ser low o medium, no ${esfuerzo}`);
const pensar = process.env.PENSAR === "1";
const modelos = (process.env.MODELOS ?? "openai/gpt-oss-120b").split(",").map((m) => m.trim()).filter(Boolean);
if (!modelos.length) throw new Error("MODELOS está vacío");
const DIAS = Number(process.env.DIAS ?? 3);
if (!Number.isInteger(DIAS) || DIAS < 1) throw new Error(`DIAS debe ser un entero mayor que 0, no ${process.env.DIAS}`);

// Solo dice si falta: la key nunca se imprime
function leerClave(ruta: string, variable: string): string | undefined {
  if (!existsSync(ruta)) return undefined;
  const linea = readFileSync(ruta, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${variable}=`));
  return linea?.slice(variable.length + 1).trim().replace(/^"|"$/g, "") || undefined;
}
const usaZai = modelos.some((m) => m.startsWith(PREFIJO_ZAI));
const usaGroq = modelos.some((m) => !m.startsWith(PREFIJO_ZAI));
const rutaGroq = process.env.ARCHIVO_VARS ?? "../interview-fight-club/.dev.vars";
const rutaZai = fileURLToPath(new URL("../../.dev.vars", import.meta.url));
const groq = usaGroq ? leerClave(rutaGroq, "GROQ_API_KEY") : undefined;
if (usaGroq && !groq) throw new Error(`No hay GROQ_API_KEY en ${rutaGroq}`);
const zai = usaZai ? leerClave(rutaZai, "ZAI_API_KEY") : undefined;
if (usaZai && !zai) throw new Error(`No hay ZAI_API_KEY en ${rutaZai}`);
const claves = { groq: groq ?? "", zai };

console.log(
  `modelos: ${modelos.join(" → ")}` +
    (usaGroq ? ` · reasoning_effort (Groq): ${esfuerzo}` : "") +
    (usaZai ? ` · thinking (Z.ai): ${pensar ? "sí" : "no"}` : ""),
);

// Groq limita a 8K tokens por minuto y cada llamada pide ~4.000 más el tope de salida:
// sin pausa, el segundo día daría 429 y caería al banco sin que se note. Qwen 3.8 tiene
// además un tope de 1.000 tokens de salida por minuto y cada llamada saca ~1.900: PAUSA_S=130
const PAUSA_MS = Number(process.env.PAUSA_S ?? 65) * 1000;

interface Uso {
  proveedor: "groq" | "zai";
  modelo: string;
  entrada?: number;
  salida?: number;
  razonamiento?: number;
  /** Si no se dan los tokens de razonamiento (Qwen, GLM), lo largo del razonamiento en caracteres */
  razonamientoCaracteres?: number;
  /** finish_reason: «length» quiere decir que el tope de salida cortó la respuesta */
  fin?: string;
  tiempoGroq?: number;
  http?: number;
}
let usos: Uso[] = [];

// Si el contenido no es JSON (ni JSON en un bloque de código), generarDia solo apunta
// json_invalido: aquí se enseña el principio y el final para saber qué devolvió el modelo
function avisarSiNoEsJson(contenido: unknown) {
  if (typeof contenido !== "string") return console.log(`   contenido: ${JSON.stringify(contenido)}`);
  const t = contenido.trim().replace(/^```[\w-]*\s*([\s\S]*?)\s*```$/, "$1");
  let datos: unknown;
  try {
    datos = JSON.parse(t);
  } catch {
    return console.log(`   contenido no JSON (${contenido.length} caracteres): ${contenido.slice(0, 300)} … ${contenido.slice(-120)}`);
  }
  // Con signos_repetidos, generarDia tira la respuesta sin decir cuáles: se apuntan aquí
  const lista = (datos as { profecias?: unknown } | null)?.profecias;
  if (!Array.isArray(lista)) return;
  const cuenta = new Map<string, number>();
  for (const p of lista) {
    const signo = String((p as { signo?: unknown } | null)?.signo);
    cuenta.set(signo, (cuenta.get(signo) ?? 0) + 1);
  }
  const repetidos = [...cuenta].filter(([, n]) => n > 1).map(([s, n]) => `${s}×${n}`);
  if (lista.length !== 12 || repetidos.length) {
    console.log(`   ${lista.length} elementos · signos: ${[...cuenta.keys()].join(", ")}` + (repetidos.length ? ` · repetidos: ${repetidos.join(", ")}` : ""));
  }
}

// Envoltorio de fetch solo para medir: uso de tokens, cabeceras de cupo y, si el proveedor
// rechaza la petición, el cuerpo del error (generarDia solo guarda el código)
const fetchReal = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const r = await fetchReal(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const proveedor = url === ZAI_URL ? "zai" : "groq";
  const copia = r.clone();
  const modelo = String(JSON.parse(String(init?.body ?? "{}")).model ?? "?");
  if (!r.ok) {
    usos.push({ proveedor, modelo, http: r.status });
    console.log(`   [${proveedor}] ${modelo} HTTP ${r.status}: ${(await copia.text()).slice(0, 600)}`);
    return r;
  }
  const cuerpo = (await copia.json()) as {
    usage?: Record<string, unknown>;
    choices?: { finish_reason?: string; message?: { content?: unknown; reasoning?: string; reasoning_content?: string } }[];
  };
  const u = cuerpo.usage ?? {};
  const eleccion = cuerpo.choices?.[0];
  const razonamiento = (u.completion_tokens_details as { reasoning_tokens?: number } | undefined)?.reasoning_tokens;
  // Groq devuelve el razonamiento en reasoning; Z.ai, en reasoning_content
  const textoRazonado = eleccion?.message?.reasoning ?? eleccion?.message?.reasoning_content;
  const uso: Uso = {
    proveedor,
    modelo,
    entrada: u.prompt_tokens as number,
    salida: u.completion_tokens as number,
    razonamiento,
    razonamientoCaracteres: textoRazonado === undefined ? undefined : [...textoRazonado].length,
    fin: eleccion?.finish_reason,
    tiempoGroq: u.total_time as number | undefined,
  };
  usos.push(uso);
  console.log(
    `   [${proveedor}] ${modelo} · entrada ${uso.entrada} · salida ${uso.salida}` +
      (razonamiento === undefined ? "" : ` (razonamiento ${razonamiento})`) +
      (uso.razonamientoCaracteres === undefined ? "" : ` · razonamiento devuelto: ${uso.razonamientoCaracteres} caracteres`) +
      ` · total ${u.total_tokens} · fin ${uso.fin ?? "?"}` +
      (proveedor === "groq"
        ? ` · tiempo Groq ${u.total_time ?? "?"} s · cola ${u.queue_time ?? "?"} s` +
          ` · cupo restante/min ${r.headers.get("x-ratelimit-remaining-tokens") ?? "?"}` +
          ` · peticiones restantes/día ${r.headers.get("x-ratelimit-remaining-requests") ?? "?"}`
        : ""),
  );
  avisarSiNoEsJson(eleccion?.message?.content);
  return r;
}) as typeof fetch;

const inicio = process.argv[2] ?? "2026-11-13";
const historial = new Map<string, string[]>();
const dias: (DiaGenerado & { fecha: string; ms: number; usos: Uso[]; ganchos: Record<string, string> })[] = [];
for (let i = 0; i < DIAS; i++) {
  if (i > 0) await esperar(PAUSA_MS);
  const fecha = sumarDias(inicio, i);
  const t0 = Date.now();
  usos = [];
  const g = await generarDia(fecha, { claves, modelos, historial, esfuerzo, pensar });
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
// Sin las keys: solo lo que devolvió generarDia y el uso medido, para preparar la revisión del tono
if (process.env.GUARDAR_JSON) writeFileSync(process.env.GUARDAR_JSON, JSON.stringify({ esfuerzo, pensar, modelos, dias }, null, 2));
