#!/usr/bin/env node
/* Pre-renders the site: site/ (+ data) -> dist/ with one real HTML file per page, sitemap.xml, robots.txt, _redirects, 404.html.
   No dependencies. Run:  node scripts/build.mjs   (wrangler.jsonc runs it automatically on every deploy). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { init, setAnnouncements, applyMedia, mergeLibraries, state, SITE, byId, seriesById, SECTIONS, secById, isFlat, href } from "../site/js/core.js";
import { resolve, notFoundPage, chromeTop, chromeBottom, footer, headHtml } from "../site/js/views.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "site"), OUT = path.join(ROOT, "dist");
const readJSON = (f, optional = false) => { try { return JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8")); } catch (e) { if (optional) return null; throw e; } };

const t0 = Date.now();
/* MEDIA_JSON=<file>: build with another media manifest (tests/player_check.mjs uses tests/fixtures/media.json) */
const MEDIA = process.env.MEDIA_JSON ? JSON.parse(fs.readFileSync(path.resolve(process.env.MEDIA_JSON), "utf8")) : readJSON("data/media.json", true);
const LIB = mergeLibraries(readJSON("data/library.json", true), readJSON("data/makkah.json", true));   // library.json + lessons imported from makkahscholars.org
init(readJSON("catalogue.json"), LIB, readJSON("data/bio.json", true), MEDIA);
const DB = state.DB;
setAnnouncements(readJSON("data/announcements.json", true));   // posters whose end date has passed are left out

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true, filter: s => !/[\\/]shell\.html$/.test(s) && !/[\\/]data[\\/]media\.json$/.test(s) && !/[\\/]data[\\/]makkah\.json$/.test(s) });   // the manifest stays out of dist: the merged library below carries the mirrored links

const shell = fs.readFileSync(path.join(SRC, "shell.html"), "utf8");
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k]);   // single pass: page content is never re-scanned for placeholders
const render = p => fill(shell, { HEAD: headHtml(p), TOP: chromeTop(p.nav), MAIN: p.html, FOOT: footer(), BOTTOM: chromeBottom(p.nav), ROUTE: p.path });
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
write("data/library.json", JSON.stringify(applyMedia(LIB, MEDIA)));   // the one library file browsers load: all sources merged, mirrored links applied
{ /* CSP: allow audio only from the hosts our own copies live on (MEDIA_BASE of tools/fetch_audio.py) */
  const hosts = [...new Set(Object.values(MEDIA || {}).map(m => { try { const u = new URL(m.url); return u.protocol === "https:" ? u.origin : ""; } catch { return ""; } }).filter(Boolean))].sort();
  const hf = path.join(OUT, "_headers");
  fs.writeFileSync(hf, fs.readFileSync(hf, "utf8").replace(/media-src [^;]*/, ["media-src 'self'", ...hosts].join(" ")));
}

/* routes */
const routes = ["/", "/library/", "/search/"];
if (DB.books.length) routes.push("/books/");
if (state.bio) routes.push("/about/");
routes.push("/announcements/");
for (const s of SECTIONS) if (s.id !== "books" && !isFlat(s.id) && DB.series.some(x => x.sec === s.id)) routes.push(`/section/${s.id}/`);
for (const s of DB.series) routes.push(href.series(s.id));
for (const l of DB.lessons) routes.push(href.lesson(l.id));

const indexable = [];
let bad = 0;
for (const r of routes) {
  const p = resolve(r);
  if (p.status !== 200) { console.error("!! route did not resolve:", r); bad++; continue; }
  write(r.replace(/^\//, "") + "index.html", render(p));
  if (!p.noindex) indexable.push(r);
}
write("404.html", render(notFoundPage()));

/* sitemap / robots / redirects */
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(r => `  <url><loc>${SITE}${r}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const flat = SECTIONS.filter(s => s.id !== "books" && isFlat(s.id) && DB.series.some(x => x.sec === s.id));
write("_redirects", flat.map(s => `/section/${s.id}/ ${href.section(s)} 301`).join("\n") + (flat.length ? "\n" : ""));

console.log(`built ${routes.length + 1} pages (${indexable.length} in sitemap) in ${Date.now() - t0} ms -> dist/` + (bad ? `  [${bad} FAILED]` : ""));
process.exit(bad ? 1 : 0);
