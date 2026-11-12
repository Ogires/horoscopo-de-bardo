// tests/prompt.test.ts
import { describe, expect, it } from "vitest";
import ganchos from "../data/ganchos.json";
import { TEXTOS_DEL_BANCO } from "../src/generar/banco";
import { EJEMPLOS, ESQUEMA, mensajeDelDia, SISTEMA } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";
import { motivoInvalida, repite, sextetos } from "../src/generar/validar";

describe("prompt", () => {
  it("el sistema fija las reglas de la sección 5.3", () => {
    for (const frase of ["100 a 150 caracteres", "remate", "Burlas de perfiles", "despidos", "emojis", "misma palabra", "@Override"]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("vosotros, la profecía alrededor del gancho cierto y «Evita» en infinitivo", () => {
    for (const frase of [
      "segunda persona del plural", "Nunca de tú", "alrededor de él", "No añadas otros hechos técnicos",
      "estés seguro", "no un parte de incidencias", "en infinitivo", 'sin "no" delante',
    ]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("arranques, fórmulas de juglar, matices y anglicismos con tope", () => {
    for (const frase of [
      "por el sujeto o por el verbo", "en medio o al final", "como mucho en tres profecías",
      '"El" y "La" también cuentan', 'como mucho tres matices del día empiezan por "que también"', '"testear"',
    ]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("cuatro ejemplos de tono, completos, válidos y que no salen del banco ni del sorteo", () => {
    const banco = new Set(TEXTOS_DEL_BANCO.flatMap(sextetos));
    expect(EJEMPLOS).toHaveLength(4);
    expect(new Set(EJEMPLOS.map((e) => e.signo)).size).toBe(4);
    for (const e of EJEMPLOS) {
      // Fuera del sorteo: el día de ese gancho, el modelo no tiene un texto que imitar
      expect(Object.values(ganchos).flat()).not.toContain(e.gancho);
      for (const parte of [e.gancho, e.texto, e.evita, e.matiz]) expect(SISTEMA).toContain(parte);
      expect(motivoInvalida({ texto: e.texto, evita: e.evita, compatible: { signo: e.compatible, matiz: e.matiz } }, e.signo)).toBeNull();
      expect(repite(e.texto, banco), e.texto).toBe(false);
    }
  });

  it("los ejemplos tienen la forma pedida: 100-150 caracteres, dos frases y arranques sin fórmula de juglar", () => {
    const primeras = EJEMPLOS.map((e) => e.texto.split(/\s/)[0].toLowerCase());
    expect(new Set(primeras).size).toBe(EJEMPLOS.length);
    for (const e of EJEMPLOS) {
      expect([...e.texto].length, e.texto).toBeGreaterThanOrEqual(100);
      expect([...e.texto].length, e.texto).toBeLessThanOrEqual(150);
      // Una frase acaba en . ! o ? seguido de mayúscula: el ? de Rust en medio no cuenta
      expect(e.texto.split(/(?<=[.!?])\s+(?=\p{Lu})/u), e.texto).toHaveLength(2);
      expect(e.texto, e.texto).not.toMatch(/^(?:os |escuchad|cantan|oíd|cuidado|atended)/i);
    }
    expect(EJEMPLOS.filter((e) => e.matiz.startsWith("que también")).length).toBeLessThanOrEqual(1);
  });

  it("el mensaje lleva los doce signos con su gancho, su compatible y los días anteriores", () => {
    const sorteo = sortearDia("2026-11-13");
    const historial = new Map([["rust", ["texto de ayer", "texto de anteayer", "texto de hace tres días"]]]);
    const m = mensajeDelDia("2026-11-13", sorteo, historial);
    for (const s of sorteo) {
      expect(m).toContain(`(signo: ${s.signo})`);
      expect(m).toContain(`Gancho del día: ${s.gancho}`);
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
