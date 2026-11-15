// scripts/telegram.mjs — node scripts/telegram.mjs ids | probar <chat>
// Lee TELEGRAM_BOT_TOKEN del .dev.vars del repo y nunca lo imprime.
//   ids            → los chats que han escrito al bot (para sacar el id de TELEGRAM_AVISOS)
//   probar <chat>  → manda un mensaje de prueba a un id o a un @canal
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const vars = readFileSync(join(raiz, ".dev.vars"), "utf8").replace(/^﻿/, "");
const token = vars.match(/^TELEGRAM_BOT_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!token) {
  console.error("Falta TELEGRAM_BOT_TOKEN en .dev.vars");
  process.exit(1);
}

const llamar = (metodo, cuerpo = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }).then((r) => r.json());

const [orden, chat] = process.argv.slice(2);
if (orden === "ids") {
  const yo = await llamar("getMe");
  console.log(yo.ok ? `Bot: @${yo.result.username}` : `Error: ${yo.description}`);
  const { result = [] } = await llamar("getUpdates");
  const chats = new Map();
  for (const u of result) {
    const c = (u.message ?? u.channel_post ?? u.my_chat_member)?.chat;
    if (c) chats.set(c.id, `${c.type} · ${c.title ?? c.username ?? c.first_name ?? ""}`);
  }
  if (!chats.size) console.log("Nadie ha escrito al bot todavía: mándale /start por privado");
  for (const [id, descripcion] of chats) console.log(id, descripcion);
} else if (orden === "probar" && chat) {
  const r = await llamar("sendMessage", { chat_id: chat, text: "Prueba del Bardo: si lees esto, el bot puede escribir aquí." });
  console.log(r.ok ? "Enviado" : `Error: ${r.description}`);
} else {
  console.log("Uso: node scripts/telegram.mjs ids | probar <chat>");
  process.exit(1);
}
