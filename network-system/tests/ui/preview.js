#!/usr/bin/env node
/*
 * معاينة التصاميم في لوحة المسؤول (/admin/design/preview): كل تصميم جاهز بمقاسَي المعاينة (هاتف 390 وحاسوب 1280)،
 * بالوضعين الفاتح والداكن وباللغتين، دون تغيير التصميم المطبّق.
 *   node tests/ui/preview.js --base=... --admin-user=A --admin-pass=B --presets-file=presets.txt
 * presets.txt: سطر لكل تصميم «المفتاح query-string»، يولّده:
 *   php -r 'require "app/bootstrap.php"; foreach (App\Core\Theme::PRESETS as $k => $p) { echo $k, " ", http_build_query($p[2] + ["font_latin"=>"auto","stagger"=>"45","speed"=>"380","page_fx"=>"1","haptics"=>"1"]), "\n"; }'
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { confirm } = require('./verify');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:8080').replace(/\/$/, '');
const AUDIT = fs.readFileSync(path.join(__dirname, 'audit-page.js'), 'utf8');
const presets = fs.readFileSync(arg('presets-file'), 'utf8').trim().split('\n').map(l => l.split(' '));

(async () => {
  const browser = await chromium.launch();
  const login = await browser.newContext();
  const p = await login.newPage();
  await p.goto(BASE + '/admin/login');
  await p.fill('input[name=username]', arg('admin-user')); await p.fill('input[name=password]', arg('admin-pass'));
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  const state = await login.storageState();
  await login.close();
  const out = [];
  for (const [key, q] of presets) {
    for (const [w, h] of [[390, 780], [1280, 820]]) {
      const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, isMobile: w < 760, hasTouch: w < 760 });
      for (const mode of ['light', 'dark']) {
        for (const locale of ['ar', 'en']) {
          const page = await ctx.newPage();
          const errs = [];
          page.on('pageerror', e => errs.push(e.message));
          await page.goto(`${BASE}/admin/design/preview?${q}&locale=${locale}&mode=${mode}`, { waitUntil: 'load' });
          await page.waitForTimeout(700);
          await page.addScriptTag({ content: AUDIT });
          const issues = await confirm(page, await page.evaluate(o => window.__uiAudit(o), { expectWidth: w }));
          issues.forEach(i => out.push(Object.assign({ key, w, mode, locale }, i)));
          errs.forEach(e => out.push({ key, w, mode, locale, type: 'jserror', sel: 'page', detail: e }));
          await page.close();
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
  out.forEach(i => console.log(`${i.key} ${i.w} ${i.mode} ${i.locale} ${i.type} ${i.sel} — ${i.detail}${i.text ? ' «' + i.text + '»' : ''}`));
  console.log(`${out.length} findings in ${presets.length} designs × 2 sizes × 2 modes × 2 languages`);
  process.exit(out.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
