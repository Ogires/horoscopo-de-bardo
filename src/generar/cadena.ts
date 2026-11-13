// src/generar/cadena.ts — los modelos de la cadena, en orden (Groq, o Z.ai con el prefijo zai:) → banco
import { SLUGS } from "../signos";
import type { Profecia } from "../tipos";
import { matizDeReserva, profeciaDelBanco, TEXTOS_DEL_BANCO } from "./banco";
import { ESQUEMA, mensajeDelDia, SISTEMA } from "./prompt";
import { sortearDia } from "./sorteo";
import { motivoInvalida, repite, sextetos } from "./validar";

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// La API general. La del plan de programación (/api/coding/paas/v4) solo se puede usar en las
// herramientas de programación que admite Z.ai
export const ZAI_URL = "https://api.z.ai/api/paas/v4/chat/completions";
/** Un id de modelo con este prefijo va a Z.ai, sin el prefijo; el resto, a Groq */
export const PREFIJO_ZAI = "zai:";
// Fuera de los 8K tokens/minuto de Groq. Con thinking, el razonamiento sale del mismo tope: con 4.096,
// GLM-4.7-Flash se los gastó enteros razonando dos días de tres y el JSON llegó vacío (fin length)
export const TOPE_SALIDA_ZAI = { sinPensar: 4096, pensando: 16384 } as const;
const MAX_MALAS = 3;

interface RespuestaIa {
  signo: string;
  texto: string;
  evita: string;
  matiz: string;
}

export interface Claves {
  groq: string;
  /** Sin ella, los modelos zai: fallan sin llamar y la cadena sigue */
  zai?: string;
}

export interface DepsGeneracion {
  /** La key de cada proveedor */
  claves: Claves;
  /** En orden; los ids salen de vars, porque los modelos caducan */
  modelos: string[];
  /** Textos de los últimos 14 días por signo, del más reciente al más antiguo */
  historial: Map<string, string[]>;
  /** reasoning_effort de Groq; por defecto "low" */
  esfuerzo?: Esfuerzo;
  /** thinking de Z.ai; por defecto false */
  pensar?: boolean;
}

export type Esfuerzo = "low" | "medium";
// Con ~4.200 de entrada el tercer día, low (3.500) cabe en los 8K tokens/minuto de Groq; medium y
// Qwen (5.000) se midieron con la entrada de la iteración 4 (~2.600) y ya no caben: están por decidir
export const TOPE_SALIDA: Record<Esfuerzo, number> = { low: 3500, medium: 5000 };

export interface Descartada {
  modelo: string;
  signo: string;
  texto: string;
  evita: string;
  matiz: string;
  /**
   * El de la validación; «matiz_reserva» si solo se tiró el matiz (la profecía se publica con uno
   * de la lista), o «modelo_descartado» si era válida pero se tiró la respuesta entera
   */
  motivo: string;
}

export interface DiaGenerado {
  profecias: Profecia[];
  modelo: string | null;
  fallos: string[];
  /** Lo que propuso la IA y no pasó la validación, para revisar el prompt */
  descartadas: Descartada[];
  tokens: number;
}

interface OpcionesModelo {
  strict: boolean;
  tope: number;
  razonamiento: Record<string, string>;
}

// Lo que admite cada modelo según la documentación de Groq (reasoning y structured outputs):
// strict, solo gpt-oss y Qwen 3.8; reasoning_format no existe en gpt-oss, y en Qwen, con
// json_schema, no puede ser raw (el razonamiento iría dentro del contenido): parsed lo saca aparte
function opcionesDelModelo(modelo: string, esfuerzo: Esfuerzo): OpcionesModelo {
  if (modelo.startsWith("openai/gpt-oss-")) {
    return { strict: true, tope: TOPE_SALIDA[esfuerzo], razonamiento: { reasoning_effort: esfuerzo } };
  }
  if (modelo === "qwen/qwen3.8-27b") {
    // No se sabe cuánto razona con low: el tope de medium (ver TOPE_SALIDA)
    return { strict: true, tope: TOPE_SALIDA.medium, razonamiento: { reasoning_effort: esfuerzo, reasoning_format: "parsed" } };
  }
  return { strict: false, tope: TOPE_SALIDA[esfuerzo], razonamiento: {} };
}

const CAMPOS = ["signo", "texto", "evita", "matiz"] as const;
// Un bloque de código Markdown alrededor del JSON, que algunos modelos ponen aunque estén en modo JSON
const RE_BLOQUE = /^```[\w-]*\s*([\s\S]*?)\s*```$/;

// Z.ai no impone el esquema, así que la forma se comprueba aquí (con Groq y strict, ya la cumple).
// Sin JSON legible o sin array de profecías, falla el modelo y la cadena sigue; un elemento sin los
// cuatro campos de texto o con un signo que no es de los doce se ignora, y su signo cuenta como falta
function leerProfecias(contenido: unknown): RespuestaIa[] {
  if (typeof contenido !== "string") throw new Error("json_invalido");
  const bloque = RE_BLOQUE.exec(contenido.trim());
  let datos: unknown;
  try {
    datos = JSON.parse(bloque ? bloque[1] : contenido);
  } catch {
    throw new Error("json_invalido");
  }
  const lista = (datos as { profecias?: unknown } | null)?.profecias;
  if (!Array.isArray(lista)) throw new Error("sin_profecias");
  return lista.filter(
    (p): p is RespuestaIa =>
      typeof p === "object" &&
      p !== null &&
      CAMPOS.every((c) => typeof (p as Record<string, unknown>)[c] === "string") &&
      SLUGS.has((p as RespuestaIa).signo),
  );
}

interface Peticion {
  proveedor: "groq" | "zai";
  url: string;
  clave: string | undefined;
  /** Milisegundos; el cron no cuenta la espera de red como CPU */
  espera: number;
  cuerpo: Record<string, unknown>;
}

function peticionDelModelo(modelo: string, usuario: string, deps: DepsGeneracion): Peticion {
  const messages = [
    { role: "system", content: SISTEMA },
    { role: "user", content: usuario },
  ];
  if (modelo.startsWith(PREFIJO_ZAI)) {
    return {
      proveedor: "zai",
      url: ZAI_URL,
      clave: deps.claves.zai,
      // El modelo gratuito de Z.ai es más lento que Groq (~60 tokens/s razonando): con el tope de
      // pensar caben ~4,5 minutos. El cron tiene 15 minutos de reloj y no cuenta la espera como CPU
      espera: deps.pensar ? 420_000 : 120_000,
      cuerpo: {
        model: modelo.slice(PREFIJO_ZAI.length),
        messages,
        max_tokens: deps.pensar ? TOPE_SALIDA_ZAI.pensando : TOPE_SALIDA_ZAI.sinPensar,
        temperature: 0.9,
        thinking: { type: deps.pensar ? "enabled" : "disabled" },
        // GLM-5.3 siempre razona y por defecto en "max": con pensar se pide el ligero
        ...(deps.pensar ? { reasoning_effort: "low" } : {}),
        // Z.ai solo tiene modo JSON, sin esquema: la forma va descrita al final de SISTEMA
        response_format: { type: "json_object" },
      },
    };
  }
  const o = opcionesDelModelo(modelo, deps.esfuerzo ?? "low");
  return {
    proveedor: "groq",
    url: GROQ_URL,
    clave: deps.claves.groq,
    espera: 60_000,
    cuerpo: {
      model: modelo,
      messages,
      // Entrada ~4.200 + tope de low: por debajo de los 8K tokens/minuto de Groq. Con medium, el
      // razonamiento pasó de 3.200 tokens y con 3.500 el JSON llegaba vacío o cortado
      max_tokens: o.tope,
      temperature: 0.9,
      ...o.razonamiento,
      response_format: { type: "json_schema", json_schema: { name: "horoscopo", strict: o.strict, schema: ESQUEMA } },
    },
  };
}

async function pedirALaIa(p: Peticion): Promise<{ profecias: RespuestaIa[]; tokens: number }> {
  if (!p.clave) throw new Error(`${p.proveedor}_sin_clave`);
  const r = await fetch(p.url, {
    method: "POST",
    signal: AbortSignal.timeout(p.espera),
    headers: { authorization: `Bearer ${p.clave}`, "content-type": "application/json" },
    body: JSON.stringify(p.cuerpo),
  });
  if (!r.ok) throw new Error(`${p.proveedor}_${r.status}`);
  const cuerpo = await r.json<{ choices?: { message?: { content?: unknown } }[]; usage?: { total_tokens?: number } }>();
  const profecias = leerProfecias(cuerpo.choices?.[0]?.message?.content);
  const signos = profecias.map((p) => p.signo);
  if (new Set(signos).size !== signos.length) throw new Error("signos_repetidos");
  return { profecias, tokens: cuerpo.usage?.total_tokens ?? 0 };
}

export async function generarDia(fecha: string, deps: DepsGeneracion): Promise<DiaGenerado> {
  const sorteo = sortearDia(fecha);
  // Filtro de copias global: los 14 días de todos los signos y el banco entero, del que salen los
  // ejemplos del prompt
  const textos = [...[...deps.historial.values()].flat(), ...TEXTOS_DEL_BANCO];
  const previos = new Set(textos.flatMap(sextetos));
  const recientes = new Map([...deps.historial].map(([signo, textos]) => [signo, textos.slice(0, 3)]));
  const usuario = mensajeDelDia(fecha, sorteo, recientes);
  const fallos: string[] = [];
  const descartadas: Descartada[] = [];
  let tokens = 0;

  for (const modelo of deps.modelos) {
    try {
      const r = await pedirALaIa(peticionDelModelo(modelo, usuario, deps));
      tokens += r.tokens;
      const porSigno = new Map(r.profecias.map((p) => [p.signo, p]));
      // Más lo que ya se ha aceptado hoy; empieza de cero con cada modelo
      const vistos = new Set(previos);
      let malas = 0;
      const descartar = (signo: string, c: { texto: string; evita: string; compatible: { matiz: string } }, motivo: string) =>
        descartadas.push({ modelo, signo, texto: c.texto, evita: c.evita, matiz: c.compatible.matiz, motivo });
      const profecias = sorteo.map((s): Profecia => {
        const p = porSigno.get(s.signo);
        if (!p) {
          malas++;
          fallos.push(`${modelo}:${s.signo}:falta`);
          return profeciaDelBanco(fecha, s);
        }
        const propuesta = { texto: p.texto.trim(), evita: p.evita.trim(), compatible: { signo: s.compatible, matiz: p.matiz.trim() } };
        let candidata = propuesta;
        let motivo = motivoInvalida(propuesta, s.signo);
        // El modelo no cuenta caracteres: si lo único que falla es el largo del matiz, se cambia
        // por uno de la lista y se vuelve a validar lo demás
        if (motivo === "longitud_matiz") {
          candidata = { ...propuesta, compatible: { ...propuesta.compatible, matiz: matizDeReserva(fecha, s.signo) } };
          motivo = motivoInvalida(candidata, s.signo);
        }
        motivo ??= repite(candidata.texto, vistos) ? "repetida" : null;
        if (motivo) {
          malas++;
          fallos.push(`${modelo}:${s.signo}:${motivo}`);
          descartar(s.signo, propuesta, motivo);
          return profeciaDelBanco(fecha, s);
        }
        if (candidata !== propuesta) {
          fallos.push(`${modelo}:${s.signo}:matiz_reserva`);
          descartar(s.signo, propuesta, "matiz_reserva");
        }
        for (const sexteto of sextetos(candidata.texto)) vistos.add(sexteto);
        return { signo: s.signo, ...candidata, puerto: s.puerto, origen: "ia" };
      });
      if (malas <= MAX_MALAS) return { profecias, modelo, fallos, descartadas, tokens };
      fallos.push(`${modelo}:demasiadas_invalidas`);
      // También lo válido de esta respuesta se tira: que se vea, para revisar el prompt
      for (const p of profecias) if (p.origen === "ia") descartar(p.signo, p, "modelo_descartado");
    } catch (e) {
      fallos.push(`${modelo}:${String(e).slice(0, 80)}`);
    }
  }
  return { profecias: sorteo.map((s) => profeciaDelBanco(fecha, s)), modelo: null, fallos, descartadas, tokens };
}
