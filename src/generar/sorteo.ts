// src/generar/sorteo.ts — lo que decide el código antes de llamar a la IA, determinista por fecha
import puertos from "../../data/puertos.json";
import temas from "../../data/temas.json";
import { SIGNOS } from "../signos";
import type { Puerto } from "../tipos";

export interface SorteoSigno {
  signo: string;
  tema: string;
  puerto: Puerto;
  compatible: string;
}

// FNV-1a de 32 bits: estable entre ejecuciones y sin dependencias
export function hash32(texto: string): number {
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(texto)) {
    h ^= c;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: pseudoaleatorio con semilla
function generador(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar<T>(lista: readonly T[], azar: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function sortearDia(fecha: string): SorteoSigno[] {
  const azar = generador(hash32(`sorteo:${fecha}`));
  const temasDelDia = barajar(temas, azar).slice(0, SIGNOS.length);
  return SIGNOS.map((s, i) => {
    const otros = SIGNOS.filter((o) => o.slug !== s.slug);
    return {
      signo: s.slug,
      tema: temasDelDia[i],
      puerto: puertos[Math.floor(azar() * puertos.length)],
      compatible: otros[Math.floor(azar() * otros.length)].slug,
    };
  });
}
