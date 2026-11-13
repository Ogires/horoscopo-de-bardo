// src/index.ts
import { depsCron, ejecutarCron } from "./cron";
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
  // Con el tercer parámetro declarado, el test puede llamarlo con un ExecutionContext sin que tsc se queje
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const resultado = await ejecutarCron(controller.scheduledTime, depsCron(env));
    console.log(JSON.stringify({ evento: "cron", resultado }));
  },
} satisfies ExportedHandler<Env>;
