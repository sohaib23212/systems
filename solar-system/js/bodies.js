/* ============================================================================
 *  bodies.js — بناء الأجرام وتحديثها كل إطار
 *  ---------------------------------------------------------------------------
 *  البنية لكل جرم:
 *    root   (Object3D)  ← الموضع بالنسبة لـ "الأصل العائم" (floating origin)
 *     └─ frame (Object3D) ← اتجاه خط الاستواء (قطب IAU) + المقياس = نصف القطر المعروض
 *         ├─ surface  (Mesh) ← يدور حول محوره بزاوية W (IAU)، تفلطح قطبي
 *         ├─ clouds   (Mesh) ← طبقة غيوم منفصلة بسرعة دوران مختلفة
 *         ├─ atmosphere (Mesh) ← تشتت رايلي/مي
 *         └─ rings    (Mesh) ← في مستوى خط الاستواء
 *  وحدة المشهد = كيلومتر. الإحداثيات: three = (x_ecl, z_ecl, −y_ecl).
 * ========================================================================== */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DATA, TEXTURES, CONSTANTS, BODY_ORDER } from './data.js';
import * as astro from './astro.js';
import * as S from './shaders.js';
import { mulberry32 } from './textures.js';

const DEG = Math.PI / 180;

export function eclToThree(v, out = new THREE.Vector3()) { return out.set(v[0], v[2], -v[1]); }

/** أزواج الكسوف/الخسوف: من يمكنه حجب الشمس عن من */
const OCCLUDERS = {
  earth: ['moon'], moon: ['earth'],
  mars: ['phobos', 'deimos'], phobos: ['mars'], deimos: ['mars'],
  jupiter: ['io', 'europa', 'ganymede', 'callisto'], io: ['jupiter'], europa: ['jupiter'], ganymede: ['jupiter'], callisto: ['jupiter'],
  saturn: ['titan'], titan: ['saturn'],
  neptune: ['triton'], triton: ['neptune'],
};
/** ضوء أحمر ينكسر عبر الغلاف الجوي للجسم الحاجب (القمر الدموي أثناء خسوف القمر) */
const OCCLUDER_TINT = { earth: new THREE.Vector3(0.16, 0.045, 0.012), titan: new THREE.Vector3(0.02, 0.01, 0.002) };

/* -------------------------------------------------------------- أدوات */
const _m4 = new THREE.Matrix4();
const _m4b = new THREE.Matrix4();
const _vx = new THREE.Vector3();
const _vy = new THREE.Vector3();
const _vz = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

function setBasisFromEcl(obj, X, P, Q) {
  eclToThree(X, _vx); eclToThree(P, _vy); eclToThree(Q, _vz).negate();
  _m4.makeBasis(_vx, _vy, _vz);
  obj.quaternion.setFromRotationMatrix(_m4);
}

/** ضجيج قيمي ثلاثي الأبعاد (JS) لتشكيل الأقمار غير المنتظمة */
function makeNoise3(seed) {
  const rnd = mulberry32(Math.floor(seed * 1000) + 1);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = s(xf), v = s(yf), w = s(zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w);
  };
}

/** شكل بطاطس للأقمار الصغيرة (فوبوس/دايموس) مع فوهات */
function makeIrregularGeometry(seed, amp) {
  const g = new THREE.SphereGeometry(1, 160, 112);
  const noise = makeNoise3(seed);
  const rnd = mulberry32(Math.floor(seed * 777));
  const craters = [];
  for (let i = 0; i < 60; i++) {
    const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    craters.push([r * Math.cos(t), z, r * Math.sin(t), 0.04 + Math.pow(rnd(), 3) * 0.35]);
  }
  // فوهة كبيرة مثل ستيكني
  craters.push([0.8, 0.1, 0.59, 0.55]);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v1.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    let f = 1.3, a = amp;
    for (let o = 0; o < 4; o++) { r += a * noise(_v1.x * f + 11, _v1.y * f + 7, _v1.z * f + 3); f *= 2.1; a *= 0.45; }
    for (const [cx, cy, cz, cr] of craters) {
      const d = Math.acos(Math.max(-1, Math.min(1, _v1.x * cx + _v1.y * cy + _v1.z * cz))) / cr;
      if (d < 1.35) {
        const bowl = d < 1 ? (d * d - 1) : 0;
        const rim = Math.exp(-Math.pow((d - 1) / 0.22, 2)) * 0.28;
        r += (bowl * 0.55 + rim) * cr * 0.22;
      }
    }
    pos.setXYZ(i, _v1.x * r, _v1.y * r, _v1.z * r);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ================================================================== Body */
export class Body {
  constructor(id, system) {
    this.id = id;
    this.data = DATA[id];
    this.system = system;
    this.type = this.data.type;
    this.isSun = this.type === 'star';
    this.render = this.data.render || {};
    this.parent = null;
    this.children = [];
    this.oblate = this.data.polarRadiusKm / this.data.eqRadiusKm;
    this.realPos = [0, 0, 0];
    this.realRel = [0, 0, 0];
    this.displayPos = new THREE.Vector3();
    this.displayRadius = this.data.radiusKm;
    this.lastW = 0;
    this.slots = {};              // map/clouds/night/normal/specular/ring/bump → {texture, name, tier, procedural}
    this.lodLevel = 2;
    this.cloudsVisible = this.render.clouds ? this.render.clouds.defaultVisible !== false : false;
    this.occluders = [];

    this.root = new THREE.Object3D();
    this.root.name = id;
    this.frame = new THREE.Object3D();
    this.root.add(this.frame);
    this.irregularScale = null;
    if (this.data.shapeKm) {
      const [a, b, c] = this.data.shapeKm;
      const R = this.data.radiusKm;
      this.irregularScale = new THREE.Vector3(a / R, c / R, b / R);
      this.maxRadiusFactor = Math.max(a, b, c) / R * (1 + (this.render.irregular?.amp || 0) * 1.6);
    } else {
      this.maxRadiusFactor = this.data.eqRadiusKm / this.data.radiusKm;
    }
  }

  /** نصف القطر الاستوائي المعروض */
  get eqRadius() { return this.displayRadius * this.data.eqRadiusKm / this.data.radiusKm; }

  /** المسافة من مركز الجرم إلى السطح باتجاه نقطة (إحداثيات عالمية) */
  surfaceRadiusToward(worldPoint) {
    if (this.irregularScale) return this.displayRadius * this.maxRadiusFactor;
    _v1.copy(worldPoint).sub(this.root.position).applyQuaternion(_q.copy(this.frame.quaternion).invert()).normalize();
    const R = this.eqRadius;
    const f = this.oblate;
    return R / Math.sqrt(_v1.x * _v1.x + _v1.z * _v1.z + (_v1.y * _v1.y) / (f * f));
  }

  /** مسافة مشاهدة مناسبة عند اختيار الجرم */
  viewDistance() {
    if (this.isSun) return this.displayRadius * 4.2;
    if (this.rings) return this.eqRadius * (this.id === 'saturn' ? 6.0 : 4.6);
    return this.eqRadius * (this.irregularScale ? 4.5 : 3.3);
  }
}

/* ============================================================ SolarSystem */
export class SolarSystem {
  constructor({ renderer, scene, textures, quality }) {
    this.renderer = renderer;
    this.scene = scene;
    this.textures = textures;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'solar-system';
    scene.add(this.group);

    // مصدر الضوء الوحيد: الشمس (PointLight بلا تخامد حتى تبقى الكواكب البعيدة مرئية)
    this.sunLight = new THREE.PointLight(0xfff6ec, Math.PI, 0, 0);
    this.sunLight.name = 'sun-light';
    this.group.add(this.sunLight);

    // Uniforms مشتركة بين كل الـ shaders (نفس الكائن → تحديث واحد للكل)
    this.shared = {
      uSunViewPos: { value: new THREE.Vector3() },
      uSunRadius: { value: CONSTANTS.SUN_RADIUS_KM },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uTime: { value: 0 },
      uExposureBoost: { value: 1 },
    };

    this.real = {};
    this.bodies = new Map();
    for (const id of BODY_ORDER) this.bodies.set(id, new Body(id, this));
    for (const b of this.bodies.values()) {
      if (b.data.parent) { b.parent = this.bodies.get(b.data.parent); b.parent.children.push(b); }
      b.occluders = (OCCLUDERS[b.id] || []).map((o) => this.bodies.get(o));
      this.group.add(b.root);
    }
    this.sun = this.bodies.get('sun');
    this._buildGeometries();
    this.cloudsGlobal = true;
  }

  /* ------------------------------------------------------- الهندسة (LOD) */
  _buildGeometries() {
    if (this.spheres) this.spheres.forEach((g) => g.dispose());
    const segs = this.quality.sphereSegments;
    this.spheres = segs.map((s) => new THREE.SphereGeometry(1, s, Math.max(16, Math.round(s / 2))));
  }

  /* ------------------------------------------------------- تحميل الصور */
  /**
   * يحمّل كل الصور الأساسية (2K) بالتوازي مع تقرير التقدم، ثم يبني المواد.
   * @param {(fraction:number, label:string)=>void} onProgress
   */
  async loadInitial(onProgress) {
    const jobs = [];
    const progress = new Map();
    const report = (label) => {
      let s = 0;
      for (const v of progress.values()) s += v;
      onProgress && onProgress(s / Math.max(progress.size, 1), label);
    };
    for (const b of this.bodies.values()) {
      const cfg = TEXTURES.bodies[b.id] || {};
      for (const slot of Object.keys(cfg)) {
        const key = `${b.id}.${slot}`;
        progress.set(key, 0);
        const isColor = slot === 'map' || slot === 'night' || (slot === 'clouds' && b.id === 'venus') || slot === 'ring';
        // الدقة الأساسية أولاً؛ وإذا غير موجودة نجرب الدقة العالية كبديل
        const list2k = cfg[slot]['2k'] || [];
        const list8k = cfg[slot]['8k'] || [];
        jobs.push(
          this.textures.loadFirst([...list2k, ...list8k], { srgb: isColor, repeat: slot !== 'ring' }, (f) => { progress.set(key, f); report(`${b.data.nameAr}`); })
            .then((res) => {
              if (res) {
                const tier = list2k.includes(res.name) ? '2k' : '8k';
                b.slots[slot] = { texture: res.texture, name: res.name, tier, procedural: false };
                if (tier === '8k') b.currentTier = '8k-only';
              }
              progress.set(key, 1);
              report(b.data.nameAr);
            }),
        );
      }
    }
    await Promise.all(jobs);
    // البدائل المولّدة بالكود لكل ما لم يُحمَّل
    this._fillProcedural();
    for (const b of this.bodies.values()) this._buildBody(b);
    // تحميل مسبق للدقة العالية حسب الجودة (فائق)
    for (const id of this.quality.preloadHigh || []) this.requestTier(this.bodies.get(id), '8k');
  }

  _fillProcedural() {
    const size = this.quality.procSize;
    for (const b of this.bodies.values()) {
      if (b.isSun) continue;
      const r = b.render;
      const isMoonSized = b.type === 'moon' || b.type === 'dwarf';
      const w = isMoonSized ? Math.min(size, 1024) : size;
      if (!b.slots.map) {
        b.slots.map = { texture: this.textures.bake(r.proc || b.id, w, 1 + b.id.length * 0.37), procedural: true, tier: 'proc' };
      }
      if (r.clouds && !b.slots.clouds) {
        b.slots.clouds = { texture: this.textures.bake(r.clouds.proc, w, 3.3), procedural: true, tier: 'proc' };
      }
      if (b.id === 'earth' && !b.slots.night && b.slots.map.procedural) {
        b.slots.night = { texture: this.textures.bake('earthNight', w, 1 + b.id.length * 0.37), procedural: true, tier: 'proc' };
      }
      if (r.rings && !b.slots.ring) {
        const ri = r.rings;
        b.slots.ring = { texture: this.textures.ringTexture(ri.proc, ri.innerKm, ri.outerKm), procedural: true, tier: 'proc',
          range: [ri.innerKm, ri.outerKm] };
      } else if (r.rings && b.slots.ring && !b.slots.ring.procedural) {
        b.slots.ring.range = [r.rings.textureInnerKm, r.rings.textureOuterKm];
      }
    }
  }

  /* ------------------------------------------------------- بناء المواد */
  _surfaceDefines(b) {
    const q = this.quality;
    const d = { NUM_OCC: b.occluders.length };
    const map = b.slots.map;
    const r = b.render;
    if (r.kind !== 'gas') {
      if (map.procedural) d.BUMP_FROM_ALPHA = '';
      else if (b.slots.bump && q.normalMaps) d.USE_BUMPMAP = '';
      else if ((r.bumpFromMap || 0) > 0) d.BUMP_FROM_MAP = '';
    }
    if (b.id === 'earth') {
      if (b.slots.normal && q.normalMaps && !map.procedural) d.USE_NORMALMAP = '';
      if (b.slots.specular && !map.procedural) d.USE_SPECMAP = '';
      else if (map.procedural) d.SPEC_FROM_ALPHA = '';
      else d.SPEC_FROM_COLOR = '';
      if (b.slots.night) d.USE_NIGHT = '';
      if (b.slots.clouds) d.USE_CLOUDS = '';
    }
    if (b.rings) d.USE_RINGSHADOW = '';
    if (r.atmosphere) d.USE_ATMO = '';
    if (q.detail) d.USE_DETAIL = '';
    return d;
  }

  _texSize(t) { return t.userData.size || new THREE.Vector2(t.image?.width || 1024, t.image?.height || 512); }

  _buildBody(b) {
    const sh = this.shared;
    if (b.isSun) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: S.SUN_VERT, fragmentShader: S.SUN_FRAG,
        uniforms: {
          uTime: sh.uTime,
          uMap: { value: b.slots.map ? b.slots.map.texture : null },
          uHasMap: { value: b.slots.map ? 1 : 0 },
          uIntensity: { value: 7.0 },
          uDetail: { value: this.quality.detail ? 1 : 0 },
        },
      });
      b.surface = new THREE.Mesh(this.spheres[0], mat);
      b.surface.name = 'sun-surface';
      b.frame.add(b.surface);
      const coronaScale = 7.0;
      b.corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        vertexShader: S.CORONA_VERT, fragmentShader: S.CORONA_FRAG,
        uniforms: { uTime: sh.uTime, uScale: { value: coronaScale }, uIntensity: { value: 2.2 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      b.corona.userData.scale = coronaScale;
      b.corona.renderOrder = 6;
      b.corona.frustumCulled = false;
      b.root.add(b.corona);
      return;
    }

    // الحلقات (قبل المواد لأن ظل الحلقات يحتاجها)
    const r = b.render;
    if (r.rings) {
      const eq = b.data.eqRadiusKm;
      const ri = r.rings;
      const geo = new THREE.RingGeometry(ri.innerKm / eq, ri.outerKm / eq, 512, 6);
      geo.rotateX(-Math.PI / 2);
      const range = b.slots.ring.range;
      b.ringUniforms = {
        uRingMap: { value: b.slots.ring.texture },
        uTexRange: { value: new THREE.Vector2(range[0] / eq, range[1] / eq) },
        uSunDirFrame: { value: new THREE.Vector3(0, 1, 0) },
        uCamFrame: { value: new THREE.Vector3(0, 10, 0) },
        uOblate: { value: b.oblate },
        uSunColor: sh.uSunColor,
        uBrightness: { value: ri.brightness ?? 1 },
        uPenumbra: { value: 0.004 },
      };
      b.rings = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: S.RING_VERT, fragmentShader: S.RING_FRAG, uniforms: b.ringUniforms,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      b.rings.renderOrder = 3;
      b.rings.name = `${b.id}-rings`;
      b.frame.add(b.rings);
    }

    // المادة الأساسية للسطح
    const map = b.slots.map.texture;
    const size = this._texSize(map);
    const occ = b.occluders.map(() => new THREE.Vector4());
    const occTint = b.occluders.map((o) => (OCCLUDER_TINT[o.id] || new THREE.Vector3()).clone());
    const atm = r.atmosphere;
    b.uniforms = {
      uSunViewPos: sh.uSunViewPos, uSunRadius: sh.uSunRadius, uSunColor: sh.uSunColor, uExposureBoost: sh.uExposureBoost,
      uMap: { value: map },
      uMapSize: { value: size.clone() },
      uLonOffset: { value: (TEXTURES.lonOffsetDeg[b.id] || 0) / 360 },
      uLunar: { value: r.lunar || 0 },
      uMinnaert: { value: r.minnaert || 1 },
      uBumpScale: { value: 0 },
      uDetail: { value: 1 },
      uDetailScale: { value: size.x / 9.4 },
      uSunDirFrame: { value: new THREE.Vector3(1, 0, 0) },
      uCamFrame: { value: new THREE.Vector3(3, 0, 0) },
      uOblate: { value: b.oblate },
      uLocalToFrame: { value: new THREE.Matrix4() },
      uNormalMap: { value: b.slots.normal ? b.slots.normal.texture : null },
      uNormalScale: { value: 1.0 },
      uBumpMap: { value: b.slots.bump ? b.slots.bump.texture : null },
      uBumpSize: { value: b.slots.bump ? this._texSize(b.slots.bump.texture).clone() : new THREE.Vector2(1, 1) },
      uSpecMap: { value: b.slots.specular ? b.slots.specular.texture : null },
      uNightMap: { value: b.slots.night ? b.slots.night.texture : null },
      uNightIntensity: { value: r.nightIntensity || 1.2 },
      uCloudMap: { value: b.slots.clouds ? b.slots.clouds.texture : null },
      uCloudOffset: { value: 0 },
      uCloudShadow: { value: 0.55 },
      uCloudHeight: { value: r.clouds ? r.clouds.heightR : 0 },
      uRingMap: { value: b.slots.ring ? b.slots.ring.texture : null },
      uRingTexRange: { value: b.ringUniforms ? b.ringUniforms.uTexRange.value : new THREE.Vector2(1, 2) },
      uTauR: { value: atm ? new THREE.Vector3(...atm.tauR) : new THREE.Vector3() },
      uTauM: { value: atm ? new THREE.Vector3(...atm.tauM) : new THREE.Vector3() },
      uHR: { value: atm ? atm.hR : 1 },
      uHM: { value: atm ? atm.hM : 1 },
      uOcc: { value: occ },
      uOccTint: { value: occTint },
    };
    this._updateBumpScale(b);
    b.surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: S.PLANET_VERT, fragmentShader: S.PLANET_FRAG,
      uniforms: b.uniforms, defines: this._surfaceDefines(b),
    });
    const geo = b.irregularScale ? makeIrregularGeometry(r.irregular.seed, r.irregular.amp) : this.spheres[2];
    b.surface = new THREE.Mesh(geo, b.surfaceMaterial);
    b.surface.name = `${b.id}-surface`;
    if (b.irregularScale) { b.surface.scale.copy(b.irregularScale); b.ownGeometry = geo; }
    else b.surface.scale.set(1, b.oblate, 1);
    b.frame.add(b.surface);

    // طبقة الغيوم
    if (r.clouds && b.slots.clouds) {
      const lumAlpha = b.id === 'earth';
      b.cloudUniforms = {
        uSunViewPos: sh.uSunViewPos, uSunRadius: sh.uSunRadius, uSunColor: sh.uSunColor, uExposureBoost: sh.uExposureBoost,
        uMap: { value: b.slots.clouds.texture },
        uMapSize: { value: this._texSize(b.slots.clouds.texture).clone() },
        uOpacity: { value: r.clouds.opacity ?? 1 },
        uDetail: { value: 1 },
        uDetailScale: { value: this._texSize(b.slots.clouds.texture).x / 9.4 },
        uSunDirFrame: b.uniforms.uSunDirFrame,
        uCamFrame: b.uniforms.uCamFrame,
        uLocalToFrame: { value: new THREE.Matrix4() },
        uTauR: b.uniforms.uTauR, uTauM: b.uniforms.uTauM, uHR: b.uniforms.uHR, uHM: b.uniforms.uHM,
        uOcc: b.uniforms.uOcc, uOccTint: b.uniforms.uOccTint,
      };
      const defines = { NUM_OCC: b.occluders.length };
      if (lumAlpha) defines.ALPHA_FROM_LUM = '';
      if (atm && b.id === 'earth') defines.USE_ATMO = '';
      if (this.quality.detail) defines.USE_DETAIL = '';
      b.cloudMaterial = new THREE.ShaderMaterial({
        vertexShader: S.PLANET_VERT, fragmentShader: S.CLOUD_FRAG, uniforms: b.cloudUniforms, defines,
        transparent: lumAlpha, depthWrite: !lumAlpha, side: THREE.FrontSide,
      });
      b.clouds = new THREE.Mesh(this.spheres[2], b.cloudMaterial);
      b.clouds.name = `${b.id}-clouds`;
      b.clouds.scale.setScalar(1 + r.clouds.heightR);
      b.clouds.renderOrder = 1;
      b.frame.add(b.clouds);
      b.clouds.visible = b.cloudsVisible;
    }

    // الغلاف الجوي
    if (atm) {
      const top = 1 + atm.topR;
      b.atmoUniforms = {
        uCamLocal: { value: new THREE.Vector3(5, 0, 0) },
        uSunDirLocal: { value: new THREE.Vector3(1, 0, 0) },
        uTop: { value: top },
        uHR: { value: atm.hR },
        uHM: { value: atm.hM },
        uBetaR: { value: new THREE.Vector3(...atm.tauR).divideScalar(atm.hR) },
        uBetaM: { value: new THREE.Vector3(...atm.tauM).divideScalar(atm.hM) },
        uG: { value: atm.g },
        uIntensity: { value: atm.intensity },
        uInside: { value: 0 },
        uSunVis: { value: 1 },
        uSunColor: sh.uSunColor,
        uSteps: { value: this.quality.atmoSteps },
      };
      b.atmosphere = new THREE.Mesh(this.spheres[1], new THREE.ShaderMaterial({
        vertexShader: S.ATMO_VERT, fragmentShader: S.ATMO_FRAG, uniforms: b.atmoUniforms,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      }));
      b.atmosphere.name = `${b.id}-atmosphere`;
      b.atmosphere.scale.set(top, top * b.oblate, top);
      b.atmosphere.renderOrder = 2;
      b.frame.add(b.atmosphere);
    }
  }

  _updateBumpScale(b) {
    const r = b.render;
    const k = r.bumpFromMap || 0;
    let s = 0;
    if (b.slots.map && b.slots.map.procedural) s = (b.id === 'earth' ? 0.004 : 0.012) * Math.max(k, 0.6);
    else if (b.slots.bump) s = 0.006 * Math.max(k, 1);
    else s = 0.004 * k;
    b.uniforms.uBumpScale.value = s;
  }

  /* ------------------------------------------------------- LOD للصور */
  /** يطلب مستوى دقة لجرم (مثلاً '8k') ويبدّل الصور عند جاهزيتها */
  async requestTier(b, tier) {
    if (!b || b.loadingTier || b.currentTier === tier) return;
    const cfg = TEXTURES.bodies[b.id] || {};
    const allowedSlots = this.quality.hiResSlots || ['map', 'night', 'clouds', 'normal', 'specular', 'ring'];
    const slots = Object.keys(cfg).filter((s) => cfg[s][tier] && allowedSlots.includes(s) && !this.textures.allMissing(cfg[s][tier]));
    if (tier === '8k' && slots.length === 0) { b.currentTier = tier; return; }
    b.loadingTier = tier;
    try {
      for (const slot of slots) {
        const cur = b.slots[slot];
        if (!cur || cur.procedural) continue; // لا نرفع الدقة فوق صورة مولّدة إلا إذا الأساسية موجودة
        const isColor = slot === 'map' || slot === 'night' || (slot === 'clouds' && b.id === 'venus') || slot === 'ring';
        const res = await this.textures.loadFirst(cfg[slot][tier], { srgb: isColor, repeat: slot !== 'ring' });
        if (!res || this.disposed) continue;
        this.renderer.initTexture(res.texture);
        const prev = b.slots[slot];
        b.slots[slot] = { texture: res.texture, name: res.name, tier, procedural: false, base: prev.base || prev, range: prev.range };
        this._assignSlot(b, slot);
        if (prev.tier === tier || (prev.base && prev !== prev.base)) this.textures.release(prev.name);
      }
      b.currentTier = tier;
    } finally {
      b.loadingTier = null;
    }
  }

  /** يرجع للدقة الأساسية ويحرر ذاكرة الدقة العالية */
  dropTier(b) {
    if (!b || b.currentTier !== '8k' || b.loadingTier) return;
    for (const slot of Object.keys(b.slots)) {
      const cur = b.slots[slot];
      if (cur && cur.base && cur.tier === '8k') {
        b.slots[slot] = cur.base;
        this._assignSlot(b, slot);
        this.textures.release(cur.name);
      }
    }
    b.currentTier = '2k';
  }

  _assignSlot(b, slot) {
    const t = b.slots[slot].texture;
    const u = b.uniforms;
    if (!u) return;
    if (slot === 'map') { u.uMap.value = t; u.uMapSize.value.copy(this._texSize(t)); u.uDetailScale.value = this._texSize(t).x / 9.4; }
    else if (slot === 'night') u.uNightMap.value = t;
    else if (slot === 'normal') u.uNormalMap.value = t;
    else if (slot === 'specular') u.uSpecMap.value = t;
    else if (slot === 'bump') { u.uBumpMap.value = t; u.uBumpSize.value.copy(this._texSize(t)); }
    else if (slot === 'ring') { u.uRingMap.value = t; if (b.ringUniforms) b.ringUniforms.uRingMap.value = t; }
    else if (slot === 'clouds') {
      u.uCloudMap.value = t;
      if (b.cloudUniforms) { b.cloudUniforms.uMap.value = t; b.cloudUniforms.uMapSize.value.copy(this._texSize(t)); b.cloudUniforms.uDetailScale.value = this._texSize(t).x / 9.4; }
    }
  }

  /* ------------------------------------------------------- تغيير الجودة */
  async setQuality(q) {
    const prev = this.quality;
    this.quality = q;
    const oldSpheres = this.spheres;
    this._buildGeometries();
    // صور مولّدة بحجم مختلف → إعادة توليد وتحرير القديم
    const regen = prev.procSize !== q.procSize;
    for (const b of this.bodies.values()) {
      if (b.isSun) {
        b.surface.geometry = this.spheres[0];
        b.surface.material.uniforms.uDetail.value = q.detail ? 1 : 0;
        continue;
      }
      if (regen) {
        for (const slot of Object.keys(b.slots)) {
          const s = b.slots[slot];
          if (s.procedural && s.texture.userData.rt) {
            const w = (b.type === 'moon' || b.type === 'dwarf') ? Math.min(q.procSize, 1024) : q.procSize;
            const name = s.texture.name.split(':')[1];
            const seed = slot === 'clouds' ? 3.3 : 1 + b.id.length * 0.37;
            const nt = this.textures.bake(name, w, seed);
            this.textures.disposeBake(s.texture);
            s.texture = nt;
            this._assignSlot(b, slot);
          }
        }
      }
      if (q.maxTier === '2k') this.dropTier(b);
      b.surfaceMaterial.defines = this._surfaceDefines(b);
      b.surfaceMaterial.needsUpdate = true;
      if (b.cloudMaterial) {
        if (q.detail) b.cloudMaterial.defines.USE_DETAIL = ''; else delete b.cloudMaterial.defines.USE_DETAIL;
        b.cloudMaterial.needsUpdate = true;
      }
      if (b.atmoUniforms) b.atmoUniforms.uSteps.value = q.atmoSteps;
      this._updateBumpScale(b);
      b.lodLevel = -1;
    }
    oldSpheres.forEach((g) => g.dispose());
  }

  setCloudsVisible(id, v) {
    const b = this.bodies.get(id);
    if (!b || !b.clouds) return;
    b.cloudsVisible = v;
    b.clouds.visible = v;
  }

  /* ------------------------------------------------------- تحديث الحالة */
  /**
   * يحسب المواقع الحقيقية والمعروضة والاتجاهات.
   * @param {number} jdTT اليوم اليولياني (TT)
   * @param {number} scaleT 0 = مقياس حقيقي، 1 = مقياس مرئي
   */
  updateState(jdTT, scaleT) {
    const real = astro.computeRealPositions(jdTT, this.real);
    const tmp = [0, 0, 0];
    const d = jdTT - CONSTANTS.J2000_JD;
    for (const b of this.bodies.values()) {
      b.displayRadius = astro.displayRadiusKm(b.data, scaleT);
      if (b.isSun) { b.displayPos.set(0, 0, 0); b.realPos = [0, 0, 0]; continue; }
      if (b.type !== 'moon') {
        b.realPos = real[b.id];
        astro.displaySunRelative(b.realPos, scaleT, tmp);
        eclToThree(tmp, b.displayPos);
      }
    }
    for (const b of this.bodies.values()) {
      if (b.type !== 'moon') continue;
      b.realPos = real[b.id];
      b.realRel = real['__rel_' + b.id];
      astro.displayMoonRelative(b.realRel, b.parent.data.radiusKm, scaleT, tmp);
      eclToThree(tmp, b.displayPos).add(b.parent.displayPos);
    }
    // الاتجاهات
    for (const b of this.bodies.values()) {
      const rot = b.data.rotation;
      if (rot.model === 'tidal') {
        // مقيّد مدّياً: خط الطول 0 يواجه الكوكب، والقطب = عمودي المدار
        const rel = b.realRel;
        const pf = astro.bodyEquatorFrame(b.parent.data, jdTT);
        const rel2 = astro.moonRelative(b.data, jdTT + 0.002, pf);
        const P = astro.norm(astro.cross(rel, rel2));
        let X = astro.norm([-rel[0], -rel[1], -rel[2]]);
        const k = astro.dot(X, P);
        X = astro.norm([X[0] - P[0] * k, X[1] - P[1] * k, X[2] - P[2] * k]);
        setBasisFromEcl(b.frame, X, P, astro.cross(P, X));
        if (b.surface) b.surface.rotation.y = 0;
      } else {
        const o = astro.iauOrientation(b.data, jdTT);
        const f = astro.equatorFrame(o.ra, o.dec);
        setBasisFromEcl(b.frame, f.N, f.P, f.Q);
        b.lastW = ((o.W % 360) + 360) % 360;
        if (b.surface) b.surface.rotation.y = b.lastW * DEG;
      }
      b.frame.scale.setScalar(b.displayRadius);
      if (b.clouds) {
        const c = b.render.clouds;
        if (c.rotationDays) b.clouds.rotation.y = ((360 * d / c.rotationDays) % 360) * DEG;
        else b.clouds.rotation.y = ((b.lastW + (c.driftDegPerDay || 0) * d) % 360) * DEG;
        if (b.uniforms) {
          // إزاحة الغيوم بالنسبة للسطح (لظلال الغيوم) بوحدة u
          const rel = (b.clouds.rotation.y - b.surface.rotation.y) / (Math.PI * 2);
          b.uniforms.uCloudOffset.value = rel - Math.floor(rel);
        }
      }
    }
  }

  /** يضع الأجرام نسبةً للأصل العائم */
  applyOrigin(origin) {
    for (const b of this.bodies.values()) b.root.position.copy(b.displayPos).sub(origin);
    this.sunLight.position.copy(this.sun.root.position);
  }

  /* ------------------------------------------------------- uniforms */
  updateUniforms(camera, timeSeconds, viewportHeight) {
    const sh = this.shared;
    sh.uTime.value = timeSeconds;
    this.group.updateMatrixWorld(true);
    const viewInv = camera.matrixWorldInverse;
    const sunWorld = this.sun.root.position;
    sh.uSunViewPos.value.copy(sunWorld).applyMatrix4(viewInv);
    const li = this.sunLight.intensity / Math.PI;
    sh.uSunColor.value.set(this.sunLight.color.r * li, this.sunLight.color.g * li, this.sunLight.color.b * li);
    const camPos = camera.position;

    for (const b of this.bodies.values()) {
      if (b.isSun) {
        // الكورونا تواجه الكاميرا دائماً
        b.corona.quaternion.copy(camera.quaternion);
        b.corona.scale.setScalar(b.displayRadius * b.corona.userData.scale);
        continue;
      }
      if (!b.uniforms) continue;
      const u = b.uniforms;
      _m4.copy(b.frame.matrixWorld).invert();
      _q.copy(b.frame.quaternion).invert();
      u.uSunDirFrame.value.copy(sunWorld).sub(b.root.position).applyQuaternion(_q).normalize();
      u.uCamFrame.value.copy(camPos).applyMatrix4(_m4);
      b.surface.updateMatrix();
      u.uLocalToFrame.value.copy(b.surface.matrix);
      if (b.cloudUniforms) { b.clouds.updateMatrix(); b.cloudUniforms.uLocalToFrame.value.copy(b.clouds.matrix); }
      for (let i = 0; i < b.occluders.length; i++) {
        const o = b.occluders[i];
        u.uOcc.value[i].set(o.root.position.x, o.root.position.y, o.root.position.z, 1).applyMatrix4(viewInv);
        u.uOcc.value[i].w = o.displayRadius;
      }
      const camDistR = u.uCamFrame.value.length();
      if (b.clouds) {
        const inside = camDistR < b.clouds.scale.x;
        b.cloudMaterial.side = inside ? THREE.BackSide : THREE.FrontSide;
      }
      if (b.atmoUniforms) {
        const a = b.atmoUniforms;
        const cf = u.uCamFrame.value;
        a.uCamLocal.value.set(cf.x, cf.y / b.oblate, cf.z);
        const sd = u.uSunDirFrame.value;
        a.uSunDirLocal.value.set(sd.x, sd.y / b.oblate, sd.z).normalize();
        const inside = a.uCamLocal.value.length() < a.uTop.value;
        a.uInside.value = inside ? 1 : 0;
        b.atmosphere.material.side = inside ? THREE.BackSide : THREE.FrontSide;
        a.uSunVis.value = this.sunVisibilityAt(b.root.position, b);
      }
      if (b.ringUniforms) {
        b.ringUniforms.uSunDirFrame.value.copy(u.uSunDirFrame.value);
        b.ringUniforms.uCamFrame.value.copy(u.uCamFrame.value);
        const dSun = b.root.position.distanceTo(sunWorld);
        const sunAng = this.sun.displayRadius / dSun;
        b.ringUniforms.uPenumbra.value = Math.max(0.002, sunAng * 2.5);
      }
    }
  }

  /** نسبة قرص الشمس الظاهر من نقطة (لخسوف الأقمار ككل) */
  sunVisibilityAt(point, self) {
    let vis = 1;
    const sunPos = this.sun.root.position;
    const toSun = _v1.copy(sunPos).sub(point);
    const ds = toSun.length();
    toSun.divideScalar(ds);
    const rs = Math.asin(Math.min(1, this.sun.displayRadius / ds));
    for (const o of self.occluders) {
      // نخفّت الغلاف الجوي كله فقط إذا الحاجب أكبر من الجرم (قمر في ظل كوكبه)
      if (o.displayRadius <= self.displayRadius) continue;
      const toO = _v2.copy(o.root.position).sub(point);
      const dO = toO.length();
      if (dO >= ds || toO.dot(toSun) <= 0) continue;
      toO.divideScalar(dO);
      const ro = Math.asin(Math.min(1, o.displayRadius / dO));
      const sep = 2 * Math.asin(Math.min(1, toO.distanceTo(toSun) / 2));
      vis -= discOverlap(rs, ro, sep);
    }
    return Math.max(0, vis);
  }

  /* ------------------------------------------------------- LOD للهندسة والصور */
  lodTick(camera, focus, viewportHeight, now) {
    const camPos = camera.position;
    const pxPerRad = viewportHeight / (2 * Math.tan((camera.fov * DEG) / 2));
    for (const b of this.bodies.values()) {
      const dist = Math.max(camPos.distanceTo(b.root.position), 1e-6);
      const ang = b.displayRadius / dist;
      b.apparentPx = ang * pxPerRad;
      const level = ang > 0.12 ? 0 : (ang > 0.012 ? 1 : 2);
      if (level !== b.lodLevel && !b.irregularScale) {
        b.lodLevel = level;
        if (b.surface) b.surface.geometry = this.spheres[level];
        if (b.clouds) b.clouds.geometry = this.spheres[level];
        if (b.atmosphere) b.atmosphere.geometry = this.spheres[Math.min(level + 0, 2)];
      }
      // صور 8K عند الاقتراب
      if (this.quality.maxTier === '8k' && this.quality.hiResOnApproach) {
        const want = b.apparentPx > 280 && (b === focus || this.quality.hiResAll || (this.quality.preloadHigh || []).includes(b.id));
        if (want) { b.lowSince = null; if (b.currentTier !== '8k') this.requestTier(b, '8k'); }
        else if (b.currentTier === '8k' && !(this.quality.preloadHigh || []).includes(b.id)) {
          if (b.apparentPx < 120) {
            b.lowSince = b.lowSince || now;
            if (now - b.lowSince > 20) this.dropTier(b);
          } else b.lowSince = null;
        }
      }
    }
  }

  /* ------------------------------------------------------- الاختيار بالنقر */
  /** يعيد أقرب جرم يقطعه الشعاع (بنصف قطر مضخّم قليلاً) */
  pick(ray, camera, viewportHeight, pointerNdc) {
    let best = null, bestT = Infinity;
    const pxPerRad = viewportHeight / (2 * Math.tan((camera.fov * DEG) / 2));
    for (const b of this.bodies.values()) {
      const c = b.root.position;
      const R = b.displayRadius * b.maxRadiusFactor;
      const oc = _v1.copy(ray.origin).sub(c);
      const bb = oc.dot(ray.direction);
      const cc = oc.lengthSq() - R * R;
      const h = bb * bb - cc;
      let t = Infinity;
      if (h >= 0) { t = -bb - Math.sqrt(h); if (t < 0) t = -bb + Math.sqrt(h); }
      if (t > 0 && t < bestT) { bestT = t; best = b; }
    }
    if (best) return best;
    // إذا الجرم صغير جداً: اختيار ضمن 14 بكسل من موقعه على الشاشة
    let bestD = 14;
    for (const b of this.bodies.values()) {
      _v2.copy(b.root.position).project(camera);
      if (_v2.z > 1 || _v2.z < -1) continue;
      const dx = (_v2.x - pointerNdc.x) * this.renderer.domElement.clientWidth / 2;
      const dy = (_v2.y - pointerNdc.y) * this.renderer.domElement.clientHeight / 2;
      const dpx = Math.hypot(dx, dy);
      if (dpx < bestD) { bestD = dpx; best = b; }
    }
    return best;
  }

  dispose() {
    this.disposed = true;
    for (const b of this.bodies.values()) {
      b.root.traverse((o) => {
        if (o.material) o.material.dispose();
        if (o.geometry && !this.spheres.includes(o.geometry)) o.geometry.dispose();
      });
    }
    this.spheres.forEach((g) => g.dispose());
  }
}

/** نسخة JS من دالة تداخل القرصين (للحسابات على مستوى الجرم كله) */
export function discOverlap(rs, ro, d) {
  if (d >= rs + ro) return 0;
  if (d <= Math.abs(ro - rs)) return ro >= rs ? 1 : (ro * ro) / (rs * rs);
  const rs2 = rs * rs, ro2 = ro * ro;
  const a1 = rs2 * Math.acos(Math.max(-1, Math.min(1, (d * d + rs2 - ro2) / (2 * d * rs))));
  const a2 = ro2 * Math.acos(Math.max(-1, Math.min(1, (d * d + ro2 - rs2) / (2 * d * ro))));
  const a3 = 0.5 * Math.sqrt(Math.max(0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  return Math.max(0, Math.min(1, (a1 + a2 - a3) / (Math.PI * rs2)));
}

/** إنشاء عنصر اسم للجرم (CSS2D) */
export function createLabel(b, onClick) {
  const el = document.createElement('div');
  el.className = `body-label type-${b.type}`;
  el.dataset.id = b.id;
  el.style.setProperty('--c', b.data.color);
  el.innerHTML = `<span class="dot"></span><span class="name">${b.data.nameAr}</span>`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(b.id); });
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0);
  b.root.add(obj);
  b.label = obj;
  b.labelEl = el;
  return obj;
}
