// tests/telegram.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { diaDelBanco } from "../src/generar/banco";
import { LIMITES } from "../src/generar/validar";
import { enviarTelegram, textoTelegram } from "../src/telegram";
import { interceptar, restaurarFetch } from "./helpers";

afterEach(restaurarFetch);

// Lo que cuenta Telegram: el texto después de quitar etiquetas y entidades
const visible = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

describe("textoTelegram", () => {
  it("lleva la fecha, los doce signos y el enlace", () => {
    const t = textoTelegram("2026-11-13", diaDelBanco("2026-11-13"), "https://bardo.webninja.fyi");
    expect(t).toContain("viernes, 13 de noviembre de 2026");
    expect(t).toContain("<b>Rust</b>");
    expect(t).toContain("<b>COBOL</b>");
    expect(t).toContain("🦀 <b>Rust</b>");
    expect(t.match(/<b>/g)).toHaveLength(13); // el título y los doce signos
    expect(t).toContain('<a href="https://bardo.webninja.fyi">bardo.webninja.fyi</a>');
  });

  it("escapa el HTML de las profecías", () => {
    const p = diaDelBanco("2026-11-13");
    p[0] = { ...p[0], texto: "<b>hola</b> & <script>" };
    const t = textoTelegram("2026-11-13", p, "https://bardo.webninja.fyi");
    expect(t).toContain("&lt;b&gt;hola&lt;/b&gt; &amp; &lt;script&gt;");
  });

  it("con los doce textos al máximo cabe en 4.096 caracteres", () => {
    const p = diaDelBanco("2026-11-13").map((x) => ({ ...x, texto: "&".repeat(LIMITES.texto[1]) }));
    expect(visible(textoTelegram("2026-11-13", p, "https://bardo.webninja.fyi")).length).toBeLessThanOrEqual(4096);
  });
});

describe("enviarTelegram", () => {
  it("llama a sendMessage con HTML", async () => {
    const llamadas = interceptar((url) => (url.startsWith("https://api.telegram.org/") ? Response.json({ ok: true }) : null));
    expect(await enviarTelegram("TOKEN", "@canal", "hola")).toBe(true);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(llamadas[0].cuerpo).toMatchObject({ chat_id: "@canal", text: "hola", parse_mode: "HTML" });
  });

  it("devuelve false si Telegram falla o la red se cae", async () => {
    interceptar((url) => (url.startsWith("https://api.telegram.org/") ? new Response("no", { status: 400 }) : null));
    expect(await enviarTelegram("TOKEN", "@canal", "hola")).toBe(false);
    interceptar((url) => {
      if (url.startsWith("https://api.telegram.org/")) throw new Error("red");
      return null;
    });
    expect(await enviarTelegram("TOKEN", "@canal", "hola")).toBe(false);
  });
});
