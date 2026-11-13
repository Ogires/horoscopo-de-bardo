// src/index.ts — router (fetch) y cron (scheduled)
import { api } from "./api";
import { depsCron, ejecutarCron } from "./cron";
import type { Env } from "./env";
import { conCabeceras } from "./http/cabeceras";
import { decodificar, json, redirigir } from "./http/util";
import { resolverSigno } from "./signos";
import { tarjeta } from "./tarjeta";
import { pagina } from "./web/paginas";

async function enrutar(request: Request, env: Env, ahoraMs: number): Promise<Response> {
  const url = new URL(request.url);
  const ruta = url.pathname;
  if (ruta.startsWith("/api/v1/")) return api(request, env, ahoraMs);
  const lectura = request.method === "GET" || request.method === "HEAD";
  const t = /^\/tarjeta\/([A-Za-z0-9-]+)\.svg$/.exec(ruta);
  if (t && lectura) return tarjeta(request, env, t[1], ahoraMs);

  const esPagina = ruta === "/" || /^\/h\/[^/]+$/.test(ruta) || resolverSigno(ruta.slice(1)) !== null;
  if (esPagina && !lectura) return new Response("Método no permitido", { status: 405, headers: { allow: "GET, HEAD" } });
  if (ruta === "/") return pagina(request, env, "portada", "", ahoraMs);
  const h = /^\/h\/([^/]+)$/.exec(ruta);
  if (h) return pagina(request, env, "dia", decodificar(h[1]), ahoraMs);
  const signo = resolverSigno(ruta.slice(1));
  if (signo) return signo.slug === ruta.slice(1) ? pagina(request, env, "signo", signo.slug, ahoraMs) : redirigir(url, `/${signo.slug}`);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return conCabeceras(await enrutar(request, env, Date.now()));
    } catch (err) {
      // A10: nunca un stack
      console.error(JSON.stringify({ evento: "error_no_controlado", mensaje: String(err).slice(0, 200) }));
      return conCabeceras(json({ error: "mantenimiento", mensaje: "El Bardo está afinando el laúd. Vuelve en un rato" }, 503));
    }
  },
  // Con el tercer parámetro declarado, el test puede llamarlo con un ExecutionContext sin que tsc se queje
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const resultado = await ejecutarCron(controller.scheduledTime, depsCron(env));
    console.log(JSON.stringify({ evento: "cron", resultado }));
  },
} satisfies ExportedHandler<Env>;
