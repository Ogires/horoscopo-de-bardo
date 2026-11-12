// src/tipos.ts
export interface Puerto {
  numero: number;
  servicio: string;
}

export type Origen = "ia" | "banco";

export interface Profecia {
  signo: string;
  texto: string;
  puerto: Puerto;
  compatible: { signo: string; matiz: string };
  evita: string;
  origen: Origen;
}

export interface Dia {
  fecha: string;
  profecias: Profecia[];
  modelo: string | null;
  creado_ms: number;
  telegram_ms: number | null;
}
