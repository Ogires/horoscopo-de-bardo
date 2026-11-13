// tests/api.test.ts
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, RUTAS_API } from "../src/api";
import { fechaMadrid, sumarDias } from "../src/fecha";
import worker from "../src/index";
import { insertarDia } from "./helpers";

const BASE = "https://bardo.webninja.fyi";
const hoy = fechaMadrid(Date.now());
const ayer = sumarDias(hoy, -1);
const pedir = (ruta: string, init?: RequestInit) => SELF.fetch(`${BASE}${ruta}`, init);

beforeEach(async () => {
  await env.DB.exec("DELETE FROM dias");
  await insertarDia(hoy);
  await insertarDia(ayer);
});

describe("rutas", () => {
  it("/api/v1/signos", async () => {
    const r = await pedir("/api/v1/signos");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const { signos } = await r.json<{ signos: { slug: string; alias: string[] }[] }>();
    expect(signos).toHaveLength(12);
    expect(signos.find((s) => s.slug === "javascript")?.alias).toEqual(["js"]);
  });

  it("/api/v1/hoy con ETag, 304 y caché de hoy", async () => {
    const r = await pedir("/api/v1/hoy");
    const cuerpo = await r.json<{ fecha: string; profecias: unknown[] }>();
    expect(cuerpo.fecha).toBe(hoy);
    expect(cuerpo.profecias).toHaveLength(12);
    expect(Number(/max-age=(\d+)/.exec(r.headers.get("cache-control")!)![1])).toBeLessThanOrEqual(3600);
    const r2 = await pedir("/api/v1/hoy", { headers: { "if-none-match": r.headers.get("etag")! } });
    expect(r2.status).toBe(304);
    expect(r2.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("/api/v1/signos/{signo}, con ?fecha y alias", async () => {
    const r = await pedir(`/api/v1/signos/rust?fecha=${ayer}`);
    const p = await r.json<{ fecha: string; signo: string; origen: string }>();
    expect(p).toMatchObject({ fecha: ayer, signo: "rust", origen: "ia" });
    const alias = await pedir(`/api/v1/signos/js?fecha=${ayer}`, { redirect: "manual" });
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe(`/api/v1/signos/javascript?fecha=${ayer}`);
  });

  it("/api/v1/dias/{fecha}", async () => {
    const r = await pedir(`/api/v1/dias/${ayer}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=86400");
    expect((await r.json<{ fecha: string }>()).fecha).toBe(ayer);
  });

  it("HEAD sin cuerpo", async () => {
    const r = await pedir("/api/v1/hoy", { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toBeTruthy();
    expect(await r.text()).toBe("");
  });

  it("sin fila hoy, sirve el banco con caché corta", async () => {
    await env.DB.exec("DELETE FROM dias");
    const r = await pedir("/api/v1/hoy");
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    const { profecias } = await r.json<{ profecias: { origen: string }[] }>();
    expect(profecias.every((p) => p.origen === "banco")).toBe(true);
  });

  it("cabecera X-Bardo-Consejo en ASCII", async () => {
    const consejo = (await pedir("/api/v1/signos/rust")).headers.get("x-bardo-consejo")!;
    expect(consejo.length).toBeGreaterThan(0);
    expect(/^[\x20-\x7e]+$/.test(consejo)).toBe(true);
  });

  it("con las cabeceras de seguridad", async () => {
    const r = await pedir("/api/v1/hoy");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});

describe("errores", () => {
  it.each([
    ["/api/v1/signos/brainfuck", 404, "signo_desconocido"],
    ["/api/v1/dias/2026-02-30", 400, "fecha_invalida"],
    [`/api/v1/signos/rust?fecha=${sumarDias(hoy, 1)}`, 404, "fuera_de_rango"],
    [`/api/v1/dias/${sumarDias(hoy, 1)}`, 404, "fuera_de_rango"],
    ["/api/v1/dias/2025-12-31", 404, "fuera_de_rango"],
    ["/api/v1/nada", 404, "ruta_desconocida"],
  ])("%s → %i", async (ruta, status, error) => {
    const r = await pedir(ruta);
    expect(r.status).toBe(status);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const cuerpo = await r.json<{ error: string; mensaje: string }>();
    expect(cuerpo.error).toBe(error);
    expect(cuerpo.mensaje.length).toBeGreaterThan(0);
  });

  it("OPTIONS 204 (también para revalidar con If-None-Match) y POST 405", async () => {
    const pre = await pedir("/api/v1/hoy", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toBe("if-none-match");
    const r = await pedir("/api/v1/hoy", { method: "POST" });
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("429 si el rate limit dice que no", async () => {
    const rl = { limit: async () => ({ success: false }) } as unknown as RateLimit;
    // Si el spread no copiara los bindings de env, el 429 sale antes de tocarlos: basta con RL
    const r = await api(new Request(`${BASE}/api/v1/hoy`), { ...env, RL: rl }, Date.now());
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
  });

  it("un error sin controlar da 503 en JSON, sin stack y con las cabeceras", async () => {
    const rl = { limit: async () => { throw new Error("secreto interno"); } } as unknown as RateLimit;
    const r = await worker.fetch(new Request(`${BASE}/api/v1/hoy`), { ...env, RL: rl });
    expect(r.status).toBe(503);
    const texto = await r.text();
    expect(JSON.parse(texto).error).toBe("mantenimiento");
    expect(texto).not.toContain("secreto interno");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("openapi.json", () => {
  it("documenta exactamente las rutas del Worker", async () => {
    const r = await pedir("/openapi.json");
    expect(r.status).toBe(200);
    const doc = await r.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual([...RUTAS_API].sort());
  });
});
