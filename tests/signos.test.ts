// tests/signos.test.ts
import { describe, expect, it } from "vitest";
import { resolverSigno, SIGNOS } from "../src/signos";

describe("signos", () => {
  it("son doce, con slug único", () => {
    expect(SIGNOS).toHaveLength(12);
    expect(new Set(SIGNOS.map((s) => s.slug)).size).toBe(12);
  });

  it("ningún alias choca con un slug ni con otro alias", () => {
    const todos = SIGNOS.flatMap((s) => [s.slug, ...s.alias]);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("resuelve slugs, alias y mayúsculas", () => {
    expect(resolverSigno("rust")?.slug).toBe("rust");
    expect(resolverSigno("js")?.slug).toBe("javascript");
    expect(resolverSigno("cs")?.slug).toBe("csharp");
    expect(resolverSigno("RUST")?.slug).toBe("rust");
    expect(resolverSigno("brainfuck")).toBeNull();
  });
});
