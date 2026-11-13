// scripts/subir-secretos.mjs — node scripts/subir-secretos.mjs NOMBRE [NOMBRE...]
// Sube al Worker los secretos que estén en el .dev.vars del repo, por tubería: el valor no se
// imprime ni pasa por la línea de comandos. Funciona igual desde PowerShell que desde Git Bash.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const nombres = process.argv.slice(2);
if (!nombres.length) {
  console.error("Uso: node scripts/subir-secretos.mjs NOMBRE [NOMBRE...]");
  process.exit(1);
}

const lineas = readFileSync(join(raiz, ".dev.vars"), "utf8").replace(/^﻿/, "").split(/\r?\n/);
let fallos = 0;
for (const nombre of nombres) {
  const linea = lineas.find((l) => l.startsWith(`${nombre}=`));
  const valor = linea?.slice(nombre.length + 1).trim().replace(/^"|"$/g, "");
  if (!valor) {
    console.error(`${nombre}: no está en .dev.vars (o está vacío)`);
    fallos++;
    continue;
  }
  const r = spawnSync(`npx wrangler secret put ${nombre}`, { cwd: raiz, input: valor, shell: true, encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) fallos++;
  // La salida de wrangler no lleva el valor; aun así, solo se enseña la última línea
  const ultima = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split(/\r?\n/).pop() ?? "";
  console.log(`${nombre}: ${ok ? "subido" : "ERROR"} · ${ultima.slice(0, 160)}`);
}
process.exit(fallos ? 1 : 0);
