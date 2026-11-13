// tests/smoke.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("andamiaje", () => {
  it("sirve los estáticos", async () => {
    const r = await SELF.fetch("https://bardo.webninja.fyi/robots.txt");
    expect(r.status).toBe(200);
  });

  it("tiene una key de mentira para cada proveedor de IA", () => {
    expect(env.GROQ_API_KEY).toBeTruthy();
    expect(env.ZAI_API_KEY).toBeTruthy();
  });

  it("tiene la tabla dias", async () => {
    const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM dias").first<{ n: number }>();
    expect(fila?.n).toBe(0);
  });
});
