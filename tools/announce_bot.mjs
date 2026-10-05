#!/usr/bin/env node
/* Announcement cards from a Telegram bot. Runs hourly in GitHub Actions (.github/workflows/telegram-bot.yml); no dependencies.

   The team sends the bot a poster (photo, or an image sent as a file). The caption is optional:
       first line            -> the card's title (else "إعلان")
       "حتى 1448/7/2"        -> it comes down after that day (Hijri, Umm al-Qura; a Gregorian 2027-01-10 works too)
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

const ROOT = process.env.ANN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // ANN_ROOT, TELEGRAM_API: for tests/bot_check.mjs
const API = process.env.TELEGRAM_API || "https://api.telegram.org";
const DATA = path.join(ROOT, "site", "data", "announcements.json"), DIR = path.join(ROOT, "site", "ann");
const ACK = process.env.ACK_FILE || path.join(ROOT, ".bot-ack");   // next update offset, for --ack
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "", ADMINS = new Set((process.env.BOT_ADMINS || "").split(/[,\s]+/).filter(Boolean));
const DRY = process.argv.includes("--dry-run");
const MAX_BYTES = 10e6, EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n"); };
const digits = s => String(s).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

/* today in Riyadh (YYYY-MM-DD) */
export const today = (now = new Date()) => new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

/* Hijri (Umm al-Qura) date -> Gregorian YYYY-MM-DD, by asking Intl around an estimate */
const hfmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
export function hijriToIso(y, m, d) {
  const est = Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + (d - 1)) * 864e5;
  for (let k = -45; k <= 45; k++) {
    const t = new Date(est + k * 864e5), p = Object.fromEntries(hfmt.formatToParts(t).map(x => [x.type, x.value]));
    if (+p.year === y && +p.month === m && +p.day === d) return t.toISOString().slice(0, 10);
  }
  return "";
}

/* caption -> { title, until } ; until is the last day the card shows (Gregorian YYYY-MM-DD) or "" */
export function parseCaption(caption = "") {
  const text = digits(caption).replace(/\r/g, "");
  let until = "";
  const m = text.match(/(?:حتى|إلى|الى|ينتهي|ينتهى|until)\s*[:：]?\s*(?:يوم\s+\S+\s+)?(\d{1,4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,4})/i);
  if (m) {
    let [a, b, c] = [+m[1], +m[2], +m[3]];
    if (c > 999) [a, c] = [c, a];                                   // d/m/y -> y/m/d
    if (a > 1300 && a < 1600 && b >= 1 && b <= 12 && c >= 1 && c <= 30) until = hijriToIso(a, b, c);
    else if (a > 1999 && b >= 1 && b <= 12 && c >= 1 && c <= 31) until = `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
  }
  const t = caption.split("\n").map(s => s.trim()).find(s => s && !/^(?:حتى|إلى|الى|ينتهي|ينتهى|until)/i.test(s));
  return { title: (t || "إعلان").slice(0, 140), until };
}

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

export function prune(list, day = today()) {
  const keep = list.filter(a => !a.until || a.until >= day);
  return { keep, gone: list.filter(a => !keep.includes(a)) };
}

async function main() {
  let list = readJSON(DATA, []), changed = false;
  let next = 0;
  if (TOKEN) {
    const updates = await api("getUpdates", { timeout: 0, allowed_updates: ["message"] });
    for (const u of updates) {
      next = u.update_id + 1;
      const m = u.message; if (!m || !m.from || m.chat.type !== "private") continue;
      const who = String(m.from.id);
      if (!ADMINS.has(who)) { await say(m.chat.id, `غير مصرّح لك بنشر الإعلانات. رقمك في تيليجرام: ${who} (أرسله لمسؤول الموقع).`); continue; }
      const text = (m.text || "").trim();
      if (/^\/(start|help)/.test(text)) { await say(m.chat.id, "أرسل صورة الإعلان، واكتب في التعليق عنوانه في السطر الأول، وتاريخ انتهائه مثل: حتى ١٤٤٨/٧/٢\nلحذف إعلان: ردّ على صورته بكلمة «حذف».\nلعرض الإعلانات الحالية: /list"); continue; }
      if (/^\/list/.test(text)) { await say(m.chat.id, list.length ? list.map((a, i) => `${i + 1}. ${a.title}${a.until ? " (حتى " + a.until + ")" : ""}`).join("\n") : "لا توجد إعلانات الآن."); continue; }
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
        const { title, until } = parseCaption(m.caption || "");
        if (until && until < today()) { await say(m.chat.id, "تاريخ الانتهاء في الماضي، لم يُنشر الإعلان.", m.message_id); continue; }
        if (list.some(a => a.image === "/ann/" + file)) { await say(m.chat.id, "هذا الإعلان منشور من قبل.", m.message_id); continue; }
        const [w, h] = size(buf);
        if (!DRY) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, file), buf); }
        list.unshift({ id: sha.slice(0, 12), title, image: "/ann/" + file, w, h, until, added: today(), tg: { chat: m.chat.id, msg: m.message_id } });
        changed = true;
        await say(m.chat.id, `تم: «${title}» سيظهر في الموقع خلال ساعة${until ? "، ويختفي بعد " + until : ""}.`, m.message_id);
      } catch (e) { await say(m.chat.id, "تعذّر حفظ الإعلان: " + e.message, m.message_id); }
    }
  } else console.error("TELEGRAM_BOT_TOKEN not set: only removing expired cards");
  const { keep, gone } = prune(list);
  if (gone.length) { changed = true; list = keep; console.log("expired:", gone.map(a => a.title).join(" | ")); }
  if (DRY) { console.log(JSON.stringify(list, null, 1)); return; }
  if (changed) {   // images no card uses any more are deleted with it
    writeJSON(DATA, list);
    const used = new Set(list.map(a => path.basename(a.image)));
    if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR, { withFileTypes: true })) if (f.isFile() && !used.has(f.name)) fs.unlinkSync(path.join(DIR, f.name));   // thumb/ is ann_thumbs.py's
  }
  if (next) fs.writeFileSync(ACK, String(next));
  console.log(`${list.length} announcement(s)${changed ? " (changed)" : ""}`);
}

async function ack() {   // confirm the handled messages so Telegram stops sending them
  const next = +readJSON(ACK, 0);
  if (TOKEN && next > 0) { await api("getUpdates", { offset: next, limit: 1, timeout: 0 }); console.log("acknowledged up to", next - 1); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) (process.argv.includes("--ack") ? ack() : main()).catch(e => { console.error(e.message); process.exit(1); });
