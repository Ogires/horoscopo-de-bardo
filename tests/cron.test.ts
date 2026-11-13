// tests/cron.test.ts
import { createExecutionContext, createScheduledController, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { depsCron, ejecutarCron, type DepsCron } from "../src/cron";
import { leerDia } from "../src/datos";
import type { Env } from "../src/env";
import { diaDelBanco } from "../src/generar/banco";
import type { DiaGenerado } from "../src/generar/cadena";
import worker from "../src/index";
import { insertarDia, interceptar, profeciasIa, respuestaGroq, restaurarFetch, ZAI_URL } from "./helpers";

const a = (h: number, dia = 12) => Date.UTC(2026, 10, dia, h); // noviembre: invierno
const TELEGRAM = "https://api.telegram.org/";

// Nada sale a la red: lo que no responde el manejador recibe un 599 (y queda en las llamadas)
const red = (m: (url: string) => Response | null) =>
  interceptar((url) => m(url) ?? new Response("sin red en los tests", { status: 599 }));

function deps(o: { generado?: Partial<DiaGenerado>; telegramOk?: boolean; canal?: string | null; avisos?: string | null } = {}) {
  const generaciones: { fecha: string; historial: Map<string, string[]> }[] = [];
  const mensajes: { chat: string; texto: string }[] = [];
  const d: DepsCron = {
    db: env.DB,
    generar: async (fecha, historial) => {
      generaciones.push({ fecha, historial });
      return { profecias: diaDelBanco(fecha), modelo: "zai:glm-5.3", fallos: [], descartadas: [], tokens: 4500, ...o.generado };
    },
    telegram: async (chat, texto) => {
      mensajes.push({ chat, texto });
      return o.telegramOk ?? true;
    },
    canal: o.canal === undefined ? "@canal" : o.canal,
    avisos: o.avisos === undefined ? "42" : o.avisos,
    urlPublica: "https://bardo.webninja.fyi",
    ahora: () => 1_000,
  };
  return { d, generaciones, mensajes };
}

const programar = (ms: number, e: Env = env) =>
  worker.scheduled!(createScheduledController({ scheduledTime: ms, cron: "0 21,22,7,8 * * *" }), e, createExecutionContext());

beforeEach(async () => {
  await env.DB.exec("DELETE FROM dias");
});
afterEach(restaurarFetch);

describe("generar y reintentar", () => {
  it("a las 21:00 genera y guarda el día siguiente de Madrid", async () => {
    const { d, generaciones } = deps();
    expect(await ejecutarCron(a(21), d)).toBe("generar:zai:glm-5.3");
    expect(generaciones[0].fecha).toBe("2026-11-13");
    expect((await leerDia(env.DB, "2026-11-13"))?.modelo).toBe("zai:glm-5.3");
  });

  it("pasa el historial de los días anteriores", async () => {
    await insertarDia("2026-11-12");
    const { d, generaciones } = deps();
    await ejecutarCron(a(21), d);
    expect(generaciones[0].historial.get("rust")).toHaveLength(1);
  });

  it("si el día ya existe, no hace nada", async () => {
    await insertarDia("2026-11-13");
    const { d, generaciones } = deps();
    expect(await ejecutarCron(a(22), d)).toBe("reintentar:ya_existe");
    expect(generaciones).toHaveLength(0);
  });

  it("a las 21:00, con la IA caída, no guarda: espera al reintento", async () => {
    const { d, mensajes } = deps({ generado: { modelo: null } });
    expect(await ejecutarCron(a(21), d)).toBe("generar:ia_caida");
    expect(await leerDia(env.DB, "2026-11-13")).toBeNull();
    expect(mensajes).toHaveLength(0);
  });

  it("a las 22:00, si la IA responde, guarda su día sin avisar", async () => {
    const { d, mensajes } = deps();
    expect(await ejecutarCron(a(22), d)).toBe("reintentar:zai:glm-5.3");
    expect(mensajes).toHaveLength(0);
  });

  it("a las 22:00, con la IA caída, guarda el banco y avisa al administrador", async () => {
    const { d, mensajes } = deps({ generado: { modelo: null, fallos: ["x"] } });
    expect(await ejecutarCron(a(22), d)).toBe("reintentar:banco");
    expect((await leerDia(env.DB, "2026-11-13"))?.modelo).toBeNull();
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].chat).toBe("42");
  });

  it("sin chat de avisos, guarda el banco igual y no avisa", async () => {
    const { d, mensajes } = deps({ generado: { modelo: null }, avisos: null });
    expect(await ejecutarCron(a(22), d)).toBe("reintentar:banco");
    expect((await leerDia(env.DB, "2026-11-13"))?.modelo).toBeNull();
    expect(mensajes).toHaveLength(0);
  });
});

describe("publicar y reintentar-publicar", () => {
  it("publica el día de hoy en el canal una sola vez", async () => {
    await insertarDia("2026-11-12");
    const { d, mensajes } = deps();
    expect(await ejecutarCron(a(7), d)).toBe("publicar:publicado");
    expect(mensajes[0].chat).toBe("@canal");
    expect((await leerDia(env.DB, "2026-11-12"))?.telegram_ms).toBe(1_000);
    expect(await ejecutarCron(a(8), d)).toBe("reintentar-publicar:ya_publicado");
    expect(mensajes).toHaveLength(1);
  });

  it("si Telegram falla, libera la reserva; si falla también el reintento, avisa", async () => {
    await insertarDia("2026-11-12");
    const { d, mensajes } = deps({ telegramOk: false });
    expect(await ejecutarCron(a(7), d)).toBe("publicar:fallo");
    expect((await leerDia(env.DB, "2026-11-12"))?.telegram_ms).toBeNull();
    expect(await ejecutarCron(a(8), d)).toBe("reintentar-publicar:fallo");
    expect(mensajes.map((m) => m.chat)).toEqual(["@canal", "@canal", "42"]);
  });

  it("con una publicación a medias (-1), no reenvía y avisa en el reintento", async () => {
    await insertarDia("2026-11-12", { telegram_ms: -1 });
    const { d, mensajes } = deps();
    expect(await ejecutarCron(a(8), d)).toBe("reintentar-publicar:en_curso");
    expect(mensajes.map((m) => m.chat)).toEqual(["42"]);
  });

  it("sin día que publicar, el reintento avisa", async () => {
    const { d, mensajes } = deps();
    expect(await ejecutarCron(a(7), d)).toBe("publicar:sin_dia");
    expect(await ejecutarCron(a(8), d)).toBe("reintentar-publicar:sin_dia");
    expect(mensajes.map((m) => m.chat)).toEqual(["42"]);
  });

  it("sin canal no publica, no reserva ni marca el día y no avisa", async () => {
    await insertarDia("2026-11-12");
    const { d, mensajes } = deps({ canal: null });
    expect(await ejecutarCron(a(7), d)).toBe("publicar:sin_canal");
    expect(await ejecutarCron(a(8), d)).toBe("reintentar-publicar:sin_canal");
    expect((await leerDia(env.DB, "2026-11-12"))?.telegram_ms).toBeNull();
    expect(mensajes).toHaveLength(0);
  });

  it("fuera de las cuatro horas no hace nada", async () => {
    const { d } = deps();
    expect(await ejecutarCron(a(12), d)).toBe("sin_tarea");
  });
});

describe("depsCron", () => {
  it("la cadena va a Z.ai con la key, pensar (razonamiento ligero) y la URL configurada", async () => {
    const otra = "https://zai.example/api/paas/v4/chat/completions";
    const llamadas = red((url) => (url === otra ? respuestaGroq(profeciasIa("2026-11-13")) : null));
    const g = await depsCron({ ...env, ZAI_URL: otra }).generar("2026-11-13", new Map());
    expect(g.modelo).toBe("zai:glm-5.3");
    expect(llamadas.map((l) => l.url)).toEqual([otra]);
    expect(llamadas[0].cabeceras.get("authorization")).toBe("Bearer clave-zai-de-prueba");
    expect(llamadas[0].cuerpo.model).toBe("glm-5.3");
    expect(llamadas[0].cuerpo.thinking).toEqual({ type: "enabled" });
    expect(llamadas[0].cuerpo.reasoning_effort).toBe("low");
  });

  it.each([
    ["vacía", ""],
    ["sin definir", undefined],
  ])("con ZAI_URL %s, la API estándar de Z.ai", async (_, zaiUrl) => {
    const llamadas = red((url) => (url === ZAI_URL ? respuestaGroq(profeciasIa("2026-11-13")) : null));
    await depsCron({ ...env, ZAI_URL: zaiUrl }).generar("2026-11-13", new Map());
    expect(llamadas.map((l) => l.url)).toEqual([ZAI_URL]);
  });

  it.each<[string, Partial<Env>, string | null, string | null]>([
    ["configurado", {}, "@canal_de_prueba", "42"],
    ["con el canal @pendiente", { TELEGRAM_CANAL: "@pendiente" }, null, "42"],
    ["con el canal vacío", { TELEGRAM_CANAL: "" }, null, "42"],
    ["sin canal", { TELEGRAM_CANAL: undefined }, null, "42"],
    ["sin chat de avisos", { TELEGRAM_AVISOS: "" }, "@canal_de_prueba", null],
    ["sin token del bot", { TELEGRAM_BOT_TOKEN: undefined }, null, null],
    ["con el token vacío", { TELEGRAM_BOT_TOKEN: " " }, null, null],
  ])("Telegram %s", (_, cambios, canal, avisos) => {
    const d = depsCron({ ...env, ...cambios });
    expect(d.canal).toBe(canal);
    expect(d.avisos).toBe(avisos);
  });
});

describe("handler scheduled", () => {
  it("a las 21:00 con Z.ai caído no guarda nada", async () => {
    const llamadas = red((url) => (url === ZAI_URL ? new Response("caído", { status: 503 }) : null));
    await programar(a(21));
    expect(await leerDia(env.DB, "2026-11-13")).toBeNull();
    expect(llamadas.map((l) => l.url)).toEqual([ZAI_URL]);
  });

  it("a las 22:00 sin bot de Telegram, guarda el banco sin intentar avisar", async () => {
    const llamadas = red((url) => (url === ZAI_URL ? new Response("caído", { status: 503 }) : null));
    await programar(a(22), { ...env, TELEGRAM_BOT_TOKEN: undefined });
    expect((await leerDia(env.DB, "2026-11-13"))?.modelo).toBeNull();
    expect(llamadas.map((l) => l.url)).toEqual([ZAI_URL]);
  });

  it("a las 07:00 publica en el canal con el token del bot", async () => {
    await insertarDia("2026-11-12");
    const llamadas = red((url) => (url.startsWith(TELEGRAM) ? Response.json({ ok: true }) : null));
    await programar(a(7));
    expect(llamadas.map((l) => l.url)).toEqual([`${TELEGRAM}bottoken-de-prueba/sendMessage`]);
    expect(llamadas[0].cuerpo.chat_id).toBe("@canal_de_prueba");
    expect((await leerDia(env.DB, "2026-11-12"))?.telegram_ms).toBeGreaterThan(0);
  });

  it("a las 07:00 con el canal @pendiente no llama a Telegram ni marca el día", async () => {
    await insertarDia("2026-11-12");
    const llamadas = red(() => null);
    await programar(a(7), { ...env, TELEGRAM_CANAL: "@pendiente" });
    await programar(a(8), { ...env, TELEGRAM_CANAL: "@pendiente" });
    expect(llamadas).toHaveLength(0);
    expect((await leerDia(env.DB, "2026-11-12"))?.telegram_ms).toBeNull();
  });
});
