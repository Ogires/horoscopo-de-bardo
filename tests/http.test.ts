// tests/http.test.ts
import { describe, expect, it } from "vitest";
import { conCabeceras, CSP } from "../src/http/cabeceras";
import { claveIp, coincideEtag, decodificar, json, redirigir, responder } from "../src/http/util";

describe("ETag", () => {
  it("coincide también con W/ y listas", () => {
    expect(coincideEtag('W/"abc", "def"', '"def"')).toBe(true);
    expect(coincideEtag('W/"abc"', '"abc"')).toBe(true);
    expect(coincideEtag('"abd"', '"abc"')).toBe(false);
    expect(coincideEtag(null, '"abc"')).toBe(false);
  });

  it("responder devuelve 304 si el ETag coincide y sin cuerpo en HEAD", async () => {
    const r1 = await responder(new Request("https://x/"), "hola", "text/plain", "no-cache");
    const etag = r1.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(r1.headers.get("cache-control")).toBe("no-cache");
    expect(await r1.text()).toBe("hola");
    const r2 = await responder(new Request("https://x/", { headers: { "if-none-match": etag } }), "hola", "text/plain", "no-cache");
    expect(r2.status).toBe(304);
    expect(r2.headers.get("etag")).toBe(etag);
    const r3 = await responder(new Request("https://x/", { method: "HEAD" }), "hola", "text/plain", "no-cache");
    expect(await r3.text()).toBe("");
  });

  it("otro cuerpo, otro ETag", async () => {
    const a = await responder(new Request("https://x/"), "hola", "text/plain", "no-cache");
    const b = await responder(new Request("https://x/"), "adiós", "text/plain", "no-cache");
    expect(a.headers.get("etag")).not.toBe(b.headers.get("etag"));
  });
});

describe("utilidades", () => {
  it("json sin caché por defecto", async () => {
    const r = json({ a: 1 }, 404, { "x-otra": "1" });
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-otra")).toBe("1");
    expect(await r.json()).toEqual({ a: 1 });
  });

  it("redirigir con 308 y conserva la query", () => {
    const r = redirigir(new URL("https://x/js?fecha=2026-11-12"), "/javascript");
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("/javascript?fecha=2026-11-12");
  });

  it("decodificar no lanza con un % roto", () => {
    expect(decodificar("c%23")).toBe("c#");
    expect(decodificar("%E0%A4%A")).toBe("");
  });

  it.each([
    ["1.2.3.4", "1.2.3.4"],
    ["::ffff:1.2.3.4", "1.2.3.4"],
    ["2001:db8:abcd:12:1:2:3:4", "2001:db8:abcd:12::/64"],
    ["2001:DB8::1", "2001:db8:0:0::/64"],
    ["2001:db8:0a:00b0::", "2001:db8:a:b0::/64"],
  ])("claveIp(%s) → %s: en IPv6, el /64", (ip, clave) => {
    expect(claveIp(ip)).toBe(clave);
  });
});

describe("conCabeceras", () => {
  it("pone las de seguridad y conserva estado y cuerpo", async () => {
    const r = conCabeceras(new Response("hola", { status: 418, headers: { "content-type": "text/plain" } }));
    expect(r.status).toBe(418);
    expect(await r.text()).toBe("hola");
    expect(r.headers.get("content-type")).toBe("text/plain");
    expect(r.headers.get("content-security-policy")).toBe(CSP);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });

  it("respeta la CSP que ya trae la respuesta (la tarjeta SVG)", () => {
    const propia = "default-src 'none'; style-src 'unsafe-inline'";
    const r = conCabeceras(new Response("<svg/>", { headers: { "content-security-policy": propia } }));
    expect(r.headers.get("content-security-policy")).toBe(propia);
  });
});
