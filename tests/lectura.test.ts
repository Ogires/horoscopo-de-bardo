// tests/lectura.test.ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { fechaMadrid, sumarDias } from "../src/fecha";
import { cacheControl, diaParaMostrar } from "../src/lectura";
import { insertarDia } from "./helpers";

const ahora = Date.now();
const hoy = fechaMadrid(ahora);
beforeEach(async () => {
  await env.DB.exec("DELETE FROM dias");
});

describe("diaParaMostrar", () => {
  it("lee el día de D1", async () => {
    await insertarDia(hoy);
    const c = await diaParaMostrar(env, hoy, ahora);
    expect(c.ok && c.dia.reserva).toBe(false);
    expect(c.ok && c.dia.modelo).toBe("openai/gpt-oss-120b");
  });

  it("sin fila, o con D1 caído, sirve el banco como reserva", async () => {
    const c = await diaParaMostrar(env, hoy, ahora);
    expect(c.ok && c.dia.reserva).toBe(true);
    const caida = { DB: { prepare: () => { throw new Error("D1 caído"); } } as unknown as D1Database, FECHA_LANZAMIENTO: env.FECHA_LANZAMIENTO };
    const c2 = await diaParaMostrar(caida, hoy, ahora);
    expect(c2.ok && c2.dia.profecias.every((p) => p.origen === "banco")).toBe(true);
  });

  it("rechaza fechas mal escritas, futuras o anteriores al lanzamiento", async () => {
    expect(await diaParaMostrar(env, "2026-02-30", ahora)).toEqual({ ok: false, error: "fecha_invalida" });
    expect(await diaParaMostrar(env, "hoy", ahora)).toEqual({ ok: false, error: "fecha_invalida" });
    expect(await diaParaMostrar(env, sumarDias(hoy, 1), ahora)).toEqual({ ok: false, error: "fuera_de_rango" });
    expect(await diaParaMostrar(env, "2025-12-31", ahora)).toEqual({ ok: false, error: "fuera_de_rango" });
  });

  it("el día siguiente no se enseña aunque ya esté en D1", async () => {
    await insertarDia(sumarDias(hoy, 1));
    expect(await diaParaMostrar(env, sumarDias(hoy, 1), ahora)).toEqual({ ok: false, error: "fuera_de_rango" });
  });

  it("hoy siempre se sirve, aunque el lanzamiento sea después", async () => {
    const c = await diaParaMostrar({ DB: env.DB, FECHA_LANZAMIENTO: sumarDias(hoy, 5) }, hoy, ahora);
    expect(c.ok).toBe(true);
  });
});

describe("cacheControl", () => {
  it("hoy hasta medianoche con tope de una hora; reserva 60 s; pasado un día", () => {
    const base = { profecias: [], modelo: null };
    const max = Number(/max-age=(\d+)/.exec(cacheControl({ ...base, fecha: hoy, reserva: false }, ahora))![1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(3600);
    expect(cacheControl({ ...base, fecha: hoy, reserva: true }, ahora)).toBe("public, max-age=60");
    expect(cacheControl({ ...base, fecha: sumarDias(hoy, -1), reserva: false }, ahora)).toBe("public, max-age=86400");
  });

  it("a las 23:59:30 de Madrid, hoy caduca a medianoche", () => {
    const casiMedianoche = Date.UTC(2026, 10, 13, 22, 59, 30); // invierno: UTC+1
    const base = { profecias: [], modelo: null, reserva: false };
    expect(cacheControl({ ...base, fecha: "2026-11-13" }, casiMedianoche)).toBe("public, max-age=30");
  });
});
