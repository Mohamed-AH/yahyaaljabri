#!/usr/bin/env node
/* Design mockups for the redesign: three looks, each a home page and a lesson page, filled with the real library.
   Static pictures of a design (no scripts, the player does not play). Run:  node mockups/build.mjs  -> mockups/out/<look>/{index,lesson}.html
   Then serve mockups/out and open /naqaa/, /riwaq/, /majlis/. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { init, state, byId, seriesById, visible, sectionCount, fullTitle, ldate, dur, hours, fmtNum, esc, ic as ic0, secOfSeries, LINKS } from "../site/js/core.js";
import { EXTRA } from "./icons-extra.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "..");
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, "site", f), "utf8"));
init(readJSON("catalogue.json"), readJSON("data/library.json"));
const DB = state.DB;

const ic = (n, s = 20, cls = "") => EXTRA[n]
  ? `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EXTRA[n]}</svg>`
  : ic0(n, s, cls);

/* ── the data every look shows ── */
const clean = t => !/\.m\S*a|[⁦-⁩]/.test(t);                 // the mockups skip the few titles that still carry a file name
const totalH = Math.round(DB.lessons.reduce((a, l) => a + (l.duration || 0), 0) / 3600);
const SECS = visible().filter(s => s.id !== "books").map(s => ({ ...s, n: sectionCount(s.id) }));
const TOP = DB.series.slice().sort((a, b) => b.count - a.count).filter(s => s.id !== "misc").slice(0, 8);
const LATEST = DB.lessons.filter(l => l.date && clean(fullTitle(l))).slice(0, 6);
const L = byId["jabiri-2236"], LS = seriesById[L.series];
const SIB = DB.lessons.filter(l => l.series === L.series).sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.o - b.o);
const at = SIB.indexOf(L), NEAR = SIB.slice(Math.max(0, at - 3), at + 4);
const secT = s => secOfSeries(s).title;
const NAV = [["home", "الرئيسية"], ...SECS.slice(0, 6).map(s => [s.id, s.title])];
const STATS = [[fmtNum(DB.lessons.length), "مادة صوتية"], [fmtNum(DB.series.length), "سلسلة علمية"], [fmtNum(Math.floor(totalH / 100) * 100), "ساعة وأكثر"]];

/* the eight-pointed star (two squares), used as a mark and in patterns */
const star = (fill = "none", stroke = "currentColor", sw = 1.4) => `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"><rect x="9" y="9" width="22" height="22"/><rect x="9" y="9" width="22" height="22" transform="rotate(45 20 20)"/></g></svg>`;
const patternUrl = (color, op) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'><g fill='none' stroke='${color}' stroke-opacity='${op}' stroke-width='1'><rect x='17' y='17' width='22' height='22'/><rect x='17' y='17' width='22' height='22' transform='rotate(45 28 28)'/><path d='M0 28h6M50 28h6M28 0v6M28 50v6'/></g></svg>`)}")`;

const fontFace = (fam, file, w) => `@font-face{font-family:"${fam}";src:url(../fonts/${file}.woff2) format("woff2");font-weight:${w};font-display:swap}`;
const page = (look, title, css, body) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${css}</style></head><body class="${look}">${body}</body></html>`;

const BASE = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;letter-spacing:0}a{color:inherit;text-decoration:none}
.ic{display:inline-block;vertical-align:middle;flex:none}.c,.pb,.play,.go,.big,.mark,.mk{display:block}h1,h2,h3,p{margin:0}ul{list-style:none;margin:0;padding:0}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.only-m{display:none}@media(max-width:900px){.only-d{display:none!important}.only-m{display:flex}.wrap{padding:0 16px}}`;

/* ════════ 1. نقاء — modern, white and green, IBM Plex Sans Arabic ════════ */
const naqaa = (() => {
  const css = BASE + [fontFace("Plex", "ibm-plex-sans-arabic-arabic-400-normal", 400), fontFace("Plex", "ibm-plex-sans-arabic-arabic-500-normal", 500), fontFace("Plex", "ibm-plex-sans-arabic-arabic-700-normal", 700)].join("") + `
:root{--bg:#f6f7f4;--card:#fff;--ink:#13221c;--mute:#5b6a63;--line:#e3e7e2;--pri:#0b6a4d;--pri2:#0f8a63;--soft:#e7f3ed;--gold:#9a7428}
body{font-family:Plex,system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:16px;line-height:1.75}
.top{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.top .wrap{display:flex;align-items:center;gap:28px;height:72px}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;line-height:1.3}.brand small{display:block;font-weight:400;color:var(--mute);font-size:12.5px}
.mark{width:42px;height:42px;border-radius:12px;background:var(--pri);color:#fff;position:relative;flex:none}.mark svg{position:absolute;inset:8px;width:26px;height:26px}
.brand b{font-size:16.5px}.brand .hf{color:var(--pri);font-weight:500;font-size:13px}
nav.main{display:flex;gap:4px;margin-inline-start:auto}nav.main a{padding:8px 13px;border-radius:10px;color:var(--mute);font-weight:500;font-size:15px}
nav.main a.on{background:var(--soft);color:var(--pri)}
.ibtn{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);display:inline-grid;place-items:center;color:var(--ink);background:#fff}
.hero{background:#fff;border-bottom:1px solid var(--line);background-image:${patternUrl("#0b6a4d", .07)};background-size:56px}
.hero .wrap{display:grid;grid-template-columns:1.25fr 1fr;gap:48px;padding-top:56px;padding-bottom:56px;align-items:center}
.pill{display:inline-flex;align-items:center;gap:8px;background:var(--soft);color:var(--pri);border-radius:99px;padding:5px 14px;font-size:13.5px;font-weight:500}
.hero h1{font-size:46px;line-height:1.35;margin:16px 0 4px;font-weight:700}.hero .hf{color:var(--pri);font-size:22px;font-weight:500}
.hero p.lead{color:var(--mute);font-size:17px;margin:16px 0 24px;max-width:34em}
.search{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid var(--line);border-radius:16px;padding:6px 6px 6px 6px;box-shadow:0 8px 24px -16px rgba(11,106,77,.4)}
.search .ic{margin-inline-start:12px;color:var(--mute)}.search span{flex:1;color:#8b968f;font-size:15.5px}
.search b{background:var(--pri);color:#fff;border-radius:11px;padding:10px 22px;font-weight:500}
.stats{display:flex;gap:36px;margin-top:28px}.stats b{display:block;font-size:28px;color:var(--ink);line-height:1.2}.stats span{color:var(--mute);font-size:14px}
.now{background:var(--ink);color:#fff;border-radius:24px;padding:28px;position:relative;overflow:hidden}
.now:after{content:"";position:absolute;inset:0;background-image:${patternUrl("#ffffff", .06)};background-size:56px;pointer-events:none}
.now small{color:#9fd6bf;font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:8px}
.now h3{font-size:22px;line-height:1.55;margin:12px 0 6px}.now .m{color:#b9c6c0;font-size:14px}
.wave{display:flex;align-items:center;gap:3px;height:54px;margin:22px 0 18px}.wave i{flex:1;background:#2c4a3e;border-radius:3px}.wave i.p{background:#3fbf8a}
.ctrl{display:flex;align-items:center;gap:14px;position:relative;z-index:1}
.play{width:58px;height:58px;border-radius:50%;background:#3fbf8a;color:var(--ink);position:relative;flex:none}.play .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.ctrl .t{color:#b9c6c0;font-size:13.5px;font-variant-numeric:tabular-nums}.ctrl .sp{margin-inline-start:auto;border:1px solid #2f4a3f;border-radius:99px;padding:4px 12px;font-size:13px;color:#d5e2dc}
section.blk{padding:52px 0 8px}.hd{display:flex;align-items:end;justify-content:space-between;margin-bottom:20px}
.hd h2{font-size:24px;font-weight:700}.hd a{color:var(--pri);font-weight:500;font-size:15px;display:flex;align-items:center;gap:4px}
.secs{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}
.sec{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 16px;text-align:center}
.sec .c{width:52px;height:52px;border-radius:16px;background:var(--soft);color:var(--pri);margin:0 auto 12px;position:relative}.sec .c .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.sec b{display:block;font-size:17px}.sec span{color:var(--mute);font-size:13.5px}
.series{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.sc{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:10px;min-height:168px}
.sc .tag{align-self:flex-start;font-size:12.5px;color:var(--gold);background:#f7f0e1;border-radius:8px;padding:2px 10px;font-weight:500}
.sc h3{font-size:18.5px;line-height:1.5}.sc .m{margin-top:auto;display:flex;gap:14px;color:var(--mute);font-size:13.5px;align-items:center}
.sc .go{margin-inline-start:auto;width:34px;height:34px;border-radius:10px;background:var(--soft);color:var(--pri);position:relative}.sc .go .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.list{background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden}
.row{display:flex;align-items:center;gap:16px;padding:16px 20px;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.row .pb{width:42px;height:42px;border-radius:50%;background:var(--soft);color:var(--pri);position:relative;flex:none}.row .pb .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.row .tt{flex:1;min-width:0}.row .t{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row .s{color:var(--mute);font-size:13.5px}
.row .d{color:var(--mute);font-size:14px;font-variant-numeric:tabular-nums}.row.on{background:var(--soft)}.row.on .pb{background:var(--pri);color:#fff}
.foot{margin-top:64px;background:#fff;border-top:1px solid var(--line);padding:32px 0 40px;color:var(--mute);font-size:14.5px}
.foot .wrap{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.foot b{color:var(--ink)}.foot nav{display:flex;gap:18px;flex-wrap:wrap}
.crumb{color:var(--mute);font-size:14px;padding:22px 0 8px}.crumb a{color:var(--pri)}
.lesson>*{min-width:0}.lesson{display:grid;grid-template-columns:1fr 380px;gap:28px;align-items:start;padding-top:8px}
.lesson h1{font-size:32px;line-height:1.5;margin:6px 0 12px}.meta{display:flex;gap:10px;flex-wrap:wrap}.meta span{display:inline-flex;gap:6px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px;padding:4px 12px;font-size:14px;color:var(--mute)}
.player{margin-top:22px;background:var(--ink);color:#fff;border-radius:24px;padding:28px}
.bar{height:6px;border-radius:6px;background:#2c4a3e;position:relative;margin:4px 0 10px}.bar i{position:absolute;inset-inline-start:0;top:0;bottom:0;width:34%;background:#3fbf8a;border-radius:6px}
.bar i:after{content:"";position:absolute;inset-inline-end:-7px;top:-5px;width:16px;height:16px;border-radius:50%;background:#fff}
.times{display:flex;justify-content:space-between;color:#b9c6c0;font-size:13.5px;font-variant-numeric:tabular-nums}
.pctl{display:flex;align-items:center;justify-content:center;gap:26px;margin-top:14px}.pctl .s{color:#d5e2dc;position:relative}.pctl .s small{position:absolute;top:50%;left:50%;transform:translate(-50%,-45%);font-size:9px}
.pctl .play{width:68px;height:68px}
.speeds{display:flex;gap:8px;justify-content:center;margin-top:18px}.speeds span{border:1px solid #2f4a3f;border-radius:99px;padding:3px 12px;font-size:13px;color:#d5e2dc}.speeds .on{background:#3fbf8a;color:var(--ink);border-color:#3fbf8a}
.acts{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:10px 18px;font-weight:500;font-size:15px;background:#fff;border:1px solid var(--line)}.btn.p{background:var(--pri);color:#fff;border-color:var(--pri)}
.side h2{font-size:18px;margin-bottom:12px}.side .row{padding:12px 16px}.side .row .t{font-size:15px}
.bottom{position:fixed;bottom:0;inset-inline:0;background:#fff;border-top:1px solid var(--line);height:66px;justify-content:space-around;align-items:center;z-index:5}
.bottom a{display:flex;flex-direction:column;align-items:center;font-size:12px;color:var(--mute);gap:2px}.bottom a.on{color:var(--pri)}
@media(max-width:1100px){.secs{grid-template-columns:repeat(4,1fr)}.series{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){body{padding-bottom:70px}.top .wrap{height:62px;gap:12px}.brand small{display:none}.brand b{font-size:15px}.top .ibtn{margin-inline-start:auto}
 .hero .wrap{grid-template-columns:1fr;padding-top:28px;padding-bottom:28px;gap:28px}.hero h1{font-size:31px}.hero .hf{font-size:18px}.hero p.lead{font-size:15.5px;margin:12px 0 18px}
 .stats{gap:22px}.stats b{font-size:22px}.search b{padding:9px 16px}
 .secs{grid-template-columns:repeat(2,1fr)}.sec{display:flex;align-items:center;gap:12px;text-align:start;padding:14px}.sec .c{margin:0;width:44px;height:44px}.sec b{font-size:16px}
 .series{grid-template-columns:1fr}.sc{min-height:0}section.blk{padding-top:36px}.hd h2{font-size:20px}
 .lesson{grid-template-columns:1fr}.lesson h1{font-size:24px}.player{padding:22px}.row{padding:14px}}`;

  const top = active => `<header class="top"><div class="wrap">
    <a class="brand" href="index.html"><span class="mark">${star("none", "#fff", 2)}</span><span><b>الشيخ يحيى بن أحمد الجابري</b> <span class="hf">حفظه الله</span><small>الموقع الرسمي · دروس ومحاضرات وخطب</small></span></a>
    <nav class="main only-d">${NAV.map(([id, t]) => `<a href="#"${id === active ? ' class="on"' : ""}>${t}</a>`).join("")}</nav>
    <a class="ibtn only-d" href="#">${ic("search", 19)}</a><a class="ibtn only-d" href="#">${ic("moon", 19)}</a><a class="ibtn only-m" href="#">${ic("menu", 21)}</a></div></header>`;
  const bottom = active => `<nav class="bottom only-m">${[["home", "house", "الرئيسية"], ["lib", "layout-grid", "الأقسام"], ["search", "search", "بحث"], ["khutab", "scroll-text", "الخطب"], ["more", "menu", "المزيد"]].map(([id, i, t]) => `<a href="#"${id === active ? ' class="on"' : ""}>${ic(i, 22)}<span>${t}</span></a>`).join("")}</nav>`;
  const foot = `<footer class="foot"><div class="wrap"><div><b>الموقع الرسمي لفضيلة الشيخ الوالد يحيى بن أحمد الجابري حفظه الله ورعاه</b><br>المواد الصوتية من قنوات الشيخ على تيليجرام.</div><nav>${LINKS.map(x => `<a href="#">${esc(x.t)}</a>`).join("")}</nav></div></footer>`;
  const wave = n => Array.from({ length: 48 }, (_, i) => `<i style="height:${18 + Math.round(70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * .37)))}%"${i < n ? ' class="p"' : ""}></i>`).join("");
  const row = (l, on) => `<a class="row${on ? " on" : ""}" href="lesson.html"><span class="pb">${ic(on ? "pause" : "play", 18)}</span><span class="tt"><span class="t">${esc(fullTitle(l))}</span><span class="s">${esc(seriesById[l.series].title)} · ${ldate(l)}</span></span>${l.duration ? `<span class="d">${dur(l.duration)}</span>` : ""}</a>`;
  const n0 = LATEST[0];
  const home = page("naqaa", "نقاء — الرئيسية", css, `${top("home")}
  <section class="hero"><div class="wrap"><div>
    <span class="pill">${ic("check", 15)} الموقع الرسمي لفضيلة الشيخ الوالد</span>
    <h1>الشيخ يحيى بن أحمد الجابري</h1><div class="hf">حفظه الله ورعاه</div>
    <p class="lead">دروس الشيخ في التفسير والحديث والعقيدة، وخطبه ومحاضراته، مرتّبة في سلاسل للاستماع والتحميل.</p>
    <div class="search">${ic("search", 20)}<span>ابحث عن درس أو كتاب أو باب…</span><b>بحث</b></div>
    <ul class="stats">${STATS.map(([b, t]) => `<li><b>${b}</b><span>${t}</span></li>`).join("")}</ul></div>
    <div class="now"><small>${ic("headphones", 16)} أحدث درس · ${ldate(n0)}</small><h3>${esc(fullTitle(n0))}</h3><div class="m">${esc(seriesById[n0.series].title)}</div>
      <div class="wave">${wave(14)}</div><div class="ctrl"><span class="play">${ic("play", 26)}</span><span class="t">٠٠:٠٠ / ${dur(n0.duration)}</span><span class="sp">١٫٥×</span></div></div></div></section>
  <div class="wrap">
  <section class="blk"><div class="hd"><h2>الأقسام</h2></div><div class="secs">${SECS.map(s => `<a class="sec" href="#"><span class="c">${ic(s.icon, 24)}</span><span><b>${s.title}</b><span>${fmtNum(s.n)} مادة</span></span></a>`).join("")}</div></section>
  <section class="blk"><div class="hd"><h2>السلاسل العلمية</h2><a href="#">كل السلاسل ${ic("chevron-left", 16)}</a></div><div class="series">${TOP.map(s => `<a class="sc" href="#"><span class="tag">${secT(s)}</span><h3>${esc(s.title)}</h3><div class="m"><span>${fmtNum(s.count)} درسًا</span>${hours(s.seconds) ? `<span>${hours(s.seconds)}</span>` : ""}<span class="go">${ic("chevron-left", 18)}</span></div></a>`).join("")}</div></section>
  <section class="blk"><div class="hd"><h2>أحدث المواد</h2><a href="#">الكل ${ic("chevron-left", 16)}</a></div><div class="list">${LATEST.map(l => row(l)).join("")}</div></section>
  </div>${foot}${bottom("home")}`);
  const lesson = page("naqaa", "نقاء — درس", css, `${top("hadith")}<div class="wrap">
  <nav class="crumb"><a href="index.html">الرئيسية</a> / <a href="#">الحديث</a> / <a href="#">${esc(LS.title)}</a></nav>
  <div class="lesson"><div>
    <span class="pill">${esc(LS.title)}</span><h1>${esc(fullTitle(L))}</h1>
    <div class="meta"><span>${ic("calendar", 15)}${ldate(L)}</span><span>${ic("clock", 15)}${dur(L.duration)}</span><span>${ic("list-music", 15)}الدرس ${fmtNum(at + 1)} من ${fmtNum(SIB.length)}</span></div>
    <div class="player"><div class="wave">${wave(17)}</div><div class="bar"><i></i></div><div class="times"><span>١٧:٠٨</span><span>${dur(L.duration)}</span></div>
      <div class="pctl"><span class="s">${ic("rotate-cw", 30)}<small>١٥</small></span><span class="play">${ic("pause", 28)}</span><span class="s">${ic("rotate-ccw", 30)}<small>١٥</small></span></div>
      <div class="speeds"><span>١×</span><span>١٫٢٥×</span><span class="on">١٫٥×</span><span>٢×</span></div></div>
    <div class="acts"><a class="btn p" href="#">${ic("download", 18)} تحميل</a><a class="btn" href="#">${ic("share-2", 18)} مشاركة</a><a class="btn" href="#">${ic("external-link", 18)} المنشور على تيليجرام</a></div></div>
  <aside class="side"><h2>دروس السلسلة</h2><div class="list">${NEAR.map(l => row(l, l === L)).join("")}</div></aside></div></div>${foot}${bottom("")}`);
  return { home, lesson };
})();

/* ════════ 2. رِواق — sand, deep teal and gold, Amiri headings, arches and star pattern ════════ */
const riwaq = (() => {
  const css = BASE + [fontFace("Amiri", "amiri-arabic-400-normal", 400), fontFace("Amiri", "amiri-arabic-700-normal", 700), fontFace("Naskh", "noto-naskh-arabic-arabic-400-normal", 400), fontFace("Naskh", "noto-naskh-arabic-arabic-500-normal", 500), fontFace("Naskh", "noto-naskh-arabic-arabic-700-normal", 700)].join("") + `
:root{--bg:#f3ecdf;--paper:#fbf8f2;--ink:#2b2219;--mute:#6e6153;--line:#e0d3bd;--teal:#0e4a4c;--teal2:#145f61;--gold:#b48a3a;--gold-l:#e2c27a}
body{font-family:Naskh,serif;background:var(--bg);color:var(--ink);font-size:17px;line-height:1.85}
.am{font-family:Amiri,serif}
.top{background:var(--teal);color:#fff;border-bottom:3px solid var(--gold)}
.top .wrap{display:flex;align-items:center;gap:24px;height:76px}
.brand{display:flex;align-items:center;gap:12px;line-height:1.25}.brand svg{width:40px;height:40px;color:var(--gold-l)}
.brand b{font-family:Amiri,serif;font-size:21px;font-weight:700}.brand .hf{color:var(--gold-l);font-family:Amiri,serif;font-size:16px}.brand small{display:block;color:#a9c4c2;font-size:12.5px}
nav.main{display:flex;gap:2px;margin-inline-start:auto}nav.main a{padding:6px 12px;color:#d6e4e2;font-size:15.5px;border-bottom:2px solid transparent}nav.main a.on{color:#fff;border-color:var(--gold-l)}
.ibtn{width:40px;height:40px;border-radius:50%;border:1px solid #3b7374;display:inline-grid;place-items:center;color:#fff}
.hero{background:var(--teal) ${patternUrl("#e2c27a", .13)};background-size:56px;padding:44px 0 0;color:#fff}
.arch{max-width:760px;margin:0 auto;background:var(--paper);color:var(--ink);text-align:center;border-radius:380px 380px 0 0;padding:70px 48px 40px;position:relative;border:2px solid var(--gold);border-bottom:0;box-shadow:inset 0 0 0 8px var(--paper),inset 0 0 0 9px var(--line)}
.bism{font-family:Amiri,serif;font-size:22px;color:var(--teal)}
.arch .pre{font-family:Amiri,serif;color:var(--mute);font-size:19px;margin-top:14px}
.arch h1{font-family:Amiri,serif;font-weight:700;font-size:56px;line-height:1.4;color:var(--teal)}
.arch .hf{font-family:Amiri,serif;font-size:24px;color:var(--gold)}
.orn{display:flex;align-items:center;gap:14px;justify-content:center;margin:16px 0;color:var(--gold)}.orn i{height:1px;width:90px;background:var(--gold)}.orn svg{width:22px;height:22px}
.arch p{color:var(--mute);max-width:32em;margin:0 auto 22px}
.search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;max-width:540px;margin:0 auto;color:#9b8f80;font-size:16px}.search .ic{color:var(--teal)}
.stats{display:flex;justify-content:center;gap:0;margin-top:26px;border-top:1px solid var(--line);padding-top:18px}.stats li{padding:0 26px;border-inline-start:1px solid var(--line)}.stats li:first-child{border:0}
.stats b{display:block;font-family:Amiri,serif;font-size:30px;color:var(--teal);line-height:1.2}.stats span{font-size:14px;color:var(--mute)}
section.blk{padding:52px 0 0}.hd{text-align:center;margin-bottom:26px}.hd h2{font-family:Amiri,serif;font-size:32px;color:var(--teal);font-weight:700}
.hd .orn{margin:6px 0 0}.hd .orn i{width:60px}
.secs{display:grid;grid-template-columns:repeat(7,1fr);gap:14px}
.sec{background:var(--paper);border:1px solid var(--line);border-radius:90px 90px 10px 10px;padding:28px 10px 18px;text-align:center}
.sec .c{width:56px;height:56px;margin:0 auto 10px;border-radius:50%;background:var(--teal);color:var(--gold-l);position:relative}.sec .c .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.sec b{display:block;font-family:Amiri,serif;font-size:21px;color:var(--teal)}.sec span{font-size:13.5px;color:var(--mute)}
.table{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:6px 26px;display:grid;grid-template-columns:1fr 1fr;column-gap:44px}
.tr{display:flex;align-items:center;gap:14px;padding:16px 0;border-bottom:1px dashed var(--line)}
.tr .n{width:44px;height:44px;flex:none;color:var(--gold);position:relative}.tr .n svg{width:44px;height:44px}.tr .n b{position:absolute;inset:0;display:grid;place-items:center;font-size:14px;color:var(--teal);font-family:Amiri,serif}
.tr .tt{flex:1}.tr h3{font-family:Amiri,serif;font-size:21px;font-weight:700;line-height:1.4}.tr .s{font-size:14px;color:var(--mute)}
.tr .c{font-family:Amiri,serif;color:var(--teal);font-size:18px;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;gap:6px;border-top:4px solid var(--teal)}
.card .k{font-size:13.5px;color:var(--gold);font-weight:500}.card h3{font-family:Amiri,serif;font-size:20px;line-height:1.55}
.card .m{display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:10px;color:var(--mute);font-size:14px}
.pb{width:40px;height:40px;border-radius:50%;background:var(--teal);color:#fff;position:relative;flex:none}.pb .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.card .m .pb{margin-inline-start:auto}
.foot{margin-top:64px;background:var(--teal);color:#cfe0de;padding:30px 0 40px;font-size:15px;border-top:3px solid var(--gold)}.foot b{color:#fff;font-family:Amiri,serif;font-size:19px;font-weight:400}.foot nav{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px}.foot a{color:var(--gold-l)}
.crumb{color:var(--mute);font-size:15px;padding:24px 0 6px}.crumb a{color:var(--teal)}
.lhead{text-align:center;max-width:820px;margin:0 auto}.lhead .k{color:var(--gold);font-family:Amiri,serif;font-size:20px}
.lhead h1{font-family:Amiri,serif;font-size:38px;line-height:1.5;color:var(--teal);font-weight:700}
.meta{display:flex;justify-content:center;gap:18px;color:var(--mute);font-size:15px;flex-wrap:wrap}.meta span{display:inline-flex;align-items:center;gap:6px}
.player{max-width:820px;margin:22px auto 0;background:var(--teal) ${patternUrl("#e2c27a", .1)};background-size:56px;color:#fff;border-radius:16px;padding:26px 30px;border:1px solid var(--gold)}
.pl{display:flex;align-items:center;gap:20px}.big{width:64px;height:64px;border-radius:50%;background:var(--gold-l);color:var(--teal);position:relative;flex:none}.big .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.pl .x{flex:1}.bar{height:5px;background:#3d7071;border-radius:5px;position:relative}.bar i{position:absolute;inset-inline-start:0;top:0;bottom:0;width:34%;background:var(--gold-l);border-radius:5px}
.times{display:flex;justify-content:space-between;color:#bcd3d1;font-size:14px;margin-top:6px}
.speeds{display:flex;gap:6px}.speeds span{border:1px solid #3d7071;border-radius:8px;padding:0 10px;font-size:14px}.speeds .on{background:var(--gold-l);color:var(--teal);border-color:var(--gold-l)}
.acts{display:flex;justify-content:center;gap:10px;margin-top:16px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--paper);border-radius:10px;padding:8px 18px;color:var(--teal)}.btn.p{background:var(--teal);color:#fff;border-color:var(--teal)}
.toc{max-width:820px;margin:40px auto 0;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:8px 26px}
.toc h2{font-family:Amiri,serif;color:var(--teal);font-size:24px;padding:12px 0 4px;text-align:center}
.toc a{display:flex;gap:14px;align-items:center;padding:12px 0;border-bottom:1px dashed var(--line)}.toc a:last-child{border:0}.toc .i{font-family:Amiri,serif;color:var(--gold);min-width:30px;font-size:18px}.toc .t{flex:1}.toc .d{color:var(--mute);font-size:14px}
.toc a.on{color:var(--teal);font-weight:700}.toc a.on .i{color:var(--teal)}
.bottom{position:fixed;bottom:0;inset-inline:0;background:var(--teal);border-top:2px solid var(--gold);height:66px;justify-content:space-around;align-items:center;z-index:5}
.bottom a{display:flex;flex-direction:column;align-items:center;font-size:12.5px;color:#bcd3d1}.bottom a.on{color:var(--gold-l)}
@media(max-width:1100px){.secs{grid-template-columns:repeat(4,1fr)}.cards{grid-template-columns:1fr 1fr}}
@media(max-width:900px){body{padding-bottom:70px;font-size:16px}.top .wrap{height:64px}.brand small{display:none}.brand b{font-size:18px}.brand svg{width:32px;height:32px}.top .ibtn{margin-inline-start:auto}
 .hero{padding-top:22px}.arch{padding:46px 18px 26px;border-radius:200px 200px 0 0}.bism{font-size:18px}.arch .pre{font-size:16px}.arch h1{font-size:34px}.arch .hf{font-size:19px}.arch p{font-size:15px}
 .stats li{padding:0 14px}.stats b{font-size:24px}.hd h2{font-size:26px}section.blk{padding-top:38px}
 .secs{grid-template-columns:repeat(3,1fr);gap:10px}.sec{border-radius:60px 60px 10px 10px;padding:18px 4px 10px}.sec .c{width:42px;height:42px}.sec b{font-size:18px}.table{grid-template-columns:1fr;padding:4px 16px}.cards{grid-template-columns:1fr}
 .lhead h1{font-size:27px}.player{padding:20px}.pl{flex-wrap:wrap}.pl .x{flex-basis:calc(100% - 84px)}.speeds{width:100%;justify-content:center}.toc{padding:6px 16px}}`;

  const top = active => `<header class="top"><div class="wrap">
    <a class="brand" href="index.html">${star("none", "currentColor", 1.6)}<span><b>الشيخ يحيى بن أحمد الجابري</b> <span class="hf">حفظه الله</span><small>الموقع الرسمي</small></span></a>
    <nav class="main only-d">${NAV.map(([id, t]) => `<a href="#"${id === active ? ' class="on"' : ""}>${t}</a>`).join("")}</nav>
    <a class="ibtn only-d" href="#">${ic("search", 18)}</a><a class="ibtn only-d" href="#">${ic("moon", 18)}</a><a class="ibtn only-m" href="#">${ic("menu", 20)}</a></div></header>`;
  const orn = `<div class="orn"><i></i>${star("none", "currentColor", 2)}<i></i></div>`;
  const bottom = active => `<nav class="bottom only-m">${[["home", "house", "الرئيسية"], ["lib", "layout-grid", "الأقسام"], ["search", "search", "بحث"], ["khutab", "scroll-text", "الخطب"], ["more", "menu", "المزيد"]].map(([id, i, t]) => `<a href="#"${id === active ? ' class="on"' : ""}>${ic(i, 22)}<span>${t}</span></a>`).join("")}</nav>`;
  const foot = `<footer class="foot"><div class="wrap"><b>الموقع الرسمي لفضيلة الشيخ الوالد يحيى بن أحمد الجابري حفظه الله ورعاه</b><nav>${LINKS.map(x => `<a href="#">${esc(x.t)}</a>`).join("")}</nav></div></footer>`;
  const home = page("riwaq", "رواق — الرئيسية", css, `${top("home")}
  <section class="hero"><div class="wrap"><div class="arch"><div class="bism">بسم الله الرحمن الرحيم</div>
    <div class="pre">الموقع الرسمي لفضيلة الشيخ الوالد</div><h1>يحيى بن أحمد الجابري</h1><div class="hf">حفظه الله ورعاه</div>${orn}
    <p>دروس الشيخ في التفسير والحديث والعقيدة، وخطبه ومحاضراته، مرتّبة في سلاسل للاستماع والتحميل.</p>
    <div class="search">${ic("search", 20)}<span>ابحث عن درس أو كتاب أو باب…</span></div>
    <ul class="stats">${STATS.map(([b, t]) => `<li><b>${b}</b><span>${t}</span></li>`).join("")}</ul></div></div></section>
  <div class="wrap">
  <section class="blk"><div class="hd"><h2>الأقسام</h2>${orn}</div><div class="secs">${SECS.map(s => `<a class="sec" href="#"><span class="c">${ic(s.icon, 24)}</span><b>${s.title}</b><span>${fmtNum(s.n)} مادة</span></a>`).join("")}</div></section>
  <section class="blk"><div class="hd"><h2>مجالس العلم</h2>${orn}</div><div class="table">${TOP.map((s, i) => `<a class="tr" href="#"><span class="n">${star("none", "currentColor", 1.6)}<b>${fmtNum(i + 1)}</b></span><span class="tt"><h3>${esc(s.title)}</h3><span class="s">${secT(s)}${hours(s.seconds) ? " · " + hours(s.seconds) : ""}</span></span><span class="c">${fmtNum(s.count)} درسًا</span></a>`).join("")}</div></section>
  <section class="blk"><div class="hd"><h2>أحدث المواد</h2>${orn}</div><div class="cards">${LATEST.map(l => `<a class="card" href="lesson.html"><span class="k">${esc(seriesById[l.series].title)}</span><h3>${esc(fullTitle(l))}</h3><div class="m"><span>${ldate(l)}</span>${l.duration ? `<span>${dur(l.duration)}</span>` : ""}<span class="pb">${ic("play", 18)}</span></div></a>`).join("")}</div></section>
  </div>${foot}${bottom("home")}`);
  const lesson = page("riwaq", "رواق — درس", css, `${top("hadith")}<div class="wrap">
  <nav class="crumb"><a href="index.html">الرئيسية</a> / <a href="#">الحديث</a> / <a href="#">${esc(LS.title)}</a></nav>
  <div class="lhead"><div class="k">${esc(LS.title)}</div><h1>${esc(fullTitle(L))}</h1>${orn}
    <div class="meta"><span>${ic("calendar", 16)}${ldate(L)}</span><span>${ic("clock", 16)}${dur(L.duration)}</span><span>${ic("list-music", 16)}الدرس ${fmtNum(at + 1)} من ${fmtNum(SIB.length)}</span></div></div>
  <div class="player"><div class="pl"><span class="big">${ic("pause", 28)}</span><div class="x"><div class="bar"><i></i></div><div class="times"><span>١٧:٠٨</span><span>${dur(L.duration)}</span></div></div>
    <div class="speeds"><span>١×</span><span>١٫٢٥×</span><span class="on">١٫٥×</span><span>٢×</span></div></div></div>
  <div class="acts"><a class="btn p" href="#">${ic("download", 18)} تحميل</a><a class="btn" href="#">${ic("share-2", 18)} مشاركة</a><a class="btn" href="#">${ic("external-link", 18)} المنشور على تيليجرام</a></div>
  <div class="toc"><h2>فهرس السلسلة</h2>${NEAR.map(l => `<a href="lesson.html"${l === L ? ' class="on"' : ""}><span class="i">${fmtNum(SIB.indexOf(l) + 1)}</span><span class="t">${esc(fullTitle(l))}</span><span class="d">${dur(l.duration)}</span></a>`).join("")}</div>
  </div>${foot}${bottom("")}`);
  return { home, lesson };
})();

/* ════════ 3. مَجلِس — audio first, night green and brass, Tajawal, series as covers, a player always at hand ════════ */
const majlis = (() => {
  const COV = ["#0f3b2e", "#123c56", "#5a1f2b", "#3b2f63", "#6b4a16", "#1d4f4a", "#2d3a1a", "#47301f"];
  const css = BASE + [fontFace("Tajawal", "tajawal-arabic-400-normal", 400), fontFace("Tajawal", "tajawal-arabic-500-normal", 500), fontFace("Tajawal", "tajawal-arabic-700-normal", 700), fontFace("Amiri", "amiri-arabic-700-normal", 700)].join("") + `
:root{--bg:#f4f5f2;--card:#fff;--ink:#121a17;--mute:#5f6a65;--line:#e2e5e1;--night:#0c231c;--night2:#133328;--brass:#d4ae58;--brass2:#a8832f}
body{font-family:Tajawal,system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:16.5px;line-height:1.7;padding-bottom:92px}
.top{background:var(--night);color:#fff}.top .wrap{display:flex;align-items:center;gap:24px;height:70px}
.brand{display:flex;align-items:center;gap:12px;line-height:1.3}.brand .mk{width:40px;height:40px;color:var(--brand,var(--brass))}.brand .mk svg{width:40px;height:40px}
.brand b{font-size:17px;font-weight:700}.brand .hf{color:var(--brass);font-weight:500;font-size:14px}.brand small{display:block;color:#8fa79d;font-size:12.5px}
nav.main{display:flex;gap:4px;margin-inline-start:auto}nav.main a{padding:7px 13px;border-radius:99px;color:#b8c9c2;font-weight:500;font-size:15px}nav.main a.on{background:var(--night2);color:var(--brass)}
.ibtn{width:40px;height:40px;border-radius:50%;background:var(--night2);display:inline-grid;place-items:center;color:#fff}
.hero{background:var(--night) ${patternUrl("#d4ae58", .07)};background-size:56px;color:#fff;padding:40px 0 48px}
.hero .wrap{display:grid;grid-template-columns:1fr 1.05fr;gap:40px;align-items:center}
.hero .pre{color:var(--brass);font-weight:500}.hero h1{font-family:Amiri,serif;font-size:50px;line-height:1.4;font-weight:700;margin:6px 0 2px}.hero .hf{color:#cbd8d2;font-size:19px}
.hero p{color:#a9bdb4;margin:16px 0 22px;max-width:30em}
.search{display:flex;align-items:center;gap:10px;background:#fff;color:#7d8883;border-radius:99px;padding:13px 20px;max-width:480px}.search .ic{color:var(--night)}
.stats{display:flex;gap:30px;margin-top:24px}.stats b{display:block;color:var(--brass);font-size:26px;font-weight:700;line-height:1.2}.stats span{color:#a9bdb4;font-size:14px}
.feat{background:var(--night2);border-radius:22px;padding:18px;display:flex;gap:18px;align-items:center;border:1px solid #1e4637}
.cover{border-radius:16px;position:relative;overflow:hidden;color:#fff;background-size:56px;display:flex;flex-direction:column;justify-content:flex-end;padding:14px}
.cover:before{content:"";position:absolute;inset:0;background-image:${patternUrl("#ffffff", .1)};background-size:56px}
.cover .ct{position:relative;font-weight:700;line-height:1.35}.cover .cn{position:relative;font-size:12.5px;opacity:.85}
.cover .cs{position:absolute;top:12px;inset-inline-start:12px;width:24px;height:24px;color:var(--brass)}
.feat .cover{width:170px;height:170px;flex:none}.feat .cover .ct{font-size:21px}
.feat small{color:var(--brass);font-weight:500;font-size:13.5px}.feat h3{font-size:20px;line-height:1.5;margin:6px 0}.feat .m{color:#a9bdb4;font-size:14px}
.feat .go{display:inline-flex;align-items:center;gap:10px;margin-top:14px;background:var(--brass);color:var(--night);border-radius:99px;padding:9px 20px 9px 22px;font-weight:700}
section.blk{padding:44px 0 0}.hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.hd h2{font-size:23px;font-weight:700}.hd a{color:var(--brass2);font-weight:500;display:flex;align-items:center;gap:4px}
.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:99px;padding:8px 16px 8px 18px;font-weight:500}.chip small{color:var(--mute);font-weight:400}.chip .ic{color:var(--brass2)}
.covers{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.covers .cover{aspect-ratio:1/1}.covers .ct{font-size:22px}
.covers a{display:block}.covers .sub{display:flex;justify-content:space-between;color:var(--mute);font-size:14px;margin-top:8px}
.eps{background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden}
.ep{display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid var(--line)}.ep:first-child{border:0}
.ep .mini{width:52px;height:52px;border-radius:12px;flex:none;padding:0}.ep .mini:before{background-size:28px}
.ep .tt{flex:1;min-width:0}.ep .t{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep .s{color:var(--mute);font-size:14px}
.pb{width:42px;height:42px;border-radius:50%;border:1.5px solid var(--night);color:var(--night);position:relative;flex:none}.pb .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.ep .d{color:var(--mute);font-size:14px;min-width:52px;text-align:end}.ep.on{background:#f6f1e2}.ep.on .pb{background:var(--night);color:var(--brass)}
.dock{position:fixed;bottom:0;inset-inline:0;background:var(--night);color:#fff;z-index:6;border-top:1px solid #1e4637}
.dock .wrap{display:flex;align-items:center;gap:16px;height:80px}.dock .mini{width:52px;height:52px;border-radius:10px;flex:none;padding:0}
.dock .tt{min-width:0;flex:0 1 300px}.dock .t{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dock .s{color:#8fa79d;font-size:13px}
.dock .c{display:flex;align-items:center;gap:16px;color:#cbd8d2}.dock .play{width:46px;height:46px;border-radius:50%;background:var(--brass);color:var(--night);position:relative}.dock .play .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.dock .pr{flex:1;display:flex;align-items:center;gap:10px;color:#8fa79d;font-size:13px}.bar{flex:1;height:4px;border-radius:4px;background:#28473b;position:relative}.bar i{position:absolute;inset-inline-start:0;top:0;bottom:0;width:34%;background:var(--brass);border-radius:4px}
.dock .sp{border:1px solid #2b5545;border-radius:99px;padding:2px 10px;font-size:13px}
.foot{margin-top:56px;border-top:1px solid var(--line);padding:26px 0;color:var(--mute);font-size:14.5px}.foot b{color:var(--ink)}.foot nav{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px}.foot a{color:var(--brass2)}
.lhero{background:var(--night);color:#fff;padding:30px 0 36px}.lhero .wrap{display:flex;gap:30px;align-items:center}
.lhero .cover{width:240px;height:240px;flex:none}.lhero .cover .ct{font-size:28px}
.crumb{color:#8fa79d;font-size:14px}.crumb a{color:var(--brass)}
.lhero h1{font-size:30px;line-height:1.5;margin:8px 0 10px}.meta{display:flex;gap:16px;color:#a9bdb4;font-size:14.5px;flex-wrap:wrap}.meta span{display:inline-flex;gap:6px;align-items:center}
.lp{margin-top:20px}.lp .bar{height:6px}.times{display:flex;justify-content:space-between;color:#8fa79d;font-size:13.5px;margin-top:6px}
.ctl{display:flex;align-items:center;gap:22px;margin-top:10px}.ctl .s{position:relative;color:#cbd8d2}.ctl .s small{position:absolute;top:50%;left:50%;transform:translate(-50%,-45%);font-size:9px}
.ctl .play{width:62px;height:62px;border-radius:50%;background:var(--brass);color:var(--night);position:relative}.ctl .play .ic{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.ctl .speeds{margin-inline-start:auto;display:flex;gap:6px}.speeds span{border:1px solid #2b5545;border-radius:99px;padding:2px 11px;font-size:13.5px;color:#cbd8d2}.speeds .on{background:var(--brass);border-color:var(--brass);color:var(--night)}
.acts{display:flex;gap:10px;margin:22px 0 0;flex-wrap:wrap}.btn{display:inline-flex;gap:8px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:99px;padding:9px 18px;font-weight:500}.btn.p{background:var(--night);color:var(--brass);border-color:var(--night)}
.bottom{display:none}
@media(max-width:1100px){.covers{grid-template-columns:repeat(3,1fr)}}
@media(max-width:900px){body{padding-bottom:138px}.top .wrap{height:60px}.brand small{display:none}.brand b{font-size:15px}.brand .mk,.brand .mk svg{width:32px;height:32px}.top .ibtn{margin-inline-start:auto}
 .hero{padding:26px 0 30px}.hero .wrap{grid-template-columns:1fr;gap:26px}.hero h1{font-size:34px}.hero .hf{font-size:17px}.hero p{font-size:15px;margin:10px 0 18px}.stats{gap:22px}.stats b{font-size:22px}
 .feat{padding:14px;gap:14px}.feat .cover{width:112px;height:112px}.feat .cover .ct{font-size:15px}.feat h3{font-size:16px}.feat .go{padding:7px 16px;margin-top:10px}
 .covers{display:flex;overflow-x:auto;gap:12px;margin:0 -16px;padding:0 16px 6px;scrollbar-width:none}.covers a{flex:0 0 150px}.covers .ct{font-size:17px}
 section.blk{padding-top:32px}.hd h2{font-size:20px}.ep{padding:12px}.ep .mini{width:46px;height:46px}.ep .d{display:none}
 .dock{bottom:64px;border-radius:16px;margin:0 8px;border:0}.dock .wrap{height:64px;gap:10px;padding:0 10px}.dock .mini{width:44px;height:44px}.dock .tt{flex:1}.dock .pr,.dock .c .s,.dock .sp{display:none}
 .bottom{display:flex;position:fixed;bottom:0;inset-inline:0;height:62px;background:#fff;border-top:1px solid var(--line);justify-content:space-around;align-items:center;z-index:5}
 .bottom a{display:flex;flex-direction:column;align-items:center;font-size:12px;color:var(--mute)}.bottom a.on{color:var(--night);font-weight:700}
 .lhero .wrap{flex-direction:column;align-items:stretch;gap:18px}.lhero .cover{width:100%;height:auto;aspect-ratio:16/9}.lhero h1{font-size:23px}.ctl{gap:16px}.ctl .speeds{width:100%;margin:6px 0 0;justify-content:center}.ctl{flex-wrap:wrap;justify-content:center}}`;

  const colour = id => COV[DB.series.findIndex(s => s.id === id) % COV.length];
  const cover = (s, cls = "", text = true) => `<span class="cover ${cls}" style="background-color:${colour(s.id)}">${text ? `<span class="cs">${star("none", "currentColor", 2)}</span><span class="ct">${esc(s.title)}</span><span class="cn">${fmtNum(s.count)} درسًا</span>` : ""}</span>`;
  const top = active => `<header class="top"><div class="wrap">
    <a class="brand" href="index.html"><span class="mk">${star("none", "currentColor", 1.6)}</span><span><b>الشيخ يحيى بن أحمد الجابري</b> <span class="hf">حفظه الله</span><small>الموقع الرسمي</small></span></a>
    <nav class="main only-d">${NAV.map(([id, t]) => `<a href="#"${id === active ? ' class="on"' : ""}>${t}</a>`).join("")}</nav>
    <a class="ibtn only-d" href="#">${ic("search", 18)}</a><a class="ibtn only-d" href="#">${ic("moon", 18)}</a><a class="ibtn only-m" href="#">${ic("search", 19)}</a></div></header>`;
  const ep = (l, on) => `<a class="ep${on ? " on" : ""}" href="lesson.html">${cover(seriesById[l.series], "mini", false)}<span class="tt"><span class="t">${esc(fullTitle(l))}</span><span class="s">${esc(seriesById[l.series].title)} · ${ldate(l)}</span></span><span class="d">${l.duration ? dur(l.duration) : ""}</span><span class="pb">${ic(on ? "pause" : "play", 18)}</span></a>`;
  const dock = `<div class="dock"><div class="wrap">${cover(LS, "mini", false)}<span class="tt"><span class="t">${esc(fullTitle(L))}</span><span class="s">${esc(LS.title)}</span></span>
    <span class="c"><span class="s">${ic("rotate-cw", 24)}</span><span class="play">${ic("pause", 22)}</span><span class="s">${ic("rotate-ccw", 24)}</span></span>
    <span class="pr"><span>١٧:٠٨</span><span class="bar"><i></i></span><span>${dur(L.duration)}</span></span><span class="sp">١٫٥×</span></div></div>`;
  const bottom = active => `<nav class="bottom">${[["home", "house", "الرئيسية"], ["lib", "layout-grid", "الأقسام"], ["search", "search", "بحث"], ["khutab", "scroll-text", "الخطب"], ["more", "menu", "المزيد"]].map(([id, i, t]) => `<a href="#"${id === active ? ' class="on"' : ""}>${ic(i, 22)}<span>${t}</span></a>`).join("")}</nav>`;
  const foot = `<footer class="foot"><div class="wrap"><b>الموقع الرسمي لفضيلة الشيخ الوالد يحيى بن أحمد الجابري حفظه الله ورعاه</b><nav>${LINKS.map(x => `<a href="#">${esc(x.t)}</a>`).join("")}</nav></div></footer>`;
  const n0 = LATEST[0], s0 = seriesById[n0.series];
  const home = page("majlis", "مجلس — الرئيسية", css, `${top("home")}
  <section class="hero"><div class="wrap"><div><div class="pre">الموقع الرسمي لفضيلة الشيخ الوالد</div><h1>يحيى بن أحمد الجابري</h1><div class="hf">حفظه الله ورعاه</div>
    <p>استمع إلى دروس الشيخ في التفسير والحديث والعقيدة، وخطبه ومحاضراته، وتابع كل سلسلة من حيث توقفت.</p>
    <div class="search">${ic("search", 20)}<span>ابحث عن درس أو كتاب أو باب…</span></div>
    <ul class="stats">${STATS.map(([b, t]) => `<li><b>${b}</b><span>${t}</span></li>`).join("")}</ul></div>
    <a class="feat" href="lesson.html">${cover(s0)}<span><small>أحدث درس · ${ldate(n0)}</small><h3>${esc(fullTitle(n0))}</h3><span class="m">${dur(n0.duration)}</span><br><span class="go">${ic("play", 18)} استمع الآن</span></span></a></div></section>
  <div class="wrap">
  <section class="blk"><div class="chips">${SECS.map(s => `<a class="chip" href="#">${ic(s.icon, 18)}${s.title} <small>${fmtNum(s.n)}</small></a>`).join("")}</div></section>
  <section class="blk"><div class="hd"><h2>السلاسل</h2><a href="#">الكل ${ic("chevron-left", 16)}</a></div><div class="covers">${TOP.map(s => `<a href="#">${cover(s)}<span class="sub"><span>${secT(s)}</span><span>${hours(s.seconds)}</span></span></a>`).join("")}</div></section>
  <section class="blk"><div class="hd"><h2>أحدث الدروس</h2><a href="#">الكل ${ic("chevron-left", 16)}</a></div><div class="eps">${LATEST.map(l => ep(l)).join("")}</div></section>
  </div>${foot}${dock}${bottom("home")}`);
  const lesson = page("majlis", "مجلس — درس", css, `${top("hadith")}
  <section class="lhero"><div class="wrap">${cover(LS)}<div style="flex:1;min-width:0">
    <nav class="crumb"><a href="index.html">الرئيسية</a> / <a href="#">الحديث</a> / <a href="#">${esc(LS.title)}</a></nav>
    <h1>${esc(fullTitle(L))}</h1><div class="meta"><span>${ic("calendar", 15)}${ldate(L)}</span><span>${ic("clock", 15)}${dur(L.duration)}</span><span>${ic("list-music", 15)}الدرس ${fmtNum(at + 1)} من ${fmtNum(SIB.length)}</span></div>
    <div class="lp"><div class="bar"><i></i></div><div class="times"><span>١٧:٠٨</span><span>${dur(L.duration)}</span></div>
    <div class="ctl"><span class="s">${ic("skip-forward", 24)}</span><span class="s">${ic("rotate-cw", 28)}<small>١٥</small></span><span class="play">${ic("pause", 26)}</span><span class="s">${ic("rotate-ccw", 28)}<small>١٥</small></span><span class="s">${ic("skip-back", 24)}</span>
      <span class="speeds"><span>١×</span><span>١٫٢٥×</span><span class="on">١٫٥×</span><span>٢×</span></span></div></div></div></div></section>
  <div class="wrap"><div class="acts"><a class="btn p" href="#">${ic("download", 18)} تحميل</a><a class="btn" href="#">${ic("share-2", 18)} مشاركة</a><a class="btn" href="#">${ic("external-link", 18)} المنشور على تيليجرام</a></div>
  <section class="blk"><div class="hd"><h2>دروس السلسلة</h2><a href="#">كل الدروس ${ic("chevron-left", 16)}</a></div><div class="eps">${NEAR.map(l => ep(l, l === L)).join("")}</div></section></div>
  ${foot}${bottom("")}`);
  return { home, lesson };
})();

const OUT = path.join(HERE, "out");
fs.rmSync(OUT, { recursive: true, force: true });
for (const [name, p] of Object.entries({ naqaa, riwaq, majlis })) {
  fs.mkdirSync(path.join(OUT, name), { recursive: true });
  fs.writeFileSync(path.join(OUT, name, "index.html"), p.home);
  fs.writeFileSync(path.join(OUT, name, "lesson.html"), p.lesson);
}
fs.cpSync(path.join(HERE, "fonts"), path.join(OUT, "fonts"), { recursive: true });
console.log("mockups -> mockups/out/{naqaa,riwaq,majlis}/");
