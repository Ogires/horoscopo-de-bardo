// src/env.ts
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RL: RateLimit;
  MODELO: string;
  /** Vacío: sin respaldo; si cae MODELO, el banco (modelosDe en src/generar/cadena.ts) */
  MODELO_RESPALDO: string;
  /** Vacío o «@pendiente» mientras el canal no existe: no se publica (canalDe en src/telegram.ts) */
  TELEGRAM_CANAL?: string;
  FECHA_LANZAMIENTO: string;
  URL_PUBLICA: string;
  /** Solo si hay un modelo de Groq (sin el prefijo zai:) en MODELO o MODELO_RESPALDO */
  GROQ_API_KEY?: string;
  /** Para los modelos con el prefijo zai: (src/generar/cadena.ts) */
  ZAI_API_KEY: string;
  /** Opcional: otro endpoint de Z.ai. Sin ella, la API estándar (ZAI_URL en src/generar/cadena.ts) */
  ZAI_URL?: string;
  /** Sin él, el cron no publica ni avisa */
  TELEGRAM_BOT_TOKEN?: string;
  /** Chat privado del administrador; sin él, no hay avisos */
  TELEGRAM_AVISOS?: string;
}
