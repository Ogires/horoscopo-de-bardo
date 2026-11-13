// src/texto.ts — escape para HTML, XML (SVG) y el HTML de Telegram (admite entidades numéricas)
const ENTIDADES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapar = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTIDADES[c]);

// Las cabeceras HTTP no admiten caracteres fuera de Latin-1: se quitan tildes y lo demás
export const aAscii = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7e]/g, "");

// Entre comillas latinas; las citas de dentro pasan a inglesas («…“…”…»), como pide la RAE
export const entreComillas = (s: string): string => `«${s.replace(/«/g, "“").replace(/»/g, "”")}»`;
