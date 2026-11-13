// tests/tarjeta.test.ts
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { fechaMadrid } from "../src/fecha";
import { diaDelBanco } from "../src/generar/banco";
import { partirLineas, svgTarjeta } from "../src/tarjeta";
import { insertarDia } from "./helpers";

const p = diaDelBanco("2026-11-13")[0];
const alto = (svg: string) => Number(/height="(\d+)"/.exec(svg)![1]);

describe("partirLineas", () => {
  it("no pasa del ancho y corta a la fuerza las palabras largas", () => {
    const l = partirLineas(`hola ${"a".repeat(120)} adiós`, 50);
    for (const x of l) expect([...x].length).toBeLessThanOrEqual(50);
    expect(l.join("").replace(/[-\s]/g, "")).toBe(`hola${"a".repeat(120)}adiós`);
  });
});

describe("svgTarjeta", () => {
  it("escapa el texto y es accesible", () => {
    const svg = svgTarjeta({ ...p, texto: '<script>alert(1)</script> & "x"' }, "2026-11-13", "auto", "bardo.webninja.fyi");
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
  });

  it("la altura crece con el texto", () => {
    const corto = svgTarjeta({ ...p, texto: "x ".repeat(40).trim() }, "2026-11-13", "claro", "h");
    const largo = svgTarjeta({ ...p, texto: "palabra ".repeat(22).trim() }, "2026-11-13", "claro", "h");
    expect(alto(largo)).toBeGreaterThan(alto(corto));
  });

  it("con los textos más largos que acepta el validador, todo cabe dentro de la tarjeta", () => {
    const largo = { ...p, texto: "palabra ".repeat(23).trim().slice(0, 180), evita: "e".repeat(30) + " " + "e".repeat(29), compatible: { ...p.compatible, matiz: "m".repeat(40) } };
    const svg = svgTarjeta(largo, "2026-11-13", "claro", "bardo.webninja.fyi");
    const ys = [...svg.matchAll(/<text[^>]* y="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys)).toBeLessThan(alto(svg));
  });

  it("tema claro sin @media; automático con prefers-color-scheme", () => {
    expect(svgTarjeta(p, "2026-11-13", "claro", "h")).not.toContain("@media");
    expect(svgTarjeta(p, "2026-11-13", "auto", "h")).toContain("prefers-color-scheme: dark");
  });
});

describe("GET /tarjeta/{signo}.svg", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM dias");
    await insertarDia(fechaMadrid(Date.now()));
  });

  it("SVG con no-cache, ETag y su propia CSP", async () => {
    const r = await SELF.fetch("https://bardo.webninja.fyi/tarjeta/rust.svg?tema=oscuro");
    expect(r.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-cache, max-age=0");
    expect(r.headers.get("etag")).toBeTruthy();
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(await r.text()).toContain("<svg");
  });

  it("revalidar con el ETag da 304", async () => {
    const r = await SELF.fetch("https://bardo.webninja.fyi/tarjeta/rust.svg");
    const r2 = await SELF.fetch("https://bardo.webninja.fyi/tarjeta/rust.svg", { headers: { "if-none-match": r.headers.get("etag")! } });
    expect(r2.status).toBe(304);
  });

  it("acepta alias y da 404 a un signo desconocido", async () => {
    expect((await SELF.fetch("https://bardo.webninja.fyi/tarjeta/js.svg")).status).toBe(200);
    expect((await SELF.fetch("https://bardo.webninja.fyi/tarjeta/brainfuck.svg")).status).toBe(404);
  });
});
