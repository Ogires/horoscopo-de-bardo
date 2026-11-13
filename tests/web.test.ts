// tests/web.test.ts
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { fechaMadrid, sumarDias } from "../src/fecha";
import { diaDelBanco } from "../src/generar/banco";
import { pagina } from "../src/web/paginas";
import { insertarDia } from "./helpers";

const BASE = "https://bardo.webninja.fyi";
const hoy = fechaMadrid(Date.now());
const ayer = sumarDias(hoy, -1);
const html = async (ruta: string) => (await SELF.fetch(`${BASE}${ruta}`)).text();

beforeEach(async () => {
  await env.DB.exec("DELETE FROM dias");
  await insertarDia(hoy);
  await insertarDia(ayer);
});

describe("páginas", () => {
  it("portada con los doce signos y og:image", async () => {
    const h = await html("/");
    expect(h.match(/href="\/(rust|javascript|python|java|csharp|go|php|cobol|typescript|sql|kotlin|haskell)"/g)).toHaveLength(12);
    expect(h).toContain(`<meta property="og:image" content="${BASE}/og.png">`);
    expect(h).toContain('lang="es"');
  });

  it("página de signo con los dos fragmentos para el README", async () => {
    const h = await html("/rust");
    expect(h).toContain(`${BASE}/tarjeta/rust.svg?tema=oscuro`);
    expect(h).toContain(`[![Horóscopo de Bardo: Rust](${BASE}/tarjeta/rust.svg)](${BASE}/rust)`.replace(/&/g, "&amp;"));
    expect(h).not.toContain("archivo del Bardo");
  });

  it("una cita dentro de la profecía no repite las comillas latinas", async () => {
    const p = diaDelBanco(hoy).map((x) => ({ ...x, origen: "ia" as const }));
    p[0] = { ...p[0], texto: "Un unwrap() que dejasteis «solo para probar» caerá en producción delante de todos." };
    await insertarDia(hoy, { profecias: p });
    expect(await html("/rust")).toContain("«Un unwrap() que dejasteis “solo para probar” caerá");
  });

  it("avisa cuando la profecía sale del banco", async () => {
    await insertarDia(hoy, { profecias: diaDelBanco(hoy) });
    expect(await html("/rust")).toContain("Sacado del archivo del Bardo");
  });

  it("alias y mayúsculas redirigen con 308", async () => {
    const r = await SELF.fetch(`${BASE}/JS`, { redirect: "manual" });
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("/javascript");
  });

  it("archivo: hoy sin enlace al día siguiente; ayer, con él; mañana, 404", async () => {
    expect(await html(`/h/${hoy}`)).not.toContain('rel="next"');
    expect(await html(`/h/${ayer}`)).toContain('rel="next"');
    expect((await SELF.fetch(`${BASE}/h/${sumarDias(hoy, 1)}`)).status).toBe(404);
  });

  it("antes del lanzamiento no hay enlace al día anterior, que daría 404", async () => {
    const r = await pagina(new Request(`${BASE}/h/${hoy}`), { ...env, FECHA_LANZAMIENTO: hoy }, "dia", hoy, Date.now());
    expect(await r.text()).not.toContain('rel="prev"');
    expect(await html(`/h/${hoy}`)).toContain('rel="prev"');
  });

  it("enlaza al canal de Telegram solo si existe", async () => {
    expect(await html("/")).toContain('href="https://t.me/canal_de_prueba"');
    const r = await pagina(new Request(`${BASE}/`), { ...env, TELEGRAM_CANAL: "@pendiente" }, "portada", "", Date.now());
    expect(await r.text()).not.toContain("t.me/");
  });

  it("escapa el texto de las profecías", async () => {
    const p = diaDelBanco(hoy).map((x) => ({ ...x, origen: "ia" as const }));
    p[0] = { ...p[0], texto: '<img src=x onerror="alert(1)">' };
    await insertarDia(hoy, { profecias: p });
    const h = await html("/rust");
    expect(h).not.toContain("<img src=x");
    expect(h).toContain("&lt;img src=x");
  });

  it("lleva las cabeceras de seguridad y 405 a los POST", async () => {
    const r = await SELF.fetch(`${BASE}/`);
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect((await SELF.fetch(`${BASE}/`, { method: "POST" })).status).toBe(405);
  });

  it("una ruta desconocida da 404", async () => {
    expect((await SELF.fetch(`${BASE}/no-existe`)).status).toBe(404);
  });
});
