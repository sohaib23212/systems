/* ============================================================================
 *  architecture.js — بناء القصر
 *  ---------------------------------------------------------------------------
 *  جدران بفتحات مقوّسة (بثق أشكال ثنائية الأبعاد) بنصفين لكل جدار حتى يكون
 *  لكل وجه خامته، إطارات منحوتة حول الفتحات، أبواب تُفتح، نوافذ ومشربيات،
 *  أسقف (كاسيت/خشب/جبس) مع كرانيش، قبة بأسطوانة، فناء أندلسي بأروقة وبركة
 *  ونوافير، شرفات (merlons) وأشرطة زليج، حدائق ونخيل وبركة عاكسة.
 * ========================================================================== */
import * as THREE from 'three';
import { ROOMS, WALLS, DOME, COURTYARD, SIGNATURE, APP } from './config.js';
import { archPoints, archRise, boxUV, cylUV, box, rbox, cyl, lathe, torus, extrude, shapeFrom, mesh, mergeByMaterial, tube } from './geom.js';
import { makeReflective } from './materials.js';

const DADO = {
  entrance: { h: 0.95, mat: 'marbleBlack' }, courtyard: { h: 1.05, mat: 'zelligeWall' },
  majlis: { h: 0.75, mat: 'zelligeWall' }, dining: { h: 0.75, mat: 'panel' },
  hall: { h: 0.16, mat: 'marbleBlack' }, suite: { h: 0.14, mat: 'marbleWhite' }, library: { h: 0.14, mat: 'walnut' },
};
const CURTAINS = { hall: '#5c1420', suite: '#a87c32', dining: '#5c1420', library: '#134636', entrance: '#1a2547' };

export function roomAt(x, z) {
  for (const r of ROOMS) {
    const [x0, z0, x1, z1] = r.rect;
    if (x > x0 + 1e-3 && x < x1 - 1e-3 && z > z0 + 1e-3 && z < z1 - 1e-3) return r;
  }
  return null;
}
export function roomById(id) { return ROOMS.find((r) => r.id === id) || null; }

/** ارتفاع السقف عند نقطة (للثريات) */
export function ceilingAt(x, z) {
  const r = roomAt(x, z);
  if (!r) return 4.5;
  if (r.open) return Math.abs(x) > 10 - COURTYARD.galleryDepth ? COURTYARD.facadeTop : null;
  if (r.dome) {
    const dx = x - DOME.center[0], dz = z - DOME.center[1];
    if (Math.hypot(dx, dz) < DOME.ringRadius) return DOME.base + DOME.drumHeight + DOME.radius - 0.2;
  }
  return r.height;
}

export class Palace {
  constructor({ lib, baker }) {
    this.lib = lib;
    this.baker = baker;
    this.group = new THREE.Group();
    this.group.name = 'palace';
    this.collision = new THREE.Group();
    this.collision.name = 'collision';
    this.collisionMat = new THREE.MeshBasicMaterial({ visible: false });
    this.state = { rooms: {} };
    for (const r of ROOMS) this.state.rooms[r.id] = { floor: r.floor, wall: { ...r.wall }, ceiling: r.ceiling };
    this.floors = {};
    this.wallMeshes = {};
    this.wallMats = {};
    this.ceilings = {};
    this.roofParts = [];
    this.doors = [];
    this.animated = [];
    this.windowLights = [];
    this.waterMaterials = [];
    this.dayEmissive = [];
    this.nightEmissive = [];
    this.pointLights = [];
  }

  _add(obj, room = 'exterior', parent = this.group) {
    obj.traverse((o) => { if (o.isMesh) o.userData.room = o.userData.room || room; });
    parent.add(obj);
    return obj;
  }
  _collide(obj) {
    const c = obj.clone();
    c.traverse((o) => { if (o.isMesh) o.material = this.collisionMat; });
    this.collision.add(c);
  }
  _collideBox(cx, cy, cz, sx, sy, sz, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.collisionMat);
    m.position.set(cx, cy, cz);
    m.rotation.y = ry;
    this.collision.add(m);
  }

  /* ================================================================ البناء */
  build(progress = () => {}) {
    const steps = [
      ['الأرضيات', () => this._floors()],
      ['الجدران والأقواس', () => this._walls()],
      ['الأسقف والقبة', () => this._ceilingsAll()],
      ['الأسطح والشرفات', () => this._roofs()],
      ['الفناء الأندلسي', () => this._courtyard()],
      ['أعمدة القاعة الكبرى', () => this._hallColumns()],
      ['الحدائق والواجهة', () => this._exterior()],
      ['التوقيع والخط العربي', () => this._signatures()],
    ];
    steps.forEach(([label, fn], i) => { fn(); progress((i + 1) / steps.length, label); });
    this.group.traverse((o) => { if (o.isMesh && o.userData.roof) this.roofParts.push(o); });
    return this;
  }

  /* ---------------------------------------------------------------- الأرضيات */
  _floorMesh(room) {
    const [x0, z0, x1, z1] = room.rect;
    let geo;
    if (room.open) {
      const p = COURTYARD.pool;
      const s = shapeFrom([[x0, -z0], [x1, -z0], [x1, -z1], [x0, -z1]], [[[p.x0, -p.z0], [p.x0, -p.z1], [p.x1, -p.z1], [p.x1, -p.z0]]]);
      geo = new THREE.ShapeGeometry(s);
      geo.rotateX(-Math.PI / 2);
      boxUV(geo);
    } else {
      geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      geo.rotateX(-Math.PI / 2);
      geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      boxUV(geo);
    }
    const m = new THREE.Mesh(geo, this.lib.floor(this.state.rooms[room.id].floor));
    m.receiveShadow = true;
    m.userData.surface = { room: room.id, kind: 'floor' };
    m.userData.room = room.id;
    m.userData.reflectiveFloor = true;
    return m;
  }
  _floors() {
    for (const r of ROOMS) {
      const m = this._floorMesh(r);
      this.floors[r.id] = m;
      this._add(m, r.id);
      this._collide(m);
    }
  }
  setFloor(roomId, key) {
    this.state.rooms[roomId].floor = key;
    const old = this.floors[roomId];
    const m = old.material;
    old.material = this.lib.floor(key);
    old.material.envMap = m.envMap;
    m.dispose();
  }

  /* ---------------------------------------------------------------- الجدران */
  _wallMaterial(side) {
    if (!side) {
      if (!this.wallMats.exterior) this.wallMats.exterior = this.lib.limestone();
      return this.wallMats.exterior;
    }
    if (!this.wallMats[side.id]) {
      const w = this.state.rooms[side.id].wall;
      this.wallMats[side.id] = this.lib.wall(w.finish, w.color);
    }
    return this.wallMats[side.id];
  }
  setWall(roomId, finish, colorHex) {
    const w = this.state.rooms[roomId].wall;
    if (finish) w.finish = finish;
    if (colorHex) w.color = colorHex;
    const old = this.wallMats[roomId];
    const nm = this.lib.wall(w.finish, w.color);
    if (old) nm.envMap = old.envMap;
    this.wallMats[roomId] = nm;
    for (const m of this.wallMeshes[roomId] || []) m.material = nm;
    old && old.dispose();
  }

  _wallShape(len, height, openings) {
    // الفتحات الأرضية الأعلى من الجزء المبني تقسمه إلى قطع منفصلة (بدل مضلع متقاطع)
    const floorOps = openings.filter((o) => o.sill <= 1e-3).sort((a, b) => a.c - b.c);
    const cutting = floorOps.filter((o) => o.h >= height - 1e-3);
    const keep = floorOps.filter((o) => o.h < height - 1e-3);
    const holesAll = openings.filter((o) => o.sill > 1e-3 && o.sill < height);
    const segs = [];
    let x0 = 0;
    for (const o of cutting) { segs.push([x0, o.c - o.w / 2]); x0 = o.c + o.w / 2; }
    segs.push([x0, len]);
    const shapes = [];
    for (const [a, b] of segs) {
      if (b - a < 1e-3) continue;
      const pts = [[a, 0]];
      for (const o of keep) if (o.c > a && o.c < b) for (const [x, y] of archPoints(o.w, o.h, o.arch, 0)) pts.push([o.c + x, y]);
      pts.push([b, 0], [b, height], [a, height]);
      const holes = holesAll.filter((o) => o.c > a && o.c < b)
        .map((o) => archPoints(o.w, o.h, o.arch, o.sill).map(([x, y]) => [o.c + x, Math.min(y, height - 0.02)]));
      shapes.push(shapeFrom(pts, holes));
    }
    return shapes.length === 1 ? shapes[0] : shapes;
  }

  /** نصف جدار مبثوق: z من z0 إلى z0+depth في إطار الجدار المحلي */
  _halfWall(frame, len, y0, height, openings, z0, depth, mat, room, kind = 'wall') {
    const ops = openings.map((o) => ({ ...o, sill: o.sill - y0 })).filter((o) => o.sill + o.h > 0 && o.sill < height);
    const shape = this._wallShape(len, height, ops);
    const g = extrude(shape, depth);
    g.translate(0, y0, z0);
    boxUV(g);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.room = room ? room.id : 'exterior';
    if (room && kind === 'wall') {
      m.userData.surface = { room: room.id, kind: 'wall' };
      (this.wallMeshes[room.id] = this.wallMeshes[room.id] || []).push(m);
    }
    frame.add(m);
    return m;
  }

  _walls() {
    for (const w of WALLS) {
      const ax = w.a[0], az = w.a[1], bx = w.b[0], bz = w.b[1];
      const len = Math.hypot(bx - ax, bz - az);
      const d = new THREE.Vector3((bx - ax) / len, 0, (bz - az) / len);
      const n = new THREE.Vector3(-d.z, 0, d.x);
      const frame = new THREE.Group();
      frame.matrixAutoUpdate = false;
      frame.matrix.makeBasis(d, new THREE.Vector3(0, 1, 0), n).setPosition(ax, 0, az);
      frame.matrixWorldNeedsUpdate = true;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const sideP = roomAt(mx + n.x * 0.6, mz + n.z * 0.6);
      const sideN = roomAt(mx - n.x * 0.6, mz - n.z * 0.6);
      const t = w.t;
      for (const [side, z0, sign] of [[sideP, 0, 1], [sideN, -t / 2, -1]]) {
        const roomH = side && !side.open ? side.height : w.h;
        const mat = this._wallMaterial(side);
        this._halfWall(frame, len, 0, Math.min(roomH, w.h), w.openings, z0, t / 2, mat, side);
        if (w.h > roomH + 0.01) this._halfWall(frame, len, roomH, w.h - roomH, w.openings, z0, t / 2, this._wallMaterial(null), null, 'upper');
        // إزار سفلي (زليج / خشب / رخام)
        if (side && DADO[side.id]) {
          const dd = DADO[side.id];
          const dmat = dd.mat === 'panel' ? this.lib.wall('panel', '#5a3a24') : dd.mat === 'walnut' ? this.lib.wood('walnut')
            : dd.mat === 'zelligeWall' ? this.lib.zelligeWall() : this.lib.stone(dd.mat);
          const ops = w.openings.filter((o) => o.sill < dd.h);
          const shape = this._wallShape(len, dd.h, ops);
          const g = extrude(shape, 0.014);
          g.translate(0, 0, sign > 0 ? t / 2 + 0.003 : -t / 2 - 0.017);
          boxUV(g);
          const m = new THREE.Mesh(g, dmat);
          m.receiveShadow = true;
          m.userData.room = side.id;
          frame.add(m);
        }
        // إطارات الفتحات على هذا الوجه
        for (const o of w.openings) this._openingFrame(frame, o, sign, t, side, w);
      }
      // محتوى الفتحات (أبواب/زجاج/مشربيات/ستائر)
      for (const o of w.openings) this._openingContent(frame, o, w, sideP, sideN, d, n);
      frame.updateMatrixWorld(true);
      this.group.add(frame);
      // تصادم: الجدار كاملاً
      const col = new THREE.Group();
      col.matrixAutoUpdate = false;
      col.matrix.copy(frame.matrix);
      const g = extrude(this._wallShape(len, w.h, w.openings), t);
      g.translate(0, 0, -t / 2);
      col.add(new THREE.Mesh(g, this.collisionMat));
      col.updateMatrixWorld(true);
      this.collision.add(col);
      this._exteriorBands(frame, w, len, sideP, sideN, t);
    }
  }

  /** إطار منحوت حول الفتحة */
  _openingFrame(frame, o, sign, t, side, w) {
    const f = o.kind === 'arch' ? 0.28 : o.main ? 0.32 : 0.16;
    const depth = 0.05;
    let mat;
    if (!side) mat = this._trimMat('exterior');
    else if (side.open) mat = this._trimMat('courtyard');
    else mat = this._trimMat(side.id);
    let g;
    if (o.sill <= 1e-3) {
      const outer = archPoints(o.w + 2 * f, o.h + f, o.arch, 0);
      const inner = archPoints(o.w, o.h, o.arch, 0).reverse();
      g = extrude(shapeFrom([...outer, ...inner].map(([x, y]) => [o.c + x, y])), depth);
    } else {
      const outer = archPoints(o.w + 2 * f, o.h + 2 * f, o.arch, o.sill - f).map(([x, y]) => [o.c + x, y]);
      const inner = archPoints(o.w, o.h, o.arch, o.sill).map(([x, y]) => [o.c + x, y]);
      g = extrude(shapeFrom(outer, [inner]), depth);
      // عتبة النافذة البارزة
      const sl = box(o.w + 2 * f + 0.12, 0.07, 0.14);
      sl.translate(o.c, o.sill - f - 0.035, sign > 0 ? t / 2 + 0.07 : -t / 2 - 0.07);
      const sm = new THREE.Mesh(sl, mat);
      sm.castShadow = true; sm.receiveShadow = true;
      sm.userData.room = side ? side.id : 'exterior';
      frame.add(sm);
    }
    g.translate(0, 0, sign > 0 ? t / 2 : -t / 2 - depth);
    boxUV(g);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.room = side ? side.id : 'exterior';
    frame.add(m);
    // إطار "ألفيز" مستطيل بالزليج حول الأقواس الكبرى والباب الرئيسي
    if ((o.kind === 'arch' && o.w >= 3.5) || o.main) {
      const pad = o.main ? 0.75 : 0.55, band = o.main ? 0.42 : 0.32;
      const ox0 = o.c - o.w / 2 - pad, ox1 = o.c + o.w / 2 + pad, oy1 = o.h + pad * 0.9;
      const outer = [[ox0, 0], [ox1, 0], [ox1, oy1], [ox0, oy1]];
      const inner = [[ox0 + band, 0], [ox0 + band, oy1 - band], [ox1 - band, oy1 - band], [ox1 - band, 0]];
      const s = shapeFrom([[ox0, 0], [ox0, oy1], [ox1, oy1], [ox1, 0], [ox1 - band, 0], [ox1 - band, oy1 - band], [ox0 + band, oy1 - band], [ox0 + band, 0]]);
      void outer; void inner;
      const ag = extrude(s, 0.03);
      ag.translate(0, 0, sign > 0 ? t / 2 + 0.002 : -t / 2 - 0.032);
      boxUV(ag);
      const am = new THREE.Mesh(ag, this._zellige || (this._zellige = this.lib.zelligeWall()));
      am.receiveShadow = true;
      am.userData.room = side ? side.id : 'exterior';
      frame.add(am);
    }
  }
  _trimMat(key) {
    this._trims = this._trims || {};
    if (!this._trims[key]) {
      if (key === 'exterior') this._trims[key] = this.lib.sandstone('#e7d3ae');
      else if (key === 'hall' || key === 'entrance') this._trims[key] = this.lib.stone('marbleWhite');
      else if (key === 'library' || key === 'dining') this._trims[key] = this.lib.wood('walnut');
      else this._trims[key] = this.lib.stucco('#f4ecdc');
    }
    return this._trims[key];
  }

  /** الأبواب، الزجاج، المشربيات والستائر */
  _openingContent(frame, o, w, sideP, sideN, d, n) {
    const t = w.t;
    if (o.kind === 'door') {
      const leafMat = this._doorMat || (this._doorMat = this.lib.wood('walnut'));
      const brass = this._brass || (this._brass = this.lib.metal('gold'));
      const pts = archPoints(o.w - 0.02, o.h - 0.01, o.arch, 0);
      const half = (sgn) => {
        const p = pts.filter(([x]) => (sgn < 0 ? x <= 1e-4 : x >= -1e-4));
        p.push([0, 0]);
        return p;
      };
      const leafDepth = o.main ? 0.12 : 0.07;
      const pivots = [];
      for (const sgn of [-1, 1]) {
        const poly = half(sgn).map(([x, y]) => [x - sgn * (o.w / 2 - 0.01), y]);
        const g = extrude(shapeFrom(poly), leafDepth);
        g.translate(0, 0, -leafDepth / 2);
        boxUV(g);
        const leaf = new THREE.Group();
        const lm = new THREE.Mesh(g, leafMat);
        lm.castShadow = true; lm.receiveShadow = true;
        leaf.add(lm);
        // حشوات بارزة ومقبض
        const pw = o.w / 2 - 0.22;
        for (const [py, ph] of [[0.35, Math.min(1.1, o.h * 0.28)], [0.35 + Math.min(1.1, o.h * 0.28) + 0.18, Math.min(1.25, o.h * 0.32)]]) {
          for (const face of [1, -1]) {
            const pg = rbox(pw, ph, 0.03, 0.012);
            const pm = new THREE.Mesh(pg, leafMat);
            pm.position.set(-sgn * (o.w / 4), py + ph / 2, face * (leafDepth / 2 + 0.012));
            pm.castShadow = true;
            leaf.add(pm);
          }
        }
        const knob = new THREE.Mesh(lathe([[0, 0], [0.025, 0], [0.03, 0.02], [0.012, 0.05], [0.035, 0.09], [0, 0.1]], 16), brass);
        for (const face of [1, -1]) {
          const k = knob.clone();
          k.rotation.x = face * Math.PI / 2;
          k.position.set(-sgn * (o.w / 2 - 0.14), 1.05, face * leafDepth / 2);
          leaf.add(k);
        }
        if (o.main) {
          // مسامير نحاسية على الباب الرئيسي
          const stud = new THREE.SphereGeometry(0.022, 10, 8);
          const cnt = [];
          for (let yy = 0.3; yy < o.h - 0.6; yy += 0.32) for (let xx = 0.18; xx < o.w / 2 - 0.12; xx += 0.3) cnt.push([xx, yy]);
          const im = new THREE.InstancedMesh(stud, brass, cnt.length * 2);
          const mm = new THREE.Matrix4();
          let k = 0;
          for (const [xx, yy] of cnt) for (const face of [1, -1]) { mm.makeTranslation(-sgn * xx, yy, face * (leafDepth / 2 + 0.005)); im.setMatrixAt(k++, mm); }
          im.castShadow = true;
          leaf.add(im);
        }
        const pivot = new THREE.Group();
        pivot.position.set(o.c + sgn * (o.w / 2 - 0.01), 0, 0);
        pivot.add(leaf);
        frame.add(pivot);
        pivot.traverse((m) => { if (m.isMesh) m.userData.room = (sideP || sideN || {}).id || 'exterior'; });
        pivots.push({ pivot, sgn });
      }
      const center = new THREE.Vector3(o.c, 0, 0).applyMatrix4(frame.matrix);
      this.doors.push({ pivots, center, angle: 0, max: o.main ? 1.45 : 1.6 });
    } else if (o.kind === 'window') {
      const pts = archPoints(o.w, o.h, o.arch, o.sill).map(([x, y]) => [o.c + x, y]);
      const g = new THREE.ShapeGeometry(shapeFrom(pts));
      boxUV(g);
      const glass = new THREE.Mesh(g, this._glass || (this._glass = this.lib.glass()));
      glass.userData.room = (sideP || sideN || {}).id || 'exterior';
      glass.renderOrder = 2;
      frame.add(glass);
      const metal = this._winMetal || (this._winMetal = this.lib.metal('blackChrome'));
      const top = o.sill + o.h;
      const vb = box(0.04, o.h - 0.05, 0.05); vb.translate(o.c, o.sill + (o.h - 0.05) / 2, 0);
      const hb1 = box(o.w, 0.04, 0.05); hb1.translate(o.c, o.sill + o.h * 0.33, 0);
      const hb2 = box(o.w, 0.04, 0.05); hb2.translate(o.c, o.sill + o.h * 0.62, 0);
      for (const gg of [vb, hb1, hb2]) { const m = new THREE.Mesh(gg, metal); m.castShadow = true; frame.add(m); }
      void top;
      // ستائر داخل الغرف
      for (const [side, sign] of [[sideP, 1], [sideN, -1]]) {
        if (!side || side.open || !CURTAINS[side.id]) continue;
        this._curtains(frame, o, sign * (t / 2 + 0.16), side, CURTAINS[side.id]);
      }
    } else if (o.kind === 'mashrabiya') {
      const pts = archPoints(o.w, o.h, o.arch, o.sill).map(([x, y]) => [o.c + x, y]);
      const g = new THREE.ShapeGeometry(shapeFrom(pts));
      boxUV(g);
      const mm = new THREE.Mesh(g, this._mash || (this._mash = this.lib.mashrabiya()));
      mm.castShadow = true; mm.receiveShadow = true;
      mm.userData.room = (sideP || sideN || {}).id || 'exterior';
      frame.add(mm);
    }
  }

  /** ستارتان مخمليتان بثنيات حقيقية + حامل ذهبي */
  _curtains(frame, o, z, side, hex) {
    const fab = this.lib.fabric({ type: 'velvet', hex });
    const gold = this._brass || (this._brass = this.lib.metal('gold'));
    const top = Math.min(o.sill + o.h + 0.45, side.height - 0.25);
    const H = top - 0.02;
    const pw = o.w * 0.42 + 0.3;
    for (const sgn of [-1, 1]) {
      const g = new THREE.PlaneGeometry(pw, H, 48, 24);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const v = (y + H / 2) / H;
        const gather = 1 - 0.35 * Math.exp(-Math.pow((v - 0.42) / 0.12, 2));
        const fold = Math.sin((x / pw + 0.5) * Math.PI * 9) * 0.045 * (0.6 + 0.4 * v);
        p.setX(i, x * gather + sgn * (1 - gather) * pw * 0.25);
        p.setZ(i, fold);
      }
      g.computeVertexNormals();
      boxUV(g);
      const m = new THREE.Mesh(g, fab);
      m.material.side = THREE.DoubleSide;
      m.position.set(o.c + sgn * (o.w / 2 + pw / 2 - 0.12), H / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.room = side.id;
      frame.add(m);
      const tie = new THREE.Mesh(torus(0.11, 0.018, 24, 8), gold);
      tie.position.set(o.c + sgn * (o.w / 2 + pw / 2 - 0.12), H * 0.42, z + 0.05);
      tie.scale.set(1.6, 0.4, 0.6);
      tie.userData.room = side.id;
      frame.add(tie);
    }
    const rod = cyl(0.022, 0.022, o.w + 2 * pw + 0.3, 16);
    rod.rotateZ(Math.PI / 2);
    const rm = new THREE.Mesh(rod, gold);
    rm.position.set(o.c, top + 0.04, z - 0.04);
    rm.userData.room = side.id;
    frame.add(rm);
    for (const sgn of [-1, 1]) {
      const fin = new THREE.Mesh(lathe([[0, 0], [0.045, 0.02], [0.05, 0.06], [0.02, 0.1], [0, 0.12]], 16), gold);
      fin.rotation.z = -sgn * Math.PI / 2;
      fin.position.set(o.c + sgn * (o.w / 2 + pw + 0.15), top + 0.04, z - 0.04);
      fin.userData.room = side.id;
      frame.add(fin);
    }
  }

  /** كورنيش وشريط زليج وشرفات على الواجهات الخارجية */
  _exteriorBands(frame, w, len, sideP, sideN, t) {
    const sides = [[sideP, 1], [sideN, -1]].filter(([s]) => !s || s.open);
    if (!sides.length) return;
    const stone = this._trimMat('exterior');
    const zel = this._zellige || (this._zellige = this.lib.zelligeWall());
    const parapetTop = w.h;
    for (const [s, sign] of sides) {
      const roofY = s && s.open ? parapetTop - 1.2 : parapetTop - 1.2;
      const z = sign * (t / 2);
      const corn = box(len, 0.28, 0.2); corn.translate(len / 2, roofY - 0.15, z + sign * 0.1);
      const cm = new THREE.Mesh(corn, stone); cm.castShadow = true; cm.receiveShadow = true;
      const fr = box(len, 0.5, 0.02); fr.translate(len / 2, roofY - 0.62, z + sign * 0.011);
      const fm = new THREE.Mesh(fr, zel); fm.receiveShadow = true;
      for (const m of [cm, fm]) { m.userData.room = s ? s.id : 'exterior'; frame.add(m); }
    }
    // شرفات مدرّجة أعلى الجدار
    const step = 1.15;
    const cnt = Math.floor(len / step);
    if (cnt < 1) return;
    const g1 = box(0.55, 0.45, t * 0.9), g2 = box(0.3, 0.3, t * 0.7);
    g1.translate(0, 0.225, 0); g2.translate(0, 0.6, 0);
    const im1 = new THREE.InstancedMesh(g1, stone, cnt), im2 = new THREE.InstancedMesh(g2, stone, cnt);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < cnt; i++) {
      m4.makeTranslation((i + 0.5) * (len / cnt), parapetTop, 0);
      im1.setMatrixAt(i, m4); im2.setMatrixAt(i, m4);
    }
    for (const im of [im1, im2]) { im.castShadow = true; im.receiveShadow = true; im.userData.roof = true; im.userData.room = 'exterior'; frame.add(im); }
  }

  /* ---------------------------------------------------------------- الأسقف */
  _ceilingsAll() {
    for (const r of ROOMS) {
      if (r.open) continue;
      const g = this.buildCeiling(r, this.state.rooms[r.id].ceiling);
      this.ceilings[r.id] = g;
      this._add(g, r.id);
    }
    this._dome();
  }

  setCeiling(roomId, type) {
    const r = roomById(roomId);
    this.state.rooms[roomId].ceiling = type;
    const old = this.ceilings[roomId];
    const env = this._findEnv(old);
    this.group.remove(old);
    old.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    const g = this.buildCeiling(r, type);
    if (env) g.traverse((o) => { if (o.isMesh) { o.material.envMap = env; o.material.needsUpdate = true; } });
    this.ceilings[roomId] = g;
    this._add(g, roomId);
    return g;
  }
  _findEnv(g) { let e = null; g && g.traverse((o) => { if (!e && o.isMesh && o.material.envMap) e = o.material.envMap; }); return e; }

  buildCeiling(r, type) {
    const [x0, z0, x1, z1] = r.rect;
    const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = r.height;
    const grp = new THREE.Group();
    grp.name = `ceiling-${r.id}`;
    const plaster = this.lib.plaster('#f5f0e7');
    const gold = this.lib.metal('gold');
    const wood = this.lib.wood('walnut');
    // اللوح الأساسي (مع فتحة القبة في القاعة) — يواجه الأسفل
    let pg;
    if (r.dome) {
      const hole = [];
      for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; hole.push([DOME.center[0] + Math.cos(a) * DOME.ringRadius, DOME.center[1] + Math.sin(a) * DOME.ringRadius]); }
      pg = new THREE.ShapeGeometry(shapeFrom([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [hole]), 64);
      pg.rotateX(Math.PI / 2);
    } else {
      pg = new THREE.PlaneGeometry(W, D);
      pg.rotateX(Math.PI / 2);
      pg.translate(cx, 0, cz);
    }
    pg.translate(0, H, 0);
    boxUV(pg);
    const base = new THREE.Mesh(pg, type === 'woodBeams' ? wood : plaster);
    base.receiveShadow = true;
    base.userData.surface = { room: r.id, kind: 'ceiling' };
    base.userData.roof = true;
    grp.add(base);
    const parts = new THREE.Group();
    const inDome = (x, z) => r.dome && Math.hypot(x - DOME.center[0], z - DOME.center[1]) < DOME.ringRadius + 0.6;
    if (type === 'coffered') {
      const bw = 0.26, bd = 0.34;
      const nx = Math.max(2, Math.round(W / 2.2)), nz = Math.max(2, Math.round(D / 2.2));
      for (let i = 1; i < nx; i++) {
        const x = x0 + (W * i) / nx;
        const segs = r.dome ? this._splitAroundDome(x, z0, z1, 'x') : [[z0, z1]];
        for (const [za, zb] of segs) {
          const g = box(bw, bd, zb - za); g.translate(x, H - bd / 2, (za + zb) / 2);
          parts.add(mesh(g, plaster));
          const s = box(0.05, 0.02, zb - za); s.translate(x, H - bd - 0.01, (za + zb) / 2);
          parts.add(mesh(s, gold));
        }
      }
      for (let j = 1; j < nz; j++) {
        const z = z0 + (D * j) / nz;
        const segs = r.dome ? this._splitAroundDome(z, x0, x1, 'z') : [[x0, x1]];
        for (const [xa, xb] of segs) {
          const g = box(xb - xa, bd, bw); g.translate((xa + xb) / 2, H - bd / 2, z);
          parts.add(mesh(g, plaster));
          const s = box(xb - xa, 0.02, 0.05); s.translate((xa + xb) / 2, H - bd - 0.01, z);
          parts.add(mesh(s, gold));
        }
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = x0 + (W * (i + 0.5)) / nx, z = z0 + (D * (j + 0.5)) / nz;
        if (inDome(x, z)) continue;
        const ro = new THREE.Mesh(lathe([[0, 0], [0.16, 0], [0.12, -0.04], [0.05, -0.07], [0, -0.08]], 24), gold);
        ro.position.set(x, H, z);
        parts.add(ro);
      }
    } else if (type === 'woodBeams') {
      const n = Math.max(3, Math.round(W / 1.3));
      for (let i = 1; i < n; i++) {
        const x = x0 + (W * i) / n;
        const g = box(0.24, 0.32, D); g.translate(x, H - 0.16, cz);
        parts.add(mesh(g, wood));
        const c = box(0.3, 0.06, D); c.translate(x, H - 0.33, cz);
        parts.add(mesh(c, wood));
      }
      const ng = box(W, 0.26, 0.22); ng.translate(cx, H - 0.13, cz);
      parts.add(mesh(ng, wood));
    } else {
      // جبس مع وردة مركزية
      const ro = new THREE.Mesh(lathe([[0, 0], [0.75, 0], [0.7, -0.03], [0.55, -0.05], [0.5, -0.04], [0.32, -0.08], [0.18, -0.07], [0.08, -0.12], [0, -0.13]], 64), this.lib.stucco('#f5efe4'));
      ro.position.set(cx, H, cz);
      parts.add(ro);
      const gr = new THREE.Mesh(torus(0.52, 0.012, 64, 8), gold);
      gr.rotation.x = Math.PI / 2;
      gr.position.set(cx, H - 0.045, cz);
      parts.add(gr);
    }
    // كورنيش حول المحيط
    const prof = shapeFrom([[0, 0], [0.02, 0], [0.04, -0.05], [0.12, -0.08], [0.16, -0.16], [0.2, -0.18], [0.22, -0.3], [0.0, -0.3]]);
    const corniceMat = type === 'woodBeams' ? wood : plaster;
    const edges = [[x0, z0, x1, z0, 1], [x1, z0, x1, z1, 2], [x1, z1, x0, z1, 3], [x0, z1, x0, z0, 0]];
    for (const [ax, az, bx, bz] of edges) {
      const L = Math.hypot(bx - ax, bz - az);
      const g = extrude(prof, L);
      // الشكل في (x للخارج نحو الغرفة, y للأسفل) والبثق على z
      const m = new THREE.Mesh(g, corniceMat);
      const dir = new THREE.Vector3((bx - ax) / L, 0, (bz - az) / L);
      const inward = new THREE.Vector3(-dir.z, 0, dir.x);
      const mat4 = new THREE.Matrix4().makeBasis(inward, new THREE.Vector3(0, 1, 0), dir.clone().negate());
      m.applyMatrix4(mat4);
      m.position.set(bx, H, bz);
      m.castShadow = false; m.receiveShadow = true;
      parts.add(m);
    }
    parts.traverse((o) => { if (o.isMesh) { o.userData.roof = true; o.castShadow = false; } });
    const merged = mergeByMaterial(parts);
    merged.traverse((o) => { if (o.isMesh) { o.userData.roof = true; o.userData.room = r.id; } });
    grp.add(merged);
    grp.traverse((o) => { if (o.isMesh) o.userData.room = r.id; });
    return grp;
  }
  _splitAroundDome(c, a, b, axis) {
    const [ccx, ccz] = DOME.center;
    const R = DOME.ringRadius + 0.05;
    const off = axis === 'x' ? c - ccx : c - ccz;
    if (Math.abs(off) >= R) return [[a, b]];
    const h = Math.sqrt(R * R - off * off);
    const center = axis === 'x' ? ccz : ccx;
    const out = [];
    if (center - h > a) out.push([a, center - h]);
    if (center + h < b) out.push([center + h, b]);
    return out;
  }

  /** القبة: أسطوانة بنوافذ مضيئة + قبة داخلية مزخرفة + قبة خارجية + هلال */
  _dome() {
    const [cx, cz] = DOME.center;
    const R = DOME.ringRadius, y0 = DOME.base, hDrum = DOME.drumHeight;
    const grp = new THREE.Group();
    const gold = this.lib.metal('gold');
    const stucco = this.lib.stucco('#f2ebdd');
    // الأسطوانة الداخلية
    const drum = cyl(R, R, hDrum, 96, true);
    drum.translate(cx, y0 + hDrum / 2, cz);
    const dm = new THREE.Mesh(drum, stucco);
    dm.material.side = THREE.BackSide;
    grp.add(dm);
    // نوافذ الأسطوانة (تتوهج بضوء النهار)
    const winMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#fff3d6'), emissiveIntensity: 2.2, side: THREE.DoubleSide });
    this.dayEmissive.push({ mat: winMat, base: 2.2 });
    const wpts = archPoints(0.7, 1.05, 'pointed', 0).map(([x, y]) => [x, y]);
    const wg = new THREE.ShapeGeometry(shapeFrom(wpts));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const m = new THREE.Mesh(wg, winMat);
      m.position.set(cx + Math.cos(a) * (R - 0.02), y0 + 0.25, cz + Math.sin(a) * (R - 0.02));
      m.lookAt(cx, y0 + 0.25, cz);
      grp.add(m);
      const fr = new THREE.Mesh(torus(0.4, 0.03, 24, 6, Math.PI), gold);
      fr.position.copy(m.position).add(new THREE.Vector3(-Math.cos(a) * 0.03, 0.85, -Math.sin(a) * 0.03));
      fr.lookAt(cx, y0 + 1.1, cz);
      grp.add(fr);
    }
    // حلقات ذهبية
    for (const yy of [y0, y0 + hDrum]) {
      const ring = new THREE.Mesh(torus(R - 0.05, 0.08, 128, 10), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, yy, cz);
      grp.add(ring);
    }
    // القبة الداخلية
    const dg = new THREE.SphereGeometry(DOME.radius, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    dg.translate(cx, y0 + hDrum, cz);
    const domeIn = new THREE.Mesh(dg, this.lib.dome());
    domeIn.receiveShadow = true;
    grp.add(domeIn);
    grp.traverse((o) => { if (o.isMesh) { o.userData.room = 'hall'; o.userData.roof = true; o.castShadow = false; } });
    this.group.add(grp);
    // الخارج: أسطوانة حجرية وقبة مذهّبة وهلال
    const ext = new THREE.Group();
    const outerDrum = cyl(R + 0.45, R + 0.45, hDrum + 0.4, 96, true); // مفتوحة الطرفين (لا تغطي القبة من الداخل)
    outerDrum.translate(cx, y0 + 0.4 + (hDrum + 0.4) / 2, cz);
    ext.add(mesh(outerDrum, this.lib.sandstone('#e3cfa8')));
    const og = new THREE.SphereGeometry(DOME.radius + 0.45, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    og.translate(cx, y0 + hDrum + 0.8, cz);
    const domeOutMat = this.lib.dome();
    domeOutMat.side = THREE.FrontSide;
    ext.add(mesh(og, domeOutMat));
    const fin = lathe([[0, 0], [0.5, 0], [0.45, 0.2], [0.2, 0.35], [0.35, 0.6], [0.12, 0.85], [0.1, 1.4], [0.22, 1.6], [0.08, 1.85], [0.05, 2.4], [0, 2.5]], 32);
    fin.translate(cx, y0 + hDrum + 0.8 + DOME.radius + 0.45 - 0.1, cz);
    ext.add(mesh(fin, gold));
    const crescent = new THREE.Mesh(torus(0.32, 0.06, 32, 8, Math.PI * 1.4), gold);
    crescent.position.set(cx, y0 + hDrum + 0.8 + DOME.radius + 0.45 + 2.7, cz);
    crescent.rotation.z = -Math.PI * 0.2;
    ext.add(crescent);
    ext.traverse((o) => { if (o.isMesh) { o.userData.room = 'exterior'; o.userData.roof = true; } });
    this.group.add(ext);
  }

  /* ---------------------------------------------------------------- الأسطح */
  _roofs() {
    const stone = this.lib.sandstone('#d9c39a');
    for (const r of ROOMS) {
      if (r.open) continue;
      const [x0, z0, x1, z1] = r.rect;
      let g;
      if (r.dome) {
        const hole = [];
        for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; hole.push([DOME.center[0] + Math.cos(a) * (DOME.ringRadius + 0.3), DOME.center[1] + Math.sin(a) * (DOME.ringRadius + 0.3)]); }
        g = extrude(shapeFrom([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [hole]), 0.4);
        g.rotateX(Math.PI / 2);
        g.translate(0, r.height + 0.42, 0);
      } else {
        g = box(x1 - x0, 0.4, z1 - z0);
        g.translate((x0 + x1) / 2, r.height + 0.22, (z0 + z1) / 2);
      }
      boxUV(g);
      const m = new THREE.Mesh(g, stone);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.roof = true; m.userData.room = 'exterior';
      this.group.add(m);
    }
  }

  /* ---------------------------------------------------------------- الفناء */
  _courtyard() {
    const C = COURTYARD;
    const grp = new THREE.Group();
    const stucco = this._trimMat('courtyard');
    const marble = this.lib.stone('marbleWhite');
    const woodCeil = this.lib.wood('walnut');
    const gold = this.lib.metal('gold');
    const spanLen = 16;
    const s = spanLen / C.spans;
    const pier = 0.34;
    const aw = s - pier;
    const rise = archRise(aw, 'horseshoe');
    const facadeH = C.facadeTop - C.springY;
    for (const side of [-1, 1]) {
      const xF = side * (10 - C.galleryDepth);
      // واجهة الرواق (أقواس حدوة الحصان فوق أعمدة رشيقة)
      const ops = [];
      for (let k = 0; k < C.spans; k++) ops.push({ c: (k + 0.5) * s, w: aw, h: rise, sill: 0, arch: 'horseshoe' });
      const frame = new THREE.Group();
      frame.matrixAutoUpdate = false;
      const d = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3(-1, 0, 0);
      frame.matrix.makeBasis(d, new THREE.Vector3(0, 1, 0), n).setPosition(xF, C.springY, -6);
      const shape = this._wallShape(spanLen, facadeH, ops);
      const g = extrude(shape, 0.36);
      g.translate(0, 0, -0.18);
      boxUV(g);
      const fm = new THREE.Mesh(g, stucco);
      fm.castShadow = true; fm.receiveShadow = true;
      frame.add(fm);
      // زخرفة حول الأقواس (إطار رفيع)
      for (const o of ops) {
        const outer = archPoints(o.w + 0.16, o.h + 0.1, 'horseshoe', 0).map(([x, y]) => [o.c + x, y]);
        const inner = archPoints(o.w, o.h, 'horseshoe', 0).reverse().map(([x, y]) => [o.c + x, y]);
        for (const zz of [0.18, -0.22]) {
          const fg = extrude(shapeFrom([...outer, ...inner]), 0.04);
          fg.translate(0, 0, zz);
          boxUV(fg);
          frame.add(mesh(fg, this._zellige || (this._zellige = this.lib.zelligeWall())));
        }
      }
      frame.updateMatrixWorld(true);
      grp.add(frame);
      // الأعمدة
      for (let k = 1; k < C.spans; k++) {
        const z = -6 + k * s;
        const col = this._column(C.springY, 0.13, marble, stucco, gold, 'slim');
        col.position.set(xF, 0, z);
        grp.add(col);
        this._collideBox(xF, 1.5, z, 0.4, 3, 0.4);
      }
      // سقف الرواق وسطحه
      const ceil = box(C.galleryDepth, 0.06, spanLen);
      ceil.translate(side * (10 - C.galleryDepth / 2), C.facadeTop - 0.03, 2);
      const cm = mesh(ceil, woodCeil); cm.userData.roof = true;
      grp.add(cm);
      for (let k = 0; k <= 12; k++) {
        const bz = -6 + (k / 12) * spanLen;
        const bg = box(C.galleryDepth, 0.18, 0.14); bg.translate(side * (10 - C.galleryDepth / 2), C.facadeTop - 0.15, bz);
        const bm = mesh(bg, woodCeil); bm.userData.roof = true;
        grp.add(bm);
      }
      const roof = box(C.galleryDepth + 0.4, 0.3, spanLen);
      roof.translate(side * (10 - C.galleryDepth / 2 - 0.2), C.facadeTop + 0.15, 2);
      const rm = mesh(roof, this.lib.terracotta()); rm.userData.roof = true;
      grp.add(rm);
    }
    // البركة: حوض غائر بزليج وماء عاكس
    const p = C.pool;
    const pw = p.x1 - p.x0, pd = p.z1 - p.z0;
    const zel = this.lib.floor('zellige');
    const bottom = new THREE.PlaneGeometry(pw, pd); bottom.rotateX(-Math.PI / 2); bottom.translate((p.x0 + p.x1) / 2, -0.55, (p.z0 + p.z1) / 2); boxUV(bottom);
    grp.add(mesh(bottom, zel));
    const sides = [
      [pw, 0.55, 0.02, (p.x0 + p.x1) / 2, -0.275, p.z0 + 0.01], [pw, 0.55, 0.02, (p.x0 + p.x1) / 2, -0.275, p.z1 - 0.01],
      [0.02, 0.55, pd, p.x0 + 0.01, -0.275, (p.z0 + p.z1) / 2], [0.02, 0.55, pd, p.x1 - 0.01, -0.275, (p.z0 + p.z1) / 2],
    ];
    for (const [w, h, d, x, y, z] of sides) { const g = box(w, h, d); g.translate(x, y, z); grp.add(mesh(g, this.lib.zelligeWall())); }
    // حافة رخامية
    const rimW = 0.22;
    const rims = [
      [pw + rimW * 2, p.z0 - rimW / 2, 'x'], [pw + rimW * 2, p.z1 + rimW / 2, 'x'],
    ];
    for (const [L, z] of rims) { const g = box(L, 0.05, rimW); g.translate((p.x0 + p.x1) / 2, 0.025, z); grp.add(mesh(g, marble)); }
    for (const x of [p.x0 - rimW / 2, p.x1 + rimW / 2]) { const g = box(rimW, 0.05, pd); g.translate(x, 0.025, (p.z0 + p.z1) / 2); grp.add(mesh(g, marble)); }
    const water = this._water(pw, pd, (p.x0 + p.x1) / 2, p.waterY, (p.z0 + p.z1) / 2);
    water.userData.room = 'courtyard';
    grp.add(water);
    this._collideBox((p.x0 + p.x1) / 2, 0.5, (p.z0 + p.z1) / 2, pw + 0.3, 1.0, pd + 0.3);
    // النوافير
    for (const [fx, fz] of C.fountains) {
      const f = this._fountain(marble, gold);
      f.position.set(fx, 0, fz);
      grp.add(f);
      this._collideBox(fx, 0.5, fz, 2.0, 1.0, 2.0);
    }
    // أحواض أشجار البرتقال
    for (const [px, pz] of C.planters) {
      const pl = this._planter(marble);
      pl.position.set(px, 0, pz);
      grp.add(pl);
      this._collideBox(px, 0.4, pz, 1.5, 0.8, 1.5);
    }
    grp.traverse((o) => { if (o.isMesh || o.isPoints) o.userData.room = o.userData.room || 'courtyard'; });
    this.group.add(grp);
  }

  _water(w, d, x, y, z) {
    const mat = this.lib.water();
    mat.normalMap = this.baker.get('ripple').normalMap;
    mat.normalScale = new THREE.Vector2(0.35, 0.35);
    makeReflective(mat, 0.95);
    this.waterMaterials.push(mat);
    const g = new THREE.PlaneGeometry(w, d, 1, 1); g.rotateX(-Math.PI / 2); g.translate(x, y, z); boxUV(g);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.userData.reflectiveFloor = true;
    return m;
  }

  /** نافورة رخامية بطبقتين ونفث ماء متحرك */
  _fountain(marble, gold) {
    const g = new THREE.Group();
    g.add(mesh(lathe([[0, 0], [0.95, 0], [0.98, 0.05], [0.98, 0.42], [0.9, 0.46], [0.86, 0.12], [0, 0.12]], 64), marble));
    g.add(mesh(lathe([[0, 0.1], [0.16, 0.1], [0.12, 0.5], [0.09, 0.9], [0.14, 1.0], [0, 1.0]], 32), marble));
    g.add(mesh(lathe([[0, 0.98], [0.5, 0.98], [0.56, 1.06], [0.5, 1.12], [0.44, 1.06], [0, 1.04]], 48), marble));
    g.add(mesh(lathe([[0, 1.05], [0.05, 1.05], [0.04, 1.3], [0.07, 1.36], [0, 1.4]], 16), gold));
    const wm = this.lib.water();
    wm.envMapIntensity = 1.6;
    const w1 = new THREE.CircleGeometry(0.86, 48); w1.rotateX(-Math.PI / 2); w1.translate(0, 0.36, 0); boxUV(w1);
    g.add(mesh(w1, wm, 0, 0, 0, { cast: false }));
    const w2 = new THREE.CircleGeometry(0.44, 32); w2.rotateX(-Math.PI / 2); w2.translate(0, 1.07, 0); boxUV(w2);
    g.add(mesh(w2, wm, 0, 0, 0, { cast: false }));
    g.add(this._jets(1.4, 140));
    return g;
  }

  /** قطرات ماء متحركة (قوس مكافئ) */
  _jets(y0, count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uY0: { value: y0 }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime; uniform float uY0; uniform float uScale;
        varying float vA;
        void main() {
          float t = fract(uTime * 0.55 + aSeed);
          float ang = aSeed * 6.2831 * 7.0;
          float r = 0.62 * t;
          vec3 p = vec3(cos(ang) * r, uY0 + 1.1 * t - 1.6 * t * t * 1.25, sin(ang) * r);
          if (aSeed > 0.75) { p = vec3(cos(ang) * 0.02 * t, uY0 + 0.7 * t - 0.5 * t * t, sin(ang) * 0.02 * t); }
          vA = (1.0 - t) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uScale * 0.012 / -mv.z, 1.0, 6.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.9, 0.96, 1.0) * 1.6, vA * (1.0 - d * 2.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.keep = true;
    this.animated.push((t) => { mat.uniforms.uTime.value = t; });
    return pts;
  }

  /** حوض رخامي مع شجرة برتقال */
  _planter(marble) {
    const g = new THREE.Group();
    g.add(mesh(rbox(1.3, 0.62, 1.3, 0.04), marble, 0, 0.31, 0));
    const band = rbox(1.32, 0.16, 1.32, 0.02);
    g.add(mesh(band, this.lib.zelligeWall(), 0, 0.45, 0));
    const soil = new THREE.PlaneGeometry(1.15, 1.15); soil.rotateX(-Math.PI / 2); soil.translate(0, 0.6, 0);
    g.add(mesh(soil, this.lib.plain('#3b2a1c', 0.95)));
    g.add(this.orangeTree());
    return g;
  }

  /** شجرة برتقال: جذع + تاج كثيف من بطاقات أوراق + ثمار */
  orangeTree(scale = 1) {
    const g = new THREE.Group();
    const bark = this.lib.bark();
    g.add(mesh(tube([[0, 0.55, 0], [0.04, 1.2, 0.02], [0.02, 1.8, -0.03]], 0.07, 16, 8), bark));
    const leafMat = this._orangeLeaf || (this._orangeLeaf = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.55, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color('#9fd07a'),
      map: this._leafAtlas(),
      alphaTest: 0.5,
    }));
    const card = new THREE.PlaneGeometry(0.34, 0.34);
    const N = 420;
    const im = new THREE.InstancedMesh(card, leafMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const rnd = mulberry(11);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = Math.cbrt(rnd());
      const r = Math.sqrt(1 - u * u);
      p.set(r * Math.cos(th) * 0.75 * rr, 2.25 + u * 0.55 * rr, r * Math.sin(th) * 0.75 * rr);
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      q.setFromEuler(e);
      s.setScalar(0.7 + rnd() * 0.6);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
    }
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
    const fruit = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 12, 10), this.lib.plain('#e8771c', 0.45), 26);
    for (let i = 0; i < 26; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      m4.makeTranslation(r * Math.cos(th) * 0.74, 2.25 + u * 0.52, r * Math.sin(th) * 0.74);
      fruit.setMatrixAt(i, m4);
    }
    fruit.castShadow = true;
    g.add(fruit);
    g.scale.setScalar(scale);
    return g;
  }

  /** أطلس ورقة شجر (Canvas) */
  _leafAtlas() {
    if (this._leafTex) return this._leafTex;
    this._leafTex = this.baker.textTexture({
      width: 256, height: 256,
      draw: (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const rnd = mulberry(3);
        for (let i = 0; i < 9; i++) {
          const x = 40 + rnd() * 176, y = 40 + rnd() * 176, a = rnd() * Math.PI * 2, L = 50 + rnd() * 30;
          ctx.save(); ctx.translate(x, y); ctx.rotate(a);
          const gr = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
          gr.addColorStop(0, '#3f6e25'); gr.addColorStop(1, '#6f9e3a');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.ellipse(0, 0, L / 2, L / 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(200,230,150,0.6)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
          ctx.restore();
        }
      },
    });
    return this._leafTex;
  }

  /** عمود: قاعدة + جذع + تاج */
  _column(height, r, shaftMat, baseMat, goldMat, style = 'grand') {
    const g = new THREE.Group();
    const baseH = style === 'grand' ? 0.55 : 0.28;
    const capH = style === 'grand' ? 0.7 : 0.34;
    g.add(mesh(box(r * 2.9, baseH * 0.45, r * 2.9), baseMat, 0, baseH * 0.225, 0));
    g.add(mesh(lathe([[r * 1.4, baseH * 0.45], [r * 1.4, baseH * 0.6], [r * 1.22, baseH * 0.72], [r * 1.25, baseH * 0.82], [r * 1.05, baseH * 0.92], [r, baseH]], 40), baseMat));
    const sh = cyl(r * 0.9, r, height - baseH - capH, 40);
    sh.translate(0, baseH + (height - baseH - capH) / 2, 0);
    g.add(mesh(sh, shaftMat));
    const neck = torus(r * 0.93, r * 0.09, 40, 8); neck.rotateX(Math.PI / 2); neck.translate(0, height - capH, 0);
    g.add(mesh(neck, goldMat));
    if (style === 'grand') {
      g.add(mesh(lathe([[r * 0.9, height - capH], [r * 1.15, height - capH + 0.18], [r * 1.5, height - capH + 0.42], [r * 1.7, height - capH + 0.5]], 40), goldMat));
      g.add(mesh(box(r * 3.6, 0.2, r * 3.6), baseMat, 0, height - 0.1, 0));
    } else {
      g.add(mesh(box(r * 2.6, capH * 0.6, r * 2.6), baseMat, 0, height - capH + capH * 0.3, 0));
      g.add(mesh(box(r * 3.3, capH * 0.4, r * 3.3), baseMat, 0, height - capH * 0.2, 0));
    }
    return mergeByMaterial(g);
  }

  _hallColumns() {
    const shaft = this.lib.stone('marbleGreen');
    const base = this.lib.stone('marbleWhite');
    const gold = this.lib.metal('gold');
    const [cx, cz] = DOME.center;
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * (Math.PI / 4);
      const x = cx + Math.cos(a) * (DOME.ringRadius - 0.45), z = cz + Math.sin(a) * (DOME.ringRadius - 0.45);
      const c = this._column(DOME.base, 0.32, shaft, base, gold, 'grand');
      c.position.set(x, 0, z);
      c.traverse((o) => { if (o.isMesh) o.userData.room = 'hall'; });
      this.group.add(c);
      this._collideBox(x, 2, z, 0.8, 4, 0.8);
    }
  }

  /* ---------------------------------------------------------------- الخارج */
  _exterior() {
    const grp = new THREE.Group();
    // عشب ممتد
    // العشب مقصوص تحت البركتين حتى لا يغطي الماء
    const cp = COURTYARD.pool;
    const holeRect = (x0, x1, z0, z1) => [[x0, -z0], [x0, -z1], [x1, -z1], [x1, -z0]];
    const gg = new THREE.ShapeGeometry(shapeFrom([[-250, 250], [250, 250], [250, -250], [-250, -250]], [
      holeRect(cp.x0 - 0.05, cp.x1 + 0.05, cp.z0 - 0.05, cp.z1 + 0.05), holeRect(-2.25, 2.25, 29.95, 62.05),
    ]));
    gg.rotateX(-Math.PI / 2); gg.translate(0, -0.05, 0); boxUV(gg);
    const grass = mesh(gg, this.lib.grass(), 0, 0, 0, { cast: false });
    grp.add(grass);
    this._collide(grass);
    // ترّاس حول القصر (مع فراغ بشكل القصر)
    const foot = [[-28, -26], [28, -26], [28, 4], [10, 4], [10, 18], [-10, 18], [-10, 4], [-28, 4]];
    const terr = shapeFrom([[-36, 34], [36, 34], [36, -26], [-36, -26]].map(([x, z]) => [x, z]), []);
    void terr;
    const outer = [[-36, -34], [36, -34], [36, 26], [-36, 26]];
    const tg = new THREE.ShapeGeometry(shapeFrom(outer.map(([x, z]) => [x, -z]), [foot.map(([x, z]) => [x, -z])]));
    tg.rotateX(-Math.PI / 2); boxUV(tg);
    const trav = this.lib.travertine();
    const terrace = mesh(tg, trav, 0, 0, 0, { cast: false });
    grp.add(terrace);
    this._collide(terrace);
    // الممر الرئيسي والبركة العاكسة
    const pool = { x0: -2.2, x1: 2.2, z0: 30, z1: 62 };
    const pg = new THREE.ShapeGeometry(shapeFrom([[-8, -26], [8, -26], [8, -70], [-8, -70]], [[[pool.x0, -pool.z0], [pool.x0, -pool.z1], [pool.x1, -pool.z1], [pool.x1, -pool.z0]]]));
    pg.rotateX(-Math.PI / 2); boxUV(pg);
    const path = mesh(pg, trav, 0, 0, 0, { cast: false });
    grp.add(path);
    this._collide(path);
    const marble = this.lib.stone('marbleWhite');
    const pw = pool.x1 - pool.x0, pd = pool.z1 - pool.z0;
    const bottom = new THREE.PlaneGeometry(pw, pd); bottom.rotateX(-Math.PI / 2); bottom.translate(0, -0.6, (pool.z0 + pool.z1) / 2); boxUV(bottom);
    grp.add(mesh(bottom, this.lib.floor('zellige'), 0, 0, 0, { cast: false }));
    for (const [w, d, x, z] of [[pw, 0.02, 0, pool.z0], [pw, 0.02, 0, pool.z1], [0.02, pd, pool.x0, (pool.z0 + pool.z1) / 2], [0.02, pd, pool.x1, (pool.z0 + pool.z1) / 2]]) {
      const g = box(w, 0.6, d); g.translate(x, -0.3, z); grp.add(mesh(g, this.lib.zelligeWall()));
    }
    for (const x of [pool.x0 - 0.15, pool.x1 + 0.15]) { const g = box(0.3, 0.08, pd + 0.6); g.translate(x, 0.04, (pool.z0 + pool.z1) / 2); grp.add(mesh(g, marble)); }
    for (const z of [pool.z0 - 0.15, pool.z1 + 0.15]) { const g = box(pw + 0.6, 0.08, 0.3); g.translate(0, 0.04, z); grp.add(mesh(g, marble)); }
    grp.add(this._water(pw, pd, 0, -0.06, (pool.z0 + pool.z1) / 2));
    this._collideBox(0, 0.5, (pool.z0 + pool.z1) / 2, pw + 0.3, 1, pd + 0.3);
    // نفاثات على جانبي البركة
    for (let z = pool.z0 + 1.5; z < pool.z1 - 1; z += 3) {
      for (const sgn of [-1, 1]) {
        const j = this._arcJet(sgn);
        j.position.set(sgn * (pw / 2 + 0.05), 0.05, z);
        grp.add(j);
      }
    }
    // نخيل على الجانبين
    this.palmPositions = [];
    for (let z = 30; z <= 62; z += 6) for (const x of [-9.5, 9.5]) this.palmPositions.push([x, z, 1 + ((z * 7) % 5) * 0.06]);
    for (const [x, z] of [[-31, -30], [31, -30], [-31, 8], [31, 8], [-14, 24], [14, 24]]) this.palmPositions.push([x, z, 1.15]);
    const palms = this.palmForest(this.palmPositions);
    grp.add(palms);
    for (const [x, z] of this.palmPositions) this._collideBox(x, 1.5, z, 0.6, 3, 0.6);
    // سرو وأسيجة
    const cyp = [];
    for (let z = -30; z <= 0; z += 5) { cyp.push([-34, z], [34, z]); }
    for (let x = -30; x <= 30; x += 6) cyp.push([x, -32]);
    grp.add(this._cypresses(cyp));
    for (const [x, z] of cyp) this._collideBox(x, 2, z, 1.2, 4, 1.2);
    const hedgeMat = this._hedgeMat || (this._hedgeMat = new THREE.MeshPhysicalMaterial({ color: '#2d4a22', roughness: 0.95, map: this.baker.get('grass').map, normalMap: this.baker.get('grass').normalMap }));
    for (const sgn of [-1, 1]) {
      const g = rbox(1.0, 1.1, 34, 0.25, 2); g.translate(sgn * 12.5, 0.55, 46);
      grp.add(mesh(g, hedgeMat));
      this._collideBox(sgn * 12.5, 0.55, 46, 1.0, 1.1, 34);
    }
    // أعمدة إنارة على الممر
    const lampMetal = this.lib.metal('bronze');
    const glowMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#ffc977'), emissiveIntensity: 0 });
    this.nightEmissive.push({ mat: glowMat, base: 6 });
    for (let z = 33; z <= 60; z += 9) for (const x of [-6.2, 6.2]) {
      const lp = new THREE.Group();
      lp.add(mesh(lathe([[0, 0], [0.16, 0], [0.16, 0.12], [0.07, 0.2], [0.045, 0.3], [0.04, 3.0], [0.07, 3.05], [0, 3.06]], 16), lampMetal));
      lp.add(mesh(lathe([[0, 3.05], [0.17, 3.12], [0.18, 3.5], [0.22, 3.55], [0.12, 3.72], [0.02, 3.82], [0, 3.85]], 8), lampMetal));
      const gl = cyl(0.14, 0.15, 0.36, 8); gl.translate(0, 3.32, 0);
      lp.add(mesh(gl, glowMat, 0, 0, 0, { cast: false }));
      lp.position.set(x, 0, z);
      grp.add(lp);
      this._collideBox(x, 1.5, z, 0.3, 3, 0.3);
    }
    // تلال بعيدة
    const hills = new THREE.CylinderGeometry(420, 460, 60, 128, 4, true);
    const hp = hills.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const y = hp.getY(i);
      if (y > 0) {
        const a = Math.atan2(hp.getZ(i), hp.getX(i));
        const hgt = 14 + 18 * Math.sin(a * 3 + 1) * Math.sin(a * 7) + 10 * Math.sin(a * 13 + 2);
        hp.setY(i, Math.max(2, hgt));
      } else hp.setY(i, -5);
    }
    hills.computeVertexNormals();
    const hm = new THREE.Mesh(hills, new THREE.MeshStandardMaterial({ color: '#7d8a62', roughness: 1, side: THREE.BackSide }));
    hm.receiveShadow = false;
    grp.add(hm);
    // حدود غير مرئية
    for (const [x, z, sx, sz] of [[0, -70, 160, 1], [0, 80, 160, 1], [-70, 5, 1, 160], [70, 5, 1, 160]]) this._collideBox(x, 2, z, sx, 4, sz);
    // فوانيس المدخل
    for (const sgn of [-1, 1]) {
      const l = this._wallLantern();
      l.position.set(sgn * 3.0, 3.4, 18.55);
      grp.add(l);
    }
    grp.traverse((o) => { if (o.isMesh || o.isPoints) o.userData.room = o.userData.room || 'exterior'; });
    this.group.add(grp);
  }

  _wallLantern() {
    const g = new THREE.Group();
    const metal = this.lib.metal('bronze');
    const glow = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#ffc46a'), emissiveIntensity: 0 });
    this.nightEmissive.push({ mat: glow, base: 7 });
    g.add(mesh(box(0.08, 0.5, 0.08), metal, 0, 0, -0.08));
    g.add(mesh(box(0.06, 0.06, 0.4), metal, 0, 0.2, 0.08));
    g.add(mesh(lathe([[0, -0.45], [0.18, -0.4], [0.22, -0.1], [0.24, 0.0], [0.1, 0.18], [0, 0.22]], 8), metal, 0, -0.05, 0.28));
    g.add(mesh(cyl(0.17, 0.2, 0.32, 8), glow, 0, -0.25, 0.28, { cast: false }));
    const light = new THREE.PointLight(0xffc27a, 0, 14, 2);
    light.position.set(0, -0.25, 0.45);
    g.add(light);
    this.pointLights.push({ light, base: 25, night: true });
    return g;
  }

  _arcJet(sgn) {
    const count = 36;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const s = new Float32Array(count); for (let i = 0; i < count; i++) s[i] = i / count;
    geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDir: { value: -sgn } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uDir; varying float vA;
        void main() {
          float t = fract(aSeed + uTime * 0.6);
          vec3 p = vec3(uDir * 1.6 * t, 1.25 * t * (1.0 - t) * 2.2, 0.0);
          vA = 0.65;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(5.0 / -mv.z * 3.0, 1.0, 5.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { vec2 c = gl_PointCoord - 0.5; if (length(c) > 0.5) discard; gl_FragColor = vec4(vec3(0.92, 0.97, 1.0) * 1.5, vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    this.animated.push((t) => { mat.uniforms.uTime.value = t; });
    return p;
  }

  /** نخيل (InstancedMesh: جذوع وسعف) */
  palmForest(list) {
    const grp = new THREE.Group();
    const trunkGeo = this._palmTrunkGeo();
    const frondGeo = this._palmFrondGeo();
    const trunkMat = this.lib.bark();
    const leafMat = this.lib.leaf();
    const fronds = 18;
    const it = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const iff = new THREE.InstancedMesh(frondGeo, leafMat, list.length * fronds);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const rnd = mulberry(5);
    let k = 0;
    list.forEach(([x, z, sc = 1], i) => {
      const lean = (rnd() - 0.5) * 0.12, yaw = rnd() * Math.PI * 2;
      e.set(lean, yaw, (rnd() - 0.5) * 0.12);
      q.setFromEuler(e);
      s.setScalar(sc);
      p.set(x, 0, z);
      m4.compose(p, q, s);
      it.setMatrixAt(i, m4);
      const top = new THREE.Vector3(0, 7.6, 0).applyQuaternion(q).multiplyScalar(sc).add(p);
      for (let f = 0; f < fronds; f++) {
        const a = (f / fronds) * Math.PI * 2 + rnd() * 0.3;
        const droop = 0.15 + rnd() * 0.75;
        e.set(0, a, 0, 'YXZ');
        const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(-droop, a, (rnd() - 0.5) * 0.3, 'YXZ'));
        s.setScalar(sc * (0.8 + rnd() * 0.35));
        m4.compose(top, qf, s);
        iff.setMatrixAt(k++, m4);
      }
    });
    for (const im of [it, iff]) { im.castShadow = true; im.receiveShadow = true; im.userData.keep = true; grp.add(im); }
    return grp;
  }
  _palmTrunkGeo() {
    if (this._ptg) return this._ptg;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const y = (i / 16) * 7.8;
      const r = 0.24 - 0.07 * (i / 16) + (i === 0 ? 0.08 : 0) + 0.012 * Math.sin(i * 2.3);
      pts.push([r, y]);
    }
    pts.push([0.0, 7.8]);
    const g = lathe(pts, 18);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 0.35) * 0.18); }
    g.computeVertexNormals();
    this._ptg = g;
    return g;
  }
  _palmFrondGeo() {
    if (this._pfg) return this._pfg;
    const L = 3.6, W = 1.1, segs = 18;
    const g = new THREE.PlaneGeometry(W, L, 4, segs);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + L / 2;
      const t = y / L;
      const bend = -t * t * 1.6;
      const fold = Math.abs(x) * 0.45;
      p.setXYZ(i, x * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(t * 1.1, 1))), bend + fold, -y);
    }
    g.computeVertexNormals();
    this._pfg = g;
    return g;
  }

  _cypresses(list) {
    const g = new THREE.ConeGeometry(0.9, 7.5, 16, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const bulge = 1 + 0.18 * Math.sin(y * 2.1 + Math.atan2(z, x) * 3) + 0.25 * Math.exp(-Math.pow((y + 1.5) / 2, 2));
      p.setXYZ(i, x * bulge, y + 3.75, z * bulge);
    }
    g.computeVertexNormals();
    boxUV(g);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#1f3a1a', roughness: 0.95, map: this.baker.get('grass').map, normalMap: this.baker.get('grass').normalMap, normalScale: new THREE.Vector2(2, 2) });
    const im = new THREE.InstancedMesh(g, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true;
    return im;
  }

  /* ---------------------------------------------------------------- التوقيع */
  _signatures() {
    const marble = this.lib.stone('marbleWhite');
    const gold = this.lib.metal('gold');
    // 1) لوحة رخامية بالتوقيع في بهو المدخل (الجدار الغربي)
    const plaque = new THREE.Group();
    plaque.add(mesh(rbox(2.9, 1.15, 0.06, 0.02), marble, 0, 0, 0));
    plaque.add(mesh(rbox(3.04, 1.29, 0.04, 0.02), gold, 0, 0, -0.012));
    const sigTex = this.baker.textTexture({
      width: 2048, height: 812,
      draw: (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(h * 0.42)}px "Great Vibes", "Cormorant Garamond", cursive`;
        ctx.fillText(SIGNATURE, w / 2, h * 0.47);
        ctx.font = `${Math.round(h * 0.075)}px "Cinzel", serif`;
        ctx.fillText('DESIGNED WITH PASSION', w / 2, h * 0.84);
        ctx.fillRect(w * 0.3, h * 0.73, w * 0.4, 3);
      },
    });
    sigTex.colorSpace = THREE.NoColorSpace;
    const textMat = new THREE.MeshPhysicalMaterial({ color: '#f0c46a', metalness: 1, roughness: 0.22, alphaMap: sigTex, transparent: true, envMapIntensity: 1.6 });
    const tm = mesh(new THREE.PlaneGeometry(2.7, 1.07), textMat, 0, 0, 0.032, { cast: false });
    plaque.add(tm);
    plaque.position.set(-9.7 + 0.04, 2.5, 14);
    plaque.rotation.y = Math.PI / 2;
    plaque.traverse((o) => { if (o.isMesh) o.userData.room = 'entrance'; });
    this.group.add(plaque);
    // 2) خط عربي "أهلاً وسهلاً" فوق الباب الرئيسي من الداخل
    const callTex = this.baker.textTexture({
      width: 2048, height: 380,
      draw: (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.font = `${Math.round(h * 0.62)}px "Aref Ruqaa", "Amiri", "Tajawal", serif`;
        ctx.fillText(APP.welcomeAr, w / 2, h * 0.52);
      },
    });
    callTex.colorSpace = THREE.NoColorSpace;
    const panel = new THREE.Group();
    panel.add(mesh(rbox(6.4, 1.25, 0.05, 0.02), this.lib.plain('#14244a', 0.35), 0, 0, 0));
    panel.add(mesh(rbox(6.6, 1.45, 0.03, 0.02), gold, 0, 0, -0.012));
    panel.add(mesh(new THREE.PlaneGeometry(6.2, 1.15), new THREE.MeshPhysicalMaterial({ color: '#f2c46b', metalness: 1, roughness: 0.2, alphaMap: callTex, transparent: true }), 0, 0, 0.028, { cast: false }));
    panel.position.set(0, 6.55, 18 - 0.4 - 0.03);
    panel.rotation.y = Math.PI;
    panel.traverse((o) => { if (o.isMesh) o.userData.room = 'entrance'; });
    this.group.add(panel);
    // 3) خرطوشة بالتوقيع فوق الباب الرئيسي من الخارج
    const cart = new THREE.Group();
    cart.add(mesh(rbox(4.2, 0.95, 0.08, 0.03), marble, 0, 0, 0));
    cart.add(mesh(rbox(4.4, 1.12, 0.05, 0.03), gold, 0, 0, -0.015));
    cart.add(mesh(new THREE.PlaneGeometry(4.0, 1.4), textMat.clone(), 0, 0.02, 0.045, { cast: false }));
    cart.children[2].scale.set(1, 0.62, 1);
    cart.position.set(0, 7.25, 18.4 + 0.05);
    cart.traverse((o) => { if (o.isMesh) o.userData.room = 'exterior'; });
    this.group.add(cart);
  }

  /* ================================================================ كل إطار */
  update(t, playerPos, dt) {
    for (const fn of this.animated) fn(t);
    const rip = this.waterMaterials[0] && this.waterMaterials[0].normalMap;
    if (rip) rip.offset.set(t * 0.012, t * 0.008);
    // الأبواب تفتح تلقائياً عند الاقتراب
    for (const d of this.doors) {
      const near = playerPos && Math.hypot(playerPos.x - d.center.x, playerPos.z - d.center.z) < 3.2;
      const target = near ? 1 : 0;
      d.angle += (target - d.angle) * Math.min(1, dt * 2.6);
      const a = d.angle * d.max;
      for (const { pivot, sgn } of d.pivots) pivot.rotation.y = sgn < 0 ? -a : a;
    }
  }
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { cylUV };
