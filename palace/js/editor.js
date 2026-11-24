/* ============================================================================
 *  editor.js — مصمم القصر
 *  ---------------------------------------------------------------------------
 *  إضافة قطع من الكتالوج، اختيار بالنقر، سحب على الأرض (أو على الجدار للقطع
 *  الجدارية)، تدوير، نسخ، حذف، تغيير القماش/الخشب/المعدن/الرخام، تغيير
 *  تشطيب الجدران والأرضيات والأسقف، تراجع، حفظ واستيراد/تصدير التصميم.
 * ========================================================================== */
import * as THREE from 'three';
import { CATALOG, DEFAULT_LAYOUT, APP } from './config.js';
import { CATALOG_BY_ID } from './furniture.js';
import { roomAt, ceilingAt } from './architecture.js';

const DEG = Math.PI / 180;
const BOUNDS = { x0: -60, x1: 60, z0: -60, z1: 75 };

export class Editor {
  constructor(app) {
    this.app = app;
    this.items = [];
    this.selected = null;
    this.selectedSurface = null;
    this.collisionGroup = new THREE.Group();
    this.collisionGroup.name = 'furniture-collision';
    this.collisionMat = new THREE.MeshBasicMaterial({ visible: false });
    this.raycaster = new THREE.Raycaster();
    this.undoStack = [];
    this.drag = null;
    this.onChange = () => {};
    this._saveT = null;
    this.outlineMat = new THREE.LineBasicMaterial({ color: 0xf0c46a, depthTest: false, transparent: true, opacity: 0.95 });
  }

  /* ------------------------------------------------------------ الإنشاء والوضع */
  _dropFor(type, ceil) {
    if (type === 'chandelierGrand') return Math.max(0.5, ceil - 8.4);
    if (type === 'chandelier') return Math.max(0.25, ceil - 4.95);
    if (type === 'lanternHanging') return Math.max(0.3, ceil - 3.7);
    return 0.5;
  }

  /** يضيف قطعة بالمواصفات {type,x,z,rot,slots,y} */
  add(spec, { select = false, record = true } = {}) {
    const def = CATALOG_BY_ID[spec.type];
    if (!def) return null;
    if (record) this._pushUndo();
    let ceil = null;
    if (def.place === 'ceiling') ceil = ceilingAt(spec.x, spec.z) ?? 4.6;
    const opts = def.place === 'ceiling' ? { drop: spec.drop ?? this._dropFor(spec.type, ceil) } : {};
    const item = this.app.factory.create(spec.type, spec.slots || {}, opts);
    item.userData.id = spec.id || `${spec.type}-${Math.random().toString(36).slice(2, 8)}`;
    item.userData.def = def;
    item.userData.drop = opts.drop;
    item.rotation.y = (spec.rot || 0) * DEG;
    item.position.set(spec.x, 0, spec.z);
    if (def.place === 'ceiling') item.position.y = ceil;
    else if (def.place === 'top') item.position.y = spec.y ?? this._surfaceBelow(spec.x, spec.z, item);
    else if (def.place === 'wall') {
      item.position.y = spec.y ?? (spec.type === 'fireplace' ? 0 : spec.type === 'mirror' ? 1.35 : 1.7);
      this._snapToWall(item);
    } else item.position.y = spec.y ?? 0;
    item.userData.room = (roomAt(item.position.x, item.position.z) || { id: 'exterior' }).id;
    item.traverse((o) => { if (o.isMesh) { o.userData.room = item.userData.room; o.userData.item = item; } });
    this.app.scene.add(item);
    this.items.push(item);
    this._localBox(item);
    this._updateCollision(item);
    if (this.app.env) this.app.env.assignProbes(item);
    if (def.light || item.userData.lights.length || item.userData.glows.length) this.app.env && this.app.env.registerLights(this.items);
    if (select) this.select(item);
    this._changed();
    return item;
  }

  _localBox(item) {
    const rot = item.rotation.y;
    const pos = item.position.clone();
    item.rotation.y = 0; item.position.set(0, 0, 0);
    item.updateMatrixWorld(true);
    const b = new THREE.Box3();
    item.traverse((o) => { if (o.isMesh && !o.isPoints && o.geometry) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); b.union(bb); } });
    item.userData.localBox = b;
    item.rotation.y = rot; item.position.copy(pos);
    item.updateMatrixWorld(true);
  }

  _updateCollision(item) {
    if (item.userData.collider) { this.collisionGroup.remove(item.userData.collider); item.userData.collider.geometry.dispose(); item.userData.collider = null; }
    if (!item.userData.def.collide || !item.userData.localBox) return;
    const b = item.userData.localBox;
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.1), Math.max(size.y, 0.2), Math.max(size.z, 0.1)), this.collisionMat);
    m.position.copy(c).applyAxisAngle(new THREE.Vector3(0, 1, 0), item.rotation.y).add(item.position);
    m.rotation.y = item.rotation.y;
    this.collisionGroup.add(m);
    item.userData.collider = m;
  }

  _rebuildOctreeSoon() {
    clearTimeout(this._octT);
    this._octT = setTimeout(() => this.app.rebuildOctree(), 250);
  }

  /** أعلى سطح تحت نقطة (للقطع فوق الطاولات) */
  _surfaceBelow(x, z, self) {
    this.raycaster.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
    const targets = [];
    for (const it of this.items) if (it !== self && it.userData.place !== 'ceiling') targets.push(it);
    const hits = this.raycaster.intersectObjects(targets, true).filter((h) => h.face && h.face.normal && h.object.isMesh && !h.object.isPoints);
    for (const h of hits) {
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.y > 0.7) return h.point.y;
    }
    return 0;
  }

  /** يلصق قطعة جدارية بأقرب جدار خلفها */
  _snapToWall(item) {
    const back = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), item.rotation.y);
    const origin = item.position.clone().addScaledVector(back, -0.6);
    origin.y = Math.max(item.position.y, 0.6) + (item.userData.type === 'fireplace' ? 0.6 : 0);
    this.raycaster.set(origin, back);
    this.raycaster.far = 2.5;
    const hits = this.raycaster.intersectObjects(this.app.palace.group.children, true).filter((h) => h.object.userData.surface && h.object.userData.surface.kind === 'wall');
    this.raycaster.far = Infinity;
    if (hits.length) {
      const h = hits[0];
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      n.y = 0; n.normalize();
      item.position.x = h.point.x + n.x * 0.004;
      item.position.z = h.point.z + n.z * 0.004;
      item.rotation.y = Math.atan2(n.x, n.z);
      return true;
    }
    return false;
  }

  remove(item, record = true) {
    if (record) this._pushUndo();
    if (this.selected === item) this.deselect();
    this.app.scene.remove(item);
    if (item.userData.collider) this.collisionGroup.remove(item.userData.collider);
    item.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry && o.geometry.dispose(); } });
    this.items = this.items.filter((i) => i !== item);
    this.app.env && this.app.env.registerLights(this.items);
    this._rebuildOctreeSoon();
    this._changed();
  }

  clearAll() {
    for (const it of [...this.items]) this.remove(it, false);
  }

  loadLayout(list) {
    this.clearAll();
    for (const s of list) this.add(s, { record: false });
    this._rebuildOctreeSoon();
  }

  /* ------------------------------------------------------------ الاختيار */
  select(item) {
    this.deselect();
    this.selected = item;
    const b = item.userData.localBox || new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.04, size.y + 0.04, size.z + 0.04));
    const lines = new THREE.LineSegments(eg, this.outlineMat);
    lines.position.copy(c);
    lines.renderOrder = 999;
    lines.userData.outline = true;
    item.add(lines);
    item.userData.outline = lines;
    this.app.ui.showItem(item);
  }
  deselect() {
    if (this.selected && this.selected.userData.outline) {
      this.selected.remove(this.selected.userData.outline);
      this.selected.userData.outline.geometry.dispose();
      this.selected.userData.outline = null;
    }
    this.selected = null;
    this.selectedSurface = null;
    this.app.ui.hideInspector();
  }
  selectSurface(s) {
    this.deselect();
    this.selectedSurface = s;
    this.app.ui.showSurface(s);
  }

  /** نقر على المشهد: يعيد ما تحت المؤشر */
  pick(ndc) {
    this.raycaster.setFromCamera(ndc, this.app.camera);
    const objs = [...this.items, this.app.palace.group];
    const hits = this.raycaster.intersectObjects(objs, true).filter((h) => h.object.visible && !h.object.userData.outline && (h.object.isMesh || h.object.isInstancedMesh));
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.type && !o.userData.surface) o = o.parent;
      if (o && o.userData.type && this.items.includes(o)) return { item: o, point: h.point };
      if (h.object.userData.item && this.items.includes(h.object.userData.item)) return { item: h.object.userData.item, point: h.point };
      if (h.object.userData.surface) return { surface: h.object.userData.surface, point: h.point };
      if (h.object.material && h.object.material.transparent) continue;
      return null;
    }
    return null;
  }

  /* ------------------------------------------------------------ السحب */
  startDrag(item, ndc) {
    this._pushUndo();
    const place = item.userData.place;
    this.drag = { item, place, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.position.y), offset: new THREE.Vector3() };
    this.raycaster.setFromCamera(ndc, this.app.camera);
    const p = new THREE.Vector3();
    if (place !== 'wall' && this.raycaster.ray.intersectPlane(this.drag.plane, p)) this.drag.offset.copy(item.position).sub(p);
  }
  moveDrag(ndc) {
    if (!this.drag) return;
    const { item, place, plane, offset } = this.drag;
    this.raycaster.setFromCamera(ndc, this.app.camera);
    if (place === 'wall') {
      const hits = this.raycaster.intersectObjects(this.app.palace.group.children, true).filter((h) => h.object.userData.surface && h.object.userData.surface.kind === 'wall');
      if (hits.length) {
        const h = hits[0];
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); n.y = 0; n.normalize();
        item.position.set(h.point.x + n.x * 0.004, item.userData.type === 'fireplace' ? 0 : Math.max(0.8, Math.min(h.point.y, 5)), h.point.z + n.z * 0.004);
        item.rotation.y = Math.atan2(n.x, n.z);
      }
      return;
    }
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return;
    p.add(offset);
    p.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, p.x));
    p.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, p.z));
    if (this.app.snap) { p.x = Math.round(p.x * 10) / 10; p.z = Math.round(p.z * 10) / 10; }
    item.position.x = p.x; item.position.z = p.z;
    if (place === 'top') item.position.y = this._surfaceBelow(p.x, p.z, item);
  }
  endDrag() {
    if (!this.drag) return;
    const item = this.drag.item;
    this.drag = null;
    this._afterMove(item);
  }
  _afterMove(item) {
    const def = item.userData.def;
    if (def.place === 'ceiling') {
      const ceil = ceilingAt(item.position.x, item.position.z) ?? 4.6;
      if (Math.abs(ceil - item.position.y) > 0.05) {
        const spec = this.specOf(item);
        spec.drop = undefined;
        const sel = this.selected === item;
        this.remove(item, false);
        const n = this.add(spec, { record: false });
        if (sel) this.select(n);
        return;
      }
    }
    const room = (roomAt(item.position.x, item.position.z) || { id: 'exterior' }).id;
    if (room !== item.userData.room) {
      item.userData.room = room;
      item.traverse((o) => { if (o.isMesh) o.userData.room = room; });
      this.app.env && this.app.env.assignProbes(item);
    }
    this._updateCollision(item);
    this._rebuildOctreeSoon();
    this._changed();
  }

  /* ------------------------------------------------------------ عمليات */
  rotate(item, deg) {
    this._pushUndo();
    item.rotation.y += deg * DEG;
    if (item.userData.place === 'wall') this._snapToWall(item);
    this._afterMove(item);
  }
  duplicate(item) {
    const spec = this.specOf(item);
    const off = new THREE.Vector3(0.6, 0, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), item.rotation.y);
    spec.x += off.x; spec.z += off.z; spec.id = undefined;
    const n = this.add(spec, { select: true });
    return n;
  }
  setSlot(item, key, id) {
    this._pushUndo();
    this.app.factory.recolor(item, key, id);
    this.app.env && this.app.env.assignProbes(item);
    this._changed();
  }

  /** إضافة قطعة أمام المستخدم */
  addInFront(type) {
    const def = CATALOG_BY_ID[type];
    const cam = this.app.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    let x, z, rot = 0;
    if (this.app.player.mode === 'design') {
      const t = this.app.player.orbit.target;
      x = t.x; z = t.z;
      rot = Math.round(Math.atan2(cam.position.x - t.x, cam.position.z - t.z) / DEG / 15) * 15;
    } else {
      fwd.y = 0; fwd.normalize();
      const d = def.place === 'wall' ? 0.3 : 2.4;
      x = cam.position.x + fwd.x * d; z = cam.position.z + fwd.z * d;
      rot = Math.round((Math.atan2(-fwd.x, -fwd.z) / DEG) / 15) * 15;
      if (def.place === 'wall') {
        this.raycaster.set(cam.position.clone(), fwd);
        const hits = this.raycaster.intersectObjects(this.app.palace.group.children, true).filter((h) => h.object.userData.surface && h.object.userData.surface.kind === 'wall');
        if (hits.length) { x = hits[0].point.x - fwd.x * 0.2; z = hits[0].point.z - fwd.z * 0.2; rot = Math.atan2(-fwd.x, -fwd.z) / DEG; }
      }
    }
    return this.add({ type, x, z, rot, y: def.place === 'wall' ? (type === 'fireplace' ? 0 : 1.7) : undefined }, { select: true });
  }

  specOf(item) {
    return {
      type: item.userData.type, x: +item.position.x.toFixed(3), z: +item.position.z.toFixed(3), y: +item.position.y.toFixed(3),
      rot: +((item.rotation.y / DEG) % 360).toFixed(2), slots: { ...item.userData.slots }, id: item.userData.id,
    };
  }

  /* ------------------------------------------------------------ الحالة */
  serialize() {
    const env = this.app.env;
    return {
      app: APP.titleEn, v: 1,
      rooms: JSON.parse(JSON.stringify(this.app.palace.state.rooms)),
      items: this.items.map((i) => {
        const s = this.specOf(i);
        if (i.userData.place === 'ceiling') delete s.y;
        if (i.userData.place === 'floor') delete s.y;
        return s;
      }),
      time: env ? env.hours : 16.5,
      interior: env ? { ...env.interior } : null,
    };
  }

  async load(data) {
    if (!data || !Array.isArray(data.items)) throw new Error('bad design');
    const p = this.app.palace;
    if (data.rooms) {
      for (const [id, r] of Object.entries(data.rooms)) {
        if (!p.state.rooms[id]) continue;
        const cur = p.state.rooms[id];
        if (r.floor && r.floor !== cur.floor) p.setFloor(id, r.floor);
        if (r.wall && (r.wall.finish !== cur.wall.finish || r.wall.color !== cur.wall.color)) p.setWall(id, r.wall.finish, r.wall.color);
        if (r.ceiling && r.ceiling !== cur.ceiling) p.setCeiling(id, r.ceiling);
      }
    }
    this.loadLayout(data.items);
    if (data.interior && this.app.env) Object.assign(this.app.env.interior, data.interior);
    if (typeof data.time === 'number' && this.app.env) this.app.env.setTime(data.time);
    this.app.env && this.app.env.assignProbes();
    this.app.refreshReflectiveList && this.app.refreshReflectiveList();
    this.app.syncRoofVisibility && this.app.player && this.app.syncRoofVisibility();
    this._changed(false);
  }

  resetDefault() {
    this._pushUndo();
    const p = this.app.palace;
    for (const r of Object.keys(p.state.rooms)) {
      const def = (window.__ROOMS_DEFAULT || {})[r];
      if (!def) continue;
      if (def.floor !== p.state.rooms[r].floor) p.setFloor(r, def.floor);
      if (def.wall.finish !== p.state.rooms[r].wall.finish || def.wall.color !== p.state.rooms[r].wall.color) p.setWall(r, def.wall.finish, def.wall.color);
      if (def.ceiling !== p.state.rooms[r].ceiling) p.setCeiling(r, def.ceiling);
    }
    this.loadLayout(DEFAULT_LAYOUT);
    this.app.env && this.app.env.assignProbes();
  }

  _pushUndo() {
    if (this._restoring) return;
    this.undoStack.push(JSON.stringify(this.serialize()));
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.app.ui && this.app.ui.syncUndo(this.undoStack.length);
  }
  async undo() {
    const s = this.undoStack.pop();
    this.app.ui && this.app.ui.syncUndo(this.undoStack.length);
    if (!s) return false;
    this._restoring = true;
    this.deselect();
    try { await this.load(JSON.parse(s)); } finally { this._restoring = false; }
    return true;
  }

  _changed(save = true) {
    this.onChange();
    if (!save) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.saveLocal(), 800);
  }
  saveLocal() {
    try { localStorage.setItem(APP.storageKey, JSON.stringify(this.serialize())); return true; } catch (e) { return false; }
  }
  loadLocal() {
    try { const s = localStorage.getItem(APP.storageKey); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
}

export { CATALOG };
