// src/env.ts
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RL: RateLimit;
  MODELO: string;
  MODELO_RESPALDO: string;
  TELEGRAM_CANAL: string;
  FECHA_LANZAMIENTO: string;
  URL_PUBLICA: string;
  GROQ_API_KEY: string;
  /** Para los modelos con el prefijo zai: (src/generar/cadena.ts) */
  ZAI_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_AVISOS: string;
}
