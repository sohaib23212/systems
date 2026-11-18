/*
 * فحص صفحة واحدة داخل المتصفح (يُحقن عبر Playwright). لا يعتمد على تخمين: كل نتيجة قياس فعلي
 * لمواضع العناصر كما رسمها المتصفح.
 *   hscroll    الصفحة أعرض من الشاشة (تمرير أفقي)
 *   offscreen  عنصر يخرج عن حدود الشاشة ولا تقصّه حاوية تمرير
 *   overlap    عنصران (نص أو أداة تفاعلية) يتراكبان ولا يحتوي أحدهما الآخر
 *   spill      نص يخرج عن حدود صندوقه فوق ما بجانبه
 *   contrast   نص لا يكاد يُقرأ فوق خلفيته (تباين أقل من 3:1)
 *   brokenimg  صورة لم تُحمّل
 */
window.__uiAudit = function (opts) {
  opts = opts || {};
  var doc = document, de = doc.documentElement;
  var vw = de.clientWidth, vh = window.innerHeight;
  var issues = [];
  function cls(el) {
    var c = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    c = c.trim().split(/\s+/).filter(function (x) { return x && !/^(is-|mx)/.test(x); }).slice(0, 3);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c.length ? '.' + c.join('.') : '');
  }
  function desc(el) {
    var parts = [], n = el, depth = 0;
    while (n && n.nodeType === 1 && n !== doc.body && depth < 4) { parts.unshift(cls(n)); n = n.parentElement; depth++; }
    return parts.join(' > ');
  }
  function text(el) { return (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40); }
  function visible(el, cs) {
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') { return false; }
    if (parseFloat(cs.opacity) === 0) { return false; }
    return true;
  }
  // المستطيل الظاهر فعلاً: تقاطع العنصر مع كل حاوية أعلاه تقصّ ما يخرج منها
  var clipCache = new Map();
  function clipOf(el) {
    if (clipCache.has(el)) { return clipCache.get(el); }
    var p = el.parentElement, r = null;
    var cs = getComputedStyle(el);
    if (cs.position === 'fixed') { r = { l: 0, t: 0, r: vw, b: vh, fixed: true }; }
    else if (!p || p === de) { r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 }; }
    else {
      var pr = clipOf(p), pcs = getComputedStyle(p);
      r = { l: pr.l, t: pr.t, r: pr.r, b: pr.b, fixed: pr.fixed, sticky: pr.sticky || pcs.position === 'sticky' || pcs.position === 'fixed', scroller: pr.scroller };
      var ox = pcs.overflowX, oy = pcs.overflowY;
      // قصّ الحماية الأخيرة على المنطقة الرئيسية لا يُخفي المشكلة عن الفحص: ما يتجاوز الشاشة يُبلَّغ عنه
      if (p.classList.contains('main') && p.parentElement && p.parentElement.classList.contains('shell')) { ox = 'visible'; }
      if (ox !== 'visible' || oy !== 'visible' || pcs.contain.indexOf('paint') >= 0) {
        var b = p.getBoundingClientRect();
        if (ox !== 'visible') { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
        if (oy !== 'visible') { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
        if (ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') { r.scroller = p; }
      }
      if (pcs.position === 'fixed') { r.fixed = true; }
    }
    clipCache.set(el, r);
    return r;
  }
  // مثل clipOf لكن يتجاهل القصّ الأفقي لحاوية غير قابلة للتمرير تمتد بعرض الشاشة كلها
  function looseClip(el) {
    var r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 }, p = el.parentElement;
    while (p && p !== de) {
      var pcs = getComputedStyle(p);
      if (pcs.overflowX !== 'visible') {
        var b = p.getBoundingClientRect();
        var scroller = pcs.overflowX === 'auto' || pcs.overflowX === 'scroll';
        if (scroller || b.left > 0.5 || b.right < vw - 0.5) { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
      }
      if (pcs.position === 'fixed') { break; }
      p = p.parentElement;
    }
    return r;
  }
  function inter(a, b) {
    var l = Math.max(a.l, b.l), t = Math.max(a.t, b.t), r = Math.min(a.r, b.r), bt = Math.min(a.b, b.b);
    return r > l && bt > t ? { l: l, t: t, r: r, b: bt } : null;
  }
  function rectOf(el) { var b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }

  // 1) التمرير الأفقي للصفحة
  var sw = Math.max(de.scrollWidth, doc.body.scrollWidth);
  if (sw > vw + 1) { issues.push({ type: 'hscroll', sel: 'html', detail: 'scrollWidth ' + sw + ' > ' + vw }); }
  if (opts.expectWidth && window.innerWidth > opts.expectWidth + 1) {
    issues.push({ type: 'hscroll', sel: 'viewport', detail: 'layout viewport grew to ' + window.innerWidth + ' (screen ' + opts.expectWidth + ')' });
  }

  var all = Array.prototype.slice.call(doc.body.querySelectorAll('*'));
  var cand = [];
  var offenders = new Set();
  all.forEach(function (el) {
    if (el.closest('script, style, noscript, template, svg defs, .toasts')) { return; }
    if (el.closest('dialog') && !el.closest('dialog[open]')) { return; }
    if (opts.scope && !el.closest(opts.scope)) { return; } // فحص نافذة واحدة فقط
    var cs = getComputedStyle(el);
    if (!visible(el, cs)) { return; }
    // يستبعد ما لا يرسمه المتصفح: داخل <details> مغلق أو تبويب مخفي أو أب شفاف أو غير ظاهر
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) { return; }
    var r = rectOf(el);
    if (r.r - r.l < 1 || r.b - r.t < 1) { return; }
    var clip = clipOf(el);
    var vis = inter(r, clip);
    if (!vis) { return; }
    // 2) خارج الشاشة أفقياً
    if ((vis.l < -1 || vis.r > vw + 1) && !el.closest('.sr-only, .visually-hidden')) {
      offenders.add(el);
    }
    // نص أو زر يقصّه عند حافة الشاشة أبٌ بعرض الصفحة كلها (مثل body بـ overflow-x): مقصوص أمام المستخدم
    else if (/^(BUTTON|INPUT|SELECT|TEXTAREA|A|IMG|SUMMARY|LABEL)$/.test(el.tagName) || Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim(); })) {
      var lc = looseClip(el), lv = inter(r, lc);
      if (lv && (lv.l < -1 || lv.r > vw + 1)) { offenders.add(el); }
    }
    var own = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) { own = true; break; }
    }
    var ctl = /^(BUTTON|INPUT|SELECT|TEXTAREA|A|IMG)$/.test(el.tagName) && !(el.tagName === 'INPUT' && el.type === 'hidden');
    if (own || ctl) {
      // المساحة التي يشغلها المحتوى فعلاً: سطور النص نفسها، ومساحة الكتابة داخل الحقول (دون الحشو)
      var box = vis;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
        var bl = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), br2 = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight);
        var bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), bb = parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom);
        box = inter({ l: r.l + bl, t: r.t + bt, r: r.r - br2, b: r.b - bb }, clip);
      } else if (own && !ctl) {
        var u = null;
        for (var k = 0; k < el.childNodes.length; k++) {
          var tn = el.childNodes[k];
          if (tn.nodeType !== 3 || !tn.nodeValue.trim()) { continue; }
          var rg = doc.createRange(); rg.selectNodeContents(tn);
          var rr = rg.getBoundingClientRect();
          if (!rr.width) { continue; }
          u = u ? { l: Math.min(u.l, rr.left), t: Math.min(u.t, rr.top), r: Math.max(u.r, rr.right), b: Math.max(u.b, rr.bottom) } : { l: rr.left, t: rr.top, r: rr.right, b: rr.bottom };
        }
        box = u ? inter(u, clip) : null;
        // العنصر نفسه يقصّ نصه إن كان قابلاً للتمرير (مثل صندوق الشيفرة)
        if (box && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) { box = inter(box, r); }
      }
      if (box) { cand.push({ el: el, r: box, own: own, cs: cs, clip: clip }); }
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0 && el.getAttribute('src')) {
      issues.push({ type: 'brokenimg', sel: desc(el), detail: el.getAttribute('src').slice(0, 80) });
    }
  });
  offenders.forEach(function (el) {
    if (el.parentElement && offenders.has(el.parentElement)) { return; }
    var r = el.getBoundingClientRect();
    issues.push({ type: 'offscreen', sel: desc(el), detail: Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + vw, text: text(el) });
  });

  // هل أحد العنصرين مغطّى بطبقة معتمة (أو ضبابية) فوقه عند هذه النقطة؟ عندها لا يُرى التراكب
  function opaque(el) {
    var cs = getComputedStyle(el);
    if (cs.backdropFilter && cs.backdropFilter !== 'none' || cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none') { return true; }
    if (cs.backgroundImage && cs.backgroundImage !== 'none') { return true; }
    var m = cs.backgroundColor.match(/[\d.]+/g);
    return !!m && (m.length < 4 ? true : parseFloat(m[3]) >= 0.85) && !/^rgba\(0, 0, 0, 0\)$/.test(cs.backgroundColor);
  }
  function coveredBetween(a, b, px, py) {
    // عناصر pointer-events:none لا يراها اختبار النقطة، فتُفعَّل مؤقتاً للقياس فقط
    var saved = [a, b].map(function (e) { var v = e.style.getPropertyValue('pointer-events'), p = e.style.getPropertyPriority('pointer-events'); e.style.setProperty('pointer-events', 'auto', 'important'); return [e, v, p]; });
    var stack = doc.elementsFromPoint(px, py);
    saved.forEach(function (x) { if (x[1]) { x[0].style.setProperty('pointer-events', x[1], x[2]); } else { x[0].style.removeProperty('pointer-events'); } });
    var ia = -1, ib = -1;
    for (var i = 0; i < stack.length; i++) {
      if (ia < 0 && (stack[i] === a || a.contains(stack[i]))) { ia = i; }
      if (ib < 0 && (stack[i] === b || b.contains(stack[i]))) { ib = i; }
    }
    if (ia < 0 && ib < 0) { return false; }
    if (ia < 0 || ib < 0) { return true; } // أحدهما لا يظهر عند هذه النقطة أصلاً (مغطّى بالكامل)
    var top = Math.min(ia, ib), bot = Math.max(ia, ib), lower = ia < ib ? b : a;
    for (var j = top + 1; j < bot; j++) {
      if (!stack[j].contains(lower) && opaque(stack[j])) { return true; }
    }
    return false;
  }

  // 3) التراكب: نصوص وأدوات تتقاطع دون أن يحتوي أحدها الآخر
  function layer(c) { return c.clip.fixed ? 'f' : (c.clip.sticky ? 's' : 'n'); }
  for (var a = 0; a < cand.length; a++) {
    for (var b = a + 1; b < cand.length; b++) {
      var A = cand[a], B = cand[b];
      if (layer(A) !== layer(B)) { continue; } // الشريط العلوي الثابت فوق المحتوى المتحرك أمر طبيعي
      var x = inter(A.r, B.r);
      if (!x) { continue; }
      var w = x.r - x.l, h = x.b - x.t;
      if (w < 3 || h < 3) { continue; }
      if (A.el.contains(B.el) || B.el.contains(A.el)) { continue; }
      // label مرتبط بحقله (مثل زر التبديل المخفي فوق شكله المرسوم)
      if (A.el.tagName === 'LABEL' && A.el.control === B.el || B.el.tagName === 'LABEL' && B.el.control === A.el) { continue; }
      if ((A.el.tagName === 'INPUT' && (A.el.type === 'checkbox' || A.el.type === 'radio') && parseFloat(A.cs.opacity) < 0.05) ||
          (B.el.tagName === 'INPUT' && (B.el.type === 'checkbox' || B.el.type === 'radio') && parseFloat(B.cs.opacity) < 0.05)) { continue; }
      if (coveredBetween(A.el, B.el, (x.l + x.r) / 2, (x.t + x.b) / 2)) { continue; }
      var bothText = A.own && B.own && !/^(BUTTON|INPUT|SELECT|TEXTAREA|IMG)$/.test(A.el.tagName) && !/^(BUTTON|INPUT|SELECT|TEXTAREA|IMG)$/.test(B.el.tagName);
      issues.push({ type: 'overlap', sel: desc(A.el) + '  ⟷  ' + desc(B.el), detail: Math.round(w) + 'x' + Math.round(h), text: text(A.el) + ' | ' + text(B.el),
        // صندوقا سطرين متداخلان لا يعني تلامس الحروف (خطوط مثل Cairo لها صندوق سطر أطول من الحروف): يُتحقق من البكسلات
        ink: bothText ? { a: Array.prototype.indexOf.call(all, A.el), b: Array.prototype.indexOf.call(all, B.el) } : undefined });
    }
  }

  // 4) نص يفيض عن صندوقه (بلا قص ولا نقاط) بأكثر من 2px
  cand.forEach(function (c) {
    if (!c.own) { return; }
    var el = c.el, cs = c.cs;
    if (cs.overflowX !== 'visible' || cs.display === 'inline' || cs.display === 'contents') { return; }
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      var range = doc.createRange(); range.selectNodeContents(el);
      var tr = range.getBoundingClientRect(), br = el.getBoundingClientRect();
      var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      if (tr.width > br.width + 2 && tr.width - br.width > 2 && pad >= 0) {
        issues.push({ type: 'spill', sel: desc(el), detail: Math.round(tr.width) + ' > ' + Math.round(br.width), text: text(el) });
      }
    }
  });

  // 5) التباين: لون النص مقابل الخلفية الفعلية (تركيب الشفافية، وأسوأ نقطة في التدرّج)
  var cv = doc.createElement('canvas'); cv.width = cv.height = 1;
  var cx = cv.getContext('2d', { willReadFrequently: true });
  function rgba(css) {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    var d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function over(top, bot) { var a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; }
  function lum(c) { return [c[0], c[1], c[2]].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function stops(img) {
    var m = img.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/gi);
    return m || [];
  }
  // كل الخلفيات المحتملة تحت العنصر (قائمة ألوان)، أو null إن كانت صورة لا يمكن قياسها
  var gradientBg = false, imageBg = false;
  function backgrounds(el) {
    gradientBg = false; imageBg = false;
    var chain = [], n = el;
    while (n && n.nodeType === 1) { chain.push(n); n = n.parentElement; }
    var layers = [];
    for (var i = 0; i < chain.length; i++) {
      var cs = getComputedStyle(chain[i]);
      var bi = cs.backgroundImage;
      var bc = rgba(cs.backgroundColor);
      if (bi && bi !== 'none') {
        if (/url\(/.test(bi)) { imageBg = true; return null; }
        var st = stops(bi).map(rgba);
        if (st.length > 1) { gradientBg = true; }
        if (st.length) { layers.push({ multi: st, base: bc }); if (st.every(function (s) { return s[3] >= 0.99; })) { break; } }
      }
      if (bc[3] > 0) { layers.push({ multi: [bc] }); if (bc[3] >= 0.99) { break; } }
    }
    var page = rgba(getComputedStyle(doc.body).backgroundColor);
    if (page[3] < 0.99) { page = over(page, rgba(getComputedStyle(de).backgroundColor)); }
    if (page[3] < 0.99) { page = over(page, [255, 255, 255, 1]); }
    // تركيب من الأسفل إلى الأعلى مع كل احتمالات ألوان التدرّج
    var results = [page];
    for (var j = layers.length - 1; j >= 0; j--) {
      var next = [];
      layers[j].multi.forEach(function (c) { results.forEach(function (r) { next.push(over(c, layers[j].base && layers[j].base[3] > 0 ? over(layers[j].base, r) : r)); }); });
      results = next.slice(0, 64);
    }
    return results;
  }
  if (opts.contrast !== false) {
    var seen = 0;
    cand.forEach(function (c) {
      if (!c.own || seen > 1500) { return; }
      var el = c.el, cs = c.cs;
      if (el.closest('[disabled], .is-disabled, [aria-disabled="true"]')) { return; }
      var own2 = Array.prototype.map.call(el.childNodes, function (n) { return n.nodeType === 3 ? n.nodeValue : ''; }).join('').trim();
      if (!/[\p{L}\p{N}]/u.test(own2)) { return; } // فواصل وزخارف (— · •) لا تحمل معلومة
      seen++;
      var op = 1, n = el;
      while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
      var fg = rgba(cs.color);
      // نص ملوّن بتدرّج (background-clip: text): لون الحروف هو ألوان التدرّج، والخلفية ما تحت العنصر
      if ((cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') && cs.backgroundImage !== 'none') {
        var tstops = stops(cs.backgroundImage).map(rgba);
        var under = el.parentElement ? backgrounds(el.parentElement) : null;
        var worstT = 99;
        if (under) { tstops.forEach(function (st) { under.forEach(function (bg) { worstT = Math.min(worstT, ratio(over(st, bg), bg)); }); }); }
        if (!under || worstT < 3) {
          issues.push({ type: 'contrast', sel: desc(el), detail: (under ? worstT.toFixed(2) + ':1 ' : '') + 'gradient text', text: text(el),
            verify: { idx: Array.prototype.indexOf.call(all, el), clipText: true, stops: tstops.map(function (c) { return [c[0], c[1], c[2]]; }) } });
        }
        return;
      }
      var bgs = backgrounds(el);
      if (!bgs) {
        // خلفية صورة: لا تُحسب من الأنماط، فتُقاس على البكسلات
        if (imageBg) { issues.push({ type: 'contrast', sel: desc(el), detail: 'over image · color ' + cs.color, text: text(el), verify: { idx: Array.prototype.indexOf.call(all, el), fg: [fg[0], fg[1], fg[2]] } }); }
        return;
      }
      var worst = 99;
      bgs.forEach(function (bg) {
        var f = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
        worst = Math.min(worst, ratio(f, bg));
      });
      if (worst < 3) {
        var tb = c.r;
        issues.push({ type: 'contrast', sel: desc(el), detail: worst.toFixed(2) + ':1 color ' + cs.color, text: text(el),
          // كل قراءة منخفضة تُثبَّت على البكسلات الفعلية (النص قد يكون فوق صورة أو عنصر شقيق لا فوق خلفية أبيه)
          verify: { idx: Array.prototype.indexOf.call(all, el), fg: [fg[0], fg[1], fg[2]], rect: [tb.l, tb.t, tb.r - tb.l, tb.b - tb.t] } });
      }
    });
  }
  return issues;
};
