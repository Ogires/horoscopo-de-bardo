// scripts/sembrar.ts — genera un día, lo deja para revisarlo y lo escribe en la D1 remota
//   npm run sembrar -- AAAA-MM-DD                          genera con la cadena de wrangler.jsonc (MODELO y
//                                                          MODELO_RESPALDO) y lo guarda en .wrangler/sembrar-<fecha>.json
//   npm run sembrar -- AAAA-MM-DD --banco                  igual, pero del banco (para un día que se ha colado)
//   npm run sembrar -- AAAA-MM-DD --aplicar [--reemplazar] escribe ese JSON en la D1 remota
// Entre generar y aplicar, el JSON se puede retocar a mano: al aplicar se vuelve a validar.
// Sin --reemplazar no pisa un día que ya exista. Con él cambia las profecías y el modelo, pero no la marca de
// Telegram: un día ya publicado no vuelve a salir en el canal (el mensaje se edita a mano).
// Con --local, lee y escribe la D1 local de `wrangler dev` en vez de la remota.
// Las keys (ZAI_API_KEY, GROQ_API_KEY) y ZAI_URL se leen de .dev.vars y nunca se imprimen.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { historialDe, sqlSembrar } from "../src/datos";
import { esFechaValida } from "../src/fecha";
import { diaDelBanco } from "../src/generar/banco";
import { generarDia, modelosDe, type DiaGenerado } from "../src/generar/cadena";
import { motivoInvalida } from "../src/generar/validar";
import { SLUGS } from "../src/signos";
import type { Profecia } from "../src/tipos";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const [fecha, ...banderas] = process.argv.slice(2);
if (!fecha || !esFechaValida(fecha)) {
  console.error("Uso: npm run sembrar -- AAAA-MM-DD [--banco | --aplicar [--reemplazar]]");
  process.exit(1);
}
const carpeta = join(raiz, ".wrangler");
const archivo = join(carpeta, `sembrar-${fecha}.json`);

const local = banderas.includes("--local");
const d1Nombre = local ? "D1 local" : "D1 remota";

// npx es npx.cmd en Windows y necesita la shell: la orden se monta entera aquí, con las comillas puestas a
// mano. Lo único variable es la fecha, ya validada, y rutas del propio repo
function d1(args: string[]): string {
  return execSync(["npx wrangler d1 execute horoscopo-de-bardo", local ? "--local" : "--remote", "--yes", ...args].join(" "), {
    cwd: raiz,
    encoding: "utf8",
  });
}

function variable(texto: string, nombre: string): string | undefined {
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith(`${nombre}=`));
  return linea?.slice(nombre.length + 1).trim().replace(/^"|"$/g, "") || undefined;
}

// Las mismas comprobaciones que la cadena, por si el JSON se ha retocado a mano
function problemas(profecias: Profecia[]): string[] {
  const p: string[] = [];
  const signos = new Set(profecias.map((x) => x.signo));
  if (profecias.length !== SLUGS.size || signos.size !== SLUGS.size || [...signos].some((s) => !SLUGS.has(s))) {
    p.push(`hacen falta los ${SLUGS.size} signos, una vez cada uno`);
  }
  for (const x of profecias) {
    const motivo = motivoInvalida(x, x.signo);
    if (motivo) p.push(`${x.signo}: ${motivo}`);
  }
  return p;
}

if (banderas.includes("--aplicar")) {
  if (!existsSync(archivo)) {
    console.error(`No existe ${archivo}: genéralo antes con npm run sembrar -- ${fecha} [--banco]`);
    process.exit(1);
  }
  const { profecias, modelo } = JSON.parse(readFileSync(archivo, "utf8")) as { profecias: Profecia[]; modelo: string | null };
  const mal = problemas(profecias);
  if (mal.length) {
    console.error(`No se aplica: ${mal.join(" · ")}`);
    process.exit(1);
  }
  const sql = join(carpeta, `sembrar-${fecha}.sql`);
  writeFileSync(sql, sqlSembrar(fecha, profecias, modelo, Date.now(), banderas.includes("--reemplazar")), "utf8");
  d1([`--file="${sql}"`]);
  // Lo que ha quedado de verdad: sin --reemplazar, un día que ya existía no cambia
  const [{ results }] = JSON.parse(d1(["--json", "--command", `"SELECT modelo, creado_ms, telegram_ms FROM dias WHERE fecha = '${fecha}'"`]));
  console.log(`${fecha} en la ${d1Nombre}:`, results[0] ?? "no está");
} else {
  let resultado: Pick<DiaGenerado, "profecias" | "modelo" | "fallos" | "descartadas" | "tokens">;
  if (banderas.includes("--banco")) {
    resultado = { profecias: diaDelBanco(fecha), modelo: null, fallos: [], descartadas: [], tokens: 0 };
  } else {
    const vars = existsSync(join(raiz, ".dev.vars")) ? readFileSync(join(raiz, ".dev.vars"), "utf8").replace(/^﻿/, "") : "";
    const config = readFileSync(join(raiz, "wrangler.jsonc"), "utf8");
    const valor = (k: string) => new RegExp(`"${k}":\\s*"([^"]*)"`).exec(config)?.[1] ?? "";
    // El historial de la D1, para el filtro de repeticiones (sin acentos en la orden: lección 13)
    const [{ results }] = JSON.parse(d1(["--json", "--command", `"SELECT profecias FROM dias WHERE fecha < '${fecha}' ORDER BY fecha DESC LIMIT 14"`]));
    resultado = await generarDia(fecha, {
      claves: { groq: variable(vars, "GROQ_API_KEY"), zai: variable(vars, "ZAI_API_KEY") },
      modelos: modelosDe({ MODELO: valor("MODELO"), MODELO_RESPALDO: valor("MODELO_RESPALDO") }),
      historial: historialDe(results),
      // Como el cron (src/cron.ts): GLM-5.3 no admite apagar el razonamiento
      pensar: true,
      zaiUrl: variable(vars, "ZAI_URL"),
    });
  }
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(archivo, JSON.stringify(resultado, null, 2), "utf8");
  console.log(`${fecha} · ${resultado.modelo ?? "banco"} · ${resultado.tokens} tokens · fallos: ${resultado.fallos.join(", ") || "ninguno"}`);
  for (const d of resultado.descartadas) console.log(`  descartada ${d.signo} (${d.motivo})`);
  for (const p of resultado.profecias) console.log(`- ${p.signo} [${p.origen}]: ${p.texto} · Evita: ${p.evita}`);
  console.log(`\nGuardado en ${archivo}. Revísalo y aplícalo con: npm run sembrar -- ${fecha} --aplicar [--reemplazar]`);
}
