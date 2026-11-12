// src/generar/cadena.ts — gpt-oss-120b → gpt-oss-20b → banco
import type { Profecia } from "../tipos";
import { profeciaDelBanco, TEXTOS_DEL_BANCO } from "./banco";
import { EJEMPLOS, ESQUEMA, mensajeDelDia, SISTEMA } from "./prompt";
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
  signo: string;
  texto: string;
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

async function pedirAGroq(
  apiKey: string,
  modelo: string,
  usuario: string,
  esfuerzo: Esfuerzo,
): Promise<{ profecias: RespuestaIa[]; tokens: number }> {
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
      // Entrada ~2.500 + tope: por debajo de los 8K tokens/minuto de Groq. Con medium, el
      // razonamiento pasó de 3.200 tokens y con 3.500 el JSON llegaba vacío o cortado
      max_tokens: TOPE_SALIDA[esfuerzo],
      temperature: 0.9,
      reasoning_effort: esfuerzo,
      response_format: { type: "json_schema", json_schema: { name: "horoscopo", strict: true, schema: ESQUEMA } },
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
  const textos = [...[...deps.historial.values()].flat(), ...TEXTOS_DEL_BANCO, ...EJEMPLOS.map((e) => e.texto)];
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
      const profecias = sorteo.map((s): Profecia => {
        const p = porSigno.get(s.signo);
        const candidata = p && { texto: p.texto.trim(), evita: p.evita.trim(), compatible: { signo: s.compatible, matiz: p.matiz.trim() } };
        const motivo = !candidata
          ? "falta"
          : motivoInvalida(candidata, s.signo) ?? (repite(candidata.texto, vistos) ? "repetida" : null);
        if (!candidata || motivo) {
          malas++;
          fallos.push(`${modelo}:${s.signo}:${motivo}`);
          if (candidata && motivo) descartadas.push({ signo: s.signo, texto: candidata.texto, motivo });
          return profeciaDelBanco(fecha, s);
        }
        for (const sexteto of sextetos(candidata.texto)) vistos.add(sexteto);
        return { signo: s.signo, ...candidata, puerto: s.puerto, origen: "ia" };
      });
      if (malas <= MAX_MALAS) return { profecias, modelo, fallos, descartadas, tokens };
      fallos.push(`${modelo}:demasiadas_invalidas`);
    } catch (e) {
      fallos.push(`${modelo}:${String(e).slice(0, 80)}`);
    }
  }
  return { profecias: sorteo.map((s) => profeciaDelBanco(fecha, s)), modelo: null, fallos, descartadas, tokens };
}
