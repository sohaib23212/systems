/* ============================================================================
 *  geom.js — أدوات الهندسة المشتركة
 *  - أقواس: نصف دائري، مدبب (قوطي/إسلامي)، حدوة الحصان (أندلسي)، مستقيم
 *  - إحداثيات UV بالمتر (حتى تبقى أحجام الخامات حقيقية على كل سطح)
 *  - دمج الأجزاء حسب المادة لتقليل أوامر الرسم
 * ========================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * نقاط حافة قوس من أسفل اليسار إلى أسفل اليمين (x من −w/2 إلى w/2)
 * h = الارتفاع الكلي من sill إلى القمة
 */
export function archPoints(w, h, type = 'round', sill = 0, seg = 28) {
  const L = -w / 2, R = w / 2, top = sill + h;
  const pts = [];
  const push = (x, y) => {
    const p = pts[pts.length - 1];
    if (!p || Math.abs(p[0] - x) > 1e-5 || Math.abs(p[1] - y) > 1e-5) pts.push([x, y]);
  };
  if (type === 'flat') {
    push(L, sill); push(L, top); push(R, top); push(R, sill);
    return pts;
  }
  if (type === 'round') {
    const r = w / 2, cy = Math.max(top - r, sill);
    push(L, sill); push(L, cy);
    for (let i = 0; i <= seg; i++) { const a = Math.PI - (Math.PI * i) / seg; push(r * Math.cos(a), cy + r * Math.sin(a)); }
    push(R, cy); push(R, sill);
    return pts;
  }
  if (type === 'pointed') {
    const Rr = 0.85 * w, dx = Rr - w / 2, rise = Math.sqrt(Rr * Rr - dx * dx);
    const spring = Math.max(top - rise, sill);
    push(L, sill); push(L, spring);
    const aL = Math.atan2(rise, -dx);
    const half = seg / 2;
    for (let i = 0; i <= half; i++) { const a = Math.PI + (aL - Math.PI) * (i / half); push(dx + Rr * Math.cos(a), spring + Rr * Math.sin(a)); }
    const aR = Math.atan2(rise, dx);
    for (let i = 0; i <= half; i++) { const a = aR - aR * (i / half); push(-dx + Rr * Math.cos(a), spring + Rr * Math.sin(a)); }
    push(R, spring); push(R, sill);
    return pts;
  }
  // حدوة الحصان
  const th = 0.36;
  const Rh = (w / 2) / Math.cos(th);
  const cy = top - Rh;
  const yj = Math.max(cy - Rh * Math.sin(th), sill);
  push(L, sill); push(L, yj);
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI + th - ((Math.PI + 2 * th) * i) / seg;
    push(Rh * Math.cos(a), cy + Rh * Math.sin(a));
  }
  push(R, yj); push(R, sill);
  return pts;
}

/** ارتفاع القوس الأدنى حتى لا يكون له "عضادة" (تبدأ المنحنى من الأسفل مباشرة) */
export function archRise(w, type) {
  if (type === 'round') return w / 2;
  if (type === 'pointed') { const R = 0.85 * w, dx = R - w / 2; return Math.sqrt(R * R - dx * dx); }
  if (type === 'horseshoe') { const th = 0.36, Rh = (w / 2) / Math.cos(th); return Rh * (1 + Math.sin(th)); }
  return 0;
}

/* ------------------------------------------------------------------ UV بالمتر */
/** إسقاط مستوٍ حسب الاتجاه الغالب للعمودي (يناسب الصناديق والبثق) */
export function boxUV(geo, scale = 1, offset = [0, 0]) {
  geo.computeVertexNormals && !geo.attributes.normal && geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u * scale + offset[0];
    uv[i * 2 + 1] = v * scale + offset[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** UV أسطواني (u حول المحور × المحيط، v على الارتفاع) */
export function cylUV(geo, radius = 0.3) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const circ = Math.PI * 2 * radius;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 0.5;
    uv[i * 2] = a * circ;
    uv[i * 2 + 1] = p.getY(i);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/* ------------------------------------------------------------------ أشكال جاهزة */
export function box(w, h, d) { return boxUV(new THREE.BoxGeometry(w, h, d)); }
export function rbox(w, h, d, r = 0.02, seg = 3) {
  return boxUV(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
}
/** وسادة منتفخة (صندوق مدوّر منفوخ من الوسط) */
export function cushion(w, h, d, r = 0.05, puff = 0.25) {
  const g = new RoundedBoxGeometry(w, h, d, 5, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i), z = p.getZ(i) / (d / 2);
    const f = (1 - x * x) * (1 - z * z);
    p.setY(i, y + Math.sign(y) * f * h * puff * 0.5);
  }
  g.computeVertexNormals();
  return boxUV(g);
}
export function cyl(rt, rb, h, seg = 32, open = false) {
  return cylUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), Math.max(rt, rb));
}
/** خراطة: نقاط [نصف القطر, الارتفاع] */
export function lathe(points, seg = 48) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg);
  let maxR = 0;
  for (const [r] of points) maxR = Math.max(maxR, r);
  return cylUV(g, maxR || 0.1);
}
export function torus(r, tube, seg = 48, tseg = 12, arc = Math.PI * 2) {
  return cylUV(new THREE.TorusGeometry(r, tube, tseg, seg, arc), r);
}
export function tube(points, radius, seg = 64, rseg = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  return boxUV(new THREE.TubeGeometry(curve, seg, radius, rseg, closed));
}
/** بثق شكل ثنائي الأبعاد بعمق، مع UV بالمتر */
export function extrude(shape, depth, bevel = 0) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 24, steps: 1,
  });
}
export function shapeFrom(points, holes = []) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    h.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

/** شبكة سريعة */
export function mesh(geo, mat, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.s) m.scale.setScalar(opts.s);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  return m;
}

/* ------------------------------------------------------------------ الدمج */
/**
 * يدمج كل الشبكات داخل مجموعة حسب المادة → شبكة واحدة لكل مادة.
 * الأضواء والأجسام الخاصة (userData.keep) تبقى كما هي.
 */
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const keep = [];
  group.traverse((o) => {
    if (o === group) return;
    if (keepParent(o, group)) return; // داخل جزء محفوظ — يُنقل مع أصله
    if (o.isLight || o.userData.keep || o.isInstancedMesh || o.isPoints || o.isSprite) { keep.push(o); return; }
    if (o.isMesh && !Array.isArray(o.material)) {
      const key = o.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], cast: false, receive: false });
      const b = buckets.get(key);
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) boxUV(g);
      if (!g.attributes.normal) g.computeVertexNormals();
      const ng = g.index ? g.toNonIndexed() : g;
      b.geos.push(ng);
      b.cast = b.cast || o.castShadow;
      b.receive = b.receive || o.receiveShadow;
    }
  });
  const out = new THREE.Group();
  out.name = group.name;
  out.userData = { ...group.userData };
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    out.add(m);
  }
  for (const k of keep) {
    const wm = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
    k.parent && k.parent.remove(k);
    wm.decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  return out;
}
function keepParent(o, root) {
  let p = o.parent;
  while (p && p !== root) { if (p.userData.keep) return true; p = p.parent; }
  return false;
}
