/* ============================================================================
 *  textures.js — مولّد خامات PBR على كرت الشاشة (بدون أي صور خارجية)
 *  ---------------------------------------------------------------------------
 *  لكل خامة 3 صور قابلة للتكرار بلا حواف ظاهرة (tileable):
 *    map        : اللون (sRGB) + الشفافية للأوراق والمشربيات
 *    normalMap  : التضاريس الدقيقة (tangent space)
 *    ormMap     : R = إطباق محيطي AO، G = خشونة، B = معدنية
 *  كل الأسطح في المشهد لها UV بالمتر، و worldSize يحدد كم متر تغطي الصورة.
 * ========================================================================== */
import * as THREE from 'three';

/* ------------------------------------------------------------------ GLSL */
const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
#define PI 3.14159265359
#define TAU 6.28318530718
uniform int uOut;
uniform float uRes;
uniform float uSeed;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform vec4 uP;
uniform float uStrength;
uniform float uTiles;
varying vec2 vUv;

/* ---------- ضجيج دوري (يتكرر بلا حواف) */
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float pn(vec2 x, vec2 per) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(mod(i, per) + uSeed);
  float b = h21(mod(i + vec2(1.0, 0.0), per) + uSeed);
  float c = h21(mod(i + vec2(0.0, 1.0), per) + uSeed);
  float d = h21(mod(i + vec2(1.0, 1.0), per) + uSeed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 uv, vec2 per, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= oct) break;
    s += a * pn(uv * per, per); n += a;
    per *= 2.0; a *= 0.5;
  }
  return s / n;
}
vec3 pworley(vec2 x, vec2 per) {
  vec2 i = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int yy = -1; yy <= 1; yy++)
  for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 c = mod(i + g, per);
    vec2 o = h22(c + uSeed);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h21(c + 7.0); } else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), id, sqrt(d2));
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

/* ---------- عروق الرخام */
vec3 marbleColor(vec2 uv, vec3 base, vec3 vein, vec3 vein2, float freq, float turb, float sharp, out float veinAmt) {
  // تشويه مزدوج للمجال (domain warping)
  vec2 q = vec2(pfbm(uv, vec2(3.0), 5), pfbm(uv + vec2(0.52, 0.13), vec2(3.0), 5));
  vec2 r = vec2(pfbm(uv + q * 0.35 + vec2(0.17, 0.92), vec2(2.0), 6), pfbm(uv + q * 0.35 + vec2(0.83, 0.28), vec2(2.0), 6));
  float F = max(1.0, floor(freq + 0.5));
  // العروق الرئيسية: خطوط طويلة متعرّجة باتجاه عام (مثل الكرارا)، تتلاشى وتظهر على طولها
  float t1 = pfbm(uv + r * 0.6, vec2(3.0), 7);
  float ph = (uv.x + uv.y * 2.0) * F + (t1 - 0.5) * turb * 0.55;
  float s1 = abs(fract(ph) - 0.5) * 2.0;
  // عرض العرق ~0.5–2.5 سم (حسب المقياس الحقيقي للصورة)
  float w = (0.22 / sharp) * (0.35 + 1.0 * pfbm(uv + 0.31, vec2(5.0), 3)) * max(1.0, 512.0 / uRes);
  float fade = smoothstep(0.3, 0.66, pfbm(uv + q * 0.2 + 0.71, vec2(3.0), 4));
  float v1 = (1.0 - smoothstep(0.0, w, 1.0 - s1)) * fade;
  float halo = (1.0 - smoothstep(0.0, w * 9.0, 1.0 - s1)) * (0.25 + 0.75 * fade);
  // شبكة عروق شعرية ثانوية باتجاه مختلف
  float t2 = pfbm(uv + r.yx * 0.8 + 0.37, vec2(4.0), 6);
  float ph2 = (uv.x * 3.0 - uv.y) * F + (t2 - 0.5) * turb * 0.8;
  float s2 = abs(fract(ph2) - 0.5) * 2.0;
  float v2 = (1.0 - smoothstep(0.0, w * 0.6, 1.0 - s2)) * smoothstep(0.42, 0.75, pfbm(uv + 0.53, vec2(4.0), 4));
  // غيوم رمادية ناعمة وتموّج لوني
  float cloud = pfbm(uv + r * 0.25, vec2(4.0), 6);
  vec3 c = base * (0.9 + 0.16 * cloud);
  c = mix(c, mix(base, vein2, 0.6), smoothstep(0.55, 0.85, cloud) * 0.35);
  c = mix(c, mix(base, vein, 0.5), halo * 0.3);
  c = mix(c, vein2, v2 * 0.5);
  c = mix(c, vein, v1 * 0.8);
  float speck = smoothstep(0.78, 0.95, pfbm(uv, vec2(96.0), 2));
  c = mix(c, vein2, speck * 0.06);
  veinAmt = clamp(v1 + v2 * 0.5, 0.0, 1.0);
  return c;
}

/* ---------- نجمة ثمانية (زليج / جبس) */
float star8(vec2 g) {
  float d1 = max(abs(g.x), abs(g.y));
  vec2 rg = vec2(g.x - g.y, g.x + g.y) * 0.70710678;
  float d2 = max(abs(rg.x), abs(rg.y));
  return min(d1, d2);
}
float oct8(vec2 g) {
  float d1 = max(abs(g.x), abs(g.y));
  vec2 rg = vec2(g.x - g.y, g.x + g.y) * 0.70710678;
  float d2 = max(abs(rg.x), abs(rg.y));
  return max(d1, d2);
}

/* ---------- ألياف الخشب */
vec3 woodGrain(vec2 p, vec3 light, vec3 dark, float rings, out float hh) {
  float n = pfbm(p * vec2(1.0, 4.0), vec2(2.0, 8.0), 5);
  float g = p.y * rings + n * 2.2;
  float r = fract(g);
  float ring = smoothstep(0.0, 0.18, r) * (1.0 - smoothstep(0.55, 1.0, r));
  float pores = smoothstep(0.62, 0.8, pfbm(p * vec2(1.0, 40.0), vec2(4.0, 160.0), 3));
  vec3 c = mix(dark, light, 0.35 + 0.65 * ring);
  c *= 0.9 + 0.18 * pfbm(p * vec2(1.0, 16.0), vec2(2.0, 32.0), 4);
  c = mix(c, dark * 0.7, pores * 0.35);
  hh = 0.5 + 0.08 * ring - 0.15 * pores;
  return c;
}

void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal, out float alpha) {
  col = vec3(0.8); h = 0.5; rough = 0.8; metal = 0.0; alpha = 1.0;
  float va;

#if TYPE == 0
  {               // رخام (وبلاطات رخام بفواصل إذا uTiles > 0)
    vec2 suv = uv;
    float joint = 0.0, tone = 1.0;
    if (uTiles > 0.5) {
      vec2 g = uv * uTiles, id = floor(g), f = fract(g);
      vec2 o = h22(id + 11.0);
      suv = fract(f / uTiles + floor(o * uTiles) / uTiles + o * 0.37);
      if (h21(id + 5.0) > 0.5) suv = suv.yx;               // اتجاه العروق يتبدّل بين البلاطات
      tone = 0.95 + 0.1 * h21(id + 3.0);                   // كل بلاطة من كتلة مختلفة قليلاً
      float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float jw = max(0.0022, 0.9 / (uRes / uTiles));
      joint = 1.0 - smoothstep(jw, jw * 2.2, d);
    }
    col = marbleColor(suv, uC1, uC2, uC3, uP.x, uP.y, uP.z, va) * tone;
    col = mix(col, uC1 * 0.62 + uC2 * 0.08, joint * 0.85);
    h = 0.5 - va * 0.004 - joint * 0.12;
    rough = mix(uP.w + va * 0.05, 0.55, joint);
  }
#elif TYPE == 1
  {          // رخام شطرنجي (معيّنات) مع خطوط نحاسية
    vec2 q = uv * uP.x;
    float s = q.x + q.y, t = q.x - q.y;
    float parity = mod(floor(s) + floor(t), 2.0);
    vec3 cw = marbleColor(uv, lin(vec3(0.93, 0.92, 0.9)), lin(vec3(0.55, 0.56, 0.6)), lin(vec3(0.7, 0.66, 0.6)), 2.0, 5.0, 10.0, va);
    vec3 cb = marbleColor(uv + 0.37, lin(vec3(0.05, 0.05, 0.055)), lin(vec3(0.75, 0.74, 0.72)), lin(vec3(0.3, 0.3, 0.3)), 3.0, 6.0, 14.0, va);
    col = parity > 0.5 ? cb : cw;
    float es = min(fract(s), 1.0 - fract(s)), et = min(fract(t), 1.0 - fract(t));
    float line = 1.0 - smoothstep(0.012, 0.02, min(es, et));
    col = mix(col, lin(vec3(0.78, 0.62, 0.32)), line);
    metal = line;
    rough = mix(0.08, 0.3, line);
    h = 0.5 - line * 0.03;
  }
#elif TYPE == 2
  {          // باركيه شيفرون
    vec2 q = uv * uP.x;
    float colI = floor(q.x);
    float lx = fract(q.x);
    float dir = mod(colI, 2.0) < 1.0 ? 1.0 : -1.0;
    float a = (q.y + dir * lx) / uP.y;
    float pid = floor(a);
    float across = fract(a);
    vec2 id = vec2(colI, mod(pid, uP.x / uP.y));
    float rnd = h21(id + 3.1);
    vec3 light = uC1 * (0.85 + 0.3 * rnd), dark = uC2 * (0.85 + 0.3 * h21(id + 9.7));
    float hh;
    col = woodGrain(vec2(lx * 3.0 + rnd * 7.0, across * 0.9 + rnd), light, dark, 3.0 + rnd * 3.0, hh);
    float seam = min(min(lx, 1.0 - lx) * uP.y * 2.0, min(across, 1.0 - across));
    float groove = 1.0 - smoothstep(0.0, 0.035, seam);
    col *= 1.0 - groove * 0.6;
    h = hh - groove * 0.3;
    rough = 0.32 + groove * 0.4 + 0.06 * pfbm(uv, vec2(32.0), 3);
  }
#elif TYPE == 3
  {          // زليج أندلسي بنجمة ثمانية
    vec2 q = uv * uP.x;
    vec2 id = floor(q);
    vec2 g = fract(q) - 0.5;
    float st = star8(g);
    float oc = oct8(g);
    float R = 0.31;
    float corner = 0.5 - max(abs(g.x), abs(g.y));
    float cd = length(abs(g) - 0.5);
    float gw = 0.014;
    vec3 c;
    float pieceEdge;
    if (cd < 0.16) { c = uC4; pieceEdge = abs(cd - 0.16); }
    else if (st < R) {
      if (oc < R * 0.56) { c = uC2; pieceEdge = min(abs(oc - R * 0.56), abs(st - R)); }
      else { c = uC1; pieceEdge = min(abs(st - R), abs(oc - R * 0.56)); }
    } else {
      float par = mod(id.x + id.y, 2.0);
      c = mix(uC3, uC3 * 0.55 + uC1 * 0.1, par * 0.0);
      pieceEdge = min(abs(st - R), abs(cd - 0.16));
      pieceEdge = min(pieceEdge, corner);
    }
    float grout = 1.0 - smoothstep(gw * 0.6, gw, pieceEdge);
    float glaze = pfbm(uv + h21(id), vec2(48.0), 3);
    c *= 0.9 + 0.2 * glaze;
    col = mix(c, lin(vec3(0.82, 0.8, 0.74)), grout);
    float bevel = smoothstep(gw, gw * 3.5, pieceEdge);
    h = mix(0.3, 0.6 + 0.08 * glaze, bevel) * (1.0 - grout * 0.6);
    rough = mix(0.16 + 0.1 * glaze, 0.9, grout);
  }
#elif TYPE == 4
  {          // حجر جيري (أحجار مصفوفة)
    vec2 q = uv * vec2(uP.y, uP.x);
    float row = floor(q.y);
    float off = mod(row, 2.0) * 0.5;
    float bx = q.x + off;
    vec2 id = vec2(mod(floor(bx), uP.y), row);
    vec2 l = vec2(fract(bx), fract(q.y));
    float e = min(min(l.x, 1.0 - l.x) / uP.x * uP.y, min(l.y, 1.0 - l.y));
    float mortar = 1.0 - smoothstep(0.02, 0.04, e);
    float r = h21(id + 1.7);
    vec3 c = uC1 * (0.86 + 0.22 * r);
    c *= 0.88 + 0.2 * pfbm(uv, vec2(24.0), 6);
    c = mix(c, uC1 * 0.65, smoothstep(0.7, 0.9, pfbm(uv + 5.0, vec2(12.0), 5)) * 0.3);
    col = mix(c, uC1 * 0.78, mortar);
    h = mix(0.75 + 0.1 * pfbm(uv, vec2(40.0), 4), 0.25, mortar) - (1.0 - smoothstep(0.03, 0.08, e)) * 0.15;
    rough = 0.85;
  }
#elif TYPE == 5
  {          // جبس/دهان ناعم (لون محايد يُلوّن بالمادة)
    float n = pfbm(uv, vec2(16.0), 6);
    col = vec3(0.92) * (0.97 + 0.05 * n);
    h = 0.5 + 0.5 * pfbm(uv, vec2(64.0), 4);
    rough = 0.78 + 0.08 * n;
  }
#elif TYPE == 6
  {          // ورق جدران دمشقي (نقش ثنائي اللون)
    vec2 q = uv * uP.x;
    float row = floor(q.y);
    vec2 l = vec2(fract(q.x + mod(row, 2.0) * 0.5), fract(q.y)) - 0.5;
    vec2 p = vec2(abs(l.x), l.y);
    float m = 0.0;
    m = max(m, 1.0 - smoothstep(0.0, 0.012, length((p - vec2(0.0, 0.02)) / vec2(0.06, 0.25)) - 1.0));
    m = max(m, 1.0 - smoothstep(0.0, 0.02, length((p - vec2(0.13, 0.12)) / vec2(0.1, 0.05)) - 1.0));
    m = max(m, 1.0 - smoothstep(0.0, 0.02, length((p - vec2(0.12, -0.12)) / vec2(0.11, 0.06)) - 1.0));
    float curl = abs(length(p - vec2(0.24, 0.0)) - 0.12);
    m = max(m, (1.0 - smoothstep(0.012, 0.022, curl)) * step(p.x, 0.32));
    m = max(m, 1.0 - smoothstep(0.0, 0.01, length(p - vec2(0.0, 0.33)) - 0.04));
    m = max(m, 1.0 - smoothstep(0.0, 0.01, length(p - vec2(0.0, -0.33)) - 0.035));
    float d2 = abs(length(p - vec2(0.0, 0.0)) - 0.41);
    m = max(m, (1.0 - smoothstep(0.006, 0.012, d2)) * 0.8);
    float n = pfbm(uv, vec2(64.0), 3);
    col = mix(vec3(0.62), vec3(0.9), m) * (0.96 + 0.06 * n);
    h = 0.45 + m * 0.1;
    rough = mix(0.78, 0.38, m);
  }
#elif TYPE == 7
  {          // جبس عربي محفور (نجمة + زخرفة نباتية)
    vec2 q = uv * uP.x;
    vec2 g = fract(q) - 0.5;
    float st = star8(g);
    float oc = oct8(g);
    float lines = 0.0;
    lines = max(lines, 1.0 - smoothstep(0.012, 0.03, abs(st - 0.3)));
    lines = max(lines, 1.0 - smoothstep(0.012, 0.03, abs(oc - 0.18)));
    lines = max(lines, 1.0 - smoothstep(0.012, 0.03, abs(length(abs(g) - 0.5) - 0.17)));
    float veg = pfbm(uv, vec2(uP.x * 6.0), 5);
    float carve = smoothstep(0.45, 0.7, veg);
    h = 0.35 + lines * 0.5 + (1.0 - lines) * carve * 0.15;
    col = vec3(0.93) * (0.82 + 0.18 * h) * (0.97 + 0.04 * pfbm(uv, vec2(80.0), 3));
    rough = 0.72;
  }
#elif TYPE == 8
  {          // مخمل
    float n = pfbm(uv, vec2(24.0), 6);
    float f = pfbm(uv, vec2(256.0), 2);
    col = vec3(0.82) * (0.9 + 0.14 * n);
    h = 0.5 + 0.25 * f + 0.1 * n;
    rough = 0.9;
  }
#elif TYPE == 9
  {          // كتان منسوج
    vec2 q = uv * uP.x;
    float wx = sin(q.x * TAU) * 0.5 + 0.5, wy = sin(q.y * TAU) * 0.5 + 0.5;
    float over = step(0.5, fract(floor(q.x) * 0.5 + floor(q.y) * 0.5));
    float th = mix(wx, wy, over);
    float slub = pfbm(uv * vec2(1.0, 8.0), vec2(8.0, 64.0), 3);
    col = vec3(0.86) * (0.88 + 0.12 * th) * (0.94 + 0.1 * slub);
    h = 0.4 + 0.4 * th;
    rough = 0.88;
  }
#elif TYPE == 10
  {         // جلد
    vec3 w = pworley(uv * uP.x, vec2(uP.x));
    float peb = smoothstep(0.0, 0.5, w.z - w.x);
    float wr = pfbm(uv, vec2(6.0), 6);
    float crease = 1.0 - smoothstep(0.0, 0.04, abs(wr - 0.5));
    col = vec3(0.8) * (0.85 + 0.15 * peb) * (1.0 - crease * 0.25);
    h = 0.4 + 0.25 * peb - crease * 0.2;
    rough = 0.5 + 0.15 * (1.0 - peb);
  }
#elif TYPE == 11
  {         // تنجيد كابيتونيه (أزرار معيّنة)
    vec2 q = uv * uP.x;
    float s = q.x + q.y, t = q.x - q.y;
    vec2 l = vec2(fract(s), fract(t)) * 2.0 - 1.0;
    float pillow = (1.0 - l.x * l.x) * (1.0 - l.y * l.y);
    vec2 cq = vec2(abs(fract(s + 0.5) - 0.5), abs(fract(t + 0.5) - 0.5));
    float bd = length(cq);
    float button = 1.0 - smoothstep(0.05, 0.07, bd);
    float crease = 1.0 - smoothstep(0.0, 0.08, min(min(abs(l.x - 1.0), abs(l.x + 1.0)), min(abs(l.y - 1.0), abs(l.y + 1.0))));
    h = pow(pillow, 0.6) * (1.0 - button * 0.5);
    col = vec3(0.82) * (0.72 + 0.3 * h) * (1.0 - button * 0.35);
    rough = 0.85;
  }
#elif TYPE == 12
  {         // سجادة فارسية (صورة كاملة غير متكررة)
    float aspect = uP.x;
    vec2 p = uv * 2.0 - 1.0;
    float dX = (1.0 - abs(p.x)) * aspect, dY = 1.0 - abs(p.y);
    float e = min(dX, dY);
    float along = dX < dY ? p.y : p.x * aspect;
    vec3 c = uC1;
    float wool = pfbm(uv, vec2(160.0, 120.0), 3);
    if (e < 0.035) {
      c = uC3 * (0.9 + 0.1 * step(0.5, fract(along * 20.0)));
    } else if (e < 0.05) {
      c = uC4;
    } else if (e < 0.17) {
      c = uC2;
      float k = fract(along * 4.0) - 0.5;
      vec2 rp = vec2(k * 0.5, (e - 0.11) * 3.0);
      float rr = length(rp);
      float ang = atan(rp.y, rp.x);
      float petal = 0.12 + 0.05 * cos(ang * 6.0);
      if (rr < petal) c = mix(uC4, uC3, step(rr, 0.05));
      float vine = abs(sin(along * TAU * 4.0) * 0.03 - (e - 0.11));
      c = mix(c, uC4 * 0.85, (1.0 - smoothstep(0.004, 0.008, vine)) * step(0.13, rr));
    } else if (e < 0.19) {
      c = uC4 * (0.85 + 0.15 * step(0.5, fract(along * 30.0 + e * 30.0)));
    } else if (e < 0.21) {
      c = uC3;
    } else {
      vec2 f = vec2(p.x * aspect, p.y);
      float r = length(f);
      float ang = atan(f.y, f.x);
      float med = 0.36 * (1.0 + 0.13 * cos(ang * 8.0) + 0.04 * cos(ang * 16.0));
      float rimR = med + 0.03;
      vec2 fg = f * vec2(6.0, 6.0);
      vec2 gl = fract(fg) - 0.5;
      float ros = length(gl);
      float motif = 1.0 - smoothstep(0.1, 0.14, ros);
      float leaf = 1.0 - smoothstep(0.02, 0.05, abs(gl.x * gl.y) * 8.0 - 0.02);
      c = uC1;
      c = mix(c, uC4 * 0.9, leaf * 0.35 * step(0.18, ros));
      c = mix(c, uC3 * 0.95, motif * 0.7);
      c = mix(c, uC2, (1.0 - smoothstep(0.03, 0.06, ros)) * motif);
      vec2 cf = vec2(aspect - 0.21 - abs(f.x), 1.0 - 0.21 - abs(f.y));
      float cr = length(cf);
      float corner = 1.0 - smoothstep(0.24, 0.26, cr * (1.0 + 0.1 * cos(atan(cf.y, cf.x) * 8.0)));
      c = mix(c, uC2, corner);
      c = mix(c, uC4, corner * (1.0 - smoothstep(0.1, 0.12, cr)));
      if (r < rimR) {
        c = uC2;
        if (r < med) {
          c = uC3 * 0.95;
          float inner = 0.22 * (1.0 + 0.15 * cos(ang * 8.0 + PI / 8.0));
          if (r < inner) c = uC1;
          if (r < 0.1) c = uC2;
          if (r < 0.045) c = uC4;
          float petals = abs(sin(ang * 8.0)) * 0.08 + 0.13;
          if (r > inner && abs(r - (inner + med) * 0.5) < petals * 0.25) c = mix(c, uC4, 0.6);
        }
      }
    }
    col = c * (0.85 + 0.22 * wool);
    h = 0.5 + 0.3 * wool;
    rough = 0.97;
  }
#elif TYPE == 13
  {         // معدن (تغيّر خشونة خفيف)
    float n = pfbm(uv * vec2(1.0, 12.0), vec2(4.0, 48.0), 4);
    col = vec3(1.0) * (0.96 + 0.04 * n);
    h = 0.5 + 0.03 * n;
    rough = uP.x + uP.y * n;
    metal = 1.0;
  }
#elif TYPE == 14
  {         // عشب
    float n = pfbm(uv, vec2(8.0), 6);
    float bl = pfbm(uv * vec2(1.0, 1.0), vec2(220.0, 90.0), 3);
    col = mix(lin(vec3(0.16, 0.27, 0.08)), lin(vec3(0.36, 0.52, 0.18)), n * 0.7 + bl * 0.5);
    col = mix(col, lin(vec3(0.45, 0.45, 0.22)), smoothstep(0.7, 0.9, pfbm(uv + 3.0, vec2(4.0), 5)) * 0.35);
    h = bl;
    rough = 0.95;
  }
#elif TYPE == 15
  {         // ترافرتين
    vec2 q = uv * vec2(2.0, 3.0);
    float row = floor(q.y);
    float bx = q.x + mod(row, 2.0) * 0.5;
    vec2 id = vec2(mod(floor(bx), 2.0), row);
    vec2 l = vec2(fract(bx), fract(q.y));
    float e = min(min(l.x, 1.0 - l.x) * 1.5, min(l.y, 1.0 - l.y));
    float grout = 1.0 - smoothstep(0.008, 0.015, e);
    float band = pfbm(vec2(uv.x * 0.25, uv.y * 4.0) + h21(id), vec2(1.0, 16.0), 5);
    float pore = smoothstep(0.72, 0.8, pfbm(uv * vec2(1.0, 3.0) + 2.0, vec2(24.0, 72.0), 4));
    vec3 c = uC1 * (0.88 + 0.18 * band) * (0.92 + 0.12 * h21(id));
    c = mix(c, uC1 * 0.55, pore * 0.7);
    col = mix(c, uC1 * 0.95, grout);
    h = 0.6 - pore * 0.4 - grout * 0.2;
    rough = 0.55 + pore * 0.3;
  }
#elif TYPE == 16
  {         // فخار (تيراكوتا)
    float n = pfbm(uv, vec2(12.0), 6);
    col = uC1 * (0.82 + 0.3 * n);
    h = 0.5 + 0.2 * n;
    rough = 0.78;
  }
#elif TYPE == 17
  {         // خشب الأثاث (ألياف على طول u)
    float hh;
    col = woodGrain(vec2(uv.x * 2.0, uv.y), uC1, uC2, uP.x, hh);
    h = hh;
    rough = 0.38;
  }
#elif TYPE == 18
  {         // كسوة خشبية بحشوات (محايدة تُلوّن بالمادة)
    vec2 q = vec2(uv.x * uP.x, uv.y * uP.y);
    vec2 l = fract(q);
    float e = min(min(l.x, 1.0 - l.x), min(l.y, 1.0 - l.y));
    float frame = 1.0 - smoothstep(0.1, 0.12, e);
    float bevel = smoothstep(0.12, 0.2, e);
    float hh;
    vec3 wc = woodGrain(vec2(uv.y * 3.0, uv.x * 0.5) + h21(floor(q)), vec3(0.95), vec3(0.6), 6.0, hh);
    col = wc;
    h = frame * 0.9 + (1.0 - frame) * (0.45 + 0.3 * bevel) + (hh - 0.5) * 0.3;
    rough = 0.42;
  }
#elif TYPE == 19
  {         // لوحات زيتية
    vec2 p = uv;
    float brush = pfbm(uv * vec2(1.0, 3.0), vec2(30.0, 90.0), 4);
    float canvasW = sin(uv.x * TAU * 300.0) * sin(uv.y * TAU * 300.0);
    vec3 c;
    int art = int(uP.x + 0.5);
    if (art == 0) {
      vec3 sky = mix(lin(vec3(0.98, 0.72, 0.38)), lin(vec3(0.42, 0.22, 0.4)), smoothstep(0.45, 1.0, p.y));
      sky = mix(sky, lin(vec3(1.0, 0.9, 0.6)), 1.0 - smoothstep(0.0, 0.12, length((p - vec2(0.62, 0.48)) * vec2(1.0, 1.2))));
      c = sky;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float y = 0.42 - fi * 0.1 + 0.05 * sin(p.x * (4.0 + fi * 2.0) + fi * 2.0) + 0.02 * sin(p.x * 13.0 + fi);
        vec3 dc = mix(lin(vec3(0.85, 0.5, 0.25)), lin(vec3(0.45, 0.2, 0.12)), fi / 3.0);
        float lit = smoothstep(-0.02, 0.06, sin(p.x * (4.0 + fi * 2.0) + fi * 2.0 + 1.2));
        if (p.y < y) c = dc * (0.75 + 0.4 * lit);
      }
      vec2 tp = p - vec2(0.2, 0.18);
      float trunk = 1.0 - smoothstep(0.006, 0.012, abs(tp.x - tp.y * 0.12 + 0.02 * sin(tp.y * 9.0))) ;
      trunk *= step(0.0, tp.y) * step(tp.y, 0.5);
      vec2 cp = p - vec2(0.255, 0.68);
      float frond = 0.0;
      for (int k = 0; k < 7; k++) {
        float a = float(k) / 7.0 * PI * 1.1 - 0.1;
        vec2 dir = vec2(cos(a), sin(a) * 0.55 - 0.25 * (abs(cos(a))));
        float tt = clamp(dot(cp, dir) / dot(dir, dir), 0.0, 0.22);
        float d = length(cp - dir * tt);
        frond = max(frond, 1.0 - smoothstep(0.004, 0.012 * (1.0 - tt * 3.0), d));
      }
      c = mix(c, lin(vec3(0.12, 0.06, 0.06)), max(trunk, frond));
    } else if (art == 1) {
      vec3 sky = mix(lin(vec3(0.75, 0.84, 0.9)), lin(vec3(0.3, 0.45, 0.65)), p.y);
      float cl = smoothstep(0.5, 0.75, pfbm(p * vec2(1.0, 2.0) + 1.0, vec2(3.0, 6.0), 6));
      sky = mix(sky, vec3(0.95), cl * step(0.55, p.y));
      c = sky;
      float hz = 0.48;
      if (p.y < hz) {
        float w = pfbm(vec2(p.x * 2.0, p.y * 30.0), vec2(4.0, 60.0), 4);
        c = mix(lin(vec3(0.08, 0.22, 0.32)), lin(vec3(0.22, 0.42, 0.52)), p.y / hz) * (0.8 + 0.4 * w);
        c = mix(c, vec3(0.92), smoothstep(0.82, 0.9, w) * 0.6);
      }
      vec2 bp = p - vec2(0.62, 0.5);
      float hull = step(abs(bp.x), 0.06 - bp.y * 0.5) * step(-0.03, bp.y) * step(bp.y, 0.0);
      float sail = step(0.0, bp.y) * step(bp.y, 0.16) * step(abs(bp.x + 0.01), 0.05 * (1.0 - bp.y / 0.16));
      c = mix(c, lin(vec3(0.25, 0.15, 0.1)), hull);
      c = mix(c, lin(vec3(0.95, 0.92, 0.85)), sail);
    } else if (art == 2) {
      c = mix(lin(vec3(0.98, 0.85, 0.7)), lin(vec3(0.45, 0.6, 0.85)), smoothstep(0.4, 1.0, p.y));
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float y = 0.75 - fi * 0.1 + 0.12 * pfbm(vec2(p.x * 0.5 + fi * 0.3, fi), vec2(2.0, 1.0), 5) - 0.06;
        vec3 mc = mix(lin(vec3(0.55, 0.62, 0.78)), lin(vec3(0.15, 0.2, 0.18)), fi / 3.0);
        if (p.y < y && p.y > 0.3) c = mc * (0.85 + 0.25 * pfbm(p * 3.0 + fi, vec2(6.0), 4));
      }
      if (p.y < 0.3) {
        vec2 rp = vec2(p.x, 0.6 - p.y);
        c = mix(lin(vec3(0.35, 0.5, 0.65)), lin(vec3(0.6, 0.7, 0.8)), p.y / 0.3) * (0.85 + 0.2 * pfbm(vec2(p.x, p.y * 20.0), vec2(4.0, 40.0), 3));
      }
      for (int k = 0; k < 6; k++) {
        float x0 = 0.06 + float(k) * 0.035 + 0.02 * h21(vec2(float(k), 3.0));
        float tri = step(abs(p.x - x0), (0.5 - p.y) * 0.18) * step(0.3, p.y) * step(p.y, 0.48 + 0.04 * h21(vec2(float(k), 1.0)));
        c = mix(c, lin(vec3(0.06, 0.12, 0.08)), tri);
      }
    } else {
      vec3 bg = lin(vec3(0.08, 0.06, 0.05)) * (0.7 + 0.5 * pfbm(p, vec2(3.0), 5));
      c = bg;
      vec2 vp = p - vec2(0.5, 0.22);
      float vase = step(abs(vp.x), 0.09 + 0.04 * sin(vp.y * 18.0)) * step(-0.18, vp.y) * step(vp.y, 0.12);
      c = mix(c, lin(vec3(0.55, 0.45, 0.3)) * (0.6 + 0.6 * smoothstep(-0.09, 0.05, vp.x)), vase);
      for (int k = 0; k < 14; k++) {
        float fk = float(k);
        vec2 fc = vec2(0.5 + (h21(vec2(fk, 1.0)) - 0.5) * 0.55, 0.5 + h21(vec2(fk, 2.0)) * 0.38);
        float fr = 0.045 + 0.04 * h21(vec2(fk, 3.0));
        vec2 dv = p - fc;
        float ang = atan(dv.y, dv.x);
        float rr = length(dv) / (fr * (1.0 + 0.18 * sin(ang * 5.0 + fk)));
        vec3 fcol = h21(vec2(fk, 4.0)) < 0.4 ? lin(vec3(0.75, 0.12, 0.16)) : (h21(vec2(fk, 5.0)) < 0.5 ? lin(vec3(0.95, 0.9, 0.86)) : lin(vec3(0.95, 0.65, 0.7)));
        if (rr < 1.0) c = fcol * (0.6 + 0.5 * (1.0 - rr)) * (0.85 + 0.3 * pfbm(p * 8.0 + fk, vec2(16.0), 3));
      }
    }
    col = c * (0.9 + 0.15 * brush) * (1.0 + 0.03 * canvasW);
    h = 0.5 + 0.3 * brush + 0.05 * canvasW;
    rough = 0.42;
  }
#elif TYPE == 20
  {         // نقش القبة (ذهب ولازورد)
    vec2 q = vec2(uv.x * 24.0, uv.y * 10.0);
    vec2 g = fract(q) - 0.5;
    float st = star8(g);
    float oc = oct8(g);
    float rib = 1.0 - smoothstep(0.03, 0.06, abs(fract(uv.x * 24.0) - 0.5) * 0.0 + min(abs(fract(uv.x * 12.0)), abs(1.0 - fract(uv.x * 12.0))) * 6.0);
    float lines = max(1.0 - smoothstep(0.015, 0.035, abs(st - 0.3)), 1.0 - smoothstep(0.015, 0.035, abs(oc - 0.17)));
    float gold = max(lines, rib);
    vec3 lapis = lin(vec3(0.1, 0.17, 0.42)) * (0.75 + 0.35 * pfbm(uv, vec2(48.0, 20.0), 4));
    vec3 inner = lin(vec3(0.12, 0.38, 0.4));
    vec3 c = st < 0.3 ? (oc < 0.17 ? lin(vec3(0.85, 0.78, 0.62)) : inner) : lapis;
    float apex = smoothstep(0.86, 0.9, uv.y);
    gold = max(gold, apex * (0.5 + 0.5 * step(0.5, fract(uv.x * 48.0))));
    col = mix(c, vec3(1.0, 0.78, 0.4), gold);
    metal = gold;
    rough = mix(0.6, 0.25, gold);
    h = 0.5 + gold * 0.1;
  }
#elif TYPE == 21
  {         // لحاء النخيل
    vec2 q = uv * vec2(uP.x, uP.y);
    float row = floor(q.y);
    vec2 l = vec2(fract(q.x + mod(row, 2.0) * 0.5), fract(q.y));
    float scale = 1.0 - smoothstep(0.3, 0.5, length((l - vec2(0.5, 0.7)) * vec2(1.0, 0.8)));
    float n = pfbm(uv, vec2(8.0, 32.0), 5);
    col = mix(lin(vec3(0.24, 0.19, 0.14)), lin(vec3(0.5, 0.42, 0.32)), scale * 0.7 + n * 0.4);
    h = scale * 0.7 + n * 0.3;
    rough = 0.9;
  }
#elif TYPE == 22
  {         // سعفة نخيل / ورقة (مع شفافية)
    float x = uv.x - 0.5;
    float y = uv.y;
    float taper = sin(PI * clamp(y * 1.05, 0.0, 1.0));
    float rachis = 1.0 - smoothstep(0.006, 0.014, abs(x));
    float leaflets = sin((y * 46.0 + abs(x) * 9.0) * TAU * 0.5);
    float lf = smoothstep(0.55, 0.85, leaflets) * step(abs(x), 0.5 * taper + 0.02) * step(0.04, y);
    alpha = max(rachis * step(y, 0.99), lf);
    float n = pfbm(uv, vec2(4.0, 16.0), 4);
    col = mix(lin(vec3(0.12, 0.28, 0.07)), lin(vec3(0.33, 0.48, 0.14)), n * 0.6 + (1.0 - abs(x) * 1.5) * 0.3);
    col = mix(col, lin(vec3(0.55, 0.5, 0.25)), rachis);
    h = 0.5 + 0.2 * lf;
    rough = 0.6;
  }
#elif TYPE == 23
  {         // بلاط الفناء: رخام كبير مع نجوم زليج عند الزوايا
    vec2 q = uv * uP.x;
    vec2 id = floor(q);
    vec2 g = fract(q) - 0.5;
    vec2 cg = (abs(g) - 0.5);
    float cd = length(cg);
    vec3 m = marbleColor(uv * 0.5, lin(vec3(0.92, 0.9, 0.86)), lin(vec3(0.62, 0.6, 0.58)), lin(vec3(0.75, 0.7, 0.62)), 1.0, 4.0, 9.0, va);
    float e = 0.5 - max(abs(g.x), abs(g.y));
    float grout = 1.0 - smoothstep(0.004, 0.008, e);
    vec3 c = mix(m, lin(vec3(0.7, 0.68, 0.64)), grout);
    vec2 sg = (fract(q + 0.5) - 0.5) * 3.2;
    float st = star8(sg);
    float rough0 = 0.14 + va * 0.05;
    if (st < 0.32) {
      c = oct8(sg) < 0.18 ? uC2 : uC1;
      float pe = min(abs(st - 0.32), abs(oct8(sg) - 0.18));
      c = mix(c, lin(vec3(0.8, 0.78, 0.72)), 1.0 - smoothstep(0.01, 0.02, pe));
      rough0 = 0.2;
    } else if (st < 0.38) { c = uC3; rough0 = 0.25; }
    col = c;
    h = 0.5 - grout * 0.2;
    rough = rough0 + grout * 0.5;
  }
#elif TYPE == 24
  {         // مشربية خشبية (شفافية)
    vec2 q = uv * uP.x;
    vec2 g = fract(q) - 0.5;
    float rod = min(abs(g.x), abs(g.y));
    float bead = length(g);
    float dia = min(abs(g.x - g.y), abs(g.x + g.y)) * 0.7071;
    float solid = max(max(1.0 - smoothstep(0.045, 0.06, rod), 1.0 - smoothstep(0.15, 0.17, bead)), (1.0 - smoothstep(0.03, 0.045, dia)) * step(0.22, bead));
    float hole = 1.0 - smoothstep(0.07, 0.09, bead);
    alpha = solid * (1.0 - hole);
    float hh;
    col = woodGrain(uv * vec2(3.0, 1.0), uC1, uC2, 8.0, hh);
    h = alpha * (0.5 + 0.4 * (1.0 - smoothstep(0.0, 0.17, bead)) * step(bead, 0.17)) + hh * 0.1;
    rough = 0.5;
  }
#elif TYPE == 25
  {         // حجر رملي ناعم (زخارف خارجية)
    float n = pfbm(uv, vec2(10.0), 6);
    float g = pfbm(uv, vec2(120.0), 3);
    col = uC1 * (0.88 + 0.16 * n) * (0.95 + 0.08 * g);
    h = 0.5 + 0.3 * g;
    rough = 0.8;
  }
#endif
}

void main() {
  vec3 col; float h, rough, metal, alpha;
  surf(vUv, col, h, rough, metal, alpha);
  if (uOut == 0) gl_FragColor = vec4(max(col, 0.0), alpha);
  else gl_FragColor = vec4(h, rough, metal, alpha);
}
`;

/* المرحلة الثانية: خريطة النتوءات والإطباق المحيطي من صورة الارتفاع (سريع جداً) */
const DERIVE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uH;
uniform int uMode;
uniform int uWrap;
uniform float uRes;
uniform float uStrength;
ivec2 wrapc(ivec2 p, int n) {
  if (uWrap == 1) return (p % n + n) % n;
  return clamp(p, ivec2(0), ivec2(n - 1));
}
float H(ivec2 p, int n) { return texelFetch(uH, wrapc(p, n), 0).r; }
void main() {
  int n = int(uRes);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uH, p, 0);
  if (uMode == 0) {
    float k = uStrength * uRes / 512.0;
    float hR = H(p + ivec2(1, 0), n), hL = H(p - ivec2(1, 0), n);
    float hU = H(p + ivec2(0, 1), n), hD = H(p - ivec2(0, 1), n);
    vec3 nn = normalize(vec3((hL - hR) * k, (hD - hU) * k, 1.0));
    gl_FragColor = vec4(nn * 0.5 + 0.5, 1.0);
  } else {
    float avg = 0.25 * (H(p + ivec2(3, 0), n) + H(p - ivec2(3, 0), n) + H(p + ivec2(0, 3), n) + H(p - ivec2(0, 3), n));
    float ao = clamp(1.0 - max(avg - c.r, 0.0) * 4.0, 0.35, 1.0);
    gl_FragColor = vec4(ao, clamp(c.g, 0.03, 1.0), clamp(c.b, 0.0, 1.0), 1.0);
  }
}
`;

/* ------------------------------------------------------------------ تعريف الخامات */
const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
/**
 * type: رقم الدالة في الشيدر — worldSize: كم متر تغطيه الصورة الواحدة
 * res: floor | wall | small — normal/orm: هل نولّد هذه الصور — strength: قوة التضاريس
 */
export const TEX_DEFS = {
  marbleWhite: { type: 0, c: ['#f2f0ec', '#8d9096', '#b9b2a6'], p: [2, 5.5, 11, 0.1], worldSize: 2.4, res: 'floor', normal: false, orm: true },
  marbleCream: { type: 0, c: ['#e8dcc4', '#b39b7a', '#d8c4a0'], p: [1, 4.0, 8, 0.12], worldSize: 2.4, res: 'floor', normal: false, orm: true },
  marbleBlack: { type: 0, c: ['#131314', '#cfcfcc', '#5c5b58'], p: [3, 6.0, 16, 0.08], worldSize: 2.4, res: 'floor', normal: false, orm: true },
  marbleGreen: { type: 0, c: ['#1d3b2e', '#d7dccf', '#3f6b52'], p: [3, 7.0, 13, 0.1], worldSize: 2.0, res: 'floor', normal: false, orm: true },
  slabWhite: { type: 0, c: ['#f1efea', '#7d8088', '#a9a49b'], p: [2, 5.5, 11, 0.08], worldSize: 2.4, tiles: 3, res: 'floor', normal: true, orm: true, strength: 1.2 },
  slabCream: { type: 0, c: ['#e9dcc3', '#a68c69', '#cdb894'], p: [1, 4.0, 9, 0.1], worldSize: 2.4, tiles: 3, res: 'floor', normal: true, orm: true, strength: 1.2 },
  slabBlack: { type: 0, c: ['#121213', '#d6d4cf', '#55534f'], p: [3, 6.0, 14, 0.07], worldSize: 2.4, tiles: 3, res: 'floor', normal: true, orm: true, strength: 1.2 },
  slabGreen: { type: 0, c: ['#1b382b', '#d3d8cb', '#3d6650'], p: [3, 7.0, 12, 0.09], worldSize: 2.4, tiles: 3, res: 'floor', normal: true, orm: true, strength: 1.2 },
  checker: { type: 1, c: ['#ffffff', '#000000', '#000000'], p: [3, 0, 0, 0], worldSize: 3.0, res: 'floor', normal: true, orm: true, strength: 1.5 },
  parquet: { type: 2, c: ['#b4875a', '#7a5433'], p: [4, 0.25, 0, 0], worldSize: 2.8, res: 'floor', normal: true, orm: true, strength: 3 },
  zellige: { type: 3, c: ['#1d6f73', '#f2ede1', '#16222f', '#c99a3a'], p: [3, 0, 0, 0], worldSize: 1.2, res: 'floor', normal: true, orm: true, strength: 4 },
  zelligeWall: { type: 3, c: ['#2b7d4f', '#f2ede1', '#1b2b4a', '#d1a347'], p: [3, 0, 0, 0], worldSize: 0.9, res: 'wall', normal: true, orm: true, strength: 4 },
  courtyard: { type: 23, c: ['#21756a', '#f1ece0', '#18243a'], p: [2, 0, 0, 0], worldSize: 2.4, res: 'floor', normal: true, orm: true, strength: 2 },
  travertine: { type: 15, c: ['#d8c7a8'], p: [0, 0, 0, 0], worldSize: 2.4, res: 'floor', normal: true, orm: true, strength: 2 },
  limestone: { type: 4, c: ['#d9c39a'], p: [6, 3, 0, 0], worldSize: 3.0, res: 'wall', normal: true, orm: true, strength: 4 },
  sandstone: { type: 25, c: ['#dcc49c'], p: [0, 0, 0, 0], worldSize: 1.5, res: 'small', normal: true, orm: false, strength: 2 },
  plaster: { type: 5, c: [], p: [0, 0, 0, 0], worldSize: 2.0, res: 'wall', normal: true, orm: false, strength: 0.6 },
  damask: { type: 6, c: [], p: [3, 0, 0, 0], worldSize: 1.5, res: 'wall', normal: true, orm: true, strength: 1.2 },
  stucco: { type: 7, c: [], p: [2, 0, 0, 0], worldSize: 1.2, res: 'wall', normal: true, orm: true, strength: 4 },
  panel: { type: 18, c: [], p: [3, 2, 0, 0], worldSize: 2.4, res: 'wall', normal: true, orm: true, strength: 5 },
  ripple: { type: 5, c: [], p: [0, 0, 0, 0], worldSize: 1.6, res: 'small', normal: true, orm: false, strength: 1.2 },
  velvet: { type: 8, c: [], p: [0, 0, 0, 0], worldSize: 0.6, res: 'small', normal: true, orm: false, strength: 0.8 },
  linen: { type: 9, c: [], p: [60, 0, 0, 0], worldSize: 0.5, res: 'small', normal: true, orm: false, strength: 1.2 },
  leather: { type: 10, c: [], p: [40, 0, 0, 0], worldSize: 0.6, res: 'small', normal: true, orm: true, strength: 1.5 },
  tufted: { type: 11, c: [], p: [3, 0, 0, 0], worldSize: 0.75, res: 'small', normal: true, orm: true, strength: 7 },
  metal: { type: 13, c: [], p: [0.18, 0.12, 0, 0], worldSize: 0.5, res: 'small', normal: false, orm: true },
  grass: { type: 14, c: [], p: [0, 0, 0, 0], worldSize: 3.0, res: 'wall', normal: true, orm: false, strength: 2 },
  terracotta: { type: 16, c: ['#a8573a'], p: [0, 0, 0, 0], worldSize: 1.0, res: 'small', normal: true, orm: false, strength: 1 },
  wood: { type: 17, c: ['#c59a6b', '#6e4628'], p: [5, 0, 0, 0], worldSize: 1.2, res: 'small', normal: true, orm: false, strength: 1 },
  bark: { type: 21, c: [], p: [5, 24, 0, 0], worldSize: 1.0, res: 'small', normal: true, orm: false, strength: 5 },
  leaf: { type: 22, c: [], p: [0, 0, 0, 0], worldSize: 1.0, res: 'small', normal: false, orm: false, alpha: true, repeat: false },
  mashrabiya: { type: 24, c: ['#7a4d2b', '#3d2414'], p: [6, 0, 0, 0], worldSize: 0.9, res: 'small', normal: true, orm: false, alpha: true, strength: 3 },
  dome: { type: 20, c: [], p: [0, 0, 0, 0], worldSize: 1.0, res: 'wall', normal: true, orm: true, strength: 1, repeat: false },
  rugRed: { type: 12, c: ['#7a1a1e', '#1c2a4a', '#e6d8b8', '#c49a4a'], p: [1.333, 0, 0, 0], worldSize: 1, res: 'floor', normal: true, orm: false, strength: 1, repeat: false },
  rugNavy: { type: 12, c: ['#1f2b4d', '#7a1a1e', '#e6d8b8', '#c49a4a'], p: [1.333, 0, 0, 0], worldSize: 1, res: 'floor', normal: true, orm: false, strength: 1, repeat: false },
  rugIvory: { type: 12, c: ['#e2d6bd', '#6b2a2a', '#2a3a5a', '#7a8a5a'], p: [1.333, 0, 0, 0], worldSize: 1, res: 'floor', normal: true, orm: false, strength: 1, repeat: false },
  art0: { type: 19, c: [], p: [0, 0, 0, 0], worldSize: 1, res: 'small', normal: true, orm: false, strength: 1, repeat: false },
  art1: { type: 19, c: [], p: [1, 0, 0, 0], worldSize: 1, res: 'small', normal: true, orm: false, strength: 1, repeat: false },
  art2: { type: 19, c: [], p: [2, 0, 0, 0], worldSize: 1, res: 'small', normal: true, orm: false, strength: 1, repeat: false },
  art3: { type: 19, c: [], p: [3, 0, 0, 0], worldSize: 1, res: 'small', normal: true, orm: false, strength: 1, repeat: false },
};

/* ------------------------------------------------------------------ المولّد */
export class TextureBaker {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.cache = new Map();
    this.targets = [];
    this.materials = new Map();
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    // صورة الارتفاع بدقة float إن أمكن (نتوءات ناعمة بلا تدرّجات)
    this.hType = renderer.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
    this.derive = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: DERIVE_FRAG,
      uniforms: { uH: { value: null }, uMode: { value: 0 }, uWrap: { value: 1 }, uRes: { value: 512 }, uStrength: { value: 1 } },
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.derive);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.quad = quad;
    this.hTargets = new Map();
  }

  /** شيدر صغير لكل نوع خامة (يُترجم بسرعة بدل شيدر ضخم واحد) */
  _material(type) {
    let m = this.materials.get(type);
    if (m) return m;
    m = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      defines: { TYPE: type },
      uniforms: {
        uOut: { value: 0 }, uRes: { value: 512 }, uSeed: { value: 0 },
        uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uC4: { value: new THREE.Color() },
        uP: { value: new THREE.Vector4() }, uStrength: { value: 1 }, uTiles: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.materials.set(type, m);
    return m;
  }

  _target(size, srgb, repeat) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
      wrapT: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
      anisotropy: Math.min(this.maxAniso, this.quality.anisotropy),
      depthBuffer: false,
    });
    this.targets.push(rt);
    return rt;
  }

  _heightTarget(size) {
    let rt = this.hTargets.get(size);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(size, size, {
        type: this.hType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false,
      });
      this.hTargets.set(size, rt);
    }
    return rt;
  }

  _render(rt, material) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = material;
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
  }

  /** يولّد (أو يعيد من الذاكرة) مجموعة الصور لخامة */
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const def = TEX_DEFS[name];
    if (!def) throw new Error(`unknown texture ${name}`);
    const size = this.quality.tex[def.res] || 512;
    const mat = this._material(def.type);
    const u = mat.uniforms;
    u.uRes.value = size;
    u.uSeed.value = (name.length * 7.31) % 13;
    const cs = def.c || [];
    u.uC1.value.copy(cs[0] ? C(cs[0]) : new THREE.Color(1, 1, 1));
    u.uC2.value.copy(cs[1] ? C(cs[1]) : new THREE.Color(0.5, 0.5, 0.5));
    u.uC3.value.copy(cs[2] ? C(cs[2]) : new THREE.Color(0.5, 0.5, 0.5));
    u.uC4.value.copy(cs[3] ? C(cs[3]) : new THREE.Color(0.5, 0.5, 0.5));
    u.uP.value.set(...(def.p || [0, 0, 0, 0]));
    u.uStrength.value = def.strength || 1;
    u.uTiles.value = def.tiles || 0;
    const repeat = def.repeat !== false;
    const set = { name, worldSize: def.worldSize, size };
    // 1) اللون
    u.uOut.value = 0;
    const rtA = this._target(size, true, repeat);
    this._render(rtA, mat);
    set.map = rtA.texture;
    // 2) الارتفاع + الخشونة + المعدنية، ثم 3) النتوءات و 4) ORM منها
    if (def.normal || def.orm) {
      u.uOut.value = 1;
      const rtH = this._heightTarget(size);
      this._render(rtH, mat);
      const d = this.derive.uniforms;
      d.uH.value = rtH.texture; d.uRes.value = size; d.uStrength.value = def.strength || 1; d.uWrap.value = repeat ? 1 : 0;
      if (def.normal) {
        d.uMode.value = 0;
        const rtN = this._target(size, false, repeat);
        this._render(rtN, this.derive);
        set.normalMap = rtN.texture;
      }
      if (def.orm) {
        d.uMode.value = 1;
        const rtO = this._target(size, false, repeat);
        this._render(rtO, this.derive);
        set.ormMap = rtO.texture;
      }
    }
    for (const t of [set.map, set.normalMap, set.ormMap]) {
      if (!t) continue;
      t.name = name;
      if (repeat) t.repeat.set(1 / def.worldSize, 1 / def.worldSize);
    }
    this.cache.set(name, set);
    return set;
  }

  /** بعد التوليد: نحرّر الشيدرات وصور الارتفاع المؤقتة */
  finish() {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    for (const rt of this.hTargets.values()) rt.dispose();
    this.hTargets.clear();
  }

  /** نص على لوحة (توقيع، خط عربي) — Canvas */
  textTexture({ width = 2048, height = 1024, draw }) {
    const cv = document.createElement('canvas');
    cv.width = width; cv.height = height;
    const ctx = cv.getContext('2d');
    draw(ctx, width, height);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(this.maxAniso, 8);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  dispose() {
    for (const rt of this.targets) rt.dispose();
    this.targets = [];
    this.cache.clear();
    this.finish();
    this.derive.dispose();
    this.quad.geometry.dispose();
  }
}
