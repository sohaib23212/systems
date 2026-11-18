/*!
 * Madix Net — منطق صفحات الهوتسبوت
 * يعمل على المتصفحات القديمة (ES5) ويستخدم مكتبة الربط sohaibnet.js عند توفرها.
 * عند فتح الصفحات خارج جهاز MikroTik (بدون تعويض المتغيرات) تعمل في وضع المعاينة ببيانات توضيحية.
 * ملاحظة: لا تكتب علامة الدولار متبوعة بقوس في هذا الملف.
 */
(function (w, d) {
  'use strict';

  var T = w.MADIX_THEME || {};
  var MARK = String.fromCharCode(36, 40);
  var SRC = w.SN_MT || {};
  var page = d.body ? (d.body.getAttribute('data-page') || '') : '';
  var reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FRAMED = (function () { try { return w.self !== w.top; } catch (e) { return true; } })();
  var LS = (function () {
    try { var k = '__mx'; w.localStorage.setItem(k, '1'); w.localStorage.removeItem(k); return w.localStorage; } catch (e) { return null; }
  })();

  function isRaw(x) { return typeof x === 'string' && x.indexOf(MARK) !== -1; }

  // وضع المعاينة: الصفحة مفتوحة خارج الراوتر فبقيت المتغيرات كما هي
  var DEMO = false;
  for (var key in SRC) {
    if (Object.prototype.hasOwnProperty.call(SRC, key) && isRaw(SRC[key])) { DEMO = true; break; }
  }
  var DEMO_MT = {
    login: { linkLogin: 'login.html', linkOrig: '', chapId: '', chapChallenge: '', mac: '48:E7:DA:ED:0E:CB', ip: '10.10.0.243', error: '', username: '', trial: 'yes' },
    alogin: { linkRedirect: 'status.html', linkStatus: 'status.html', username: '123456789' },
    status: { username: '123456789', mac: '48:E7:DA:ED:0E:CB', ip: '10.10.0.243', uptimeSecs: '18', timeLeftSecs: '35672', bytesIn: '345088', bytesOut: '2936012', remainBytes: '', refreshSecs: '', loginBy: 'http-chap', linkLogout: 'logout.html' },
    logout: { username: '123456789', uptimeSecs: '8061', bytesIn: '18874368', bytesOut: '254803968', linkLogin: 'login.html', linkLoginOnly: 'login.html' },
    error: { error: 'انتهى رصيد الوقت للحساب 123456789.', linkLogin: 'login.html', linkLoginOnly: 'login.html' }
  };
  var DEMO_INFO = {
    ok: true, network: 'Madix Net', phone: '0590000000', whatsapp: '+970590000000', currency: '₪',
    categories: [
      { name: 'كرت ساعتين', price: 1, time: 'ساعتان', validity: 'يوم', data: 'غير محدود', speed: '4 Mbps / 1 Mbps', color: '#0b6dff' },
      { name: 'كرت 10 ساعات', price: 2, time: '10 ساعات', validity: '3 أيام', data: 'غير محدود', speed: '4 Mbps / 1 Mbps', color: '#0240f8' },
      { name: 'كرت 24 ساعة', price: 3, time: 'يوم', validity: 'يوم', data: 'غير محدود', speed: '6 Mbps / 2 Mbps', color: '#05adc1' },
      { name: 'كرت أسبوعي', price: 15, time: 'غير محدود', validity: '7 أيام', data: '20 GB', speed: '8 Mbps / 2 Mbps', color: '#071a7a' }
    ]
  };
  var MT = DEMO ? (DEMO_MT[page] || {}) : SRC;
  function val(k) { var x = MT[k]; return (x == null || isRaw(x)) ? '' : String(x); }

  // ------------------------------------------------------------------ أدوات
  function byId(id) { return d.getElementById(id); }
  function setText(el, s) { if (typeof el === 'string') { el = byId(el); } if (el) { el.textContent = s; } return el; }
  function on(el, ev, fn) { if (el) { el.addEventListener(ev, fn, false); } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(s) { return String(s == null ? '' : s).replace(/[⁦-⁩‎‏]/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function addClass(el, c) { if (el && el.classList) { el.classList.add(c); } }
  function removeClass(el, c) { if (el && el.classList) { el.classList.remove(c); } }
  function nameAr() { return clean(T.nameAr) || 'ماديكس نت'; }

  var ICON = (function () {
    function s(p) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>'; }
    return {
      clock: s('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
      database: s('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'),
      zap: s('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'),
      gauge: s('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
      calendar: s('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
      pin: s('<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
      home: s('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
      store: s('<path d="m2 7 4.4-4.4A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.6-.6.7.7 0 0 0-.8 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.6-.6.7.7 0 0 0-.8 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.6-.6.7.7 0 0 0-.8 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.6-.6.7.7 0 0 0-.8 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>'),
      badge: s('<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76z"/><path d="m9 12 2 2 4-4"/>'),
      wifiOff: s('<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.43"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>'),
      tag: s('<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>'),
      refresh: s('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
      alert: s('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
      wa: s('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M8.6 9.6c.3 1.6 1.9 3.6 3.8 4.4.5.2 1 .1 1.3-.3l.5-.6a.5.5 0 0 1 .6-.1l1.4.7a.5.5 0 0 1 .2.7c-.6 1-1.7 1.5-2.9 1.2-2.6-.7-4.9-3-5.5-5.6-.3-1.2.2-2.3 1.2-2.9a.5.5 0 0 1 .7.2l.7 1.4a.5.5 0 0 1-.1.6l-.6.5"/>')
    };
  })();

  // ------------------------------------------------------------------ تنسيق الوقت والبيانات
  var DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

  function time12(t, withSeconds) {
    var h = t.getHours();
    return (h % 12 || 12) + ':' + pad(t.getMinutes()) + (withSeconds ? ':' + pad(t.getSeconds()) : '') + ' ' + (h < 12 ? 'ص' : 'م');
  }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
  }
  function fmtDate(s) {
    var t = parseDate(s);
    return t ? t.getDate() + ' ' + MONTHS[t.getMonth()] + '، ' + time12(t, false) : '';
  }
  function fmtDur(s) {
    s = Math.max(0, Math.floor(+s || 0));
    var dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    if (dd) { return dd + ' يوم ' + h + 'س'; }
    if (h) { return h + 'س ' + pad(m) + 'د ' + pad(x) + 'ث'; }
    if (m) { return m + 'د ' + pad(x) + 'ث'; }
    return x + 'ث';
  }
  function fmtBytes(b) {
    b = +b || 0;
    if (b <= 0) { return '0 B'; }
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b = b / 1024; i++; }
    var n = i === 0 ? Math.round(b) : (b >= 100 ? Math.round(b) : Math.round(b * 10) / 10);
    return n + ' ' + u[i];
  }
  function secondsWord(n) {
    if (n <= 0) { return 'الآن'; }
    if (n === 1) { return 'ثانية واحدة'; }
    if (n === 2) { return 'ثانيتان'; }
    if (n <= 10) { return n + ' ثوانٍ'; }
    return n + ' ثانية';
  }
  function arRate(r) {
    return clean(r).replace(/\s*Gbps/i, ' جيجا').replace(/\s*Mbps/i, ' ميجا').replace(/\s*Kbps/i, ' كيلو').replace(/\s*bps/i, ' بت');
  }
  function fmtPrice(p) {
    var n = Math.round((+p || 0) * 100) / 100;
    return (n % 1 === 0) ? String(n) : n.toFixed(2).replace(/0$/, '');
  }
  var CUR = { '₪': 'شيكل', 'ILS': 'شيكل', 'NIS': 'شيكل', 'شيكل': 'شيكل', '$': 'دولار', 'USD': 'دولار', 'JOD': 'دينار', 'JD': 'دينار', 'د.أ': 'دينار', '€': 'يورو', 'EUR': 'يورو', 'EGP': 'جنيه', 'ج.م': 'جنيه', 'SAR': 'ريال', 'ر.س': 'ريال' };
  function curWord(c) { c = clean(c); return CUR[c] || CUR[c.toUpperCase()] || c || 'شيكل'; }

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, f) {
    var c = hexRgb(h), out = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(f < 0 ? c[i] * (1 + f) : c[i] + (255 - c[i]) * f); out += pad16(Math.max(0, Math.min(255, v))); }
    return out;
  }
  function pad16(v) { var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
  function lum(h) {
    var c = hexRgb(h);
    for (var i = 0; i < 3; i++) { var v = c[i] / 255; c[i] = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  // ------------------------------------------------------------------ الهوية والإعدادات
  function applyTheme() {
    var root = d.documentElement;
    if (T.appearance === 'auto') { root.removeAttribute('data-theme'); }
    else if (T.appearance === 'dark') { root.setAttribute('data-theme', 'dark'); }

    var name = clean(T.name) || 'Madix Net', sp = name.indexOf(' ');
    var map = {
      brand: clean(T.brand), nameAr: clean(T.nameAr), tagline: clean(T.tagline), about: clean(T.about),
      word1: sp > 0 ? name.slice(0, sp) : name, word2: sp > 0 ? name.slice(sp + 1) : ''
    };
    var els = d.querySelectorAll('[data-bind]');
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute('data-bind');
      if (typeof map[k] === 'string' && (map[k] !== '' || k === 'word2')) { els[i].textContent = map[k]; }
    }
    var tip = byId('tip');
    if (tip) {
      if (T.tip === null || T.tip === false) { tip.hidden = true; }
      else if (T.tip) {
        var parts = tip.querySelectorAll('[data-tip]');
        for (var j = 0; j < parts.length; j++) {
          var v = clean(T.tip[parts[j].getAttribute('data-tip')]);
          if (v) { parts[j].textContent = v; } else if (parts[j].tagName === 'EM') { parts[j].hidden = true; }
        }
      }
    }
  }

  // بيانات التواصل: من النظام أولاً ثم من الإعدادات
  function cachedInfo() {
    if (!LS) { return null; }
    try { var o = JSON.parse(LS.getItem('mx_info') || 'null'); return o && o.ok ? o : null; } catch (e) { return null; }
  }
  function saveInfo(o) { if (LS && o) { try { LS.setItem('mx_info', JSON.stringify(o)); } catch (e) {} } }
  function contact(info) {
    info = info || cachedInfo() || {};
    if (DEMO && !info.phone) { info = DEMO_INFO; }
    return { phone: clean(info.phone || T.phone || ''), whatsapp: clean(info.whatsapp || T.whatsapp || '') };
  }
  function telHref(p) { return 'tel:' + String(p).replace(/[^\d+]/g, ''); }
  function waHref(p) {
    var n = String(p).replace(/[^\d+]/g, '');
    if (n.charAt(0) === '+') { n = n.slice(1); }
    else if (n.indexOf('00') === 0) { n = n.slice(2); }
    else if (n.charAt(0) === '0') { n = (clean(T.countryCode) || '970') + n.slice(1); }
    return 'https://wa.me/' + n;
  }
  function applyContact(info) {
    var c = contact(info);
    var boxes = d.querySelectorAll('[data-phone]');
    for (var i = 0; i < boxes.length; i++) {
      if (c.phone) {
        boxes[i].hidden = false;
        var num = boxes[i].querySelector('[data-phone-num]');
        if (num) { num.textContent = c.phone; }
        if (boxes[i].tagName === 'A') { boxes[i].href = telHref(c.phone); }
      } else { boxes[i].hidden = true; }
    }
    var row = byId('support-row');
    if (row) {
      row.hidden = !c.phone;
      setText('support-phone', c.phone);
      var call = byId('support-call');
      if (call) { call.href = telHref(c.phone); }
    }
    var wa = byId('support-wa');
    if (wa) { wa.hidden = !c.whatsapp; if (c.whatsapp) { wa.href = waHref(c.whatsapp); } }
  }

  // ------------------------------------------------------------------ الساعة
  function clock() {
    var el = byId('clock');
    if (!el) { return; }
    function tick() {
      var t = new Date();
      el.textContent = DAYS[t.getDay()] + '، ' + t.getDate() + ' ' + MONTHS[t.getMonth()] + ' ' + t.getFullYear() + '  |  ' + time12(t, true);
    }
    tick();
    setInterval(tick, 1000);
  }

  // ------------------------------------------------------------------ شريط الإعلانات
  function ticker() {
    var box = byId('ticker'), track = byId('ticker-track');
    if (!box || !track) { return; }
    var items = T.ticker;
    if (items && typeof items.length === 'number') {
      if (!items.length) { box.hidden = true; return; }
      var html = '';
      for (var i = 0; i < items.length; i++) {
        html += (i ? '<i class="sep" aria-hidden="true"></i>' : '') + '<span>' + esc(items[i]) + '</span>';
      }
      track.innerHTML = html;
    }
    if (reduce) { addClass(box, 'is-static'); return; }
    var view = track.parentNode, style = d.createElement('style');
    d.getElementsByTagName('head')[0].appendChild(style);
    function run() {
      var vw = view.offsetWidth, tw = track.scrollWidth;
      if (!vw || !tw) { return; }
      var dur = Math.max(14, (vw + tw) / 38);
      // يبدأ والنص ظاهر من جهة اليمين بدل أن يبدأ الشريط فارغاً
      var delay = -(dur * 0.92 * vw / (vw + tw));
      var anim = 'mxTicker ' + dur.toFixed(1) + 's linear ' + delay.toFixed(1) + 's infinite';
      style.textContent = '@keyframes mxTicker{from{transform:translateX(-' + tw + 'px)}to{transform:translateX(' + vw + 'px)}}' +
        '@-webkit-keyframes mxTicker{from{-webkit-transform:translateX(-' + tw + 'px)}to{-webkit-transform:translateX(' + vw + 'px)}}';
      track.style.webkitAnimation = anim;
      track.style.animation = anim;
    }
    run();
    if (d.fonts && d.fonts.ready && d.fonts.ready.then) { d.fonts.ready.then(run); }
    var rt;
    on(w, 'resize', function () { clearTimeout(rt); rt = setTimeout(run, 250); });
  }

  // ------------------------------------------------------------------ جودة الاتصال (زمن الاستجابة مع نقطة الاتصال)
  function quality() {
    var box = byId('quality');
    if (!box) { return; }
    function show(ms) {
      var lvl, label;
      if (ms == null) { lvl = 0; label = 'غير متاح'; }
      else if (ms < 80) { lvl = 4; label = 'ممتاز'; }
      else if (ms < 180) { lvl = 3; label = 'جيد جداً'; }
      else if (ms < 400) { lvl = 2; label = 'متوسط'; }
      else { lvl = 1; label = 'ضعيف'; }
      box.className = 'q q-' + lvl;
      setText('q-label', label);
      setText('q-ms', ms == null ? '' : '(' + ms + 'ms)');
      var bars = box.querySelectorAll('.bars i');
      for (var i = 0; i < bars.length; i++) { bars[i].className = i < lvl ? 'on' : ''; }
    }
    if (DEMO) { show(18 + Math.floor(Math.random() * 30)); return; }
    var url = 'img/madix-logo.svg', best = null, n = 0;
    function now() { return w.performance && w.performance.now ? w.performance.now() : +new Date(); }
    function one() {
      var x = new XMLHttpRequest(), t0 = now(), done = false, timer;
      function finish(ms) {
        if (done) { return; }
        done = true;
        clearTimeout(timer);
        if (ms != null && (best == null || ms < best)) { best = ms; }
        n++;
        if (n < 3) { setTimeout(one, 120); } else { show(best == null ? null : Math.max(1, Math.round(best))); }
      }
      timer = setTimeout(function () { finish(null); try { x.abort(); } catch (e) {} }, 3000);
      x.onreadystatechange = function () {
        if (x.readyState === 4) { finish(x.status >= 200 && x.status < 400 ? now() - t0 : null); }
      };
      try { x.open('GET', url + '?p=' + (+new Date()) + n, true); x.send(); } catch (e) { finish(null); }
    }
    one();
  }

  // ------------------------------------------------------------------ النوافذ السفلية
  var openSheet = null, lastFocus = null;
  function sheetOpen(id) {
    var el = byId(id);
    if (!el || openSheet === el) { return; }
    if (openSheet) { sheetClose(true); }
    lastFocus = d.activeElement;
    el.hidden = false;
    void el.offsetWidth;
    addClass(el, 'is-open');
    addClass(d.documentElement, 'lock');
    openSheet = el;
    var panel = el.querySelector('.sheet-panel');
    if (panel) {
      panel.setAttribute('tabindex', '-1');
      setTimeout(function () { try { panel.focus(); } catch (e) {} }, 60);
    }
    if (id === 'sheet-prices') { getInfo(renderPrices); }
  }
  function sheetClose(instant) {
    var el = openSheet;
    if (!el) { return; }
    openSheet = null;
    removeClass(el, 'is-open');
    removeClass(d.documentElement, 'lock');
    var panel = el.querySelector('.sheet-panel');
    if (panel) { panel.style.transform = ''; }
    setTimeout(function () { if (!el.classList.contains('is-open')) { el.hidden = true; } }, (instant || reduce) ? 0 : 340);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function sheets() {
    var i, openers = d.querySelectorAll('[data-open]'), closers = d.querySelectorAll('[data-close]');
    for (i = 0; i < openers.length; i++) {
      on(openers[i], 'click', function (e) { e.preventDefault(); sheetOpen(this.getAttribute('data-open')); });
    }
    for (i = 0; i < closers.length; i++) {
      on(closers[i], 'click', function (e) { e.preventDefault(); sheetClose(); });
    }
    on(d, 'keydown', function (e) { if (openSheet && (e.key === 'Escape' || e.keyCode === 27)) { sheetClose(); } });
    // السحب للأسفل لإغلاق النافذة
    var heads = d.querySelectorAll('.sheet-head');
    for (i = 0; i < heads.length; i++) { swipe(heads[i]); }
    var h = String(w.location.hash || '').replace('#', '');
    if (h === 'prices') { sheetOpen('sheet-prices'); }
    if (h === 'points') { sheetOpen('sheet-points'); }
  }
  function swipe(head) {
    var y0 = null, dy = 0, panel = head.parentNode;
    on(head, 'touchstart', function (e) { y0 = e.touches[0].clientY; dy = 0; panel.style.transition = 'none'; });
    on(head, 'touchmove', function (e) {
      if (y0 == null) { return; }
      dy = Math.max(0, e.touches[0].clientY - y0);
      panel.style.transform = 'translateY(' + dy + 'px)';
    });
    on(head, 'touchend', function () {
      panel.style.transition = '';
      if (dy > 90) { sheetClose(); } else { panel.style.transform = ''; }
      y0 = null;
    });
  }

  // ------------------------------------------------------------------ الأسعار من النظام
  var infoState = 0, infoData = null, infoWait = [];
  function getInfo(cb) {
    if (infoState === 2) { cb(infoData); return; }
    infoWait.push(cb);
    if (infoState === 1) { return; }
    infoState = 1;
    function done(res) {
      infoState = 2;
      infoData = res;
      if (res && !DEMO) { saveInfo({ ok: true, phone: res.phone || '', whatsapp: res.whatsapp || '', currency: res.currency || '' }); }
      var list = infoWait;
      infoWait = [];
      for (var i = 0; i < list.length; i++) { list[i](res); }
    }
    if (DEMO) { setTimeout(function () { done(DEMO_INFO); }, 600); return; }
    if (!w.SNHotspot || !w.SNHotspot.info) { done(null); return; }
    w.SNHotspot.info(function (res) { done(res && res.ok ? res : null); });
  }
  function emptyState(icon, title, text, retry) {
    return '<div class="empty"><span class="tile">' + icon + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' +
      (retry ? '<button class="btn btn-soft" type="button" id="prices-retry">' + ICON.refresh + '<span>إعادة المحاولة</span></button>' : '') + '</div>';
  }
  function ticketHtml(c, cur) {
    var time = clean(c.time), data = clean(c.data), validity = clean(c.validity), speed = clean(c.speed);
    var tLim = time && time !== 'غير محدود', dLim = data && data !== 'غير محدود', vLim = validity && validity !== 'غير محدود';
    var desc;
    if (tLim && dLim) { desc = 'مدة استخدام ' + time + ' مع ' + data + ' من البيانات.'; }
    else if (tLim) { desc = 'مدة استخدام ' + time + ' بدون حد للبيانات.'; }
    else if (dLim) { desc = 'رصيد ' + data + ' من البيانات بدون حد للوقت.'; }
    else { desc = 'استخدام مفتوح بدون حدود للوقت أو البيانات.'; }
    var down = speed.split('/')[0];
    var speedTxt = (speed && speed !== 'غير محدودة' && down.indexOf('∞') === -1) ? 'سرعة ' + arRate(down) : 'سرعة مفتوحة';
    var icon = tLim ? ICON.clock : (dLim ? ICON.database : ICON.zap);
    var color = /^#[0-9a-f]{6}$/i.test(String(c.color || '')) ? c.color : '#0240f8';
    var light = lum(color) > 0.55;
    var bg = 'background:' + color + ';background:linear-gradient(160deg,' + shade(color, 0.08) + ',' + shade(color, -0.3) + ')';
    return '<article class="ticket">' +
      '<div class="ticket-price' + (light ? ' is-light' : '') + '" style="' + bg + '">' +
        '<span class="ticket-num">' + esc(fmtPrice(c.price)) + '</span><span class="ticket-cur">' + esc(cur) + '</span></div>' +
      '<div class="ticket-body"><h3 class="ticket-title">' + icon + '<span>' + esc(c.name) + '</span></h3>' +
        '<p class="ticket-desc">' + esc(desc) + '</p>' +
        '<div class="chips"><span class="chip">' + ICON.gauge + esc(speedTxt) + '</span>' +
        '<span class="chip ok">' + ICON.calendar + esc(vLim ? 'صلاحية ' + validity : 'صلاحية مفتوحة') + '</span></div></div>' +
      '</article>';
  }
  function renderPrices(res) {
    var box = byId('prices');
    if (!box) { return; }
    var foot = '<p class="sheet-note">' + esc(clean(T.tagline) || 'شبكة ماديكس نت لخدمات الإنترنت') + ' - ' + esc(clean(T.brand) || 'MADIX NET') + '</p>';
    if (!res) {
      box.innerHTML = emptyState(ICON.wifiOff, 'تعذّر تحميل الأسعار الآن', 'تأكد من اتصالك بشبكة ' + nameAr() + ' ثم أعد المحاولة.', true) + foot;
      on(byId('prices-retry'), 'click', function () {
        infoState = 0;
        box.innerHTML = '<div class="skel"></div><div class="skel"></div>';
        getInfo(renderPrices);
      });
      return;
    }
    var cats = res.categories || [];
    if (!cats.length) {
      box.innerHTML = emptyState(ICON.tag, 'لا توجد باقات معروضة حالياً', 'تواصل معنا لمعرفة الباقات المتاحة وأسعارها.') + foot;
      return;
    }
    var cur = curWord(res.currency), html = DEMO ? '<p class="demo-note">بيانات توضيحية للمعاينة</p>' : '';
    for (var i = 0; i < cats.length; i++) { html += ticketHtml(cats[i], cur); }
    box.innerHTML = html + foot;
  }

  // ------------------------------------------------------------------ نقاط البيع
  function renderPoints() {
    var box = byId('points');
    if (!box) { return; }
    var pts = T.points || [], html = '';
    if (!pts.length) {
      box.innerHTML = emptyState(ICON.store, 'نقاط البيع قريباً', 'تواصل مع الدعم الفني لمعرفة أماكن بيع الكروت.');
      return;
    }
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i] || {}, tel = clean(p.phone);
      var open = tel ? '<a class="point" href="' + esc(telHref(tel)) + '">' : '<div class="point">';
      html += open + '<span class="tile">' + (i === 0 ? ICON.home : ICON.store) + '</span>' +
        '<span class="point-meta"><span class="point-name">' + esc(p.name) + '</span>' +
        (p.address ? '<span class="point-addr">' + ICON.pin + '<span>' + esc(p.address) + '</span></span>' : '') + '</span>' +
        '<span class="badge">' + ICON.badge + '</span>' + (tel ? '</a>' : '</div>');
    }
    box.innerHTML = html;
  }

  // ------------------------------------------------------------------ عدّاد التحويل
  function countdown(total, url, auto) {
    var bar = byId('bar'), left = Math.max(1, Math.round(+total || 4));
    setText('count', secondsWord(left));
    if (bar) {
      bar.style.transitionDuration = left + 's';
      setTimeout(function () { bar.style.width = '100%'; }, 60);
    }
    var t = setInterval(function () {
      left--;
      setText('count', secondsWord(left));
      if (left <= 0) {
        clearInterval(t);
        if (auto && url) { w.location.href = url; }
      }
    }, 1000);
  }

  // ------------------------------------------------------------------ صفحة الدخول
  function loginPage() {
    var form = byId('form'), code = byId('code'), pass = byId('password'), msg = byId('message'), btn = byId('submit');
    if (!form || !code) { return; }
    var label = btn ? btn.innerHTML : '';

    function show(text, kind) {
      if (!msg) { return; }
      msg.className = 'alert' + (kind === 'info' ? ' is-info' : '');
      msg.innerHTML = ICON.alert + '<span>' + esc(text) + '</span>';
      msg.hidden = false;
    }
    function hide() { if (msg) { msg.hidden = true; } }
    function invalid(input) {
      var f = input.parentNode;
      addClass(f, 'is-invalid');
      removeClass(f, 'shake');
      void f.offsetWidth;
      addClass(f, 'shake');
      try { input.focus(); } catch (e) {}
    }
    function busy(on) {
      if (!btn) { return; }
      btn.disabled = !!on;
      if (on) { addClass(btn, 'is-busy'); btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>جاري التحقق...</span>'; }
      else { removeClass(btn, 'is-busy'); btn.innerHTML = label; }
    }

    // تعبئة اسم المستخدم من الراوتر أو من آخر دخول
    var u = val('username');
    if (!u && LS && !DEMO) { try { u = LS.getItem('mx_user') || ''; } catch (e) {} }
    if (u) { code.value = u; }
    if (val('error')) { show(val('error')); }

    on(code, 'input', function () { removeClass(code.parentNode, 'is-invalid'); hide(); });
    on(pass, 'input', function () { removeClass(pass.parentNode, 'is-invalid'); });

    var eye = byId('eye');
    on(eye, 'click', function () {
      var shown = pass.type === 'password';
      pass.type = shown ? 'text' : 'password';
      if (shown) { addClass(eye, 'is-on'); } else { removeClass(eye, 'is-on'); }
      eye.setAttribute('aria-pressed', shown ? 'true' : 'false');
      eye.setAttribute('aria-label', shown ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    });

    // الدخول المجاني (التجربة) إذا كان مفعّلاً على نقطة الاتصال
    var trial = byId('trial');
    if (trial && val('trial') === 'yes') {
      var base = val('linkLogin');
      trial.href = DEMO ? 'alogin.html' : base + (base.indexOf('?') === -1 ? '?' : '&') + 'dst=' + encodeURIComponent(val('linkOrig')) + '&username=' + encodeURIComponent('T-' + val('mac'));
      trial.hidden = false;
    }

    function direct(user, pw) {
      // بدون مكتبة الربط: الدخول مباشرة عبر جهاز MikroTik
      var p = pw || user, chapId = val('chapId'), ch = val('chapChallenge');
      var hashed = (chapId && typeof w.hexMD5 === 'function') ? w.hexMD5(chapId + p + ch) : p;
      var f = d.createElement('form');
      f.method = 'post';
      f.action = val('linkLogin');
      f.style.display = 'none';
      var fields = { username: user, password: hashed, dst: val('linkOrig'), popup: 'true' };
      for (var k in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, k)) {
          var inp = d.createElement('input');
          inp.type = 'hidden';
          inp.name = k;
          inp.value = fields[k];
          f.appendChild(inp);
        }
      }
      d.body.appendChild(f);
      f.submit();
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      hide();
      var user = clean(code.value), pw = pass ? pass.value.replace(/^\s+|\s+$/g, '') : '';
      if (!user) { show('أدخل اسم المستخدم أو رقم الكرت.'); invalid(code); return; }
      if (LS) { try { LS.setItem('mx_user', user); } catch (e2) {} }
      if (DEMO) {
        busy(true);
        setTimeout(function () {
          if (user === '0') { busy(false); show('رقم الكرت غير صحيح.'); invalid(code); }
          else { w.location.href = 'alogin.html'; }
        }, 900);
        return;
      }
      if (w.SNHotspot && w.SNHotspot.login) {
        w.SNHotspot.login({
          code: user,
          password: pw,
          linkLogin: val('linkLogin'),
          linkOrig: val('linkOrig'),
          chapId: val('chapId'),
          chapChallenge: val('chapChallenge'),
          mac: val('mac'),
          ip: val('ip'),
          onLoading: busy,
          onError: function (err) {
            busy(false);
            show((err && err.message) || 'تعذّر الدخول. حاول مجدداً.');
            if (err && err.needPassword) { invalid(pass); } else if (err && err.code !== 'unavailable') { invalid(code); }
          }
        });
        return;
      }
      busy(true);
      direct(user, pw);
    });

    // تحميل الأسعار وبيانات التواصل مسبقاً
    getInfo(function (res) { renderPrices(res); applyContact(res); });
  }

  // ------------------------------------------------------------------ صفحة نجاح الدخول
  function aloginPage() {
    var target = DEMO ? 'status.html' : (val('linkRedirect') || val('linkStatus'));
    var go = byId('go'), st = byId('to-status');
    if (go) { go.href = target || '#'; }
    if (st) { if (val('linkStatus') || DEMO) { st.href = DEMO ? 'status.html' : val('linkStatus'); } else { st.hidden = true; } }
    if (val('username')) { setText('who-name', val('username')); var who = byId('who'); if (who) { who.hidden = false; } }
    countdown(T.redirectSeconds || 4, target, !DEMO && !!target);
  }

  // ------------------------------------------------------------------ صفحة الحالة
  function statusPage() {
    setText('s-user', val('username') || '—');
    setText('s-ip', val('ip') || '—');
    setText('s-mac', val('mac') || '—');
    setText('s-down', fmtBytes(val('bytesOut')));
    setText('s-up', fmtBytes(val('bytesIn')));
    if (val('loginBy') === 'trial') { setText('s-sub', 'دخول تجريبي مجاني'); var sub = byId('s-sub'); if (sub) { sub.hidden = false; } }

    var up = Math.max(0, +val('uptimeSecs') || 0);
    var left = +val('timeLeftSecs') || 0;
    if (!(left > 0)) { left = null; }
    var rows = {};

    function render() {
      setText('s-uptime', fmtDur(up));
      setText('s-left', left == null ? 'غير محدود' : fmtDur(left));
    }
    render();
    setInterval(function () { up++; if (left != null && left > 0) { left--; } render(); }, 1000);

    var remain = val('remainBytes');
    if (remain !== '' && +remain >= 0) { rows.data = fmtBytes(remain); }

    function planCard() {
      var box = byId('s-plan');
      if (!box) { return; }
      var list = [
        ['tag', 'الباقة', rows.plan], ['database', 'البيانات المتبقية', rows.data],
        ['gauge', 'السرعة', rows.speed], ['calendar', 'الصلاحية حتى', rows.expires]
      ], html = '';
      for (var i = 0; i < list.length; i++) {
        if (list[i][2]) { html += '<div class="plan-row"><span>' + ICON[list[i][0]] + esc(list[i][1]) + '</span><b>' + esc(list[i][2]) + '</b></div>'; }
      }
      box.innerHTML = html;
      box.hidden = !html;
    }
    function applyStatus(res) {
      if (!res || !res.ok || !res.info) { return; }
      var i = res.info;
      if (res.type === 'subscriber') {
        if (i.name) { setText('s-sub', clean(i.name)); var sub2 = byId('s-sub'); if (sub2) { sub2.hidden = false; } }
        if (i.plan) { rows.plan = clean(i.plan); }
      } else if (i.category) { rows.plan = clean(i.category); }
      if (i.remaining_data != null) { rows.data = fmtBytes(i.remaining_data); }
      if (i.speed && i.speed !== 'غير محدودة') { rows.speed = arRate(String(i.speed).split('/')[0]); }
      if (i.expires_at) { rows.expires = fmtDate(i.expires_at); }
      if (left == null && i.remaining_time != null && +i.remaining_time > 0) { left = +i.remaining_time; render(); }
      planCard();
    }
    planCard();
    if (DEMO) {
      applyStatus({ ok: true, type: 'card', info: { category: 'كرت 10 ساعات', remaining_time: 35672, remaining_data: null, speed: '4 Mbps / 1 Mbps', expires_at: '2026-11-21 09:40:00' } });
    } else if (w.SNHotspot && w.SNHotspot.status) {
      w.SNHotspot.status({ username: val('username'), mac: val('mac'), onResult: applyStatus });
    }

    var refresh = byId('refresh');
    on(refresh, 'click', function () {
      addClass(refresh, 'is-spinning');
      if (DEMO) { setTimeout(function () { removeClass(refresh, 'is-spinning'); }, 900); return; }
      w.location.reload();
    });
    var out = byId('logout');
    if (out) {
      var link = DEMO ? 'logout.html' : val('linkLogout');
      if (link) { out.href = DEMO ? link : link + (link.indexOf('?') === -1 ? '?' : '&') + 'erase-cookie=on'; }
    }
    var secs = +val('refreshSecs') || 0;
    if (!DEMO && secs > 0) { setTimeout(function () { w.location.reload(); }, Math.max(30, secs) * 1000); }
  }

  // ------------------------------------------------------------------ صفحة الخروج
  function logoutPage() {
    var hasData = val('uptimeSecs') !== '' || val('bytesOut') !== '';
    if (hasData) {
      setText('o-time', fmtDur(val('uptimeSecs')));
      setText('o-down', fmtBytes(val('bytesOut')));
      setText('o-up', fmtBytes(val('bytesIn')));
      var sum = byId('sum');
      if (sum) { sum.hidden = false; }
    }
    var target = DEMO ? 'login.html' : (val('linkLogin') || val('linkLoginOnly'));
    var again = byId('again');
    if (again && target) { again.href = target; }
    countdown(T.logoutSeconds || 6, target, !DEMO && !!target);
  }

  // ------------------------------------------------------------------ صفحة الخطأ
  function errorPage() {
    setText('e-text', val('error') || 'حدث خطأ غير متوقع. حاول مرة أخرى.');
    var back = byId('back'), target = DEMO ? 'login.html' : (val('linkLoginOnly') || val('linkLogin'));
    if (back && target) { back.href = target; }
    var c = contact(null), call = byId('e-call');
    if (call && c.phone) { call.href = telHref(c.phone); call.hidden = false; }
  }

  // ------------------------------------------------------------------ شريط المعاينة (خارج الراوتر فقط)
  function previewNav() {
    if (!DEMO || FRAMED) { return; }
    var pages = [['login.html', 'الدخول', 'login'], ['alogin.html', 'النجاح', 'alogin'], ['status.html', 'الحالة', 'status'], ['logout.html', 'الخروج', 'logout'], ['error.html', 'الخطأ', 'error']];
    var nav = d.createElement('nav'), html = '<span>معاينة</span>';
    nav.className = 'pv';
    nav.setAttribute('aria-label', 'التنقل بين صفحات المعاينة');
    for (var i = 0; i < pages.length; i++) {
      html += '<a href="' + pages[i][0] + '"' + (pages[i][2] === page ? ' aria-current="page"' : '') + '>' + pages[i][1] + '</a>';
    }
    nav.innerHTML = html;
    d.body.appendChild(nav);
    addClass(d.body, 'has-pv');
  }

  // ------------------------------------------------------------------ التشغيل
  applyTheme();
  clock();
  ticker();
  quality();
  sheets();
  renderPoints();
  applyContact(null);
  if (page === 'login') { loginPage(); }
  else if (page === 'alogin') { aloginPage(); }
  else if (page === 'status') { statusPage(); }
  else if (page === 'logout') { logoutPage(); }
  else if (page === 'error') { errorPage(); }
  previewNav();
})(window, document);
