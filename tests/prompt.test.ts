// tests/prompt.test.ts
import { describe, expect, it } from "vitest";
import { ESQUEMA, mensajeDelDia, SISTEMA } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";

describe("prompt", () => {
  it("el sistema fija las reglas de la sección 5.3", () => {
    for (const frase of ["80 a 180 caracteres", "Burlas de perfiles", "despidos", "emojis", "misma palabra"]) {
      expect(SISTEMA).toContain(frase);
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
