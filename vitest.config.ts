import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

// Secretos de mentira. Van aquí y no en las vars de wrangler.test.jsonc porque wrangler carga encima
// el .dev.vars local, con las keys reales; los bindings de miniflare se aplican después y ganan.
// ZAI_URL vacía: la API estándar de Z.ai (src/generar/cadena.ts)
const SECRETOS_DE_MENTIRA = {
  GROQ_API_KEY: "clave-de-prueba",
  ZAI_API_KEY: "clave-zai-de-prueba",
  ZAI_URL: "",
  TELEGRAM_BOT_TOKEN: "token-de-prueba",
  TELEGRAM_AVISOS: "42",
};

// Migraciones leídas en Node y pasadas al Worker de test como binding
export default defineConfig(async () => {
  const migraciones = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migraciones, ...SECRETOS_DE_MENTIRA } },
      }),
    ],
    test: { setupFiles: ["./tests/setup.ts"] },
  };
});
