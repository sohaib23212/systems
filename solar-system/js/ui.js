/* ============================================================================
 *  ui.js — الواجهة العربية (RTL)
 *  ---------------------------------------------------------------------------
 *  قائمة الأجرام، بطاقة المعلومات (مع قيم حيّة)، التحكم بالوقت، الإعدادات،
 *  الأسماء فوق الأجرام (مع منع التزاحم والإخفاء خلف الأجرام)، لوحة المفاتيح.
 * ========================================================================== */
import { DATA, BODY_GROUPS, BODY_ORDER, QUALITY_PRESETS, TIME_SPEEDS, CREDITS_AR, CONSTANTS } from './data.js';
import * as astro from './astro.js';

const $ = (id) => document.getElementById(id);
const AU = CONSTANTS.AU_KM;
const fmtN = (v, d = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');

export function fmtKm(km) {
  const a = Math.abs(km);
  if (a >= 1e9) return `${fmtN(km / 1e9, 3)} مليار كم`;
  if (a >= 1e6) return `${fmtN(km / 1e6, a >= 1e8 ? 1 : 2)} مليون كم`;
  if (a >= 100) return `${fmtN(km, 0)} كم`;
  if (a >= 1) return `${fmtN(km, 1)} كم`;
  return `${fmtN(km * 1000, 0)} م`;
}
function fmtHours(h) {
  const a = Math.abs(h);
  if (a < 48) return `${fmtN(a, 2)} ساعة`;
  const days = a / 24;
  if (days < 730) return `${fmtN(days, days < 10 ? 2 : 1)} يوم`;
  return `${fmtN(days / 365.25, 2)} سنة`;
}
function fmtDays(d) {
  const a = Math.abs(d);
  if (a < 2) return `${fmtN(a * 24, 1)} ساعة`;
  if (a < 730) return `${fmtN(a, a < 30 ? 3 : 1)} يوم`;
  return `${fmtN(a / 365.25, 2)} سنة <small>(${fmtN(a, 0)} يوم)</small>`;
}
function fmtMass(e24) {
  const kg = e24 * 1e24;
  const e = Math.floor(Math.log10(kg));
  const m = kg / Math.pow(10, e);
  return `${fmtN(m, 3)} × 10${sup(e)} كغ`;
}
const retro = '<span class="badge-retro">عكسي</span>';

export class UI {
  constructor(app) {
    this.app = app;
    this.labelsOn = true;
    this.lastLive = 0;
    this.dateFmt = new Intl.DateTimeFormat('ar', {
      calendar: 'gregory', numberingSystem: 'latn', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    this.prefs = this._loadPrefs();
  }

  /* --------------------------------------------------------- تفضيلات محفوظة */
  _loadPrefs() {
    try { return JSON.parse(localStorage.getItem('solar-prefs') || '{}'); } catch (e) { return {}; }
  }
  savePrefs(patch) {
    Object.assign(this.prefs, patch);
    try { localStorage.setItem('solar-prefs', JSON.stringify(this.prefs)); } catch (e) { /* تخزين غير متاح */ }
  }

  /* --------------------------------------------------------- البناء */
  init() {
    const app = this.app;
    // التوقيع والنسب
    $('credits').innerHTML = CREDITS_AR.replace(/([A-Za-z][A-Za-z .\/()0-9\-]*[A-Za-z0-9)])/g, '<span lang="en">$1</span>');

    // قائمة الأجرام
    const list = $('bodyList');
    for (const g of BODY_GROUPS) {
      const t = document.createElement('div');
      t.className = 'group-title';
      t.textContent = g.titleAr;
      list.appendChild(t);
      for (const id of g.ids) {
        const d = DATA[id];
        const b = document.createElement('button');
        b.className = `body-btn ${d.type}`;
        b.dataset.id = id;
        b.style.setProperty('--c', d.color);
        b.innerHTML = `<span class="swatch"></span><span class="ar">${d.nameAr}</span><span class="en-name" lang="en">${d.nameEn}</span>`;
        b.addEventListener('click', () => { app.select(id); if (this.isMobile()) this.toggleBodies(false); });
        list.appendChild(b);
      }
    }
    $('bodiesToggle').addEventListener('click', () => $('bodiesPanel').classList.toggle('collapsed'));
    $('bodiesFab').addEventListener('click', () => this.toggleBodies());

    // سرعات الوقت
    const sp = $('speedBtns');
    for (const s of TIME_SPEEDS) {
      const b = document.createElement('button');
      b.className = 'tbtn';
      b.dataset.rate = s.rate;
      b.setAttribute('role', 'radio');
      b.textContent = s.labelAr;
      b.addEventListener('click', () => app.setRate(s.rate));
      sp.appendChild(b);
    }
    $('btnPlay').addEventListener('click', () => app.togglePlay());
    $('btnReverse').addEventListener('click', () => app.toggleReverse());
    $('btnNow').addEventListener('click', () => app.goNow());
    $('btnGo').addEventListener('click', () => this._jumpDate());
    $('dateInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._jumpDate(); });
    $('dateInput').addEventListener('focus', () => { this.dateEditing = true; });
    $('dateInput').addEventListener('blur', () => { this.dateEditing = false; });

    // الشريط العلوي
    $('btnScale').addEventListener('click', () => app.toggleScale());
    $('btnLabels').addEventListener('click', () => this.setLabels(!this.labelsOn));
    $('btnOrbits').addEventListener('click', () => app.setOrbits(!app.orbitsOn));
    $('btnFollow').addEventListener('click', () => app.setFollow(!app.rig.tracking));
    $('btnOverview').addEventListener('click', () => app.overview());
    $('btnSettings').addEventListener('click', () => this.openModal('settings'));
    $('btnHelp').addEventListener('click', () => this.openModal('help'));
    $('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());
    $('zoomIn').addEventListener('click', () => app.rig.zoom(0.55));
    $('zoomOut').addEventListener('click', () => app.rig.zoom(1.8));
    $('infoClose').addEventListener('click', () => { $('infoCard').classList.add('hidden'); this._cardClosed = true; });
    document.querySelectorAll('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.add('hidden'); });
    });

    // الإعدادات
    const seg = $('qualitySeg');
    for (const key of Object.keys(QUALITY_PRESETS)) {
      const b = document.createElement('button');
      b.dataset.q = key;
      b.textContent = QUALITY_PRESETS[key].nameAr;
      b.addEventListener('click', () => app.setQuality(key));
      seg.appendChild(b);
    }
    const bindRange = (id, valId, fn, fmt) => {
      const el = $(id);
      const upd = () => { $(valId).textContent = fmt(+el.value); fn(+el.value); };
      el.addEventListener('input', upd);
      return (v) => { el.value = v; $(valId).textContent = fmt(v); };
    };
    this.setExposureUI = bindRange('exposure', 'exposureVal', (v) => { app.setExposure(v); this.savePrefs({ exposure: v }); }, (v) => `${Math.round(v * 100)}%`);
    this.setStarsUI = bindRange('starBright', 'starVal', (v) => { app.sky.setIntensity(v); this.savePrefs({ stars: v }); }, (v) => `${Math.round(v * 100)}%`);
    const bindToggle = (id, fn) => $(id).addEventListener('change', (e) => fn(e.target.checked));
    bindToggle('optBloom', (v) => { app.setBloom(v); this.savePrefs({ bloom: v }); });
    bindToggle('optAsteroids', (v) => { app.asteroids.setVisible(v); this.savePrefs({ asteroids: v }); });
    bindToggle('optMoonOrbits', (v) => { app.orbits.setMoonsVisible(v); this.savePrefs({ moonOrbits: v }); });
    bindToggle('optClouds', (v) => { app.setAllClouds(v); this.savePrefs({ clouds: v }); });
    bindToggle('optTilt', (v) => { app.rig.horizonTilt = v; this.savePrefs({ tilt: v }); });
    bindToggle('optFps', (v) => { $('hudFps').classList.toggle('hidden', !v); this.savePrefs({ fps: v }); });

    this._bindKeyboard();
  }

  /** تطبيق التفضيلات المحفوظة بعد التحميل */
  applyPrefs() {
    const p = this.prefs;
    const app = this.app;
    if (p.exposure) { this.setExposureUI(p.exposure); app.setExposure(p.exposure); }
    if (p.stars !== undefined) { this.setStarsUI(p.stars); app.sky.setIntensity(p.stars); } else this.setStarsUI(app.sky.uniforms.uIntensity.value);
    if (!p.exposure) this.setExposureUI(1);
    const setChk = (id, v, fn) => { if (v === undefined) return; $(id).checked = v; fn(v); };
    setChk('optBloom', p.bloom, (v) => app.setBloom(v));
    setChk('optAsteroids', p.asteroids, (v) => app.asteroids.setVisible(v));
    setChk('optMoonOrbits', p.moonOrbits, (v) => app.orbits.setMoonsVisible(v));
    setChk('optClouds', p.clouds, (v) => app.setAllClouds(v));
    setChk('optTilt', p.tilt, (v) => { app.rig.horizonTilt = v; });
    setChk('optFps', p.fps, (v) => $('hudFps').classList.toggle('hidden', !v));
  }

  isMobile() { return window.matchMedia('(max-width: 760px), (max-height: 520px)').matches; }
  toggleBodies(force) {
    const p = $('bodiesPanel');
    const open = force === undefined ? !p.classList.contains('open') : force;
    p.classList.toggle('open', open);
    // على الموبايل: القائمة والبطاقة لا تظهران معاً
    if (this.isMobile()) {
      if (open) $('infoCard').classList.add('hidden');
      else if (this.cardBody && !this._cardClosed) $('infoCard').classList.remove('hidden');
    }
  }
  openModal(id) { $(id).classList.remove('hidden'); }
  closeModals() { document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')); }
  toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => this.toast('ملء الشاشة غير مدعوم في هذا المتصفح'))).call(el);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    }
  }

  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* --------------------------------------------------------- التحميل */
  setLoading(frac, label) {
    const p = Math.max(0, Math.min(100, Math.floor(frac * 100)));
    if (p < (this._lastPct || 0)) return;
    this._lastPct = p;
    $('loaderBar').style.width = `${p}%`;
    $('loaderPct').textContent = p;
    if (label) $('loaderStatus').textContent = label;
  }
  hideLoader() {
    this.setLoading(1, 'جاهز');
    setTimeout(() => $('loader').classList.add('done'), 250);
  }
  fatal(html) {
    const f = $('fatal');
    f.innerHTML = html;
    f.classList.remove('hidden');
  }

  /* --------------------------------------------------------- الحالة */
  setLabels(v) {
    this.labelsOn = v;
    const b = $('btnLabels');
    b.classList.toggle('active', v);
    b.setAttribute('aria-pressed', v);
  }
  syncToolbar() {
    const app = this.app;
    const f = $('btnFollow');
    f.classList.toggle('active', app.rig.tracking);
    f.setAttribute('aria-pressed', app.rig.tracking);
    const o = $('btnOrbits');
    o.classList.toggle('active', app.orbitsOn);
    o.setAttribute('aria-pressed', app.orbitsOn);
    $('btnScale').querySelectorAll('.opt').forEach((e) => e.classList.toggle('on', e.dataset.mode === app.scaleMode));
    $('qualitySeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.q === app.qualityKey));
    const q = QUALITY_PRESETS[app.qualityKey];
    $('qualityHint').textContent = `دقة البكسل حتى ${q.pixelRatio}× · ${fmtN(q.asteroidCount)} كويكب · صور حتى ${q.maxTier === '8k' ? '8K عند الاقتراب' : '2K'} · تنعيم ${q.msaa ? q.msaa + '×' : 'بدون'}`;
    document.querySelectorAll('.body-btn').forEach((b) => b.classList.toggle('active', app.rig.focus && b.dataset.id === app.rig.focus.id));
    const act = document.querySelector('.act[data-act="follow"]');
    if (act) act.classList.toggle('on', app.rig.tracking);
  }
  syncTime() {
    const app = this.app;
    $('btnPlay').classList.toggle('paused', !app.playing);
    $('btnReverse').setAttribute('aria-pressed', app.direction < 0);
    $('speedBtns').querySelectorAll('.tbtn').forEach((b) => b.classList.toggle('on', +b.dataset.rate === app.rate));
  }

  /* --------------------------------------------------------- الوقت */
  updateTime(simJd) {
    const app = this.app;
    const date = new Date(astro.unixMsFromJd(simJd));
    let s;
    try { s = this.dateFmt.format(date); } catch (e) { s = date.toISOString(); }
    $('simDate').textContent = s;
    const sp = TIME_SPEEDS.find((x) => x.rate === app.rate);
    const dir = app.direction < 0 ? '◀ رجوع للخلف' : '▶';
    $('simRate').textContent = app.playing ? `السرعة: ${sp ? sp.labelAr : '×' + app.rate} ${dir}` : '⏸ الزمن متوقف';
    if (!this.dateEditing) {
      const pad = (n, w = 2) => String(n).padStart(w, '0');
      const v = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      const inp = $('dateInput');
      if (inp.value !== v) inp.value = v;
    }
  }
  _jumpDate() {
    const v = $('dateInput').value;
    const d = new Date(v);
    if (!v || isNaN(d.getTime())) { this.toast('التاريخ غير صحيح'); return; }
    const y = d.getFullYear();
    if (y < 1 || y > 3000) { this.toast('اختر تاريخاً بين سنة 1 وسنة 3000'); return; }
    this.app.setDate(astro.jdFromUnixMs(d.getTime()));
    $('dateInput').blur();
    this.toast(`انتقال إلى ${this.dateFmt.format(d)}`);
  }

  /* --------------------------------------------------------- بطاقة المعلومات */
  showInfo(body) {
    this.cardBody = body;
    const d = body.data;
    const f = d.facts || {};
    const rows = [];
    const add = (k, v, live) => rows.push(`<div class="k">${k}</div><div class="v${live ? ' live' : ''}"${live ? ` data-live="${live}"` : ''}>${v}</div>`);
    add('القطر', `${fmtN(f.diameterKm, f.diameterKm < 100 ? 1 : 0)} كم`);
    if (d.type === 'star') {
      add('الكتلة', fmtMass(f.massE24));
      add('الدوران حول نفسه', `${fmtN(f.siderealRotationH / 24, 2)} يوم <small>(عند خط الاستواء)</small>`);
      add('ميل المحور', `${f.obliquityDeg}° <small>عن مستوى البروج</small>`);
      add('الحرارة', f.tempNoteAr);
      add('الجاذبية', `${fmtN(f.gravityMS2, 1)} م/ث²`);
      add('العمر', `${f.ageGyr} مليار سنة`);
      add('البعد عن الأرض', '—', 'earthDist');
    } else if (d.type === 'moon') {
      add('يدور حول', DATA[d.parent].nameAr);
      add('متوسط البعد عن الكوكب', fmtKm(f.parentDistanceKm));
      add('البعد الحالي عن الكوكب', '—', 'parentDist');
      add('مدة الدوران حول الكوكب', `${fmtDays(Math.abs(f.orbitalPeriodD))}${f.orbitalPeriodD < 0 ? ' ' + retro : ''}`);
      add('الدوران حول نفسه', `${fmtHours(f.siderealRotationH)} <small>(متزامن — مقيَّد مدّياً)</small>`);
      add('الانحراف المداري', fmtN(f.eccentricity, 4));
      add('ميل المدار', `${fmtN(f.inclinationDeg, 3)}°`);
      add('الحرارة', `${f.meanTempC}°م <small>${f.tempNoteAr || ''}</small>`);
      add('الكتلة', fmtMass(f.massE24));
      add('الجاذبية', `${fmtN(f.gravityMS2, f.gravityMS2 < 0.1 ? 4 : 2)} م/ث²`);
      add('البعد عن الأرض', '—', 'earthDist');
    } else {
      add('متوسط البعد عن الشمس', `${fmtN(f.distanceMkm, 1)} مليون كم <small>(${fmtN(f.distanceMkm * 1e6 / AU, 3)} و.ف)</small>`);
      add('البعد الحالي عن الشمس', '—', 'sunDist');
      if (body.id !== 'earth') add('البعد الحالي عن الأرض', '—', 'earthDist');
      add('الحضيض / الأوج', `${fmtN(f.perihelionMkm, 1)} / ${fmtN(f.aphelionMkm, 1)} مليون كم`);
      add('طول اليوم', `${fmtHours(f.dayLengthH)} <small>(يوم شمسي)</small>`);
      add('الدوران حول نفسه', `${fmtHours(f.siderealRotationH)}${f.siderealRotationH < 0 ? ' ' + retro : ''}`);
      add('طول السنة', fmtDays(f.orbitalPeriodD));
      add('السرعة المدارية', `${fmtN(f.orbitalVelKmS, 1)} كم/ث`);
      add('ميل المحور', `${fmtN(f.obliquityDeg, 2)}°`);
      add('الانحراف المداري', fmtN(f.eccentricity, 3));
      add('ميل المدار', `${fmtN(f.inclinationDeg, 1)}°`);
      add('عدد الأقمار', `${f.moons}${f.moons > 2 ? ' <small>(المؤكدة حتى 2025)</small>' : ''}`);
      add('الحرارة', `${f.meanTempC}°م <small>${f.tempNoteAr || ''}</small>`);
      add('الكتلة', fmtMass(f.massE24));
      add('الجاذبية', `${fmtN(f.gravityMS2, f.gravityMS2 < 1 ? 2 : 1)} م/ث²`);
      if (f.rings) add('حلقات', 'نعم');
    }
    const actions = [];
    if (!body.isSun) actions.push(`<button class="act" data-act="sat"><svg viewBox="0 0 24 24"><path d="M4 20l5-5M13 4l7 7-3 3-7-7zM9 8l7 7M6 12l6 6M3 9l3-3"/></svg>منظر قمر صناعي</button>`);
    if (body.clouds) actions.push(`<button class="act${body.cloudsVisible ? ' on' : ''}" data-act="clouds"><svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/></svg>${body.id === 'venus' ? 'الغيوم (إخفاؤها يكشف السطح)' : 'الغيوم'}</button>`);
    actions.push(`<button class="act${this.app.rig.tracking ? ' on' : ''}" data-act="follow"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>تتبع</button>`);
    $('infoContent').innerHTML = `
      <div class="info-head">
        <div class="info-orb" style="--c:${d.color}"></div>
        <div><div class="info-title">${d.nameAr}</div><span class="en-name" lang="en">${d.nameEn}</span></div>
      </div>
      <div class="info-kind">${f.kindAr || ''}</div>
      <div class="facts">${rows.join('')}</div>
      <button class="more-btn" type="button">عرض المزيد ▾</button>
      <p class="desc">${d.descAr}</p>
      <div class="actions">${actions.join('')}</div>`;
    const card = $('infoCard');
    card.classList.toggle('compact', this.isMobile());
    const more = $('infoContent').querySelector('.more-btn');
    more.addEventListener('click', () => {
      const c = card.classList.toggle('compact');
      more.textContent = c ? 'عرض المزيد ▾' : 'عرض أقل ▴';
    });
    $('infoContent').querySelectorAll('.act').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'sat') this.app.satelliteView();
      if (a === 'clouds') { const v = !body.cloudsVisible; this.app.system.setCloudsVisible(body.id, v); b.classList.toggle('on', v); }
      if (a === 'follow') this.app.setFollow(!this.app.rig.tracking);
    }));
    this._cardClosed = false;
    if (!(this.isMobile() && $('bodiesPanel').classList.contains('open'))) $('infoCard').classList.remove('hidden');
    $('infoCard').scrollTop = 0;
    this.lastLive = 0;
    this.updateLive(true);
  }

  updateLive(force) {
    const now = performance.now();
    if (!force && now - this.lastLive < 400) return;
    this.lastLive = now;
    const app = this.app;
    const focus = this.cardBody;
    if (!focus || $('infoCard').classList.contains('hidden')) return;
    const real = app.system.real;
    const pos = focus.realPos;
    const el = (k) => $('infoContent').querySelector(`[data-live="${k}"]`);
    const sd = el('sunDist');
    if (sd) { const r = astro.len(pos); sd.innerHTML = `${fmtKm(r)} <small>(${fmtN(r / AU, 4)} و.ف)</small>`; }
    const ed = el('earthDist');
    if (ed && real.earth) {
      const e = real.earth;
      const r = Math.hypot(pos[0] - e[0], pos[1] - e[1], pos[2] - e[2]);
      const lt = r / CONSTANTS.LIGHT_SPEED_KM_S;
      const ltStr = lt < 120 ? `${fmtN(lt, 2)} ثانية` : lt < 7200 ? `${fmtN(lt / 60, 1)} دقيقة` : `${fmtN(lt / 3600, 2)} ساعة`;
      ed.innerHTML = `${fmtKm(r)} <small>(الضوء: ${ltStr})</small>`;
    }
    const pd = el('parentDist');
    if (pd && focus.realRel) pd.innerHTML = fmtKm(astro.len(focus.realRel));
  }

  /* --------------------------------------------------------- المؤشرات */
  updateHud(fps) {
    const app = this.app;
    const f = app.rig.focus;
    if (f && !app.rig.flight) {
      const realAlt = app.rig.altitude * (f.data.radiusKm / f.displayRadius);
      $('hudFocus').textContent = app.rig.tracking ? `تتبع: ${f.data.nameAr}` : `حول: ${f.data.nameAr}`;
      $('hudAlt').textContent = `الارتفاع عن السطح: ${fmtKm(realAlt)}${app.scaleMode === 'visual' ? ' (مقياس مرئي)' : ''}`;
    } else if (app.rig.flight) {
      $('hudFocus').textContent = `الطيران إلى ${app.rig.flight.body.data.nameAr}…`;
      $('hudAlt').textContent = '';
    }
    if (fps !== undefined) $('hudFps').textContent = `${fmtN(fps, 0)} إطار/ث`;
  }

  /* --------------------------------------------------------- الأسماء */
  updateLabels(camera, system) {
    const bodies = system.bodies;
    const camPos = camera.position;
    const focus = this.app.rig.focus;
    const W = window.innerWidth, H = window.innerHeight;
    const placed = [];
    const prio = (b) => (b === focus ? 0 : b.isSun ? 1 : b.type === 'planet' ? 2 : b.type === 'dwarf' ? 3 : 4);
    const order = [...bodies.values()].sort((x, y) => prio(x) - prio(y));
    const va = this._va || (this._va = camPos.clone());
    const vb = this._vb || (this._vb = camPos.clone());
    const vp = this._vp || (this._vp = camPos.clone());
    for (const b of order) {
      if (!b.label) continue;
      let visible = this.labelsOn;
      if (visible) {
        const dist = camPos.distanceTo(b.root.position);
        // مخفي خلف جرم أقرب
        for (const o of bodies.values()) {
          if (o === b) continue;
          const dO = camPos.distanceTo(o.root.position);
          if (dO >= dist) continue;
          const angR = Math.asin(Math.min(1, o.displayRadius / dO));
          va.copy(o.root.position).sub(camPos).normalize();
          vb.copy(b.root.position).sub(camPos).normalize();
          if (va.angleTo(vb) < angR * 0.98) { visible = false; break; }
        }
        // منع التزاحم: القمر قريب جداً من كوكبه على الشاشة
        if (visible && b.type === 'moon' && b !== focus) {
          const sepPx = (b.root.position.distanceTo(b.parent.root.position) / dist) * (this.app.viewportHeight / (2 * Math.tan(camera.fov * Math.PI / 360)));
          if (sepPx < 22) visible = false;
        }
        // قريب جداً (الجرم يملأ الشاشة): نخفي الاسم
        if (b.apparentPx > 420) visible = false;
        // منع تداخل الأسماء على الشاشة (الأولوية: المختار ← الشمس ← الكواكب ← الأقمار)
        if (visible) {
          vp.copy(b.root.position).project(camera);
          if (vp.z > 1) visible = false; // خلف الكاميرا
          const x = (vp.x * 0.5 + 0.5) * W, y = (-vp.y * 0.5 + 0.5) * H - Math.min(b.apparentPx || 0, 400);
          for (const q of visible ? placed : []) {
            if (Math.abs(q[0] - x) < 46 && Math.abs(q[1] - y) < 17) { visible = false; break; }
          }
          if (visible) placed.push([x, y]);
        }
      }
      b.label.visible = visible;
      if (visible) {
        const big = b.apparentPx > 6;
        b.labelEl.classList.toggle('big', big);
        b.labelEl.style.setProperty('--off', big ? `${Math.min(b.apparentPx, 400)}px` : '0px');
        b.labelEl.classList.toggle('focus', b === focus);
      }
    }
  }

  /* --------------------------------------------------------- لوحة المفاتيح */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const app = this.app;
      switch (e.code) {
        case 'ArrowLeft': case 'ArrowDown': app.step(1); e.preventDefault(); break;
        case 'ArrowRight': case 'ArrowUp': app.step(-1); e.preventDefault(); break;
        case 'Space': app.togglePlay(); e.preventDefault(); break;
        case 'KeyH': case 'Home': app.overview(); break;
        case 'KeyF': app.setFollow(!app.rig.tracking); break;
        case 'KeyS': app.toggleScale(); break;
        case 'KeyL': this.setLabels(!this.labelsOn); break;
        case 'KeyO': app.setOrbits(!app.orbitsOn); break;
        case 'KeyT': app.satelliteView(); break;
        case 'Equal': case 'NumpadAdd': app.rig.zoom(0.55); break;
        case 'Minus': case 'NumpadSubtract': app.rig.zoom(1.8); break;
        case 'Escape': this.closeModals(); break;
        case 'Slash': if (e.shiftKey) this.openModal('help'); break;
        default: break;
      }
    });
  }
}

export { BODY_ORDER };
