/* ============================================================================
 *  textures.js — إدارة الصور
 *  ---------------------------------------------------------------------------
 *  - تحميل تدريجي بنسبة مئوية حقيقية (fetch + ReadableStream)
 *  - فك الضغط خارج الخيط الرئيسي (createImageBitmap)
 *  - قائمة أسماء بديلة لكل خانة؛ إذا فشلت كلها → صورة مولّدة بالكود على الـ GPU
 *  - LOD: دقة 2K أولاً، ثم 8K عند الاقتراب، وتحرير 8K عند الابتعاد
 *  - Anisotropic filtering بأعلى قيمة يدعمها الجهاز
 *  - dispose كامل عند تغيير الجودة
 * ========================================================================== */
import * as THREE from 'three';
import { TEXTURES } from './data.js';
import { BAKE_VERT, BAKE_FRAG, PROC_TYPES } from './shaders.js';

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export class TextureManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.maxTextureSize = renderer.capabilities.maxTextureSize;
    this.anisotropy = this.maxAnisotropy;
    this.missing = new Set();      // ملفات ثبت أنها غير موجودة (لا نعيد المحاولة)
    this.cache = new Map();        // اسم الملف → Texture
    this.refCount = new Map();
    this.bakes = new Set();        // أهداف الرسم للصور المولّدة
    this.disposed = false;
    this._initBaker();
  }

  /**
   * يكتشف الصور الموجودة فعلاً في مجلد textures قبل طلبها، حتى لا تظهر أخطاء
   * 404 في الـ console للصور غير الموجودة:
   *  1) قائمة المجلد (npx serve / Live Server / python http.server تعرضها)
   *  2) أو ملف textures/manifest.json (يولّده سكربت التحميل)
   *  3) وإلا: تجربة كل اسم مباشرة
   */
  async discover() {
    this.available = null;
    const collect = (text) => {
      const names = new Set();
      const re = /([\w.\-%]+\.(?:jpe?g|png|webp))/gi;
      let m;
      while ((m = re.exec(text))) { try { names.add(decodeURIComponent(m[1]).split('/').pop()); } catch (e) { names.add(m[1]); } }
      return names;
    };
    const tryListing = async () => {
      try {
        const res = await fetch(TEXTURES.basePath, { cache: 'no-store' });
        if (!res.ok) return false;
        const text = await res.text();
        const ownPage = text.includes('id="scene"');
        if (ownPage || !/(Index of|Directory listing|Files within|<a\s)/i.test(text)) return false;
        this.available = collect(text);
        this.discovery = 'listing';
        return true;
      } catch (e) { return false; }
    };
    const tryManifest = async () => {
      try {
        const res = await fetch(TEXTURES.basePath + 'manifest.json', { cache: 'no-store' });
        if (!res.ok) return false;
        const j = await res.json();
        this.available = new Set((Array.isArray(j) ? j : j.files || []).map((x) => String(x)));
        this.discovery = 'manifest';
        return true;
      } catch (e) { return false; }
    };
    // سيرفر محلي (npx serve / Live Server / python) يعرض قائمة المجلد؛
    // الاستضافة أونلاين (GitHub Pages…) لا تعرضها، فنقرأ manifest.json أولاً
    const h = location.hostname;
    const local = h === '' || h === 'localhost' || h === '[::1]' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
    const order = local ? [tryListing, tryManifest] : [tryManifest, tryListing];
    for (const step of order) if (await step()) return this.available;
    this.discovery = 'probe';
    return null;
  }

  setAnisotropy(a) {
    this.anisotropy = Math.max(1, Math.min(a, this.maxAnisotropy));
    for (const t of this.cache.values()) { t.anisotropy = this.anisotropy; t.needsUpdate = true; }
  }

  /* ----------------------------- تحميل ملف واحد مع التقدم ----------------------------- */
  async _fetchBlob(url, onProgress) {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('Content-Type') || '';
    if (type.includes('text/html')) throw new Error('not an image');
    const total = Number(res.headers.get('Content-Length')) || 0;
    if (!res.body || !res.body.getReader) {
      const b = await res.blob();
      onProgress && onProgress(1);
      return b;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (onProgress) onProgress(total ? Math.min(loaded / total, 0.999) : 0.5);
    }
    onProgress && onProgress(1);
    const ext = url.split('.').pop().toLowerCase();
    return new Blob(chunks, { type: type || MIME[ext] || 'application/octet-stream' });
  }

  async _decode(blob) {
    // فك الضغط في خيط منفصل مع قلب عمودي (لا تحويل لوني ولا ضرب مسبق بالشفافية)
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(blob, {
          imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
        });
        const t = new THREE.Texture(bmp);
        t.flipY = false;
        return t;
      } catch (e) { /* نجرب الطريقة التقليدية */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('decode failed'));
        im.src = url;
      });
      const t = new THREE.Texture(img);
      t.flipY = true;
      return t;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  _configure(tex, { srgb = true, repeat = true } = {}) {
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.anisotropy;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * يحاول قائمة أسماء بالترتيب ويعيد أول صورة تنجح، أو null.
   * @param {string[]} names
   */
  async loadFirst(names, opts = {}, onProgress) {
    for (const name of names || []) {
      if (this.missing.has(name)) continue;
      if (this.available && !this.available.has(name)) { this.missing.add(name); continue; }
      if (this.cache.has(name)) {
        this._ref(name, 1);
        onProgress && onProgress(1);
        return { texture: this.cache.get(name), name };
      }
      try {
        const blob = await this._fetchBlob(TEXTURES.basePath + name, onProgress);
        const tex = this._configure(await this._decode(blob), opts);
        const w = tex.image.width, h = tex.image.height;
        if (Math.max(w, h) > this.maxTextureSize) {
          console.info(`[textures] ${name} (${w}×${h}) أكبر من حد الجهاز ${this.maxTextureSize}، تم تجاهلها`);
          this._closeImage(tex);
          this.missing.add(name);
          continue;
        }
        tex.name = name;
        tex.userData.size = new THREE.Vector2(w, h);
        this.cache.set(name, tex);
        this._ref(name, 1);
        return { texture: tex, name };
      } catch (e) {
        this.missing.add(name);
      }
    }
    onProgress && onProgress(1);
    return null;
  }

  _ref(name, d) { this.refCount.set(name, (this.refCount.get(name) || 0) + d); }

  _closeImage(tex) {
    if (tex.image && typeof tex.image.close === 'function') tex.image.close();
  }

  release(name) {
    if (!name || !this.cache.has(name)) return;
    this._ref(name, -1);
    if (this.refCount.get(name) <= 0) {
      const t = this.cache.get(name);
      t.dispose();
      this._closeImage(t);
      this.cache.delete(name);
      this.refCount.delete(name);
    }
  }

  /** هل ثبت أن كل ملفات خانة/مستوى مفقودة؟ */
  allMissing(names) { return !names || names.every((n) => this.missing.has(n)); }

  /* ----------------------------- التوليد بالكود (GPU) ----------------------------- */
  _initBaker() {
    this.bakeScene = new THREE.Scene();
    this.bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bakeMaterial = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: { uType: { value: 0 }, uSeed: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMaterial);
    quad.frustumCulled = false;
    this.bakeScene.add(quad);
    this.bakeQuad = quad;
  }

  /**
   * يولّد صورة إسقاط متساوي المستطيلات (equirectangular) لجرم.
   * القناة A = الارتفاع (للتضاريس) أو قناع الماء.
   */
  bake(procName, width, seed = 1.0) {
    const type = PROC_TYPES[procName] ?? PROC_TYPES.mercury;
    width = Math.min(width, this.maxTextureSize);
    const height = width / 2;
    const rt = new THREE.WebGLRenderTarget(width, height, {
      colorSpace: THREE.SRGBColorSpace,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      anisotropy: this.anisotropy,
    });
    this.bakeMaterial.uniforms.uType.value = type;
    this.bakeMaterial.uniforms.uSeed.value = seed;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    r.autoClear = true;
    r.setRenderTarget(rt);
    r.render(this.bakeScene, this.bakeCamera);
    r.setRenderTarget(prevRT);
    r.autoClear = prevAutoClear;
    rt.texture.name = `procedural:${procName}`;
    rt.texture.userData.size = new THREE.Vector2(width, height);
    rt.texture.userData.procedural = true;
    rt.texture.userData.rt = rt;
    this.bakes.add(rt);
    return rt.texture;
  }

  disposeBake(tex) {
    if (tex && tex.userData && tex.userData.rt) {
      tex.userData.rt.dispose();
      this.bakes.delete(tex.userData.rt);
    }
  }

  /* ----------------------------- حلقات مولّدة (1D) ----------------------------- */
  /** ملف حلقات زحل الحقيقي (C/B/Cassini/A/Encke/Keeler/F) */
  ringTexture(kind, innerKm, outerKm, width = 4096) {
    const data = new Uint8Array(width * 4);
    const rnd = mulberry32(kind === 'saturn' ? 7 : kind === 'uranus' ? 11 : 13);
    const fine = new Float32Array(width);
    for (let i = 0; i < width; i++) fine[i] = rnd();
    const smoothFine = (i, k) => {
      let s = 0, n = 0;
      for (let j = -k; j <= k; j++) { const q = Math.min(width - 1, Math.max(0, i + j)); s += fine[q]; n++; }
      return s / n;
    };
    for (let i = 0; i < width; i++) {
      const r = innerKm + (outerKm - innerKm) * (i / (width - 1));
      let a = 0, c = [0.8, 0.75, 0.68];
      if (kind === 'saturn') {
        const f1 = smoothFine(i, 1), f4 = smoothFine(i, 6);
        if (r >= 66900 && r < 74490) { a = 0.02 + 0.02 * f4; c = [0.6, 0.55, 0.5]; }                     // D
        else if (r >= 74490 && r < 91980) {                                                                // C
          a = 0.08 + 0.1 * f4 + 0.06 * Math.max(0, Math.sin(r / 260)) ; c = [0.62, 0.57, 0.52];
          if (r > 88000 && r < 89200) a += 0.18;
          if (r > 90000 && r < 90600) a += 0.12;
        } else if (r >= 91980 && r < 117570) {                                                             // B
          const x = (r - 91980) / (117570 - 91980);
          a = 0.55 + 0.35 * Math.sin(Math.PI * Math.min(1, x * 1.3)) + 0.12 * (f1 - 0.5) + 0.08 * (f4 - 0.5);
          if (x > 0.12 && x < 0.2) a -= 0.12;
          c = [0.86 + 0.06 * f4, 0.8 + 0.05 * f4, 0.68 + 0.04 * f4];
        } else if (r >= 117570 && r < 122170) {                                                            // Cassini
          a = 0.04 + 0.05 * f4; c = [0.5, 0.46, 0.42];
          if (r > 120000 && r < 120300) a += 0.12;
        } else if (r >= 122170 && r < 136775) {                                                            // A
          const x = (r - 122170) / (136775 - 122170);
          a = 0.5 - 0.12 * x + 0.1 * (f1 - 0.5);
          c = [0.8, 0.76, 0.69];
          if (r > 133423 && r < 133745) a = 0.03;                                                          // Encke
          if (r > 136485 && r < 136527) a = 0.05;                                                          // Keeler
        } else if (r >= 140100 && r < 140300) { a = 0.25 * Math.exp(-Math.pow((r - 140200) / 60, 2)); c = [0.85, 0.8, 0.75]; } // F
        a = Math.max(0, Math.min(1, a));
      } else if (kind === 'uranus') {
        const rings = [[41837, 3, 0.5], [42234, 3, 0.45], [42571, 3, 0.5], [44718, 7, 0.65], [45661, 8, 0.6],
          [47176, 2, 0.4], [47627, 4, 0.6], [48300, 7, 0.7], [50023, 2, 0.3], [51149, 58, 0.9]];
        a = 0.004;
        const px = (outerKm - innerKm) / width;
        for (const [R, w, o] of rings) {
          const ww = Math.max(w, px * 1.6);
          a += o * Math.exp(-Math.pow((r - R) / (ww * 0.6), 2)) * Math.min(1, w / ww + 0.25);
        }
        if (r < 41350) a += 0.01; // حلقة ζ
        a = Math.min(1, a);
        c = [0.42, 0.44, 0.46];
      } else {
        const px = (outerKm - innerKm) / width;
        a = 0.0;
        a += 0.05 * Math.exp(-Math.pow((r - 41900) / 1000, 2));                                           // Galle
        a += 0.35 * Math.exp(-Math.pow((r - 53200) / Math.max(56, px), 2));                                // Le Verrier
        if (r > 53200 && r < 57200) a += 0.02;                                                              // Lassell
        a += 0.12 * Math.exp(-Math.pow((r - 57200) / Math.max(50, px), 2));                                // Arago
        a += 0.45 * Math.exp(-Math.pow((r - 62932) / Math.max(25, px * 1.2), 2));                          // Adams
        a = Math.min(1, a);
        c = [0.55, 0.5, 0.48];
      }
      data[i * 4] = Math.round(255 * Math.pow(c[0], 1 / 2.2));
      data[i * 4 + 1] = Math.round(255 * Math.pow(c[1], 1 / 2.2));
      data[i * 4 + 2] = Math.round(255 * Math.pow(c[2], 1 / 2.2));
      data[i * 4 + 3] = Math.round(255 * a);
    }
    const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.anisotropy;
    tex.needsUpdate = true;
    tex.name = `procedural-ring:${kind}`;
    return tex;
  }

  disposeAll() {
    for (const t of this.cache.values()) { t.dispose(); this._closeImage(t); }
    this.cache.clear();
    for (const rt of this.bakes) rt.dispose();
    this.bakes.clear();
    this.bakeMaterial.dispose();
    this.bakeQuad.geometry.dispose();
  }
}

/** مولّد أرقام عشوائية ثابت البذرة */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
