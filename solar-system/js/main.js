/* ============================================================================
 *  main.js — نقطة البداية
 *  ---------------------------------------------------------------------------
 *  WebGL2 + logarithmicDepthBuffer + ACESFilmic + sRGB
 *  EffectComposer: RenderPass → UnrealBloomPass (توهج الشمس) → OutputPass
 *  الحلقة: الزمن → المواقع → الأصل العائم → الكاميرا → uniforms → الرسم
 * ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { BODY_ORDER, QUALITY_PRESETS, SCALE, CONSTANTS, TIME_SPEEDS } from './data.js';
import * as astro from './astro.js';
import { TextureManager } from './textures.js';
import { SolarSystem, createLabel } from './bodies.js';
import { Sky } from './sky.js';
import { AsteroidBelt } from './asteroids.js';
import { OrbitLines } from './orbits.js';
import { CameraRig } from './camera.js';
import { UI } from './ui.js';

const JD_MIN = 1721423.5;   // 1 يناير سنة 1م
const JD_MAX = 2816787.5;   // 1 يناير سنة 3000م
const NEPTUNE_AU = 30.07;

class App {
  constructor() {
    this.ui = new UI(this);
    this.playing = true;
    this.rate = 1;
    this.direction = 1;
    this.simJd = astro.jdFromUnixMs(Date.now());
    this.scaleMode = this.ui.prefs.scaleMode || SCALE.defaultMode;
    this.scaleT = this.scaleMode === 'visual' ? 1 : 0;
    this.scaleAnim = null;
    this.orbitsOn = true;
    this.bloomOn = true;
    this.qualityKey = this.ui.prefs.quality || this._defaultQuality();
    this.lastTime = performance.now();
    this.clockStart = performance.now();
    this.fpsFrames = 0;
    this.fpsTime = performance.now();
    this.fps = 0;
    this.viewportHeight = window.innerHeight;
  }

  _defaultQuality() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(screen.width, screen.height) < 820;
    return coarse || small ? 'medium' : 'high';
  }

  get quality() { return QUALITY_PRESETS[this.qualityKey]; }

  /* ------------------------------------------------------------ التهيئة */
  async init() {
    this.ui.init();
    this.ui.setLoading(0.01, 'تهيئة WebGL2…');
    const container = document.getElementById('scene');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance', alpha: false, stencil: false,
      });
    } catch (e) {
      this.ui.fatal('<h2>تعذّر تشغيل WebGL2</h2><p>المتصفح أو كرت الشاشة لا يدعم WebGL2. جرّب متصفحاً حديثاً (Chrome / Edge / Firefox / Safari 15+) وفعّل تسريع العتاد.</p>');
      throw e;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ui.toast('فُقد سياق WebGL — أعد تحميل الصفحة'); });

    this.scene = new THREE.Scene();
    this.textures = new TextureManager(renderer);
    this.textures.setAnisotropy(this.quality.anisotropy);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.id = 'labels';
    document.getElementById('app').insertBefore(this.labelRenderer.domElement, document.getElementById('loader'));

    this.sky = new Sky(this.scene, this.textures);
    this.system = new SolarSystem({ renderer, scene: this.scene, textures: this.textures, quality: this.quality });
    this.rig = new CameraRig(renderer, this.system);
    this.rig.setAspect(window.innerWidth / window.innerHeight);
    this.rig.onFlightEnd = () => this.ui.syncToolbar();

    this.ui.setLoading(0.015, 'البحث عن الصور في مجلد textures…');
    await this.textures.discover();
    // التحميل مع النسبة المئوية: صور الأجرام 88% + السماء 10% + البناء 2%
    let texFrac = 0, skyFrac = 0;
    const report = (label) => this.ui.setLoading(0.02 + texFrac * 0.86 + skyFrac * 0.1, label);
    const skyTier = this.quality.skyTier;
    await Promise.all([
      this.system.loadInitial((f, label) => { texFrac = f; report(`جاري تحميل الصور: ${label}`); }),
      this.sky.load('2k', (f) => { skyFrac = f; report('جاري تحميل خلفية النجوم ودرب التبانة…'); }),
    ]);
    this.ui.setLoading(0.97, 'بناء حزام الكويكبات والمدارات…');
    await new Promise((r) => setTimeout(r, 0));

    this.asteroids = new AsteroidBelt(this.system.group);
    this.asteroids.build(this.quality.asteroidCount);
    this.orbits = new OrbitLines(this.system.group, this.system);
    for (const b of this.system.bodies.values()) createLabel(b, (id) => this.select(id));

    // سلسلة ما بعد المعالجة مع MSAA
    this._buildComposer();
    this._bindEvents();

    // البداية: منظر عام ثم طيران للأرض
    this.system.updateState(astro.jdTTFromUtc(this.simJd), this.scaleT);
    const extent = this.extent();
    this.rig.focus = this.system.sun;
    this.rig.tracking = true;
    const el = 30 * Math.PI / 180, az = -0.9;
    this.rig.camera.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(extent * 2.4);
    this.rig.lastExtent = extent;

    // تجهيز الـ shaders مسبقاً لتجنب التقطيع أول مرة
    this.system.applyOrigin(this.rig.origin);
    this.rig.updateCamera(0, extent);
    this.system.updateUniforms(this.rig.camera, 0, this.viewportHeight);
    try { renderer.compile(this.scene, this.rig.camera); } catch (e) { /* غير حرج */ }

    this.ui.applyPrefs();
    this.ui.syncToolbar();
    this.ui.syncTime();
    this.ui.hideLoader();
    renderer.setAnimationLoop(() => this.frame());

    // سماء 8K بعد البداية (تحميل تدريجي)
    if (skyTier === '8k') this.sky.load('8k');
    setTimeout(() => { if (!this.rig.focus || this.rig.focus.isSun) this.select('earth'); }, 900);
  }

  _buildComposer() {
    const r = this.renderer;
    const q = this.quality;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    // تنظيف الذاكرة: EffectComposer.dispose لا يحرر الـ passes نفسها
    if (this.bloomPass) this.bloomPass.dispose();
    if (this.outputPass) this.outputPass.dispose();
    if (this.composer) this.composer.dispose();
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(this.scene, this.rig.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.45, 0.92);
    this.bloomPass.enabled = this.bloomOn && q.bloom;
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  _bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    // النقر على جرم في المشهد يختاره (مع تمييز النقر عن السحب)
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 6 || dt > 600) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.rig.camera);
      const b = this.system.pick(ray.ray, this.rig.camera, this.viewportHeight, ndc);
      if (b) this.select(b.id);
    });
    document.addEventListener('visibilitychange', () => { this.lastTime = performance.now(); });
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.viewportHeight = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio, 2));
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.rig.setAspect(w / h);
  }

  /* ------------------------------------------------------------ أوامر الواجهة */
  select(id) {
    const b = this.system.bodies.get(id);
    if (!b) return;
    this.rig.flyTo(b);
    this.rig.focus = this.rig.focus || b;
    this.ui.showInfo(b);
    this.pendingFocus = b;
    this.ui.syncToolbar();
    document.querySelectorAll('.body-btn').forEach((x) => x.classList.toggle('active', x.dataset.id === id));
  }

  step(delta) {
    const cur = (this.rig.flight && this.rig.flight.body) || this.rig.focus;
    const i = cur ? BODY_ORDER.indexOf(cur.id) : 0;
    const n = BODY_ORDER.length;
    this.select(BODY_ORDER[(i + delta + n) % n]);
  }

  overview() {
    this.rig.flyOverview(this.extent());
    this.ui.showInfo(this.system.sun);
    document.querySelectorAll('.body-btn').forEach((x) => x.classList.toggle('active', x.dataset.id === 'sun'));
  }

  satelliteView() {
    const f = (this.rig.flight && this.rig.flight.body) || this.rig.focus;
    if (!f || f.isSun) { this.ui.toast('اختر كوكباً أو قمراً أولاً'); return; }
    this.rig.flySatellite(f);
    this.ui.toast(`منظر قمر صناعي فوق ${f.data.nameAr} — استخدم العجلة أو إصبعين للاقتراب أكثر`);
  }

  setFollow(v) {
    this.rig.setTracking(v);
    this.ui.syncToolbar();
    this.ui.toast(v ? 'وضع التتبع: الكاميرا تلحق الجرم بمداره' : 'التتبع متوقف: الكاميرا ثابتة بالفضاء');
  }

  setOrbits(v) {
    this.orbitsOn = v;
    this.orbits.setVisible(v);
    this.ui.syncToolbar();
  }

  setBloom(v) {
    this.bloomOn = v;
    if (this.bloomPass) this.bloomPass.enabled = v && this.quality.bloom;
  }

  setExposure(v) { this.renderer.toneMappingExposure = v; }

  setAllClouds(v) {
    for (const b of this.system.bodies.values()) if (b.clouds) this.system.setCloudsVisible(b.id, v);
    if (this.ui.cardBody) this.ui.showInfo(this.ui.cardBody);
  }

  toggleScale() {
    const to = this.scaleMode === 'visual' ? 'real' : 'visual';
    this.scaleMode = to;
    this.scaleAnim = { from: this.scaleT, to: to === 'visual' ? 1 : 0, t: 0, dur: SCALE.transitionSeconds };
    this.ui.savePrefs({ scaleMode: to });
    this.ui.syncToolbar();
    this.ui.toast(to === 'real'
      ? 'مقياس حقيقي: الأحجام والمسافات الحقيقية — الكواكب تصبح نقاطاً صغيرة جداً'
      : 'مقياس مرئي: مسافات مضغوطة وأحجام مكبّرة حتى يظهر كل شيء');
  }

  async setQuality(key) {
    if (key === this.qualityKey || !QUALITY_PRESETS[key]) return;
    this.qualityKey = key;
    const q = this.quality;
    this.ui.savePrefs({ quality: key });
    this.ui.toast(`الجودة: ${q.nameAr}`);
    this.textures.setAnisotropy(q.anisotropy);
    await this.system.setQuality(q);
    this.asteroids.build(q.asteroidCount);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio, 2));
    this._buildComposer();
    this.onResize();
    this.sky.load(q.skyTier);
    this.ui.syncToolbar();
  }

  togglePlay() { this.playing = !this.playing; this.ui.syncTime(); }
  toggleReverse() { this.direction *= -1; if (!this.playing) this.playing = true; this.ui.syncTime(); }
  setRate(rate) { this.rate = rate; this.playing = true; this.ui.syncTime(); }
  goNow() {
    this.simJd = astro.jdFromUnixMs(Date.now());
    this.rate = 1; this.direction = 1; this.playing = true;
    this.ui.syncTime();
    this.ui.toast('العودة للوقت الحالي');
  }
  setDate(jd) {
    this.simJd = Math.min(JD_MAX, Math.max(JD_MIN, jd));
    this.ui.syncTime();
  }

  /** بُعد نبتون المعروض: مرجع لحجم النظام في المنظر العام */
  extent() {
    const r = NEPTUNE_AU * CONSTANTS.AU_KM;
    return astro.logLerp(r, astro.visualSunDistanceKm(r), this.scaleT);
  }

  /* ------------------------------------------------------------ الإطار */
  frame() {
    const now = performance.now();
    const realDt = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const dt = Math.min(realDt, 0.1);

    // الزمن
    if (this.playing) {
      const adv = (this.rate === 1 ? Math.min(realDt, 3600) : dt) * this.rate * this.direction;
      this.simJd += adv / 86400;
      if (this.simJd < JD_MIN || this.simJd > JD_MAX) {
        this.simJd = Math.min(JD_MAX, Math.max(JD_MIN, this.simJd));
        this.playing = false;
        this.ui.syncTime();
        this.ui.toast('وصلت لحدود نطاق الحساب (سنة 1 – سنة 3000)');
      }
    }
    const jdTT = astro.jdTTFromUtc(this.simJd);

    // انتقال المقياس الناعم
    if (this.scaleAnim) {
      const a = this.scaleAnim;
      a.t += dt;
      const s = Math.min(a.t / a.dur, 1);
      const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
      this.scaleT = a.from + (a.to - a.from) * e;
      if (s >= 1) this.scaleAnim = null;
    }
    const extent = this.extent();

    // المواقع ← الأصل العائم ← الكاميرا ← uniforms
    this.system.updateState(jdTT, this.scaleT);
    const origin = this.rig.computeOrigin(dt);
    this.system.applyOrigin(origin);
    this.rig.updateCamera(dt, extent);
    const camera = this.rig.camera;
    const timeSec = (now - this.clockStart) / 1000;
    this.system.updateUniforms(camera, timeSec, this.viewportHeight);
    this.system.lodTick(camera, this.rig.focus, this.viewportHeight, timeSec);
    const pxScale = (this.viewportHeight * this.renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.asteroids.update(jdTT - CONSTANTS.J2000_JD, this.scaleT, this.system.sun.root.position, pxScale, this.renderer.getPixelRatio());
    this.orbits.update(jdTT, this.scaleT, origin);

    // سطوع الشمس والتوهج حسب حجمها الظاهر: نجم متوهج من بعيد، وسطح مفصّل من قريب
    const sun = this.system.sun;
    const k = Math.min(1, Math.max(0, (Math.log(Math.max(sun.apparentPx || 1, 1)) - Math.log(18)) / (Math.log(160) - Math.log(18))));
    sun.surface.material.uniforms.uIntensity.value = 7.0 + (1.25 - 7.0) * k;
    sun.corona.material.uniforms.uIntensity.value = 2.2 + (0.45 - 2.2) * k;
    this.bloomPass.strength = 0.6 + (0.12 - 0.6) * k;

    // الرسم
    this.composer.render(dt);
    this.ui.updateLabels(camera, this.system);
    this.labelRenderer.render(this.scene, camera);

    // الواجهة
    this.fpsFrames++;
    if (now - this.fpsTime > 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = now;
      this.ui.updateTime(this.simJd);
      this.ui.updateHud(this.fps);
    }
    this.ui.updateLive(false);
  }
}

const app = new App();
window.solarApp = app; // للتجربة من الـ console
app.init().catch((e) => {
  console.error(e);
  if (!document.getElementById('fatal').innerHTML) {
    app.ui.fatal(`<h2>حدث خطأ أثناء التشغيل</h2><p dir="ltr">${String(e && e.message || e)}</p>`);
  }
});
