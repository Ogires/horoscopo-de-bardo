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

  it("el texto acaba con un signo de cierre: si no, llegó cortado", () => {
    // Visto con GLM-5.3: «…y os dolerá más que elmaintenance»
    const cortado = "Descubriréis un nivel 88 que nombra lo que escribisteis durante años. Nadie os lo había contado, y os dolerá más que elmaintenance";
    expect(motivoInvalida(con({ texto: cortado }), "rust")).toBe("texto_cortado");
    for (const fin of [".", "!", "?", "…", "».", "»", '"']) {
      expect(motivoInvalida(con({ texto: `${cortado.slice(0, -14)}la lluvia${fin}` }), "rust")).toBeNull();
    }
  });

  it("«Evita» va en positivo: si empieza por «no» se leería al revés", () => {
    expect(motivoInvalida(con({ evita: "no confíes en logs vacíos" }), "rust")).toBe("evita_negada");
    expect(motivoInvalida(con({ evita: "No ignores los warnings" }), "rust")).toBe("evita_negada");
    expect(motivoInvalida(con({ evita: "NO tocar producción" }), "rust")).toBe("evita_negada");
    expect(motivoInvalida(con({ evita: "nombrar variables con una letra" }), "rust")).toBeNull();
    expect(motivoInvalida(con({ evita: "fiaros de lo que no habéis probado" }), "rust")).toBeNull();
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

  it("caza palabras pegadas sin tocar identificadores camelCase ni else", () => {
    // Visto con GLM-5.3 el 2026-11-16, en PHP: «y conCredentials de sobra»
    const php = "in_array dirá que sí con una comparación floja. La cadena correcta entrará donde no debía, y conCredentials de sobra.";
    expect(motivoInvalida(con({ texto: php }), "rust")).toBe("pegada");
    expect(motivoInvalida(con({ evita: "fiarte delMaintenance" }), "rust")).toBe("pegada");
    expect(motivoInvalida(con({ compatible: { signo: "go", matiz: "por elRefactor" } }), "rust")).toBe("pegada");
    // Y en minúscula, como «…más que elmaintenance»: ninguna palabra española empieza por «el» y consonante, salvo ell- y elf-
    expect(motivoInvalida(con({ evita: "temer elmaintenance del viernes" }), "rust")).toBe("pegada");
    expect(motivoInvalida(con({ evita: "pegar elcommit sin mirar" }), "rust")).toBe("pegada");
    for (const evita of [
      "llamar a hashCode sin equals", "comparar con isNaN a ciegas", "activar noEmitOnError tarde",
      "abusar de unsafePerformIO", "usar forEach con await", "olvidar el else del if", "un elseif eterno",
      "elegir el elemento que elimina", "escribir en LaTeX de madrugada", "hablar con ellas del elfo",
      "el elm de la tienda", "olvidar el tercer argumento true en in_array", "tocar el ELK de producción",
    ]) {
      expect(motivoInvalida(con({ evita }), "rust"), evita).toBeNull();
    }
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
