// src/generar/sorteo.ts — lo que decide el código antes de llamar a la IA, determinista por fecha
import ganchos from "../../data/ganchos.json";
import puertos from "../../data/puertos.json";
import { SIGNOS } from "../signos";
import type { Puerto } from "../tipos";

export interface SorteoSigno {
  signo: string;
  /** Hecho cierto del lenguaje alrededor del que se escribe la profecía */
  gancho: string;
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

const DIA_MS = 86_400_000;
const GANCHOS = ganchos as Record<string, string[]>;

// Cada signo rota sus ganchos en ciclos tan largos como su lista: una permutación por
// ciclo y signo, así que dentro de un ciclo ningún gancho del signo sale dos veces
function ganchoDelDia(signo: string, fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const n = Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
  const lista = GANCHOS[signo];
  const ciclo = Math.floor(n / lista.length);
  const orden = barajar(lista, generador(hash32(`ganchos:${signo}:${ciclo}`)));
  return orden[n - ciclo * lista.length];
}

export function sortearDia(fecha: string): SorteoSigno[] {
  const azar = generador(hash32(`sorteo:${fecha}`));
  return SIGNOS.map((s) => {
    const otros = SIGNOS.filter((o) => o.slug !== s.slug);
    return {
      signo: s.slug,
      gancho: ganchoDelDia(s.slug, fecha),
      puerto: puertos[Math.floor(azar() * puertos.length)],
      compatible: otros[Math.floor(azar() * otros.length)].slug,
    };
  });
}
