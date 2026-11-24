/* ============================================================================
 *  main.js — تشغيل القصر
 *  ---------------------------------------------------------------------------
 *  WebGL2 + ظلال ناعمة + AgX + EffectComposer:
 *    RenderPass → GTAOPass (ظلال التلامس) → UnrealBloomPass (توهج) → OutputPass
 * ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUALITY, ROOMS, EXTERIOR_VIEW, DEFAULT_LAYOUT, SIGNATURE } from './config.js';
import { TextureBaker, TEX_DEFS } from './textures.js';
import { MaterialLib } from './materials.js';
import { Palace, roomAt } from './architecture.js';
import { FurnitureFactory } from './furniture.js';
import { Environment, FloorReflector } from './environment.js';
import { Player, Joystick } from './player.js';
import { Editor } from './editor.js';
import { UI } from './ui.js';
import { MeterPass } from './meter.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class App {
  constructor() {
    this.ui = new UI(this);
    this.qualityKey = this.ui.prefs.quality || this._defaultQuality();
    this.snap = false;
    this.meterKey = -2.2; // log2 السطوع المرجعي (معايَر على الفناء والقاعة نهاراً)
    this.clock = performance.now();
    this.thumbQueue = Promise.resolve();
  }
  _defaultQuality() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    return coarse || Math.min(screen.width, screen.height) < 700 ? 'low' : 'high';
  }
  get quality() { return QUALITY[this.qualityKey]; }

  async init() {
    const ui = this.ui;
    const P = (a, b, f, label) => ui.setLoading(a + (b - a) * f, label);
    P(0, 0.03, 0, 'تجهيز الخطوط…');
    try {
      await Promise.race([
        Promise.all(['400 40px "Great Vibes"', '400 40px "Aref Ruqaa"', '600 20px "Cinzel"', '500 16px "Tajawal"'].map((f) => document.fonts.load(f))),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
    } catch (e) { /* خطوط احتياطية */ }

    // المحرك
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      ui.fatal('<h2>تعذّر تشغيل WebGL2</h2><p>استخدم متصفحاً حديثاً (Chrome / Edge / Firefox / Safari 15+) مع تفعيل تسريع العتاد.</p>');
      throw e;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('scene').appendChild(renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 6000);
    ui.init();

    // 1) الخامات
    this.baker = new TextureBaker(renderer, this.quality);
    const names = Object.keys(TEX_DEFS);
    for (let i = 0; i < names.length; i++) {
      this.baker.get(names[i]);
      P(0.03, 0.42, (i + 1) / names.length, `توليد الخامات: ${i + 1} / ${names.length}`);
      await nextFrame();
    }
    this.baker.finish();
    this.lib = new MaterialLib(this.baker);
    // 2) العمارة
    this.palace = new Palace({ lib: this.lib, baker: this.baker });
    const steps = ['_floors', '_walls', '_ceilingsAll', '_roofs', '_courtyard', '_hallColumns', '_exterior', '_signatures'];
    const labels = ['الأرضيات الرخامية', 'الجدران والأقواس والأبواب', 'الأسقف والقبة', 'الأسطح والشرفات', 'الفناء الأندلسي والنوافير', 'أعمدة القاعة الكبرى', 'الحدائق والنخيل والبركة', 'التوقيع والخط العربي'];
    for (let i = 0; i < steps.length; i++) {
      P(0.42, 0.62, i / steps.length, `بناء ${labels[i]}…`);
      await nextFrame();
      this.palace[steps[i]]();
    }
    this.palace.group.traverse((o) => { if (o.isMesh && o.userData.roof) this.palace.roofParts.push(o); });
    this.scene.add(this.palace.group);
    window.__ROOMS_DEFAULT = Object.fromEntries(ROOMS.map((r) => [r.id, { floor: r.floor, wall: { ...r.wall }, ceiling: r.ceiling }]));

    // 3) البيئة
    this.env = new Environment(renderer, this.scene, this.quality);
    this.env.dayEmissive = this.palace.dayEmissive;
    this.env.nightEmissive = this.palace.nightEmissive;
    this.env.pointLights = this.palace.pointLights;
    this.env.exposure = ui.prefs.exposure || 1;

    // 4) الأثاث
    this.factory = new FurnitureFactory(this.lib, this.baker, this.palace);
    this.factory.minorLights = this.qualityKey !== 'low';
    this.editor = new Editor(this);
    this.scene.add(this.editor.collisionGroup);
    const saved = this.editor.loadLocal();
    const layout = saved && Array.isArray(saved.items) ? saved.items : DEFAULT_LAYOUT;
    if (saved && saved.rooms) {
      for (const [id, r] of Object.entries(saved.rooms)) {
        const st = this.palace.state.rooms[id];
        if (!st) continue;
        if (r.floor && r.floor !== st.floor) this.palace.setFloor(id, r.floor);
        if (r.wall && (r.wall.finish !== st.wall.finish || r.wall.color !== st.wall.color)) this.palace.setWall(id, r.wall.finish, r.wall.color);
        if (r.ceiling && r.ceiling !== st.ceiling) this.palace.setCeiling(id, r.ceiling);
      }
    }
    for (let i = 0; i < layout.length; i++) {
      this.editor.add(layout[i], { record: false });
      if (i % 8 === 7) { P(0.62, 0.78, i / layout.length, `ترتيب الأثاث: ${i + 1} / ${layout.length}`); await nextFrame(); }
    }
    if (saved && saved.interior) Object.assign(this.env.interior, saved.interior);
    this.env.registerLights(this.editor.items);
    this.env.setTime(saved && typeof saved.time === 'number' ? saved.time : 16.9);

    // 5) اللاعب والتصادم
    this.player = new Player(this.camera, renderer.domElement);
    this.rebuildOctree(true);
    this.player.teleport(EXTERIOR_VIEW.view.pos, EXTERIOR_VIEW.view.yaw, 0.02);
    new Joystick(document.getElementById('joystick'), this.player);

    // 6) الانعكاسات وما بعد المعالجة
    this.reflector = new FloorReflector(renderer, this.scene);
    this.refreshReflectiveList();
    this._buildComposer();
    this.setReflections(ui.prefs.refl ?? true);

    // 7) الإضاءة غير المباشرة (مجسّات لكل غرفة)
    P(0.8, 0.97, 0, 'حساب الإضاءة غير المباشرة والانعكاسات…');
    await nextFrame();
    renderer.shadowMap.needsUpdate = true;
    this.env.captureProbes(this.palace, (f) => P(0.8, 0.97, f, 'حساب الإضاءة غير المباشرة والانعكاسات…'));
    // تجهيز الشيدرات بالتوازي (KHR_parallel_shader_compile) بدل تجميد الصفحة
    P(0.97, 1, 0, 'تجهيز المؤثرات البصرية…');
    try {
      await Promise.race([renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 9000))]);
    } catch (e) { /* غير حرج */ }

    this._bindPointer();
    window.addEventListener('resize', () => this.onResize());
    ui.syncMode();
    ui.syncUndo(0);
    ui.hideLoader();
    ui.setRoomBadge(EXTERIOR_VIEW.nameAr);
    this.lastT = performance.now();
    this._perf = { t0: performance.now() + 2500, frames: 0, level: 0, auto: !ui.prefs.quality };
    renderer.setAnimationLoop(() => this.frame());
    window.palaceApp = this;
  }

  _buildComposer() {
    const r = this.renderer, q = this.quality;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    if (this.composer) { this.bloomPass && this.bloomPass.dispose(); this.gtaoPass && this.gtaoPass.dispose(); this.composer.dispose(); }
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.meter && this.meter.dispose();
    this.meter = new MeterPass();
    this.composer.addPass(this.meter);
    this.gtaoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtaoPass.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.2, thickness: 1.5, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtaoPass.blendIntensity = 0.9;
    this.gtaoPass.enabled = q.ao && (this.ui.prefs.ao ?? true);
    this.composer.addPass(this.gtaoPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.4, 3.0);
    this.bloomPass.enabled = this.ui.prefs.bloom ?? true;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  /* ------------------------------------------------------------ أوامر */
  rebuildOctree(now = false) {
    const go = () => {
      this.palace.collision.updateMatrixWorld(true);
      this.editor.collisionGroup.updateMatrixWorld(true);
      this.player.buildOctree([this.palace.collision, this.editor.collisionGroup]);
      this.renderer.shadowMap.needsUpdate = true;
    };
    if (now) go(); else { clearTimeout(this._octT); this._octT = setTimeout(go, 50); }
  }
  refreshReflectiveList() {
    const list = [];
    // كل شبكة مادتها تقرأ صورة الانعكاس تُخفى أثناء رسمها (وإلا: حلقة تغذية راجعة في WebGL)
    const reads = (m) => m && m.userData && m.userData.reflect !== undefined;
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (o.userData.reflectiveFloor || mats.some(reads)) list.push(o);
    });
    this.reflector && this.reflector.setHidden(list);
  }
  setReflections(v) {
    if (!this.reflector) return;
    const s = v ? this.quality.reflection : 0;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.reflector.setScale(s, size.x, size.y);
  }
  setAO(v) { if (this.gtaoPass) this.gtaoPass.enabled = v && this.quality.ao; }
  setBloom(v) { if (this.bloomPass) this.bloomPass.enabled = v; }
  setQuality(k) {
    if (k === this.qualityKey) return;
    this.ui.savePrefs({ quality: k });
    this.editor.saveLocal();
    this.ui.toast(`الجودة: ${QUALITY[k].nameAr} — إعادة التحميل لتوليد الخامات بالدقة الجديدة…`, 3000);
    setTimeout(() => location.reload(), 900);
  }
  setTime(h) {
    this.env.setTime(h);
    this.renderer.shadowMap.needsUpdate = true;
    this.lightingChanged();
  }
  lightingChanged() {
    this.renderer.shadowMap.needsUpdate = true;
    clearTimeout(this._probeT);
    this._probeT = setTimeout(() => {
      const q = this.quality;
      const b = q.bounces;
      q.bounces = 1;
      this.env.captureProbes(this.palace);
      q.bounces = b;
    }, 650);
  }
  toggleMode() {
    const p = this.player;
    if (p.mode === 'walk') {
      const r = roomAt(p.position.x, p.position.z);
      const t = r ? new THREE.Vector3((r.rect[0] + r.rect[2]) / 2, 0, (r.rect[1] + r.rect[3]) / 2) : new THREE.Vector3(0, 0, -6);
      const dist = r ? Math.max(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) * 1.35 : 70;
      p.setMode('design', t, dist);
    } else p.setMode('walk');
    this.syncRoofVisibility();
    this.ui.syncMode();
  }
  syncRoofVisibility() {
    const design = this.player.mode === 'design';
    this.palace.group.traverse((o) => { if (o.userData && o.userData.roof) o.visible = !design; });
    this.renderer.shadowMap.needsUpdate = true;
  }
  goRoom(r) {
    if (this.player.mode === 'design' && r.rect) {
      const t = new THREE.Vector3((r.rect[0] + r.rect[2]) / 2, 0, (r.rect[1] + r.rect[3]) / 2);
      this.player.focusDesign(t, Math.max(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) * 1.35);
    } else if (this.player.mode === 'design') {
      this.player.focusDesign(new THREE.Vector3(0, 0, 24), 60);
    } else {
      this.player.teleport(r.view.pos, r.view.yaw, 0);
    }
    this.resetAdapt();
    this.ui.toast(r.nameAr);
  }
  goPoint(x, z) {
    if (this.player.mode === 'design') this.player.focusDesign(new THREE.Vector3(x, 0, z), 28);
    else this.player.teleport([x, 0, z], this.player.yaw, 0);
    this.resetAdapt();
  }

  /** لقطة شاشة مع التوقيع */
  screenshot() {
    this.composer.render(0);
    const src = this.renderer.domElement;
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const s = cv.height / 900;
    ctx.font = `${Math.round(54 * s)}px "Great Vibes", cursive`;
    ctx.textAlign = 'right';
    const g = ctx.createLinearGradient(cv.width - 520 * s, 0, cv.width, 0);
    g.addColorStop(0, '#e6b34f'); g.addColorStop(0.5, '#fff4cf'); g.addColorStop(1, '#e6b34f');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12 * s;
    ctx.fillText(SIGNATURE, cv.width - 36 * s, cv.height - 36 * s);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `palace-${Date.now()}.png`;
    a.click();
    this.ui.toast('تم حفظ اللقطة');
  }

  /** صورة مصغّرة حقيقية لكل قطعة في الكتالوج */
  thumbnail(type) {
    if (this.ui.thumbs.has(type)) return Promise.resolve(this.ui.thumbs.get(type));
    this.thumbQueue = this.thumbQueue.then(async () => {
      if (this.ui.thumbs.has(type)) return;
      await nextFrame();
      const r = this.renderer;
      if (!this._thumb) {
        const pm = new THREE.PMREMGenerator(r);
        const scene = new THREE.Scene();
        scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.9;
        const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(3, 5, 4); scene.add(dl);
        this._thumb = {
          scene, camera: new THREE.PerspectiveCamera(32, 1, 0.01, 100),
          rt: new THREE.WebGLRenderTarget(192, 192, { colorSpace: THREE.SRGBColorSpace, samples: 4 }),
          buf: new Uint8Array(192 * 192 * 4),
        };
      }
      const T = this._thumb;
      const item = this.factory.create(type, {}, { drop: 0.15 });
      T.scene.add(item);
      const box = new THREE.Box3().setFromObject(item);
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const rad = Math.max(sz.x, sz.y, sz.z) * 0.62 + 0.02;
      const dist = rad / Math.sin((T.camera.fov * Math.PI) / 360);
      T.camera.position.copy(c).add(new THREE.Vector3(0.62, 0.48, 1).normalize().multiplyScalar(dist));
      T.camera.near = dist / 50; T.camera.far = dist * 4; T.camera.updateProjectionMatrix();
      T.camera.lookAt(c);
      const prev = r.getRenderTarget();
      r.setRenderTarget(T.rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(T.scene, T.camera);
      r.readRenderTargetPixels(T.rt, 0, 0, 192, 192, T.buf);
      r.setRenderTarget(prev);
      r.setClearColor(0x000000, 1);
      T.scene.remove(item);
      item.traverse((o) => { if (o.isMesh || o.isPoints) o.geometry && o.geometry.dispose(); });
      const cv = document.createElement('canvas'); cv.width = cv.height = 192;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(192, 192);
      for (let y = 0; y < 192; y++) img.data.set(T.buf.subarray((191 - y) * 192 * 4, (192 - y) * 192 * 4), y * 192 * 4);
      ctx.putImageData(img, 0, 0);
      this.ui.thumbs.set(type, cv.toDataURL('image/png'));
    });
    return this.thumbQueue.then(() => this.ui.thumbs.get(type));
  }

  /* ------------------------------------------------------------ الإدخال */
  _ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  _bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (this.down) return;
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType, drag: false };
      const ed = this.editor;
      if (ed.selected && e.button === 0) {
        const hit = ed.pick(this._ndc(e));
        if (hit && hit.item === ed.selected) {
          this.player.orbit.enabled = false;
          ed.startDrag(ed.selected, this._ndc(e));
          this.down.drag = true;
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
      }
      if (this.player.mode === 'walk' && e.button === 0) this.player.beginLook(e.clientX, e.clientY);
    }, { capture: true });
    window.addEventListener('pointermove', (e) => {
      if (!this.down || e.pointerId !== this.down.id) return;
      if (this.down.drag) this.editor.moveDrag(this._ndc(e));
      else if (this.player.mode === 'walk') this.player.moveLook(e.clientX, e.clientY, e.pointerType === 'touch');
    });
    const up = (e) => {
      if (!this.down || e.pointerId !== this.down.id) return;
      const d = this.down;
      this.down = null;
      if (d.drag) {
        this.editor.endDrag();
        this.player.orbit.enabled = this.player.mode === 'design';
        return;
      }
      this.player.endLook();
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved < 6 && performance.now() - d.t < 500 && e.target === el) {
        const hit = this.editor.pick(this._ndc(e));
        if (!hit) this.editor.deselect();
        else if (hit.item) this.editor.select(hit.item);
        else if (hit.surface) this.editor.selectSurface(hit.surface);
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.setReflections(this.reflector.scale > 0);
    this.ui.hint();
  }

  /**
   * تكيّف العين: داخل الغرف نهاراً يكون الضوء أقل بكثير من الخارج، فترفع "العين"
   * التعريض تدريجياً (كما تفعل الكاميرا والعين الحقيقية) وتخفضه عند الخروج للشمس.
   */
  _eyeAdapt(dt) {
    const env = this.env, p = this.player, m = this.meter;
    let target;
    if (m && m.logL !== null) {
      // قياس فعلي مع تعويض جزئي كما تفعل العين: الغرف المعتمة تُرفع حتى ~1.2 درجة تعريض
      // (وأقل ليلاً حتى يبقى الليل ليلاً)، والمشاهد الساطعة جداً تُخفض قليلاً
      const L = m.logL;
      let stops = 0;
      if (L < this.meterKey) stops = Math.min((this.meterKey - L) * 0.4, 1.2 - 0.6 * env.night);
      else if (L > -0.4) stops = -Math.min((L + 0.4) * 0.5, 1);
      target = Math.pow(2, stops);
      if (this._snap) { this.adapt = target; this._snap = false; }
    } else {
      // قبل أول قياس: تقدير بسيط
      target = 1;
      const r = p.mode === 'walk' ? roomAt(p.position.x, p.position.z) : null;
      if (r && !r.open) target = 1 + 0.6 * env.day;
      target *= env.expBase / Math.max(1e-3, env.exposure);
    }
    if (this.adapt === undefined) this.adapt = target;
    // العين تتكيّف مع الضوء القوي بسرعة ومع العتمة أبطأ
    const rate = target < this.adapt ? 2.4 : 1.1;
    this.adapt += (target - this.adapt) * Math.min(1, dt * rate);
    this.renderer.toneMappingExposure = env.exposure * this.adapt;
  }

  /** بعد الانتقال الفوري: قياس جديد وتكيّف فوري */
  resetAdapt() {
    this.adapt = undefined;
    this._snap = true;
    if (this.meter) { this.meter.logL = null; this.meter.frame = 0; }
  }

  /**
   * ضبط تلقائي للأداء: إذا كان الجهاز أضعف من الجودة المختارة تلقائياً (لم يخترها المستخدم)
   * نخفّف المؤثرات تدريجياً بدون إعادة تحميل حتى تصبح الحركة سلسة.
   */
  _adapt(now) {
    const p = this._perf;
    if (!p || !p.auto || document.hidden) return;
    if (now < p.t0) { p.frames = 0; p.start = now; return; }
    p.frames++;
    const el = now - p.start;
    if (el < 3000) return;
    const fps = (p.frames * 1000) / el;
    p.frames = 0; p.start = now;
    if (fps >= 24 || p.level >= 4) return;
    p.level++;
    const r = this.renderer;
    if (p.level === 1) { this.setAO(false); }
    else if (p.level === 2) { r.setPixelRatio(Math.max(1, Math.min(r.getPixelRatio(), 1.25))); this.onResize(); }
    else if (p.level === 3) { this.reflector.scale > 0 && this.setReflections(false); this.bloomPass.enabled = false; }
    else if (p.level === 4) { r.setPixelRatio(Math.min(1, window.devicePixelRatio || 1) * 0.8); this.onResize(); }
    this.ui.toast('تم تخفيف بعض المؤثرات تلقائياً لتكون الحركة أسلس على جهازك', 3200);
  }

  /* ------------------------------------------------------------ كل إطار */
  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const t = (now - this.clock) / 1000;
    this.player.update(dt);
    const doorsBefore = this.palace.doors.map((d) => d.angle);
    this.palace.update(t, this.player.mode === 'walk' ? this.player.position : null, dt);
    if (this.palace.doors.some((d, i) => Math.abs(d.angle - doorsBefore[i]) > 0.002)) this.renderer.shadowMap.needsUpdate = true;
    for (const it of this.editor.items) for (const fn of it.userData.animate) fn(t);
    this._eyeAdapt(dt);
    this.camera.updateMatrixWorld();
    if (this.reflector.scale > 0) this.reflector.update(this.camera);
    this.composer.render(dt);
    this.renderer.shadowMap.needsUpdate = false;
    this._adapt(now);
    if (now - (this._uiT || 0) > 150) {
      this._uiT = now;
      const pos = this.player.mode === 'walk' ? this.player.position : this.player.orbit.target;
      const r = roomAt(pos.x, pos.z);
      this.ui.setRoomBadge(r ? r.nameAr : EXTERIOR_VIEW.nameAr);
      this.ui.drawMinimap();
    }
  }
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  if (!document.getElementById('fatal').innerHTML) app.ui.fatal(`<h2>حدث خطأ أثناء التشغيل</h2><p dir="ltr">${String((e && e.message) || e)}</p>`);
});
