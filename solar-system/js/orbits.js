/* ============================================================================
 *  orbits.js — خطوط المدارات الإهليلجية
 *  ---------------------------------------------------------------------------
 *  - الكواكب: نقاط من عناصر JPL الحالية على امتداد دورة كاملة تنتهي عند الكوكب
 *    (أثر يتلاشى خلف الكوكب)، ثم تحويلها للمقياس المعروض.
 *  - الأقمار: مدار حول الكوكب الأم (والقمر: مساره الفعلي مع الاضطرابات).
 *  - الرؤوس نسبية لنقطة ارتكاز قريبة من الجرم → دقة عالية عند التقريب.
 * ========================================================================== */
import * as THREE from 'three';
import * as astro from './astro.js';
import { ORBIT_VERT, ORBIT_FRAG } from './shaders.js';
import { eclToThree } from './bodies.js';

const TWO_PI = Math.PI * 2;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class OrbitLines {
  constructor(parent, system) {
    this.system = system;
    this.group = new THREE.Group();
    this.group.name = 'orbits';
    parent.add(this.group);
    this.lines = [];
    this.showMoons = true;
    for (const b of system.bodies.values()) {
      if (b.isSun) continue;
      const isMoon = b.type === 'moon';
      const N = isMoon ? 360 : 720;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array((N + 1) * 3);
      const t = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) t[i] = i / N;
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      const uniforms = {
        uColor: { value: new THREE.Color(b.data.color) },
        uOpacity: { value: isMoon ? 0.45 : 0.6 },
        uBodyLocal: { value: new THREE.Vector3() },
        uFade: { value: 1 },
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: ORBIT_VERT, fragmentShader: ORBIT_FRAG, uniforms,
        transparent: true, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.renderOrder = 4;
      line.name = `orbit-${b.id}`;
      this.group.add(line);
      this.lines.push({ body: b, line, geo, pos, N, uniforms, isMoon, lastJd: null, lastT: null, anchor: new THREE.Vector3() });
    }
  }

  setVisible(v) { this.group.visible = v; }
  setMoonsVisible(v) { this.showMoons = v; }

  /**
   * @param {number} jdTT
   * @param {number} scaleT
   * @param {THREE.Vector3} origin الأصل العائم
   */
  update(jdTT, scaleT, origin) {
    if (!this.group.visible) return;
    const tmp = [0, 0, 0];
    for (const L of this.lines) {
      const b = L.body;
      L.line.visible = !L.isMoon || this.showMoons;
      if (!L.line.visible) continue;
      const period = astro.orbitalPeriodDays(b.data);
      const stale = L.lastJd === null || Math.abs(jdTT - L.lastJd) > period / 1500 || L.lastT !== scaleT;
      if (stale) {
        this._resample(L, jdTT, scaleT, period, tmp);
        L.lastJd = jdTT;
        L.lastT = scaleT;
      }
      if (L.isMoon) {
        L.line.position.copy(b.parent.displayPos).sub(origin);
        L.uniforms.uBodyLocal.value.copy(b.displayPos).sub(b.parent.displayPos);
      } else {
        L.line.position.copy(L.anchor).sub(origin);
        L.uniforms.uBodyLocal.value.copy(b.displayPos).sub(L.anchor);
      }
      L.uniforms.uFade.value = b.displayRadius * 1.6;
    }
  }

  _resample(L, jdTT, scaleT, period, tmp) {
    const b = L.body;
    const N = L.N;
    const pos = L.pos;
    if (!L.isMoon) {
      const el = astro.planetElements(b.data, jdTT);
      // آخر نقطة = موقع الكوكب الآن (نقطة الارتكاز)
      astro.displaySunRelative(astro.positionFromElements(el, el.M), scaleT, tmp);
      eclToThree(tmp, L.anchor);
      for (let i = 0; i <= N; i++) {
        const M = el.M - TWO_PI * (1 - i / N);
        astro.displaySunRelative(astro.positionFromElements(el, M), scaleT, tmp);
        eclToThree(tmp, _v).sub(L.anchor);
        pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      }
    } else {
      const parentR = b.parent.data.radiusKm;
      let frame = null, el = null;
      if (b.data.orbit.model === 'mean') {
        frame = astro.bodyEquatorFrame(b.parent.data, jdTT);
        el = astro.moonMeanElements(b.data, jdTT);
      }
      for (let i = 0; i <= N; i++) {
        let rel;
        if (b.data.orbit.model === 'lunar') rel = astro.moonGeocentric(jdTT - period * (1 - i / N));
        else rel = astro.moonRelative(b.data, jdTT, frame, el.M - TWO_PI * (1 - i / N));
        astro.displayMoonRelative(rel, parentR, scaleT, tmp);
        eclToThree(tmp, _w);
        pos[i * 3] = _w.x; pos[i * 3 + 1] = _w.y; pos[i * 3 + 2] = _w.z;
      }
    }
    L.geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    for (const L of this.lines) { L.geo.dispose(); L.line.material.dispose(); }
    this.group.parent && this.group.parent.remove(this.group);
  }
}
