// tests/datos.test.ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { confirmarTelegram, guardarDia, historial, historialDe, leerDia, liberarTelegram, reservarTelegram, sqlSembrar } from "../src/datos";
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

// scripts/sembrar.ts lee y escribe la D1 remota con wrangler: estas son sus piezas puras
describe("sembrar desde la línea de comandos", () => {
  const ejecutar = (sql: string) => env.DB.prepare(sql).run();

  it("historialDe da lo mismo que historial con las filas que devuelve wrangler", async () => {
    const mixto = diaDelBanco("2026-11-12").map((p) =>
      p.signo === "rust" ? p : { ...p, texto: `Texto de la IA para ${p.signo}`, origen: "ia" as const },
    );
    await insertarDia("2026-11-12", { profecias: mixto });
    await insertarDia("2026-11-11", { profecias: diaDelBanco("2026-11-11"), modelo: null });
    const { results } = await env.DB.prepare("SELECT profecias FROM dias ORDER BY fecha DESC").all<{ profecias: string }>();
    expect(historialDe(results)).toEqual(await historial(env.DB, "2026-11-13"));
  });

  it("sin reemplazar, como guardarDia: no pisa un día que ya existe", async () => {
    await insertarDia("2026-11-13", { modelo: "m1" });
    const antes = await leerDia(env.DB, "2026-11-13");
    await ejecutar(sqlSembrar("2026-11-13", diaDelBanco("2026-11-20"), null, 999, false));
    expect(await leerDia(env.DB, "2026-11-13")).toEqual(antes);
    await ejecutar(sqlSembrar("2026-11-14", diaDelBanco("2026-11-14"), "zai:glm-5.3", 999, false));
    const nuevo = await leerDia(env.DB, "2026-11-14");
    expect(nuevo).toEqual({ fecha: "2026-11-14", profecias: diaDelBanco("2026-11-14"), modelo: "zai:glm-5.3", creado_ms: 999, telegram_ms: null });
  });

  it("reemplazando cambia profecías y modelo, y conserva creado_ms y telegram_ms (el canal no lo repite)", async () => {
    await insertarDia("2026-11-13", { modelo: "m1", telegram_ms: 123 });
    const antes = (await leerDia(env.DB, "2026-11-13"))!;
    await ejecutar(sqlSembrar("2026-11-13", diaDelBanco("2026-11-20"), null, 999, true));
    const despues = await leerDia(env.DB, "2026-11-13");
    expect(despues).toEqual({ ...antes, profecias: diaDelBanco("2026-11-20"), modelo: null });
  });

  it("escapa las comillas simples y conserva tildes, eñes y comillas latinas", async () => {
    const raras = diaDelBanco("2026-11-13").map((p, i) =>
      i === 0 ? { ...p, texto: "L'enfer, c'est «les autres»: ñandú, pingüino y ''; DROP TABLE dias; --" } : p,
    );
    await ejecutar(sqlSembrar("2026-11-13", raras, "it's", 1, false));
    const d = await leerDia(env.DB, "2026-11-13");
    expect(d?.profecias).toEqual(raras);
    expect(d?.modelo).toBe("it's");
  });
});
