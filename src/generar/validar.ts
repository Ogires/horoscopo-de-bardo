// src/generar/validar.ts — la salida del LLM no se publica sin pasar por aquí (LLM05)
import { SLUGS } from "../signos";

export const LIMITES = { texto: [80, 180], evita: [8, 60], matiz: [3, 40] } as const;

// Raíces vetadas: palabrotas, odio, autolesiones, despidos, religión y política
const VETADAS = [
  "mierda", "joder", "jodid\\p{L}*", "co[ñn]o", "put[ao]s?", "cabr[oó]n\\p{L}*", "gilipollas",
  "imb[eé]cil\\p{L}*", "idiotas?", "subnormal\\p{L}*", "retrasad[oa]s?", "maric[oó]n\\p{L}*",
  "nazi\\p{L}*", "hitler", "suicid\\p{L}*", "violaci[oó]n\\p{L}*", "violar", "c[aá]ncer",
  "despid\\p{L}*", "despedi\\p{L}*", "dios", "jes[uú]s", "gobierno\\p{L}*", "elecciones",
];
// Lección 7: \b trata las letras con tilde como separadores; lookarounds Unicode
const RE_VETADA = new RegExp(`(?<![\\p{L}\\p{N}])(?:${VETADAS.join("|")})(?![\\p{L}\\p{N}])`, "iu");
const RE_ENLACE = /https?:\/\/|www\.|@[\p{L}\p{N}_]|(?<![\p{L}\p{N}])[\p{L}\p{N}-]+\.(?:com|es|io|dev|org|net|fyi|app)(?![\p{L}\p{N}])/iu;
const RE_EMOJI = /\p{Extended_Pictographic}/u;
// Una palabra española pegada a la siguiente (visto con GLM-5.3: «conCredentials», «elmaintenance»).
// Con mayúscula, solo tras artículos y preposiciones en minúscula: hashCode, isNaN o noEmitOnError
// no empiezan por ninguno. En minúscula, solo «el» y consonante, que no empieza ninguna palabra
// española salvo ell- y elf-; else, elsif, elm, elk y elt son inglesas
const RE_PEGADA = new RegExp(
  "(?<![\\p{L}\\p{N}_])(?:" +
    "(?:el|la|los|las|un|una|unos|unas|al|del|de|con|en|por|para|que|sin)\\p{Lu}\\p{Ll}" +
    "|el(?!se|sif|[mkt](?![\\p{L}\\p{N}]))[b-dg-hj-kmnñp-tv-z]" +
    ")",
  "u",
);

export interface Candidata {
  texto: string;
  evita: string;
  compatible: { signo: string; matiz: string };
}

const largo = (s: string, [min, max]: readonly [number, number]) => {
  const n = [...s.trim()].length;
  return n >= min && n <= max;
};

export function motivoInvalida(p: Candidata, signo: string): string | null {
  if (!largo(p.texto, LIMITES.texto)) return "longitud_texto";
  // Un texto sin signo de cierre llegó cortado (visto con GLM-5.3: «…más que elmaintenance»)
  if (!/[.!?…»"]$/u.test(p.texto.trim())) return "texto_cortado";
  if (!largo(p.evita, LIMITES.evita)) return "longitud_evita";
  if (!largo(p.compatible.matiz, LIMITES.matiz)) return "longitud_matiz";
  // Se lee tras la etiqueta «Evita:», así que «no confíes…» diría lo contrario
  if (/^no\s/iu.test(p.evita.trim())) return "evita_negada";
  if (!SLUGS.has(p.compatible.signo) || p.compatible.signo === signo) return "compatible";
  const todo = `${p.texto} ${p.evita} ${p.compatible.matiz}`;
  if (RE_VETADA.test(todo)) return "vetada";
  if (RE_ENLACE.test(todo)) return "enlace";
  if (RE_EMOJI.test(todo)) return "emoji";
  if (RE_PEGADA.test(todo)) return "pegada";
  return null;
}

export function sextetos(texto: string): string[] {
  const palabras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const r: string[] = [];
  for (let i = 0; i + 6 <= palabras.length; i++) r.push(palabras.slice(i, i + 6).join(" "));
  return r;
}

// Un solo Set con los sextetos de 14 días de todos los signos y del banco: muy por debajo de los 10 ms de CPU del cron
export const repite = (texto: string, previos: Set<string>): boolean => sextetos(texto).some((s) => previos.has(s));
