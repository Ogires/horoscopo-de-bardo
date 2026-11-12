// src/generar/banco.ts — respaldo escrito a mano: la demo nunca se queda en blanco
import banco from "../../data/banco.json";
import type { Profecia } from "../tipos";
import { hash32, sortearDia, type SorteoSigno } from "./sorteo";

interface EntradaBanco {
  texto: string;
  evita: string;
  compatible: { signo: string; matiz: string };
}
const BANCO = banco as Record<string, EntradaBanco[]>;

// Para que la IA no copie el banco: entra en el filtro de copias de la cadena
export const TEXTOS_DEL_BANCO: readonly string[] = Object.values(BANCO).flatMap((l) => l.map((e) => e.texto));

export function profeciaDelBanco(fecha: string, sorteo: SorteoSigno): Profecia {
  const lista = BANCO[sorteo.signo];
  const e = lista[hash32(`banco:${fecha}:${sorteo.signo}`) % lista.length];
  return { signo: sorteo.signo, texto: e.texto, evita: e.evita, compatible: e.compatible, puerto: sorteo.puerto, origen: "banco" };
}

export const diaDelBanco = (fecha: string): Profecia[] => sortearDia(fecha).map((s) => profeciaDelBanco(fecha, s));
