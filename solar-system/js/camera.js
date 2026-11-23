/* ============================================================================
 *  camera.js — الكاميرا والتنقل
 *  ---------------------------------------------------------------------------
 *  - OrbitControls حول الجرم المختار (لف 360°، تكبير بالعجلة أو بإصبعين)
 *  - تكبير "على الارتفاع" وليس على المسافة: من مدار منخفض كأنك قمر صناعي
 *    لحد منظر النظام الشمسي كله بحركة سلسة
 *  - إمالة تلقائية نحو الأفق عند الاقتراب من السطح (منظر قمر صناعي)
 *  - طيران ناعم (easing) بمسار لوغاريتمي يتجنب اختراق أي جرم
 *  - وضع التتبع: الكاميرا تلحق الجرم وهو ماشي بمداره
 *  - أصل عائم (floating origin) لمنع اهتزاز الأرقام بالمسافات الضخمة
 * ========================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class CameraRig {
  constructor(renderer, system) {
    this.system = system;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1e12);
    this.camera.position.set(0, 0, 1e6);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    const c = this.controls;
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.085;
    c.zoomSpeed = 1.4;
    c.rotateSpeed = 0.8;
    c.minDistance = 0;
    c.maxDistance = Infinity;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

    this.origin = new THREE.Vector3();     // الأصل العائم بإحداثيات العرض المطلقة (كم)
    this.focus = null;                     // الجرم المختار
    this.tracking = true;                  // وضع التتبع
    this.flight = null;
    this.horizonTilt = true;
    this.maxDistance = 6e10;
    this.lastFocusRadius = null;
    this.lastExtent = null;
    this.altitude = 0;                     // الارتفاع عن سطح الجرم المختار (وحدات العرض)
    this.onFlightEnd = null;
    this.userInteracting = false;
    c.addEventListener('start', () => { this.userInteracting = true; if (this.flight) this.cancelFlight(); });
    c.addEventListener('end', () => { this.userInteracting = false; });
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  get cameraAbs() { return _v2.copy(this.camera.position).add(this.origin); }

  /* ----------------------------------------------------- الطيران */
  /**
   * طيران ناعم لجرم.
   * @param {Body} body
   * @param {{distance?:number, dir?:THREE.Vector3, duration?:number}} opts
   */
  flyTo(body, opts = {}) {
    const sys = this.system;
    const camAbs = this.camera.position.clone().add(this.origin);
    const lookAbs = this.controls.target.clone().add(this.origin);
    const bodyPos = body.displayPos.clone();
    const rel0 = camAbs.clone().sub(bodyPos);
    const d0 = Math.max(rel0.length(), 1e-6);
    const dir0 = rel0.clone().divideScalar(d0);
    const d1 = opts.distance ?? body.viewDistance();
    let dir1;
    if (opts.dir) dir1 = opts.dir.clone().normalize();
    else if (body.isSun) dir1 = dir0.clone();
    else {
      const toSun = bodyPos.clone().negate().normalize();
      dir1 = toSun.multiplyScalar(0.55).add(dir0.clone().multiplyScalar(0.6)).add(UP.clone().multiplyScalar(0.22)).normalize();
    }
    // اختيار مسار لا يقطع أي جرم
    const side = new THREE.Vector3().crossVectors(dir0, UP);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    const candidates = [new THREE.Vector3(), UP.clone().multiplyScalar(0.8), UP.clone().multiplyScalar(-0.8), side.clone().multiplyScalar(0.9), side.clone().multiplyScalar(-0.9), UP.clone().multiplyScalar(1.6)];
    let best = candidates[0], bestClear = -Infinity;
    for (const lift of candidates) {
      const clear = this._pathClearance(body, bodyPos, dir0, dir1, d0, d1, lift);
      if (clear > 1.0) { best = lift; bestClear = clear; break; }
      if (clear > bestClear) { bestClear = clear; best = lift; }
    }
    const ratio = Math.abs(Math.log(d0 / d1));
    const duration = opts.duration ?? clamp(1.5 + 0.3 * ratio, 1.8, 6.5);
    this.flight = { body, d0, d1, dir0, dir1, lift: best, lookAbs0: lookAbs, t: 0, duration, dirQ: new THREE.Quaternion().setFromUnitVectors(dir0, dir1) };
    this.controls.enabled = false;
    if (this.focus !== body) this.lastFocusRadius = null;
  }

  /** أدنى نسبة (مسافة/نصف قطر) لأي جرم على المسار المقترح (>1 يعني آمن) */
  _pathClearance(target, bodyPos, dir0, dir1, d0, d1, lift) {
    const q = new THREE.Quaternion().setFromUnitVectors(dir0, dir1);
    const qi = new THREE.Quaternion();
    let minClear = Infinity;
    for (let i = 1; i < 48; i++) {
      const s = i / 48;
      const e = easeInOutCubic(s);
      qi.identity().slerp(q, e);
      _v.copy(dir0).applyQuaternion(qi).addScaledVector(lift, Math.sin(Math.PI * e)).normalize();
      const dist = Math.exp(Math.log(d0) * (1 - smoother(s)) + Math.log(d1) * smoother(s));
      const p = _v.multiplyScalar(dist).add(bodyPos);
      for (const b of this.system.bodies.values()) {
        const R = b.displayRadius * b.maxRadiusFactor * (b.isSun ? 2.5 : 1.4);
        const isTarget = b === target;
        const dd = p.distanceTo(b.displayPos);
        const clear = dd / R;
        if (isTarget && s > 0.8) continue;
        if (clear < minClear) minClear = clear;
      }
    }
    return minClear;
  }

  cancelFlight() {
    if (!this.flight) return;
    const f = this.flight;
    this.flight = null;
    this.controls.enabled = true;
    this.focus = f.body;
    this.tracking = true;
    // استمرار سلس من الوضع الحالي: نفس موقع الكاميرا المطلق، والهدف = الجرم
    const camAbs = this.camera.position.clone().add(this.origin);
    this.origin.copy(f.body.displayPos);
    this.camera.position.copy(camAbs).sub(this.origin);
    this.controls.target.set(0, 0, 0);
    this.lastFocusRadius = f.body.displayRadius;
    this.onFlightEnd && this.onFlightEnd(f.body);
  }

  flyOverview(extent) {
    const sun = this.system.sun;
    const camAbs = this.camera.position.clone().add(this.origin);
    let az = Math.atan2(camAbs.z, camAbs.x);
    if (!isFinite(az)) az = 0.6;
    const el = 32 * DEG;
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    this.flyTo(sun, { distance: extent * 2.4, dir, duration: 3.5 });
  }

  /** منظر قمر صناعي: مدار منخفض (~6.5% من نصف القطر) فوق نفس البقعة */
  flySatellite(body) {
    const camAbs = this.camera.position.clone().add(this.origin);
    const dir = camAbs.sub(body.displayPos).normalize();
    this.flyTo(body, { distance: body.eqRadius * 1.065, dir, duration: 3.2 });
  }

  /* ----------------------------------------------------- كل إطار */
  /** المرحلة 1: تحديد الأصل العائم (قبل وضع الأجرام) */
  computeOrigin(dt) {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const s = clamp(f.t / f.duration, 0, 1);
      const e = easeInOutCubic(s);
      const bodyPos = f.body.displayPos;
      const qi = _q.identity().slerp(f.dirQ, e);
      const dir = _v.copy(f.dir0).applyQuaternion(qi).addScaledVector(f.lift, Math.sin(Math.PI * e)).normalize();
      const ds = smoother(s);
      const dist = Math.exp(Math.log(f.d0) * (1 - ds) + Math.log(f.d1) * ds);
      const camAbs = dir.multiplyScalar(dist).add(bodyPos);
      const le = easeOutCubic(clamp(s * 1.7, 0, 1));
      const lookAbs = _v2.copy(f.lookAbs0).lerp(bodyPos, le);
      this.origin.copy(lookAbs);
      this.camera.position.copy(camAbs).sub(this.origin);
      this.controls.target.set(0, 0, 0);
      if (s >= 1) {
        this.flight = null;
        this.focus = f.body;
        this.tracking = true;
        this.controls.enabled = true;
        this.lastFocusRadius = f.body.displayRadius;
        this.onFlightEnd && this.onFlightEnd(f.body);
      }
      return this.origin;
    }
    if (this.focus && this.tracking) {
      // الكاميرا تلحق الجرم: الأصل = موقع الجرم
      this.origin.copy(this.focus.displayPos);
      this.controls.target.set(0, 0, 0);
    }
    return this.origin;
  }

  /** المرحلة 2: التحكم والتكبير والإمالة ومنع الاختراق (بعد وضع الأجرام) */
  updateCamera(dt, extent) {
    const cam = this.camera;
    const c = this.controls;
    const focus = this.focus;
    if (!this.flight) {
      // انتقال المقياس: نحافظ على التأطير
      if (focus && this.tracking) {
        if (focus.isSun && cam.position.length() > focus.displayRadius * 40) {
          if (this.lastExtent) cam.position.multiplyScalar(extent / this.lastExtent);
        } else if (this.lastFocusRadius) {
          const r = focus.displayRadius / this.lastFocusRadius;
          if (Math.abs(r - 1) > 1e-12) cam.position.sub(c.target).multiplyScalar(r).add(c.target);
        }
      }
      // سرعة اللف حسب الارتفاع (أبطأ قرب السطح)
      if (focus) {
        const R = focus.surfaceRadiusToward(cam.position);
        const d = cam.position.distanceTo(focus.root.position);
        const alt = Math.max(d - R, 1e-9);
        c.rotateSpeed = clamp(0.5 * alt / focus.eqRadius, 0.002, 0.9);
      }
      const before = cam.position.distanceTo(c.target);
      c.update(dt);
      const after = cam.position.distanceTo(c.target);
      if (focus && this.tracking && Math.abs(after - before) > before * 1e-9) {
        // تكبير على الارتفاع وليس على المسافة
        const R = focus.surfaceRadiusToward(cam.position);
        const minAlt = this._minAltitude(focus);
        const alt0 = Math.max(before - R, minAlt);
        let alt1 = alt0 * Math.pow(after / before, 1.25);
        alt1 = clamp(alt1, minAlt, this.maxDistance);
        cam.position.sub(c.target).setLength(R + alt1).add(c.target);
      } else if (after > this.maxDistance) {
        cam.position.sub(c.target).setLength(this.maxDistance).add(c.target);
      }
    } else {
      cam.lookAt(c.target);
    }

    // منع اختراق أي جرم
    for (const b of this.system.bodies.values()) {
      const center = b.root.position;
      const R = b.surfaceRadiusToward(cam.position);
      const minD = R + this._minAltitude(b);
      const d = cam.position.distanceTo(center);
      if (d < minD) cam.position.sub(center).setLength(minD).add(center);
    }

    // الإمالة نحو الأفق عند الاقتراب (منظر قمر صناعي)
    if (focus && !this.flight) {
      cam.lookAt(c.target);
      const R = focus.eqRadius;
      const dist = cam.position.distanceTo(focus.root.position);
      const alt = Math.max(dist - focus.surfaceRadiusToward(cam.position), 0);
      this.altitude = alt;
      if (this.horizonTilt && !focus.isSun) {
        const dip = Math.acos(clamp(R / (R + alt), -1, 1));
        const fovV = cam.fov * DEG;
        let tilt = Math.max(0, Math.PI / 2 - dip - 0.25 * fovV);
        tilt *= 1 - smoothstep(0.15 * R, 0.8 * R, alt);
        if (tilt > 1e-4) cam.rotateX(tilt);
      }
    } else if (focus) {
      this.altitude = Math.max(cam.position.distanceTo(focus.root.position) - focus.surfaceRadiusToward(cam.position), 0);
    }

    // المستوي القريب ديناميكي حسب أقرب سطح
    let nearest = Infinity;
    for (const b of this.system.bodies.values()) {
      const d = cam.position.distanceTo(b.root.position) - b.surfaceRadiusToward(cam.position);
      if (d < nearest) nearest = d;
    }
    const near = clamp(nearest * 0.25, 1e-4, 1e5);
    if (Math.abs(near - cam.near) / cam.near > 0.05) { cam.near = near; cam.updateProjectionMatrix(); }

    if (focus) this.lastFocusRadius = focus.displayRadius;
    this.lastExtent = extent;
    cam.updateMatrixWorld();
  }

  _minAltitude(b) {
    const k = (b.render && b.render.minAltitudeR) || 0.002;
    return Math.max(b.eqRadius * k, 1e-4);
  }

  /** تكبير برمجي (أزرار + / −): يضرب الارتفاع بمعامل */
  zoom(factor) {
    const f = this.focus;
    if (!f || this.flight) return;
    const c = this.controls;
    const R = f.surfaceRadiusToward(this.camera.position);
    const d = this.camera.position.distanceTo(c.target);
    const alt = clamp((d - R) * factor, this._minAltitude(f), this.maxDistance);
    this.camera.position.sub(c.target).setLength(R + alt).add(c.target);
  }

  setTracking(v) {
    if (this.tracking === v) return;
    this.tracking = v;
    if (v && this.focus) this.flyTo(this.focus, { distance: Math.max(this.camera.position.distanceTo(this.controls.target), this.focus.eqRadius * 1.2), duration: 1.6 });
  }
}
