// tests/cadena.test.ts
import { afterEach, describe, expect, it } from "vitest";
import banco from "../data/banco.json";
import { generarDia } from "../src/generar/cadena";
import { EJEMPLOS } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";
import { GROQ_URL, interceptar, profeciasIa, respuestaGroq, restaurarFetch } from "./helpers";

const FECHA = "2026-11-13";
const deps = (historial = new Map<string, string[]>()) => ({
  apiKey: "clave", modelos: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"], historial,
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
    // Con ~2.500 de entrada el día 3, entrada + tope tiene que caber en los 8K tokens/minuto de Groq
    expect(2500 + medium).toBeLessThanOrEqual(8000);
  });

  it("hasta 3 signos inválidos salen del banco y se queda el modelo", async () => {
    const largo = { texto: "x".repeat(200) };
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, { rust: largo, go: largo })) : null));
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBe("openai/gpt-oss-120b");
    expect(g.profecias.filter((p) => p.origen === "banco").map((p) => p.signo).sort()).toEqual(["go", "rust"]);
  });

  it("las descartadas guardan el texto que propuso la IA y su motivo", async () => {
    const ia = profeciasIa(FECHA, { rust: { texto: "x".repeat(200) }, php: { evita: "no tocar producción" } });
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(ia.filter((p) => p.signo !== "go")) : null));
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBe("openai/gpt-oss-120b");
    expect(g.descartadas).toEqual([
      { signo: "rust", texto: "x".repeat(200), motivo: "longitud_texto" },
      { signo: "php", texto: ia.find((p) => p.signo === "php")!.texto, motivo: "evita_negada" },
    ]);
    // Go no llegó: sale en fallos, pero no hay texto que enseñar
    expect(g.fallos).toContain("openai/gpt-oss-120b:go:falta");
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

  it("descarta una profecía que copia un ejemplo del prompt", async () => {
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, { php: { texto: EJEMPLOS[2].texto } })) : null));
    repetida(await generarDia(FECHA, deps()), "php");
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
