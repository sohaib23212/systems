/* ============================================================================
 *  materials.js — مكتبة الخامات الفيزيائية (PBR)
 *  ---------------------------------------------------------------------------
 *  كل دالة ترجع مادة جديدة (حتى يمكن تلوين كل قطعة أو غرفة بشكل مستقل)
 *  لكن الصور مشتركة لتوفير الذاكرة.
 *  الأرضيات المصقولة تعكس المشهد (انعكاس مستوٍ ضبابي حسب الخشونة).
 * ========================================================================== */
import * as THREE from 'three';
import { SLOT_OPTIONS } from './config.js';

/** uniforms مشتركة لانعكاس الأرضية (يحدّثها نظام الانعكاس كل إطار) */
export const REFLECT = {
  uReflTex: { value: null },
  uReflMatrix: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  uReflMaxLod: { value: 6 },
};

const color = (hex) => new THREE.Color(hex);

export function findOption(group, id) {
  return (SLOT_OPTIONS[group] || []).find((o) => o.id === id) || SLOT_OPTIONS[group][0];
}

/** يضيف انعكاس الأرضية لمادة فيزيائية */
export function makeReflective(material, strength) {
  material.userData.reflect = strength;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReflTex = REFLECT.uReflTex;
    shader.uniforms.uReflMatrix = REFLECT.uReflMatrix;
    shader.uniforms.uReflOn = REFLECT.uReflOn;
    shader.uniforms.uReflMaxLod = REFLECT.uReflMaxLod;
    shader.uniforms.uReflStrength = { value: strength };
    material.userData.reflUniform = shader.uniforms.uReflStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflCoord = uReflMatrix * (modelMatrix * vec4(transformed, 1.0));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uReflTex;\nuniform float uReflOn;\nuniform float uReflStrength;\nuniform float uReflMaxLod;\nvarying vec4 vReflCoord;')
      .replace('#include <opaque_fragment>', /* glsl */ `
        if (uReflOn > 0.5) {
          vec2 ruv = vReflCoord.xy / vReflCoord.w + normal.xy * 0.012;
          float NdV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
          float rgh = clamp(material.roughness, 0.0, 1.0);
          float k = uReflStrength * mix(0.16, 1.0, fres) * (1.0 - smoothstep(0.06, 0.55, rgh));
          vec3 rc = textureLod(uReflTex, ruv, rgh * uReflMaxLod).rgb;
          outgoingLight = mix(outgoingLight, rc, clamp(k, 0.0, 0.9));
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `reflective`;
  material.needsUpdate = true;
  return material;
}

export class MaterialLib {
  constructor(baker) {
    this.baker = baker;
    this.shared = new Map();
  }

  /** مادة فيزيائية من مجموعة صور */
  _pbr(texName, params = {}) {
    const t = this.baker.get(texName);
    const m = new THREE.MeshPhysicalMaterial({
      map: t.map,
      normalMap: t.normalMap || null,
      roughness: 1,
      metalness: t.ormMap ? 1 : 0,
      roughnessMap: t.ormMap || null,
      metalnessMap: t.ormMap || null,
      aoMap: t.ormMap || null,
      aoMapIntensity: 0.8,
      envMapIntensity: 1,
      ...params,
    });
    if (!t.ormMap) {
      m.roughness = params.roughness ?? 0.7;
      m.metalness = params.metalness ?? 0;
    }
    if (t.normalMap) m.normalScale = new THREE.Vector2(1, 1);
    m.name = texName;
    return m;
  }

  /* ------------------------------------------------------------ الأرضيات */
  floor(key) {
    let m;
    switch (key) {
      case 'marbleWhite': case 'marbleCream': case 'marbleBlack': case 'marbleGreen':
        m = this._pbr(`slab${key.slice(6)}`, { clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: 0.55 });
        makeReflective(m, 0.85);
        break;
      case 'checker':
        m = this._pbr('checker', { clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: 0.55 });
        makeReflective(m, 0.85);
        break;
      case 'parquet':
        m = this._pbr('parquet', { clearcoat: 0.5, clearcoatRoughness: 0.18, envMapIntensity: 0.6 });
        makeReflective(m, 0.45);
        break;
      case 'zellige':
        m = this._pbr('zellige', { clearcoat: 0.4, clearcoatRoughness: 0.12, envMapIntensity: 0.7 });
        makeReflective(m, 0.5);
        break;
      case 'courtyard':
        m = this._pbr('courtyard', { clearcoat: 0.3, clearcoatRoughness: 0.12, envMapIntensity: 0.7 });
        makeReflective(m, 0.55);
        break;
      case 'travertine':
        m = this._pbr('travertine', { envMapIntensity: 0.8 });
        break;
      default:
        m = this._pbr('marbleWhite');
    }
    m.userData.finish = key;
    return m;
  }

  /* ------------------------------------------------------------ الجدران */
  wall(finish, hex) {
    let m;
    switch (finish) {
      case 'paint': m = this._pbr('plaster', { color: color(hex), roughness: 0.82 }); break;
      case 'damask': m = this._pbr('damask', { color: color(hex), sheen: 0.4, sheenRoughness: 0.4, sheenColor: color(hex).lerp(new THREE.Color(1, 1, 1), 0.4) }); break;
      case 'stucco': m = this._pbr('stucco', { color: color(hex) }); break;
      case 'marble': m = this._pbr('slabCream', { clearcoat: 0.5, clearcoatRoughness: 0.08 }); break;
      case 'panel': m = this._pbr('panel', { color: color(hex), clearcoat: 0.35, clearcoatRoughness: 0.25 }); break;
      case 'zelligeWall': m = this._pbr('zelligeWall', { clearcoat: 0.4, clearcoatRoughness: 0.1 }); break;
      default: m = this._pbr('plaster', { color: color(hex || '#eee') });
    }
    m.userData.finish = finish;
    return m;
  }

  ceiling(type) {
    if (type === 'woodBeams') return this.wood('walnut');
    return this._pbr('plaster', { color: color('#f4efe6'), roughness: 0.9 });
  }

  limestone() { return this._pbr('limestone', { envMapIntensity: 0.9 }); }
  sandstone(hex = '#e3cfa8') { return this._pbr('sandstone', { color: color(hex), roughness: 0.8 }); }
  plaster(hex = '#f2ece2') { return this._pbr('plaster', { color: color(hex), roughness: 0.85 }); }
  stucco(hex = '#f1e9da') { return this._pbr('stucco', { color: color(hex) }); }
  zelligeWall() { return this._pbr('zelligeWall', { clearcoat: 0.4, clearcoatRoughness: 0.1 }); }
  grass() { return this._pbr('grass', { roughness: 0.95, envMapIntensity: 0.6 }); }
  travertine() { return this._pbr('travertine', { envMapIntensity: 0.8 }); }
  terracotta() { return this._pbr('terracotta', { roughness: 0.8 }); }
  bark() { return this._pbr('bark', { roughness: 0.9 }); }
  dome() { return this._pbr('dome', { side: THREE.BackSide }); }

  leaf() {
    const t = this.baker.get('leaf');
    return new THREE.MeshPhysicalMaterial({
      map: t.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, sheen: 0.3, sheenColor: color('#cfe8a0'),
    });
  }

  mashrabiya() {
    const t = this.baker.get('mashrabiya');
    return new THREE.MeshPhysicalMaterial({
      map: t.map, normalMap: t.normalMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, clearcoat: 0.3,
    });
  }

  /* ------------------------------------------------------------ خانات الأثاث */
  slot(group, optionId) {
    const o = findOption(group, optionId);
    let m;
    if (group === 'fabric') m = this.fabric(o);
    else if (group === 'wood') m = this.woodFrom(o);
    else if (group === 'metal') m = this.metalFrom(o);
    else if (group === 'stone') m = this.stone(o.id);
    else if (group === 'rug') m = this.rug(o.id);
    else if (group === 'art') m = this.art(o.id);
    else m = new THREE.MeshPhysicalMaterial({ color: '#888' });
    m.userData.slot = { group, id: o.id };
    return m;
  }

  fabric(o) {
    if (o.type === 'velvet') {
      const t = this.baker.get('velvet');
      const c = color(o.hex);
      return new THREE.MeshPhysicalMaterial({
        map: t.map, normalMap: t.normalMap, color: c, roughness: 0.92,
        sheen: 1, sheenRoughness: 0.32, sheenColor: c.clone().lerp(new THREE.Color(1, 1, 1), 0.35), envMapIntensity: 0.6,
      });
    }
    if (o.type === 'leather') {
      const t = this.baker.get('leather');
      return new THREE.MeshPhysicalMaterial({
        map: t.map, normalMap: t.normalMap, roughnessMap: t.ormMap, aoMap: t.ormMap, color: color(o.hex),
        roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.35, envMapIntensity: 0.8,
      });
    }
    const t = this.baker.get('linen');
    return new THREE.MeshPhysicalMaterial({
      map: t.map, normalMap: t.normalMap, color: color(o.hex), roughness: 0.9, sheen: 0.5, sheenRoughness: 0.6,
      sheenColor: color('#ffffff'), envMapIntensity: 0.6,
    });
  }

  /** نسخة منجّدة (كابيتونيه) من القماش */
  tufted(o) {
    const m = this.fabric(o);
    const t = this.baker.get('tufted');
    m.normalMap = t.normalMap;
    m.aoMap = t.ormMap;
    m.aoMapIntensity = 1;
    m.normalScale = new THREE.Vector2(1.2, 1.2);
    return m;
  }

  woodFrom(o) {
    if (o.type === 'lacquer') {
      return new THREE.MeshPhysicalMaterial({ color: color(o.hex), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.08 });
    }
    const t = this.baker.get('wood');
    return new THREE.MeshPhysicalMaterial({
      map: t.map, normalMap: t.normalMap, color: color(o.hex).multiplyScalar(1.6), roughness: 0.42,
      clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 0.8,
    });
  }
  wood(id) { return this.woodFrom(findOption('wood', id)); }

  metalFrom(o) {
    const t = this.baker.get('metal');
    return new THREE.MeshPhysicalMaterial({
      color: color(o.hex), metalness: 1, roughness: (o.rough ?? 0.25) / 0.25, roughnessMap: t.ormMap, envMapIntensity: 1.3,
    });
  }
  metal(id = 'gold') { return this.metalFrom(findOption('metal', id)); }

  stone(key) {
    const m = this._pbr(key, { clearcoat: 0.7, clearcoatRoughness: 0.05 });
    return m;
  }

  rug(key) {
    const t = this.baker.get(key);
    return new THREE.MeshPhysicalMaterial({
      map: t.map, normalMap: t.normalMap, roughness: 0.96, sheen: 0.7, sheenRoughness: 0.55, sheenColor: color('#ffffff'),
      envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }

  art(key) {
    const t = this.baker.get(key);
    return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  }

  /* ------------------------------------------------------------ خاصة */
  glass() {
    return new THREE.MeshPhysicalMaterial({
      color: color('#dce8f0'), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16,
      envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false, specularIntensity: 1,
    });
  }
  crystal() {
    return new THREE.MeshPhysicalMaterial({
      color: color('#ffffff'), metalness: 0, roughness: 0.02, transparent: true, opacity: 0.55, ior: 2.0,
      iridescence: 0.7, iridescenceIOR: 1.6, envMapIntensity: 3, specularIntensity: 1, depthWrite: false,
    });
  }
  emissive(hex, intensity = 4) {
    return new THREE.MeshStandardMaterial({ color: color('#000'), emissive: color(hex), emissiveIntensity: intensity, roughness: 1 });
  }
  shade(hex = '#f4e6c8') {
    return new THREE.MeshPhysicalMaterial({
      color: color(hex), roughness: 0.8, transmission: 0, emissive: color('#ffcf8a'), emissiveIntensity: 1.2, side: THREE.DoubleSide,
      sheen: 0.5, sheenColor: color('#ffffff'),
    });
  }
  plain(hex, rough = 0.6, metal = 0) {
    return new THREE.MeshPhysicalMaterial({ color: color(hex), roughness: rough, metalness: metal });
  }
  water() {
    return new THREE.MeshPhysicalMaterial({
      color: color('#1d5560'), roughness: 0.02, metalness: 0, transparent: true, opacity: 0.82,
      envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.02,
    });
  }
}
