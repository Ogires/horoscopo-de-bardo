// tests/sorteo.test.ts
import { describe, expect, it } from "vitest";
import ganchos from "../data/ganchos.json";
import puertos from "../data/puertos.json";
import { sumarDias } from "../src/fecha";
import { hash32, sortearDia } from "../src/generar/sorteo";
import { SLUGS } from "../src/signos";

const GANCHOS = ganchos as Record<string, string[]>;
const DIA_MS = 86_400_000;
const diaNumero = (fecha: string) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
};

describe("datos del sorteo", () => {
  it("15 ganchos por signo, distintos, de 90 caracteres como mucho, sin @ ni enlaces", () => {
    expect(Object.keys(GANCHOS).sort()).toEqual([...SLUGS].sort());
    const todos = Object.values(GANCHOS).flat();
    expect(new Set(todos).size).toBe(todos.length);
    for (const [signo, lista] of Object.entries(GANCHOS)) {
      expect(lista, signo).toHaveLength(15);
      for (const g of lista) {
        expect(g.trim().length, g).toBeGreaterThan(10);
        expect(g, g).toBe(g.trim());
        expect([...g].length, g).toBeLessThanOrEqual(90);
        expect(g, g).not.toMatch(/@|https?:\/\/|www\.|\.(?:com|es|io|dev|org|net)\b/i);
      }
    }
  });

  it("puertos válidos y únicos, con servicio", () => {
    expect(new Set(puertos.map((p) => p.numero)).size).toBe(puertos.length);
    for (const p of puertos) {
      expect(p.numero).toBeGreaterThan(0);
      expect(p.numero).toBeLessThanOrEqual(65535);
      expect(p.servicio.length).toBeGreaterThan(0);
    }
  });
});

describe("sortearDia", () => {
  it("es determinista por fecha", () => {
    expect(sortearDia("2026-11-13")).toEqual(sortearDia("2026-11-13"));
    expect(sortearDia("2026-11-13")).not.toEqual(sortearDia("2026-11-14"));
  });

  it("cada signo recibe un gancho suyo y un compatible que nunca es el propio signo", () => {
    for (const fecha of ["2026-11-13", "2026-12-25", "2027-02-28"]) {
      const s = sortearDia(fecha);
      expect(s.map((x) => x.signo)).toEqual([...SLUGS]);
      for (const x of s) {
        expect(GANCHOS[x.signo]).toContain(x.gancho);
        expect(SLUGS.has(x.compatible)).toBe(true);
        expect(x.compatible).not.toBe(x.signo);
        expect(puertos).toContainEqual(x.puerto);
      }
    }
  });

  // Los ganchos de cada signo rotan en ciclos de 15 días, contados desde 1970-01-01
  const inicioDeCiclo = (fecha: string) => sumarDias(fecha, -(diaNumero(fecha) % 15));
  const ciclo = (inicio: string) => Array.from({ length: 15 }, (_, i) => sortearDia(sumarDias(inicio, i)));

  it("quince días seguidos del mismo ciclo dan quince ganchos distintos en cada signo", () => {
    const primero = inicioDeCiclo("2026-11-13");
    for (const k of [0, 1, 37]) {
      const dias = ciclo(sumarDias(primero, 15 * k));
      for (const signo of SLUGS) {
        const delSigno = dias.map((d) => d.find((x) => x.signo === signo)!.gancho);
        expect(new Set(delSigno).size, signo).toBe(15);
      }
    }
  });

  it("el orden de los ganchos cambia de un ciclo al siguiente", () => {
    const primero = inicioDeCiclo("2026-11-13");
    const orden = (inicio: string) => ciclo(inicio).map((d) => d.map((x) => x.gancho));
    expect(orden(primero)).not.toEqual(orden(sumarDias(primero, 15)));
  });

  it("hash32 es estable", () => {
    expect(hash32("bardo")).toBe(hash32("bardo"));
    expect(hash32("bardo")).not.toBe(hash32("barda"));
  });
});
