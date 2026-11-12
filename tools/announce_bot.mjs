#!/usr/bin/env node
/* Announcement cards from a Telegram bot. Runs hourly in GitHub Actions (.github/workflows/telegram-bot.yml); no dependencies.

   The team sends the bot a poster (photo, or an image sent as a file). The caption is optional:
       first line            -> the card's title (else "إعلان")
       "حتى 1448/7/2"        -> it comes down after that day (Hijri, Umm al-Qura; a Gregorian 2027-01-10 works too)
       title starting «جدول» (or "#جدول" anywhere) -> the lesson schedule: always shown first, and a new one replaces the old one
   To take a card down: reply «حذف» to the poster you sent. «/list» lists the cards on the site.
   Only Telegram users listed in BOT_ADMINS (comma-separated numeric ids) can change anything; anyone else is told their id,
   so the owner can add them.

   Writes site/data/announcements.json and site/ann/<sha16>.<ext>, and removes cards whose date has passed. The workflow commits
   and pushes the result (which redeploys the site) and only then runs `--ack`, which tells Telegram the messages were handled:
   if publishing fails, the same messages come back on the next run (Telegram keeps them for 24 hours).

   env: TELEGRAM_BOT_TOKEN (GitHub secret, never in the repo), BOT_ADMINS.   Local dry run:  node tools/announce_bot.mjs --dry-run */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { today, hijriToIso, parseCaption, prune, webhookSecret } from "../worker/posters.js";

const ROOT = process.env.ANN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // ANN_ROOT, TELEGRAM_API: for tests/bot_check.mjs
const API = process.env.TELEGRAM_API || "https://api.telegram.org";
const DATA = path.join(ROOT, "site", "data", "announcements.json"), DIR = path.join(ROOT, "site", "ann");
const ACK = process.env.ACK_FILE || path.join(ROOT, ".bot-ack");   // next update offset, for --ack
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "", ADMINS = new Set((process.env.BOT_ADMINS || "").split(/[,\s]+/).filter(Boolean));
const DRY = process.argv.includes("--dry-run");
const MAX_BYTES = 10e6, EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n"); };
export { today, hijriToIso, parseCaption };   // shared with the Worker's bot (worker/posters.js)

async function api(method, params = {}) {
  const r = await fetch(`${API}/bot${TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}
const say = (chat_id, text, reply_to) => DRY ? console.log(`[to ${chat_id}] ${text}`) : api("sendMessage", { chat_id, text, ...(reply_to ? { reply_parameters: { message_id: reply_to, allow_sending_without_reply: true } } : {}) }).catch(e => console.error(e.message));

async function download(file_id) {
  const f = await api("getFile", { file_id });
  if (f.file_size > MAX_BYTES) throw new Error("الصورة أكبر من ١٠ ميغابايت");
  const r = await fetch(`${API}/file/bot${TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const sniff = b => b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b.slice(1, 4).toString() === "PNG" ? "image/png" : b.slice(8, 12).toString() === "WEBP" ? "image/webp" : "";
function size(b) {   // -> [w, h] for JPEG/PNG (for the page's width/height attributes)
  if (b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length - 9;) { const mk = b[i + 1], len = b.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; }
  return [1131, 1600];
}

/* the schedule (pin) first, then the newest posters; a new schedule replaces the old one */
export function place(list, card) {
  const rest = card.pin ? list.filter(a => !a.pin) : list;
  return [card, ...rest].sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
}

async function main() {
  let list = readJSON(DATA, []), changed = false;
  let next = 0;
  const hooked = TOKEN && !DRY ? !!(await api("getWebhookInfo").catch(() => ({}))).url : false;   // the Worker answers the bot itself
  if (hooked) console.log("webhook mode: messages are handled by the Worker (/bot); only fetching new pictures and tidying");
  if (TOKEN) for (const a of list.filter(a => a.file_id && !a.image)) {   // drafts added in the Worker's bot: fetch their picture
    try {
      const buf = await download(a.file_id), type = sniff(buf);
      if (!EXT[type]) throw new Error("not a JPEG, PNG or WebP picture");
      const sha = crypto.createHash("sha256").update(buf).digest("hex"), file = `${sha.slice(0, 16)}.${EXT[type]}`;
      const [w, h] = size(buf);
      if (!DRY) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, file), buf); }
      Object.assign(a, { image: "/ann/" + file, w, h }); changed = true;
      console.log("picture saved for draft:", a.title);
    } catch (e) { console.error(`picture of «${a.title}»: ${e.message}`); }
  }
  if (TOKEN && !hooked) {
    const updates = await api("getUpdates", { timeout: 0, allowed_updates: ["message"] });
    for (const u of updates) {
      next = u.update_id + 1;
      const m = u.message; if (!m || !m.from || m.chat.type !== "private") continue;
      const who = String(m.from.id);
      if (!ADMINS.has(who)) { await say(m.chat.id, `غير مصرّح لك بنشر الإعلانات. رقمك في تيليجرام: ${who} (أرسله لمسؤول الموقع).`); continue; }
      const text = (m.text || "").trim();
      if (/^\/(start|help)/.test(text)) { await say(m.chat.id, "أرسل صورة الإعلان، واكتب في التعليق عنوانه في السطر الأول، وتاريخ انتهائه مثل: حتى ١٤٤٨/٧/٢\nجدول الدروس: اجعل أول سطر في التعليق يبدأ بكلمة «جدول»، فيظهر أولًا دائمًا ويحلّ محل الجدول السابق.\nلحذف إعلان: ردّ على صورته بكلمة «حذف».\nلعرض الإعلانات الحالية: /list"); continue; }
      if (/^\/list/.test(text)) { await say(m.chat.id, list.length ? list.map((a, i) => `${i + 1}. ${a.pin ? "(الجدول) " : ""}${a.title}${a.until ? " (حتى " + a.until + ")" : ""}`).join("\n") : "لا توجد إعلانات الآن."); continue; }
      if (/^حذف/.test(text) && m.reply_to_message) {
        const hit = list.find(a => a.tg && a.tg.chat === m.chat.id && a.tg.msg === m.reply_to_message.message_id);
        if (hit) { list = list.filter(a => a !== hit); changed = true; await say(m.chat.id, `حُذف «${hit.title}» وسيختفي من الموقع خلال ساعة.`, m.message_id); }
        else await say(m.chat.id, "لم أجد إعلانًا لهذه الرسالة. ردّ على صورة الإعلان نفسها.", m.message_id);
        continue;
      }
      const photo = m.photo ? m.photo[m.photo.length - 1] : m.document && /^image\//.test(m.document.mime_type || "") ? m.document : null;
      if (!photo) { if (text) await say(m.chat.id, "أرسل صورة الإعلان (ويمكن كتابة العنوان والتاريخ في التعليق). /help", m.message_id); continue; }
      try {
        const buf = await download(photo.file_id), type = sniff(buf);
        if (!EXT[type]) throw new Error("الملف ليس صورة JPEG أو PNG أو WebP");
        const sha = crypto.createHash("sha256").update(buf).digest("hex"), file = `${sha.slice(0, 16)}.${EXT[type]}`;
        const { title, until, pin } = parseCaption(m.caption || "");
        if (until && until < today()) { await say(m.chat.id, "تاريخ الانتهاء في الماضي، لم يُنشر الإعلان.", m.message_id); continue; }
        if (list.some(a => a.image === "/ann/" + file)) { await say(m.chat.id, "هذا الإعلان منشور من قبل.", m.message_id); continue; }
        const [w, h] = size(buf);
        if (!DRY) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, file), buf); }
        const old = pin ? list.filter(a => a.pin) : [];
        list = place(list, { id: sha.slice(0, 12), title, image: "/ann/" + file, w, h, until, added: today(), tg: { chat: m.chat.id, msg: m.message_id }, ...(pin ? { pin: true } : {}) });
        changed = true;
        await say(m.chat.id, `تم: «${title}» سيظهر في الموقع خلال ساعة${pin ? " أولَ الإعلانات" : ""}${until ? "، ويختفي بعد " + until : ""}.${old.length ? " وحُذف الجدول السابق: «" + old.map(a => a.title).join("»، «") + "»." : ""}`, m.message_id);
      } catch (e) { await say(m.chat.id, "تعذّر حفظ الإعلان: " + e.message, m.message_id); }
    }
  } else console.error("TELEGRAM_BOT_TOKEN not set: only removing expired cards");
  const { keep, gone } = prune(list);
  if (gone.length) { changed = true; list = keep; console.log("expired:", gone.map(a => a.title).join(" | ")); }
  if (DRY) { console.log(JSON.stringify(list, null, 1)); return; }
  if (changed) writeJSON(DATA, list);
  // pictures no card uses any more (also after a delete in the Worker's bot) are removed; thumb/ is ann_thumbs.py's
  const used = new Set(list.filter(a => a.image).map(a => path.basename(a.image)));
  if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR, { withFileTypes: true })) if (f.isFile() && !used.has(f.name)) fs.unlinkSync(path.join(DIR, f.name));
  if (next) fs.writeFileSync(ACK, String(next));
  console.log(`${list.length} announcement(s)${changed ? " (changed)" : ""}`);
}

/* --webhook: BOT_WEBHOOK=on registers the Worker (https://yaljabri.com/bot) as the bot's webhook, so buttons answer at once;
   anything else switches back to this hourly polling. Run by the workflow before main(), so the switch is one repository
   variable. The Worker needs TELEGRAM_BOT_TOKEN, BOT_ADMINS and GH_TOKEN first (docs/announcements.md). */
async function webhookMode() {
  if (!TOKEN) return;
  const want = process.env.BOT_WEBHOOK === "on", url = process.env.BOT_WEBHOOK_URL || "https://yaljabri.com/bot";
  const info = await api("getWebhookInfo");
  if (want) {
    if (info.url !== url || !(info.allowed_updates || []).includes("callback_query")) {
      await api("setWebhook", { url, secret_token: await webhookSecret(TOKEN), allowed_updates: ["message", "callback_query"], max_connections: 5 });
      console.log("webhook set:", url);
    }
    await api("setMyCommands", { commands: [{ command: "menu", description: "القائمة" }, { command: "list", description: "الإعلانات الحالية" }, { command: "help", description: "طريقة الاستخدام" }] });
    if (info.last_error_message) console.log("last webhook error:", info.last_error_message);
  } else if (info.url) { await api("deleteWebhook", {}); console.log("webhook removed: back to hourly polling"); }
}

async function ack() {   // confirm the handled messages so Telegram stops sending them
  const next = +readJSON(ACK, 0);
  if (TOKEN && next > 0) { await api("getUpdates", { offset: next, limit: 1, timeout: 0 }); console.log("acknowledged up to", next - 1); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) (process.argv.includes("--ack") ? ack() : process.argv.includes("--webhook") ? webhookMode() : main()).catch(e => { console.error(e.message); process.exit(1); });
