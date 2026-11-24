/* ============================================================================
 *  ui.js — الواجهة العربية (RTL)
 * ========================================================================== */
import {
  ROOMS, EXTERIOR_VIEW, CATALOG, CATALOG_CATEGORIES, SLOT_OPTIONS, FLOOR_FINISHES, WALL_FINISHES, CEILING_FINISHES,
  PAINT_COLORS, QUALITY, APP,
} from './config.js';
import { CATALOG_BY_ID } from './furniture.js';
import { roomAt, roomById } from './architecture.js';

const $ = (id) => document.getElementById(id);
const SLOT_LABELS = { fabric: 'القماش', wood: 'الخشب', metal: 'المعدن', stone: 'الرخام', rug: 'نقش السجادة', art: 'اللوحة' };
const SWATCH = {
  marbleWhite: 'radial-gradient(circle at 30% 30%, #fff, #d9d6d0)', marbleBlack: 'radial-gradient(circle at 30% 30%, #4a4a4c, #0e0e0f)',
  marbleGreen: 'radial-gradient(circle at 30% 30%, #3f6b52, #13261d)', marbleCream: 'radial-gradient(circle at 30% 30%, #f3e8d2, #cdb894)',
  rugRed: 'conic-gradient(#7a1a1e 0 25%, #1c2a4a 0 50%, #7a1a1e 0 75%, #c49a4a 0)', rugNavy: 'conic-gradient(#1f2b4d 0 25%, #7a1a1e 0 50%, #1f2b4d 0 75%, #c49a4a 0)',
  rugIvory: 'conic-gradient(#e2d6bd 0 25%, #6b2a2a 0 50%, #e2d6bd 0 75%, #2a3a5a 0)',
  art0: 'linear-gradient(#5a2a50, #f8b860 60%, #8a4a20)', art1: 'linear-gradient(#bcd4e6, #34607a 55%, #14384a)',
  art2: 'linear-gradient(#f9d8b2, #6f86b0 50%, #1d2e24)', art3: 'radial-gradient(circle, #c02030 20%, #f0d0d8 35%, #140f0c 60%)',
};
const FLOOR_SW = {
  marbleWhite: SWATCH.marbleWhite, marbleCream: SWATCH.marbleCream, marbleBlack: SWATCH.marbleBlack, marbleGreen: SWATCH.marbleGreen,
  checker: 'conic-gradient(#f2f0ec 0 25%, #111 0 50%, #f2f0ec 0 75%, #111 0)', parquet: 'repeating-linear-gradient(45deg, #b4875a 0 8px, #8a6038 8px 16px)',
  zellige: 'conic-gradient(#1d6f73 0 20%, #f2ede1 0 40%, #16222f 0 60%, #c99a3a 0 80%, #1d6f73 0)', travertine: 'linear-gradient(#e2d3b4, #cbb894)',
  courtyard: 'conic-gradient(#f1ece0 0 70%, #21756a 0)',
};
const KIND_AR = { wall: 'الجدران', floor: 'الأرضية', ceiling: 'السقف' };

export class UI {
  constructor(app) {
    this.app = app;
    this.panel = null;
    this.thumbs = new Map();
    this.prefs = this._loadPrefs();
  }
  _loadPrefs() { try { return JSON.parse(localStorage.getItem(APP.prefsKey) || '{}'); } catch (e) { return {}; } }
  savePrefs(p) { Object.assign(this.prefs, p); try { localStorage.setItem(APP.prefsKey, JSON.stringify(this.prefs)); } catch (e) { /* */ } }
  isMobile() { return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760; }

  init() {
    const app = this.app;
    $('btnMode').addEventListener('click', () => app.toggleMode());
    $('btnCatalog').addEventListener('click', () => this.openPanel('catalog'));
    $('btnLight').addEventListener('click', () => this.openPanel('light'));
    $('btnRooms').addEventListener('click', () => this.openPanel('rooms'));
    $('btnSave').addEventListener('click', () => this.openPanel('save'));
    $('btnUndo').addEventListener('click', async () => { if (await app.editor.undo()) this.toast('تم التراجع'); });
    $('btnShot').addEventListener('click', () => app.screenshot());
    $('btnSettings').addEventListener('click', () => this.openModal('settings'));
    $('btnHelp').addEventListener('click', () => this.openModal('help'));
    $('btnFull').addEventListener('click', () => this.toggleFullscreen());
    const de = document.documentElement;
    if (!de.requestFullscreen && !de.webkitRequestFullscreen) $('btnFull').classList.add('hidden'); // آيفون
    // منع تكبير الصفحة بإصبعين في سفاري (المشهد يتعامل مع اللمس بنفسه)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
    $('panelClose').addEventListener('click', () => this.closePanel());
    $('inspClose').addEventListener('click', () => app.editor.deselect());
    document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.add('hidden'); }));
    // الإعدادات
    const seg = $('qualitySeg');
    for (const k of Object.keys(QUALITY)) {
      const b = document.createElement('button');
      b.textContent = QUALITY[k].nameAr; b.dataset.q = k;
      b.classList.toggle('on', k === app.qualityKey);
      b.addEventListener('click', () => app.setQuality(k));
      seg.appendChild(b);
    }
    const tog = (id, key, fn, def = true) => {
      const el = $(id);
      el.checked = this.prefs[key] ?? def;
      fn(el.checked);
      el.addEventListener('change', () => { fn(el.checked); this.savePrefs({ [key]: el.checked }); });
    };
    tog('optRefl', 'refl', (v) => app.setReflections(v));
    tog('optAO', 'ao', (v) => app.setAO(v));
    tog('optBloom', 'bloom', (v) => app.setBloom(v));
    tog('optSnap', 'snap', (v) => { app.snap = v; }, false);
    tog('optMap', 'map', (v) => $('minimap').classList.toggle('hidden', !v));
    const fov = $('optFov');
    fov.value = this.prefs.fov || 68;
    const applyFov = () => { app.camera.fov = +fov.value; app.camera.updateProjectionMatrix(); $('fovVal').textContent = `${fov.value}°`; };
    fov.addEventListener('input', () => { applyFov(); this.savePrefs({ fov: +fov.value }); });
    applyFov();
    this._bindKeys();
    this.hint();
    $('minimap').addEventListener('click', (e) => this._minimapClick(e));
  }

  /* ------------------------------------------------------------ تحميل */
  setLoading(f, label) {
    const p = Math.max(0, Math.min(100, Math.floor(f * 100)));
    if (p < (this._lp || 0)) return;
    this._lp = p;
    $('loaderBar').style.width = `${p}%`;
    $('loaderPct').textContent = p;
    if (label) $('loaderStatus').textContent = label;
  }
  hideLoader() { this.setLoading(1, 'أهلاً وسهلاً'); setTimeout(() => $('loader').classList.add('done'), 300); }
  fatal(html) { const f = $('fatal'); f.innerHTML = html; f.classList.remove('hidden'); }

  toast(msg, ms = 2400) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), ms);
  }
  openModal(id) { $(id).classList.remove('hidden'); }
  toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); }
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  }

  /* ------------------------------------------------------------ الحالة */
  syncMode() {
    const m = this.app.player.mode;
    $('btnMode').querySelectorAll('.opt').forEach((o) => o.classList.toggle('on', o.dataset.mode === m));
    document.body.classList.toggle('design', m === 'design');
    this.hint();
  }
  syncUndo(n) { $('btnUndo').disabled = !n; }
  hint() {
    const m = this.app.player ? this.app.player.mode : 'walk';
    const mob = this.isMobile();
    $('hint').textContent = m === 'walk'
      ? (mob ? 'العصا للحركة • اسحب للنظر • المس أي قطعة أو جدار لتعديله' : 'اسحب للنظر • W A S D أو الأسهم للحركة • Shift للركض • انقر أي قطعة أو جدار لتعديله')
      : (mob ? 'اسحب للدوران • إصبعين للتقريب • المس قطعة ثم اسحبها لتحريكها' : 'اسحب للدوران • العجلة للتقريب • زر الفأرة الأيمن للإزاحة • اختر قطعة واسحبها لتحريكها');
  }
  setRoomBadge(name) {
    if (this._room === name) return;
    this._room = name;
    const b = $('roomBadge');
    b.classList.remove('show');
    void b.offsetWidth;
    b.textContent = name;
    b.classList.add('show');
  }

  /* ------------------------------------------------------------ اللوحات */
  openPanel(kind) {
    if (this.panel === kind && !$('panel').classList.contains('hidden')) { this.closePanel(); return; }
    this.panel = kind;
    const body = $('panelBody');
    body.innerHTML = '';
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.panel === kind));
    if (kind === 'catalog') this._catalogPanel(body);
    if (kind === 'light') this._lightPanel(body);
    if (kind === 'rooms') this._roomsPanel(body);
    if (kind === 'save') this._savePanel(body);
    $('panelTitle').textContent = { catalog: 'كتالوج الأثاث', light: 'الإضاءة والوقت', rooms: 'غرف القصر', save: 'حفظ ومشاركة' }[kind];
    $('panel').classList.remove('hidden');
    if (this.isMobile()) this.app.editor.deselect();
  }
  closePanel() {
    $('panel').classList.add('hidden');
    this.panel = null;
    document.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'));
  }

  _catalogPanel(body) {
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const grid = document.createElement('div');
    grid.className = 'cat-grid';
    const show = (cat) => {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
      grid.innerHTML = '';
      for (const it of CATALOG.filter((c) => c.cat === cat)) {
        const card = document.createElement('button');
        card.className = 'cat-card';
        card.innerHTML = `<div class="thumb"><img alt="" data-type="${it.id}"></div><div class="nm">${it.nameAr}</div><div class="dm" dir="ltr">${it.size[0]} × ${it.size[1]} م</div>`;
        card.addEventListener('click', () => {
          const item = this.app.editor.addInFront(it.id);
          if (item) this.toast(`أُضيفت: ${it.nameAr} — اسحبها لتحريكها`);
          if (this.isMobile()) this.closePanel();
        });
        grid.appendChild(card);
        const img = card.querySelector('img');
        this.app.thumbnail(it.id).then((url) => { if (url) img.src = url; });
      }
    };
    for (const c of CATALOG_CATEGORIES) {
      const b = document.createElement('button');
      b.dataset.cat = c.id; b.textContent = c.nameAr;
      b.addEventListener('click', () => show(c.id));
      tabs.appendChild(b);
    }
    body.append(tabs, grid);
    show(this._lastCat || 'seating');
  }

  _lightPanel(body) {
    const env = this.app.env;
    const fmt = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`; };
    body.innerHTML = `
      <div class="field"><div class="lbl">الوقت <b id="timeVal">${fmt(env.hours)}</b></div>
        <input type="range" id="timeRange" min="0" max="23.99" step="0.05" value="${env.hours}">
        <div class="chips" id="timeChips"></div></div>
      <div class="field"><div class="lbl">إضاءة الثريات والمصابيح</div>
        <div class="seg3" id="lightMode"><button data-m="auto">تلقائي</button><button data-m="on">تشغيل</button><button data-m="off">إطفاء</button></div></div>
      <div class="field"><div class="lbl">الشدّة <b id="dimVal"></b></div><input type="range" id="dimRange" min="0.1" max="1.8" step="0.05" value="${env.interior.dimmer}"></div>
      <div class="field"><div class="lbl">حرارة اللون <b id="kVal"></b></div><input type="range" id="kRange" min="2200" max="6500" step="50" value="${env.interior.kelvin}" class="kelvin"></div>
      <div class="field"><div class="lbl">السطوع العام <b id="expVal"></b></div><input type="range" id="expRange" min="0.4" max="2.2" step="0.05" value="${env.exposure}"></div>
      <p class="note">الشمس تشرق من الشرق وتغرب من الغرب، والظلال وانعكاسات الضوء داخل الغرف تُحسب من جديد بعد كل تغيير.</p>`;
    const chips = body.querySelector('#timeChips');
    for (const [n, h] of [['شروق', 6.4], ['صباح', 9], ['ظهر', 12.5], ['عصر', 15.5], ['غروب', 17.6], ['ليل', 21]]) {
      const b = document.createElement('button'); b.textContent = n;
      b.addEventListener('click', () => { body.querySelector('#timeRange').value = h; this.app.setTime(h); body.querySelector('#timeVal').textContent = fmt(h); });
      chips.appendChild(b);
    }
    body.querySelector('#timeRange').addEventListener('input', (e) => { this.app.setTime(+e.target.value); body.querySelector('#timeVal').textContent = fmt(+e.target.value); });
    const modeBtns = body.querySelectorAll('#lightMode button');
    const syncMode = () => modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.m === env.interior.mode));
    modeBtns.forEach((b) => b.addEventListener('click', () => { env.interior.mode = b.dataset.m; env.applyInterior(); this.app.lightingChanged(); syncMode(); }));
    syncMode();
    const range = (id, valId, fn, fmtv) => {
      const el = body.querySelector(id), v = body.querySelector(valId);
      const upd = () => { v.textContent = fmtv(+el.value); fn(+el.value); };
      el.addEventListener('input', upd);
      v.textContent = fmtv(+el.value);
    };
    range('#dimRange', '#dimVal', (x) => { env.interior.dimmer = x; env.applyInterior(); this.app.lightingChanged(); }, (x) => `${Math.round(x * 100)}%`);
    range('#kRange', '#kVal', (x) => { env.interior.kelvin = x; env.applyInterior(); this.app.lightingChanged(); }, (x) => `${x}K ${x < 3200 ? 'دافئ' : x < 4800 ? 'محايد' : 'بارد'}`);
    range('#expRange', '#expVal', (x) => { env.exposure = x; env.setTime(env.hours); this.savePrefs({ exposure: x }); }, (x) => `${Math.round(x * 100)}%`);
  }

  _roomsPanel(body) {
    const list = document.createElement('div');
    list.className = 'room-list';
    for (const r of [...ROOMS, EXTERIOR_VIEW]) {
      const b = document.createElement('button');
      b.className = 'room-btn';
      b.innerHTML = `<span class="ic">${r.open ? '❂' : r.id === 'garden' ? '✿' : r.dome ? '◠' : '▣'}</span><span>${r.nameAr}</span>`;
      b.addEventListener('click', () => { this.app.goRoom(r); if (this.isMobile()) this.closePanel(); });
      list.appendChild(b);
    }
    body.appendChild(list);
  }

  _savePanel(body) {
    body.innerHTML = `
      <div class="btn-col">
        <button class="big" id="svNow">💾 حفظ التصميم في المتصفح</button>
        <button class="big" id="svExport">⬇ تصدير ملف التصميم (JSON)</button>
        <label class="big file">⬆ استيراد تصميم<input type="file" id="svImport" accept=".json,application/json" hidden></label>
        <button class="big" id="svShot">📷 لقطة شاشة عالية الدقة</button>
        <button class="big danger" id="svReset">↺ إعادة التصميم الأصلي</button>
      </div>
      <p class="note">التصميم يُحفظ تلقائياً بعد كل تعديل. ملف JSON يحتوي الأثاث والخامات والإضاءة، وتقدر ترسله لأي شخص يفتحه على نفس الصفحة.</p>`;
    body.querySelector('#svNow').addEventListener('click', () => this.toast(this.app.editor.saveLocal() ? 'تم الحفظ' : 'تعذّر الحفظ في هذا المتصفح'));
    body.querySelector('#svExport').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.app.editor.serialize(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'palace-design.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    body.querySelector('#svImport').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { await this.app.editor.load(JSON.parse(await f.text())); this.app.rebuildOctree(); this.app.lightingChanged(); this.toast('تم استيراد التصميم'); }
      catch (err) { this.toast('الملف غير صالح'); }
    });
    body.querySelector('#svShot').addEventListener('click', () => this.app.screenshot());
    body.querySelector('#svReset').addEventListener('click', () => { this.app.editor.resetDefault(); this.app.rebuildOctree(); this.app.lightingChanged(); this.toast('عاد التصميم الأصلي (يمكنك التراجع)'); });
  }

  /* ------------------------------------------------------------ المفتّش */
  showItem(item) {
    const def = item.userData.def;
    const insp = $('inspector');
    const slots = Object.keys(def.slots);
    const rows = slots.map((k) => {
      const opts = SLOT_OPTIONS[k] || [];
      const sw = opts.map((o) => `<button class="sw${item.userData.slots[k] === o.id ? ' on' : ''}" data-k="${k}" data-id="${o.id}" title="${o.nameAr}" style="background:${SWATCH[o.id] || o.hex}"></button>`).join('');
      return `<div class="slot"><div class="lbl">${SLOT_LABELS[k] || k}</div><div class="sws">${sw}</div></div>`;
    }).join('');
    $('inspBody').innerHTML = `
      <div class="ins-title">${def.nameAr}</div>
      <div class="ins-sub" dir="ltr">${def.size.join(' × ')} m</div>
      <div class="ins-actions">
        <button data-a="rl" title="تدوير">↺ 15°</button><button data-a="rr" title="تدوير">↻ 15°</button>
        <button data-a="dup">نسخ</button><button data-a="del" class="danger">حذف</button>
      </div>
      ${rows}
      <p class="note">${this.isMobile() ? 'المس القطعة واسحبها لتحريكها' : 'اسحب القطعة بالفأرة لتحريكها • R للتدوير • Delete للحذف'}</p>`;
    $('inspBody').querySelectorAll('.ins-actions button').forEach((b) => b.addEventListener('click', () => {
      const ed = this.app.editor;
      const a = b.dataset.a;
      if (a === 'rl') ed.rotate(item, 15);
      if (a === 'rr') ed.rotate(item, -15);
      if (a === 'dup') ed.duplicate(item);
      if (a === 'del') { ed.remove(item); this.toast('تم الحذف — يمكنك التراجع'); }
    }));
    $('inspBody').querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => {
      this.app.editor.setSlot(item, b.dataset.k, b.dataset.id);
      $('inspBody').querySelectorAll(`.sw[data-k="${b.dataset.k}"]`).forEach((x) => x.classList.toggle('on', x === b));
    }));
    insp.classList.remove('hidden');
    if (this.isMobile()) this.closePanel();
  }

  showSurface(s) {
    const room = roomById(s.room);
    const p = this.app.palace;
    const st = p.state.rooms[s.room];
    let html = `<div class="ins-title">${KIND_AR[s.kind]}</div><div class="ins-sub">${room ? room.nameAr : ''}</div>`;
    if (s.kind === 'floor') {
      html += `<div class="fin-grid">${FLOOR_FINISHES.map((f) => `<button class="fin${st.floor === f.id ? ' on' : ''}" data-f="${f.id}"><i style="background:${FLOOR_SW[f.id]}"></i>${f.nameAr}</button>`).join('')}</div>`;
    } else if (s.kind === 'wall') {
      html += `<div class="fin-grid">${WALL_FINISHES.map((f) => `<button class="fin${st.wall.finish === f.id ? ' on' : ''}" data-w="${f.id}">${f.nameAr}</button>`).join('')}</div>
        <div class="lbl">اللون</div><div class="sws">${PAINT_COLORS.map((c) => `<button class="sw${st.wall.color === c.hex ? ' on' : ''}" data-c="${c.hex}" title="${c.nameAr}" style="background:${c.hex}"></button>`).join('')}
        <label class="sw custom" title="لون مخصص"><input type="color" id="customColor" value="${st.wall.color}"></label></div>`;
    } else {
      html += `<div class="fin-grid">${CEILING_FINISHES.map((f) => `<button class="fin${st.ceiling === f.id ? ' on' : ''}" data-ce="${f.id}">${f.nameAr}</button>`).join('')}</div>`;
    }
    $('inspBody').innerHTML = html + '<p class="note">التغيير يطبَّق على الغرفة كاملة</p>';
    const ed = this.app.editor;
    const refresh = () => { this.app.env.assignProbes(); this.app.lightingChanged(); this.showSurface(s); ed._changed(); };
    $('inspBody').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { ed._pushUndo(); p.setFloor(s.room, b.dataset.f); this.app.refreshReflectiveList(); refresh(); }));
    $('inspBody').querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { ed._pushUndo(); p.setWall(s.room, b.dataset.w, null); refresh(); }));
    $('inspBody').querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { ed._pushUndo(); p.setWall(s.room, null, b.dataset.c); refresh(); }));
    const cc = $('customColor');
    if (cc) cc.addEventListener('change', () => { ed._pushUndo(); p.setWall(s.room, null, cc.value); refresh(); });
    $('inspBody').querySelectorAll('[data-ce]').forEach((b) => b.addEventListener('click', () => { ed._pushUndo(); p.setCeiling(s.room, b.dataset.ce); this.app.syncRoofVisibility(); refresh(); }));
    $('inspector').classList.remove('hidden');
  }
  hideInspector() { $('inspector').classList.add('hidden'); }

  /* ------------------------------------------------------------ الخريطة المصغّرة */
  drawMinimap() {
    const cv = $('minimap');
    if (cv.classList.contains('hidden')) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const b = { x0: -31, x1: 31, z0: -29, z1: 24 };
    const s = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0));
    const ox = (W - (b.x1 - b.x0) * s) / 2, oz = (H - (b.z1 - b.z0) * s) / 2;
    const P = (x, z) => [ox + (x - b.x0) * s, oz + (z - b.z0) * s];
    this._mm = { P, s, b, ox, oz };
    const cur = roomAt(this.app.player.position.x, this.app.player.position.z);
    for (const r of ROOMS) {
      const [x0, z0, x1, z1] = r.rect;
      const [a, c] = P(x0, z0), [d, e] = P(x1, z1);
      ctx.fillStyle = r.open ? 'rgba(120,170,160,0.25)' : (cur && cur.id === r.id ? 'rgba(240,196,106,0.35)' : 'rgba(220,210,190,0.16)');
      ctx.fillRect(a, c, d - a, e - c);
      ctx.strokeStyle = 'rgba(240,226,200,0.65)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(a, c, d - a, e - c);
    }
    ctx.fillStyle = 'rgba(80,150,170,0.7)';
    { const [a, c] = P(-1.6, -3.2), [d, e] = P(1.6, 7.2); ctx.fillRect(a, c, d - a, e - c); }
    ctx.fillStyle = 'rgba(240,196,106,0.7)';
    for (const it of this.app.editor.items) {
      if (it.userData.place === 'ceiling' || it.userData.place === 'top') continue;
      const [x, z] = P(it.position.x, it.position.z);
      ctx.fillRect(x - 1.2, z - 1.2, 2.4, 2.4);
    }
    const pl = this.app.player;
    let px = pl.position.x, pz = pl.position.z;
    if (pl.mode === 'design') { px = pl.orbit.target.x; pz = pl.orbit.target.z; }
    const [x, z] = P(Math.max(b.x0, Math.min(b.x1, px)), Math.max(b.z0, Math.min(b.z1, pz)));
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-pl.yaw);
    ctx.fillStyle = 'rgba(127,178,255,0.25)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 22, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fb2ff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  _minimapClick(e) {
    if (!this._mm) return;
    const r = e.target.getBoundingClientRect();
    const { b, s, ox, oz } = this._mm;
    const x = b.x0 + (e.clientX - r.left - ox) / s, z = b.z0 + (e.clientY - r.top - oz) / s;
    this.app.goPoint(x, z);
  }

  /* ------------------------------------------------------------ لوحة المفاتيح */
  _bindKeys() {
    window.addEventListener('keydown', async (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const app = this.app, ed = app.editor;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (await ed.undo()) this.toast('تم التراجع'); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD' && ed.selected) { e.preventDefault(); ed.duplicate(ed.selected); return; }
      switch (e.code) {
        case 'Tab': e.preventDefault(); app.toggleMode(); break;
        case 'KeyR': if (ed.selected) ed.rotate(ed.selected, e.shiftKey ? -15 : 15); break;
        case 'Delete': case 'Backspace': if (ed.selected) { ed.remove(ed.selected); this.toast('تم الحذف — Ctrl+Z للتراجع'); } break;
        case 'Escape': ed.deselect(); this.closePanel(); document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')); break;
        case 'KeyF': this.openPanel('catalog'); break;
        case 'KeyL': this.openPanel('light'); break;
        case 'KeyP': app.screenshot(); break;
        case 'KeyH': this.openModal('help'); break;
        default:
          if (/^Digit[1-8]$/.test(e.code)) { const i = +e.code.slice(5) - 1; const r = [...ROOMS, EXTERIOR_VIEW][i]; if (r) app.goRoom(r); }
      }
    });
  }
}

export { CATALOG_BY_ID };
