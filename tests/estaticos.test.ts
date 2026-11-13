// tests/estaticos.test.ts — estilos, fuente, og:image, favicon, página de la API y 404
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RUTAS_API } from "../src/api";
import { COLORES } from "../src/tarjeta";

const BASE = "https://bardo.webninja.fyi";
const pedir = (ruta: string) => SELF.fetch(`${BASE}${ruta}`);

describe("estáticos", () => {
  it("los estilos usan los mismos colores que la tarjeta, con modo oscuro", async () => {
    const css = (await (await pedir("/estilos.css")).text()).toLowerCase();
    for (const tema of [COLORES.claro, COLORES.oscuro]) for (const color of Object.values(tema)) expect(css).toContain(color);
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("/fuentes/im-fell-english-latin-400-normal.woff2");
  });

  it("la fuente se sirve desde la propia web, con su licencia", async () => {
    expect((await pedir("/fuentes/im-fell-english-latin-400-normal.woff2")).status).toBe(200);
    expect(await (await pedir("/fuentes/OFL.txt")).text()).toContain("SIL Open Font License");
  });

  it("og.png de 1200×627", async () => {
    const r = await pedir("/og.png");
    expect(r.headers.get("content-type")).toBe("image/png");
    const v = new DataView(await r.arrayBuffer());
    expect([v.getUint32(16), v.getUint32(20)]).toEqual([1200, 627]);
  });

  it("favicon en SVG", async () => {
    const r = await pedir("/favicon.svg");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("<svg");
  });

  it("la página de la API documenta todas las rutas y enlaza a openapi.json", async () => {
    const r = await pedir("/api/");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    const h = await r.text();
    expect(h).toContain('lang="es"');
    expect(h).toContain('href="/openapi.json"');
    expect(h).toContain('href="/estilos.css"');
    for (const ruta of RUTAS_API) expect(h).toContain(ruta);
  });

  it("la 404 lleva los estilos de la web", async () => {
    const r = await pedir("/no-existe");
    expect(r.status).toBe(404);
    const h = await r.text();
    expect(h).toContain('href="/estilos.css"');
    expect(h).toContain('href="/favicon.svg"');
  });
});
