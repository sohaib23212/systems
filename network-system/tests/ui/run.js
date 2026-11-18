#!/usr/bin/env node
/*
 * فحص واجهة النظام كاملاً في متصفح حقيقي (Playwright + Chromium):
 * كل صفحة في النظام ولوحة المسؤول، مع كل تصميم جاهز، على عدة مقاسات (هاتف/لوحي/حاسوب)،
 * بالعربية والإنجليزية، بالوضع الفاتح والداكن.
 *
 * التصميم يُبدَّل من صفحة «التصاميم» في لوحة المسؤول كما يفعل المسؤول تماماً.
 *
 *   node tests/ui/run.js --base=http://127.0.0.1:8080 --slug=so-net --user=U --pass=P --admin-user=A --admin-pass=B
 *        [--designs=all|nexus,aurora] [--widths=360,412,768,1280] [--langs=ar,en] [--schemes=light,dark]
 *        [--only=/cards,/admin/design] [--concurrency=4] [--out=report.json] [--no-contrast]
 *
 * رمز الخروج 0 فقط إن لم تُكتشف أي مشكلة.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : (process.argv.includes('--' + k) ? '1' : d); };
const BASE = arg('base', 'http://127.0.0.1:8080').replace(/\/$/, '');
const SLUG = arg('slug', 'so-net');
const USER = arg('user', ''), PASS = arg('pass', '');
const AUSER = arg('admin-user', ''), APASS = arg('admin-pass', '');
const PRESETS = ['nexus', 'aurora', 'midnight', 'oasis', 'sahara', 'ocean', 'rose', 'graphite', 'sunset', 'frost'];
const designs = arg('designs', 'all') === 'all' ? PRESETS : arg('designs').split(',');
const widths = arg('widths', '360,412,768,1280').split(',').map(Number);
const langs = arg('langs', 'ar').split(',');
const schemes = arg('schemes', 'light').split(',');
const only = arg('only', '') ? arg('only').split(',') : null;
// --combos=ar:dark,en:light لاختيار تركيبات اللغة والوضع بدل كل التركيبات
const combos = arg('combos', '') ? arg('combos').split(',').map(c => c.split(':')) : langs.flatMap(l => schemes.map(sc => [l, sc]));
const CONC = +arg('concurrency', '4');
const OUT = arg('out', path.join(__dirname, 'report.json'));
const CONTRAST = !process.argv.includes('--no-contrast');
const AUDIT_SRC = fs.readFileSync(path.join(__dirname, 'audit-page.js'), 'utf8');
const MOBILE_MAX = 760;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function settle(page) {
  // انتظار انتهاء حركات الظهور (المحدودة فقط) حتى تُقاس المواضع النهائية
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter(a => { const t = a.effect && a.effect.getComputedTiming(); return t && isFinite(t.endTime); }).map(a => a.finished.catch(() => {}))),
    new Promise(r => setTimeout(r, 2500)),
  ])).catch(() => {});
  await page.waitForTimeout(60);
}

async function loginTenant(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${SLUG}/login`);
  await p.fill('#username', USER); await p.fill('#password', PASS);
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  if (/\/login/.test(p.url())) { throw new Error('tenant login failed'); }
  await p.close();
}
async function loginAdmin(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.fill('input[name=username]', AUSER); await p.fill('input[name=password]', APASS);
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  if (/\/login/.test(p.url())) { throw new Error('admin login failed'); }
  await p.close();
}

async function setLang(ctx, root, lang) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${root}/lang/${lang}`).catch(() => {});
  await p.close();
}

// اكتشاف الصفحات: روابط القائمة ثم روابط كل صفحة (مستوى واحد)، صفحة واحدة لكل نمط مسار
const SKIP = /\/(logout|lang\/|export|download|print\/render|cron|health|manifest|impersonat|auth\/ticket)|\.(js|css|png|svg|ico|zip|xlsx|csv|pdf|rsc|txt)$/;
function pattern(u) { return u.replace(/\/\d+(?=\/|$)/g, '/{id}').replace(/\/[a-f0-9]{24,}(?=\/|$)/g, '/{token}'); }
async function discover(ctx, root) {
  const seen = new Map(); // نمط => رابط
  const queue = [root === '/admin' ? root : root + '/'];
  const page = await ctx.newPage();
  let depth = 0;
  while (queue.length && depth < 3) {
    const level = queue.splice(0);
    for (const u of level) {
      const pat = pattern(u);
      if (seen.has(pat)) { continue; }
      // الطلب نفسه من صفحة المتصفح (الجلسة مربوطة بالمتصفح)، ومتابعة التحويل إن وُجد
      const res = await page.goto(BASE + u, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (!res) { seen.set(pat, null); continue; }
      const ct = res.headers()['content-type'] || '';
      if (!/text\/html/.test(ct) || /attachment/.test(res.headers()['content-disposition'] || '')) { seen.set(pat, null); continue; }
      const final = page.url().replace(BASE, '').split('#')[0].split('?')[0];
      if (final !== u) {
        seen.set(pat, null);
        if (final.startsWith(root) && !SKIP.test(final) && !seen.has(pattern(final)) && !/\/login/.test(final)) { level.push(final); }
        continue;
      }
      seen.set(pat, u);
      const links = await page.evaluate((root) => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
        .filter(h => h && h.startsWith(root + '/') || h === root).map(h => h.split('#')[0].split('?')[0]), root).catch(() => []);
      for (const l of links) {
        const rel = l;
        if (SKIP.test(rel) || seen.has(pattern(rel))) { continue; }
        queue.push(rel);
      }
    }
    depth++;
  }
  await page.close();
  return [...seen.values()].filter(Boolean).sort();
}

async function switchDesign(adminCtx, key) {
  const p = await adminCtx.newPage();
  await p.goto(`${BASE}/admin/design`);
  await p.click(`[data-preset="${key}"]`);
  await Promise.all([p.waitForNavigation(), p.locator('form[action$="/admin/design"] button.btn-primary').last().click()]);
  const applied = await p.evaluate(() => document.querySelector('.dz-preset.is-active') && document.querySelector('.dz-preset.is-active').getAttribute('data-preset'));
  await p.close();
  if (applied !== key) { throw new Error(`design ${key} not applied (got ${applied})`); }
}

// التباين فوق خلفية متدرّجة يُقاس من البكسلات الفعلية: يُخفى النص وتُصوَّر المساحة التي يشغلها،
// ثم يُحسب الوسيط بين لون النص وكل بكسل من الخلفية تحته
async function verifyContrast(page, v) {
  const rect = await page.evaluate(i => {
    const el = document.body.querySelectorAll('*')[i];
    if (!el) { return null; }
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    let u = null;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) { continue; }
      const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
      u = u ? [Math.min(u[0], b.left), Math.min(u[1], b.top), Math.max(u[2], b.right), Math.max(u[3], b.bottom)] : [b.left, b.top, b.right, b.bottom];
    }
    el.setAttribute('data-uia', el.getAttribute('style') || '');
    el.style.setProperty('color', 'transparent', 'important');
    el.style.setProperty('text-shadow', 'none', 'important');
    el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    return u && { x: Math.max(0, u[0]), y: Math.max(0, u[1]), width: Math.min(innerWidth, u[2]) - Math.max(0, u[0]), height: Math.min(innerHeight, u[3]) - Math.max(0, u[1]) };
  }, v.idx);
  let buf = null;
  if (rect && rect.width >= 1 && rect.height >= 1) { buf = await page.screenshot({ clip: rect, animations: 'disabled' }).catch(() => null); }
  await page.evaluate(i => { const el = document.body.querySelectorAll('*')[i]; if (!el) { return; } const s = el.getAttribute('data-uia'); if (s) { el.setAttribute('style', s); } else { el.removeAttribute('style'); } el.removeAttribute('data-uia'); }, v.idx);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  if (!buf) { return null; }
  return page.evaluate(async ([b64, fg]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const lum = (r, g, b) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const lf = lum(fg[0], fg[1], fg[2]);
    const rs = [];
    for (let i = 0; i < d.length; i += 4) { const lb = lum(d[i], d[i + 1], d[i + 2]); rs.push((Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05)); }
    rs.sort((a, b) => a - b);
    return rs[Math.floor(rs.length / 2)];
  }, [buf.toString('base64'), v.fg]);
}

// تراكب نصين: هل تلتقي حروفهما فعلاً؟ تُصوَّر منطقة التقاطع ثلاث مرات (بلا النصين، بالأول وحده، بالثاني وحده)
// ويُعدّ تراكباً حقيقياً إن وُجد بكسل يرسمه النصان كلاهما
async function verifyInk(page, v) {
  const setup = await page.evaluate(([ia, ib]) => {
    const all = document.body.querySelectorAll('*'), a = all[ia], b = all[ib];
    if (!a || !b) { return null; }
    a.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const box = el => { let u = null; for (const n of el.childNodes) { if (n.nodeType !== 3 || !n.nodeValue.trim()) { continue; } const r = document.createRange(); r.selectNodeContents(n); const q = r.getBoundingClientRect(); u = u ? [Math.min(u[0], q.left), Math.min(u[1], q.top), Math.max(u[2], q.right), Math.max(u[3], q.bottom)] : [q.left, q.top, q.right, q.bottom]; } return u; };
    const x = box(a), y = box(b);
    if (!x || !y) { return null; }
    const l = Math.max(x[0], y[0], 0), t = Math.max(x[1], y[1], 0), r = Math.min(x[2], y[2], innerWidth), bt = Math.min(x[3], y[3], innerHeight);
    if (r - l < 1 || bt - t < 1) { return null; }
    window.__inkEls = [a, b];
    return { x: Math.floor(l), y: Math.floor(t), width: Math.ceil(r - l) + 1, height: Math.ceil(bt - t) + 1 };
  }, [v.a, v.b]);
  if (!setup) { return null; }
  const hide = (which) => page.evaluate(w => window.__inkEls.forEach((e, i) => {
    if (w.includes(i)) { e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('-webkit-text-fill-color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); }
    else { e.style.removeProperty('color'); e.style.removeProperty('-webkit-text-fill-color'); e.style.removeProperty('text-shadow'); }
  }), which);
  const styles = await page.evaluate(() => window.__inkEls.map(e => e.getAttribute('style')));
  const shot = async (which) => { await hide(which); return (await page.screenshot({ clip: setup, animations: 'disabled', caret: 'hide' })).toString('base64'); };
  const bg = await shot([0, 1]), onlyA = await shot([1]), onlyB = await shot([0]);
  await page.evaluate(st => { window.__inkEls.forEach((e, i) => { if (st[i] === null) { e.removeAttribute('style'); } else { e.setAttribute('style', st[i]); } }); delete window.__inkEls; window.scrollTo({ top: 0, behavior: 'instant' }); }, styles);
  return page.evaluate(async (imgs) => {
    const px = async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const [g, a, b] = await Promise.all(imgs.map(px));
    let both = 0;
    for (let i = 0; i < g.length; i += 4) {
      const da = Math.abs(a[i] - g[i]) + Math.abs(a[i + 1] - g[i + 1]) + Math.abs(a[i + 2] - g[i + 2]);
      const db = Math.abs(b[i] - g[i]) + Math.abs(b[i + 1] - g[i + 1]) + Math.abs(b[i + 2] - g[i + 2]);
      if (da > 60 && db > 60) { both++; }
    }
    return both;
  }, [bg, onlyA, onlyB]);
}

async function auditPage(ctx, url, ws, meta, results, extra) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push({ type: 'jserror', sel: 'page', detail: e.message.slice(0, 200) }));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { errs.push({ type: 'jserror', sel: 'console', detail: m.text().slice(0, 200) }); } });
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(BASE) && r.request().resourceType() !== 'document') { errs.push({ type: 'http', sel: r.request().resourceType(), detail: r.status() + ' ' + r.url().replace(BASE, '') }); }
  });
  const push = (w, list) => list.forEach(i => results.push(Object.assign({ url, width: w }, meta, i)));
  let resp;
  try {
    await page.setViewportSize({ width: ws[0], height: 860 });
    resp = await page.goto(BASE + url, { waitUntil: 'load', timeout: 45000 });
  } catch (e) {
    push(ws[0], [{ type: 'load', sel: 'page', detail: e.message.split('\n')[0] }]);
    await page.close(); return;
  }
  const st = resp ? resp.status() : 0;
  if (st >= 400) { push(ws[0], [{ type: 'http', sel: 'document', detail: String(st) }]); }
  const body = await page.content();
  const php = body.match(/(Fatal error|Parse error|Warning<\/b>:|Notice<\/b>:|Deprecated<\/b>:|Uncaught [A-Z]\w+|Stack trace:)[^<]{0,160}/);
  if (php) { push(ws[0], [{ type: 'php', sel: 'document', detail: php[0] }]); }
  await page.addScriptTag({ content: AUDIT_SRC });
  for (const w of ws) {
    await page.setViewportSize({ width: w, height: 860 });
    await page.waitForTimeout(120);
    await settle(page);
    const issues = await page.evaluate(o => window.__uiAudit(o), { expectWidth: w, contrast: CONTRAST }).catch(e => [{ type: 'audit', sel: 'page', detail: e.message }]);
    const kept = [];
    for (const i of issues) {
      if (i.ink) {
        const both = await verifyInk(page, i.ink);
        delete i.ink;
        if (both !== null && both < 2) { continue; }
        if (both !== null) { i.detail += ' · ' + both + ' px of letters touch'; }
      }
      if (i.verify) {
        const real = await verifyContrast(page, i.verify);
        delete i.verify;
        if (real !== null && real >= 3) { continue; }
        if (real !== null) { i.detail = real.toFixed(2) + ':1 measured on pixels; ' + i.detail; }
      }
      kept.push(i);
    }
    push(w, kept);
    // الشريط السفلي: لا يغطي آخر المحتوى بعد التمرير إلى النهاية، ويمتد بعرض المنطقة الرئيسية
    const foot = await page.evaluate(() => {
      const out = [];
      const f = document.querySelector('.app-footer');
      const c = document.querySelector('main.content');
      if (!f || !c) { return out; }
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const fr = f.getBoundingClientRect();
      let maxB = -1, last = null;
      for (const el of c.children) {
        if (el === f || el.tagName === 'SCRIPT' || el.tagName === 'DIALOG' || el.tagName === 'TEMPLATE') { continue; }
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') { continue; }
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > maxB) { maxB = r.bottom; last = el; }
      }
      if (last && maxB > fr.top + 1) { out.push({ type: 'footer-covers', sel: last.className || last.tagName, detail: `content bottom ${Math.round(maxB)} > bar top ${Math.round(fr.top)}` }); }
      const vw = document.documentElement.clientWidth;
      if (fr.left < -1 || fr.right > vw + 1) { out.push({ type: 'footer-width', sel: 'app-footer', detail: `${Math.round(fr.left)}..${Math.round(fr.right)} of ${vw}` }); }
      const sb = document.querySelector('.sidebar');
      if (sb && getComputedStyle(sb).visibility !== 'hidden') {
        const s = sb.getBoundingClientRect();
        if (Math.min(s.right, fr.right) - Math.max(s.left, fr.left) > 1 && s.bottom > fr.top) { out.push({ type: 'footer-under-sidebar', sel: 'app-footer', detail: `sidebar ${Math.round(s.left)}..${Math.round(s.right)} bar ${Math.round(fr.left)}..${Math.round(fr.right)}` }); }
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      return out;
    });
    push(w, foot);
    if (extra) { push(w, await extra(page, w)); }
  }
  push(ws[0], errs);
  await page.close();
}

// فتح القائمة الجانبية والقوائم المنسدلة وقياس مواضعها
async function chromeChecks(page, w) {
  const out = [];
  const rtl = await page.evaluate(() => (document.documentElement.getAttribute('dir') || 'rtl') === 'rtl');
  const toggle = page.locator('.menu-toggle');
  let tapped = false;
  if (await toggle.isVisible().catch(() => false)) {
    // نقرة حقيقية: إن غطّى الزرَّ عنصرٌ آخر فهذه مشكلة يراها المستخدم
    tapped = await toggle.click({ timeout: 3000 }).then(() => true).catch(e => { out.push({ type: 'blocked-tap', sel: 'menu-toggle', detail: (e.message.match(/<[^>]+> from <[^>]+>[^\n]*intercepts/) || [e.message.split('\n')[0]])[0].slice(0, 160) }); return false; });
  }
  if (tapped) {
    await page.waitForTimeout(450);
    const m = await page.evaluate(() => {
      const s = document.querySelector('.sidebar').getBoundingClientRect();
      const b = document.querySelector('.backdrop');
      const br = b ? b.getBoundingClientRect() : null;
      return { s: [s.left, s.right, s.top, s.bottom], b: br && getComputedStyle(b).display !== 'none' ? [br.left, br.right, br.top, br.bottom] : null, vw: document.documentElement.clientWidth, vh: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth };
    });
    const [l, r, t, bt] = m.s;
    const edgeOk = rtl ? Math.abs(r - m.vw) <= 1 || (r <= m.vw && m.vw - r <= 14) : Math.abs(l) <= 1 || (l >= 0 && l <= 14);
    if (!edgeOk || l < -1 || r > m.vw + 1 || t < -1 || bt > m.vh + 1) { out.push({ type: 'drawer', sel: 'sidebar', detail: `drawer ${Math.round(l)}..${Math.round(r)} x ${Math.round(t)}..${Math.round(bt)} in ${m.vw}x${m.vh}` }); }
    if (m.b && (m.b[0] > 1 || m.b[1] < m.vw - 1 || m.b[2] > 1 || m.b[3] < m.vh - 1)) { out.push({ type: 'drawer', sel: 'backdrop', detail: `backdrop ${m.b.map(Math.round).join(',')} in ${m.vw}x${m.vh}` }); }
    if (m.sw > m.vw + 1) { out.push({ type: 'drawer', sel: 'html', detail: `page scrolls sideways while menu open (${m.sw} > ${m.vw})` }); }
    const inner = await page.evaluate(o => window.__uiAudit(o), { expectWidth: w, contrast: false });
    inner.filter(i => /sidebar|backdrop/.test(i.sel)).forEach(i => out.push(Object.assign(i, { type: 'drawer-' + i.type })));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  // كل القوائم المنسدلة في الشريط العلوي داخل الشاشة
  const n = await page.locator('.topbar [data-dropdown]').count();
  for (let i = 0; i < n; i++) {
    const t = page.locator('.topbar [data-dropdown]').nth(i);
    if (!(await t.isVisible().catch(() => false))) { continue; }
    const label0 = await t.getAttribute('aria-label') || await t.innerText();
    const ok = await t.click({ timeout: 3000 }).then(() => true).catch(e => { out.push({ type: 'blocked-tap', sel: label0, detail: (e.message.match(/<[^>]+> from <[^>]+>[^\n]*intercepts/) || [e.message.split('\n')[0]])[0].slice(0, 160) }); return false; });
    if (!ok) { continue; }
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const m = document.querySelector('.dropdown-menu.is-floating');
      if (!m) { return null; }
      const b = m.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, vw: document.documentElement.clientWidth, vh: innerHeight, sw: m.scrollWidth, cw: m.clientWidth };
    });
    const label = await t.getAttribute('aria-label') || await t.innerText();
    if (!r) { out.push({ type: 'dropdown', sel: label, detail: 'menu did not open' }); }
    else if (r.l < -1 || r.r > r.vw + 1 || r.t < -1 || r.b > r.vh + 1 || r.sw > r.cw + 1) { out.push({ type: 'dropdown', sel: label, detail: `menu ${Math.round(r.l)}..${Math.round(r.r)} x ${Math.round(r.t)}..${Math.round(r.b)} in ${r.vw}x${r.vh}` }); }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  return out;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  const results = [];
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await loginAdmin(adminCtx);

  // جلسة دخول واحدة لكل لغة ووضع، يعاد استخدامها في كل السياقات
  const states = {};
  for (const lang of [...new Set(combos.map(c => c[0]))]) {
    for (const who of ['tenant', 'admin']) {
      const c = await browser.newContext();
      if (who === 'tenant') { await loginTenant(c); await setLang(c, '/' + SLUG, lang); } else { await loginAdmin(c); await setLang(c, '', lang); }
      states[who + lang] = await c.storageState();
      await c.close();
    }
  }
  const lang0 = combos[0][0];
  const dctx = await browser.newContext({ storageState: states['tenant' + lang0], viewport: { width: 1280, height: 860 } });
  let pages = (await discover(dctx, '/' + SLUG)).map(u => ['tenant', u]);
  await dctx.close();
  const actx = await browser.newContext({ storageState: states['admin' + lang0], viewport: { width: 1280, height: 860 } });
  pages = pages.concat((await discover(actx, '/admin')).filter(u => !/\/admin\/design\/preview/.test(u)).map(u => ['admin', u]));
  await actx.close();
  if (only) { pages = pages.filter(([, u]) => only.some(o => u === o || u.endsWith(o))); }
  log(`pages: ${pages.length}`);
  fs.writeFileSync(path.join(path.dirname(OUT), 'pages.txt'), pages.map(p => p[1]).join('\n') + '\n');

  const mobileW = widths.filter(w => w <= MOBILE_MAX), deskW = widths.filter(w => w > MOBILE_MAX);
  for (const design of designs) {
    await switchDesign(adminCtx, design);
    for (const [lang, scheme] of combos) {
      {
        const meta = { design, lang, scheme };
        const ctxs = {};
        for (const who of ['tenant', 'admin']) {
          if (mobileW.length) { ctxs[who + 'm'] = await browser.newContext({ storageState: states[who + lang], viewport: { width: mobileW[0], height: 860 }, isMobile: true, hasTouch: true, colorScheme: scheme }); }
          if (deskW.length) { ctxs[who + 'd'] = await browser.newContext({ storageState: states[who + lang], viewport: { width: deskW[0], height: 860 }, colorScheme: scheme }); }
        }
        const jobs = [];
        pages.forEach(([who, u], idx) => {
          if (mobileW.length) { jobs.push([ctxs[who + 'm'], u, mobileW, idx < 2 || u === '/' + SLUG + '/cards' || u === '/admin' ? chromeChecks : null]); }
          if (deskW.length) { jobs.push([ctxs[who + 'd'], u, deskW, idx < 2 || u === '/' + SLUG + '/cards' || u === '/admin' ? chromeChecks : null]); }
        });
        await pool(jobs, CONC, ([c, u, ws, extra]) => auditPage(c, u, ws, meta, results, extra));
        for (const c of Object.values(ctxs)) { await c.close(); }
        log(`${design} ${lang} ${scheme}: ${results.length} findings so far`);
      }
    }
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));

  // ملخص: تجميع النتائج المتكررة حسب النوع والعنصر
  const groups = new Map();
  for (const r of results) {
    const k = r.type + ' | ' + r.sel + (r.type === 'jserror' || r.type === 'http' || r.type === 'php' ? ' | ' + r.detail : '');
    if (!groups.has(k)) { groups.set(k, { n: 0, designs: new Set(), widths: new Set(), urls: new Set(), ex: r }); }
    const g = groups.get(k); g.n++; g.designs.add(r.design + (r.lang !== 'ar' ? '/' + r.lang : '') + (r.scheme !== 'light' ? '/' + r.scheme : '')); g.widths.add(r.width); g.urls.add(r.url);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, g] of sorted) {
    console.log(`\n[${g.n}] ${k}\n    widths: ${[...g.widths].join(',')}  designs: ${[...g.designs].slice(0, 10).join(',')}\n    pages(${g.urls.size}): ${[...g.urls].slice(0, 5).join(' ')}\n    e.g. ${g.ex.detail}${g.ex.text ? '  «' + g.ex.text + '»' : ''}`);
  }
  log(`done in ${Math.round((Date.now() - t0) / 1000)}s: ${results.length} findings in ${groups.size} groups, ${pages.length} pages`);
  process.exit(results.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
