// tests/fecha.test.ts
import { describe, expect, it } from "vitest";
import {
  esFechaValida, fechaCorta, fechaLarga, fechaMadrid, fechaObjetivo,
  segundosHastaMedianoche, sumarDias, tareaDeHora,
} from "../src/fecha";

const utc = (a: number, m: number, d: number, h = 0, min = 0) => Date.UTC(a, m - 1, d, h, min);

describe("fechaMadrid", () => {
  it("usa la hora de invierno y la de verano", () => {
    expect(fechaMadrid(utc(2026, 11, 12, 22, 30))).toBe("2026-11-12"); // 23:30 CET
    expect(fechaMadrid(utc(2026, 7, 15, 22, 30))).toBe("2026-07-16"); // 00:30 CEST
  });
});

describe("fechaObjetivo: las dos ejecuciones de la víspera generan el día siguiente", () => {
  it.each([
    ["invierno 21:00", utc(2026, 11, 12, 21), "2026-11-13"],
    ["invierno 22:00", utc(2026, 11, 12, 22), "2026-11-13"],
    ["verano 21:00", utc(2026, 7, 15, 21), "2026-07-16"],
    ["verano 22:00 (medianoche en Madrid)", utc(2026, 7, 15, 22), "2026-07-16"],
    ["víspera del cambio de marzo, 21:00", utc(2026, 3, 28, 21), "2026-03-29"],
    ["víspera del cambio de marzo, 22:00", utc(2026, 3, 28, 22), "2026-03-29"],
    ["día del cambio de marzo, 21:00", utc(2026, 3, 29, 21), "2026-03-30"],
    ["víspera del cambio de octubre, 21:00", utc(2026, 10, 24, 21), "2026-10-25"],
    ["víspera del cambio de octubre, 22:00", utc(2026, 10, 24, 22), "2026-10-25"],
    ["día del cambio de octubre, 21:00", utc(2026, 10, 25, 21), "2026-10-26"],
  ])("%s", (_nombre, ms, esperado) => {
    expect(fechaObjetivo(ms)).toBe(esperado);
  });
});

describe("tareaDeHora", () => {
  it("reparte las cuatro horas del cron", () => {
    expect(tareaDeHora(utc(2026, 11, 12, 21))).toBe("generar");
    expect(tareaDeHora(utc(2026, 11, 12, 22))).toBe("reintentar");
    expect(tareaDeHora(utc(2026, 11, 12, 7))).toBe("publicar");
    expect(tareaDeHora(utc(2026, 11, 12, 8))).toBe("reintentar-publicar");
    expect(tareaDeHora(utc(2026, 11, 12, 12))).toBeNull();
  });
});

describe("utilidades", () => {
  it("segundos hasta la medianoche de Madrid", () => {
    expect(segundosHastaMedianoche(utc(2026, 11, 12, 22, 30))).toBe(1800);
  });

  it("valida fechas reales con formato AAAA-MM-DD", () => {
    expect(esFechaValida("2026-11-12")).toBe(true);
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("2026-1-1")).toBe(false);
    expect(esFechaValida("hoy")).toBe(false);
  });

  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("escribe la fecha en español sin depender de ICU", () => {
    expect(fechaLarga("2026-11-12")).toBe("jueves, 12 de noviembre de 2026");
    expect(fechaCorta("2026-11-12")).toBe("12 nov 2026");
  });
});
