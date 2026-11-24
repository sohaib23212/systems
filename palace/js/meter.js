/* ============================================================================
 *  meter.js — قياس الإضاءة التلقائي (مثل مقياس الضوء في الكاميرا)
 *  ---------------------------------------------------------------------------
 *  كل 12 إطاراً نصغّر صورة المشهد (قبل ضبط التعريض) إلى شبكة 24×24 من
 *  متوسطات لوغاريتم السطوع، ونقرؤها من كرت الشاشة بشكل غير متزامن (بدون توقف).
 *  النتيجة: متوسط لوغاريتمي موزون نحو مركز الصورة (center-weighted metering).
 * ========================================================================== */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const N = 24;
const LO = -14, RANGE = 20; // log2 من 2^-14 إلى 2^6

export class MeterPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(N, N, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    this.buf = new Uint8Array(N * N * 4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          float acc = 0.0;
          for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
            vec2 o = (vec2(float(x), float(y)) - 1.5) / (${N}.0 * 4.0);
            vec3 c = texture2D(tDiffuse, vUv + o).rgb;
            acc += log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
          }
          gl_FragColor = vec4(clamp((acc / 16.0 - (${LO}.0)) / ${RANGE}.0, 0.0, 1.0), 0.0, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.frame = 0;
    this.pending = false;
    this.logL = null;
    this.failed = false;
    // أوزان القياس: المركز أهم (مثل الكاميرا)
    this.weights = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5;
      this.weights[y * N + x] = 1 + 2 * Math.max(0, 1 - Math.hypot(u * 1.4, v) * 2.4);
    }
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.failed || this.pending || ++this.frame % 12 !== 1) return;
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
    this.pending = true;
    renderer.readRenderTargetPixelsAsync(this.rt, 0, 0, N, N, this.buf).then(() => {
      let s = 0, w = 0;
      for (let i = 0; i < N * N; i++) {
        const val = (this.buf[i * 4] / 255) * RANGE + LO;
        s += val * this.weights[i]; w += this.weights[i];
      }
      this.logL = s / w;
      this.pending = false;
    }).catch(() => { this.pending = false; this.failed = true; });
  }

  dispose() { this.rt.dispose(); this.material.dispose(); this.quad.dispose(); }
}
