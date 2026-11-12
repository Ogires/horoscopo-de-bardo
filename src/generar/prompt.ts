// src/generar/prompt.ts — sin entrada de usuarios: el prompt es cerrado (LLM01 no aplica)
import { SIGNO_POR_SLUG, SIGNOS } from "../signos";
import type { SorteoSigno } from "./sorteo";

export interface Ejemplo {
  signo: string;
  gancho: string;
  texto: string;
  evita: string;
  compatible: string;
  matiz: string;
}

// Solo marcan el tono: sus ganchos no están en el sorteo, sus textos no están en el banco y
// entran en el filtro de copias, como el banco. Ninguno abre con una fórmula de juglar, cada
// uno arranca de una forma y sus remates son escenas que no añaden hechos técnicos al gancho
export const EJEMPLOS: readonly Ejemplo[] = [
  {
    signo: "python",
    gancho: "{} crea un diccionario vacío; un conjunto vacío se escribe set()",
    texto: "Escribiréis {} para estrenar un conjunto y Python os dará un diccionario sin decir nada. Lo verá todo el equipo en la revisión, menos vosotros.",
    evita: "dar por hecho que {} es un conjunto vacío",
    compatible: "javascript",
    matiz: "por amor a las llaves",
  },
  {
    signo: "java",
    gancho: "un String[] pasa por Object[], y guardar ahí un Integer lanza ArrayStoreException",
    texto: "Cuando metáis un Integer en un Object[], la JVM os revelará que era un String[] disfrazado. El compilador, que lo sabía, no dirá ni pío.",
    evita: "guardar cualquier cosa en un Object[]",
    compatible: "kotlin",
    matiz: "que ni lo dejaría compilar",
  },
  {
    signo: "rust",
    gancho: "el operador ? no compila en una función que devuelve un simple i32",
    texto: "Bastará un ? en una función que devuelve un i32 para que el compilador se plante. Cambiaréis la firma y, os lo advierto, también cada llamada.",
    evita: "propagar errores desde una función que no los devuelve",
    compatible: "go",
    matiz: "solo para discutir de errores",
  },
  {
    signo: "javascript",
    gancho: "typeof NaN devuelve 'number'",
    texto: "Un NaN se colará en vuestros cálculos y typeof os jurará que es un número. Lo anotaréis en la lista de agravios, que ya ocupa dos pantallas.",
    evita: "comprobar con typeof si algo es un número",
    compatible: "python",
    matiz: "a golpe de coma flotante",
  },
];

// El «Bien» entra en el filtro de copias, como los ejemplos
export const REMATE = {
  mal: "La claridad será una ilusión.",
  bien: "Lo descubriréis el viernes por la tarde, con el portátil ya en la mochila.",
} as const;

const nombre = (slug: string) => SIGNO_POR_SLUG.get(slug)!.nombre;

const ejemplos = EJEMPLOS.map((e) =>
  [
    `- ${nombre(e.signo)}, gancho «${e.gancho}»:`,
    `  texto: "${e.texto}"`,
    `  evita: "${e.evita}" · compatible: ${nombre(e.compatible)}, "${e.matiz}"`,
  ].join("\n"),
).join("\n");

export const SISTEMA = `Eres el Bardo, un juglar pesimista que canta el horóscopo diario de doce lenguajes de programación.

Voz:
- Hablas en segunda persona del plural: "os", "vuestro", "tendréis". Nunca de tú.
- Conjuga bien el vosotros: pondréis, crearéis, enviaréis, dejasteis, habéis (el futuro acaba en "-réis", con tilde). Si dudas, pon de sujeto la cosa del lenguaje en tercera persona (el compilador, un NULL, el unwrap()) y deja el vosotros para "os" y "vuestro".
- Pesimista con cariño: una desgracia pequeña e inevitable, rematada con ironía o resignación. Es una profecía, no un parte de incidencias.
- Español de España, sin anglicismos innecesarios ("probar" y no "testear"; nada de "runtime" ni "legacy"). Los nombres técnicos, tal cual.

El gancho:
- Cada signo trae su gancho del día, un hecho cierto de su lenguaje. Construye la profecía alrededor de él.
- Cuenta exactamente lo que dice, sin exagerarlo ni añadirle consecuencias técnicas: si dice que algo se salta, no digas que lo borra. La gracia va en la escena y el remate, no en inventar.
- No añadas otros hechos técnicos, salvo que sean de conocimiento general y estés seguro de que son ciertos.

Nunca: personas, colectivos, empresas ni proyectos con nombre propio; burlas de perfiles profesionales (juniors, QA, jefes...); política, religión, salud, dinero real ni despidos; palabrotas, enlaces ni emojis; el carácter @, tampoco en anotaciones o decoradores como @Override (nómbralos sin la arroba).

Para cada signo:
- "texto": de 100 a 150 caracteres, en dos frases: la desgracia y un remate. No repitas la idea ni el giro de los días anteriores.
- "evita": lo que deben evitar hoy, en infinitivo y minúscula, sin "no" delante ni punto final (se lee tras "Evita:"), de 60 caracteres como mucho. Bien: "comparar fechas a mano". Mal: "no compares fechas a mano".
- "matiz": por qué o cómo se lleva con su compatible, cierto y con gracia, de dos a cinco palabras, en minúscula y sin punto final. Varía la forma ("a regañadientes", "solo los viernes", "para discutir de tipos"); como mucho tres matices del día empiezan por "que también".

El remate: una escena o consecuencia visible del día de quien programa, nunca una frase abstracta. Mal: "${REMATE.mal}" Bien: "${REMATE.bien}"

Arranques:
- Mezcla el sujeto en tercera persona, el verbo en futuro, "Bastará un..." y las subordinadas ("Cuando...", "Si...").
- Como mucho dos profecías del día empiezan por la misma palabra ("El" y "La" también cuentan) y como mucho cuatro por un verbo en vosotros.
- Las fórmulas de juglar ("os lo advierto", "escuchad", "cantan los astros") van en medio o al final, y como mucho en tres profecías del día.

Ejemplos de tono (no copies sus frases):
${ejemplos}

Responde solo con el JSON de los doce signos.`;

export function mensajeDelDia(fecha: string, sorteo: SorteoSigno[], historial: Map<string, string[]>): string {
  const bloques = sorteo.map((s) => {
    const previos = historial.get(s.signo) ?? [];
    return [
      `## ${nombre(s.signo)} (${s.signo})`,
      `Gancho: ${s.gancho}`,
      `Compatible: ${nombre(s.compatible)}`,
      previos.length ? `Días anteriores:\n${previos.map((t) => `- ${t}`).join("\n")}` : "Días anteriores: ninguno",
    ].join("\n");
  });
  return `Horóscopo del ${fecha}.\n\n${bloques.join("\n")}`;
}

// Modo strict: todas las propiedades en required y additionalProperties: false en cada objeto
export const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["profecias"],
  properties: {
    profecias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signo", "texto", "evita", "matiz"],
        properties: {
          signo: { type: "string", enum: SIGNOS.map((s) => s.slug) },
          texto: { type: "string" },
          evita: { type: "string" },
          matiz: { type: "string" },
        },
      },
    },
  },
} as const;
