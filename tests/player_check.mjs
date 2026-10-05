// The docked audio player: play from a lesson page, keep playing across client-side navigation, pause, resume after reload,
// and move on to the next lesson when one ends. Needs a build with hosted audio (the fixture maps the Bukhari series):
//   MEDIA_JSON=tests/fixtures/media.json node scripts/build.mjs && (cd dist && python3 -m http.server 8000) &
//   node tests/player_check.mjs http://localhost:8000          (then rebuild without MEDIA_JSON before deploying)
import { chromium } from "playwright";
import fs from "node:fs";
const B = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "");
const TONE = fs.readFileSync(new URL("./fixtures/tone.ogg", import.meta.url));   // 12 s, served for every https://media.test/ URL (Opus: test Chromium has no AAC)
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.route("https://media.test/**", r => r.fulfill({ status: 200, contentType: "audio/ogg", body: TONE, headers: { "Accept-Ranges": "none" } }));
const p = await ctx.newPage(), errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
let ok = 0, bad = 0;
const t = (n, c, info = "") => c ? ok++ : (bad++, console.log("  FAIL:", n, info));
const state = () => p.evaluate(() => { const a = document.getElementById("d-aud"); return { hidden: document.getElementById("dock").hidden, paused: a.paused, t: a.currentTime, src: a.src, title: document.getElementById("d-title").textContent }; });

await p.goto(B + "/lesson/jabiri-2236/"); await p.waitForTimeout(1200);
t("custom controls shown, native player removed", await p.locator(".lp-ui").isVisible() && await p.locator("#aud").count() === 0);
t("dock hidden before playing", (await state()).hidden);
await p.click("#lp-play"); await p.waitForTimeout(1500);
let s = await state();
t("plays in the dock", !s.hidden && !s.paused && s.t > 0, JSON.stringify(s));
t("dock shows the lesson", s.title.length > 5);
t("lesson button shows pause", (await p.locator("#lp-play").getAttribute("aria-label")) === "إيقاف مؤقت");
await p.evaluate(() => { window.__nr = 1; });
await p.click(".brand"); await p.waitForTimeout(1200);
const s2 = await state();
t("keeps playing after navigating", p.url() === B + "/" && !s2.paused && s2.t > s.t && await p.evaluate(() => window.__nr === 1), JSON.stringify(s2));
await p.evaluate(() => { document.getElementById("d-aud").currentTime = 7; });   // positions under 5 s are not worth remembering
await p.click("#d-play"); await p.waitForTimeout(300);
const s3 = await state(); t("dock pause", s3.paused);
await p.reload(); await p.waitForTimeout(1500);
const s4 = await state();
t("restored after reload, paused where it stopped", !s4.hidden && s4.paused && s4.src.includes("jabiri-2236") && s4.t >= Math.floor(s3.t) - 1, JSON.stringify([s3, s4]));
await p.click("#d-rate"); t("speed button cycles", (await p.locator("#d-rate").textContent()).includes("٢٥"));
// the end of a lesson moves on to the next one, and the lesson page follows
await p.goto(B + "/lesson/jabiri-2236/"); await p.waitForTimeout(1200);
await p.click("#lp-play"); await p.waitForTimeout(800);
await p.evaluate(() => { const a = document.getElementById("d-aud"); a.playbackRate = 2; a.currentTime = 10.5; });
await p.waitForTimeout(3500);
const s5 = await state();
t("next lesson starts when one ends", !s5.src.includes("jabiri-2236") && !s5.paused, JSON.stringify(s5));
t("lesson page follows to the next lesson", !p.url().includes("jabiri-2236") && p.url().includes("/lesson/"), p.url());
await p.click("#d-x"); await p.waitForTimeout(200);
t("close hides the dock", (await state()).hidden);
console.log(`${ok} passed, ${bad} failed | page errors:`, errs);
await b.close(); process.exit(bad || errs.length ? 1 : 0);
