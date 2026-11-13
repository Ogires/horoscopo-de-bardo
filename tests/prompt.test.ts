// tests/prompt.test.ts
import { describe, expect, it } from "vitest";
import ganchos from "../data/ganchos.json";
import { TEXTOS_DEL_BANCO } from "../src/generar/banco";
import { EJEMPLOS, ESQUEMA, mensajeDelDia, SISTEMA } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";
import { SIGNO_POR_SLUG } from "../src/signos";
import { motivoInvalida, repite, sextetos } from "../src/generar/validar";

describe("prompt", () => {
  it("el sistema fija las reglas de la sección 5.3", () => {
    for (const frase of ["entre 18 y 26 palabras", "remate", "burlas de perfiles", "despidos", "emojis", "misma palabra", "@Override"]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("vosotros, la profecía alrededor del gancho cierto y «Evita» en infinitivo", () => {
    for (const frase of [
      "segunda persona del plural", "Nunca de tú", "alrededor de él", "No añadas otros hechos técnicos",
      "estés seguro", "no un parte de incidencias", "en infinitivo", 'sin "no" delante',
    ]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("arranques mezclados, fórmulas de juglar, matices y anglicismos con tope", () => {
    for (const frase of [
      "sujeto en tercera persona", "verbo en futuro", '"Bastará un..."', '"Cuando..."', '"Si..."',
      "como mucho cuatro por un verbo en vosotros", "en medio o al final", "como mucho en tres profecías",
      '"El" y "La" también cuentan', 'como mucho tres matices del día empiezan por "que también"', '"testear"',
    ]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("texto y matiz se piden en palabras: el modelo no cuenta caracteres", () => {
    expect(SISTEMA).toContain("dos frases y entre 18 y 26 palabras en total");
    expect(SISTEMA).toContain("de dos a cinco palabras");
    expect(SISTEMA).not.toMatch(/\d+ a \d+ caracteres/);
  });

  it("el matiz no nombra lenguajes: se lee detrás del nombre del compatible", () => {
    expect(SISTEMA).toContain('Va detrás del nombre del compatible ("Go, a regañadientes"): no nombres lenguajes');
  });

  it("es una profecía: nunca en imperativo", () => {
    expect(SISTEMA).toContain('nunca en imperativo ("Compilad", "Incluid")');
  });

  it("fidelidad al gancho: contarlo tal cual, sin exagerarlo ni añadirle consecuencias", () => {
    for (const frase of ["Cuenta exactamente lo que dice", "sin exagerarlo ni añadirle consecuencias técnicas", "no en inventar"]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("el remate varía de forma, es concreto y no tiene un «Bien» que se vuelva plantilla", () => {
    for (const frase of [
      "una consecuencia absurda, la resignación del bardo o un giro irónico", "Nunca una frase abstracta",
      'Mal: "La claridad será una ilusión."', '"Lo notaréis al..."',
    ]) {
      expect(SISTEMA).toContain(frase);
    }
    // Con un solo «Bien», el modelo lo copió en las doce profecías
    expect(SISTEMA).not.toMatch(/El remate[^\n]*Bien:/);
  });

  it("conjugación del vosotros, con la tercera persona como salida", () => {
    for (const frase of ["pondréis, crearéis, enviaréis, dejasteis, habéis", '"-réis", con tilde', "tercera persona (el compilador, un NULL, el unwrap())"]) {
      expect(SISTEMA).toContain(frase);
    }
  });

  it("cuatro ejemplos de tono, completos, válidos y que no salen del banco ni del sorteo", () => {
    const banco = new Set(TEXTOS_DEL_BANCO.flatMap(sextetos));
    expect(EJEMPLOS).toHaveLength(4);
    expect(new Set(EJEMPLOS.map((e) => e.signo)).size).toBe(4);
    for (const e of EJEMPLOS) {
      // Fuera del sorteo: el día de ese gancho, el modelo no tiene un texto que imitar
      expect(Object.values(ganchos).flat()).not.toContain(e.gancho);
      for (const parte of [e.gancho, e.texto, e.evita, e.matiz]) expect(SISTEMA).toContain(parte);
      expect(motivoInvalida({ texto: e.texto, evita: e.evita, compatible: { signo: e.compatible, matiz: e.matiz } }, e.signo)).toBeNull();
      expect(repite(e.texto, banco), e.texto).toBe(false);
    }
  });

  it("los ejemplos tienen la forma pedida: 18-26 palabras, dos frases, matiz de 2 a 5 palabras y arranques variados", () => {
    const primeras = EJEMPLOS.map((e) => e.texto.split(/\s/)[0].toLowerCase());
    expect(new Set(primeras).size).toBe(EJEMPLOS.length);
    const remates: string[] = [];
    for (const e of EJEMPLOS) {
      const palabrasTexto = e.texto.split(/\s+/).length;
      expect(palabrasTexto, e.texto).toBeGreaterThanOrEqual(18);
      expect(palabrasTexto, e.texto).toBeLessThanOrEqual(26);
      expect([...e.texto].length, e.texto).toBeLessThanOrEqual(150);
      // Una frase acaba en . ! o ? seguido de mayúscula: el ? de Rust en medio no cuenta
      const frases = e.texto.split(/(?<=[.!?])\s+(?=\p{Lu})/u);
      expect(frases, e.texto).toHaveLength(2);
      remates.push(frases[1]);
      expect(e.texto, e.texto).not.toMatch(/^(?:os |escuchad|cantan|oíd|cuidado|atended)/i);
      const palabras = e.matiz.split(/\s+/).length;
      expect(palabras, e.matiz).toBeGreaterThanOrEqual(2);
      expect(palabras, e.matiz).toBeLessThanOrEqual(5);
    }
    expect(EJEMPLOS.filter((e) => e.matiz.startsWith("que también")).length).toBeLessThanOrEqual(1);
    // Los ejemplos no pueden enseñar la plantilla de verbos en futuro: como mucho dos empiezan por uno
    expect(EJEMPLOS.filter((e) => /^\p{Lu}\p{Ll}+(?:réis|rán|rá)\s/u.test(e.texto)).length).toBeLessThanOrEqual(2);
    expect(EJEMPLOS.some((e) => /^(?:Cuando|Si)\s/.test(e.texto))).toBe(true);
    // Remates de formas distintas: ninguno con la plantilla «Lo …réis al…» y no dos con la misma palabra
    for (const r of remates) expect(r, r).not.toMatch(/^Lo \p{L}+réis\s/u);
    expect(new Set(remates.map((r) => r.split(/\s/)[0])).size).toBe(remates.length);
  });

  it("el mensaje lleva los doce signos con su gancho, su compatible y los días anteriores", () => {
    const sorteo = sortearDia("2026-11-13");
    const historial = new Map([["rust", ["texto de ayer", "texto de anteayer", "texto de hace tres días"]]]);
    const m = mensajeDelDia("2026-11-13", sorteo, historial);
    for (const s of sorteo) {
      expect(m).toContain(`## ${SIGNO_POR_SLUG.get(s.signo)!.nombre} (${s.signo})\nGancho: ${s.gancho}\nCompatible: ${SIGNO_POR_SLUG.get(s.compatible)!.nombre}\n`);
    }
    expect(m).toContain("- texto de hace tres días");
    expect(m).toContain("Días anteriores: ninguno");
  });

  it("la entrada del tercer día cabe en ~2.600 tokens", () => {
    // Medido con Groq en las iteraciones 2 y 3: ~300 tokens fijos (formato y esquema) más un token
    // por cada 4 caracteres. El tercer día lleva dos días de textos de ~140 caracteres por signo
    const sorteo = sortearDia("2026-11-15");
    const texto = "x".repeat(140);
    const m = mensajeDelDia("2026-11-15", sorteo, new Map(sorteo.map((s) => [s.signo, [texto, texto]])));
    expect(300 + (SISTEMA.length + m.length) / 4).toBeLessThanOrEqual(2600);
  });

  it("el esquema es compatible con el modo strict de Groq", () => {
    const objetos = [ESQUEMA, ESQUEMA.properties.profecias.items];
    for (const o of objetos) {
      expect(o.additionalProperties).toBe(false);
      expect([...o.required].sort()).toEqual(Object.keys(o.properties).sort());
    }
    expect(ESQUEMA.properties.profecias.items.properties.signo.enum).toHaveLength(12);
  });
});
