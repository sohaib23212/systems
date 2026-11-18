#!/usr/bin/env node
/*
 * فحص صفحات الهوتسبوت (hotspot/madix-net) في وضع المعاينة على مقاسات الهاتف واللوحي والحاسوب،
 * بنفس فحوص run.js (التمرير الأفقي، الخروج عن الشاشة، التراكب، الفيض، التباين، أخطاء JavaScript).
 *   node tests/ui/hotspot.js [--dir=../hotspot/madix-net] [--widths=320,360,412,768,1280]
 * ملفات md5.js و sn-config.js و sohaibnet.js يوفرها الراوتر ونظام Madix، فغيابها هنا متوقع.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { confirm } = require('./verify');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const DIR = path.resolve(arg('dir', path.join(__dirname, '../../../hotspot/madix-net')));
const WIDTHS = arg('widths', '320,360,412,768,1280').split(',').map(Number);
const PAGES = ['login.html', 'alogin.html', 'status.html', 'logout.html', 'error.html'];
const PROVIDED = /\/(md5|sn-config|sohaibnet)\.js$/;
const AUDIT = fs.readFileSync(path.join(__dirname, 'audit-page.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const p = path.join(DIR, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const out = [];
  for (const scheme of ['light', 'dark']) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 820 }, isMobile: w <= 760, hasTouch: w <= 760, colorScheme: scheme });
      for (const pg of PAGES) {
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push('js: ' + e.message));
        page.on('response', r => { if (r.status() >= 400 && !PROVIDED.test(r.url())) { errs.push('http ' + r.status() + ' ' + r.url()); } });
        await page.goto(base + pg, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        await page.addScriptTag({ content: AUDIT });
        const issues = await confirm(page, await page.evaluate(o => window.__uiAudit(o), { expectWidth: w }));
        for (const i of issues) { out.push(Object.assign({ page: pg, width: w, scheme }, i)); }
        errs.forEach(e => out.push({ page: pg, width: w, scheme, type: 'error', sel: '', detail: e }));
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  for (const i of out) { console.log(`${i.scheme} ${i.width} ${i.page} ${i.type} ${i.sel} — ${i.detail}${i.text ? ' «' + i.text + '»' : ''}`); }
  console.log(`${out.length} findings on ${PAGES.length} pages × ${WIDTHS.length} widths × 2 modes`);
  process.exit(out.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
