-- Una fila por día de Madrid. telegram_ms: NULL sin publicar · -1 publicando · >0 publicado
CREATE TABLE dias (
  fecha        TEXT PRIMARY KEY,
  profecias    TEXT NOT NULL,
  modelo       TEXT,
  creado_ms    INTEGER NOT NULL,
  telegram_ms  INTEGER
);
