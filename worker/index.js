/* Serves the static site (dist/, via the ASSETS binding) and one dynamic route:
   /dl/<16 hex>?n=<title>  ->  R2 object audio/<hex>.m4a with Content-Disposition: attachment, so the lesson page's
   «تحميل» button saves the file under the lesson's title instead of opening it in a new tab (cross-origin `download` is ignored). */
const KEY = /^\/dl\/([0-9a-f]{16})$/;
const BAD = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩/\\:*?"<>|]/g;

export const fileName = n => (String(n || "").replace(BAD, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim() || "lesson") + ".m4a";
export const disposition = name => `attachment; filename="lesson.m4a"; filename*=UTF-8''` +
  encodeURIComponent(name).replace(/['()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/* Timer (Cloudflare cron triggers in wrangler.jsonc, UTC): GitHub drops most scheduled Actions runs, so the Worker starts them
   through the API instead. Needs the secret GH_TOKEN (fine-grained token, this repo only, Actions: read and write). */
export const REPO = "Mohamed-AH/yahyaaljabri";
export const JOBS = { "17 * * * *": "telegram-bot.yml", "47 2 * * *": "youtube-sync.yml" };
export async function dispatch(workflow, env, fetcher = fetch) {
  if (!env.GH_TOKEN) { console.log("GH_TOKEN is not set: not starting " + workflow); return 0; }
  const r = await fetcher(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, { method: "POST",
    headers: { authorization: "Bearer " + env.GH_TOKEN, accept: "application/vnd.github+json", "user-agent": "yaljabri-timer",
      "x-github-api-version": "2022-11-28", "content-type": "application/json" }, body: JSON.stringify({ ref: "main" }) });
  console.log(workflow + ": " + r.status);
  if (r.status !== 204) throw new Error(`${workflow}: GitHub answered ${r.status} ${await r.text()}`);
  return r.status;
}

export default {
  async scheduled(event, env) {
    const wf = JOBS[event.cron];
    if (wf) await dispatch(wf, env);
  },

  async fetch(req, env) {
    const url = new URL(req.url), m = KEY.exec(url.pathname);
    if (!m) return env.ASSETS.fetch(req);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    const obj = await env.MEDIA.get(`audio/${m[1]}.m4a`);
    if (!obj) return new Response("not found", { status: 404 });
    return new Response(req.method === "HEAD" ? null : obj.body, { headers: {
      "content-type": "audio/mp4", "content-length": String(obj.size), "content-disposition": disposition(fileName(url.searchParams.get("n"))),
      "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
  },
};
