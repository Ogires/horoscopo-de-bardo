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

  // wrangler carga el .dev.vars local (con las keys reales) encima de las vars de wrangler.test.jsonc.
  // Se compara con === para que un fallo no imprima el secreto
  it.each([
    ["GROQ_API_KEY", "clave-de-prueba"],
    ["ZAI_API_KEY", "clave-zai-de-prueba"],
    ["ZAI_URL", ""],
    ["TELEGRAM_BOT_TOKEN", "token-de-prueba"],
    ["TELEGRAM_AVISOS", "42"],
  ])("%s es el de mentira aunque haya un .dev.vars", (nombre, valor) => {
    expect((env as unknown as Record<string, unknown>)[nombre] === valor).toBe(true);
  });

  it("tiene la tabla dias", async () => {
    const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM dias").first<{ n: number }>();
    expect(fila?.n).toBe(0);
  });
});
