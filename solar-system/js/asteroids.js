/* ============================================================================
 *  asteroids.js — حزام الكويكبات
 *  ---------------------------------------------------------------------------
 *  - آلاف الكويكبات بـ InstancedMesh (6 أشكال صخرية مختلفة × أحجام وتدويرات)
 *  - كل كويكب له مدار كبلري حقيقي (a, e, i, Ω, ω, M0) والحساب يتم على الـ GPU
 *  - توزيع واقعي: فجوات كيركوود، انحرافات وميول بتوزيع رايلي، أحجام بقانون قوة
 *  - مضاءة بـ PointLight الشمس عبر MeshStandardMaterial
 *  - طبقة نقاط خفيفة تُظهر الحزام عند الابتعاد في المقياس الحقيقي
 * ========================================================================== */
import * as THREE from 'three';
import { ASTEROID_BELT, CONSTANTS, SCALE } from './data.js';
import { GLSL_ASTEROID_ORBIT, ASTEROID_POINTS_VERT, ASTEROID_POINTS_FRAG } from './shaders.js';
import { mulberry32 } from './textures.js';

const DEG = Math.PI / 180;

export class AsteroidBelt {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'asteroid-belt';
    parent.add(this.group);
    const vd = SCALE.visual.distance, vr = SCALE.visual.radius;
    this.uniforms = {
      uDays: { value: 0 },
      uScaleT: { value: 1 },
      uAU: { value: CONSTANTS.AU_KM },
      uSunR: { value: CONSTANTS.SUN_RADIUS_KM },
      uVisDist: { value: new THREE.Vector3(vd.offset, vd.factor, vd.exponent) },
      uVisRad: { value: new THREE.Vector3(vr.earthR, vr.exponent, CONSTANTS.EARTH_RADIUS_KM) },
      uPointSize: { value: 1.6 },
      uPixelScale: { value: 1000 },
    };
    this.meshes = [];
    this.points = null;
    this.count = 0;
  }

  /** يولّد عناصر مدارية واقعية */
  _generate(count, rnd) {
    const B = ASTEROID_BELT;
    const A = new Float32Array(count * 4);
    const Bv = new Float32Array(count * 4);
    const rayleigh = (s) => s * Math.sqrt(-2 * Math.log(1 - rnd() * 0.999999));
    for (let i = 0; i < count; i++) {
      let a;
      for (;;) {
        // كثافة أعلى قرب 2.7 AU مع فجوات كيركوود
        a = B.aMinAU + (B.aMaxAU - B.aMinAU) * (0.5 * (rnd() + rnd()) * 0.6 + rnd() * 0.4);
        let keep = true;
        for (const [g, w] of B.kirkwoodGaps) {
          if (rnd() < 0.97 * Math.exp(-Math.pow((a - g) / w, 2))) { keep = false; break; }
        }
        if (keep) break;
      }
      const e = Math.min(rayleigh(B.eccentricitySigma), B.eccentricityMax);
      const inc = Math.min(rayleigh(B.inclinationSigmaDeg), B.inclinationMaxDeg) * DEG;
      const node = rnd() * Math.PI * 2;
      const w = rnd() * Math.PI * 2;
      const M0 = rnd() * Math.PI * 2;
      const n = (0.9856076686 / Math.pow(a, 1.5)) * DEG; // راديان/يوم (قانون كبلر الثالث)
      const p = B.radiusPowerLaw;
      const r0 = Math.pow(B.radiusMinKm, 1 - p), r1 = Math.pow(B.radiusMaxKm, 1 - p);
      const radius = Math.pow(r0 + rnd() * (r1 - r0), 1 / (1 - p));
      A.set([a, e, inc, node], i * 4);
      Bv.set([w, M0, n, radius], i * 4);
    }
    return { A, B: Bv };
  }

  _rockGeometry(seed) {
    const rnd = mulberry32(seed);
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const bumps = [];
    for (let k = 0; k < 7; k++) bumps.push([new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 0.15 + rnd() * 0.35, (rnd() - 0.4) * 0.35]);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      let r = 1;
      for (const [dir, width, amp] of bumps) r += amp * Math.exp(-Math.pow(1 - v.dot(dir), 2) / (width * width * 0.5));
      // تشويش حتمي حسب الموضع (وليس عشوائياً لكل رأس) حتى لا تتشقق الحواف المشتركة
      r += 0.035 * Math.sin(v.x * 12.9 + v.y * 78.2 + v.z * 37.7 + seed) * Math.cos(v.x * 41.3 - v.z * 17.1);
      v.multiplyScalar(Math.max(0.45, r));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    return g;
  }

  _material() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0.0, flatShading: true });
    const uniforms = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GLSL_ASTEROID_ORBIT}`)
        .replace('#include <project_vertex>', /* glsl */ `
          vec4 mvPosition = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif
          mvPosition.xyz = mvPosition.xyz * asteroidRadius() + asteroidOrbitPos();
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;
        `);
    };
    mat.customProgramCacheKey = () => 'asteroid-orbit-v1';
    return mat;
  }

  /** يبني الحزام بعدد معيّن (يحرر القديم) */
  build(count) {
    this.dispose(false);
    this.count = count;
    const rnd = mulberry32(20260101);
    const { A, B } = this._generate(count, rnd);
    const variants = ASTEROID_BELT.shapeVariants;
    const per = Math.ceil(count / variants);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    for (let v = 0; v < variants; v++) {
      const start = v * per;
      const n = Math.max(0, Math.min(per, count - start));
      if (n === 0) break;
      const geo = this._rockGeometry(1000 + v * 17);
      geo.setAttribute('aOrbitA', new THREE.InstancedBufferAttribute(A.slice(start * 4, (start + n) * 4), 4));
      geo.setAttribute('aOrbitB', new THREE.InstancedBufferAttribute(B.slice(start * 4, (start + n) * 4), 4));
      const mesh = new THREE.InstancedMesh(geo, this._material(), n);
      for (let i = 0; i < n; i++) {
        q.setFromEuler(new THREE.Euler(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283));
        s.set(0.7 + rnd() * 0.3, 0.55 + rnd() * 0.35, 0.8 + rnd() * 0.2);
        m.compose(new THREE.Vector3(), q, s);
        mesh.setMatrixAt(i, m);
        // ألوان: كويكبات كربونية داكنة (C) وصخرية (S) ومعدنية (M)
        const t = rnd();
        if (t < 0.6) col.setRGB(0.33, 0.31, 0.29);
        else if (t < 0.9) col.setRGB(0.5, 0.43, 0.35);
        else col.setRGB(0.55, 0.53, 0.5);
        col.multiplyScalar(0.85 + rnd() * 0.3);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = `asteroids-${v}`;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    // طبقة النقاط
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    pg.setAttribute('aOrbitA', new THREE.BufferAttribute(A, 4));
    pg.setAttribute('aOrbitB', new THREE.BufferAttribute(B, 4));
    const pm = new THREE.ShaderMaterial({
      vertexShader: ASTEROID_POINTS_VERT,
      fragmentShader: ASTEROID_POINTS_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(pg, pm);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'asteroid-dust';
    this.group.add(this.points);
  }

  update(days, scaleT, sunPosition, pixelScale, pixelRatio) {
    this.uniforms.uDays.value = days;
    this.uniforms.uScaleT.value = scaleT;
    this.uniforms.uPixelScale.value = pixelScale;
    this.uniforms.uPointSize.value = 1.35 * pixelRatio;
    this.group.position.copy(sunPosition);
  }

  setVisible(v) { this.group.visible = v; }

  dispose(removeGroup = true) {
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); m.dispose(); this.group.remove(m); }
    this.meshes = [];
    if (this.points) { this.points.geometry.dispose(); this.points.material.dispose(); this.group.remove(this.points); this.points = null; }
    if (removeGroup) this.parent.remove(this.group);
  }
}
