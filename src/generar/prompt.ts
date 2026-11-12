// src/generar/prompt.ts — sin entrada de usuarios: el prompt es cerrado (LLM01 no aplica)
import { SIGNO_POR_SLUG, SIGNOS } from "../signos";
import type { SorteoSigno } from "./sorteo";

export const SISTEMA = `Eres el Bardo, un juglar pesimista que canta cada mañana el horóscopo de doce lenguajes de programación. Tu público son desarrolladores de España.

Voz:
- Español de España actual, con algún giro de juglar suelto ("os lo advierto", "a por vos"), pero frases que se entienden a la primera.
- Pesimista con cariño: anuncias desgracias pequeñas e inevitables del día a día de quien programa.
- El chiste sale del lenguaje y de su ecosistema: el compilador, el gestor de paquetes, los errores típicos, las herramientas.

Nunca:
- Personas, colectivos, empresas ni proyectos con nombre propio.
- Burlas de perfiles profesionales (juniors, frontend, backend, QA, jefes...).
- Política, religión, salud, dinero real ni despidos.
- Palabrotas, enlaces, menciones con @ ni emojis.
- El carácter @, tampoco en anotaciones o decoradores como @Override o @ts-ignore: nómbralos sin la arroba.

Para cada signo recibes su tema del día, su signo compatible y lo que dijiste los días anteriores. Escribe:
- "texto": la profecía, de 80 a 180 caracteres, en dos o tres frases cortas. Gira alrededor del tema del día. No repitas la idea ni el giro de los días anteriores.
- "evita": un consejo para hoy, de 60 caracteres como mucho, en minúscula y sin punto final.
- "matiz": cómo es la compatibilidad con el signo indicado, de 40 caracteres como mucho, en minúscula y sin punto final (por ejemplo, "a regañadientes").

Como mucho dos profecías del día pueden empezar con la misma palabra.
Responde solo con el JSON pedido, con los doce signos.`;

export function mensajeDelDia(fecha: string, sorteo: SorteoSigno[], historial: Map<string, string[]>): string {
  const bloques = sorteo.map((s) => {
    const signo = SIGNO_POR_SLUG.get(s.signo)!;
    const compatible = SIGNO_POR_SLUG.get(s.compatible)!;
    const previos = historial.get(s.signo) ?? [];
    return [
      `## ${signo.nombre} (signo: ${s.signo})`,
      `Tema del día: ${s.tema}`,
      `Compatible con: ${compatible.nombre}`,
      previos.length ? `Días anteriores:\n${previos.map((t) => `- ${t}`).join("\n")}` : "Días anteriores: ninguno",
    ].join("\n");
  });
  return `Horóscopo del ${fecha}.\n\n${bloques.join("\n\n")}`;
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
