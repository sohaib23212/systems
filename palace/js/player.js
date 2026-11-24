/* ============================================================================
 *  player.js — التجوّل والكاميرا
 *  ---------------------------------------------------------------------------
 *  وضع التجوّل: كاميرا بمستوى العين (1.65 م) وكبسولة تصادم بحجم إنسان ضد
 *  شجرة Octree للجدران والأثاث، مع جاذبية وتسارع وتباطؤ ناعم واهتزاز خطوات.
 *  النظر: سحب بالماوس/الإصبع. الحركة: WASD/الأسهم أو عصا تحكم على الموبايل.
 *  وضع التصميم: OrbitControls فوق الغرف (الأسقف مخفية) لترتيب الأثاث.
 * ========================================================================== */
import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EYE = 1.65;
const RADIUS = 0.3;

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    camera.rotation.order = 'YXZ';
    this.collider = new Capsule(new THREE.Vector3(0, RADIUS, 0), new THREE.Vector3(0, EYE - 0.12, 0), RADIUS);
    this.velocity = new THREE.Vector3();
    this.onFloor = false;
    this.octree = new Octree();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.mode = 'walk';
    this.joy = new THREE.Vector2();
    this.bob = 0;
    this.enabled = true;
    this.lookDrag = null;
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = 1.42;
    this.orbit.minDistance = 4;
    this.orbit.maxDistance = 150;
    this.orbit.screenSpacePanning = false;
    this.orbit.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.tween = null;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  buildOctree(nodes) {
    this.octree = new Octree();
    for (const n of nodes) { n.updateMatrixWorld(true); this.octree.fromGraphNode(n); }
  }

  /** نقل فوري إلى موضع ونظرة */
  teleport(pos, yaw = this.yaw, pitch = 0) {
    this.collider.start.set(pos[0], RADIUS + 0.02, pos[2]);
    this.collider.end.set(pos[0], EYE - 0.12, pos[2]);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this._syncCamera(0);
  }

  get position() { return this.collider.end; }

  /** بدء السحب للنظر */
  beginLook(x, y) { this.lookDrag = { x, y }; }
  moveLook(x, y, touch = false) {
    if (!this.lookDrag) return;
    const k = touch ? 0.0045 : 0.0032;
    this.yaw -= (x - this.lookDrag.x) * k;
    this.pitch -= (y - this.lookDrag.y) * k;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    this.lookDrag.x = x; this.lookDrag.y = y;
  }
  endLook() { this.lookDrag = null; }

  setMode(mode, target, distance = 34) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'design') {
      this.orbit.enabled = true;
      const from = this.camera.position.clone();
      const t = target || new THREE.Vector3(this.position.x, 0, this.position.z);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * 0.6, 1.1, Math.cos(this.yaw) * 0.6).normalize();
      const to = t.clone().addScaledVector(dir, distance);
      this.orbit.target.copy(t);
      this.tween = { from, to, fromQ: this.camera.quaternion.clone(), t: 0, dur: 1.2, target: t.clone() };
    } else {
      this.orbit.enabled = false;
      this.tween = null;
      this._syncCamera(0);
    }
  }

  focusDesign(target, distance = 26) {
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    const to = target.clone().addScaledVector(dir, distance);
    this.tween = { from: this.camera.position.clone(), to, t: 0, dur: 1.0, target: target.clone(), fromTarget: this.orbit.target.clone() };
  }

  _collide() {
    const r = this.octree.capsuleIntersect(this.collider);
    this.onFloor = false;
    if (r) {
      this.onFloor = r.normal.y > 0.3;
      if (!this.onFloor) this.velocity.addScaledVector(r.normal, -r.normal.dot(this.velocity));
      if (r.depth >= 1e-10) this.collider.translate(r.normal.multiplyScalar(r.depth));
    }
  }

  _syncCamera(dt) {
    const c = this.camera;
    c.position.copy(this.collider.end);
    c.position.y += 0.12;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onFloor && speed > 0.3) this.bob += dt * (5 + speed * 1.6);
    const amp = Math.min(speed / 4, 1) * 0.022;
    c.position.y += Math.sin(this.bob * 2) * amp;
    c.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * amp * 0.15);
  }

  update(dt) {
    if (this.mode === 'design') {
      if (this.tween) {
        const tw = this.tween;
        tw.t += dt;
        const s = Math.min(1, tw.t / tw.dur);
        const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
        this.camera.position.lerpVectors(tw.from, tw.to, e);
        if (tw.fromTarget) this.orbit.target.lerpVectors(tw.fromTarget, tw.target, e);
        this.camera.lookAt(this.orbit.target);
        if (s >= 1) this.tween = null;
      } else {
        this.orbit.update(dt);
      }
      return;
    }
    if (!this.enabled) { this._syncCamera(dt); return; }
    const steps = 5;
    const h = Math.min(dt, 0.05) / steps;
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyA')) fx -= 1;
    if (k.has('KeyD')) fx += 1;
    if (k.has('ArrowLeft')) this.yaw += dt * 1.8;
    if (k.has('ArrowRight')) this.yaw -= dt * 1.8;
    if (k.has('KeyQ')) this.yaw += dt * 1.8;
    if (k.has('KeyE')) this.yaw -= dt * 1.8;
    fx += this.joy.x; fz += this.joy.y;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const maxV = run ? 6.0 : 2.8;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = fwd.multiplyScalar(fz * maxV).add(right.multiplyScalar(fx * maxV));
    for (let i = 0; i < steps; i++) {
      const accel = this.onFloor ? 9 : 2;
      this.velocity.x += (want.x - this.velocity.x) * Math.min(1, accel * h);
      this.velocity.z += (want.z - this.velocity.z) * Math.min(1, accel * h);
      if (!this.onFloor) this.velocity.y -= 25 * h;
      else this.velocity.y = Math.max(this.velocity.y, -1);
      this.collider.translate(this.velocity.clone().multiplyScalar(h));
      this._collide();
    }
    // حماية: إذا سقط تحت الأرض نعيده
    if (this.collider.end.y < -5) this.teleport([0, 0, 40], 0);
    this._syncCamera(dt);
  }
}

/** عصا تحكم افتراضية للّمس */
export class Joystick {
  constructor(el, player) {
    this.el = el;
    this.knob = el.querySelector('.knob');
    this.player = player;
    this.id = null;
    const R = 46;
    const move = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      player.joy.set(dx / R, -dy / R);
    };
    el.addEventListener('pointerdown', (e) => { this.id = e.pointerId; el.setPointerCapture(e.pointerId); move(e); e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === this.id) move(e); });
    const end = (e) => { if (e.pointerId !== this.id) return; this.id = null; this.knob.style.transform = ''; player.joy.set(0, 0); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
