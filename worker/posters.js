/* Announcement posters: pure helpers shared by the Worker's bot (worker/bot.js) and the hourly job (tools/announce_bot.mjs).
   A poster in site/data/announcements.json:
     { id: 12 hex, title, image: "/ann/<sha16>.<ext>", w, h, until: "YYYY-MM-DD" | "", added, pin?: true, draft?: true,
       file_id?, file_uid? }      the array order is the order on the site.
   A draft (added in the bot, not yet published) has no image until the hourly job fetches file_id from Telegram. */

const AR = s => String(s).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

/* today in Riyadh (YYYY-MM-DD) */
export const today = (now = new Date()) => new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

/* Hijri (Umm al-Qura) date -> Gregorian YYYY-MM-DD, by asking Intl around an estimate */
let hfmt;
export function hijriToIso(y, m, d) {
  try { hfmt = hfmt || new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }); }
  catch { return ""; }
  const est = Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + (d - 1)) * 864e5;
  for (let k = -45; k <= 45; k++) {
    const t = new Date(est + k * 864e5), p = Object.fromEntries(hfmt.formatToParts(t).map(x => [x.type, x.value]));
    if (parseInt(p.year) === y && +p.month === m && +p.day === d) return t.toISOString().slice(0, 10);
  }
  return "";
}

/* "1448/7/2", "٢/٧/١٤٤٨", "2027-01-10" -> Gregorian YYYY-MM-DD, or "" when it is not a date */
export function parseDate(s = "") {
  const m = AR(s).match(/(\d{1,4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,4})/);
  if (!m) return "";
  let [a, b, c] = [+m[1], +m[2], +m[3]];
  if (c > 999) [a, c] = [c, a];                                   // d/m/y -> y/m/d
  if (a > 1300 && a < 1600 && b >= 1 && b <= 12 && c >= 1 && c <= 30) return hijriToIso(a, b, c);
  if (a > 1999 && b >= 1 && b <= 12 && c >= 1 && c <= 31) return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
  return "";
}

/* caption -> { title, until, pin } ; until is the last day the card shows (Gregorian YYYY-MM-DD) or "" */
export function parseCaption(caption = "") {
  const text = AR(caption).replace(/\r/g, "");
  const m = text.match(/(?:حتى|إلى|الى|ينتهي|ينتهى|until)\s*[:：]?\s*(?:يوم\s+\S+\s+)?(\d{1,4}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{1,4})/i);
  const until = m ? parseDate(m[1]) : "";
  const tag = /#جدول/.test(caption);
  const t = caption.replace(/#جدول\S*/g, "").split("\n").map(s => s.trim()).find(s => s && !/^(?:حتى|إلى|الى|ينتهي|ينتهى|until)/i.test(s));
  const title = cleanTitle(t || (tag ? "جدول الدروس" : "إعلان"));
  return { title, until, pin: tag || /^جدول/.test(title) };
}

/* a title typed in the bot: one line, no control or direction characters, at most 140 characters */
export const cleanTitle = s => String(s || "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);

/* "2026-12-11" -> "٢ رجب ١٤٤٨ هـ" (falls back to the Gregorian date if this Intl has no Umm al-Qura calendar) */
export function hijriLabel(iso) {
  if (!/^\d{4}-\d\d-\d\d$/.test(iso || "")) return "";
  try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-arab", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso + "T00:00:00Z")); }
  catch { return iso; }
}

export const isLive = (a, day = today()) => !a.draft && !!a.image && (!a.until || a.until >= day);

/* move the poster with this id one step up (-1) or down (+1), or to the top ("top") / bottom ("bottom") */
export function move(list, id, where) {
  const i = list.findIndex(a => a.id === id);
  if (i < 0) return list;
  const out = list.slice(), [a] = out.splice(i, 1);
  const j = where === "top" ? 0 : where === "bottom" ? out.length : Math.max(0, Math.min(out.length, i + where));
  out.splice(j, 0, a);
  return out;
}

/* publish a draft at the top or bottom; a schedule poster (pin) replaces the earlier schedule. -> { list, replaced } */
export function publish(list, id, where = "top") {
  const a = list.find(x => x.id === id);
  if (!a) return { list, replaced: [] };
  const replaced = a.pin ? list.filter(x => x.pin && x.id !== id && !x.draft) : [];
  let out = list.filter(x => !replaced.includes(x)).map(x => x.id === id ? (({ draft, ...rest }) => rest)(x) : x);
  return { list: move(out, id, where), replaced };
}

export function prune(list, day = today()) {
  const keep = list.filter(a => a.draft || !a.until || a.until >= day);
  return { keep, gone: list.filter(a => !keep.includes(a)) };
}

/* a new id for a draft, from Telegram's unique file id (stable, so the same picture twice is noticed) */
export async function draftId(fileUid) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("poster:" + fileUid)));
  return [...h.slice(0, 6)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* The secret Telegram sends with every webhook call (X-Telegram-Bot-Api-Secret-Token), derived from the bot token so the
   Worker and the job that registers the webhook agree without one more secret to set. */
export async function webhookSecret(token) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("yaljabri-webhook:" + token)));
  return [...h].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
