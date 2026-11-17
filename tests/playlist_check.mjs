// Series pages and the playlist: 50 rows at a time, a number finds that lesson, «تشغيل السلسلة» queues the series oldest first,
// next / previous / the queue panel / the end of a lesson all follow one queue (finished lessons skipped), progress marks and the
// «لم أستمع» filter, «متابعة» after a reload. Same build as tests/player_check.mjs (MEDIA_JSON=tests/fixtures/media.json).
//   node tests/playlist_check.mjs http://localhost:8000
import { chromium } from "playwright";
import fs from "node:fs";
const B = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "");
const TONE = fs.readFileSync(new URL("./fixtures/tone.ogg", import.meta.url));
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let ok = 0, bad = 0;
const t = (n, c, info = "") => c ? ok++ : (bad++, console.log("  FAIL:", n, info));
for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.route("https://media.test/**", r => r.fulfill({ status: 200, contentType: "audio/ogg", body: TONE, headers: { "Accept-Ranges": "none" } }));
  const p = await ctx.newPage(), errs = [], W = vp.width + "px: ";
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  const st = () => p.evaluate(() => { const a = document.getElementById("d-aud"); return { paused: a.paused, src: a.src.split("/").pop(), title: document.getElementById("d-title").textContent, q: JSON.parse(localStorage.getItem("queue") || "null") }; });

  await p.goto(B + "/series/bukhari/"); await p.waitForTimeout(1000);
  await p.click("#play-all"); await p.waitForTimeout(800);   // straight away, before touching the list
  t(W + "«تشغيل السلسلة» works on a fresh page", (await st()).q?.i === 0);
  await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForTimeout(1000);
  const rows = await p.locator("#out .row").count(), total = await p.evaluate(() => document.getElementById("count").textContent);
  t(W + "first 50 rows, then «عرض المزيد»", rows === 50 && await p.locator("#more").isVisible(), rows + " " + total);
  await p.click("#more"); await p.waitForTimeout(300);
  t(W + "«عرض المزيد» adds 50", await p.locator("#out .row").count() === 100);
  // a number finds lessons by their own number, never by a date (٢٠/٥/١٤٤٦) or position; ٢ does not find ٢٠
  const noDate = x => x.replace(/[٠-٩]{1,4}\s*[/\-.ا]\s*[٠-٩]{1,2}\s*[/\-.ا]\s*[٠-٩]{1,4}|١[٣٤][٠-٩][٠-٩]/g, " ");
  await p.fill("#q", "٢٠"); await p.waitForTimeout(500);
  const hits = await p.locator("#out .row .t").allTextContents();
  t(W + "a number finds lessons with that number (not in a date)", hits.length >= 1 && hits.every(x => /(^|[^٠-٩])٢٠([^٠-٩]|$)/.test(noDate(x))), JSON.stringify(hits));
  await p.fill("#q", "2"); await p.waitForTimeout(500);
  const h2 = await p.locator("#out .row .t").allTextContents();
  t(W + "2 does not find 20", h2.every(x => /(^|[^٠-٩])٢([^٠-٩]|$)/.test(noDate(x))), JSON.stringify(h2.slice(0, 5)));
  await p.fill("#q", ""); await p.waitForTimeout(400);
  t(W + "listening filter shown", await p.locator("#only").isVisible() && await p.locator("#plays").isVisible());

  await p.click("#play-all"); await p.waitForTimeout(1500);
  let s = await st();
  const order = await p.evaluate(() => [...JSON.parse(localStorage.getItem("queue")).ids]);
  const dates = await p.evaluate(ids => fetch("/data/library.json").then(r => r.json()).then(d => ids.map(id => d.lessons.find(l => l.id === id)?.date || "")), order);
  t(W + "play-all queues the series oldest first", order.length > 50 && dates.every((d, i) => !i || !d || !dates[i - 1] || dates[i - 1] <= d) && s.q.i === 0 && !s.paused, JSON.stringify([order.length, dates.slice(0, 3), s]));
  await p.click("#d-next"); await p.waitForTimeout(900);
  s = await st(); t(W + "next button plays queue item 2", s.q.i === 1 && !s.paused, JSON.stringify(s.q.i));
  if (vp.width > 900) { await p.click("#d-prev"); await p.waitForTimeout(900); s = await st(); t(W + "previous button goes back", s.q.i === 0, String(s.q.i)); }
  else { await p.evaluate(() => document.getElementById("d-prev").click()); await p.waitForTimeout(900); s = await st(); t(W + "previous goes back", s.q.i === 0, String(s.q.i)); }
  // finish item 2 (index 1) by hand, then let item 1 end: the queue skips the finished one
  await p.evaluate(id => { const d = JSON.parse(localStorage.getItem("done") || "{}"); d[id] = 1; localStorage.setItem("done", JSON.stringify(d)); window.dispatchEvent(new StorageEvent("storage", { key: "done" })); }, order[1]);
  await p.evaluate(() => { const a = document.getElementById("d-aud"); a.playbackRate = 4; a.currentTime = 11; });
  await p.waitForTimeout(2500);
  s = await st(); t(W + "a finished lesson is skipped at the end of the one before", s.q.i === 2 && !s.paused, JSON.stringify(s.q));
  await p.click("#d-q"); await p.waitForTimeout(300);
  t(W + "queue panel opens on the lesson playing", await p.locator("#qp").isVisible() && await p.locator("#qp-l button.now").count() === 1 && await p.locator("#qp-l button").count() > 10);
  await p.locator("#qp-l button[data-i='5']").click(); await p.waitForTimeout(900);
  s = await st(); t(W + "tapping a queue item plays it", s.q.i === 5 && !s.paused, String(s.q.i));
  await p.keyboard.press("Escape"); t(W + "Escape closes the panel", await p.locator("#qp").isHidden());
  await p.evaluate(() => { document.getElementById("d-aud").currentTime = 6; }); await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById("d-play").click()); await p.waitForTimeout(400);

  await p.reload(); await p.waitForTimeout(1200);
  s = await st();
  t(W + "after a reload: same queue and lesson, paused", s.q.i === 5 && s.paused && s.src.length > 4, JSON.stringify(s));
  t(W + "«متابعة» offered on the series page", await p.locator("#resume").isVisible() && /متابعة/.test(await p.locator("#resume").textContent()));
  await p.selectOption("#sort", "old"); await p.waitForTimeout(300);
  t(W + "finished lessons marked, part-heard has a bar", await p.locator(".row.done").count() >= 1 && await p.locator(".row .pgb").count() >= 1);
  await p.selectOption("#only", "new"); await p.waitForTimeout(300);
  const left = await p.evaluate(() => document.getElementById("count").textContent);
  t(W + "«لم أستمع» leaves out heard lessons", await p.locator(".row.done").count() === 0 && await p.locator(".row .pgb").count() === 0, left);
  await p.selectOption("#only", ""); await p.click("#resume"); await p.waitForTimeout(900);
  s = await st(); t(W + "«متابعة» resumes that lesson", !s.paused && s.q.ids[s.q.i] === order[5], JSON.stringify(s.q.i));

  // a lesson page playing a lesson of another series brings that series as the queue
  await p.goto(B + "/lesson/jabiri-2236/"); await p.waitForTimeout(1000);
  t(W + "no errors", errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}
console.log(`${ok} passed, ${bad} failed`);
await b.close(); process.exit(bad ? 1 : 0);
