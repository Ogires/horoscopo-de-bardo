// src/generar/prompt.ts — sin entrada de usuarios: el prompt es cerrado (LLM01 no aplica)
import { SIGNO_POR_SLUG, SIGNOS } from "../signos";
import { BANCO, type EntradaBanco } from "./banco";
import { hash32, type SorteoSigno } from "./sorteo";

export interface EjemploDelDia extends EntradaBanco {
  signo: string;
}

// Profecías del banco que cuentan lo mismo que un gancho: el día de ese gancho no salen de
// ejemplo, porque el modelo las parafrasearía y el filtro de copias no ve paráfrasis
export const MISMA_IDEA: Readonly<Record<string, readonly string[]>> = {
  "unwrap() sobre un None hace entrar en pánico al programa": ["Un unwrap() que dejasteis"],
  "[10, 9, 1].sort() ordena los números como si fueran texto: 1, 10, 9": ["Os lo advierto: [10, 9, 1].sort()"],
  "forEach no espera a las funciones async que se le pasan": ["Una promesa se quedará sin su await"],
  "mezclar tabuladores y espacios en la sangría da TabError": ["Hoy un espacio de más"],
  "lista.sort() ordena en el sitio y devuelve None": ["A media tarde aparecerá 'NoneType'"],
  "== entre dos Integer da true con 127 y false con 128, por la caché de valores": ["Compararéis dos cadenas con =="],
  "una consulta LINQ no se ejecuta hasta que alguien la recorre": ["Escribiréis una consulta LINQ"],
  "un evento sin suscriptores vale null, e invocarlo sin ?. lanza NullReferenceException": ["Un NullReferenceException brotará"],
  "una variable declarada y sin usar es un error de compilación": ["Un import que no usáis"],
  "si todas las goroutines esperan a la vez, el runtime aborta con un deadlock": ["Las goroutines que lanzasteis"],
  "strpos devuelve 0 si el texto está al principio, y 0 se evalúa como false": ["Hoy strpos devolverá 0"],
  "array_merge renumera las claves numéricas; el operador + las conserva": ["Un array será hoy lista"],
  "MOVE a un campo numérico más corto pierde los dígitos de la izquierda sin avisar": ["Un campo PIC 9(5)V99"],
  "sin ROUNDED, COMPUTE trunca los decimales que no caben en el campo": ["Un campo PIC 9(5)V99"],
  "JSON.parse devuelve any: lo que salga de ahí no lo comprueba nadie": ["Un any se colará", "Vuestros tipos jurarán"],
  "NULL = NULL no es verdadero: hay que usar IS NULL": ["NULL no será igual a NULL"],
  "lateinit no se puede usar con Int ni con los demás tipos primitivos": ["Un lateinit prometerá"],
  "fromJust sobre un Nothing revienta en tiempo de ejecución": ["Un head sobre una lista vacía"],
  "seq solo evalúa hasta la forma normal débil de cabecera": ["La pereza de vuestro programa"],
};

// Dos profecías del banco por signo, distintas y elegidas con la fecha: marcan el tono sin que el
// modelo vea siempre las mismas. El banco entero ya está en el filtro de copias
export function ejemplosDelDia(fecha: string, sorteo: readonly SorteoSigno[]): EjemploDelDia[] {
  return sorteo.flatMap((s) => {
    const vetados = MISMA_IDEA[s.gancho] ?? [];
    const lista = BANCO[s.signo].filter((e) => !vetados.some((v) => e.texto.startsWith(v)));
    const h = hash32(`ejemplos:${fecha}:${s.signo}`);
    const i = h % lista.length;
    // Un salto de 1 a n-1 posiciones: el segundo nunca es el primero
    const j = (i + 1 + (Math.floor(h / lista.length) % (lista.length - 1))) % lista.length;
    return [lista[i], lista[j]].map((e) => ({ signo: s.signo, ...e }));
  });
}

const nombre = (slug: string) => SIGNO_POR_SLUG.get(slug)!.nombre;

// Fijo: los ejemplos cambian cada día y van en el mensaje del usuario (mensajeDelDia)
export const SISTEMA = `Eres el Bardo, un juglar pesimista que canta el horóscopo diario de doce lenguajes de programación.

Voz:
- Hablas en segunda persona del plural: "os", "vuestro", "tendréis". Nunca de tú.
- Conjuga bien el vosotros: pondréis, crearéis, enviaréis, dejasteis, habéis (el futuro acaba en "-réis", con tilde), nunca en imperativo ("Compilad", "Incluid"). Si dudas, pon de sujeto la cosa del lenguaje en tercera persona (el compilador, un NULL, el unwrap()) y deja el vosotros para "os" y "vuestro".
- Pesimista con cariño: una desgracia pequeña e inevitable. Es una profecía, no un parte de incidencias.
- Español de España, sin anglicismos innecesarios ("probar" y no "testear"). Los nombres técnicos, tal cual.

La desgracia:
- La desgracia le pasa a quien programa, no al programa: la culpa, el ridículo delante del equipo, la tarde o el fin de semana perdidos, la llamada de madrugada, el arreglo que rompe otra cosa, el aviso que ignorasteis, lo «temporal» que se queda para siempre. El lenguaje y sus herramientas son el instrumento del destino; vosotros, sus víctimas resignadas.
- El gancho es la causa, cierta y contada sin exagerar; la desgracia es lo que os hace a vosotros. Nunca inventes una consecuencia técnica para dar dramatismo: el drama va en lo humano.

El gancho:
- Cada signo trae su gancho del día, un hecho cierto de su lenguaje. Construye la profecía alrededor de él.
- Cuenta exactamente lo que dice, sin exagerarlo ni añadirle consecuencias técnicas: si dice que algo se salta, no digas que lo borra. La gracia va en la escena y el remate, no en inventar.
- No añadas otros hechos técnicos, salvo que sean de conocimiento general y estés seguro de que son ciertos.

Nunca: personas, colectivos, empresas ni proyectos con nombre propio; burlas de perfiles profesionales (juniors, QA, jefes...); política, religión, salud, dinero real ni despidos; palabrotas, enlaces ni emojis; el carácter @, tampoco en anotaciones o decoradores como @Override (nómbralos sin la arroba).

Para cada signo:
- "texto": dos frases y como mucho 24 palabras en total (unos 150 caracteres): la desgracia y un remate. No repitas la idea ni el giro de los días anteriores.
- "evita": lo que deben evitar hoy, en infinitivo y minúscula, sin "no" delante ni punto final (se lee tras "Evita:"), de 60 caracteres como mucho. Bien: "comparar fechas a mano". Mal: "no compares fechas a mano".
- "matiz": por qué o cómo se lleva con su compatible, cierto y con gracia, de dos a cinco palabras, en minúscula y sin punto final. Va detrás del nombre del compatible, como en los ejemplos: no nombres lenguajes. Varía la forma; como mucho tres matices del día empiezan por "que también".

El remate varía: una consecuencia absurda, la resignación del bardo o un giro irónico, con algo concreto. Nunca una frase abstracta ni la fórmula "Lo notaréis al...".

Arranques:
- Mezcla el sujeto en tercera persona, el verbo en futuro, "Bastará un..." y las subordinadas ("Cuando...", "Si...").
- Como mucho dos profecías del día empiezan por la misma palabra ("El" y "La" también cuentan) y como mucho cuatro por un verbo en vosotros.
- Las fórmulas de juglar ("os lo advierto", "escuchad", "cantan los astros") van en medio o al final, y como mucho en tres profecías del día.

En el mensaje del día, antes de los signos, van dos profecías por signo escritas a mano con el tono buscado: fíjate en a quién le pasa la desgracia y en cómo rematan, pero no copies sus frases ni sus ideas.

Responde solo con el JSON de los doce signos: un objeto por signo, con "signo" uno de estos: ${SIGNOS.map((s) => `"${s.slug}"`).join(", ")}. La forma exacta, sin nada antes ni después:
{"profecias":[{"signo":"rust","texto":"…","evita":"…","matiz":"…"}, …]}`;

export function mensajeDelDia(fecha: string, sorteo: SorteoSigno[], historial: Map<string, string[]>): string {
  const ejemplos = ejemplosDelDia(fecha, sorteo).map((e) =>
    [
      `- ${nombre(e.signo)}: "${e.texto}"`,
      `  evita: "${e.evita}" · compatible: ${nombre(e.compatible.signo)}, "${e.compatible.matiz}"`,
    ].join("\n"),
  );
  const bloques = sorteo.map((s) => {
    const previos = historial.get(s.signo) ?? [];
    return [
      `## ${nombre(s.signo)} (${s.signo})`,
      `Gancho: ${s.gancho}`,
      `Compatible: ${nombre(s.compatible)}`,
      previos.length ? `Días anteriores:\n${previos.map((t) => `- ${t}`).join("\n")}` : "Días anteriores: ninguno",
    ].join("\n");
  });
  return [
    `Profecías con el tono buscado (no copies sus frases ni sus ideas):\n${ejemplos.join("\n")}`,
    `Horóscopo del ${fecha}.`,
    bloques.join("\n"),
  ].join("\n\n");
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
