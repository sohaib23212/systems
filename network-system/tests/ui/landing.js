#!/usr/bin/env node
/*
 * اختبارات تفاعل حقيقية لصفحة الهبوط (بعد run.js أو وحدها):
 *   - جولة في النظام: كل تبويب يُظهر لقطته وحدها وتُحمَّل صورتها، والأسهم وHome وEnd باتجاه القراءة
 *   - بلا JavaScript: كل اللقطات ظاهرة واحدة تحت الأخرى
 *   - رابط القسم الظاهر مُبرز، وشريط تقدّم القراءة، وزر العودة للأعلى
 *   - الأرقام تعدّ من الصفر وتنتهي على قيمها الأصلية
 *   - التبديل بين التصميم الجديد والكلاسيكي من لوحة المسؤول والرجوع، بالعربية والإنجليزية، بلا أخطاء
 *   - فيديو العرض من لوحة المسؤول: رفض غير روابط YouTube، الزر والنافذة وإغلاقها، وإخفاؤه بحذف الرابط
 *     (يعيد الحقل فارغاً في النهاية؛ لا تشغّله على نظام حقيقي فيه فيديو)
 *
 *   node tests/ui/landing.js --base=... --admin-user=... --admin-pass=...
 */
'use strict';
const { chromium } = require('playwright');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:8080').replace(/\/$/, '');
const AUSER = arg('admin-user', ''), APASS = arg('admin-pass', '');

let failed = 0, passed = 0;
function check(name, ok, info) {
  if (ok) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (info ? '  — ' + info : '')); }
}

(async () => {
  const browser = await chromium.launch();

  for (const lang of ['ar', 'en']) {
    console.log(`\n— ${lang}: الجولة والتنقل`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (lang === 'en') { await page.goto(BASE + '/lang/en'); }
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const tabs = page.locator('[role="tab"]');
    const n = await tabs.count();
    check('تبويبات الجولة موجودة', n >= 2, String(n));
    check('لقطة واحدة ظاهرة عند التحميل', await page.locator('.lp-panel:visible').count() === 1);
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      const id = await tabs.nth(i).getAttribute('aria-controls');
      const st = await page.evaluate(id => {
        const el = document.getElementById(id);
        return { shown: !el.hidden && el.offsetHeight > 0, others: [...document.querySelectorAll('.lp-panel')].filter(x => x !== el && !x.hidden).length,
          sel: document.querySelector('[aria-controls="' + id + '"]').getAttribute('aria-selected') };
      }, id);
      await page.locator('#' + id + ' img').scrollIntoViewIfNeeded();
      const width = await page.locator('#' + id + ' img').evaluate(img => new Promise(r => {
        if (img.complete && img.naturalWidth) { r(img.naturalWidth); return; }
        img.onload = () => r(img.naturalWidth); img.onerror = () => r(0);
      }));
      check(`التبويب ${i + 1} يُظهر لقطته وحدها وتُحمَّل صورتها (${id})`, st.shown && st.others === 0 && st.sel === 'true' && width > 0, JSON.stringify(st) + ' ' + width);
    }
    await tabs.nth(0).click();
    await tabs.nth(0).focus();
    await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    check('السهم ينقل إلى التبويب التالي باتجاه القراءة', await tabs.nth(1).getAttribute('aria-selected') === 'true'
      && await page.evaluate(() => document.activeElement.getAttribute('role')) === 'tab');
    await page.keyboard.press('End');
    check('End يختار آخر تبويب', await tabs.nth(n - 1).getAttribute('aria-selected') === 'true');
    await page.keyboard.press('Home');
    check('Home يختار أول تبويب', await tabs.nth(0).getAttribute('aria-selected') === 'true');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    check('لا رابط قسم مُبرز في أعلى الصفحة', await page.locator('[data-lp-link].is-active').count() === 0);
    check('زر العودة للأعلى مخفي في أعلى الصفحة', !(await page.locator('[data-lp-top]').evaluate(e => e.classList.contains('is-on'))));
    const link = page.locator('.lp-links a[data-lp-link]').last();
    if (await link.isVisible()) {
      const href = await link.getAttribute('href');
      await link.click();
      await page.waitForTimeout(1300);
      check('رابط القسم ينقل إليه ويُبرَز (' + href + ')', await link.evaluate(e => e.classList.contains('is-active')));
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    const prog = await page.locator('[data-lp-progress]').evaluate(e => e.style.transform);
    check('شريط تقدّم القراءة ممتلئ في آخر الصفحة', parseFloat(prog.replace('scaleX(', '')) >= 0.999, prog);
    check('زر العودة للأعلى يظهر بعد التمرير', await page.locator('[data-lp-top]').evaluate(e => e.classList.contains('is-on')));
    await page.click('[data-lp-top]');
    await page.waitForTimeout(1500);
    check('زر العودة للأعلى يعيد إلى أول الصفحة', await page.evaluate(() => window.scrollY) < 5);
    check('بلا أخطاء JavaScript', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  console.log('\n— الأرقام على الهاتف، وبلا JavaScript');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    if (await page.locator('[data-lp-count]').count()) {
      const before = await page.locator('[data-lp-count]').allTextContents();
      await page.locator('.lp-stats').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const mid = await page.locator('[data-lp-count]').allTextContents();
      await page.waitForTimeout(1600);
      const after = await page.locator('[data-lp-count]').allTextContents();
      check('الأرقام تعدّ من الصفر', JSON.stringify(mid) !== JSON.stringify(after), mid.join(' | '));
      check('وتنتهي على قيمها الأصلية', JSON.stringify(before) === JSON.stringify(after), after.join(' | '));
    }
    await ctx.close();
    const nojs = await browser.newContext({ viewport: { width: 1280, height: 860 }, javaScriptEnabled: false });
    const p2 = await nojs.newPage();
    await p2.goto(BASE + '/', { waitUntil: 'load' });
    check('بلا JavaScript: كل لقطات الجولة ظاهرة والتبويبات مخفية',
      await p2.locator('.lp-panel:visible').count() === await p2.locator('.lp-panel').count() && await p2.locator('.lp-tabs:visible').count() === 0);
    await nojs.close();
  }

  if (AUSER) {
    console.log('\n— فيديو العرض');
    const ac = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const a = await ac.newPage();
    await a.goto(BASE + '/admin/login');
    await a.fill('input[name=username]', AUSER); await a.fill('input[name=password]', APASS);
    await Promise.all([a.waitForNavigation(), a.click('button[type=submit]')]);
    const save = async value => {
      await a.goto(BASE + '/admin/landing', { waitUntil: 'load' });
      await a.fill('#lf-video', value);
      await Promise.all([a.waitForNavigation(), a.click('form[data-landing-form] button.btn-primary.btn-block')]);
    };
    // التبديل بين التصميمين من لوحة المسؤول، والرجوع، دون أخطاء
    const setStyle = async v => {
      await a.goto(BASE + '/admin/landing', { waitUntil: 'load' });
      await a.click('label.choice:has(input[name=style][value=' + v + ']) .choice-card'); // البطاقة الظاهرة كما يضغطها المستخدم
      await Promise.all([a.waitForNavigation(), a.click('form[data-landing-form] button.btn-primary.btn-block')]);
    };
    for (const [style, css, js] of [['classic', 'landing-classic.css', 'landing-classic.js'], ['pastel', 'landing.css', 'landing.js']]) {
      await setStyle(style);
      check(`المسؤول يختار التصميم «${style}» ويبقى مختاراً بعد الحفظ`, await a.isChecked('input[name=style][value=' + style + ']'));
      for (const lang of ['ar', 'en']) {
        const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
        const p = await c.newPage();
        const errors = [], bad = [];
        p.on('pageerror', e => errors.push(e.message));
        p.on('response', r => { if (r.status() >= 400) { bad.push(r.status() + ' ' + r.url()); } });
        if (lang === 'en') { await p.goto(BASE + '/lang/en'); }
        await p.goto(BASE + '/', { waitUntil: 'networkidle' });
        const st = await p.evaluate(() => ({
          css: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href').split('?')[0].split('/').pop()),
          js: [...document.scripts].map(s => (s.getAttribute('src') || '').split('?')[0].split('/').pop()).filter(Boolean),
          tour: !!document.querySelector('[data-lp-tour]'), title: document.querySelector('h1').textContent.trim(),
          bg: getComputedStyle(document.body).backgroundColor,
        }));
        const ok = st.css.includes(css) && !st.css.includes(style === 'classic' ? 'landing.css' : 'landing-classic.css') && st.js.includes(js)
          && st.tour === (style === 'pastel') && st.title.length > 3;
        check(`${lang}: الصفحة بالتصميم «${style}» (${st.css.join(',')} · ${st.js.join(',')} · ${st.bg})`, ok, JSON.stringify(st));
        check(`${lang}: «${style}» بلا أخطاء JavaScript ولا طلبات فاشلة`, errors.length === 0 && bad.length === 0, errors.concat(bad).join(' | '));
        await c.close();
      }
    }

    await save('https://example.com/watch?v=dQw4w9WgXcQ');
    check('رابط من غير YouTube يُرفض برسالة ويبقى في الحقل', await a.locator('#lf-video ~ .field-error').count() === 1
      && await a.inputValue('#lf-video') === 'https://example.com/watch?v=dQw4w9WgXcQ');
    await save('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
    check('رابط YouTube صحيح يُحفظ', await a.inputValue('#lf-video') === 'https://youtu.be/dQw4w9WgXcQ', await a.inputValue('#lf-video'));

    const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await c.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/', { waitUntil: 'load' });
    const btn = p.locator('[data-lp-video]');
    check('زر «شاهد العرض» ظاهر', await btn.count() === 1 && await btn.isVisible());
    check('بلا JavaScript يفتح الفيديو في YouTube', await btn.getAttribute('href') === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    check('لا شيء يُحمَّل من YouTube قبل الضغط', await p.locator('.lp-video-frame iframe').count() === 0);
    await btn.click();
    await p.waitForTimeout(300);
    check('الضغط يفتح نافذة الفيديو', await p.locator('dialog.lp-video').evaluate(d => d.open));
    check('المشغّل بعنوان YouTube المحسّن للخصوصية', (await p.locator('.lp-video-frame iframe').getAttribute('src') || '').startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?'));
    await p.keyboard.press('Escape');
    // حدث الإغلاق يصل بعد لحظة؛ الانتظار حتى ثانية بدل مدة ثابتة
    const closed = await p.waitForFunction(() => !document.querySelector('dialog.lp-video').open && !document.querySelector('.lp-video-frame iframe'), null, { timeout: 1000 }).then(() => true).catch(() => false);
    check('Escape يغلقها ويوقف الفيديو', closed);
    await btn.click(); await p.waitForTimeout(200);
    await p.click('[data-lp-video-close]'); await p.waitForTimeout(200);
    check('زر الإغلاق يغلقها', !(await p.locator('dialog.lp-video').evaluate(d => d.open)));
    await btn.click(); await p.waitForTimeout(200);
    await p.mouse.click(8, 8); await p.waitForTimeout(200);
    check('الضغط خارجها يغلقها', !(await p.locator('dialog.lp-video').evaluate(d => d.open)));
    for (const w of [320, 360, 412]) {
      const m = await browser.newContext({ viewport: { width: w, height: 740 }, isMobile: true, hasTouch: true });
      const q = await m.newPage();
      await q.goto(BASE + '/', { waitUntil: 'load' });
      await q.locator('[data-lp-video]').tap(); await q.waitForTimeout(300);
      const box = await q.locator('dialog.lp-video').boundingBox(), x = await q.locator('[data-lp-video-close]').boundingBox();
      check(`${w}px: النافذة وزر إغلاقها داخل الشاشة`, box.x >= 0 && box.x + box.width <= w && x.x >= 0 && x.x + x.width <= w && x.y >= 0);
      await m.close();
    }
    await save('');
    await p.goto(BASE + '/', { waitUntil: 'load' });
    check('حذف الرابط يخفي الزر والنافذة', await p.locator('[data-lp-video]').count() === 0 && await p.locator('dialog.lp-video').count() === 0);
    check('بلا أخطاء JavaScript', errors.length === 0, errors.join(' | '));
    await c.close(); await ac.close();
  }

  await browser.close();
  console.log(`\n${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
