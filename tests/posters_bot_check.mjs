// worker/bot.js (the announcements bot answering instantly in the Worker) against a fake Telegram and a fake GitHub:
// strangers are refused, the menu opens, a new picture becomes a hidden draft (title, end date, then publish), text and end
// date can be changed, posters move and are deleted, a schedule replaces the old one, writes are retried when the file
// changed meanwhile, and the webhook only accepts Telegram's secret.     Usage: node tests/posters_bot_check.mjs
import { handleUpdate, webhook } from "../worker/bot.js";
import { webhookSecret, move, parseDate } from "../worker/posters.js";
import { setAnnouncements, state } from "../site/js/core.js";

let ok = 0, bad = 0; const t = (n, c, info = "") => c ? ok++ : (bad++, console.log("  FAIL:", n, info));
const ADMIN = 111, STRANGER = 222, env = { TELEGRAM_BOT_TOKEN: "tok", BOT_ADMINS: String(ADMIN), GH_TOKEN: "gh" };

// fake GitHub contents API + Telegram Bot API
let file = [{ id: "aaaaaaaaaaaa", title: "قديم", image: "/ann/aaaaaaaaaaaaaaaa.jpg", w: 10, h: 10, until: "", added: "2026-10-01" }];
let sha = 1, conflicts = 0, sent = [], dispatched = [];
const b64 = s => Buffer.from(s, "utf8").toString("base64");
const fetcher = async (url, o = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.github.com/")) {
    t("GitHub call carries the token", o.headers.authorization === "Bearer gh");
    if (!o.method || o.method === "GET") return Response.json({ content: b64(JSON.stringify(file)), sha: String(sha) });
    const p = JSON.parse(o.body);
    if (conflicts > 0) { conflicts--; sha++; return new Response("conflict", { status: 409 }); }
    if (p.sha !== String(sha)) return new Response("stale", { status: 409 });
    file = JSON.parse(Buffer.from(p.content, "base64").toString("utf8")); sha++;
    return Response.json({});
  }
  const m = u.split("/").pop(), p = JSON.parse(o.body || "{}");
  sent.push({ m, ...p });
  return Response.json({ ok: true, result: { message_id: 900 + sent.length } });
};
const deps = { fetcher, dispatch: async wf => dispatched.push(wf) };
let upd = 0;
const msg = (from, extra) => ({ update_id: ++upd, message: { message_id: upd * 10, from: { id: from }, chat: { id: from, type: "private" }, ...extra } });
const cb = (data, message = { message_id: 5, chat: { id: ADMIN }, photo: [{}] }) => ({ update_id: ++upd, callback_query: { id: "q" + upd, from: { id: ADMIN }, message, data } });
const run = async u => { sent = []; await handleUpdate(u, env, deps); return sent; };
const last = () => sent.filter(s => s.m === "sendMessage" || s.m === "sendPhoto").pop() || {};
const replyTo = text => ({ from: { is_bot: true }, text });

let s = await run(msg(STRANGER, { text: "/menu" }));
t("stranger refused and told their id", s.length === 1 && s[0].text.includes(String(STRANGER)) && file.length === 1);
s = await run(msg(ADMIN, { text: "/menu" }));
t("menu has list / add / help", JSON.stringify(s[0].reply_markup).includes('"l"') && JSON.stringify(s[0].reply_markup).includes('"a"'));

// a new poster: picture without caption -> draft at the top, hidden; asks for the title
s = await run(msg(ADMIN, { photo: [{ file_id: "small", file_unique_id: "u1s" }, { file_id: "BIG", file_unique_id: "u1", file_size: 1000 }] }));
const d = file[0];
t("picture becomes a draft at the top", file.length === 2 && d.draft === true && d.file_id === "BIG" && d.image === "" && /^[0-9a-f]{12}$/.test(d.id), JSON.stringify(d));
t("the picture job is started", dispatched.includes("telegram-bot.yml"));
t("asks for the title", last().text.endsWith("#t-" + d.id) && last().reply_markup.force_reply === true);
setAnnouncements(file, "2026-11-12");
t("a draft is not shown on the site", state.ann.length === 1 && state.ann[0].id === "aaaaaaaaaaaa");

s = await run(msg(ADMIN, { text: "دورة علمية‮ في جدة\nسطر", reply_to_message: replyTo("✏️ اكتب العنوان\n#t-" + d.id) }));
t("title saved, cleaned to one line", file[0].title === "دورة علمية في جدة سطر", file[0].title);
t("then asks for the end date", last().text.endsWith("#d-" + d.id));
s = await run(msg(ADMIN, { text: "١٤٤٧/١/١", reply_to_message: replyTo("📅\n#d-" + d.id) }));
t("a past date is refused", file[0].until === "" && last().text.includes("مضى"));
s = await run(msg(ADMIN, { text: "١٤٤٨/٧/٢", reply_to_message: replyTo("📅\n#d-" + d.id) }));
t("Hijri end date saved", file[0].until === "2026-12-11", file[0].until);
t("draft card shown with publish buttons", last().m === "sendPhoto" && last().photo === "BIG" && JSON.stringify(last().reply_markup).includes("P:" + d.id));

s = await run(cb("P:" + d.id));
t("publish waits for the picture", s.some(x => x.m === "answerCallbackQuery" && x.show_alert) && file[0].draft === true);
file[0].image = "/ann/bbbbbbbbbbbbbbbb.jpg"; file[0].w = 5; file[0].h = 7;          // what the hourly job does
s = await run(cb("B:" + d.id));
t("published at the bottom", !file[1].draft && file[1].id === d.id && file[0].id === "aaaaaaaaaaaa", JSON.stringify(file.map(a => a.id)));
setAnnouncements(file, "2026-11-12");
t("site shows it in file order", state.ann.map(a => a.id).join() === ["aaaaaaaaaaaa", d.id].join());

s = await run(cb("u:" + d.id));
t("move up", file[0].id === d.id && s.some(x => x.m === "editMessageCaption" && x.caption.includes("الموضع: ١ من ٢")));
s = await run(cb("u:" + d.id));
t("already first: nothing written", file[0].id === d.id && s.some(x => x.m === "answerCallbackQuery" && x.text.includes("أصلًا")));

conflicts = 1;
s = await run(msg(ADMIN, { text: "عنوان جديد", reply_to_message: replyTo("✏️\n#t-" + d.id) }));
t("edit retried after a conflicting write", file[0].title === "عنوان جديد" && conflicts === 0);
s = await run(msg(ADMIN, { text: "بدون", reply_to_message: replyTo("📅\n#d-" + d.id) }));
t("«بدون» clears the end date", file[0].until === "");

s = await run(msg(ADMIN, { photo: [{ file_id: "BIG2", file_unique_id: "u1" }] }));
t("same picture again is noticed", file.length === 2 && sent.some(x => (x.text || "").includes("موجودة من قبل")));

// a schedule poster replaces the old schedule when published
file[1].pin = true;
s = await run(msg(ADMIN, { photo: [{ file_id: "S", file_unique_id: "u2" }], caption: "جدول الدروس ١٤٤٨\nحتى ١٤٤٨/١٢/١" }));
const sc = file[0];
t("caption gives title, date and schedule; card shown at once", sc.pin && sc.title === "جدول الدروس ١٤٤٨" && sc.until && last().m === "sendPhoto");
sc.image = "/ann/cccccccccccccccc.jpg";
s = await run(cb("P:" + sc.id));
t("new schedule replaces the old one", file.length === 2 && file[0].id === sc.id && !file.some(a => a.id === "aaaaaaaaaaaa") && last().text.includes("الجدول السابق"));

s = await run(cb("x:" + d.id));
t("delete asks first", file.length === 2 && JSON.stringify(last().reply_markup).includes("X:" + d.id));
dispatched = [];
s = await run(cb("X:" + d.id));
t("delete removes it and starts the tidy job", file.length === 1 && file[0].id === sc.id && dispatched.length === 1);
s = await run(cb("v:" + d.id));
t("a deleted poster's buttons say so", s.some(x => x.m === "answerCallbackQuery" && x.show_alert));
s = await run({ update_id: ++upd, callback_query: { id: "z", from: { id: STRANGER }, message: { message_id: 1, chat: { id: STRANGER } }, data: "X:" + sc.id } });
t("a stranger's button press does nothing", file.length === 1 && s.length === 1 && s[0].m === "answerCallbackQuery");
s = await run(cb("l", { message_id: 1, chat: { id: ADMIN } }));
t("list shows the posters with buttons", last().text.includes("جدول الدروس ١٤٤٨") && JSON.stringify(last().reply_markup).includes("v:" + sc.id));

// webhook: only Telegram (with the derived secret) gets in
const req = (secret, body = { update_id: 1, message: { message_id: 1, from: { id: STRANGER }, chat: { id: STRANGER, type: "private" }, text: "x" } }, method = "POST") =>
  new Request("https://yaljabri.com/bot", { method, headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {}, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
const sec = await webhookSecret("tok");
t("secret is stable and Telegram-safe", sec === await webhookSecret("tok") && /^[0-9a-f]{48}$/.test(sec));
t("no secret -> 403", (await webhook(req(""), env, deps)).status === 403);
t("wrong secret -> 403", (await webhook(req("x" + sec.slice(1)), env, deps)).status === 403);
t("GET -> 405", (await webhook(req(sec, null, "GET"), env, deps)).status === 405);
sent = [];
t("right secret -> 200 and handled", (await webhook(req(sec), env, deps)).status === 200 && sent.length === 1);
t("not configured -> 503", (await webhook(req(sec), { BOT_ADMINS: "1" }, deps)).status === 503);
t("helpers: move and dates", move([{ id: "a" }, { id: "b" }, { id: "c" }], "c", "top").map(x => x.id).join("") === "cab" && parseDate("2/7/1448") === "2026-12-11" && parseDate("x") === "");

console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
