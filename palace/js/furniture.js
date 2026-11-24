/* ============================================================================
 *  furniture.js — كتالوج الأثاث (كل قطعة مبنية بالكود بأبعاد حقيقية)
 *  ---------------------------------------------------------------------------
 *  الأصل (0,0,0) = منتصف القاعدة على الأرض، والواجهة باتجاه +z.
 *  قطع الجدار: الأصل على سطح الجدار (الخلف)، وقطع السقف: الأصل عند السقف.
 *  كل مادة قابلة للتبديل تحمل userData.slotKey (fabric / wood / metal / stone / rug / art).
 * ========================================================================== */
import * as THREE from 'three';
import { CATALOG } from './config.js';
import { findOption } from './materials.js';
import { box, rbox, cushion, cyl, lathe, torus, tube, extrude, shapeFrom, mesh, mergeByMaterial, boxUV } from './geom.js';
import { mulberry } from './architecture.js';

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/** درجة حرارة لون → RGB (تقريب تانر هيلاند) */
export function kelvin(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color(c(r), c(g), c(b));
}

export class FurnitureFactory {
  constructor(lib, baker, palace) {
    this.lib = lib;
    this.baker = baker;
    this.palace = palace;
    this.cache = {};
  }

  /** ينشئ قطعة كاملة */
  create(type, slots = {}, opts = {}) {
    const def = CATALOG_BY_ID[type];
    if (!def) throw new Error(`unknown item ${type}`);
    const s = { ...def.slots, ...(slots || {}) };
    const M = {};
    for (const key of Object.keys(def.slots)) {
      M[key] = this.lib.slot(key, s[key]);
      M[key].userData.slotKey = key;
    }
    const ctx = { M, s, def, opts, lights: [], glows: [], animate: [] };
    const fn = this[`_${type}`];
    const raw = fn.call(this, ctx);
    raw.traverse((o) => { if (o.isMesh) { if (o.castShadow === undefined) o.castShadow = true; } });
    // على الأجهزة الضعيفة: الثريات فقط تضيء فعلياً، والباقي توهّج بلا مصدر ضوء (أسرع بكثير)
    if (this.minorLights === false && type !== 'chandelier' && type !== 'chandelierGrand') {
      for (const l of ctx.lights) l.light.parent && l.light.parent.remove(l.light);
      ctx.lights = [];
    }
    const g = mergeByMaterial(raw);
    g.name = type;
    g.userData.type = type;
    g.userData.slots = s;
    g.userData.lights = ctx.lights;
    g.userData.glows = ctx.glows;
    g.userData.animate = ctx.animate;
    g.userData.place = def.place;
    g.traverse((o) => { if (o.isMesh) { o.userData.item = g; } });
    return g;
  }

  /** تبديل خامة خانة في قطعة موجودة */
  recolor(item, key, optionId) {
    item.userData.slots[key] = optionId;
    const opt = findOption(key, optionId);
    const done = new Map();
    item.traverse((o) => {
      if (!o.isMesh || !o.material.userData || o.material.userData.slotKey !== key) return;
      const old = o.material;
      if (!done.has(old.uuid)) {
        let nm;
        if (old.userData.variant === 'tufted') nm = this.lib.tufted(opt);
        else nm = this.lib.slot(key, optionId);
        nm.userData.slotKey = key;
        nm.userData.variant = old.userData.variant;
        nm.envMap = old.envMap;
        done.set(old.uuid, nm);
        old.dispose();
      }
      o.material = done.get(old.uuid);
    });
  }

  _tuft(ctx) {
    const m = this.lib.tufted(findOption('fabric', ctx.s.fabric));
    m.userData.slotKey = 'fabric';
    m.userData.variant = 'tufted';
    return m;
  }

  /* ================================================================ الجلوس */
  _sofaChesterfield({ M }) {
    const g = new THREE.Group();
    const tuft = this._tuft(arguments[0]);
    const W = 2.3, D = 0.98;
    g.add(mesh(rbox(W - 0.1, 0.3, D - 0.1, 0.04), M.fabric, 0, 0.27, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(cushion(0.68, 0.15, 0.66, 0.06, 0.35), M.fabric, -0.71 + i * 0.71, 0.48, 0.08));
    const back = rbox(W - 0.1, 0.44, 0.24, 0.06); g.add(mesh(back, tuft, 0, 0.6, -D / 2 + 0.14));
    for (const sx of [-1, 1]) {
      g.add(mesh(rbox(0.22, 0.42, D - 0.06, 0.05), tuft, sx * (W / 2 - 0.11), 0.42, 0));
      const roll = cyl(0.13, 0.13, D - 0.02, 32); roll.rotateX(Math.PI / 2);
      g.add(mesh(roll, tuft, sx * (W / 2 - 0.1), 0.66, 0));
      const cap = new THREE.SphereGeometry(0.13, 24, 12); cap.scale(1, 1, 0.25);
      g.add(mesh(cap, tuft, sx * (W / 2 - 0.1), 0.66, D / 2 - 0.01));
      // مسامير نحاسية على الذراع
      const stud = new THREE.SphereGeometry(0.009, 8, 6);
      const n = 26, im = new THREE.InstancedMesh(stud, M.metal, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1)) * Math.PI * 1.25 - Math.PI * 0.35;
        m4.makeTranslation(sx * (W / 2 - 0.1) + Math.cos(a) * 0.135 * sx * 0, 0.66 + Math.sin(a) * 0.135, D / 2 - 0.02 + Math.cos(a) * 0.0 + 0.012);
        m4.setPosition(sx * (W / 2 - 0.1) + sx * Math.cos(a) * 0.135, 0.66 + Math.sin(a) * 0.135, D / 2 + 0.012);
        im.setMatrixAt(i, m4);
      }
      g.add(im);
    }
    for (const [x, z] of [[-1.05, 0.38], [1.05, 0.38], [-1.05, -0.38], [1.05, -0.38]]) {
      g.add(mesh(lathe([[0.035, 0], [0.045, 0.02], [0.03, 0.05], [0.05, 0.09], [0.045, 0.12], [0, 0.12]], 16), M.wood, x, 0, z));
    }
    return g;
  }

  _sofaClassic(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    const tuft = this._tuft(ctx);
    const W = 2.5, D = 1.0;
    // ظهر بإطار مذهّب منحني
    const bw = W - 0.2;
    const crest = [];
    for (let i = 0; i <= 40; i++) { const x = -bw / 2 + (bw * i) / 40; crest.push([x, 0.5 + 0.16 * Math.cos((x / bw) * Math.PI) + 0.05 * Math.cos((x / bw) * Math.PI * 3)]); }
    const backPts = [[-bw / 2, 0], ...crest, [bw / 2, 0]];
    const bg = extrude(shapeFrom(backPts), 0.12); boxUV(bg);
    g.add(mesh(bg, tuft, 0, 0.55, -D / 2 + 0.06));
    const outer = [[-bw / 2 - 0.05, -0.02], ...crest.map(([x, y]) => [x * 1.04, y + 0.05]), [bw / 2 + 0.05, -0.02]];
    const inner = [[bw / 2 - 0.01, 0.02], ...crest.slice().reverse().map(([x, y]) => [x * 0.99, y - 0.01]), [-bw / 2 + 0.01, 0.02]];
    const fg = extrude(shapeFrom([...outer, ...inner]), 0.15); boxUV(fg);
    g.add(mesh(fg, M.metal, 0, 0.55, -D / 2 + 0.04));
    // مقعد ووسائد
    g.add(mesh(cushion(W - 0.25, 0.2, D - 0.25, 0.06, 0.25), M.fabric, 0, 0.5, 0.06));
    g.add(mesh(rbox(W - 0.1, 0.14, D - 0.1, 0.03), M.metal, 0, 0.36, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(cushion(0.5, 0.42, 0.14, 0.06, 0.4), M.fabric, -0.62 + i * 0.62, 0.78, -D / 2 + 0.24, { rx: -0.2 }));
    // ذراعان ملفوفتان
    for (const sx of [-1, 1]) {
      g.add(mesh(tube([[sx * (W / 2 - 0.08), 0.4, -D / 2 + 0.1], [sx * (W / 2 - 0.04), 0.72, -0.1], [sx * (W / 2 - 0.05), 0.75, 0.28], [sx * (W / 2 - 0.02), 0.58, D / 2 - 0.05], [sx * (W / 2 - 0.06), 0.42, D / 2 - 0.08]], 0.045, 48, 10), M.metal));
      g.add(mesh(cushion(0.12, 0.08, 0.6, 0.04, 0.4), M.fabric, sx * (W / 2 - 0.05), 0.78, 0.0));
    }
    // أرجل منحنية (كابريول)
    for (const [x, z] of [[-1.12, 0.4], [1.12, 0.4], [-1.12, -0.4], [1.12, -0.4], [0, 0.42], [0, -0.42]]) {
      g.add(mesh(tube([[x, 0.32, z], [x * 1.02, 0.2, z + Math.sign(z) * 0.02], [x * 0.99, 0.08, z - Math.sign(z) * 0.01], [x * 1.03, 0.01, z + Math.sign(z) * 0.03]], 0.028, 16, 8), M.metal));
    }
    return g;
  }

  _armchair(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    const tuft = this._tuft(ctx);
    // ظهر بيضاوي (ميدالية)
    const oval = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; oval.push([Math.cos(a) * 0.32, Math.sin(a) * 0.36]); }
    const og = extrude(shapeFrom(oval), 0.1); boxUV(og);
    g.add(mesh(og, tuft, 0, 0.92, -0.32, { rx: -0.12 }));
    const ring = new THREE.Mesh(torus(1, 0.035, 64, 10), M.metal);
    ring.scale.set(0.34, 0.38, 1);
    ring.position.set(0, 0.92, -0.25); ring.rotation.x = -0.12;
    g.add(ring);
    const crest = mesh(lathe([[0, 0], [0.05, 0.02], [0.03, 0.08], [0, 0.1]], 16), M.metal, 0, 1.3, -0.3);
    g.add(crest);
    g.add(mesh(cushion(0.7, 0.16, 0.62, 0.05, 0.3), M.fabric, 0, 0.47, 0.06));
    g.add(mesh(rbox(0.78, 0.1, 0.72, 0.02), M.metal, 0, 0.36, 0.02));
    for (const sx of [-1, 1]) {
      g.add(mesh(tube([[sx * 0.37, 0.4, -0.3], [sx * 0.4, 0.65, -0.12], [sx * 0.4, 0.68, 0.18], [sx * 0.38, 0.56, 0.33], [sx * 0.37, 0.42, 0.34]], 0.032, 32, 8), M.metal));
      g.add(mesh(cushion(0.09, 0.06, 0.34, 0.03, 0.4), M.fabric, sx * 0.4, 0.72, 0.02));
      g.add(mesh(tube([[sx * 0.3, 0.42, -0.3], [sx * 0.3, 0.75, -0.33], [sx * 0.24, 1.15, -0.38]], 0.03, 16, 8), M.metal));
    }
    for (const [x, z] of [[-0.33, 0.3], [0.33, 0.3], [-0.31, -0.28], [0.31, -0.28]]) {
      g.add(mesh(tube([[x, 0.33, z], [x * 1.04, 0.18, z + Math.sign(z) * 0.03], [x, 0.06, z], [x * 1.06, 0.0, z + Math.sign(z) * 0.04]], 0.026, 16, 8), M.metal));
    }
    return g;
  }

  _majlisSeat({ M }) {
    const g = new THREE.Group();
    const W = 3.0, D = 0.95;
    g.add(mesh(rbox(W, 0.28, D, 0.03), M.fabric, 0, 0.14, 0));
    g.add(mesh(cushion(W - 0.04, 0.14, D - 0.06, 0.05, 0.25), M.fabric, 0, 0.35, 0.02));
    for (const y of [0.02, 0.27]) g.add(mesh(box(W + 0.01, 0.025, D + 0.01), M.metal, 0, y, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(cushion(0.95, 0.55, 0.18, 0.06, 0.35), M.fabric, -1.0 + i, 0.66, -D / 2 + 0.14, { rx: -0.18 }));
    for (const sx of [-1, 1]) {
      const b = cyl(0.13, 0.13, 0.7, 24); b.rotateX(Math.PI / 2);
      g.add(mesh(b, M.fabric, sx * (W / 2 - 0.14), 0.55, 0.05));
      for (const z of [-0.3, 0.4]) {
        const tas = new THREE.Mesh(lathe([[0, 0], [0.025, -0.02], [0.02, -0.08], [0.035, -0.12], [0, -0.13]], 10), M.metal);
        tas.position.set(sx * (W / 2 - 0.14), 0.55, z);
        g.add(tas);
      }
    }
    for (const x of [-1.15, 1.15]) g.add(mesh(cushion(0.38, 0.38, 0.12, 0.05, 0.5), M.metal, x * 0.9, 0.66, -0.1, { rx: -0.25 }));
    return g;
  }

  _ottoman(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(cushion(0.72, 0.28, 0.72, 0.06, 0.25), this._tuft(ctx), 0, 0.3, 0));
    g.add(mesh(rbox(0.74, 0.06, 0.74, 0.02), M.metal, 0, 0.14, 0));
    for (const [x, z] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]]) g.add(mesh(lathe([[0.03, 0], [0.025, 0.05], [0.04, 0.09], [0.03, 0.14], [0, 0.14]], 12), M.metal, x, 0, z));
    return g;
  }

  /* ================================================================ الطاولات */
  _coffeeTable({ M }) {
    const g = new THREE.Group();
    g.add(mesh(rbox(1.4, 0.045, 0.8, 0.015), M.stone, 0, 0.43, 0));
    g.add(mesh(rbox(1.34, 0.05, 0.74, 0.01), M.metal, 0, 0.395, 0));
    for (const [x, z] of [[-0.62, 0.32], [0.62, 0.32], [-0.62, -0.32], [0.62, -0.32]]) {
      g.add(mesh(lathe([[0.02, 0], [0.035, 0.02], [0.018, 0.1], [0.025, 0.25], [0.015, 0.36], [0.03, 0.38], [0, 0.39]], 16), M.metal, x, 0, z));
    }
    g.add(mesh(box(1.2, 0.02, 0.02), M.metal, 0, 0.08, 0.32));
    g.add(mesh(box(1.2, 0.02, 0.02), M.metal, 0, 0.08, -0.32));
    return g;
  }
  _roundTable({ M }) {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.85, 0.85, 0.05, 72), M.stone, 0, 0.775, 0));
    g.add(mesh(torus(0.85, 0.022, 96, 8), M.metal, 0, 0.775, 0, { rx: Math.PI / 2 }));
    g.add(mesh(lathe([[0.45, 0.0], [0.5, 0.03], [0.32, 0.1], [0.16, 0.2], [0.12, 0.35], [0.16, 0.45], [0.1, 0.6], [0.2, 0.7], [0.35, 0.75], [0, 0.75]], 48), M.metal));
    return g;
  }
  _sideTable({ M }) {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.27, 0.27, 0.03, 48), M.stone, 0, 0.605, 0));
    g.add(mesh(lathe([[0.2, 0], [0.22, 0.02], [0.08, 0.08], [0.04, 0.3], [0.07, 0.5], [0.18, 0.585], [0, 0.59]], 32), M.metal));
    return g;
  }
  _trayTable({ M }) {
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.48, 0], [0.5, 0.03], [0.48, 0.035], [0.47, 0.01], [0, 0.01]], 72), M.metal, 0, 0.39, 0));
    for (const a of [0, Math.PI / 2]) {
      const leg = new THREE.Group();
      for (const sx of [-1, 1]) leg.add(mesh(box(0.04, 0.5, 0.04), M.wood, sx * 0.2, 0.2, 0, { rz: sx * 0.45 }));
      leg.rotation.y = a;
      leg.position.set(0, 0, 0);
      g.add(leg);
    }
    g.add(mesh(torus(0.3, 0.012, 32, 6), M.wood, 0, 0.36, 0, { rx: Math.PI / 2 }));
    return g;
  }
  _diningTable({ M }) {
    const g = new THREE.Group();
    g.add(mesh(rbox(4.2, 0.06, 1.3, 0.02), M.wood, 0, 0.74, 0));
    g.add(mesh(box(4.1, 0.006, 1.2), M.metal, 0, 0.772, 0));
    g.add(mesh(rbox(3.9, 0.1, 1.05, 0.01), M.wood, 0, 0.66, 0));
    for (const x of [-1.4, 1.4]) {
      g.add(mesh(lathe([[0.1, 0.06], [0.14, 0.1], [0.09, 0.2], [0.13, 0.32], [0.08, 0.45], [0.11, 0.6], [0.14, 0.62], [0, 0.62]], 32), M.wood, x, 0, 0));
      g.add(mesh(rbox(0.16, 0.08, 0.95, 0.02), M.wood, x, 0.05, 0));
      for (const z of [-0.45, 0.45]) g.add(mesh(new THREE.SphereGeometry(0.05, 16, 10), M.metal, x, 0.03, z));
    }
    g.add(mesh(cyl(0.035, 0.035, 2.8, 16), M.wood, 0, 0.18, 0, { rz: Math.PI / 2 }));
    return g;
  }
  _diningChair({ M }) {
    const g = new THREE.Group();
    g.add(mesh(cushion(0.48, 0.09, 0.46, 0.04, 0.35), M.fabric, 0, 0.5, 0.02));
    g.add(mesh(rbox(0.52, 0.06, 0.5, 0.01), M.wood, 0, 0.44, 0.02));
    for (const [x, z] of [[-0.22, 0.22], [0.22, 0.22]]) g.add(mesh(lathe([[0.022, 0], [0.03, 0.06], [0.02, 0.2], [0.028, 0.32], [0.022, 0.42], [0, 0.42]], 16), M.wood, x, 0, z));
    for (const sx of [-1, 1]) g.add(mesh(tube([[sx * 0.21, 0, -0.24], [sx * 0.21, 0.45, -0.2], [sx * 0.2, 0.8, -0.24], [sx * 0.19, 1.1, -0.29]], 0.022, 24, 8), M.wood));
    const crest = tube([[-0.21, 1.08, -0.29], [0, 1.15, -0.31], [0.21, 1.08, -0.29]], 0.025, 24, 8);
    g.add(mesh(crest, M.wood));
    g.add(mesh(cushion(0.36, 0.48, 0.05, 0.04, 0.3), M.fabric, 0, 0.82, -0.24, { rx: -0.12 }));
    return g;
  }
  _console({ M }) {
    const g = new THREE.Group();
    g.add(mesh(rbox(1.6, 0.04, 0.45, 0.012), M.stone, 0, 0.84, 0));
    g.add(mesh(rbox(1.5, 0.1, 0.38, 0.01), M.metal, 0, 0.77, -0.01));
    for (const sx of [-1, 1]) {
      g.add(mesh(tube([[sx * 0.68, 0.74, 0.12], [sx * 0.72, 0.55, 0.18], [sx * 0.62, 0.3, 0.1], [sx * 0.66, 0.06, 0.15], [sx * 0.7, 0.0, 0.18]], 0.03, 32, 8), M.metal));
      g.add(mesh(box(0.05, 0.74, 0.04), M.metal, sx * 0.7, 0.37, -0.18));
    }
    g.add(mesh(tube([[-0.62, 0.2, 0.05], [0, 0.12, 0.08], [0.62, 0.2, 0.05]], 0.016, 24, 6), M.metal));
    return g;
  }
  _desk({ M }) {
    const g = new THREE.Group();
    g.add(mesh(rbox(2.1, 0.05, 1.0, 0.015), M.wood, 0, 0.755, 0));
    g.add(mesh(box(1.7, 0.004, 0.7), M.fabric, 0, 0.782, 0));
    for (const sx of [-1, 1]) {
      g.add(mesh(rbox(0.55, 0.72, 0.88, 0.01), M.wood, sx * 0.72, 0.37, 0));
      for (let k = 0; k < 3; k++) {
        g.add(mesh(rbox(0.48, 0.2, 0.02, 0.008), M.wood, sx * 0.72, 0.14 + k * 0.22, -0.45));
        g.add(mesh(box(0.12, 0.015, 0.025), M.metal, sx * 0.72, 0.15 + k * 0.22, -0.47));
      }
    }
    g.add(mesh(rbox(0.9, 0.5, 0.03, 0.01), M.wood, 0, 0.48, 0.42));
    g.add(mesh(rbox(0.9, 0.08, 0.86, 0.01), M.wood, 0, 0.69, 0));
    g.add(mesh(box(2.12, 0.012, 1.02), M.metal, 0, 0.727, 0));
    return g;
  }
  _officeChair(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    const tuft = this._tuft(ctx);
    g.add(mesh(cushion(0.6, 0.12, 0.56, 0.04, 0.3), M.fabric, 0, 0.5, 0.03));
    g.add(mesh(rbox(0.66, 0.6, 0.14, 0.06), tuft, 0, 0.88, -0.28, { rx: -0.1 }));
    for (const sx of [-1, 1]) {
      g.add(mesh(rbox(0.12, 0.2, 0.6, 0.05), tuft, sx * 0.33, 0.62, 0.0));
      const r = cyl(0.07, 0.07, 0.62, 16); r.rotateX(Math.PI / 2);
      g.add(mesh(r, tuft, sx * 0.33, 0.73, 0.0));
    }
    g.add(mesh(rbox(0.66, 0.1, 0.62, 0.02), M.wood, 0, 0.42, 0.02));
    for (const [x, z] of [[-0.27, 0.27], [0.27, 0.27], [-0.27, -0.27], [0.27, -0.27]]) {
      g.add(mesh(lathe([[0.025, 0.02], [0.035, 0.05], [0.025, 0.25], [0.035, 0.37], [0, 0.37]], 12), M.wood, x, 0, z));
      g.add(mesh(new THREE.SphereGeometry(0.025, 12, 8), M.metal, x, 0.022, z));
    }
    return g;
  }

  /* ================================================================ غرفة النوم */
  _bed(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    const tuft = this._tuft(ctx);
    const W = 2.3, L = 2.45, H = 2.9;
    const linen = this.lib.fabric({ type: 'linen', hex: '#f1ebe0' });
    g.add(mesh(rbox(W - 0.1, 0.32, L - 0.2, 0.03), M.wood, 0, 0.26, 0.05));
    g.add(mesh(rbox(W - 0.2, 0.26, L - 0.35, 0.08), linen, 0, 0.55, 0.08));
    const duvet = cushion(W - 0.05, 0.12, L - 0.75, 0.08, 0.3);
    g.add(mesh(duvet, M.fabric, 0, 0.7, 0.38));
    g.add(mesh(rbox(W - 0.02, 0.36, 0.06, 0.03), M.fabric, 0, 0.5, L / 2 - 0.12));
    for (const x of [-0.5, 0.5]) {
      g.add(mesh(cushion(0.85, 0.16, 0.5, 0.08, 0.6), linen, x, 0.78, -L / 2 + 0.45, { rx: -0.35 }));
      g.add(mesh(cushion(0.6, 0.14, 0.42, 0.07, 0.6), M.fabric, x * 0.95, 0.8, -L / 2 + 0.72, { rx: -0.25 }));
    }
    // لوح رأس منجّد طويل بإطار مذهّب
    const hb = [];
    for (let i = 0; i <= 40; i++) { const x = -W / 2 + 0.1 + ((W - 0.2) * i) / 40; hb.push([x, 1.35 + 0.22 * Math.cos(((x / (W - 0.2)) * Math.PI))]); }
    const hg = extrude(shapeFrom([[-W / 2 + 0.1, 0], ...hb, [W / 2 - 0.1, 0]]), 0.14); boxUV(hg);
    g.add(mesh(hg, tuft, 0, 0.4, -L / 2 + 0.02));
    const hf = tube(hb.filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y + 0.42, -L / 2 + 0.1]), 0.035, 64, 8);
    g.add(mesh(hf, M.metal));
    // أعمدة المظلة
    for (const [x, z] of [[-W / 2 + 0.06, -L / 2 + 0.06], [W / 2 - 0.06, -L / 2 + 0.06], [-W / 2 + 0.06, L / 2 - 0.06], [W / 2 - 0.06, L / 2 - 0.06]]) {
      g.add(mesh(lathe([[0.07, 0], [0.08, 0.1], [0.06, 0.2], [0.075, 0.45], [0.045, 0.6], [0.04, 2.3], [0.06, 2.4], [0.045, 2.6], [0.06, H - 0.12], [0.075, H - 0.08], [0.03, H], [0, H]], 24), M.wood, x, 0, z));
      g.add(mesh(new THREE.SphereGeometry(0.05, 16, 10), M.metal, x, H + 0.03, z));
    }
    for (const [w, d, x, z] of [[W, 0.08, 0, -L / 2 + 0.06], [W, 0.08, 0, L / 2 - 0.06], [0.08, L, -W / 2 + 0.06, 0], [0.08, L, W / 2 - 0.06, 0]]) {
      g.add(mesh(rbox(w, 0.12, d, 0.01), M.wood, x, H - 0.1, z));
      g.add(mesh(box(w * 0.98 + 0.01, 0.02, d * 0.98 + 0.01), M.metal, x, H - 0.17, z));
    }
    // ستائر المظلة عند الزوايا
    const drape = (x, z, ry) => {
      const geo = new THREE.PlaneGeometry(0.55, H - 0.3, 16, 20);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const xx = p.getX(i), y = p.getY(i);
        const v = (y + (H - 0.3) / 2) / (H - 0.3);
        const gather = 1 - 0.45 * Math.exp(-Math.pow((v - 0.45) / 0.1, 2));
        p.setX(i, xx * gather);
        p.setZ(i, Math.sin((xx / 0.55 + 0.5) * Math.PI * 6) * 0.03);
      }
      geo.computeVertexNormals(); boxUV(geo);
      const m = mesh(geo, M.fabric, x, (H - 0.3) / 2 + 0.05, z, { ry });
      m.material.side = THREE.DoubleSide;
      return m;
    };
    for (const [x, z, ry] of [[-W / 2 - 0.05, -L / 2 + 0.25, Math.PI / 2], [W / 2 + 0.05, -L / 2 + 0.25, -Math.PI / 2], [-W / 2 - 0.05, L / 2 - 0.25, Math.PI / 2], [W / 2 + 0.05, L / 2 - 0.25, -Math.PI / 2]]) g.add(drape(x, z, ry));
    return g;
  }
  _nightstand({ M }) {
    const g = new THREE.Group();
    g.add(mesh(rbox(0.58, 0.46, 0.42, 0.012), M.wood, 0, 0.36, 0));
    g.add(mesh(rbox(0.62, 0.03, 0.46, 0.01), M.stone, 0, 0.625, 0));
    for (let k = 0; k < 2; k++) {
      g.add(mesh(rbox(0.5, 0.18, 0.02, 0.006), M.wood, 0, 0.25 + k * 0.21, 0.21));
      g.add(mesh(lathe([[0, 0], [0.018, 0], [0.012, 0.02], [0.02, 0.035], [0, 0.04]], 10), M.metal, 0, 0.25 + k * 0.21, 0.22, { rx: Math.PI / 2 }));
    }
    for (const [x, z] of [[-0.25, 0.17], [0.25, 0.17], [-0.25, -0.17], [0.25, -0.17]]) g.add(mesh(lathe([[0.02, 0], [0.03, 0.04], [0.02, 0.13], [0, 0.13]], 10), M.metal, x, 0, z));
    return g;
  }
  _wardrobe({ M }) {
    const g = new THREE.Group();
    const W = 2.4, D = 0.66, H = 2.6;
    g.add(mesh(rbox(W, H - 0.25, D, 0.01), M.wood, 0, 0.12 + (H - 0.25) / 2, 0));
    g.add(mesh(rbox(W + 0.1, 0.12, D + 0.06, 0.01), M.wood, 0, 0.06, 0));
    g.add(mesh(rbox(W + 0.14, 0.1, D + 0.08, 0.02), M.wood, 0, H - 0.08, 0.01));
    g.add(mesh(box(W + 0.16, 0.025, D + 0.1), M.metal, 0, H - 0.14, 0.01));
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + W / 8 + (i * W) / 4;
      g.add(mesh(rbox(W / 4 - 0.04, H - 0.5, 0.025, 0.006), M.wood, x, 0.14 + (H - 0.5) / 2 + 0.05, D / 2 + 0.01));
      for (const [y, h] of [[0.45, 0.8], [1.4, 0.75]]) {
        g.add(mesh(rbox(W / 4 - 0.18, h, 0.02, 0.008), M.wood, x, y + h / 2, D / 2 + 0.03));
        g.add(mesh(box(W / 4 - 0.15, 0.008, 0.008), M.metal, x, y + h + 0.02, D / 2 + 0.035));
      }
      const hx = i % 2 === 0 ? x + W / 8 - 0.07 : x - W / 8 + 0.07;
      g.add(mesh(cyl(0.008, 0.008, 0.3, 8), M.metal, hx, 1.25, D / 2 + 0.06));
    }
    return g;
  }

  /* ================================================================ تخزين */
  _bookcase({ M }) {
    const g = new THREE.Group();
    const W = 2.0, D = 0.46, H = 3.0;
    g.add(mesh(box(0.05, H, D), M.wood, -W / 2 + 0.025, H / 2, 0));
    g.add(mesh(box(0.05, H, D), M.wood, W / 2 - 0.025, H / 2, 0));
    g.add(mesh(box(W, H, 0.02), M.wood, 0, H / 2, -D / 2 + 0.01));
    g.add(mesh(rbox(W + 0.1, 0.12, D + 0.06, 0.01), M.wood, 0, H - 0.06, 0.02));
    g.add(mesh(box(W + 0.12, 0.02, D + 0.08), M.metal, 0, H - 0.13, 0.02));
    g.add(mesh(rbox(W + 0.04, 0.12, D + 0.02, 0.01), M.wood, 0, 0.06, 0.01));
    const shelves = 6;
    const sh = (H - 0.25) / shelves;
    for (let i = 0; i <= shelves; i++) g.add(mesh(box(W - 0.1, 0.03, D - 0.03), M.wood, 0, 0.12 + i * sh, 0.0));
    // الكتب
    const bookMat = this.cache.bookMat || (this.cache.bookMat = new THREE.MeshPhysicalMaterial({ map: this._spineTex(), roughness: 0.6, clearcoat: 0.2 }));
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { if (i >= 16 && i < 20) continue; uv.setXY(i, uv.getX(i) * 0.05, uv.getY(i) * 0.05); }
    const rnd = mulberry(Math.floor((M.wood.uuid.charCodeAt(0) || 7) * 31));
    const mats = [];
    for (let i = 0; i < shelves; i++) {
      let x = -W / 2 + 0.07;
      const y0 = 0.135 + i * sh;
      while (x < W / 2 - 0.12) {
        const t = 0.025 + rnd() * 0.045, h = Math.min(sh - 0.06, 0.22 + rnd() * 0.16), d = 0.16 + rnd() * 0.08;
        if (rnd() < 0.06) { x += 0.08; continue; }
        const lean = rnd() < 0.05 ? 0.15 : 0;
        mats.push([x + t / 2, y0 + h / 2, -D / 2 + 0.03 + d / 2, t, h, d, lean]);
        x += t + 0.002;
      }
    }
    const im = new THREE.InstancedMesh(geo, bookMat, mats.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const palette = ['#5c1420', '#1a2547', '#134636', '#5b3a22', '#2a2a2a', '#7a5a2a', '#3a1f4a', '#8a2a1a', '#e8dcc0'];
    mats.forEach(([x, y, z, t, h, d, lean], i) => {
      q.setFromEuler(new THREE.Euler(0, 0, lean));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(t, h, d));
      im.setMatrixAt(i, m4);
      c.set(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.85 + rnd() * 0.3);
      im.setColorAt(i, c);
    });
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
    return g;
  }
  _spineTex() {
    return this.baker.textTexture({
      width: 256, height: 512,
      draw: (ctx, w, h) => {
        ctx.fillStyle = '#e8e2d6'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#d4a645';
        for (const y of [0.08, 0.12, 0.85, 0.89]) ctx.fillRect(0, h * y, w, h * 0.012);
        ctx.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.08);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      },
    });
  }

  /* ================================================================ ديكور */
  _piano({ M }) {
    const g = new THREE.Group();
    const lacquer = new THREE.MeshPhysicalMaterial({ color: M.wood.color || '#111', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, map: M.wood.map || null });
    lacquer.userData.slotKey = 'wood';
    // الشكل: الجانب الأيسر مستقيم والأيمن منحني
    const s = new THREE.Shape();
    s.moveTo(-0.775, 1.1); s.lineTo(-0.775, -0.85);
    s.bezierCurveTo(-0.775, -1.15, -0.4, -1.18, -0.1, -1.12);
    s.bezierCurveTo(0.25, -1.05, 0.3, -0.5, 0.5, -0.15);
    s.bezierCurveTo(0.65, 0.1, 0.775, 0.15, 0.775, 0.4);
    s.lineTo(0.775, 1.1); s.closePath();
    const caseG = extrude(s, 0.32); caseG.rotateX(-Math.PI / 2); boxUV(caseG);
    g.add(mesh(caseG, lacquer, 0, 0.62, 0));
    const lid = extrude(s, 0.025); lid.rotateX(-Math.PI / 2); boxUV(lid);
    const lidM = mesh(lid, lacquer, 0, 0, 0);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(-0.775, 0.95, 0);
    lidM.position.set(0.775, 0, 0);
    lidPivot.add(lidM);
    lidPivot.rotation.z = 0.62;
    g.add(lidPivot);
    g.add(mesh(cyl(0.012, 0.012, 0.72, 8), M.metal, 0.15, 1.2, -0.4, { rz: -0.35 }));
    g.add(mesh(box(1.5, 0.04, 0.33), lacquer, 0, 0.64, 1.25));
    g.add(mesh(box(1.5, 0.1, 0.06), lacquer, 0, 0.7, 1.39));
    for (const sx of [-1, 1]) g.add(mesh(box(0.05, 0.16, 0.34), lacquer, sx * 0.75, 0.72, 1.25));
    const white = new THREE.MeshPhysicalMaterial({ color: '#f4f1ea', roughness: 0.25, clearcoat: 0.6 });
    const black = new THREE.MeshPhysicalMaterial({ color: '#0b0b0c', roughness: 0.3, clearcoat: 0.6 });
    const nW = 52, kw = 1.4 / nW;
    const wk = new THREE.InstancedMesh(new THREE.BoxGeometry(kw - 0.002, 0.022, 0.15), white, nW);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nW; i++) { m4.makeTranslation(-0.7 + kw * (i + 0.5), 0.67, 1.3); wk.setMatrixAt(i, m4); }
    g.add(wk);
    const blackIdx = [];
    for (let i = 0; i < nW - 1; i++) { const n = (i + 5) % 7; if (n !== 2 && n !== 6) blackIdx.push(i); }
    const bk = new THREE.InstancedMesh(new THREE.BoxGeometry(kw * 0.55, 0.022, 0.095), black, blackIdx.length);
    blackIdx.forEach((i, k) => { m4.makeTranslation(-0.7 + kw * (i + 1), 0.685, 1.265); bk.setMatrixAt(k, m4); });
    g.add(bk);
    g.add(mesh(box(0.7, 0.28, 0.015), lacquer, 0, 0.98, 1.08, { rx: -0.25 }));
    for (const [x, z] of [[-0.62, 1.0], [0.62, 1.0], [-0.55, -0.85]]) {
      g.add(mesh(lathe([[0.07, 0.62], [0.08, 0.55], [0.055, 0.42], [0.06, 0.2], [0.045, 0.05], [0.055, 0.0], [0, 0.0]], 20), lacquer, x, 0, z));
      g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), M.metal, x, 0.03, z));
    }
    const lyre = new THREE.Group();
    lyre.add(mesh(box(0.22, 0.5, 0.04), lacquer, 0, 0.32, 0));
    for (const x of [-0.06, 0, 0.06]) lyre.add(mesh(box(0.03, 0.012, 0.1), M.metal, x, 0.08, 0.06));
    lyre.position.set(0, 0, 0.9);
    g.add(lyre);
    return g;
  }

  _globe({ M }) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(mesh(tube([[Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], [Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2], [Math.cos(a) * 0.26, 0.62, Math.sin(a) * 0.26]], 0.025, 16, 8), M.wood));
    }
    g.add(mesh(torus(0.3, 0.03, 64, 8), M.wood, 0, 0.64, 0, { rx: Math.PI / 2 }));
    g.add(mesh(lathe([[0.06, 0.2], [0.03, 0.3], [0.05, 0.4], [0, 0.42]], 16), M.wood));
    const tex = this.cache.globeTex || (this.cache.globeTex = this.baker.textTexture({
      width: 1024, height: 512,
      draw: (ctx, w, h) => {
        ctx.fillStyle = '#c9b48a'; ctx.fillRect(0, 0, w, h);
        const rnd = mulberry(42);
        ctx.fillStyle = '#9b7a4a';
        for (let i = 0; i < 260; i++) {
          const cx = rnd() * w, cy = h * 0.15 + rnd() * h * 0.7, r = 10 + rnd() * 36;
          if (Math.sin(cx * 0.012) + Math.cos(cy * 0.02) > 0.2) { ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.4, r, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.strokeStyle = 'rgba(80,50,20,0.45)'; ctx.lineWidth = 1.2;
        for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo((i * w) / 12, 0); ctx.lineTo((i * w) / 12, h); ctx.stroke(); }
        for (let j = 1; j < 6; j++) { ctx.beginPath(); ctx.moveTo(0, (j * h) / 6); ctx.lineTo(w, (j * h) / 6); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(120,30,20,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      },
    }));
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.26, 64, 32), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
    const tilt = new THREE.Group();
    tilt.position.set(0, 0.85, 0);
    tilt.rotation.z = 0.41;
    tilt.add(sph);
    const mer = new THREE.Mesh(torus(0.285, 0.008, 96, 6), M.metal);
    tilt.add(mer);
    g.add(tilt);
    return g;
  }

  _fireplace({ M }) {
    const g = new THREE.Group();
    const W = 2.2, H = 1.5, D = 0.55;
    g.add(mesh(rbox(W + 0.2, 0.08, D + 0.25, 0.01), M.stone, 0, 0.04, D / 2 + 0.05));
    for (const sx of [-1, 1]) {
      g.add(mesh(rbox(0.34, H - 0.2, D, 0.01), M.stone, sx * (W / 2 - 0.17), 0.08 + (H - 0.2) / 2, D / 2));
      g.add(mesh(rbox(0.28, 0.18, D + 0.04, 0.01), M.stone, sx * (W / 2 - 0.17), H - 0.2, D / 2 + 0.01));
    }
    g.add(mesh(rbox(W - 0.68, 0.3, D * 0.8, 0.01), M.stone, 0, H - 0.27, D * 0.42));
    g.add(mesh(rbox(W + 0.3, 0.07, D + 0.12, 0.012), M.stone, 0, H - 0.05, D / 2 + 0.06));
    g.add(mesh(box(W - 0.75, 0.025, 0.015), M.metal, 0, H - 0.3, D * 0.82 + 0.01));
    g.add(mesh(box(W - 0.68, H - 0.45, D * 0.7), this.lib.plain('#0c0907', 0.95), 0, 0.08 + (H - 0.45) / 2, D * 0.36));
    // حطب ونار متحركة
    const logMat = this.lib.bark();
    for (const [x, rz, ry] of [[-0.18, 0.1, 0.3], [0.15, -0.08, -0.25], [0, 0, 1.4]]) {
      const lg = cyl(0.07, 0.065, 0.75, 12); lg.rotateZ(Math.PI / 2 + rz);
      g.add(mesh(lg, logMat, x, 0.17 + (ry > 1 ? 0.1 : 0), D * 0.45, { ry }));
    }
    const fireMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOn: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime; uniform float uOn;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n(p); p *= 2.0; a *= 0.5; } return s; }
        void main(){
          vec2 uv = vUv; uv.x = (uv.x - 0.5) * 1.8;
          float t = uTime;
          float f = fbm(vec2(uv.x * 3.0, uv.y * 2.0 - t * 2.4));
          float shape = 1.0 - smoothstep(0.0, 0.55 + 0.25 * f, abs(uv.x) + uv.y * 0.55);
          float flame = clamp(shape * (f * 1.6 - uv.y * 0.9), 0.0, 1.0);
          vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.4), flame) * flame * 6.0 * uOn;
          if (flame < 0.02) discard;
          gl_FragColor = vec4(col, flame);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const fire = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.75), fireMat);
      p.position.set(0, 0.52, D * 0.45);
      p.rotation.y = (i / 3) * Math.PI;
      fire.add(p);
    }
    fire.userData.keep = true;
    g.add(fire);
    const light = new THREE.PointLight(0xff8a3a, 12, 9, 2);
    light.position.set(0, 0.6, D + 0.4);
    light.userData.keep = true;
    g.add(light);
    arguments[0].lights.push({ light, base: 12, fire: true });
    arguments[0].animate.push((t) => {
      fireMat.uniforms.uTime.value = t;
      light.intensity = light.userData.on === false ? 0 : 12 * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1) + 0.08 * Math.sin(t * 23));
    });
    // سياج نحاسي
    g.add(mesh(tube([[-0.75, 0.12, D + 0.1], [-0.4, 0.2, D + 0.18], [0, 0.22, D + 0.2], [0.4, 0.2, D + 0.18], [0.75, 0.12, D + 0.1]], 0.012, 32, 6), M.metal));
    return g;
  }

  /* ================================================================ الإضاءة */
  _chandelierBody(ctx, scale, tiers, armsPerTier) {
    const { M, opts } = ctx;
    const g = new THREE.Group();
    const crystal = this.cache.crystal || (this.cache.crystal = this.lib.crystal());
    const candle = this.cache.candle || (this.cache.candle = this.lib.plain('#f6efe2', 0.5));
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 9 });
    ctx.glows.push({ mat: bulbMat, base: 9 });
    const drop = opts.drop ?? 0.7;
    const bodyH = 1.6 * scale;
    // سلسلة
    const linkGeo = torus(0.03 * scale, 0.007 * scale, 12, 6);
    const links = Math.max(1, Math.floor(drop / (0.05 * scale)));
    const chain = new THREE.InstancedMesh(linkGeo, M.metal, links);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < links; i++) {
      q.setFromEuler(new THREE.Euler(0, (i % 2) * Math.PI / 2, Math.PI / 2));
      m4.compose(new THREE.Vector3(0, -i * (drop / links) - 0.03, 0), q, new THREE.Vector3(1, 1, 1));
      chain.setMatrixAt(i, m4);
    }
    g.add(chain);
    g.add(mesh(lathe([[0, 0], [0.22 * scale, 0], [0.2 * scale, -0.06 * scale], [0.06 * scale, -0.14 * scale], [0, -0.15 * scale]], 32), M.metal));
    const y0 = -drop;
    // الساق المركزية
    g.add(mesh(lathe([
      [0.04, 0], [0.09, -0.08], [0.05, -0.2], [0.12, -0.35], [0.06, -0.5], [0.1, -0.62], [0.16, -0.75],
      [0.1, -0.9], [0.06, -1.05], [0.12, -1.2], [0.08, -1.35], [0.03, -1.5], [0, -1.6],
    ].map(([r, y]) => [r * scale, y * scale + y0]), 32), M.metal));
    const drops = [], beads = [];
    const bulbs = [];
    for (let t = 0; t < tiers; t++) {
      const R = (0.62 - t * 0.18) * scale * (tiers === 3 ? 1.25 : 1);
      const yA = y0 - (0.95 - t * 0.38) * scale;
      const n = armsPerTier[t];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 0.3;
        const ca = Math.cos(a), sa = Math.sin(a);
        g.add(mesh(tube([
          [ca * 0.07 * scale, yA - 0.05 * scale, sa * 0.07 * scale],
          [ca * R * 0.4, yA - 0.2 * scale, sa * R * 0.4],
          [ca * R * 0.85, yA - 0.12 * scale, sa * R * 0.85],
          [ca * R, yA + 0.05 * scale, sa * R],
        ], 0.016 * scale, 20, 6), M.metal));
        const cx = ca * R, cz = sa * R, cy = yA + 0.06 * scale;
        g.add(mesh(lathe([[0, 0], [0.05, 0.0], [0.07, 0.03], [0.05, 0.04], [0.035, 0.05], [0, 0.05]].map(([r, y]) => [r * scale, y * scale]), 16), M.metal, cx, cy, cz));
        g.add(mesh(cyl(0.017 * scale, 0.017 * scale, 0.14 * scale, 12), candle, cx, cy + 0.12 * scale, cz));
        bulbs.push([cx, cy + 0.22 * scale, cz]);
        drops.push([cx, cy - 0.09 * scale, cz, 1.2]);
        for (let k = 1; k <= 3; k++) drops.push([ca * R * (1 - k * 0.22), yA - 0.12 * scale - k * 0.02 * scale, sa * R * (1 - k * 0.22), 0.8]);
        const a2 = ((i + 1) / n) * Math.PI * 2 + t * 0.3;
        const nx = Math.cos(a2) * R, nz = Math.sin(a2) * R;
        for (let k = 1; k < 12; k++) {
          const u = k / 12;
          const sag = Math.sin(u * Math.PI) * 0.16 * scale;
          beads.push([cx + (nx - cx) * u, cy - 0.05 * scale - sag, cz + (nz - cz) * u]);
        }
      }
      for (let k = 0; k < n * 2; k++) {
        const a = (k / (n * 2)) * Math.PI * 2;
        for (let j = 0; j < 3; j++) drops.push([Math.cos(a) * 0.16 * scale, yA - 0.25 * scale - j * 0.09 * scale, Math.sin(a) * 0.16 * scale, 0.7]);
      }
    }
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; drops.push([Math.cos(a) * 0.1 * scale, y0 - 1.55 * scale, Math.sin(a) * 0.1 * scale, 1.4]); }
    drops.push([0, y0 - 1.72 * scale, 0, 2.4]);
    const dg = new THREE.OctahedronGeometry(0.03 * scale, 0); dg.scale(0.75, 1.7, 0.75);
    const dim = new THREE.InstancedMesh(dg, crystal, drops.length);
    drops.forEach(([x, y, z, s], i) => { m4.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(s, s, s)); dim.setMatrixAt(i, m4); });
    g.add(dim);
    const bim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.013 * scale, 0), crystal, beads.length);
    beads.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); bim.setMatrixAt(i, m4); });
    g.add(bim);
    const flame = new THREE.SphereGeometry(0.022 * scale, 10, 8); flame.scale(1, 1.6, 1);
    const fim = new THREE.InstancedMesh(flame, bulbMat, bulbs.length);
    bulbs.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); fim.setMatrixAt(i, m4); });
    fim.castShadow = false;
    g.add(fim);
    for (const im of [dim, bim]) im.castShadow = false;
    const intensity = (tiers === 3 ? 55 : 26) * scale;
    const light = new THREE.PointLight(0xffd2a0, intensity, 0, 2);
    light.position.set(0, y0 - 0.85 * scale, 0);
    light.userData.keep = true;
    g.add(light);
    ctx.lights.push({ light, base: intensity });
    void bodyH;
    return g;
  }
  _chandelier(ctx) { return this._chandelierBody(ctx, 1, 2, [8, 6]); }
  _chandelierGrand(ctx) { return this._chandelierBody(ctx, 1.9, 3, [14, 10, 8]); }

  _lanternHanging(ctx) {
    const { M, opts } = ctx;
    const g = new THREE.Group();
    const drop = opts.drop ?? 0.6;
    g.add(mesh(cyl(0.008, 0.008, drop, 6), M.metal, 0, -drop / 2, 0));
    const glow = new THREE.MeshStandardMaterial({ color: '#2a1a0a', emissive: new THREE.Color('#ffb46a'), emissiveIntensity: 3.5, transparent: true, opacity: 0.85 });
    ctx.glows.push({ mat: glow, base: 3.5 });
    const y0 = -drop;
    const body = lathe([[0, 0], [0.1, -0.02], [0.08, -0.1], [0.22, -0.3], [0.26, -0.5], [0.22, -0.7], [0.1, -0.85], [0.06, -0.95], [0, -1.0]].map(([r, y]) => [r, y + y0]), 8);
    g.add(mesh(body, glow, 0, 0, 0, { cast: false }));
    const mash = this.cache.lanternMesh || (this.cache.lanternMesh = (() => { const m = this.lib.mashrabiya(); m.color = new THREE.Color('#d0a050'); m.metalness = 0.8; m.roughness = 0.35; return m; })());
    const shell = lathe([[0, 0], [0.105, -0.02], [0.085, -0.1], [0.23, -0.3], [0.27, -0.5], [0.23, -0.7], [0.105, -0.85], [0.065, -0.95], [0, -1.0]].map(([r, y]) => [r, y + y0]), 16);
    g.add(mesh(shell, mash));
    for (const yy of [-0.3, -0.5, -0.7]) g.add(mesh(torus(yy === -0.5 ? 0.27 : 0.23, 0.01, 32, 6), M.metal, 0, yy + y0, 0, { rx: Math.PI / 2 }));
    const light = new THREE.PointLight(0xffb878, 28, 0, 2);
    light.position.set(0, y0 - 0.5, 0);
    light.userData.keep = true;
    g.add(light);
    ctx.lights.push({ light, base: 28 });
    return g;
  }

  _floorLamp(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.2, 0], [0.21, 0.02], [0.12, 0.05], [0.03, 0.08], [0.02, 1.4], [0.035, 1.45], [0, 1.46]], 32), M.metal));
    const shade = this.lib.shade(findOption('fabric', ctx.s.fabric).hex);
    ctx.glows.push({ mat: shade, base: 1.2 });
    g.add(mesh(lathe([[0.24, 1.3], [0.15, 1.7], [0.145, 1.7]], 48), shade, 0, 0, 0, { cast: false }));
    const bulb = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#fff0d0'), emissiveIntensity: 8 });
    ctx.glows.push({ mat: bulb, base: 8 });
    g.add(mesh(new THREE.SphereGeometry(0.05, 16, 10), bulb, 0, 1.47, 0, { cast: false }));
    return g;
  }
  _tableLamp(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.09, 0], [0.1, 0.03], [0.13, 0.15], [0.12, 0.28], [0.05, 0.36], [0.03, 0.42], [0.015, 0.45], [0, 0.45]], 32), M.metal));
    const shade = this.lib.shade(findOption('fabric', ctx.s.fabric).hex);
    ctx.glows.push({ mat: shade, base: 1.2 });
    g.add(mesh(lathe([[0.2, 0.4], [0.12, 0.66], [0.115, 0.66]], 40), shade, 0, 0, 0, { cast: false }));
    return g;
  }
  _lantern(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.2, 0], [0.2, 0.06], [0.16, 0.08], [0.16, 0.7], [0.21, 0.74], [0.12, 0.9], [0.03, 0.98], [0, 1.0]], 6), M.metal));
    const glass = new THREE.MeshStandardMaterial({ color: '#1a1206', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 2.4, transparent: true, opacity: 0.8 });
    ctx.glows.push({ mat: glass, base: 2.4 });
    g.add(mesh(cyl(0.165, 0.165, 0.6, 6), glass, 0, 0.39, 0, { cast: false }));
    return g;
  }

  /* ================================================================ سجاد */
  _rugGeneric(ctx, W, L) {
    const { M } = ctx;
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(W, L); geo.rotateX(-Math.PI / 2);
    const m = mesh(geo, M.rug, 0, 0.006, 0, { cast: false });
    g.add(m);
    const fr = new THREE.BoxGeometry(0.006, 0.004, 0.08);
    const n = Math.floor(W / 0.018);
    const ivory = this.cache.fringe || (this.cache.fringe = this.lib.plain('#e9dfc8', 0.9));
    const im = new THREE.InstancedMesh(fr, ivory, n * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) { m4.makeTranslation(-W / 2 + (i + 0.5) * (W / n), 0.004, s * (L / 2 + 0.04)); im.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4); }
    im.castShadow = false;
    g.add(im);
    return g;
  }
  _rugPersian(ctx) { return this._rugGeneric(ctx, 3.0, 4.0); }
  _rugRunner(ctx) { return this._rugGeneric(ctx, 2.0, 6.5); }
  _rugGrand(ctx) { return this._rugGeneric(ctx, 6.0, 8.0); }

  /* ================================================================ نباتات */
  _pot(M, r = 0.38, h = 0.5) {
    return mesh(lathe([[0, 0], [r * 0.7, 0], [r * 0.75, 0.04], [r * 0.85, h * 0.4], [r, h * 0.85], [r * 1.08, h * 0.9], [r * 1.08, h], [r * 0.95, h], [r * 0.93, h * 0.92], [0, h * 0.92]], 48), M.stone);
  }
  _palm(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(this._pot(M, 0.45, 0.6));
    const trunk = new THREE.Mesh(this.palace._palmTrunkGeo(), this.cache.bark || (this.cache.bark = this.lib.bark()));
    trunk.scale.setScalar(0.3);
    trunk.position.y = 0.5;
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = this.cache.leaf || (this.cache.leaf = this.lib.leaf());
    const fg = this.palace._palmFrondGeo();
    const n = 14;
    const im = new THREE.InstancedMesh(fg, leaf, n);
    const m4 = new THREE.Matrix4();
    const rnd = mulberry(9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(0.1 + rnd() * 0.7), a, 0, 'YXZ'));
      m4.compose(new THREE.Vector3(0.05, 0.5 + 7.6 * 0.3, 0), q, new THREE.Vector3(0.36, 0.36, 0.36));
      im.setMatrixAt(i, m4);
    }
    im.castShadow = true;
    g.add(im);
    return g;
  }
  _plant(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(this._pot(M, 0.28, 0.42));
    const tree = this.palace.orangeTree(0.62);
    tree.children.forEach((c) => { if (c.isInstancedMesh && c.count < 50) c.visible = false; });
    tree.position.y = -0.05;
    g.add(tree);
    return g;
  }

  /* ================================================================ قطع صغيرة */
  _flowers(ctx, count, radius, height, y0) {
    const g = new THREE.Group();
    const rnd = mulberry(count * 13 + 1);
    const petal = this.cache.petals || (this.cache.petals = [
      new THREE.MeshPhysicalMaterial({ color: '#b3182b', roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#ff7a8a') }),
      new THREE.MeshPhysicalMaterial({ color: '#f4efe8', roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#ffffff') }),
      new THREE.MeshPhysicalMaterial({ color: '#e8a0b0', roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#ffd0dc') }),
    ]);
    const head = new THREE.IcosahedronGeometry(0.045, 1);
    const pp = head.attributes.position;
    for (let i = 0; i < pp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pp, i); const k = 1 + 0.22 * Math.sin(v.x * 90) * Math.sin(v.z * 80); pp.setXYZ(i, v.x * k, v.y * 0.8 * k, v.z * k); }
    head.computeVertexNormals();
    const m4 = new THREE.Matrix4();
    const per = Math.ceil(count / 3);
    for (let c = 0; c < 3; c++) {
      const im = new THREE.InstancedMesh(head, petal[c], per);
      for (let i = 0; i < per; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius, y = y0 + height * (0.55 + 0.45 * (1 - r / radius)) + rnd() * 0.08;
        const s = 0.8 + rnd() * 0.6;
        m4.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())), new THREE.Vector3(s, s, s));
        im.setMatrixAt(i, m4);
      }
      im.castShadow = true;
      g.add(im);
    }
    const leafMat = this.cache.vleaf || (this.cache.vleaf = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: this.palace._leafAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
    const card = new THREE.PlaneGeometry(0.16, 0.16);
    const li = new THREE.InstancedMesh(card, leafMat, Math.floor(count * 0.8));
    for (let i = 0; i < li.count; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius * 1.05;
      m4.compose(new THREE.Vector3(Math.cos(a) * r, y0 + height * (0.4 + 0.5 * rnd()), Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 6, rnd() * 3)), new THREE.Vector3(1, 1, 1));
      li.setMatrixAt(i, m4);
    }
    g.add(li);
    g.userData.keep = true;
    return g;
  }
  _vase(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.08, 0], [0.09, 0.02], [0.07, 0.04], [0.12, 0.12], [0.15, 0.22], [0.13, 0.32], [0.07, 0.4], [0.065, 0.44], [0.09, 0.47], [0.085, 0.48], [0.06, 0.46], [0, 0.46]], 48), M.stone));
    g.add(mesh(torus(0.09, 0.006, 32, 6), M.metal, 0, 0.475, 0, { rx: Math.PI / 2 }));
    g.add(mesh(torus(0.15, 0.005, 32, 6), M.metal, 0, 0.22, 0, { rx: Math.PI / 2 }));
    g.add(this._flowers(ctx, 36, 0.17, 0.32, 0.42));
    return g;
  }
  _vaseGrand(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.2, 0], [0.22, 0.04], [0.16, 0.1], [0.28, 0.3], [0.34, 0.5], [0.28, 0.68], [0.16, 0.8], [0.15, 0.86], [0.22, 0.9], [0.2, 0.92], [0, 0.9]], 64), M.stone));
    g.add(mesh(torus(0.21, 0.012, 48, 8), M.metal, 0, 0.91, 0, { rx: Math.PI / 2 }));
    g.add(mesh(torus(0.34, 0.01, 48, 8), M.metal, 0, 0.5, 0, { rx: Math.PI / 2 }));
    g.add(this._flowers(ctx, 210, 0.55, 0.55, 0.88));
    return g;
  }
  _dallah({ M }) {
    const g = new THREE.Group();
    const pot = new THREE.Group();
    pot.add(mesh(lathe([[0, 0], [0.07, 0], [0.08, 0.02], [0.085, 0.08], [0.06, 0.13], [0.035, 0.16], [0.03, 0.2], [0.05, 0.22], [0.045, 0.26], [0.02, 0.3], [0.01, 0.33], [0, 0.34]], 32), M.metal));
    pot.add(mesh(tube([[0.06, 0.1, 0], [0.12, 0.14, 0], [0.16, 0.22, 0], [0.19, 0.27, 0]], 0.012, 16, 8), M.metal));
    pot.add(mesh(tube([[-0.06, 0.08, 0], [-0.11, 0.15, 0], [-0.08, 0.24, 0], [-0.04, 0.24, 0]], 0.007, 16, 6), M.metal));
    pot.position.set(-0.1, 0, 0);
    g.add(pot);
    const porcelain = this.cache.porcelain || (this.cache.porcelain = this.lib.plain('#f4f0e8', 0.2));
    for (let i = 0; i < 4; i++) {
      const cup = new THREE.Group();
      cup.add(mesh(lathe([[0, 0], [0.02, 0], [0.022, 0.005], [0.03, 0.04], [0.028, 0.042], [0.026, 0.04], [0, 0.01]], 24), porcelain));
      cup.add(mesh(torus(0.029, 0.002, 24, 4), M.metal, 0, 0.041, 0, { rx: Math.PI / 2 }));
      cup.position.set(0.1 + (i % 2) * 0.07, 0, -0.05 + Math.floor(i / 2) * 0.1);
      g.add(cup);
    }
    return g;
  }
  _incense(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.09, 0], [0.1, 0.03], [0.06, 0.06], [0.05, 0.14], [0.08, 0.16]], 4), M.wood));
    g.add(mesh(lathe([[0.08, 0.16], [0.1, 0.2], [0.11, 0.24], [0, 0.24]], 32), M.metal));
    g.add(mesh(lathe([[0.1, 0.24], [0.08, 0.3], [0.04, 0.34], [0.01, 0.38], [0, 0.38]], 4), M.metal));
    // دخان متصاعد
    const n = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const sd = new Float32Array(n); for (let i = 0; i < n; i++) sd[i] = i / n;
    geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; varying float vA;
        void main(){
          float t = fract(aSeed + uTime * 0.12);
          vec3 p = vec3(sin(t * 9.0 + aSeed * 30.0) * 0.05 * t, 0.36 + t * 1.1, cos(t * 7.0 + aSeed * 20.0) * 0.05 * t);
          vA = (1.0 - t) * smoothstep(0.0, 0.1, t) * 0.32;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((8.0 + 60.0 * t) / -mv.z * 4.0, 2.0, 80.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.85, 0.85, 0.88), vA * (1.0 - d * 2.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const smoke = new THREE.Points(geo, mat);
    smoke.frustumCulled = false;
    smoke.userData.keep = true;
    g.add(smoke);
    ctx.animate.push((t) => { mat.uniforms.uTime.value = t; });
    return g;
  }

  /* ================================================================ لوحات ومرايا (قطع جدارية) */
  _frame(M, W, H, depth = 0.07, band = 0.11) {
    const outer = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
    const inner = [[-W / 2 + band, -H / 2 + band], [W / 2 - band, -H / 2 + band], [W / 2 - band, H / 2 - band], [-W / 2 + band, H / 2 - band]];
    const g = extrude(shapeFrom(outer, [inner]), depth, 0.02);
    boxUV(g);
    return mesh(g, M.metal);
  }
  _paintingCommon(ctx, W, H) {
    const { M } = ctx;
    const g = new THREE.Group();
    g.add(this._frame(M, W, H, 0.06, Math.min(W, H) * 0.08));
    const band = Math.min(W, H) * 0.08;
    const canvas = new THREE.PlaneGeometry(W - band * 2 + 0.01, H - band * 2 + 0.01);
    g.add(mesh(canvas, M.art, 0, 0, 0.035, { cast: false }));
    const lip = this._frame(M, W - band * 2 + 0.06, H - band * 2 + 0.06, 0.02, 0.03);
    lip.position.z = 0.03;
    g.add(lip);
    // مصباح لوحة نحاسي
    g.add(mesh(cyl(0.025, 0.025, W * 0.5, 16), M.metal, 0, H / 2 + 0.05, 0.16, { rz: Math.PI / 2 }));
    g.add(mesh(tube([[0, H / 2 - 0.05, 0.02], [0, H / 2 + 0.06, 0.08], [0, H / 2 + 0.05, 0.16]], 0.008, 12, 6), M.metal));
    return g;
  }
  _painting(ctx) { return this._paintingCommon(ctx, 1.6, 1.15); }
  _paintingLarge(ctx) { return this._paintingCommon(ctx, 2.6, 1.8); }
  _mirror(ctx) {
    const { M } = ctx;
    const g = new THREE.Group();
    const W = 1.1, H = 1.8;
    const pts = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2 - W / 2]];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; pts.push([Math.cos(a) * W / 2, H / 2 - W / 2 + Math.sin(a) * W / 2]); }
    pts.push([-W / 2, H / 2 - W / 2]);
    const inner = pts.map(([x, y]) => [x * 0.86, y * 0.9]);
    const fg = extrude(shapeFrom(pts, [inner]), 0.06, 0.015); boxUV(fg);
    g.add(mesh(fg, M.metal));
    const mg = new THREE.ShapeGeometry(shapeFrom(inner)); boxUV(mg);
    const mirror = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.02, envMapIntensity: 1 });
    g.add(mesh(mg, mirror, 0, 0, 0.03, { cast: false }));
    g.add(mesh(lathe([[0, 0], [0.06, 0.02], [0.05, 0.07], [0.02, 0.12], [0, 0.13]], 16), M.metal, 0, H / 2 + 0.04, 0.04));
    return g;
  }
}
