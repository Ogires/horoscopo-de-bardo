// tests/banco.test.ts
import { describe, expect, it } from "vitest";
import banco from "../data/banco.json";
import matices from "../data/matices.json";
import { diaDelBanco, matizDeReserva, profeciaDelBanco } from "../src/generar/banco";
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

describe("matices de reserva", () => {
  it("entre 8 y 10, distintos, de dos a cinco palabras, en minúscula, sin punto y válidos como matiz", () => {
    expect(matices.length).toBeGreaterThanOrEqual(8);
    expect(matices.length).toBeLessThanOrEqual(10);
    expect(new Set(matices).size).toBe(matices.length);
    const base = BANCO.rust[0];
    for (const m of matices) {
      const palabras = m.split(/\s+/);
      expect(palabras.length, m).toBeGreaterThanOrEqual(2);
      expect(palabras.length, m).toBeLessThanOrEqual(5);
      expect(m, m).toBe(m.trim().toLowerCase());
      expect(m, m).not.toMatch(/[.!?]$/);
      expect(motivoInvalida({ ...base, compatible: { ...base.compatible, matiz: m } }, "rust"), m).toBeNull();
    }
  });

  it("se elige de forma determinista por fecha y signo, y sale de la lista", () => {
    expect(matizDeReserva("2026-11-13", "rust")).toBe(matizDeReserva("2026-11-13", "rust"));
    const elegidos = new Set<string>();
    for (const fecha of ["2026-11-13", "2026-11-14", "2026-11-15"]) {
      for (const signo of SLUGS) {
        const m = matizDeReserva(fecha, signo);
        expect(matices).toContain(m);
        elegidos.add(m);
      }
    }
    // Con 36 sorteos no sale siempre el mismo
    expect(elegidos.size).toBeGreaterThan(3);
  });
});
