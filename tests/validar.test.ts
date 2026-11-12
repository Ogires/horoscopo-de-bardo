// tests/validar.test.ts
import { describe, expect, it } from "vitest";
import { motivoInvalida, repite, sextetos } from "../src/generar/validar";

const buena = {
  texto: "Hoy el compilador os hablará con crueldad, y tendrá razón. Un lifetime que creíais domado volverá a por vos.",
  evita: "hacer clone() para callarlo",
  compatible: { signo: "go", matiz: "a regañadientes" },
};
const con = (cambios: Partial<typeof buena>) => ({ ...buena, ...cambios });

describe("motivoInvalida", () => {
  it("acepta una profecía correcta", () => {
    expect(motivoInvalida(buena, "rust")).toBeNull();
  });

  it("longitudes: texto de 80 a 180, evita hasta 60 y matiz hasta 40", () => {
    expect(motivoInvalida(con({ texto: "Corto." }), "rust")).toBe("longitud_texto");
    expect(motivoInvalida(con({ texto: "a ".repeat(91) }), "rust")).toBe("longitud_texto");
    expect(motivoInvalida(con({ evita: "x".repeat(61) }), "rust")).toBe("longitud_evita");
    expect(motivoInvalida(con({ compatible: { signo: "go", matiz: "x".repeat(41) } }), "rust")).toBe("longitud_matiz");
  });

  it("el compatible es otro signo que existe", () => {
    expect(motivoInvalida(con({ compatible: { signo: "rust", matiz: "consigo mismo" } }), "rust")).toBe("compatible");
    expect(motivoInvalida(con({ compatible: { signo: "c", matiz: "a regañadientes" } }), "rust")).toBe("compatible");
  });

  it("veta palabrotas y temas sensibles sin falsos positivos por subcadena", () => {
    expect(motivoInvalida(con({ evita: "decir joder en la daily" }), "rust")).toBe("vetada");
    expect(motivoInvalida(con({ evita: "hablar de despidos" }), "rust")).toBe("vetada");
    expect(motivoInvalida(con({ evita: "computar con prisa" }), "rust")).toBeNull();
    expect(motivoInvalida(con({ evita: "decir adiós a producción" }), "rust")).toBeNull();
  });

  it("sin enlaces, menciones ni emojis", () => {
    expect(motivoInvalida(con({ evita: "leer https://ejemplo.com" }), "rust")).toBe("enlace");
    expect(motivoInvalida(con({ evita: "fiarte de algo.com" }), "rust")).toBe("enlace");
    expect(motivoInvalida(con({ evita: "contestar a @alguien" }), "rust")).toBe("enlace");
    expect(motivoInvalida(con({ evita: "abrir package.json sin miedo" }), "rust")).toBeNull();
    expect(motivoInvalida(con({ evita: "desplegar sin mirar 🚀" }), "rust")).toBe("emoji");
  });
});

describe("repeticiones de 6 palabras", () => {
  it("normaliza mayúsculas, tildes y puntuación", () => {
    expect(sextetos("Uno, dos; TRES cuatro cinco séis siete")).toEqual([
      "uno dos tres cuatro cinco seis",
      "dos tres cuatro cinco seis siete",
    ]);
  });

  it("detecta una secuencia repetida de días anteriores", () => {
    const previos = new Set(sextetos("El borrow checker os negará el pan de cada día."));
    expect(repite("Hoy el borrow checker os negará el pan y la sal.", previos)).toBe(true);
    expect(repite("Un lifetime olvidado volverá a por vos antes de comer.", previos)).toBe(false);
  });
});
