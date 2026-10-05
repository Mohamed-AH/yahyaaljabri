/* Browser app. Pages arrive pre-rendered (scripts/build.mjs); this script wires them up and handles client-side navigation. */
import { init, setAnnouncements, state, byId, seriesById, secById, ic, safeYt, safeUrl, cleanQuery, oneOf, hashToPath, href, dur, fullTitle, NAME, PAGE, SECTIONS } from "./core.js";
import { resolve, searchResults, seriesInfo, seriesList, nextLesson, coverColor, speedLabel, SPEEDS } from "./views.js";

const $ = s => document.querySelector(s);
const app = $("#app"), live = $("#sr-live");
const debounce = (f, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const SECIDS = SECTIONS.map(s => s.id);

/* ───────── Meta (kept in sync on client-side navigation) ───────── */
function applyMeta(p) {
  const url = location.origin + p.path;
  document.title = p.title;
  const set = (sel, attr, v) => { const e = $(sel); if (e) e.setAttribute(attr, v); };
  set("#m-desc", "content", p.description); set("#m-canon", "href", url); set("#m-robots", "content", p.noindex ? "noindex, follow" : "index, follow, max-image-preview:large");
  set("#og-title", "content", p.title); set("#og-desc", "content", p.description); set("#og-url", "content", url); set("#og-img", "content", p.image); set("#og-type", "content", p.ogType);
  set("#tw-title", "content", p.title); set("#tw-desc", "content", p.description); set("#tw-img", "content", p.image);
  const ld = $("#ld"); if (ld) ld.textContent = JSON.stringify(p.jsonld).replace(/</g, "\\u003c");
}
function markNav(nav) {
  document.querySelectorAll("[data-nav]").forEach(a => {
    const on = a.dataset.nav === nav;
    a.classList.toggle("on", on && !a.classList.contains("bn"));
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

/* ───────── Router ───────── */
let navigated = false;   // true after the first client-side navigation: enables autoplay for audio lessons the user clicked on
export function go(url) { history.pushState(null, "", url); route(false); }
function route(initial) {
  setDrawer(false);
  const u = new URL(location.href), p = resolve(u.pathname, u.searchParams);
  const hydrated = initial && app.dataset.route === p.path && p.status === 200;
  if (!hydrated) { app.innerHTML = p.html; app.dataset.route = p.path; applyMeta(p); }
  markNav(p.nav);
  wire(p, !initial);
  if (!initial) {
    const h1 = app.querySelector("h1");
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    live.textContent = p.title;
    scrollTo(0, 0);
    navigated = true;
  }
}
addEventListener("popstate", () => route(false));
document.addEventListener("click", e => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.origin !== location.origin) return;
  if (a.getAttribute("href") === "#") return;
  if (!a.pathname.endsWith("/")) return;                      // files (.pdf, .json …) and the 404 page: normal navigation
  e.preventDefault();
  if (a.href === location.href) { scrollTo(0, 0); return; }
  go(a.pathname + a.search);
});

/* ───────── Per-page behaviour ───────── */
function wire(p, byNavigation) {
  const w = p.wire || { t: "none" };
  if (w.t === "home") wireHome();
  else if (w.t === "series") wireSeries(w.id);
  else if (w.t === "search") wireSearch();
  else if (w.t === "lesson") wireLesson(w, byNavigation);
}

function wireHome() {
  const f = app.querySelector("form.search"); if (!f) return;
  f.addEventListener("submit", e => { e.preventDefault(); const q = cleanQuery(f.q.value); go("/search/" + (q ? "?q=" + encodeURIComponent(q) : "")); });
}

function pills(container, onPick) {
  if (!container) return;
  container.addEventListener("click", e => {
    const b = e.target.closest(".pill"); if (!b) return;
    container.querySelectorAll(".pill").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    onPick(b.dataset.s);
  });
}

function wireSeries(id) {
  const info = seriesInfo(id), q = $("#q"), sort = $("#sort"), out = $("#out"), count = $("#count");
  const st = { q: "", sec: "", sort: oneOf(sort.value, ["new", "old", "num"], "new") };
  const paint = () => { const r = seriesList(info, st); count.textContent = new Intl.NumberFormat("ar-EG", { useGrouping: false }).format(r.count) + " درسًا"; out.innerHTML = r.html; };
  q.addEventListener("input", debounce(e => { st.q = cleanQuery(e.target.value); paint(); }));
  sort.addEventListener("change", e => { st.sort = oneOf(e.target.value, ["new", "old", "num"], "new"); paint(); });
  pills($("#secs"), s => { st.sec = s; paint(); });
}

function wireSearch() {
  const params = new URL(location.href).searchParams;
  const st = { q: cleanQuery(params.get("q")), sec: oneOf(params.get("sec"), SECIDS), sort: oneOf(params.get("sort"), ["new", "old"], "new"), shown: PAGE };
  const out = $("#out"), count = $("#count"), q = $("#q");
  const nfmt = new Intl.NumberFormat("ar-EG", { useGrouping: false });
  const paint = () => {
    const r = searchResults(st);
    count.textContent = r.count ? `${nfmt.format(r.count)} نتيجة` : "";
    out.innerHTML = r.html + (r.more ? `<button type="button" class="more" id="more">عرض المزيد</button>` : "");
    const m = $("#more"); if (m) m.onclick = () => { st.shown += PAGE; paint(); m.blur(); };
    const sp = new URLSearchParams(); if (st.q) sp.set("q", st.q); if (st.sec) sp.set("sec", st.sec); if (st.sort !== "new") sp.set("sort", st.sort);
    history.replaceState(null, "", "/search/" + (sp.toString() ? "?" + sp : ""));
  };
  q.addEventListener("input", debounce(e => { st.q = cleanQuery(e.target.value); st.shown = PAGE; paint(); }));
  $("#sort").addEventListener("change", e => { st.sort = oneOf(e.target.value, ["new", "old"], "new"); paint(); });
  pills($("#secs"), s => { st.sec = oneOf(s, SECIDS); st.shown = PAGE; paint(); });
  paint();
  if (!st.q && !st.sec && matchMedia("(max-width:900px)").matches) q.focus({ preventScroll: true });
}

function wireLesson(w, byNavigation) {
  $("#share")?.addEventListener("click", e => { navigator.clipboard?.writeText(location.href); e.currentTarget.innerHTML = ic("check", 17) + " تم النسخ"; });

  const lite = $(".player.lite");   // YouTube is only loaded when the visitor presses play (faster, more private)
  if (lite) lite.querySelector(".lite-play").addEventListener("click", () => {
    const id = safeYt(lite.dataset.yt); if (!id) return;
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`; f.title = $(".w-title")?.textContent || "";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    lite.classList.remove("lite"); lite.replaceChildren(f); f.focus();
  });

  const lp = $("#lp"), l = lp && byId[lp.dataset.id];
  if (!l || !l.src) return;
  $("#aud")?.remove();                                // the native player is only for visitors without JavaScript
  const mine = () => P.l === l;
  $("#lp-play").addEventListener("click", () => { if (mine()) toggle(); else load(l, true, saved(l.id)); });
  $("#lp-back").addEventListener("click", () => { if (!mine()) load(l, false, saved(l.id)); skip(-15); });
  $("#lp-fwd").addEventListener("click", () => { if (!mine()) load(l, false, saved(l.id)); skip(15); });
  $("#lp-seek").addEventListener("input", e => { if (!mine()) load(l, false); seekTo(+e.target.value); });
  lp.querySelector(".speeds").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setRate(+b.dataset.v); });
  // the visitor just clicked a lesson: start it, unless something else is playing (never on a cold page load)
  if (byNavigation && !mine() && (!P.l || aud.paused)) load(l, true, saved(l.id));
  paint();
}

/* ───────── The docked player: one <audio> for the whole visit ─────────
   Lesson pages drive it; it keeps playing while the visitor browses, remembers where each lesson stopped (this browser only),
   moves on to the next lesson of the series, and shows on the lock screen (Media Session). */
const aud = $("#d-aud"), dock = $("#dock");
const P = { l: null, retried: false, rate: 1 };
const store = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const tfmt = s => dur(Math.floor(s || 0)) || "0:00";
const saved = id => { const t = store.get("pos", {})[id]; return typeof t === "number" && t > 0 ? t : 0; };
function remember(force) {
  if (!P.l || (!force && aud.paused)) return;
  const pos = store.get("pos", {}), t = Math.floor(aud.currentTime || 0), d = fin(aud.duration) || P.l.duration || 0;
  if (d && t > d - 20) delete pos[P.l.id]; else if (t > 5) pos[P.l.id] = t;
  const keys = Object.keys(pos); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete pos[k]);
  store.set("pos", pos); store.set("last", P.l.id);
}
function load(l, play = true, at = 0) {
  if (P.l !== l) {
    remember(true);
    P.l = l; P.retried = false;
    aud.src = safeUrl(l.src); aud.dataset.alt = l.src_alt ? safeUrl(l.src_alt) : "";
    aud.preload = "metadata"; aud.load(); aud.playbackRate = P.rate;
    if (at) aud.addEventListener("loadedmetadata", () => { aud.currentTime = at; paint(); }, { once: true });
    const s = seriesById[l.series];
    $("#d-link").href = href.lesson(l.id); $("#d-art").style.setProperty("--c", coverColor(s));
    $("#d-title").textContent = fullTitle(l); $("#d-sub").textContent = s.title; $("#d-dur").textContent = l.duration ? dur(l.duration) : "";
    $("#d-seek").max = l.duration || 0;
    try {
      if ("mediaSession" in navigator && "MediaMetadata" in window) navigator.mediaSession.metadata = new MediaMetadata({ title: fullTitle(l), artist: NAME, album: s.title });
    } catch {}
    store.set("last", l.id);
  }
  dock.hidden = false; document.body.classList.add("has-dock");
  if (play) aud.play().catch(() => {});
  paint();
}
const toggle = () => { if (aud.paused) aud.play().catch(() => {}); else aud.pause(); };
const fin = x => (isFinite(x) && x > 0 ? x : 0);   // streamed audio can report Infinity/NaN
const skip = d => { aud.currentTime = Math.max(0, Math.min((fin(aud.duration) || 1e9) - 1, (aud.currentTime || 0) + d)); paint(); };
const seekTo = t => { aud.currentTime = t; paint(); };
function setRate(v) {
  P.rate = SPEEDS.includes(v) ? v : 1; aud.playbackRate = P.rate; store.set("rate", P.rate);
  $("#d-rate").textContent = speedLabel(P.rate); paint();
}
const fill = (el, t, d) => { if (!el) return; el.max = Math.floor(d || 0); if (document.activeElement !== el) el.value = Math.floor(t || 0); el.style.setProperty("--p", (d ? Math.min(100, (t / d) * 100) : 0) + "%"); };
function paint() {
  const playing = !!P.l && !aud.paused, t = aud.currentTime || 0, d = fin(aud.duration) || P.l?.duration || 0;
  const btn = (b, on) => { if (!b) return; b.innerHTML = ic(on ? "pause" : "play", b.id === "lp-play" ? 28 : 22); b.setAttribute("aria-label", on ? "إيقاف مؤقت" : "تشغيل"); };
  if (P.l) { btn($("#d-play"), playing); $("#d-cur").textContent = tfmt(t); fill($("#d-seek"), t, d); }
  const lp = $("#lp"); if (!lp || !lp.querySelector(".lp-ui")) return;
  const mine = P.l && lp.dataset.id === P.l.id, l = byId[lp.dataset.id];
  btn($("#lp-play"), mine && playing);
  const lt = mine ? t : saved(lp.dataset.id), ld = mine ? d : l?.duration || 0;
  $("#lp-cur").textContent = tfmt(lt); fill($("#lp-seek"), lt, ld); if (ld) $("#lp-dur").textContent = tfmt(ld);
  lp.querySelectorAll(".speeds button").forEach(b => { const on = +b.dataset.v === P.rate; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}
let lastSave = 0;
aud.addEventListener("timeupdate", () => { paint(); if (Date.now() - lastSave > 5000) { lastSave = Date.now(); remember(); } });
["play", "pause", "loadedmetadata", "ratechange"].forEach(ev => aud.addEventListener(ev, paint));
aud.addEventListener("pause", () => remember(true));
aud.addEventListener("ended", () => {
  const done = P.l; remember(true);
  const n = done && nextLesson(done);
  if (!n || !n.src) return paint();
  load(n, true, saved(n.id));
  if (location.pathname === href.lesson(done.id)) go(href.lesson(n.id));   // the visitor is on the finished lesson's page: follow along
});
aud.addEventListener("error", () => {   // our copy failed: try the original; a transient failure: retry once; then say so
  if (!P.l || !aud.currentSrc && !aud.src) return;
  const t = aud.currentTime;
  if (aud.dataset.alt && aud.src !== aud.dataset.alt) { aud.src = aud.dataset.alt; aud.load(); aud.currentTime = t; aud.play().catch(() => {}); return; }
  if (!P.retried) { P.retried = true; setTimeout(() => { aud.load(); aud.currentTime = t; aud.play().catch(() => {}); }, 1500); return; }
  $("#d-sub").textContent = "تعذّر تشغيل هذا التسجيل الآن";
  const lp = $("#lp"); if (lp && lp.dataset.id === P.l.id && !$(".ap-err")) lp.insertAdjacentHTML("beforeend", `<p class="ap-err" role="alert">تعذّر تشغيل هذا التسجيل الآن. حاول مرة أخرى لاحقًا.</p>`);
});
$("#d-play").addEventListener("click", toggle);
$("#d-back").addEventListener("click", () => skip(-15));
$("#d-fwd").addEventListener("click", () => skip(15));
$("#d-seek").addEventListener("input", e => seekTo(+e.target.value));
$("#d-rate").addEventListener("click", () => setRate(SPEEDS[(SPEEDS.indexOf(P.rate) + 1) % SPEEDS.length]));
$("#d-x").addEventListener("click", () => { remember(true); aud.pause(); aud.removeAttribute("src"); aud.load(); P.l = null; dock.hidden = true; document.body.classList.remove("has-dock"); store.set("last", ""); paint(); });
try {
  const ms = navigator.mediaSession;
  if (ms) {
    ms.setActionHandler("play", () => aud.play());
    ms.setActionHandler("pause", () => aud.pause());
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(15));
    ms.setActionHandler("nexttrack", () => { const n = P.l && nextLesson(P.l); if (n && n.src) load(n, true, saved(n.id)); });
  }
} catch {}
addEventListener("pagehide", () => remember(true));
function restore() {   // the last lesson listened to comes back in the dock, paused where it stopped
  P.rate = SPEEDS.includes(store.get("rate", 1)) ? store.get("rate", 1) : 1; $("#d-rate").textContent = speedLabel(P.rate);
  const l = byId[store.get("last", "")];
  if (l && l.src && !P.l) load(l, false, saved(l.id));
}

/* ───────── Chrome: drawer, theme (wired once) ───────── */
const drawer = $("#drawer"), scrim = $("#scrim"), burger = $("#burger"), pageParts = () => document.querySelectorAll("#app, .top, .foot, .bottom, .dock");
function setDrawer(open) {
  if (open === drawer.classList.contains("open")) return;
  drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", !open); scrim.hidden = !open;
  burger.setAttribute("aria-expanded", open); document.body.classList.toggle("lock", open);
  if (open) {
    // The drawer is mid-transition (visibility) for a moment, so focus() can fail: retry for a few frames, THEN make the rest of the
    // page inert so keyboard and screen readers stay inside the menu (inert before focusing breaks focus in Chromium).
    const focusIn = tries => {
      if (!drawer.classList.contains("open")) return;
      const x = $("#drawer-x"); x.focus();
      if (document.activeElement === x || tries <= 0) pageParts().forEach(e => { e.inert = true; });
      else requestAnimationFrame(() => focusIn(tries - 1));
    };
    requestAnimationFrame(() => focusIn(12));
  } else { pageParts().forEach(e => { e.inert = false; }); burger.focus(); }
}
burger.addEventListener("click", () => setDrawer(!drawer.classList.contains("open")));
scrim.addEventListener("click", () => setDrawer(false));
$("#drawer-x").addEventListener("click", () => setDrawer(false));
$("#bn-more")?.addEventListener("click", e => { e.preventDefault(); setDrawer(true); });
addEventListener("keydown", e => {
  if (!drawer.classList.contains("open")) return;
  if (e.key === "Escape") return setDrawer(false);
  if (e.key !== "Tab") return;                               // focus trap
  const f = [...drawer.querySelectorAll("a[href],button")].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

const root = document.documentElement, themeBtn = $("#theme");
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
const paintTheme = () => { themeBtn.innerHTML = ic(isDark() ? "sun" : "moon", 20); themeBtn.setAttribute("aria-label", isDark() ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"); };
themeBtn.addEventListener("click", () => { root.dataset.theme = isDark() ? "light" : "dark"; try { localStorage.setItem("theme", root.dataset.theme); } catch {} paintTheme(); });
paintTheme();

/* ───────── Boot ───────── */
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
const hasBio = !!document.querySelector('a[href="/about/"]');   // the build links /about/ only when data/bio.json exists: no 404 request while the bio is dormant
Promise.all([getJSON("/catalogue.json"), getJSON("/data/library.json"), hasBio ? getJSON("/data/bio.json") : null, getJSON("/data/announcements.json")]).then(([cat, lib, bio, ann]) => {
  if (!cat) throw new Error("no catalogue");
  init(cat, lib || {}, bio);
  setAnnouncements(ann);
  const legacy = () => { if (location.hash.startsWith("#/")) { history.replaceState(null, "", hashToPath(location.hash)); return true; } return false; };   // old shared links (#/watch/ID …)
  legacy();
  addEventListener("hashchange", () => { if (legacy()) route(false); });
  restore();
  route(true);
}).catch(() => { /* the pre-rendered page stays as it is; only search/filters/players need the data */ });
