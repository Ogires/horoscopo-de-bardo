// tests/cadena.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { generarDia } from "../src/generar/cadena";
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

  it("hasta 3 signos inválidos salen del banco y se queda el modelo", async () => {
    const largo = { texto: "x".repeat(200) };
    interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA, { rust: largo, go: largo })) : null));
    const g = await generarDia(FECHA, deps());
    expect(g.modelo).toBe("openai/gpt-oss-120b");
    expect(g.profecias.filter((p) => p.origen === "banco").map((p) => p.signo).sort()).toEqual(["go", "rust"]);
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

  it("al prompt solo le llegan los tres días más recientes", async () => {
    const historial = new Map([["rust", ["día -1 uno", "día -2 dos", "día -3 tres", "día -4 cuatro"]]]);
    const llamadas = interceptar((url) => (url === GROQ_URL ? respuestaGroq(profeciasIa(FECHA)) : null));
    await generarDia(FECHA, deps(historial));
    const usuario = llamadas[0].cuerpo.messages[1].content as string;
    expect(usuario).toContain("día -3 tres");
    expect(usuario).not.toContain("día -4 cuatro");
  });
});
