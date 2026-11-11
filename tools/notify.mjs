#!/usr/bin/env node
/* Send a text file through the site's Telegram bot to the chats in SYNC_NOTIFY (comma-separated chat ids; each person must
   have pressed Start in the bot once). Used by the daily Telegram sync for its summary and alerts. No dependencies.
     TELEGRAM_BOT_TOKEN=... SYNC_NOTIFY=123,456 node tools/notify.mjs summary.txt
   Without a token or chat ids it only prints the text (the run summary on GitHub still has it). */
import fs from "node:fs";

const API = process.env.TELEGRAM_API || "https://api.telegram.org";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHATS = (process.env.SYNC_NOTIFY || "").split(/[,\s]+/).filter(s => /^-?\d+$/.test(s));
const text = fs.readFileSync(process.argv[2], "utf8").trim().slice(0, 4000);   // Telegram's limit is 4096 characters

console.log(text);
if (!TOKEN || !CHATS.length) { console.log("(not sent: TELEGRAM_BOT_TOKEN or SYNC_NOTIFY is not set)"); process.exit(0); }
for (const chat_id of CHATS) {
  const r = await fetch(`${API}/bot${TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id, text, link_preview_options: { is_disabled: true } }) });
  const j = await r.json().catch(() => ({}));
  console.log(`to ${chat_id}: ${j.ok ? "sent" : j.description || r.status}`);   // a failed notice never fails the job
}
