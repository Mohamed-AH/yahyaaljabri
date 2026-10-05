#!/usr/bin/env node
/* Renders site/og/default.png (1200×630, the picture shown when a link is shared) from the site's own fonts. Dev tool: needs Playwright.
   Usage: node scripts/make_og.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { STAR } from "../site/js/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fonts = pathToFileURL(path.join(ROOT, "site", "fonts")).href;
const pattern = (c, o) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='%23${c}' stroke-opacity='${o}' stroke-width='1'%3E%3Crect x='17' y='17' width='22' height='22'/%3E%3Crect x='17' y='17' width='22' height='22' transform='rotate(45 28 28)'/%3E%3Cpath d='M0 28h6M50 28h6M28 0v6M28 50v6'/%3E%3C/g%3E%3C/svg%3E")`;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Tajawal;font-weight:400;src:url(${fonts}/tajawal-arabic-400-normal.woff2)}
@font-face{font-family:Tajawal;font-weight:700;src:url(${fonts}/tajawal-arabic-700-normal.woff2)}
@font-face{font-family:Amiri;font-weight:700;src:url(${fonts}/amiri-arabic-700-subset.woff2)}
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;direction:rtl;position:relative;overflow:hidden;color:#eef3ef;font-family:Tajawal;
 background:${pattern("d4ae58", .1)},#0c231c;background-size:84px}
.mark{position:absolute;top:84px;right:96px;width:84px;height:84px;color:#d4ae58}
.pre{position:absolute;top:196px;right:96px;font:700 36px Tajawal;color:#d4ae58}
h1{position:absolute;top:244px;right:96px;margin:0;font:700 96px/1.3 Amiri}
.dua{position:absolute;top:404px;right:96px;font:400 40px Tajawal;color:#a9bdb4}
.sub{position:absolute;bottom:70px;right:96px;font:400 30px Tajawal;color:#eef3ef}
.sub b{color:#d4ae58;font-weight:700}
.art{position:absolute;left:70px;top:160px;width:300px;height:300px;border-radius:36px;background:${pattern("ffffff", .12)},#123c56;background-size:84px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6);transform:rotate(-4deg)}
.art2{left:120px;top:140px;background-color:#5a1f2b;transform:rotate(5deg)}
.art3{left:95px;top:165px;background-color:#1d4f4a;transform:none}
.art svg{position:absolute;top:28px;right:28px;width:56px;height:56px;color:#d4ae58}
.art span{position:absolute;bottom:34px;right:34px;left:34px;font:700 38px/1.35 Tajawal;color:#fff}
</style>
<div class="art art2"></div><div class="art"></div><div class="art art3">${STAR}<span>شرح صحيح البخاري</span></div>
<div class="mark">${STAR}</div>
<div class="pre">الموقع الرسمي لفضيلة الشيخ الوالد</div>
<h1>يحيى بن أحمد الجابري</h1><div class="dua">حفظه الله ورعاه</div>
<div class="sub"><b>دروس</b> · محاضرات · خطب · للاستماع والتحميل</div>`;
const tmp = path.join(os.tmpdir(), "og-default.html");
fs.writeFileSync(tmp, html);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(tmp).href); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
fs.mkdirSync(path.join(ROOT, "site", "og"), { recursive: true });
await page.screenshot({ path: path.join(ROOT, "site", "og", "default.png") });
await browser.close(); console.log("wrote site/og/default.png");
