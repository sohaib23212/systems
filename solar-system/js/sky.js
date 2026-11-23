/* ============================================================================
 *  sky.js — خلفية النجوم ودرب التبانة
 *  ---------------------------------------------------------------------------
 *  صورة Solar System Scope (8k_stars_milky_way.jpg) بإحداثيات مجرّية، تُدار
 *  بمصفوفة دقيقة: مجرّي → استوائي J2000 → بروجي → three، فيظهر درب التبانة
 *  بمكانه الحقيقي بالنسبة للكواكب. وإذا لم تتوفر الصورة تُرسم سماء مولّدة
 *  (نجوم + درب التبانة) بالإحداثيات المجرّية نفسها.
 * ========================================================================== */
import * as THREE from 'three';
import { SKY_VERT, SKY_FRAG } from './shaders.js';
import { TEXTURES } from './data.js';
import * as astro from './astro.js';
import { eclToThree } from './bodies.js';

const DEG = Math.PI / 180;

function radecToThree(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  const eq = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  return eclToThree(astro.eqToEcl(eq)).normalize();
}

export class Sky {
  constructor(scene, textures) {
    this.textures = textures;
    // مركز المجرة والقطب المجري الشمالي (ICRS)
    const gc = radecToThree(266.40499, -28.93617);
    const ngp = radecToThree(192.85948, 27.12825);
    const l90 = new THREE.Vector3().crossVectors(ngp, gc).normalize();
    const m = new THREE.Matrix3().set(
      gc.x, gc.y, gc.z,
      ngp.x, ngp.y, ngp.z,
      -l90.x, -l90.y, -l90.z,
    );
    this.uniforms = {
      uSky: { value: null },
      uHasSky: { value: 0 },
      uWorldToTex: { value: m },
      uIntensity: { value: 0.6 },
      uFlipX: { value: TEXTURES.skyFlipX ? -1 : 1 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.current = null;
  }

  /** يحمّل صورة السماء بالمستوى المطلوب، ويرجع للمولّدة إذا فشل */
  async load(tier, onProgress) {
    const order = tier === '8k' ? [...TEXTURES.sky['8k'], ...TEXTURES.sky['2k']] : [...TEXTURES.sky['2k']];
    if (this.current && order[0] === this.current.name) { onProgress && onProgress(1); return; }
    const res = await this.textures.loadFirst(order, { srgb: true, repeat: true }, onProgress);
    if (res) {
      const prev = this.current;
      this.current = res;
      this.uniforms.uSky.value = res.texture;
      this.uniforms.uHasSky.value = 1;
      if (prev && prev.name !== res.name) this.textures.release(prev.name);
    }
  }

  setIntensity(v) { this.uniforms.uIntensity.value = v; }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.current) this.textures.release(this.current.name);
  }
}
