// tools/announce_bot.mjs against a fake Telegram Bot API (no network, no token):
// a poster from an admin is saved with its title and end date, a stranger is refused, «حذف» takes a card down,
// expired cards are dropped, and --ack confirms the handled updates.     Usage: node tests/bot_check.mjs
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = fileURLToPath(new URL("../tools/announce_bot.mjs", import.meta.url));
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQAAsBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");   // 11×16 JPEG
const ADMIN = 111, STRANGER = 222;
let updates = [], sent = [], acked = 0;
const msg = (id, from, extra) => ({ update_id: id, message: { message_id: id * 10, from: { id: from }, chat: { id: from, type: "private" }, ...extra } });
const server = http.createServer((req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", () => {
    const p = body ? JSON.parse(body) : {}, m = req.url.split("/").pop();
    if (req.url.startsWith("/file/")) { res.end(JPEG); return; }
    const ok = r => res.end(JSON.stringify({ ok: true, result: r }));
    if (m === "getUpdates") { if (p.offset) { acked = p.offset; updates = updates.filter(u => u.update_id >= p.offset); } return ok(updates); }
    if (m === "getFile") return ok({ file_id: p.file_id, file_size: JPEG.length, file_path: "photos/x.jpg" });
    if (m === "sendMessage") { sent.push(p); return ok({}); }
    res.statusCode = 404; res.end(JSON.stringify({ ok: false, description: "unknown " + m }));
  });
});
await new Promise(r => server.listen(0, r));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "botcheck-"));
fs.mkdirSync(path.join(dir, "site", "data"), { recursive: true });
fs.mkdirSync(path.join(dir, "site", "ann", "thumb"), { recursive: true });   // previews folder made by tools/ann_thumbs.py
fs.writeFileSync(path.join(dir, "site", "data", "announcements.json"), JSON.stringify([{ id: "old", title: "قديم", image: "/ann/0000000000000000.jpg", until: "2000-01-01" }]));
const env = { ...process.env, ANN_ROOT: dir, TELEGRAM_API: `http://127.0.0.1:${server.address().port}`, TELEGRAM_BOT_TOKEN: "test", BOT_ADMINS: String(ADMIN), ACK_FILE: path.join(dir, "ack") };
const run = (...a) => new Promise((res, rej) => { import("node:child_process").then(({ execFile }) => execFile("node", [TOOL, ...a], { env }, (e, out, err) => e ? rej(new Error(err || e.message)) : res(out))); });
const list = () => JSON.parse(fs.readFileSync(path.join(dir, "site", "data", "announcements.json"), "utf8"));
let ok = 0, bad = 0; const t = (n, c, info = "") => c ? ok++ : (bad++, console.log("  FAIL:", n, info));

updates = [
  msg(1, ADMIN, { photo: [{ file_id: "small" }, { file_id: "big" }], caption: "شرح كتاب التوحيد\nحتى ١٤٤٨/٧/٢" }),
  msg(2, STRANGER, { photo: [{ file_id: "big" }], caption: "spam" }),
  msg(3, ADMIN, { text: "/list" }),
];
await run();
let L = list();
t("poster saved with title and Hijri end date", L.length === 1 && L[0].title === "شرح كتاب التوحيد" && L[0].until === "2026-12-11" && L[0].w === 11 && L[0].h === 16, JSON.stringify(L));
t("image written", fs.existsSync(path.join(dir, "site", L[0].image)));
t("expired card dropped", !L.some(a => a.id === "old"));
t("stranger refused and told their id", sent.some(s => s.chat_id === STRANGER && s.text.includes(String(STRANGER))));
t("admin gets a confirmation", sent.some(s => s.chat_id === ADMIN && s.text.startsWith("تم")));
t("not acknowledged before --ack", acked === 0);
await run("--ack");
t("--ack confirms the handled updates", acked === 4, acked);
sent = []; updates = [msg(5, ADMIN, { text: "حذف", reply_to_message: { message_id: 10 } })];
await run();
t("«حذف» on the poster removes it", list().length === 0 && sent.some(s => s.text.startsWith("حُذف")));
t("its image is deleted", !fs.readdirSync(path.join(dir, "site", "ann")).some(f => f.endsWith(".jpg")));
t("the previews folder is left alone", fs.existsSync(path.join(dir, "site", "ann", "thumb")));
// the lesson schedule: always first, and a new one replaces the old one
const PNG = n => { const b = Buffer.alloc(33); b.write("\x89PNG", 0, "latin1"); b.writeUInt32BE(20 + n, 16); b.writeUInt32BE(30, 20); return b; };
let img = JPEG;
server.removeAllListeners("request");
server.on("request", (req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", () => {
    const p = body ? JSON.parse(body) : {}, m = req.url.split("/").pop(), ok = r => res.end(JSON.stringify({ ok: true, result: r }));
    if (req.url.startsWith("/file/")) return res.end(img = PNG(+req.url.split("/").pop().replace(/\D/g, "")));
    if (m === "getUpdates") return ok(p.offset ? [] : updates);
    if (m === "getFile") return ok({ file_id: p.file_id, file_size: 33, file_path: "photos/" + p.file_id + ".png" });
    if (m === "sendMessage") { sent.push(p); return ok({}); }
  });
});
updates = [
  msg(6, ADMIN, { photo: [{ file_id: "p1" }], caption: "جدول الدروس ١٤٤٧" }),
  msg(7, ADMIN, { photo: [{ file_id: "p2" }], caption: "درس الجمعة" }),
];
await run();
L = list();
t("schedule pinned and first", L.length === 2 && L[0].pin === true && L[0].title === "جدول الدروس ١٤٤٧" && !L[1].pin, JSON.stringify(L));
sent = []; updates = [msg(8, ADMIN, { photo: [{ file_id: "p3" }], caption: "#جدول\nالجدول الجديد ١٤٤٨" })];
await run();
L = list();
t("new schedule replaces the old one", L.length === 2 && L[0].title === "الجدول الجديد ١٤٤٨" && L[0].pin && L[1].title === "درس الجمعة", JSON.stringify(L));
t("admin told the old schedule went", sent.some(s => s.text.includes("حُذف الجدول السابق")));
t("old schedule image deleted", fs.readdirSync(path.join(dir, "site", "ann")).filter(f => f.endsWith(".png")).length === 2);
server.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
