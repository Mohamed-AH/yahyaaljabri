/* worker/index.js (the /dl/ download route) against fake ASSETS + R2 bindings.   Usage: node tests/worker_check.mjs */
import w, { fileName, disposition, dispatch, JOBS, health } from "../worker/index.js";
const env = { ASSETS: { fetch: r => new Response("asset " + new URL(r.url).pathname) },
  MEDIA: { get: async k => k === "audio/2137b5d426dbcd69.m4a" ? { body: "AUDIO", size: 5 } : null } };
let bad = 0; const t = (n, c) => { if (!c) bad++; console.log(c ? "ok  " : "FAIL", n); };
let r = await w.fetch(new Request("https://x/lesson/a/"), env); t("assets pass-through", (await r.text()) === "asset /lesson/a/");
r = await w.fetch(new Request("https://x/dl/2137b5d426dbcd69?n=" + encodeURIComponent("تفسير ابن كثير/البقرة ‮\"x\"")), env);
t("200 + body", r.status === 200 && (await r.text()) === "AUDIO");

t("attachment utf-8", /^attachment; filename="lesson.m4a"; filename\*=UTF-8''%D8/.test(r.headers.get("content-disposition")));
t("no slash/quote/bidi", decodeURIComponent(r.headers.get("content-disposition").split("''")[1]) === "تفسير ابن كثير البقرة x.m4a");
r = await w.fetch(new Request("https://x/dl/0000000000000000"), env); t("missing 404", r.status === 404);
r = await w.fetch(new Request("https://x/dl/../secret"), env); t("bad key -> assets", (await r.text()).startsWith("asset"));
r = await w.fetch(new Request("https://x/dl/2137b5d426dbcd69", { method: "POST" }), env); t("POST 405", r.status === 405);
t("empty name", fileName("") === "lesson.m4a" && fileName("(أ)") === "(أ).m4a" && disposition("(أ).m4a").includes("%28"));
const calls = [], fake = async (u, o) => (calls.push([u, o]), new Response(null, { status: 204 }));
t("no token: nothing sent", (await dispatch("x.yml", {}, fake)) === 0 && calls.length === 0);
await dispatch(JOBS["17 * * * *"], { GH_TOKEN: "t" }, fake);
t("dispatch bot on main", calls[0][0].endsWith("/actions/workflows/telegram-bot.yml/dispatches") && JSON.parse(calls[0][1].body).ref === "main"
  && calls[0][1].headers.authorization === "Bearer t" && calls[0][1].headers["user-agent"]);
let threw = false; try { await dispatch("y.yml", { GH_TOKEN: "t" }, async () => new Response("bad", { status: 401 })); } catch { threw = true; }
t("error on 401", threw);
const henv = ok => ({ ASSETS: { fetch: async () => new Response("x", { status: ok ? 200 : 500 }) },
  MEDIA: { list: async () => ({ objects: [{ key: "audio/2137b5d426dbcd69.m4a" }] }) } });
let hits = [];
r = await health(henv(true), async (u, o) => (hits.push([u, o.method]), new Response(null, { status: 200 })));
let hj = await r.json();
t("health 200 when all answer", r.status === 200 && hj.ok && hj.audio_public === "ok" && hj.timer === "no GH_TOKEN"
  && hits[0][0] === "https://media.yaljabri.com/audio/2137b5d426dbcd69.m4a" && hits[0][1] === "HEAD" && r.headers.get("cache-control") === "no-store");
r = await health(henv(true), async () => new Response(null, { status: 404 })); hj = await r.json();
t("health 503 when public audio fails", r.status === 503 && hj.audio_public === "fail" && hj.site === "ok");
r = await health({ ...henv(false), MEDIA: { list: async () => { throw new Error("x"); } } }, async () => new Response(null)); hj = await r.json();
t("health 503 when site/bucket fail", r.status === 503 && hj.site === "fail" && hj.audio_bucket === "fail" && hj.audio_public === "fail");
r = await w.fetch(new Request("https://x/health"), henv(true)); t("/health routed", r.headers.get("content-type") === "application/json");
t("/health runs in the Worker", (await import("node:fs")).readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").includes('"/health"'));
const fs = await import("node:fs"), wr = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
t("crons match JOBS", Object.keys(JOBS).every(c => wr.includes(`"${c}"`))
  && Object.values(JOBS).every(f => fs.existsSync(new URL("../.github/workflows/" + f, import.meta.url))));
process.exit(bad ? 1 : 0);
