// tests/banco.test.ts
import { describe, expect, it } from "vitest";
import banco from "../data/banco.json";
import { diaDelBanco, profeciaDelBanco } from "../src/generar/banco";
import { sortearDia } from "../src/generar/sorteo";
import { motivoInvalida } from "../src/generar/validar";
import { SLUGS } from "../src/signos";

const BANCO = banco as Record<string, { texto: string; evita: string; compatible: { signo: string; matiz: string } }[]>;

describe("contenido del banco", () => {
  it("7 profecías por signo, todas válidas y sin repetir", () => {
    expect(Object.keys(BANCO).sort()).toEqual([...SLUGS].sort());
    const textos = new Set<string>();
    for (const [signo, lista] of Object.entries(BANCO)) {
      expect(lista).toHaveLength(7);
      for (const e of lista) {
        expect(motivoInvalida(e, signo), `${signo}: ${e.texto}`).toBeNull();
        textos.add(e.texto);
      }
    }
    expect(textos.size).toBe(84);
  });
});

describe("elección", () => {
  it("determinista por fecha y signo, con el puerto del sorteo", () => {
    const s = sortearDia("2026-11-13")[0];
    const a = profeciaDelBanco("2026-11-13", s);
    expect(a).toEqual(profeciaDelBanco("2026-11-13", s));
    expect(a.origen).toBe("banco");
    expect(a.puerto).toEqual(s.puerto);
  });

  it("diaDelBanco da los doce signos", () => {
    expect(diaDelBanco("2026-11-13").map((p) => p.signo)).toEqual([...SLUGS]);
  });
});
