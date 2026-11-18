#!/usr/bin/env node
/*
 * اختبارات تفاعل حقيقية على الهاتف والحاسوب (بعد run.js أو وحدها):
 *   - فتح /اسم-الحساب بلا شرطة أخيرة يبقي المستخدم داخلاً
 *   - زر القائمة يفتح القائمة الجانبية من حافة الشاشة ويغلقها زر الإغلاق والخلفية
 *   - البحث على الهاتف يتسع فوق الشريط ويُرسل بالإدخال
 *   - المظهر واللغة من قائمة الحساب على الشاشات الضيقة
 *   - الشريط السفلي فوق لوحة المفاتيح لا يغطي الحقل النشط
 *
 *   node tests/ui/flows.js --base=... --slug=... --user=... --pass=...
 */
'use strict';
const { chromium } = require('playwright');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:8080').replace(/\/$/, '');
const SLUG = arg('slug', 'so-net'), USER = arg('user', ''), PASS = arg('pass', '');
const WIDTHS = arg('widths', '320,360,412').split(',').map(Number);

let failed = 0, passed = 0;
function check(name, ok, info) {
  if (ok) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (info ? '  — ' + info : '')); }
}

(async () => {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    console.log(`\n— ${w}px (هاتف)`);
    const ctx = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/${SLUG}/login`);
    await page.fill('#username', USER); await page.fill('#password', PASS);
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);

    // 1) الرابط بلا شرطة أخيرة
    await page.goto(`${BASE}/${SLUG}`);
    check('فتح /' + SLUG + ' يبقي المستخدم داخلاً', !/\/login/.test(page.url()) && await page.locator('.topbar').count() === 1, page.url());

    await page.goto(`${BASE}/${SLUG}/cards`);
    await page.waitForTimeout(500);
    const geo = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: innerWidth }));
    check('لا تمرير أفقي في صفحة الكروت', geo.sw <= geo.cw && geo.iw === geo.cw, JSON.stringify(geo));

    // 2) القائمة الجانبية
    await page.tap('.menu-toggle', { timeout: 3000 }).catch(e => check('الضغط على زر القائمة', false, e.message.split('\n')[0]));
    await page.waitForTimeout(450);
    const d = await page.evaluate(() => { const r = document.querySelector('.sidebar').getBoundingClientRect(); return { l: r.left, r: r.right, vw: document.documentElement.clientWidth, open: document.body.classList.contains('sidebar-open'), vis: getComputedStyle(document.querySelector('.sidebar')).visibility }; });
    check('القائمة تُفتح', d.open && d.vis === 'visible', JSON.stringify(d));
    check('القائمة ملتصقة بحافة الشاشة اليمنى', Math.abs(d.r - d.vw) <= 1 && d.l >= 0, JSON.stringify(d));
    if (await page.locator('.sidebar-close').isVisible()) {
      await page.tap('.sidebar-close');
      await page.waitForTimeout(450);
      check('زر الإغلاق يغلق القائمة', !(await page.evaluate(() => document.body.classList.contains('sidebar-open'))));
    }
    await page.tap('.menu-toggle'); await page.waitForTimeout(450);
    const bd = await page.evaluate(() => { const r = document.querySelector('.backdrop').getBoundingClientRect(); return { l: r.left, w: r.width, vw: document.documentElement.clientWidth }; });
    check('الخلفية المعتمة تغطي الشاشة كلها', bd.l <= 0 && bd.w >= bd.vw, JSON.stringify(bd));
    await page.mouse.click(8, 400); await page.waitForTimeout(450);
    check('النقر على الخلفية يغلق القائمة', !(await page.evaluate(() => document.body.classList.contains('sidebar-open'))));

    // 3) البحث
    const search = page.locator('.topbar-search input');
    await search.tap();
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => { const r = document.querySelector('.topbar-search input').getBoundingClientRect(); return { w: r.width, vw: document.documentElement.clientWidth, focus: document.activeElement === document.querySelector('.topbar-search input') }; });
    check('خانة البحث تتسع عند الكتابة', s.focus && s.w >= s.vw - 40, JSON.stringify(s));
    await search.fill('xbc');
    await Promise.all([page.waitForNavigation(), search.press('Enter')]);
    check('الإدخال يفتح صفحة البحث', /\/search\?q=xbc/.test(page.url()), page.url());

    // 4) المظهر واللغة
    await page.goto(`${BASE}/${SLUG}/cards`);
    const themeBtnVisible = await page.locator('.topbar-actions > .theme-dd').isVisible();
    if (!themeBtnVisible) {
      await page.tap('.user-chip'); await page.waitForTimeout(250);
      const item = page.locator('.dropdown-menu.is-floating [data-theme-set="dark"]');
      check('خيار «داكن» ظاهر في قائمة الحساب', await item.isVisible());
      await item.tap(); await page.waitForTimeout(250);
      check('المظهر الداكن يُطبَّق', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
      await page.tap('.user-chip'); await page.waitForTimeout(250);
      await page.locator('.dropdown-menu.is-floating [data-theme-set="system"]').tap(); await page.waitForTimeout(250);
      await page.tap('.user-chip'); await page.waitForTimeout(250);
      const en = page.locator('.dropdown-menu.is-floating a[lang="en"]');
      check('خيار English ظاهر في قائمة الحساب', await en.isVisible());
    } else {
      check('زر المظهر ظاهر في الشريط', true);
    }

    // 5) لوحة المفاتيح والشريط السفلي (محاكاة تصغير الجزء الظاهر كما يفعل الهاتف)
    await page.goto(`${BASE}/${SLUG}/subscribers/create`);
    await page.waitForTimeout(400);
    const field = page.locator('main input[type="text"], main input:not([type])').last();
    await field.focus();
    const kb = await page.evaluate(async () => {
      const vv = window.visualViewport;
      const kbH = 300;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => innerHeight - kbH });
      vv.dispatchEvent(new Event('resize'));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 250));
      const bar = document.querySelector('.app-footer').getBoundingClientRect();
      const f = document.activeElement.getBoundingClientRect();
      return { kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(), barTop: bar.top, barBottom: bar.bottom, fieldBottom: f.bottom, visibleBottom: innerHeight - kbH };
    });
    check('الشريط السفلي يرتفع فوق لوحة المفاتيح', Math.abs(kb.barBottom - kb.visibleBottom) <= 2, JSON.stringify(kb));
    check('الحقل النشط فوق الشريط السفلي', kb.fieldBottom <= kb.barTop + 1, JSON.stringify(kb));
    await page.evaluate(() => { delete window.visualViewport.height; document.activeElement.blur(); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb').trim());
    check('الشريط يعود لمكانه بعد إغلاق لوحة المفاتيح', after === '0px', after);

    check('لا أخطاء JavaScript', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
