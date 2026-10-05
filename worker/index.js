/* Serves the static site (dist/, via the ASSETS binding) and one dynamic route:
   /dl/<16 hex>?n=<title>  ->  R2 object audio/<hex>.m4a with Content-Disposition: attachment, so the lesson page's
   «تحميل» button saves the file under the lesson's title instead of opening it in a new tab (cross-origin `download` is ignored). */
const KEY = /^\/dl\/([0-9a-f]{16})$/;
const BAD = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩/\\:*?"<>|]/g;

export const fileName = n => (String(n || "").replace(BAD, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim() || "lesson") + ".m4a";
export const disposition = name => `attachment; filename="lesson.m4a"; filename*=UTF-8''` +
  encodeURIComponent(name).replace(/['()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export default {
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
