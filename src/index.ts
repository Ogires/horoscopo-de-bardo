// src/index.ts — router (fetch) y cron (scheduled)
import { api } from "./api";
import { depsCron, ejecutarCron } from "./cron";
import type { Env } from "./env";
import { conCabeceras } from "./http/cabeceras";
import { json } from "./http/util";

// Se completa con la tarjeta SVG y la web
async function enrutar(request: Request, env: Env, ahoraMs: number): Promise<Response> {
  const ruta = new URL(request.url).pathname;
  if (ruta.startsWith("/api/v1/")) return api(request, env, ahoraMs);
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
