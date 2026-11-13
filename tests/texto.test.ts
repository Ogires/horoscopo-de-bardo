// tests/texto.test.ts
import { describe, expect, it } from "vitest";
import { aAscii, escapar } from "../src/texto";

describe("texto", () => {
  it("escapar cubre los cinco caracteres de HTML y XML", () => {
    expect(escapar(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(escapar("Compilaréis")).toBe("Compilaréis");
  });

  it("aAscii quita tildes y lo que no cabe en una cabecera HTTP", () => {
    expect(aAscii("Evita: añadir más «unwrap()» 🦀")).toBe("Evita: anadir mas unwrap() ");
  });
});
