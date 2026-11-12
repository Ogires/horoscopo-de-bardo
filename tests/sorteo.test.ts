// tests/sorteo.test.ts
import { describe, expect, it } from "vitest";
import puertos from "../data/puertos.json";
import temas from "../data/temas.json";
import { sumarDias } from "../src/fecha";
import { hash32, sortearDia } from "../src/generar/sorteo";
import { SLUGS } from "../src/signos";

describe("datos del sorteo", () => {
  it("al menos 36 temas, únicos y cortos", () => {
    expect(temas.length).toBeGreaterThanOrEqual(36);
    expect(new Set(temas).size).toBe(temas.length);
    for (const t of temas) {
      expect(t.length).toBeGreaterThan(3);
      expect(t.length).toBeLessThanOrEqual(80);
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

  it("da doce temas distintos y un compatible que nunca es el propio signo", () => {
    for (const fecha of ["2026-11-13", "2026-12-25", "2027-02-28"]) {
      const s = sortearDia(fecha);
      expect(s.map((x) => x.signo)).toEqual([...SLUGS]);
      expect(new Set(s.map((x) => x.tema)).size).toBe(12);
      for (const x of s) {
        expect(SLUGS.has(x.compatible)).toBe(true);
        expect(x.compatible).not.toBe(x.signo);
        expect(puertos).toContainEqual(x.puerto);
      }
    }
  });

  // El 2026-11-13 es el día 20.770 desde 1970-01-01, múltiplo de 5: abre un ciclo de temas
  const ciclo = (inicio: string) => [0, 1, 2, 3, 4].map((i) => sortearDia(sumarDias(inicio, i)).map((x) => x.tema));

  it("los cinco días de un ciclo usan los 60 temas sin repetir ninguno", () => {
    for (const k of [0, 1, 37]) {
      const dias = ciclo(sumarDias("2026-11-13", 5 * k));
      expect(new Set(dias.flat()).size).toBe(60);
    }
  });

  it("dos días seguidos del mismo ciclo no comparten tema", () => {
    const dias = ciclo("2026-11-13");
    for (let i = 0; i < 4; i++) {
      expect(dias[i].filter((t) => dias[i + 1].includes(t))).toEqual([]);
    }
  });

  it("los temas de un ciclo cambian de orden en el siguiente", () => {
    expect(ciclo("2026-11-13")).not.toEqual(ciclo("2026-11-18"));
  });

  it("hash32 es estable", () => {
    expect(hash32("bardo")).toBe(hash32("bardo"));
    expect(hash32("bardo")).not.toBe(hash32("barda"));
  });
});
