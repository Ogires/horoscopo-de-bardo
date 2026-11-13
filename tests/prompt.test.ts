// tests/prompt.test.ts
import { describe, expect, it } from "vitest";
import banco from "../data/banco.json";
import ganchos from "../data/ganchos.json";
import { ejemplosDelDia, ESQUEMA, mensajeDelDia, MISMA_IDEA, SISTEMA } from "../src/generar/prompt";
import { sortearDia } from "../src/generar/sorteo";
import { SIGNO_POR_SLUG, SIGNOS } from "../src/signos";
import { sumarDias } from "../src/fecha";
import { TOPE_SALIDA } from "../src/generar/cadena";

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

  describe("ejemplos del banco", () => {
    const BANCO = banco as Record<string, { texto: string; evita: string; compatible: { signo: string; matiz: string } }[]>;
    const FECHA = "2026-11-13";

    it("veinticuatro profecías del banco, dos distintas por signo, en el orden del sorteo", () => {
      const sorteo = sortearDia(FECHA);
      const ejemplos = ejemplosDelDia(FECHA, sorteo);
      expect(ejemplos).toHaveLength(24);
      expect(ejemplos.map((e) => e.signo)).toEqual(sorteo.flatMap((s) => [s.signo, s.signo]));
      for (const s of SIGNOS) {
        const suyos = ejemplos.filter((e) => e.signo === s.slug);
        expect(new Set(suyos.map((e) => e.texto)).size).toBe(2);
        // Tal cual están en el banco: texto, «Evita» y compatible con su matiz
        for (const { signo, ...e } of suyos) expect(BANCO[signo]).toContainEqual(e);
      }
    });

    it("se eligen de forma determinista con la fecha y cambian de un día a otro", () => {
      const de = (fecha: string) => ejemplosDelDia(fecha, sortearDia(fecha)).map((e) => e.texto);
      expect(de(FECHA)).toEqual(de(FECHA));
      expect(de(sumarDias(FECHA, 1))).not.toEqual(de(FECHA));
      // En una semana, cada signo enseña más de dos de sus siete profecías
      const semana = Array.from({ length: 7 }, (_, i) => sumarDias(FECHA, i));
      for (const s of SIGNOS) {
        const vistos = new Set(semana.flatMap((f) => ejemplosDelDia(f, sortearDia(f)).filter((e) => e.signo === s.slug).map((e) => e.texto)));
        expect(vistos.size, s.slug).toBeGreaterThan(2);
      }
    });

    it("el día de un gancho no sale de ejemplo la profecía del banco que cuenta lo mismo", () => {
      const strpos = "strpos devuelve 0 si el texto está al principio, y 0 se evalúa como false";
      const deStrpos = BANCO.php.find((e) => e.texto.startsWith("Hoy strpos devolverá 0"))!.texto;
      const fechas = Array.from({ length: 40 }, (_, i) => sumarDias(FECHA, i));
      const textosPhp = (gancho: string) =>
        fechas.flatMap((f) => {
          const sorteo = sortearDia(f).map((s) => (s.signo === "php" ? { ...s, gancho } : s));
          return ejemplosDelDia(f, sorteo).filter((e) => e.signo === "php").map((e) => e.texto);
        });
      expect(textosPhp(strpos)).not.toContain(deStrpos);
      // Con otro gancho sí sale algún día: la prueba no pasa por casualidad
      expect(textosPhp(ganchos.php.find((g) => g.startsWith("en date()"))!)).toContain(deStrpos);
    });

    it("las parejas gancho-profecía con la misma idea existen y son del mismo signo", () => {
      expect(Object.keys(MISMA_IDEA).length).toBeGreaterThan(0);
      for (const [gancho, inicios] of Object.entries(MISMA_IDEA)) {
        const signos = Object.entries(ganchos as Record<string, string[]>).filter(([, l]) => l.includes(gancho)).map(([s]) => s);
        expect(signos, gancho).toHaveLength(1);
        for (const inicio of inicios) {
          expect(BANCO[signos[0]].filter((e) => e.texto.startsWith(inicio)), inicio).toHaveLength(1);
        }
        // Siempre quedan al menos dos profecías para elegir
        expect(BANCO[signos[0]].length - inicios.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("van en el mensaje del día, antes de los signos, con signo, texto, «Evita», compatible y matiz", () => {
      const sorteo = sortearDia(FECHA);
      const m = mensajeDelDia(FECHA, sorteo, new Map());
      const cabecera = "Profecías con el tono buscado (no copies sus frases ni sus ideas):";
      expect(m).toContain(cabecera);
      expect(m.indexOf(cabecera)).toBeLessThan(m.indexOf(`Horóscopo del ${FECHA}`));
      for (const e of ejemplosDelDia(FECHA, sorteo)) {
        const nombre = (slug: string) => SIGNO_POR_SLUG.get(slug)!.nombre;
        expect(m).toContain(`- ${nombre(e.signo)}: "${e.texto}"\n  evita: "${e.evita}" · compatible: ${nombre(e.compatible.signo)}, "${e.compatible.matiz}"`);
      }
    });

    it("el sistema los anuncia y ya no lleva ejemplos escritos a mano", () => {
      expect(SISTEMA).toContain("no copies sus frases ni sus ideas");
      expect(SISTEMA).not.toContain("Ejemplos (no copies sus frases)");
      for (const t of Object.values(BANCO).flat().map((e) => e.texto)) expect(SISTEMA).not.toContain(t);
    });
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

  it("la entrada del tercer día, con los 24 ejemplos, cabe en ~4.200 tokens", () => {
    // Medido con Groq en las iteraciones 2 a 4: ~300 tokens fijos (formato y esquema) más un token
    // por cada 4 caracteres. El tercer día lleva dos días de textos de ~140 caracteres por signo.
    // Los ejemplos cambian cada día: se mira el peor de dos meses
    for (let i = 0; i < 60; i++) {
      const fecha = sumarDias("2026-11-15", i);
      const sorteo = sortearDia(fecha);
      const texto = "x".repeat(140);
      const m = mensajeDelDia(fecha, sorteo, new Map(sorteo.map((s) => [s.signo, [texto, texto]])));
      expect(300 + (SISTEMA.length + m.length) / 4, fecha).toBeLessThanOrEqual(4200);
    }
  });

  it("entrada más tope de salida con low caben en los 8.000 tokens por minuto de Groq", () => {
    expect(4200 + TOPE_SALIDA.low).toBeLessThanOrEqual(8000);
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
