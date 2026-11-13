// tests/datos.test.ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { confirmarTelegram, guardarDia, historial, leerDia, liberarTelegram, reservarTelegram } from "../src/datos";
import { diaDelBanco } from "../src/generar/banco";
import { insertarDia } from "./helpers";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM dias");
});

describe("datos", () => {
  it("guardarDia no pisa un día existente", async () => {
    const a = diaDelBanco("2026-11-13");
    expect(await guardarDia(env.DB, "2026-11-13", a, "m1", 1)).toBe(true);
    expect(await guardarDia(env.DB, "2026-11-13", diaDelBanco("2026-11-14"), "m2", 2)).toBe(false);
    const d = await leerDia(env.DB, "2026-11-13");
    expect(d?.modelo).toBe("m1");
    expect(d?.profecias).toEqual(a);
    expect(d?.telegram_ms).toBeNull();
  });

  it("leerDia devuelve null si no hay día", async () => {
    expect(await leerDia(env.DB, "2026-11-13")).toBeNull();
  });

  it("historial: días anteriores, del más reciente al más antiguo, con tope", async () => {
    for (const f of ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) await insertarDia(f);
    const h = await historial(env.DB, "2026-11-13", 2);
    const rust = h.get("rust")!;
    expect(rust).toHaveLength(2);
    expect(rust[0]).toBe((await leerDia(env.DB, "2026-11-12"))!.profecias.find((p) => p.signo === "rust")!.texto);
    expect(rust[1]).toBe((await leerDia(env.DB, "2026-11-11"))!.profecias.find((p) => p.signo === "rust")!.texto);
  });

  it("historial: solo los textos de la IA, nunca los del banco", async () => {
    // Un día mixto: rust salió del banco y los demás de la IA (con textos propios)
    const mixto = diaDelBanco("2026-11-12").map((p) =>
      p.signo === "rust" ? p : { ...p, texto: `Texto de la IA para ${p.signo}`, origen: "ia" as const },
    );
    await insertarDia("2026-11-12", { profecias: mixto });
    // Un día entero del banco: no aporta nada
    await insertarDia("2026-11-11", { profecias: diaDelBanco("2026-11-11"), modelo: null });
    const h = await historial(env.DB, "2026-11-13");
    expect(h.has("rust")).toBe(false);
    expect(h.get("python")).toEqual(["Texto de la IA para python"]);
    expect([...h.values()].flat().sort()).toEqual(mixto.filter((p) => p.signo !== "rust").map((p) => p.texto).sort());
  });

  it("reserva de Telegram: solo una vez, y se libera si falla", async () => {
    await insertarDia("2026-11-13");
    expect(await reservarTelegram(env.DB, "2026-11-13")).toBe(true);
    expect(await reservarTelegram(env.DB, "2026-11-13")).toBe(false);
    expect((await leerDia(env.DB, "2026-11-13"))?.telegram_ms).toBe(-1);
    await liberarTelegram(env.DB, "2026-11-13");
    expect((await leerDia(env.DB, "2026-11-13"))?.telegram_ms).toBeNull();
    expect(await reservarTelegram(env.DB, "2026-11-13")).toBe(true);
    await confirmarTelegram(env.DB, "2026-11-13", 123);
    expect((await leerDia(env.DB, "2026-11-13"))?.telegram_ms).toBe(123);
  });

  it("liberarTelegram no toca un día ya publicado", async () => {
    await insertarDia("2026-11-13", { telegram_ms: 123 });
    await liberarTelegram(env.DB, "2026-11-13");
    expect((await leerDia(env.DB, "2026-11-13"))?.telegram_ms).toBe(123);
    expect(await reservarTelegram(env.DB, "2026-11-13")).toBe(false);
  });
});
