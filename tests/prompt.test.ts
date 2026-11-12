// tests/prompt.test.ts
import { describe, expect, it } from "vitest";
import temas from "../data/temas.json";
import { TEXTOS_DEL_BANCO } from "../src/generar/banco";
import { EJEMPLOS, ESQUEMA, mensajeDelDia, SISTEMA } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";
import { motivoInvalida, repite, sextetos } from "../src/generar/validar";

describe("prompt", () => {
  it("el sistema fija las reglas de la sección 5.3", () => {
    for (const frase of ["80 a 180 caracteres", "Burlas de perfiles", "despidos", "emojis", "misma palabra", "@Override"]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("vosotros, el tema como pretexto, lo técnico cierto y «Evita» en infinitivo", () => {
    for (const frase of [
      "segunda persona del plural", "Nunca de tú", "solo un pretexto", "valdría igual para otro lenguaje",
      "tiene que ser cierto", "en infinitivo", 'sin "no" delante', '"El" y "La" también cuentan',
    ]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("tres ejemplos de tono, completos, válidos y que no salen del banco", () => {
    const banco = new Set(TEXTOS_DEL_BANCO.flatMap(sextetos));
    expect(EJEMPLOS).toHaveLength(3);
    expect(new Set(EJEMPLOS.map((e) => e.signo)).size).toBe(3);
    for (const e of EJEMPLOS) {
      expect(temas).toContain(e.tema);
      for (const parte of [e.tema, e.texto, e.evita, e.matiz]) expect(SISTEMA).toContain(parte);
      expect(motivoInvalida({ texto: e.texto, evita: e.evita, compatible: { signo: e.compatible, matiz: e.matiz } }, e.signo)).toBeNull();
      expect(repite(e.texto, banco), e.texto).toBe(false);
    }
  });

  it("el mensaje lleva los doce signos con su tema, su compatible y los días anteriores", () => {
    const sorteo = sortearDia("2026-11-13");
    const historial = new Map([["rust", ["texto de ayer", "texto de anteayer", "texto de hace tres días"]]]);
    const m = mensajeDelDia("2026-11-13", sorteo, historial);
    for (const s of sorteo) {
      expect(m).toContain(`(signo: ${s.signo})`);
      expect(m).toContain(`Tema del día: ${s.tema}`);
    }
    expect(m).toContain("- texto de hace tres días");
    expect(m).toContain("Días anteriores: ninguno");
  });

  it("el esquema es compatible con el modo strict de Groq", () => {
    const objetos = [ESQUEMA, ESQUEMA.properties.profecias.items];
    for (const o of objetos) {
      expect(o.additionalProperties).toBe(false);
      expect([...o.required].sort()).toEqual(Object.keys(o.properties).sort());
    }
    expect(ESQUEMA.properties.profecias.items.properties.signo.enum).toHaveLength(12);
  });
});
