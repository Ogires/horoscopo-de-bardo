// tests/sorteo.test.ts
import { describe, expect, it } from "vitest";
import puertos from "../data/puertos.json";
import temas from "../data/temas.json";
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

  it("hash32 es estable", () => {
    expect(hash32("bardo")).toBe(hash32("bardo"));
    expect(hash32("bardo")).not.toBe(hash32("barda"));
  });
});
