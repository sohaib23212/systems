/* ============================================================================
 *  environment.js — السماء والشمس والوقت والإضاءة غير المباشرة والانعكاسات
 *  ---------------------------------------------------------------------------
 *  - سماء فيزيائية (Preetham) مع غيوم، وشمس تتحرك حسب الساعة (شروق شرقاً،
 *    ظهر جنوباً، غروب غرباً) وظلال ناعمة، وقمر ونجوم ليلاً
 *  - مجسّات بيئية (Light Probes) لكل غرفة: تُلتقط صورة 360° من داخل الغرفة
 *    (مرتين = ارتداد ضوئي ثانٍ) فتعطي إضاءة غير مباشرة وانعكاسات حقيقية
 *  - انعكاس مستوٍ للأرضيات المصقولة والماء
 * ========================================================================== */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { ROOMS } from './config.js';
import { REFLECT } from './materials.js';
import { kelvin } from './furniture.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.hours = 16.5;
    this.exposure = 1;
    this.interior = { mode: 'auto', dimmer: 1, kelvin: 2900 };
    this.lightItems = [];

    // السماء
    this.sky = new Sky();
    this.sky.scale.setScalar(3000);
    const u = this.sky.material.uniforms;
    u.uSkyGain = { value: 1 };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float uSkyGain;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uSkyGain, 1.0 );');
    u.turbidity.value = 3.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    u.cloudCoverage.value = 0.28; u.cloudDensity.value = 0.35; u.cloudScale.value = 0.00018;
    this.sky.userData.room = 'sky';
    scene.add(this.sky);

    // الشمس (المصدر الأساسي للظلال)
    this.sun = new THREE.DirectionalLight(0xffffff, 3.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = quality.shadowRadius;
    const sc = this.sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 260;
    this.sun.target.position.set(0, 0, -2);
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0);
    scene.add(this.moon, this.moon.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a7458, 0.3);
    scene.add(this.hemi);

    // نجوم
    const n = 3000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u1 = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u1 * u1);
      pos.set([r * Math.cos(th) * 1500, Math.abs(u1) * 1500, r * Math.sin(th) * 1500], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starsMat);
    this.stars.userData.room = 'sky';
    scene.add(this.stars);

    scene.fog = new THREE.Fog(0xcfd8e0, 160, 900);

    // المجسّات
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.probes = new Map();
    this.cubeRT = null;
    this._dirty = true;
    this.dayEmissive = [];
    this.nightEmissive = [];
    this.pointLights = [];
  }

  /* ------------------------------------------------------------ الوقت */
  sunState(h) {
    let el;
    if (h >= 6 && h <= 18) el = 62 * Math.sin(Math.PI * (h - 6) / 12);
    else { const hh = h < 6 ? h + 24 : h; el = -24 * Math.sin(Math.PI * (hh - 18) / 12); }
    const az = 90 + ((h - 6) / 12) * 180;
    return { el: (el * Math.PI) / 180, az: (az * Math.PI) / 180 };
  }

  setTime(h) {
    this.hours = ((h % 24) + 24) % 24;
    const { el, az } = this.sunState(this.hours);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sunDir = dir;
    const day = smooth(-0.05, 0.12, Math.sin(el));
    this.day = day;
    const warm = smooth(0.0, 0.45, Math.sin(el));
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 120);
    this.sun.intensity = 3.8 * smooth(-0.01, 0.1, Math.sin(el));
    this.sun.color.copy(kelvin(1900 + 3900 * warm));
    this.sun.visible = this.sun.intensity > 0.001;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.turbidity.value = 3 + 5 * (1 - warm);
    u.rayleigh.value = 1.2 + 1.8 * (1 - warm);
    u.uSkyGain.value = 0.55 + 0.45 * day;
    // القمر
    const night = 1 - smooth(-0.12, 0.05, Math.sin(el));
    this.night = night;
    this.moon.intensity = 0.22 * night;
    this.moon.position.set(-dir.x * 100 + 20, 80, -dir.z * 100 + 30);
    this.starsMat.opacity = night * 0.9;
    this.hemi.intensity = 0.06 + 0.28 * day;
    this.hemi.color.copy(kelvin(4500 + 3000 * warm)).lerp(new THREE.Color(0x203050), night * 0.8);
    this.hemi.groundColor.set(0x8a7458).multiplyScalar(0.3 + 0.7 * day);
    // ضباب بلون الأفق
    this.scene.fog.color.copy(kelvin(3000 + 4000 * warm)).multiplyScalar(0.25 + 0.6 * day).lerp(new THREE.Color(0x0a1020), night);
    // التعريض: العين تتكيّف ليلاً
    this.expBase = this.exposure * (1 + 0.3 * night);
    this.renderer.toneMappingExposure = this.expBase;
    this.evening = 1 - smooth(0.08, 0.5, Math.sin(el));
    for (const e of this.dayEmissive) e.mat.emissiveIntensity = e.base * (0.05 + 0.95 * day);
    for (const e of this.nightEmissive) e.mat.emissiveIntensity = e.base * night;
    for (const l of this.pointLights) if (l.night) l.light.intensity = l.base * night;
    this.applyInterior();
    this._dirty = true;
  }

  /** تشغيل/إطفاء/تعتيم أضواء الثريات والمصابيح + حرارة اللون */
  applyInterior() {
    const mode = this.interior.mode;
    // تلقائي: الثريات مضاءة دائماً بنسبة خفيفة نهاراً وتشتد مع الغروب والليل (كما في القصور)
    const on = mode !== 'off';
    const autoK = 0.3 + 0.7 * Math.max(this.evening ?? 1, this.night ?? 0);
    const k = on ? this.interior.dimmer * (mode === 'auto' ? autoK : 1) : 0;
    const col = kelvin(this.interior.kelvin);
    for (const it of this.lightItems) {
      for (const l of it.userData.lights || []) {
        if (l.fire) { l.light.userData.on = true; continue; }
        l.light.intensity = l.base * k;
        l.light.color.copy(col);
        l.light.visible = k > 0.001;
      }
      for (const gl of it.userData.glows || []) {
        gl.mat.emissiveIntensity = gl.base * (on ? Math.max(0.15, k) : 0.05);
        if (gl.mat.emissive) gl.mat.emissive.copy(col).lerp(new THREE.Color('#fff2d8'), 0.3);
      }
    }
    this.interiorOn = on;
  }

  registerLights(items) { this.lightItems = items; this.applyInterior(); }

  /* ------------------------------------------------------------ المجسّات البيئية */
  probePoints(palace) {
    const pts = [];
    for (const r of ROOMS) {
      const [x0, z0, x1, z1] = r.rect;
      pts.push({ id: r.id, pos: new THREE.Vector3((x0 + x1) / 2, r.dome ? 3.2 : r.open ? 2.2 : 1.8, (z0 + z1) / 2) });
    }
    pts.push({ id: 'exterior', pos: new THREE.Vector3(0, 2.5, 34) });
    void palace;
    return pts;
  }

  /** يلتقط صور 360° لكل غرفة ويحوّلها لخرائط بيئة مُرشّحة (PMREM) */
  captureProbes(palace, onProgress) {
    const size = this.quality.probeSize;
    if (!this.cubeRT || this.cubeRT.width !== size) {
      this.cubeRT && this.cubeRT.dispose();
      this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
      this.cubeCam = new THREE.CubeCamera(0.05, 1200, this.cubeRT);
    }
    const pts = this.probePoints(palace);
    const r = this.renderer;
    const prevRefl = REFLECT.uReflOn.value;
    REFLECT.uReflOn.value = 0;
    const prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    const bounces = this.quality.bounces;
    for (let b = 0; b < bounces; b++) {
      pts.forEach((p, i) => {
        this.cubeCam.position.copy(p.pos);
        this.cubeCam.update(r, this.scene);
        const prev = this.probes.get(p.id);
        const out = this.pmrem.fromCubemap(this.cubeRT.texture, prev || null);
        this.probes.set(p.id, out);
        onProgress && onProgress((b * pts.length + i + 1) / (bounces * pts.length));
      });
      this.assignProbes();
    }
    r.shadowMap.autoUpdate = prevAuto;
    REFLECT.uReflOn.value = prevRefl;
    this._dirty = false;
  }

  /** يربط كل مادة بخريطة غرفتها */
  assignProbes(root = this.scene) {
    const ext = this.probes.get('exterior');
    root.traverse((o) => {
      if (!o.isMesh || !o.material || o.userData.room === 'sky') return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let room = o.userData.room;
      if (!room && o.userData.item) room = o.userData.item.userData.room;
      const probe = this.probes.get(room) || ext;
      if (!probe) return;
      for (const m of mats) {
        if (!('envMap' in m) || m.isShaderMaterial) continue;
        if (m.envMap !== probe.texture) {
          const had = !!m.envMap;
          m.envMap = probe.texture;
          if (!had) m.needsUpdate = true;
        }
      }
    });
  }

  dispose() {
    for (const p of this.probes.values()) p.dispose();
    this.cubeRT && this.cubeRT.dispose();
    this.pmrem.dispose();
  }
}

/* ============================================================================
 *  انعكاس مستوٍ للأرضية (y = 0) — يُرسم المشهد من كاميرا معكوسة إلى صورة
 *  بمستويات mipmap، والأرضيات تأخذ منها حسب خشونتها (ضبابي للأقل لمعاناً)
 * ========================================================================== */
export class FloorReflector {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.scale = 0;
    this.rt = null;
    this.virtualCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = REFLECT.uReflMatrix.value;
    this.hidden = [];
    this._v = {
      normal: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(), camPos: new THREE.Vector3(), rot: new THREE.Matrix4(),
      look: new THREE.Vector3(0, 0, -1), view: new THREE.Vector3(), target: new THREE.Vector3(), plane: new THREE.Plane(),
      clip: new THREE.Vector4(), q: new THREE.Vector4(),
    };
  }

  setScale(scale, w, h) {
    this.scale = scale;
    if (!scale) { REFLECT.uReflOn.value = 0; return; }
    const W = Math.max(64, Math.round(w * scale)), H = Math.max(64, Math.round(h * scale));
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(W, H, {
        type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      });
      REFLECT.uReflTex.value = this.rt.texture;
    } else this.rt.setSize(W, H);
    REFLECT.uReflMaxLod.value = Math.log2(Math.max(W, H)) - 2;
  }

  setHidden(list) { this.hidden = list; }

  update(camera) {
    if (!this.scale || !this.rt) { REFLECT.uReflOn.value = 0; return; }
    const v = this._v;
    v.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (v.camPos.y <= 0.01) { REFLECT.uReflOn.value = 0; return; }
    v.view.copy(v.camPos);
    v.view.y = -v.view.y;
    v.rot.extractRotation(camera.matrixWorld);
    v.look.set(0, 0, -1).applyMatrix4(v.rot).add(v.camPos);
    v.target.copy(v.look);
    v.target.y = -v.target.y;
    const vc = this.virtualCamera;
    vc.position.copy(v.view);
    vc.up.set(0, 1, 0).applyMatrix4(v.rot);
    vc.up.y = -vc.up.y;
    vc.lookAt(v.target);
    vc.near = camera.near; vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // مستوي قص مائل حتى لا يظهر ما تحت الأرض
    v.plane.setFromNormalAndCoplanarPoint(v.normal, v.pos.set(0, 0, 0));
    v.plane.applyMatrix4(vc.matrixWorldInverse);
    v.clip.set(v.plane.normal.x, v.plane.normal.y, v.plane.normal.z, v.plane.constant);
    const pm = vc.projectionMatrix;
    v.q.x = (Math.sign(v.clip.x) + pm.elements[8]) / pm.elements[0];
    v.q.y = (Math.sign(v.clip.y) + pm.elements[9]) / pm.elements[5];
    v.q.z = -1.0;
    v.q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    v.clip.multiplyScalar(2.0 / v.clip.dot(v.q));
    pm.elements[2] = v.clip.x; pm.elements[6] = v.clip.y; pm.elements[10] = v.clip.z + 1.0 - 0.003; pm.elements[14] = v.clip.w;
    const r = this.renderer;
    for (const m of this.hidden) m.visible = false;
    REFLECT.uReflOn.value = 0;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, vc);
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevAuto;
    for (const m of this.hidden) m.visible = true;
    REFLECT.uReflOn.value = 1;
  }

  dispose() { this.rt && this.rt.dispose(); }
}
