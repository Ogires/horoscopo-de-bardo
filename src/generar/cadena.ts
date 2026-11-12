// src/generar/cadena.ts — gpt-oss-120b → gpt-oss-20b → banco
import type { Profecia } from "../tipos";
import { matizDeReserva, profeciaDelBanco, TEXTOS_DEL_BANCO } from "./banco";
import { EJEMPLOS, ESQUEMA, mensajeDelDia, REMATE, SISTEMA } from "./prompt";
import { sortearDia } from "./sorteo";
import { motivoInvalida, repite, sextetos } from "./validar";

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_MALAS = 3;

interface RespuestaIa {
  signo: string;
  texto: string;
  evita: string;
  matiz: string;
}

export interface DepsGeneracion {
  apiKey: string;
  modelos: string[];
  /** Textos de los últimos 14 días por signo, del más reciente al más antiguo */
  historial: Map<string, string[]>;
  /** reasoning_effort de Groq; por defecto "low" */
  esfuerzo?: Esfuerzo;
}

export type Esfuerzo = "low" | "medium";
const TOPE_SALIDA: Record<Esfuerzo, number> = { low: 3500, medium: 5000 };

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
    // No se sabe cuánto razona con low: el tope de medium, que con ~2.600 de entrada cabe en 8K/min
    return { strict: true, tope: TOPE_SALIDA.medium, razonamiento: { reasoning_effort: esfuerzo, reasoning_format: "parsed" } };
  }
  return { strict: false, tope: TOPE_SALIDA[esfuerzo], razonamiento: {} };
}

async function pedirAGroq(
  apiKey: string,
  modelo: string,
  usuario: string,
  esfuerzo: Esfuerzo,
): Promise<{ profecias: RespuestaIa[]; tokens: number }> {
  const o = opcionesDelModelo(modelo, esfuerzo);
  const r = await fetch(GROQ_URL, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: SISTEMA },
        { role: "user", content: usuario },
      ],
      // Entrada ~2.600 + tope: por debajo de los 8K tokens/minuto de Groq. Con medium, el
      // razonamiento pasó de 3.200 tokens y con 3.500 el JSON llegaba vacío o cortado
      max_tokens: o.tope,
      temperature: 0.9,
      ...o.razonamiento,
      response_format: { type: "json_schema", json_schema: { name: "horoscopo", strict: o.strict, schema: ESQUEMA } },
    }),
  });
  if (!r.ok) throw new Error(`groq_${r.status}`);
  const cuerpo = await r.json<{ choices: { message: { content: string } }[]; usage?: { total_tokens?: number } }>();
  const { profecias } = JSON.parse(cuerpo.choices[0].message.content) as { profecias: RespuestaIa[] };
  const signos = profecias.map((p) => p.signo);
  if (new Set(signos).size !== signos.length) throw new Error("signos_repetidos");
  return { profecias, tokens: cuerpo.usage?.total_tokens ?? 0 };
}

export async function generarDia(fecha: string, deps: DepsGeneracion): Promise<DiaGenerado> {
  const sorteo = sortearDia(fecha);
  // Filtro de copias global: los 14 días de todos los signos, el banco entero y los ejemplos del prompt
  const textos = [...[...deps.historial.values()].flat(), ...TEXTOS_DEL_BANCO, ...EJEMPLOS.map((e) => e.texto), REMATE.bien];
  const previos = new Set(textos.flatMap(sextetos));
  const recientes = new Map([...deps.historial].map(([signo, textos]) => [signo, textos.slice(0, 3)]));
  const usuario = mensajeDelDia(fecha, sorteo, recientes);
  const fallos: string[] = [];
  const descartadas: Descartada[] = [];
  let tokens = 0;

  for (const modelo of deps.modelos) {
    try {
      const r = await pedirAGroq(deps.apiKey, modelo, usuario, deps.esfuerzo ?? "low");
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
