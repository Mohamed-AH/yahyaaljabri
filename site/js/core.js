/* Shared by the browser app and the Node pre-renderer: constants, helpers, data model. No DOM access here. */
import { ICONS } from "./icons.js";

/* Absolute base for link previews (og:image/og:url), canonical links and the sitemap. Until the domain is chosen it is the
   Cloudflare address; set SITE_URL in the build environment (or change the default) when the domain is live. */
export const SITE = ((typeof process !== "undefined" && process.env && process.env.SITE_URL) || "https://yahyaaljabri.emah84.workers.dev").replace(/\/$/, "");
export const NAME = "الشيخ يحيى بن أحمد الجابري";
export const NAME_FULL = `${NAME} حفظه الله`;
export const OFFICIAL_PRE = "الموقع الرسمي لفضيلة الشيخ الوالد";
export const FULL_NAME = "يحيى بن أحمد الجابري";
export const ROLE = "";   // the team's wording for his posts, when supplied
export const OFFICIAL_NAME = `${OFFICIAL_PRE} ${FULL_NAME}`;
export const YT_CHANNEL = "https://www.youtube.com/channel/UCxuTw0MBmEtEBFcsaPexdfg";
export const TG_CHANNEL = "https://t.me/jabiri";
export const TG_CHANNEL_2 = "https://t.me/jabrih";
export const LINKS = [
  { t: "قناة التيليجرام الرسمية", h: TG_CHANNEL }, { t: "قناة التيليجرام الثانية", h: TG_CHANNEL_2 },
  { t: "مجموعة الواتساب", h: "https://chat.whatsapp.com/LqkA1Gvd8oZEbO3nsFWJWD" },   // as listed in the official channel's posts (t.me/jabiri/4615)
  { t: "قناة يوتيوب", h: YT_CHANNEL }, { t: "تويتر", h: "https://twitter.com/Yahya_aljabri_1" },
  { t: "فيسبوك", h: "https://www.facebook.com/share/1DMLjUVwWn/" }, { t: "كل الحسابات", h: "https://linkfly.to/Skhyahiaaljaberi" },
];

/* ───────── Site structure ─────────  Every series belongs to one section (series.sec). Books are their own collection. */
export const SECTIONS = [
  { id: "tafsir",   title: "التفسير",          icon: "book-marked",  desc: "دروس التفسير: تفسير ابن كثير والتعليق على تفسير الشوكاني وغيرهما." },
  { id: "hadith",   title: "الحديث",           icon: "library-big",  desc: "شروح كتب الحديث: صحيح البخاري وصحيح مسلم ورياض الصالحين ومسند الإمام أحمد وغيرها." },
  { id: "aqeedah",  title: "العقيدة",          icon: "book-open",    desc: "شروح كتب العقيدة: كتاب التوحيد وشروحه والعقيدة الطحاوية والواسطية وغيرها." },
  { id: "fiqh",     title: "الفقه",            icon: "file-text",    desc: "دروس في الفقه وأحكامه." },
  { id: "khutab",   title: "الخطب",            icon: "scroll-text",  desc: "خطب الجمعة والمناسبات." },
  { id: "lectures", title: "المحاضرات",        icon: "mic-vocal",    desc: "محاضرات وكلمات ونصائح وأجوبة على الأسئلة." },
  { id: "tilawa",   title: "التلاوات",         icon: "headphones",   desc: "تلاوات من الصلوات." },
  { id: "duroos",   title: "الدروس المرئية",   icon: "video",        desc: "الدروس المرئية من قناة الشيخ على يوتيوب." },
  { id: "books",    title: "الكتب",            icon: "book-open",    desc: "مؤلفات الشيخ للقراءة والتحميل." },
];
const UNIT = {};   // numbered-lesson label per series
/* Series covers: a fixed colour per series (COVER) or one from the palette by position. All pass AA with white text. */
export const COVER = {};
export const COVER_PALETTE = ["#0f3b2e", "#123c56", "#5a1f2b", "#3b2f63", "#6b4a16", "#1d4f4a", "#2d3a1a", "#47301f", "#14324a"];
export const PAGE = 60;

/* ───────── Data (filled by init) ─────────  lookup tables have no prototype: "__proto__" is not an id */
export const state = { DB: null, bio: null, ann: [] };
export const byId = Object.create(null), seriesById = Object.create(null), secById = Object.create(null);

/* Make our own R2 copy (tools/mirror_media.py -> data/media.json) the primary link and keep the original as src_alt / url_alt.
   The build applies this once and writes the merged library to dist/, so browsers never download the (large) manifest. */
export function applyMedia(lib = {}, media = null) {
  const mm = media && typeof media === "object" ? media : null;
  if (!mm) return lib;
  const mine = u => { const m = Object.prototype.hasOwnProperty.call(mm, u) ? mm[u] : null; return m && typeof m.url === "string" && m.url.startsWith("https://") ? m.url : ""; };
  return { ...lib,
    lessons: (lib.lessons || []).map(l => {
      if (l.src) return mine(l.src) ? { ...l, src: mine(l.src), src_alt: l.src } : l;
      const u = l.tg && mine(l.tg); if (!u) return l;   // audio fetched from its Telegram post (tools/fetch_audio.py): play ours, keep the post link
      const d = mm[l.tg].duration; return { ...l, src: u, duration: l.duration || (Number.isInteger(d) && d > 0 ? d : 0) };
    }),
    books: (lib.books || []).map(b => ({ ...b, files: b.files.map(f => mine(f.url) ? { ...f, url: mine(f.url), url_alt: f.url } : f) })) };
}

/* Library files that add to library.json (lessons imported from other sources, e.g. data/makkah.json). */
export const mergeLibraries = (...libs) => libs.filter(Boolean).reduce((a, b) => ({ ...a, ...b, series: [...(a.series || []), ...(b.series || [])], lessons: [...(a.lessons || []), ...(b.lessons || [])], books: [...(a.books || []), ...(b.books || [])] }), {});

export function init(cat, lib = {}, bio = null, media = null) {
  lib = applyMedia(lib, media);
  SECTIONS.forEach(s => secById[s.id] = s);
  const DB = {
    series: [...cat.series, ...(lib.series || [])].map(s => ({ ...s, sec: s.sec || "duroos", unit: s.unit || UNIT[s.id] })),
    lessons: [...cat.lessons, ...(lib.lessons || [])].map((l, o) => ({ ...l, kind: l.kind || "video", date: l.date || "", duration: l.duration || 0, o })),
    books: lib.books || [], updated: cat.updated,
  };
  DB.series.forEach(s => seriesById[s.id] = s);
  DB.lessons = DB.lessons.filter(l => seriesById[l.series]).sort((a, b) => b.date.localeCompare(a.date) || a.o - b.o);   // dated newest-first, undated last
  DB.lessons.forEach(l => byId[l.id] = l);
  DB.series.forEach(s => {   // uniform per-series stats, whatever the source
    const ls = DB.lessons.filter(l => l.series === s.id), ds = ls.map(l => l.date).filter(Boolean).sort();
    s.count = ls.length; s.seconds = ls.every(l => l.duration) ? ls.reduce((a, l) => a + l.duration, 0) : 0; s.first = ds[0] || ""; s.last = ds[ds.length - 1] || "";
  });
  DB.series = DB.series.filter(s => s.count > 0);
  state.DB = DB;
  state.bio = bio && typeof bio === "object" && (bio.summary || (Array.isArray(bio.sections) && bio.sections.length)) ? bio : null;   // optional: supplied by the Sheikh's team
  return DB;
}

/* ───────── Helpers ───────── */
export const ic = (n, s = 20, cls = "") => `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] || ""}</svg>`;
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Arabic-insensitive search: drop tashkeel/tatweel, unify alef/ya/ta-marbuta, Arabic digits -> latin
export const norm = s => String(s || "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const nf = new Intl.NumberFormat("ar-EG", { useGrouping: false });
export const fmtNum = n => nf.format(n);
// Dates are shown in the Hijri (Umm al-Qura) calendar only. Input: YYYY-MM-DD.
const HIJRI = "ar-SA-u-ca-islamic-umalqura-nu-arab";
const hijriFull = new Intl.DateTimeFormat(HIJRI, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const hijriYear = new Intl.DateTimeFormat(HIJRI, { year: "numeric", timeZone: "UTC" });
const at = d => new Date(d + "T12:00:00Z");
export const fmtDate = d => d ? hijriFull.format(at(d)) : "";
const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
// `hd` = Hijri date taken from the source ("1433-3-2", "1427-3" or just "1426"); otherwise convert the Gregorian `date`.
const fmtHijri = hd => { const [y, m, d] = hd.split("-").map(Number); return [d ? fmtNum(d) : "", m ? HM[m - 1] : "", fmtNum(y), "هـ"].filter(Boolean).join(" "); };
export const ldate = l => l.hd ? fmtHijri(l.hd) : l.date ? fmtDate(l.date) : "";
export const fmtYear = d => d ? hijriYear.format(at(d)).replace(/\s*هـ$/, "") : "";
export const dur = s => { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
export const isoDur = s => s ? `PT${Math.floor(s / 3600)}H${Math.floor(s % 3600 / 60)}M${s % 60}S` : "";
export const hours = s => { const h = Math.round(s / 3600); return h ? fmtNum(h) + " ساعة" : ""; };
export const dg = s => String(s ?? "").replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);   // Arabic-Indic digits for titles from any source

/* ───────── Input sanitising ─────────  Everything that comes from the user (search boxes, URL) or from data files goes through these. */
export const MAXQ = 100, MAXTOKENS = 8;
// strip invisible/bidi-control characters (RLO tricks etc.) and control chars; keep ZWNJ/ZWJ used in Persian/Urdu
export const cleanQuery = s => String(s ?? "").normalize("NFC")
  .replace(/[­؜​‎‏‪-‮⁠-⁯﻿]/g, "")
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim()
  .slice(0, MAXQ).split(" ").slice(0, MAXTOKENS).join(" ");
export const safeDecode = s => { try { return decodeURIComponent(s); } catch { return ""; } };   // malformed %-sequences must not crash routing
export const oneOf = (v, allowed, dflt = "") => allowed.includes(v) ? v : dflt;                   // whitelist URL parameters
export const safeUrl = u => { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : "#"; } catch { return "#"; } };   // https only: no javascript:/data:
export const safeYt = id => /^[\w-]{11}$/.test(String(id)) ? String(id) : "";                       // YouTube ids are exactly 11 chars
export const safeLang = l => /^[a-z]{2,3}$/.test(String(l)) ? String(l) : "";
export const jsonLd = o => JSON.stringify(o).replace(/</g, "\\u003c");                              // safe inside <script type="application/ld+json">

/* ───────── Model helpers ───────── */
export const kindIcon = l => l.kind === "audio" ? "headphones" : "video";
export const useLabel = l => l.kind === "video" && l.n != null && l.series !== "misc";   // YouTube titles are long; show "المجلس N" instead
export const label = l => `${seriesById[l.series].unit || "الدرس"} ${fmtNum(l.n)}`;
export const mainTitle = (l, withBook = true) => useLabel(l) ? `${label(l)}${withBook && l.section ? " — " + l.section : ""}` : dg(l.title);
export const fullTitle = l => { const s = seriesById[l.series]; return useLabel(l) ? `${label(l)} — ${s.title}` : s.ordered ? `${dg(l.title)} — ${s.title}` : dg(l.title); };
export const secOfSeries = s => secById[s.sec] || secById.duroos;
export const secOfLesson = l => secOfSeries(seriesById[l.series]);
export const seriesOrder = (a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || (a.o - b.o);
export const lang = () => "";
export const thumb = id => `https://i.ytimg.com/vi/${safeYt(id)}/mqdefault.jpg`;
/* the eight-pointed star (two squares): the site's mark */
export const STAR = `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="9" y="9" width="22" height="22"/><rect x="9" y="9" width="22" height="22" transform="rotate(45 20 20)"/></g></svg>`;

export function match(l, q) {
  if (!q) return true;
  const s = seriesById[l.series];
  const hay = l._h || (l._h = norm(`${l.title} ${s.title} ${secOfSeries(s).title} ${l.section || ""} ${l.n != null ? "المجلس الدرس " + l.n : ""} ${fmtYear(l.date)}`));
  return norm(q).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}

const seriesIn = id => state.DB.series.filter(s => s.sec === id);
export const sectionCount = id => id === "books" ? state.DB.books.length : state.DB.lessons.filter(l => secOfLesson(l).id === id).length;
export const visible = () => SECTIONS.filter(s => sectionCount(s.id) > 0);
export const isFlat = secId => seriesIn(secId).length === 1;   // a section with one series has no page of its own: it links to that series

/* ───────── URLs (real paths, root-relative) ───────── */
export const href = {
  home: () => "/", library: () => "/library/", books: () => "/books/", about: () => "/about/", announcements: () => "/announcements/", documents: () => "/tazkiyat/",
  series: id => `/series/${encodeURIComponent(id)}/`,
  lesson: id => `/lesson/${encodeURIComponent(id)}/`,
  search: (qs = "") => "/search/" + qs,
  section: sec => sec.id === "books" ? "/books/" : isFlat(sec.id) ? href.series(seriesIn(sec.id)[0].id) : `/section/${encodeURIComponent(sec.id)}/`,
};
export { seriesIn };

/* ───────── Scholars' recommendations (tazkiyat) and written advice ─────────  Files in site/docs/ (from the owner, 2026-10-05).
   Letters: photos straightened and cleaned; shown in full (the owner wants the ID and the scholars' numbers kept, 2026-10-05).
   Text = transcription of the letter as written (keep its spelling). Advice PDFs are published unchanged, as their writer sent them. */
export const DOCS = {
  tazkiyat: [
    { id: "tazkiya-1421", title: "تزكية الشيخين أحمد بن يحيى النجمي وزيد بن محمد المدخلي رحمهما الله", by: "الشيخ أحمد بن يحيى النجمي والشيخ زيد بن محمد بن هادي المدخلي", date: "٣ / ١ / ١٤٢١هـ",
      image: "/docs/tazkiya-1421.jpg", thumb: "/docs/thumb/tazkiya-1421.jpg", w: 1730, h: 2478,
      text: [
        "بسم الله الرحمن الرحيم",
        "المملكة العربية السعودية، المكتبة السلفية الخيرية، دورة الشيخ / عبد الله بن محمد القرعاوي رحمه الله العلمية. التاريخ ٣ / ١ / ١٤٢١هـ",
        "( يحيى بن أحمد بن سلمان الجابري ) رقم الهوية (٢٠٦١٣)، مصدرها: أبي عريش، تاريخها: ١٣٩٤/٥/٧هـ",
        "إن المدون اسمه أعلاه من خيار طلبة العلم الذين يرغبون المشاركة في الدعوة إلى الله وحيث إن له ملازمة في دروسنا ونعرف عن مدى استعداده وكفاءته في الوعظ والإرشاد وتعليم عوام الناس والخطابة كتبنا له هذه التزكية إعلاما بالواقع وتعاونا مع الجهات المختصة بالإشراف على عمل الدعاة إلى الله وفق الله الجميع لما فيه رضاه.",
        "أحمد بن يحيى النجمي — زيد بن محمد بن هادي المدخلي",
        "أحمد بن يحيى النجمي: ت/٠٧٣٣٢١٠٤٩، جوال/٠٥٥٧٦٩٧٥٩. زيد بن محمد المدخلي: ت و فاكس/٠٧٣٣٢١٢٧٧، جوال/٠٥٥٧٧٠٥٥١. المملكة العربية السعودية — جازان — صامطة — ص.ب ٢١٥",
      ] },
    { id: "tazkiya-1433", title: "تزكية الشيخ زيد بن محمد المدخلي رحمه الله", by: "الشيخ زيد بن محمد بن هادي المدخلي", date: "٢٤ / ٨ / ١٤٣٣هـ",
      image: "/docs/tazkiya-1433.jpg", thumb: "/docs/thumb/tazkiya-1433.jpg", w: 1710, h: 2440,
      text: [
        "بسم الله الرحمن الرحيم",
        "( يحي بن أحمد بن سلمان الجابري )",
        "الحمد لله رب العالمين، وصلى الله وسلم وبارك على نبينا محمد الصادق المصدوق الأمين، وعلى آله وصحبه أجمعين.",
        "أما بعد: فإن الشيخ المدون اسمه أعلاه من طلبة العلم الأخيار، الذين عرفتهم من خلال دراستهم عندي في فنون من العلم، وهو من المعروفين لدينا بحسن أخلاقه وسلامة منهجه، واجتهاده في طلب العلم ونشره.",
        "ولطلبه مني كتبت له ما بين يدي القارئ، وأوصيه بتقوى الله عز وجل والاستمرار في التحصيل العلمي والعناية بنشره لأنه أعز ميراث وخير ذخر يتقرب به العبد إلى ربه كما أوصيه بالمحافظة على نهج أهل السنة والجماعة في العقيدة والشريعة والتتلمذ على كتبهم والعناية بها ومجانبة أهل البدع ومجانبة المروجين لهم والمدافعين عنهم والحذر من كتبهم.",
        "وختاماً أسأل الله لي وله التوفيق والسداد والهدى والرشاد وصلى الله وسلم وبارك على النبي محمد وعلى آله وصحبه أجمعين.",
        "أملاه الفقير إلى عفو ربه وغفرانه: زيد بن محمد بن هادي المدخلي. صامطة في ٢٤ / ٨ / ١٤٣٣هـ",
      ] },
  ],
  wasaya: [
    { id: "wasaya-1447-11-02", title: "نصائح ووصايا من الشيخ يحيى الجابري", by: "فهد بن علي بن سالم الجابري", date: "الاثنين ٢ / ١١ / ١٤٤٧هـ، جدة",
      desc: "ما سمعه كاتبها من الشيخ من توجيهات ونصائح ووصايا عند زيارته له.", pdf: "/docs/wasaya-1447-11-02.pdf", pages: 3, thumb: "/docs/thumb/wasaya-1447-11-02.jpg" },
    { id: "wasiya-aridah-1447-11-06", title: "وصية خاصة من الشيخ يحيى الجابري لأهل العارضة", by: "فهد بن علي بن سالم الجابري", date: "الجمعة ٦ / ١١ / ١٤٤٧هـ، الرياض",
      desc: "وصية الشيخ لأهل محافظة العارضة بالتعاون مع الشيخ د. حسين بن عبد الله العبدلي والشيخ أحمد بن يحيى بن كردم الجابري في الدعوة إلى الله.", pdf: "/docs/wasiya-aridah-1447-11-06.pdf", pages: 1, thumb: "/docs/thumb/wasiya-aridah-1447-11-06.jpg" },
  ],
};

/* Announcement posters (site/data/announcements.json, written by tools/announce_bot.mjs). Only well-formed entries whose
   end date has not passed (Riyadh date) are kept; the image must be one of ours under /ann/. */
export const todayRiyadh = (now = new Date()) => new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
export function setAnnouncements(list, day = todayRiyadh()) {
  state.ann = (Array.isArray(list) ? list : []).filter(a => a && typeof a.title === "string" && /^\/ann\/[0-9a-f]{16}\.(jpg|png|webp)$/.test(a.image)
    && (!a.until || (/^\d{4}-\d\d-\d\d$/.test(a.until) && a.until >= day)))
    .map(a => ({ id: String(a.id || "").replace(/[^0-9a-f]/g, "").slice(0, 16), title: a.title.slice(0, 160), image: a.image, until: a.until || "",
      thumb: a.image.replace(/^\/ann\/(\w+)\.\w+$/, "/ann/thumb/$1.webp"), w: Number.isInteger(a.w) && a.w > 0 ? a.w : 1131, h: Number.isInteger(a.h) && a.h > 0 ? a.h : 1600 }));
  return state.ann;
}

/* old hash URLs (#/watch/ID …) -> new paths, used to keep shared links alive */
export function hashToPath(hash) {
  const [path, qs] = String(hash).replace(/^#/, "").split("?");
  const [, a, b0] = path.split("/"), b = b0 ? safeDecode(b0).slice(0, 80) : "";
  if (!a) return "/";
  if (a === "series" && b) return href.series(b);
  if (a === "watch" && b) return href.lesson(b);
  if (a === "section" && b) return secById[b] ? href.section(secById[b]) : "/library/";
  if (a === "books" || a === "library") return `/${a}/`;
  if (a === "search" || a === "lessons") return "/search/" + (qs ? "?" + qs : "");
  return "/";
}
