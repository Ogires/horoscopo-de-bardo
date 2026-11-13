// tests/cadena.test.ts
import { afterEach, describe, expect, it } from "vitest";
import banco from "../data/banco.json";
import { matizDeReserva } from "../src/generar/banco";
import { generarDia } from "../src/generar/cadena";
import { ejemplosDelDia, SISTEMA } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";
import { GROQ_URL, interceptar, profeciasIa, respuestaGroq, respuestaTexto, restaurarFetch, ZAI_URL } from "./helpers";

const FECHA = "2026-11-13";
const deps = (historial = new Map<string, string[]>()) => ({
  claves: { groq: "clave", zai: "clave-zai" }, modelos: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"], historial,
});
afterEach(restaurarFetch);

describe("generarDia", () => {
  it("camino feliz: doce profecías de la IA con el puerto y el compatible del sorteo", async () => {
    const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
    const g = await generarDia(FECHA, deps());
    const sorteo = sortearDia(FECHA);
    expect(g.modelo).toBe("openai/gpt-oss-120b");
    expect(g.profecias.every((p) => p.origen === "ia")).toBe(true);
    expect(g.profecias.map((p) => p.puerto)).toEqual(sorteo.map((s) => s.puerto));
    expect(g.profecias.map((p) => p.compatible.signo)).toEqual(sorteo.map((s) => s.compatible));
    expect(g.tokens).toBe(4500);
    const c = llamadas[0];
    expect(c.cabeceras.get("authorization")).toBe("Bearer clave");
    expect(c.cuerpo.model).toBe("openai/gpt-oss-120b");
    expect(c.cuerpo.reasoning_effort).toBe("low");
    expect(c.cuerpo.response_format.type).toBe("json_schema");
    expect(c.cuerpo.response_format.json_schema.strict).toBe(true);
    expect(c.cuerpo.stream).toBeUndefined();
  });

  it("el esfuerzo de razonamiento se puede subir a medium", async () => {
    const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
    await generarDia(FECHA, { ...deps(), esfuerzo: "medium" });
    expect(llamadas[0].cuerpo.reasoning_effort).toBe("medium");
  });

  it("con medium el tope de salida deja sitio al razonamiento sin pasar de 8K por minuto", async () => {
    const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
    await generarDia(FECHA, deps());
    await generarDia(FECHA, { ...deps(), esfuerzo: "medium" });
    const [low, medium] = llamadas.map((l) => l.cuerpo.max_tokens);
    expect(low).toBe(3500);
    expect(medium).toBeGreaterThanOrEqual(5000);
    // Con los ~2.500 de entrada del día 3 en la iteración 4, entrada + tope cabía en los 8K tokens/minuto
    // de Groq. Con los 24 ejemplos del banco (~3.800-4.200) ya no cabe: ver TOPE_SALIDA en cadena.ts
    expect(2500 + medium).toBeLessThanOrEqual(8000);
  });

  describe("parámetros según el modelo", () => {
    it("gpt-oss no lleva reasoning_format, que Groq no admite en esos modelos", async () => {
      const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      await generarDia(FECHA, deps());
      expect(llamadas[0].cuerpo).not.toHaveProperty("reasoning_format");
    });

    it("Qwen 3.8: razonamiento con el esfuerzo pedido, aparte del JSON (parsed), strict y tope de salida mayor", async () => {
      const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      const g = await generarDia(FECHA, { ...deps(), modelos: ["qwen/qwen3.8-27b"] });
      expect(g.modelo).toBe("qwen/qwen3.8-27b");
      const c = llamadas[0].cuerpo;
      expect(c.model).toBe("qwen/qwen3.8-27b");
      expect(c.reasoning_effort).toBe("low");
      // Con json_schema, raw da 400: el razonamiento iría dentro del contenido
      expect(c.reasoning_format).toBe("parsed");
      expect(c.response_format.json_schema.strict).toBe(true);
      expect(c.max_tokens).toBe(5000);
      // Entrada de la iteración 4; con los ejemplos del banco ya no cabe (ver TOPE_SALIDA)
      expect(2600 + c.max_tokens).toBeLessThanOrEqual(8000);
    });

    it("un modelo sin strict en la documentación de Groq va en best-effort y sin parámetros de razonamiento", async () => {
      const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      await generarDia(FECHA, { ...deps(), modelos: ["otro/modelo-sin-strict"] });
      const c = llamadas[0].cuerpo;
      expect(c.response_format.type).toBe("json_schema");
      expect(c.response_format.json_schema.strict).toBe(false);
      expect(c).not.toHaveProperty("reasoning_effort");
      expect(c).not.toHaveProperty("reasoning_format");
    });
  });

  describe("Z.ai: los modelos con el prefijo zai:", () => {
    const glm = "zai:glm-4.7-flash";

    it("van a Z.ai con su key, el id sin el prefijo y en modo JSON, sin esquema ni parámetros de Groq", async () => {
      const llamadas = interceptar((url) => (url === ZAI_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      const g = await generarDia(FECHA, { ...deps(), modelos: [glm] });
      expect(g.modelo).toBe(glm);
      expect(g.profecias.every((p) => p.origen === "ia")).toBe(true);
      expect(g.tokens).toBe(4500);
      const c = llamadas[0];
      expect(c.url).toBe(ZAI_URL);
      expect(c.cabeceras.get("authorization")).toBe("Bearer clave-zai");
      expect(c.cuerpo.model).toBe("glm-4.7-flash");
      expect(c.cuerpo.messages[0]).toEqual({ role: "system", content: SISTEMA });
      // Z.ai solo tiene modo JSON: el esquema no se impone (va descrito en SISTEMA)
      expect(c.cuerpo.response_format).toEqual({ type: "json_object" });
      expect(c.cuerpo.thinking).toEqual({ type: "disabled" });
      expect(c.cuerpo.max_tokens).toBe(4096);
      expect(c.cuerpo.temperature).toBe(0.9);
      expect(c.cuerpo).not.toHaveProperty("reasoning_effort");
      expect(c.cuerpo).not.toHaveProperty("reasoning_format");
      expect(c.cuerpo.stream).toBeUndefined();
    });

    it("con pensar, activan el razonamiento (thinking) con un tope de salida mayor", async () => {
      const llamadas = interceptar((url) => (url === ZAI_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      await generarDia(FECHA, { ...deps(), modelos: [glm], pensar: true });
      expect(llamadas[0].cuerpo.thinking).toEqual({ type: "enabled" });
      // GLM-5.3 siempre razona (no admite "disabled") y por defecto lo hace en "max": se pide "low"
      expect(llamadas[0].cuerpo.reasoning_effort).toBe("low");
      // Con 4.096, el razonamiento de GLM-4.7-Flash se los comió enteros dos veces y el JSON llegó vacío
      expect(llamadas[0].cuerpo.max_tokens).toBe(16384);
    });

    it("los de Groq siguen yendo a Groq con su key y sin thinking", async () => {
      const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      await generarDia(FECHA, { ...deps(), pensar: true });
      expect(llamadas[0].url).toBe(GROQ_URL);
      expect(llamadas[0].cabeceras.get("authorization")).toBe("Bearer clave");
      expect(llamadas[0].cuerpo).not.toHaveProperty("thinking");
    });

    it("si Z.ai falla, la cadena sigue con el siguiente modelo, aunque sea de Groq", async () => {
      const llamadas = interceptar((url) => {
        if (url === ZAI_URL) return new Response("ocupado", { status: 429 });
        return url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null;
      });
      const g = await generarDia(FECHA, { ...deps(), modelos: [glm, "openai/gpt-oss-120b"] });
      expect(llamadas.map((l) => l.url)).toEqual([ZAI_URL, GROQ_URL]);
      expect(g.modelo).toBe("openai/gpt-oss-120b");
      expect(g.fallos).toEqual([`${glm}:Error: zai_429`]);
    });

    it("sin key de Z.ai no se la llama y la cadena sigue con el siguiente modelo", async () => {
      const llamadas = interceptar((url) => (url === ZAI_URL || url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
      const g = await generarDia(FECHA, { ...deps(), claves: { groq: "clave" }, modelos: [glm, "openai/gpt-oss-120b"] });
      expect(llamadas.map((l) => l.url)).toEqual([GROQ_URL]);
      expect(g.modelo).toBe("openai/gpt-oss-120b");
      expect(g.fallos).toEqual([`${glm}:Error: zai_sin_clave`]);
    });
  });

  describe("forma de la respuesta: Z.ai no impone el esquema", () => {
    const glm = "zai:glm-4.7-flash";
    const gpt = "openai/gpt-oss-120b";
    const conRespaldo = () => ({ ...deps(), modelos: [glm, gpt] });
    // Z.ai devuelve el contenido dado; Groq, de respaldo, doce profecías buenas
    const servir = (contenido: string | null) =>
      interceptar((url) => {
        if (url === ZAI_URL) return respuestaTexto(contenido);
        return url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null;
      });
    const json = (profecias: unknown) => JSON.stringify({ profecias });

    const valla = "```";
    it.each([
      ["```json … ```", (j: string) => `${valla}json\n${j}\n${valla}`],
      ["``` … ```", (j: string) => `${valla}\n${j}\n${valla}`],
      ["con espacios alrededor", (j: string) => `\n  ${valla}json\n${j}\n${valla}  \n`],
    ])("acepta el JSON envuelto en un bloque de código Markdown (%s)", async (_, envolver) => {
      servir(envolver(json(profeciasIa(FECHA))));
      const g = await generarDia(FECHA, conRespaldo());
      expect(g.modelo).toBe(glm);
      expect(g.profecias.every((p) => p.origen === "ia")).toBe(true);
      expect(g.fallos).toEqual([]);
    });

    it("un elemento sin los cuatro campos de texto cuenta como falta para su signo", async () => {
      const ia: Record<string, unknown>[] = profeciasIa(FECHA);
      const cambiar = (signo: string, f: (p: Record<string, unknown>) => Record<string, unknown>) => {
        const i = ia.findIndex((p) => p.signo === signo);
        ia[i] = f(ia[i]);
      };
      cambiar("rust", (p) => ({ ...p, texto: 42 }));
      cambiar("go", ({ matiz, ...resto }) => resto);
      cambiar("sql", (p) => ({ ...p, evita: null }));
      servir(json(ia));
      const g = await generarDia(FECHA, conRespaldo());
      expect(g.modelo).toBe(glm);
      expect(g.profecias.filter((p) => p.origen === "banco").map((p) => p.signo).sort()).toEqual(["go", "rust", "sql"]);
      expect([...g.fallos].sort()).toEqual([`${glm}:go:falta`, `${glm}:rust:falta`, `${glm}:sql:falta`]);
    });

    it("un signo que no es uno de los doce se ignora y el suyo cuenta como falta", async () => {
      const ia = profeciasIa(FECHA).map((p) => (p.signo === "rust" ? { ...p, signo: "Rust" } : p.signo === "php" ? { ...p, signo: "ruby" } : p));
      servir(json(ia));
      const g = await generarDia(FECHA, conRespaldo());
      expect(g.modelo).toBe(glm);
      expect(g.profecias.filter((p) => p.origen === "banco").map((p) => p.signo).sort()).toEqual(["php", "rust"]);
      expect([...g.fallos].sort()).toEqual([`${glm}:php:falta`, `${glm}:rust:falta`]);
    });

    it("los elementos que no son objetos se ignoran", async () => {
      servir(json([null, "rust", 7, ["go"], ...profeciasIa(FECHA)]));
      const g = await generarDia(FECHA, conRespaldo());
      expect(g.modelo).toBe(glm);
      expect(g.profecias.every((p) => p.origen === "ia")).toBe(true);
    });

    it.each([
      ["otra clave", JSON.stringify({ horoscopo: profeciasIa(FECHA) })],
      ["profecias que no es un array", JSON.stringify({ profecias: { rust: profeciasIa(FECHA)[0] } })],
      ["un array suelto", JSON.stringify(profeciasIa(FECHA))],
      ["null", "null"],
    ])("sin el array profecias (%s), falla el modelo y se pasa al siguiente", async (_, contenido) => {
      const llamadas = servir(contenido);
      const g = await generarDia(FECHA, conRespaldo());
      expect(llamadas.map((l) => l.url)).toEqual([ZAI_URL, GROQ_URL]);
      expect(g.modelo).toBe(gpt);
      expect(g.fallos).toEqual([`${glm}:Error: sin_profecias`]);
    });

    it.each([
      ["cortado", '{"profecias": [{"signo": "rust", "texto": "Bastará un'],
      ["texto suelto", "Aquí tenéis el horóscopo de hoy."],
      ["vacío", ""],
      ["null", null],
    ])("si el JSON no se puede leer (%s), falla el modelo y se pasa al siguiente", async (_, contenido) => {
      servir(contenido);
      const g = await generarDia(FECHA, conRespaldo());
      expect(g.modelo).toBe(gpt);
      expect(g.fallos).toEqual([`${glm}:Error: json_invalido`]);
    });
  });

  it("hasta 3 signos inválidos salen del banco y se queda el modelo", async () => {
    const largo = { texto: "x".repeat(200) };
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, { rust: largo, go: largo })) : null));
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBe("openai/gpt-oss-120b");
    expect(g.profecias.filter((p) => p.origen === "banco").map((p) => p.signo).sort()).toEqual(["go", "rust"]);
  });

  it("las descartadas guardan lo que propuso la IA (texto, «Evita» y matiz), el modelo y el motivo", async () => {
    const ia = profeciasIa(FECHA, { rust: { texto: "x".repeat(200) }, php: { evita: "no tocar producción" }, sql: { evita: "e".repeat(61) } });
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia.filter((p) => p.signo !== "go")) : null));
    const g = await generarDia(FECHA, deps());
    // Tres inválidas y una que falta: cuatro malas, así que también se prueba el respaldo
    const de = (signo: string) => ia.find((p) => p.signo === signo)!;
    const m = "openai/gpt-oss-120b";
    expect(g.descartadas.filter((d) => d.motivo !== "modelo_descartado" && d.modelo === m)).toEqual([
      { modelo: m, signo: "rust", texto: "x".repeat(200), evita: de("rust").evita, matiz: de("rust").matiz, motivo: "longitud_texto" },
      { modelo: m, signo: "php", texto: de("php").texto, evita: "no tocar producción", matiz: de("php").matiz, motivo: "evita_negada" },
      { modelo: m, signo: "sql", texto: de("sql").texto, evita: "e".repeat(61), matiz: de("sql").matiz, motivo: "longitud_evita" },
    ]);
    // Go no llegó: sale en fallos, pero no hay texto que enseñar
    expect(g.fallos).toContain(`${m}:go:falta`);
  });

  it("si se descarta el modelo entero, sus profecías válidas también salen en descartadas", async () => {
    const largo = { texto: "x".repeat(200) };
    const ia = profeciasIa(FECHA, { rust: largo, go: largo, php: largo, sql: largo });
    interceptar((url, cuerpo) => {
      if (url !== GROQ_URL) return null;
      return respuestaGroq(cuerpo.model === "openai/gpt-oss-120b" ? ia : profeciasIa(FECHA));
    });
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBe("openai/gpt-oss-20b");
    const delPrimero = g.descartadas.filter((d) => d.modelo === "openai/gpt-oss-120b");
    expect(delPrimero).toHaveLength(12);
    expect(delPrimero.filter((d) => d.motivo === "longitud_texto").map((d) => d.signo).sort()).toEqual(["go", "php", "rust", "sql"]);
    const validas = delPrimero.filter((d) => d.motivo === "modelo_descartado");
    expect(validas).toHaveLength(8);
    const { signo } = validas[0];
    expect(validas[0]).toEqual({
      modelo: "openai/gpt-oss-120b", signo, texto: ia.find((p) => p.signo === signo)!.texto,
      evita: "tocar producción antes del café", matiz: "a regañadientes", motivo: "modelo_descartado",
    });
    expect(g.descartadas.filter((d) => d.modelo === "openai/gpt-oss-20b")).toEqual([]);
  });

  describe("matiz de reserva", () => {
    const m = "openai/gpt-oss-120b";
    const largo = "que también sabe muy bien lo que es sufrir en silencio";

    it("si solo falla la longitud del matiz, se quedan el texto y el «Evita» con un matiz de la lista", async () => {
      const ia = profeciasIa(FECHA, { rust: { matiz: largo }, go: { matiz: "" } });
      interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia) : null));
      const g = await generarDia(FECHA, deps());
      const sorteo = sortearDia(FECHA);
      for (const signo of ["rust", "go"]) {
        const p = g.profecias.find((x) => x.signo === signo)!;
        const propuesta = ia.find((x) => x.signo === signo)!;
        expect(p.origen).toBe("ia");
        expect(p.texto).toBe(propuesta.texto);
        expect(p.evita).toBe(propuesta.evita);
        expect(p.compatible).toEqual({ signo: sorteo.find((s) => s.signo === signo)!.compatible, matiz: matizDeReserva(FECHA, signo) });
        expect(g.fallos).toContain(`${m}:${signo}:matiz_reserva`);
      }
      // El matiz que se tiró queda a la vista para revisar el prompt
      expect(g.descartadas).toContainEqual({
        modelo: m, signo: "rust", texto: ia[0].texto, evita: ia[0].evita, matiz: largo, motivo: "matiz_reserva",
      });
    });

    it("no cuenta como mala: con doce matices largos se queda el modelo y nada sale del banco", async () => {
      const cambios = Object.fromEntries(sortearDia(FECHA).map((s) => [s.signo, { matiz: largo }]));
      const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, cambios)) : null));
      const g = await generarDia(FECHA, deps());
      expect(llamadas).toHaveLength(1);
      expect(g.modelo).toBe(m);
      expect(g.profecias.every((p) => p.origen === "ia")).toBe(true);
      expect(g.fallos.filter((f) => f.endsWith(":matiz_reserva"))).toHaveLength(12);
    });

    it("si además falla otra cosa, la profecía se descarta por ese otro motivo", async () => {
      const ia = profeciasIa(FECHA, { php: { matiz: largo, evita: "no tocar producción" } });
      interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia) : null));
      const g = await generarDia(FECHA, deps());
      expect(g.profecias.find((p) => p.signo === "php")?.origen).toBe("banco");
      expect(g.fallos).toContain(`${m}:php:evita_negada`);
      expect(g.fallos).not.toContain(`${m}:php:matiz_reserva`);
      expect(g.descartadas).toEqual([
        { modelo: m, signo: "php", texto: ia.find((p) => p.signo === "php")!.texto, evita: "no tocar producción", matiz: largo, motivo: "evita_negada" },
      ]);
    });

    it("un texto copiado con el matiz largo sigue siendo una copia", async () => {
      const ia = profeciasIa(FECHA, { rust: { matiz: largo } });
      interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia) : null));
      const g = await generarDia(FECHA, deps(new Map([["rust", [ia[0].texto]]])));
      repetida(g, "rust");
      expect(g.fallos).not.toContain(`${m}:rust:matiz_reserva`);
    });
  });

  it("sin descartes, la lista de descartadas va vacía", async () => {
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
    expect((await generarDia(FECHA, deps())).descartadas).toEqual([]);
  });

  it("con 4 o más inválidos prueba el modelo de respaldo", async () => {
    const largo = { texto: "x".repeat(200) };
    const malas = { rust: largo, go: largo, php: largo, sql: largo };
    const llamadas = interceptar((url, cuerpo) => {
      if (url !== GROQ_URL) return null;
      return respuestaGroq(cuerpo.model === "openai/gpt-oss-120b" ? profeciasIa(FECHA, malas) : profeciasIa(FECHA));
    });
    const g = await generarDia(FECHA, deps());
    expect(llamadas.map((l) => l.cuerpo.model)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    expect(g.modelo).toBe("openai/gpt-oss-20b");
  });

  it("signos repetidos invalidan la respuesta", async () => {
    const repetidas = profeciasIa(FECHA);
    repetidas[1] = { ...repetidas[0] };
    interceptar((url, cuerpo) => (url === GROQ_URL ? respuestaGroq(cuerpo.model.endsWith("120b") ? repetidas : profeciasIa(FECHA)) : null));
    expect((await generarDia(FECHA, deps())).modelo).toBe("openai/gpt-oss-20b");
  });

  it("si fallan los dos modelos, el día entero sale del banco", async () => {
    interceptar((url) => (url === GROQ_URL ? new Response("caído", { status: 503 }) : null));
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBeNull();
    expect(g.profecias.every((p) => p.origen === "banco")).toBe(true);
    expect(g.fallos).toHaveLength(2);
  });

  it("descarta una profecía que repite 6 palabras de los días anteriores", async () => {
    const ia = profeciasIa(FECHA);
    const historial = new Map([["rust", [ia[0].texto]]]);
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia) : null));
    const g = await generarDia(FECHA, deps(historial));
    expect(g.profecias.find((p) => p.signo === "rust")?.origen).toBe("banco");
  });

  const repetida = (g: { fallos: string[]; profecias: { signo: string; origen: string }[] }, signo: string) => {
    expect(g.profecias.find((p) => p.signo === signo)?.origen).toBe("banco");
    expect(g.fallos).toContain(`openai/gpt-oss-120b:${signo}:repetida`);
  };

  it("descarta una profecía que copia 6 palabras de otro signo en los últimos días", async () => {
    const ia = profeciasIa(FECHA);
    const historial = new Map([["haskell", ["Primero otra profecía.", ia[0].texto]]]);
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia) : null));
    const g = await generarDia(FECHA, deps(historial));
    repetida(g, "rust");
    expect(g.profecias.filter((p) => p.origen === "banco")).toHaveLength(1);
  });

  it("descarta una profecía que copia 6 palabras del banco, aunque sea de otro signo", async () => {
    const ochoPalabras = banco.javascript[0].texto.split(" ").slice(0, 8).join(" ");
    const copia = `Escuchad, Rust: ${ochoPalabras} y así seguirá hasta el final del día.`;
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, { rust: { texto: copia } })) : null));
    repetida(await generarDia(FECHA, deps()), "rust");
  });

  it("descarta una profecía que copia 6 palabras de un ejemplo del día, que sale del banco", async () => {
    const ejemplo = ejemplosDelDia(FECHA, sortearDia(FECHA)).find((e) => e.signo === "go")!;
    const seis = ejemplo.texto.split(" ").slice(1, 7).join(" ");
    const copia = `Escuchad, PHP: ${seis} y así seguirá hasta el final del día.`;
    const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, { php: { texto: copia } })) : null));
    const g = await generarDia(FECHA, deps());
    // El ejemplo iba en el prompt, y el banco entero ya está en el filtro de copias
    expect(llamadas[0].cuerpo.messages[1].content).toContain(ejemplo.texto);
    repetida(g, "php");
  });

  it("descarta una profecía que copia 6 palabras de otro signo del mismo día", async () => {
    const frase = "el compilador os hablará hoy con una crueldad que nadie merece";
    const cambios = {
      rust: { texto: `Rust, os lo advierto: ${frase}, y tendrá toda la razón del mundo.` },
      go: { texto: `Go, escuchad: ${frase}, ni siquiera vosotros después de tanto café.` },
    };
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, cambios)) : null));
    const g = await generarDia(FECHA, deps());
    expect(g.profecias.find((p) => p.signo === "rust")?.origen).toBe("ia");
    repetida(g, "go");
  });

  it("el modelo de respaldo no choca con lo que dijo el modelo descartado", async () => {
    const largo = { texto: "x".repeat(200) };
    const malas = { rust: largo, go: largo, php: largo, sql: largo };
    interceptar((url, cuerpo) => {
      if (url !== GROQ_URL) return null;
      return respuestaGroq(cuerpo.model === "openai/gpt-oss-120b" ? profeciasIa(FECHA, malas) : profeciasIa(FECHA));
    });
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBe("openai/gpt-oss-20b");
    expect(g.profecias.every((p) => p.origen === "ia")).toBe(true);
  });

  it("al prompt solo le llegan los tres días más recientes", async () => {
    const historial = new Map([["rust", ["día -1 uno", "día -2 dos", "día -3 tres", "día -4 cuatro"]]]);
    const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
    await generarDia(FECHA, deps(historial));
    const usuario = llamadas[0].cuerpo.messages[1].content as string;
    expect(usuario).toContain("día -3 tres");
    expect(usuario).not.toContain("día -4 cuatro");
  });
});
