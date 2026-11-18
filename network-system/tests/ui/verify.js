'use strict';
/* التحقق على البكسلات الفعلية من نتائج audit-page.js (يستخدمه run.js و hotspot.js) */

// التباين فوق خلفية متدرّجة يُقاس من البكسلات الفعلية: يُخفى النص وتُصوَّر المساحة التي يشغلها،
// ثم يُحسب الوسيط بين لون النص وكل بكسل من الخلفية تحته
async function verifyContrast(page, v) {
  const rect = await page.evaluate(([i, clipText]) => {
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
    if (clipText) { el.style.setProperty('background-image', 'none', 'important'); } // نص التدرّج يختفي بإزالة تدرّجه (لا تُمس خلفية غيره)
    el.style.setProperty('color', 'transparent', 'important');
    el.style.setProperty('text-shadow', 'none', 'important');
    el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    return u && { x: Math.max(0, u[0]), y: Math.max(0, u[1]), width: Math.min(innerWidth, u[2]) - Math.max(0, u[0]), height: Math.min(innerHeight, u[3]) - Math.max(0, u[1]) };
  }, [v.idx, !!v.clipText]);
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
    // أسوأ لون من ألوان النص (لون واحد عادةً، أو ألوان التدرّج) مقابل وسيط الخلفية
    let worst = 99;
    for (const c of fg) {
      const lf = lum(c[0], c[1], c[2]);
      const rs = [];
      for (let i = 0; i < d.length; i += 4) { const lb = lum(d[i], d[i + 1], d[i + 2]); rs.push((Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05)); }
      rs.sort((a, b) => a - b);
      worst = Math.min(worst, rs[Math.floor(rs.length / 2)]);
    }
    return worst;
  }, [buf.toString('base64'), v.clipText ? v.stops : [v.fg]]);
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


// يعيد النتائج بعد تثبيتها: ما لا تؤكده البكسلات يُحذف
async function confirm(page, issues) {
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
  return kept;
}

module.exports = { verifyContrast, verifyInk, confirm };
