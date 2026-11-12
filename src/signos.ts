// src/signos.ts — emoji en vez de logos: los logos oficiales son marcas registradas
export interface Signo {
  slug: string;
  nombre: string;
  emoji: string;
  alias: readonly string[];
}

export const SIGNOS: readonly Signo[] = [
  { slug: "rust", nombre: "Rust", emoji: "🦀", alias: ["rs"] },
  { slug: "javascript", nombre: "JavaScript", emoji: "🟨", alias: ["js"] },
  { slug: "python", nombre: "Python", emoji: "🐍", alias: ["py"] },
  { slug: "java", nombre: "Java", emoji: "☕", alias: [] },
  { slug: "csharp", nombre: "C#", emoji: "🎼", alias: ["cs", "c-sharp"] },
  { slug: "go", nombre: "Go", emoji: "🐹", alias: ["golang"] },
  { slug: "php", nombre: "PHP", emoji: "🐘", alias: [] },
  { slug: "cobol", nombre: "COBOL", emoji: "🦕", alias: [] },
  { slug: "typescript", nombre: "TypeScript", emoji: "🔷", alias: ["ts"] },
  { slug: "sql", nombre: "SQL", emoji: "🗄️", alias: [] },
  { slug: "kotlin", nombre: "Kotlin", emoji: "🟣", alias: ["kt"] },
  { slug: "haskell", nombre: "Haskell", emoji: "🎩", alias: ["hs"] },
];

export const SIGNO_POR_SLUG = new Map(SIGNOS.map((s) => [s.slug, s]));
export const SLUGS = new Set(SIGNOS.map((s) => s.slug));
const POR_ALIAS = new Map(SIGNOS.flatMap((s) => s.alias.map((a) => [a, s] as const)));

export function resolverSigno(texto: string): Signo | null {
  const t = texto.toLowerCase();
  return SIGNO_POR_SLUG.get(t) ?? POR_ALIAS.get(t) ?? null;
}
