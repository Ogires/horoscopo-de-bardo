// tests/setup.ts — migraciones (idempotente: el setup corre por fichero)
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
