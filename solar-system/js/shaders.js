/* ============================================================================
 *  shaders.js — كل برامج GLSL
 *  ---------------------------------------------------------------------------
 *  كل الـ ShaderMaterial هنا تدعم logarithmicDepthBuffer عبر chunks الخاصة
 *  بـ three.js، وتخرج ألواناً خطية HDR؛ التحويل اللوني (ACES + sRGB) يتم في
 *  OutputPass بنهاية سلسلة EffectComposer.
 * ========================================================================== */

/* ------------------------------------------------------------------ ضجيج */
export const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
// Value noise مع المشتقات التحليلية (Inigo Quilez) → (قيمة [-1,1], التدرج)
vec4 vnoised(vec3 x) {
  vec3 i = floor(x);
  vec3 w = fract(x);
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  float a = hash13(i + vec3(0.0, 0.0, 0.0));
  float b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0));
  float d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0));
  float f = hash13(i + vec3(1.0, 0.0, 1.0));
  float g = hash13(i + vec3(0.0, 1.0, 1.0));
  float h = hash13(i + vec3(1.0, 1.0, 1.0));
  float k0 = a, k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d;
  float k5 = a - c - e + g, k6 = a - b - e + f, k7 = -a + b + c - d + e - f - g + h;
  float v = k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 dv = du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                      k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                      k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(-1.0 + 2.0 * v, 2.0 * dv);
}
// Simplex noise 3D (Stefan Gustavson / Ashima Arts, MIT)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    s += a * snoise(p); n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / n;
}
float ridged(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    float r = 1.0 - abs(snoise(p));
    s += a * r * r; n += a;
    p = p * 2.07 + vec3(3.3, 1.1, 7.7);
    a *= 0.5;
  }
  return s / n;
}
// Worley (cellular): F1, معرّف الخلية، F2
vec3 worley(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash33(ip + g);
    vec3 r = g + o - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash13(ip + g + 17.0); }
    else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), id, sqrt(d2));
}
`;

/* ------------------------------------------------------ دوال الإضاءة المشتركة */
export const GLSL_LIGHT = /* glsl */ `
// نسبة قرص الشمس المحجوب بقرص جسم آخر (أنصاف أقطار زاوية rs, ro وفصل d)
float discOverlap(float rs, float ro, float d) {
  if (d >= rs + ro) return 0.0;
  if (d <= abs(ro - rs)) return ro >= rs ? 1.0 : (ro * ro) / (rs * rs);
  float rs2 = rs * rs, ro2 = ro * ro;
  float a1 = rs2 * acos(clamp((d * d + rs2 - ro2) / (2.0 * d * rs), -1.0, 1.0));
  float a2 = ro2 * acos(clamp((d * d + ro2 - rs2) / (2.0 * d * ro), -1.0, 1.0));
  float a3 = 0.5 * sqrt(max(0.0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  return clamp((a1 + a2 - a3) / (PI * rs2), 0.0, 1.0);
}
// دالة شابمان التقريبية (Schüler 2012): كتلة الهواء النسبية من ارتفاع h باتجاه cosZ
float chapmanH(float X, float h, float cosZ) {
  float c = sqrt(X + h);
  float eh = exp(-h);
  if (cosZ >= 0.0) return c / (c * cosZ + 1.0) * eh;
  float x0 = sqrt(max(1.0 - cosZ * cosZ, 0.0)) * (X + h);
  float c0 = sqrt(x0);
  return min(2.0 * c0 * exp(min(X - x0, 60.0)) - c / (1.0 - c * cosZ) * eh, 1.0e9);
}
`;

/* =================================================== شيدر الكواكب والأقمار */
export const PLANET_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform mat4 uLocalToFrame;
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec3 vViewEast;
varying vec3 vViewNorth;
varying vec3 vObjPos;
varying vec3 vFramePos;
void main() {
  vUv = uv;
  vObjPos = normalize(position);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), vObjPos) + vec3(1e-6, 0.0, 0.0));
  vec3 north = cross(vObjPos, east);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  vViewEast = normalize((modelViewMatrix * vec4(east, 0.0)).xyz);
  vViewNorth = normalize((modelViewMatrix * vec4(north, 0.0)).xyz);
  vFramePos = (uLocalToFrame * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const PLANET_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
${GLSL_LIGHT}
uniform vec3 uSunViewPos;
uniform float uSunRadius;
uniform vec3 uSunColor;
uniform sampler2D uMap;
uniform vec2 uMapSize;
uniform float uLonOffset;
uniform float uLunar;
uniform float uMinnaert;
uniform float uBumpScale;
uniform float uDetail;
uniform float uDetailScale;
uniform vec3 uSunDirFrame;
uniform vec3 uCamFrame;
uniform float uOblate;
uniform float uExposureBoost;
#ifdef USE_NORMALMAP
uniform sampler2D uNormalMap;
uniform float uNormalScale;
#endif
#ifdef USE_BUMPMAP
uniform sampler2D uBumpMap;
uniform vec2 uBumpSize;
#endif
#ifdef USE_SPECMAP
uniform sampler2D uSpecMap;
#endif
#ifdef USE_NIGHT
uniform sampler2D uNightMap;
uniform float uNightIntensity;
#endif
#ifdef USE_CLOUDS
uniform sampler2D uCloudMap;
uniform float uCloudOffset;
uniform float uCloudShadow;
uniform float uCloudHeight;
#endif
#ifdef USE_RINGSHADOW
uniform sampler2D uRingMap;
uniform vec2 uRingTexRange;
#endif
#ifdef USE_ATMO
uniform vec3 uTauR;
uniform vec3 uTauM;
uniform float uHR;
uniform float uHM;
#endif
#if NUM_OCC > 0
uniform vec4 uOcc[NUM_OCC];
uniform vec3 uOccTint[NUM_OCC];
#endif
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec3 vViewEast;
varying vec3 vViewNorth;
varying vec3 vObjPos;
varying vec3 vFramePos;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

#ifdef USE_ATMO
vec3 atmoTransmittance(float mu, float pathFrac) {
  float chR = chapmanH(1.0 / uHR, 0.0, mu);
  float chM = chapmanH(1.0 / uHM, 0.0, mu);
  return exp(-(uTauR * chR + uTauM * 1.1 * chM) * pathFrac);
}
#endif

void main() {
  #include <logdepthbuf_fragment>
  vec2 uv = vec2(vUv.x + uLonOffset, vUv.y);
  vec3 N = normalize(vViewNormal);
  vec3 E = normalize(vViewEast);
  vec3 Nn = normalize(vViewNorth);
  vec3 V = normalize(-vViewPos);
  vec3 toSun = uSunViewPos - vViewPos;
  float sunDist = length(toSun);
  vec3 L = toSun / sunDist;
  float NdLgeo = dot(N, L);
  float cosLat = max(sqrt(max(1.0 - vObjPos.y * vObjPos.y, 0.0)), 0.03);

  vec4 tex = texture2D(uMap, uv);
  vec3 albedo = tex.rgb;
  vec3 Nb = N;

  // ---------- تضاريس (Bump / Normal map)
  #if defined(BUMP_FROM_MAP) || defined(BUMP_FROM_ALPHA)
  {
    vec2 du = vec2(1.0 / uMapSize.x, 0.0);
    vec2 dv = vec2(0.0, 1.0 / uMapSize.y);
    #ifdef BUMP_FROM_ALPHA
      float hE = texture2D(uMap, uv + du).a, hW = texture2D(uMap, uv - du).a;
      float hN = texture2D(uMap, uv + dv).a, hS = texture2D(uMap, uv - dv).a;
    #else
      float hE = lum(texture2D(uMap, uv + du).rgb), hW = lum(texture2D(uMap, uv - du).rgb);
      float hN = lum(texture2D(uMap, uv + dv).rgb), hS = lum(texture2D(uMap, uv - dv).rgb);
    #endif
    float sx = (hE - hW) * uMapSize.x / (4.0 * PI * cosLat);
    float sy = (hN - hS) * uMapSize.y / (2.0 * PI);
    Nb = normalize(Nb - uBumpScale * (sx * E + sy * Nn));
  }
  #endif
  #ifdef USE_BUMPMAP
  {
    vec2 du = vec2(1.0 / uBumpSize.x, 0.0);
    vec2 dv = vec2(0.0, 1.0 / uBumpSize.y);
    float sx = (texture2D(uBumpMap, uv + du).r - texture2D(uBumpMap, uv - du).r) * uBumpSize.x / (4.0 * PI * cosLat);
    float sy = (texture2D(uBumpMap, uv + dv).r - texture2D(uBumpMap, uv - dv).r) * uBumpSize.y / (2.0 * PI);
    Nb = normalize(Nb - uBumpScale * (sx * E + sy * Nn));
  }
  #endif
  #ifdef USE_NORMALMAP
  {
    vec3 nm = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
    nm.xy *= uNormalScale;
    Nb = normalize(nm.x * E + nm.y * Nn + max(nm.z, 0.05) * Nb);
  }
  #endif

  // ---------- تفاصيل دقيقة عند الاقتراب الشديد (تظهر فقط لما تتكبّر الصورة)
  #ifdef USE_DETAIL
  if (uDetail > 0.0) {
    float tpp = length(fwidth(uv * uMapSize));
    float dm = uDetail * (1.0 - smoothstep(0.3, 1.1, tpp));
    if (dm > 0.002) {
      vec3 q = vObjPos * uDetailScale;
      vec4 n1 = vnoised(q);
      vec4 n2 = vnoised(q * 3.17 + 11.0);
      vec4 n3 = vnoised(q * 9.73 + 5.0);
      float n = n1.x * 0.55 + n2.x * 0.3 + n3.x * 0.15;
      vec3 g = (n1.yzw * 0.55 + n2.yzw * 0.3 * 3.17 + n3.yzw * 0.15 * 9.73);
      vec3 eo = normalize(cross(vec3(0.0, 1.0, 0.0), vObjPos) + vec3(1e-6, 0.0, 0.0));
      vec3 no = cross(vObjPos, eo);
      float ge = dot(g, eo), gn = dot(g, no);
      Nb = normalize(Nb - dm * 0.035 * (ge * E + gn * Nn));
      albedo *= 1.0 + dm * 0.16 * n;
    }
  }
  #endif

  // ---------- الإضاءة
  float terminator = smoothstep(-0.03, 0.06, NdLgeo + 0.02);
  float mu0 = max(dot(Nb, L), 0.0) * terminator;
  float muv = max(dot(N, V), 1e-3);
  float diffuse = mu0;
  if (uLunar > 0.0) {
    float ls = 2.0 * mu0 / (mu0 + muv + 1e-4);
    diffuse = mix(mu0, ls * terminator, uLunar);
  }
  if (uMinnaert != 1.0) {
    diffuse = pow(mu0, uMinnaert) * pow(muv, uMinnaert - 1.0);
  }

  // ---------- الكسوف والخسوف (ظل الأجسام الأخرى مع منطقة شبه الظل)
  float sunVis = 1.0;
  vec3 tint = vec3(0.0);
  #if NUM_OCC > 0
  {
    float rs = asin(min(uSunRadius / sunDist, 1.0));
    for (int k = 0; k < NUM_OCC; k++) {
      vec3 toOcc = uOcc[k].xyz - vViewPos;
      float dO = length(toOcc);
      if (dO < 1e-6 || dot(toOcc, L) <= 0.0 || dO >= sunDist) continue;
      vec3 od = toOcc / dO;
      float ro = asin(min(uOcc[k].w / dO, 1.0));
      float sep = 2.0 * asin(clamp(length(L - od) * 0.5, 0.0, 1.0));
      float f = discOverlap(rs, ro, sep);
      sunVis -= f;
      tint += f * uOccTint[k];
    }
    sunVis = clamp(sunVis, 0.0, 1.0);
  }
  #endif

  // ---------- ظل الحلقات على الكوكب
  float ringShadow = 1.0;
  #ifdef USE_RINGSHADOW
  {
    vec3 sf = uSunDirFrame;
    if (abs(sf.y) > 1e-5) {
      float t = -vFramePos.y / sf.y;
      if (t > 0.0) {
        vec3 hit = vFramePos + sf * t;
        float r = length(hit.xz);
        float u = (r - uRingTexRange.x) / (uRingTexRange.y - uRingTexRange.x);
        if (u > 0.0 && u < 1.0) {
          float a = texture2D(uRingMap, vec2(u, 0.5)).a;
          ringShadow = 1.0 - 0.92 * a;
        }
      }
    }
  }
  #endif

  // ---------- الغلاف الجوي: لون ضوء الشمس عند السطح (غروب) وشفافية الرؤية
  vec3 sunT = vec3(1.0);
  vec3 viewT = vec3(1.0);
  #ifdef USE_ATMO
  {
    vec3 sp = vec3(vFramePos.x, vFramePos.y / uOblate, vFramePos.z);
    vec3 up = normalize(sp);
    vec3 cam = vec3(uCamFrame.x, uCamFrame.y / uOblate, uCamFrame.z);
    vec3 sdir = normalize(vec3(uSunDirFrame.x, uSunDirFrame.y / uOblate, uSunDirFrame.z));
    sunT = atmoTransmittance(dot(up, sdir), 1.0);
    float camAlt = length(cam) - 1.0;
    float frac = 1.0 - exp(-max(camAlt, 0.0) / uHR);
    viewT = atmoTransmittance(max(dot(up, normalize(cam - sp)), 0.0), frac);
  }
  #endif

  // ---------- ظلال الغيوم على الأرض
  float cloudA = 0.0;
  #ifdef USE_CLOUDS
  {
    float se = dot(L, E), sn = dot(L, Nn);
    float k = uCloudHeight / max(NdLgeo, 0.15);
    vec2 off = vec2(se * k / (2.0 * PI * cosLat), sn * k / PI);
    cloudA = texture2D(uCloudMap, vec2(uv.x - uCloudOffset, uv.y) + off).r;
    ringShadow *= 1.0 - uCloudShadow * cloudA;
    cloudA = texture2D(uCloudMap, vec2(uv.x - uCloudOffset, uv.y)).r;
  }
  #endif

  vec3 light = uSunColor * (sunVis * ringShadow) * sunT + uSunColor * tint;
  vec3 col = albedo * diffuse * light;

  // ---------- انعكاس الشمس على المحيطات (GGX)
  #if defined(USE_SPECMAP) || defined(SPEC_FROM_COLOR) || defined(SPEC_FROM_ALPHA)
  {
    #if defined(USE_SPECMAP)
      float water = texture2D(uSpecMap, uv).r;
    #elif defined(SPEC_FROM_ALPHA)
      float water = 1.0 - smoothstep(0.47, 0.5, tex.a);
    #else
      float water = smoothstep(0.015, 0.06, albedo.b - max(albedo.r, albedo.g * 0.85)) * (1.0 - smoothstep(0.08, 0.2, lum(albedo)));
    #endif
    if (water > 0.01 && mu0 > 0.0) {
      vec3 H = normalize(L + V);
      vec3 Nw = normalize(mix(N, Nb, 0.15));
      float NdH = max(dot(Nw, H), 0.0);
      float VdH = max(dot(V, H), 0.0);
      float a2 = 0.075 * 0.075;
      float dd = NdH * NdH * (a2 - 1.0) + 1.0;
      float D = a2 / (PI * dd * dd);
      float F = 0.02 + 0.98 * pow(1.0 - VdH, 5.0);
      float NdL = max(dot(Nw, L), 0.0);
      float G = 0.5 / (NdL * sqrt(muv * muv * (1.0 - a2) + a2) + muv * sqrt(NdL * NdL * (1.0 - a2) + a2) + 1e-5);
      col += water * D * F * G * NdL * terminator * light * (1.0 - 0.7 * cloudA);
      col *= 1.0 - water * 0.15;
    }
  }
  #endif

  // ---------- أضواء المدن: فقط على الجهة المظلمة
  #ifdef USE_NIGHT
  {
    float nightMask = 1.0 - smoothstep(-0.14, 0.05, NdLgeo);
    vec3 city = max(texture2D(uNightMap, uv).rgb - 0.012, 0.0);
    col += city * uNightIntensity * nightMask * (1.0 - 0.45 * cloudA);
  }
  #endif

  col *= viewT;
  col *= uExposureBoost;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ================================================== طبقة الغيوم (الأرض/الزهرة) */
export const CLOUD_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
${GLSL_LIGHT}
uniform vec3 uSunViewPos;
uniform float uSunRadius;
uniform vec3 uSunColor;
uniform sampler2D uMap;
uniform vec2 uMapSize;
uniform float uOpacity;
uniform float uDetail;
uniform float uDetailScale;
uniform vec3 uSunDirFrame;
uniform vec3 uCamFrame;
uniform float uExposureBoost;
#ifdef USE_ATMO
uniform vec3 uTauR;
uniform vec3 uTauM;
uniform float uHR;
uniform float uHM;
#endif
#if NUM_OCC > 0
uniform vec4 uOcc[NUM_OCC];
uniform vec3 uOccTint[NUM_OCC];
#endif
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec3 vViewEast;
varying vec3 vViewNorth;
varying vec3 vObjPos;
varying vec3 vFramePos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vViewNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vViewPos);
  vec3 toSun = uSunViewPos - vViewPos;
  float sunDist = length(toSun);
  vec3 L = toSun / sunDist;
  vec4 t = texture2D(uMap, vUv);
  #ifdef ALPHA_FROM_LUM
    float a = t.r;
    vec3 albedo = vec3(0.92);
  #else
    float a = 1.0;
    vec3 albedo = t.rgb;
  #endif
  #ifdef USE_DETAIL
  if (uDetail > 0.0) {
    float tpp = length(fwidth(vUv * uMapSize));
    float dm = uDetail * (1.0 - smoothstep(0.3, 1.1, tpp));
    if (dm > 0.002) {
      float n = vnoised(vObjPos * uDetailScale).x * 0.6 + vnoised(vObjPos * uDetailScale * 3.3 + 4.0).x * 0.4;
      a = clamp(a * (1.0 + dm * 0.9 * n), 0.0, 1.0);
    }
  }
  #endif
  a *= uOpacity;
  if (a < 0.004) discard;
  float NdL = dot(normalize(vViewNormal), L);
  float lit = smoothstep(-0.08, 0.12, NdL) * (0.35 + 0.65 * max(NdL, 0.0));
  // ليلاً الغيوم شبه غير مرئية وضوء المدن ينفذ من خلالها
  a *= mix(0.3, 1.0, smoothstep(-0.25, 0.05, NdL));
  float sunVis = 1.0;
  vec3 tint = vec3(0.0);
  #if NUM_OCC > 0
  {
    float rs = asin(min(uSunRadius / sunDist, 1.0));
    for (int k = 0; k < NUM_OCC; k++) {
      vec3 toOcc = uOcc[k].xyz - vViewPos;
      float dO = length(toOcc);
      if (dO < 1e-6 || dot(toOcc, L) <= 0.0 || dO >= sunDist) continue;
      float ro = asin(min(uOcc[k].w / dO, 1.0));
      float sep = 2.0 * asin(clamp(length(L - toOcc / dO) * 0.5, 0.0, 1.0));
      float f = discOverlap(rs, ro, sep);
      sunVis -= f;
      tint += f * uOccTint[k];
    }
    sunVis = clamp(sunVis, 0.0, 1.0);
  }
  #endif
  vec3 sunT = vec3(1.0);
  #ifdef USE_ATMO
  {
    vec3 up = normalize(vFramePos);
    float mu = dot(up, uSunDirFrame);
    float chR = chapmanH(1.0 / uHR, 0.0, mu);
    float chM = chapmanH(1.0 / uHM, 0.0, mu);
    sunT = exp(-(uTauR * chR + uTauM * 1.1 * chM) * 0.6);
  }
  #endif
  vec3 col = albedo * lit * (uSunColor * sunVis * sunT + uSunColor * tint) * uExposureBoost;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ========================================== الغلاف الجوي (تشتت رايلي + مي) */
export const ATMO_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uTop;
varying vec3 vLocal;
void main() {
  vLocal = position * uTop;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const ATMO_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_LIGHT}
uniform vec3 uCamLocal;
uniform vec3 uSunDirLocal;
uniform float uTop;
uniform float uHR;
uniform float uHM;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uG;
uniform float uIntensity;
uniform float uInside;
uniform float uSunVis;
uniform vec3 uSunColor;
uniform int uSteps;
varying vec3 vLocal;
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  vec3 pc = ro - b * rd;
  float h = r * r - dot(pc, pc);
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vLocal - uCamLocal);
  vec3 ro;
  float tEnd;
  if (uInside > 0.5) {
    ro = uCamLocal;
    tEnd = raySphere(ro, rd, uTop).y;
  } else {
    ro = vLocal;
    tEnd = max(raySphere(ro, rd, uTop).y, 0.0);
  }
  vec2 tp = raySphere(ro, rd, 1.0);
  if (tp.x > 0.0) tEnd = min(tEnd, tp.x);
  if (tEnd <= 0.0) discard;
  float seg = tEnd / float(uSteps);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float XR = 1.0 / uHR, XM = 1.0 / uHM;
  for (int i = 0; i < 64; i++) {
    if (i >= uSteps) break;
    vec3 p = ro + rd * (seg * (float(i) + 0.5));
    float r = length(p);
    float h = max(r - 1.0, 0.0);
    float dR = exp(-h / uHR) * seg;
    float dM = exp(-h / uHM) * seg;
    odR += 0.5 * dR; odM += 0.5 * dM;
    float muS = dot(p / r, uSunDirLocal);
    float lR = chapmanH(XR, h / uHR, muS) * uHR;
    float lM = chapmanH(XM, h / uHM, muS) * uHM;
    vec3 att = exp(-(uBetaR * (odR + lR) + uBetaM * 1.1 * (odM + lM)));
    sumR += dR * att;
    sumM += dM * att;
    odR += 0.5 * dR; odM += 0.5 * dM;
  }
  float mu = dot(rd, uSunDirLocal);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = uG, g2 = g * g;
  float phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
  vec3 col = uIntensity * uSunVis * uSunColor * (sumR * uBetaR * phR + sumM * uBetaM * phM);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ================================================================ الحلقات */
export const RING_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vFramePos;
varying vec3 vViewPos;
void main() {
  vFramePos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const RING_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uRingMap;
uniform vec2 uTexRange;
uniform vec3 uSunDirFrame;
uniform vec3 uCamFrame;
uniform float uOblate;
uniform vec3 uSunColor;
uniform float uBrightness;
uniform float uPenumbra;
varying vec3 vFramePos;
varying vec3 vViewPos;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vFramePos.xz);
  float u = (r - uTexRange.x) / (uTexRange.y - uTexRange.x);
  if (u < 0.0 || u > 1.0) discard;
  vec4 t = texture2D(uRingMap, vec2(u, 0.5));
  float alpha = t.a;
  if (alpha < 0.002) discard;

  // ظل الكوكب (إهليلجي مفلطح) على الحلقات
  vec3 p = vec3(vFramePos.x, vFramePos.y / uOblate, vFramePos.z);
  vec3 d = normalize(vec3(uSunDirFrame.x, uSunDirFrame.y / uOblate, uSunDirFrame.z));
  float tc = -dot(p, d);
  float shadow = 1.0;
  if (tc > 0.0) {
    float dist = length(p + d * tc);
    shadow = smoothstep(1.0 - uPenumbra, 1.0 + uPenumbra, dist);
  }

  // الوجه المضاء أم الوجه الخلفي (الضوء ينفذ من خلال الفجوات)
  float sunSide = uSunDirFrame.y >= 0.0 ? 1.0 : -1.0;
  float camSide = (uCamFrame.y - vFramePos.y) >= 0.0 ? 1.0 : -1.0;
  float mu0 = abs(uSunDirFrame.y);
  vec3 col;
  if (sunSide == camSide) {
    col = t.rgb * (0.12 + 0.88 * smoothstep(0.0, 0.25, mu0));
  } else {
    col = t.rgb * (1.0 - alpha) * 1.4 + t.rgb * 0.04;
  }
  // تضعيف عند زوايا النظر الحادة جداً لمنع الوميض
  vec3 V = normalize(-vViewPos);
  float graze = smoothstep(0.0, 0.02, abs(normalize(uCamFrame - vFramePos).y));
  col *= uSunColor * shadow * uBrightness;
  gl_FragColor = vec4(col, alpha * mix(0.35, 1.0, graze));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ================================================================ الشمس */
export const SUN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vObjPos;
varying vec3 vViewNormal;
varying vec3 vViewPos;
void main() {
  vUv = uv;
  vObjPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const SUN_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
uniform float uTime;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uIntensity;
uniform float uDetail;
varying vec2 vUv;
varying vec3 vObjPos;
varying vec3 vViewNormal;
varying vec3 vViewPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObjPos);
  float mu = clamp(dot(normalize(vViewNormal), normalize(-vViewPos)), 0.0, 1.0);
  float t = uTime;
  // حبيبات الحمل الحراري (Granulation) + الحبيبات الفائقة
  vec3 w1 = worley(p * 70.0 + vec3(0.0, t * 0.015, 0.0));
  float cells = smoothstep(0.0, 0.5, w1.z - w1.x);
  vec3 w2 = worley(p * 260.0 + vec3(t * 0.03, 0.0, 0.0));
  float fine = smoothstep(0.0, 0.45, w2.z - w2.x);
  float gran = mix(0.72, 1.08, cells) * mix(0.9, 1.04, fine * uDetail + (1.0 - uDetail) * 0.5);
  float n = fbm(p * 5.0 + vec3(t * 0.004), 5);
  // البقع الشمسية في أحزمة النشاط (±5° إلى ±35°)
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float belt = smoothstep(0.08, 0.16, abs(lat)) * (1.0 - smoothstep(0.5, 0.65, abs(lat)));
  float s = snoise(p * 7.0 + vec3(13.1, 2.7, 5.3) + vec3(t * 0.002));
  float s2 = snoise(p * 21.0 + 3.7);
  float spotField = s * 0.75 + s2 * 0.25;
  float umbra = smoothstep(0.66, 0.74, spotField) * belt;
  float penumbra = smoothstep(0.56, 0.66, spotField) * belt;
  float faculae = smoothstep(0.42, 0.56, spotField) * belt * (1.0 - mu) * 0.3;
  vec3 base = vec3(1.0, 0.56, 0.2);
  if (uHasMap > 0.5) {
    vec3 m = texture2D(uMap, vUv).rgb;
    base = mix(base, m * vec3(1.25, 0.95, 0.7) * 1.4, 0.45);
  }
  // إظلام الأطراف (Limb darkening) — أقوى للأزرق
  vec3 limb = vec3(1.0) - vec3(0.42, 0.56, 0.72) * (1.0 - pow(mu, 0.9));
  vec3 col = base * gran * (0.92 + 0.12 * n) * limb;
  col *= 1.0 - 0.82 * umbra - 0.35 * (penumbra - umbra);
  col += vec3(1.0, 0.8, 0.5) * faculae;
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ======================================================= هالة الكورونا */
export const CORONA_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const CORONA_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
uniform float uTime;
uniform float uScale;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec2 q = (vUv - 0.5) * 2.0 * uScale;
  float r = length(q);
  float rr = max(r, 1.0);
  float ang = atan(q.y, q.x);
  vec3 sp = vec3(cos(ang) * 1.6, sin(ang) * 1.6, rr * 0.35 - uTime * 0.01);
  float streams = fbm(sp, 4) * 0.5 + 0.5;
  float fine = snoise(vec3(cos(ang) * 9.0, sin(ang) * 9.0, rr * 0.8 - uTime * 0.02)) * 0.5 + 0.5;
  float I = 0.6 * pow(rr, -5.0) + 0.3 * pow(rr, -2.2) * (0.45 + 0.9 * streams) * (0.8 + 0.4 * fine);
  I *= 1.0 - smoothstep(uScale * 0.55, uScale, r);
  vec3 col = mix(vec3(1.0, 0.92, 0.8), vec3(1.0, 0.66, 0.33), smoothstep(1.0, 3.0, rr)) * I * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ================================================ السماء: نجوم ودرب التبانة */
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = gl_Position.w * 0.999999;
}
`;

export const SKY_FRAG = /* glsl */ `
#include <common>
${GLSL_NOISE}
uniform sampler2D uSky;
uniform float uHasSky;
uniform mat3 uWorldToTex;
uniform float uIntensity;
uniform float uFlipX;
varying vec3 vDir;

// نجوم على شبكة ثنائية الأبعاد فوق أوجه مكعب (بدون قصّ عند حدود الخلايا)
vec3 starLayer(vec3 d, float scale, float density, float seed, float size) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 p = uv * scale;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  // حجم البكسل من الاتجاه المستمر (وليس من p) حتى لا تنفجر القيم عند حواف أوجه المكعب
  float px = max(length(fwidth(d)) * scale, 1e-4) * size;
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 c = ip + vec2(float(i), float(j));
    vec3 key = vec3(c, face * 131.0 + seed);
    if (hash13(key) > density) continue;
    vec2 sp = c + 0.15 + 0.7 * hash33(key * 1.37).xy;
    vec2 dv = p - sp;
    float mag = pow(hash13(key + 5.1), 9.0);
    float b = exp(-dot(dv, dv) / (px * px)) * (0.05 + 2.4 * mag);
    float tc = hash13(key + 9.7);
    vec3 tint = tc < 0.33 ? vec3(0.72, 0.82, 1.0) : (tc < 0.8 ? vec3(1.0, 0.97, 0.92) : vec3(1.0, 0.8, 0.58));
    acc += tint * b;
  }
  return acc;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 g = uWorldToTex * d;
  g.z *= uFlipX;
  vec3 col;
  if (uHasSky > 0.5) {
    float u = atan(g.z, g.x) * (0.5 / PI) + 0.5;
    float v = asin(clamp(g.y, -1.0, 1.0)) / PI + 0.5;
    vec2 uv = vec2(u, v);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    vec2 uv2 = vec2(fract(u + 0.5), v);
    vec2 dx2 = dFdx(uv2), dy2 = dFdy(uv2);
    if (abs(dx2.x) < abs(dx.x)) dx.x = dx2.x;
    if (abs(dy2.x) < abs(dy.x)) dy.x = dy2.x;
    col = textureGrad(uSky, uv, dx, dy).rgb;
  } else {
    // نجوم مولّدة + درب التبانة بالإحداثيات المجرّية الحقيقية
    float b = asin(clamp(g.y, -1.0, 1.0));
    float l = atan(-g.z, g.x);
    // كثافة واقعية: بضعة آلاف نجم ساطع + عشرات الآلاف الخافتة (أكثف قرب مستوى المجرة)
    float gal = exp(-b * b / 0.04);
    col = starLayer(d, 40.0, 0.07, 1.0, 0.75) * 1.2;
    col += starLayer(d, 110.0, 0.05, 7.0, 0.7) * 0.55;
    col += starLayer(d, 300.0, 0.015 + 0.06 * gal, 13.0, 0.65) * 0.35;
    float band = exp(-b * b / 0.018);
    float bulge = exp(-(l * l) / 0.35 - b * b / 0.05);
    float clouds = fbm(vec3(g.x * 3.0, g.y * 9.0, g.z * 3.0) + 2.0, 6) * 0.5 + 0.5;
    float dust = smoothstep(0.35, 0.75, fbm(vec3(g.x * 6.0, g.y * 22.0, g.z * 6.0) + 9.0, 5) * 0.5 + 0.5) * exp(-b * b / 0.0035);
    float mw = (band * (0.35 + 0.9 * clouds) + bulge * 1.4) * (1.0 - 0.75 * dust);
    col += mw * mix(vec3(0.55, 0.62, 0.85), vec3(1.0, 0.86, 0.66), clamp(bulge * 2.0, 0.0, 1.0)) * 0.065;
  }
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ============================================================ خطوط المدارات */
export const ORBIT_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aT;
uniform vec3 uBodyLocal;
uniform float uFade;
uniform float uOpacity;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dB = length(position - uBodyLocal);
  vA = uOpacity * mix(0.16, 1.0, pow(aT, 1.3)) * smoothstep(uFade, uFade * 5.0, dB);
  #include <logdepthbuf_vertex>
}
`;

export const ORBIT_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uColor, vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ======================================== حزام الكويكبات: حساب كبلر في الـ GPU */
export const GLSL_ASTEROID_ORBIT = /* glsl */ `
attribute vec4 aOrbitA; // a(AU), e, i(rad), Ω(rad)
attribute vec4 aOrbitB; // ω(rad), M0(rad), n(rad/day), radius(km)
uniform float uDays;
uniform float uScaleT;
uniform float uAU;
uniform float uSunR;
uniform vec3 uVisDist;   // offset, factor, exponent
uniform vec3 uVisRad;    // earthR(×R☉), exponent, earthRadiusKm
vec3 asteroidOrbitPos() {
  float a = aOrbitA.x;
  float e = aOrbitA.y;
  float inc = aOrbitA.z;
  float node = aOrbitA.w;
  float w = aOrbitB.x;
  float M = aOrbitB.y + aOrbitB.z * uDays;
  M = mod(M + PI, 2.0 * PI) - PI;
  float E = M + e * sin(M);
  for (int k = 0; k < 6; k++) E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xp = a * (cos(E) - e);
  float yp = a * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(w), sw = sin(w), cO = cos(node), sO = sin(node), ci = cos(inc), si = sin(inc);
  vec3 ecl = vec3((cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
                  (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
                  (sw * si) * xp + (cw * si) * yp);
  float rAU = length(ecl);
  float rReal = rAU * uAU;
  float rVis = uSunR * (uVisDist.x + uVisDist.y * pow(rAU, uVisDist.z));
  float rD = exp(mix(log(rReal), log(rVis), uScaleT));
  ecl *= rD / rAU;
  return vec3(ecl.x, ecl.z, -ecl.y);
}
float asteroidRadius() {
  float R = aOrbitB.w;
  float Rv = uSunR * uVisRad.x * pow(R / uVisRad.z, uVisRad.y);
  return exp(mix(log(R), log(Rv), uScaleT));
}
`;

export const ASTEROID_POINTS_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_ASTEROID_ORBIT}
uniform float uPointSize;
uniform float uPixelScale;
varying float vA;
varying float vShade;
void main() {
  vec3 pos = asteroidOrbitPos();
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float projR = asteroidRadius() * uPixelScale / max(-mv.z, 1e-3);
  vA = (1.0 - smoothstep(0.6, 2.0, projR)) * 0.17;
  vShade = 0.6 + 0.4 * fract(aOrbitB.y * 7.31);
  gl_PointSize = uPointSize;
  #include <logdepthbuf_vertex>
}
`;

export const ASTEROID_POINTS_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vA;
varying float vShade;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vA < 0.01) discard;
  gl_FragColor = vec4(vec3(0.5, 0.46, 0.42) * vShade, vA * (1.0 - smoothstep(0.25, 0.5, d)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ===================================== توليد الصور بالكود (Procedural bake) */
export const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BAKE_FRAG = /* glsl */ `
#include <common>
${GLSL_NOISE}
uniform int uType;
uniform float uSeed;
varying vec2 vUv;

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
vec3 dirFromUv(vec2 uv) {
  float lon = (uv.x - 0.5) * 2.0 * PI;
  float lat = (uv.y - 0.5) * PI;
  return vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
}
// فوهات صدمية: حوض + حافة مرتفعة + مقذوفات
float craters(vec3 p, float freq, float seed, float coverage) {
  vec3 w = worley(p * freq + seed);
  float present = step(1.0 - coverage, fract(w.y * 13.7));
  float r = mix(0.16, 0.44, fract(w.y * 7.3));
  float d = w.x / r;
  float bowl = d < 1.0 ? (d * d - 1.0) : 0.0;
  float rim = exp(-pow((d - 1.0) / 0.22, 2.0)) * 0.32;
  float ejecta = d > 1.0 ? exp(-(d - 1.0) * 3.0) * 0.06 : 0.0;
  return present * (bowl * 0.8 + rim + ejecta);
}
float crateredHeight(vec3 d, float seed, float density) {
  float h = fbm(d * 2.2 + seed, 6) * 0.35;
  h += craters(d, 4.0, seed, 0.5 * density) * 0.55;
  h += craters(d, 9.0, seed + 3.0, 0.6 * density) * 0.35;
  h += craters(d, 21.0, seed + 7.0, 0.7 * density) * 0.2;
  h += craters(d, 48.0, seed + 11.0, 0.8 * density) * 0.1;
  h += craters(d, 110.0, seed + 19.0, 0.8 * density) * 0.05;
  return h;
}
float earthLand(vec3 d) {
  float c = fbm(d * 1.3 + vec3(uSeed), 7) + 0.25 * fbm(d * 4.2 + vec3(5.0 + uSeed), 5);
  return c;
}
vec4 bandedGiant(vec3 d, vec3 cols[8], float lats[8], float turb, float seed) {
  float lat = asin(clamp(d.y, -1.0, 1.0)) * 180.0 / PI;
  float warp = fbm(vec3(d.x * 2.0, d.y * 14.0, d.z * 2.0) + seed, 5) * turb;
  float l = lat + warp;
  vec3 c = cols[0];
  for (int i = 1; i < 8; i++) {
    c = mix(c, cols[i], smoothstep(lats[i - 1], lats[i], l));
  }
  float streak = fbm(vec3(d.x * 3.0, d.y * 60.0, d.z * 3.0) + seed * 2.0, 5);
  c *= 0.93 + 0.12 * streak;
  return vec4(c, 0.5);
}

vec4 genMercury(vec3 d) {
  float h = crateredHeight(d, uSeed, 1.0);
  float tone = fbm(d * 3.0 + 4.0, 5);
  vec3 c = mix(srgb(vec3(0.36, 0.34, 0.32)), srgb(vec3(0.62, 0.59, 0.55)), smoothstep(-0.5, 0.5, h + tone * 0.3));
  float rays = smoothstep(0.75, 0.95, worley(d * 7.0 + 31.0).y) * smoothstep(0.6, 0.0, worley(d * 7.0 + 31.0).x);
  c += rays * 0.05;
  return vec4(c, clamp(h * 0.5 + 0.5, 0.0, 1.0));
}
vec4 genMoon(vec3 d) {
  float h = crateredHeight(d, uSeed, 1.0);
  float maria = smoothstep(0.05, 0.25, fbm(d * 1.4 + 2.0, 5) + (d.x > 0.0 ? 0.12 : -0.15));
  vec3 high = srgb(vec3(0.66, 0.65, 0.63));
  vec3 mare = srgb(vec3(0.3, 0.3, 0.31));
  vec3 c = mix(high, mare, maria);
  c *= 0.85 + 0.3 * smoothstep(-0.6, 0.6, h);
  return vec4(c, clamp(h * 0.5 + 0.5 - maria * 0.15, 0.0, 1.0));
}
vec4 genMars(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float h = crateredHeight(d, uSeed, 0.6) * 0.7 + fbm(d * 1.8 + 3.0, 6) * 0.6;
  float dark = smoothstep(0.0, 0.3, fbm(d * 2.4 + 11.0, 6) - 0.05 * sin(lat * 3.0));
  vec3 c = mix(srgb(vec3(0.76, 0.43, 0.25)), srgb(vec3(0.38, 0.22, 0.14)), dark * 0.85);
  c = mix(c, srgb(vec3(0.85, 0.62, 0.45)), smoothstep(0.4, 0.8, fbm(d * 6.0 + 1.0, 4)) * 0.3);
  float cap = smoothstep(1.27, 1.33, abs(lat) + fbm(d * 8.0, 4) * 0.06);
  c = mix(c, srgb(vec3(0.95, 0.93, 0.9)), cap);
  // أخدود يشبه وادي مارينر
  float canyon = exp(-pow((lat + 0.14 + fbm(d * 6.0, 3) * 0.02) / 0.012, 2.0)) * smoothstep(0.2, 0.6, -d.z) * smoothstep(-0.2, 0.3, d.x);
  c *= 1.0 - canyon * 0.35;
  return vec4(c, clamp(h * 0.5 + 0.5 - canyon * 0.3, 0.0, 1.0));
}
vec4 genVenus(vec3 d) {
  float h = ridged(d * 3.0 + 7.0, 6) * 0.6 + fbm(d * 1.5, 5) * 0.4;
  vec3 c = mix(srgb(vec3(0.35, 0.22, 0.12)), srgb(vec3(0.78, 0.56, 0.32)), smoothstep(0.1, 0.8, h));
  return vec4(c, clamp(h, 0.0, 1.0));
}
vec4 genVenusClouds(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  float chevron = lon + abs(lat) * 1.8;
  vec3 q = vec3(cos(chevron) * 1.5, lat * 3.0, sin(chevron) * 1.5);
  float n = fbm(q + vec3(uSeed), 6);
  float band = fbm(vec3(d.x, d.y * 7.0, d.z) * 2.0 + 3.0, 5);
  vec3 c = mix(srgb(vec3(0.84, 0.72, 0.5)), srgb(vec3(0.98, 0.93, 0.8)), smoothstep(-0.5, 0.6, n * 0.7 + band * 0.4));
  c = mix(c, srgb(vec3(0.95, 0.92, 0.85)), smoothstep(1.1, 1.45, abs(lat)));
  return vec4(c, 1.0);
}
vec4 genEarth(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float alat = abs(lat) * 180.0 / PI;
  float c = earthLand(d);
  float sea = 0.06;
  float land = smoothstep(sea, sea + 0.01, c);
  float elev = clamp((c - sea) * 2.5, 0.0, 1.0);
  float moist = fbm(d * 3.0 + 21.0, 5) * 0.5 + 0.5;
  float desertBelt = exp(-pow((alat - 24.0) / 9.0, 2.0));
  vec3 forest = srgb(vec3(0.12, 0.26, 0.09));
  vec3 grass = srgb(vec3(0.33, 0.4, 0.18));
  vec3 desert = srgb(vec3(0.78, 0.66, 0.45));
  vec3 tundra = srgb(vec3(0.42, 0.4, 0.33));
  vec3 rock = srgb(vec3(0.45, 0.4, 0.35));
  vec3 lc = mix(grass, forest, smoothstep(0.4, 0.7, moist) * (1.0 - desertBelt));
  lc = mix(lc, desert, smoothstep(0.35, 0.7, desertBelt * (1.2 - moist)));
  lc = mix(lc, tundra, smoothstep(50.0, 65.0, alat));
  lc = mix(lc, rock, smoothstep(0.55, 0.85, elev));
  float depth = clamp((sea - c) * 3.0, 0.0, 1.0);
  vec3 oc = mix(srgb(vec3(0.05, 0.22, 0.38)), srgb(vec3(0.01, 0.05, 0.16)), smoothstep(0.0, 0.4, depth));
  vec3 col = mix(oc, lc, land);
  float ice = smoothstep(66.0, 74.0, alat + fbm(d * 6.0, 4) * 6.0);
  col = mix(col, srgb(vec3(0.93, 0.95, 0.97)), ice);
  float h = land > 0.5 ? 0.5 + elev * 0.5 : 0.45 - depth * 0.3;
  return vec4(col, h);
}
vec4 genEarthClouds(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec3 q = d * 2.2 + vec3(uSeed);
  vec3 warp = vec3(fbm(q + 1.0, 4), fbm(q + 7.0, 4), fbm(q + 13.0, 4));
  float n = fbm(q * 1.6 + warp * 1.4, 7);
  float bands = 0.25 * exp(-pow(lat / 0.12, 2.0)) + 0.3 * exp(-pow((abs(lat) - 0.95) / 0.25, 2.0));
  float c = smoothstep(0.02, 0.55, n * 0.9 + bands - 0.05 * exp(-pow((abs(lat) - 0.45) / 0.15, 2.0)));
  return vec4(vec3(c), c);
}
vec4 genEarthNight(vec3 d) {
  float c = earthLand(d);
  float land = smoothstep(0.065, 0.08, c);
  float coast = exp(-pow((c - 0.08) / 0.05, 2.0));
  float alat = abs(asin(clamp(d.y, -1.0, 1.0))) * 180.0 / PI;
  float pop = smoothstep(0.25, 0.7, fbm(d * 5.0 + 41.0, 5) * 0.5 + 0.5 + coast * 0.25) * (1.0 - smoothstep(55.0, 68.0, alat));
  vec3 w = worley(d * 160.0 + 3.0);
  float city = smoothstep(0.25, 0.0, w.x) * step(0.6, w.y) * pop;
  vec3 w2 = worley(d * 520.0 + 9.0);
  float town = smoothstep(0.2, 0.0, w2.x) * step(0.75, w2.y) * pop;
  float glow = (city * 1.0 + town * 0.5) * land;
  return vec4(srgb(vec3(1.0, 0.78, 0.45)) * glow * 1.3, 1.0);
}
vec4 genJupiter(vec3 d) {
  vec3 cols[8];
  float lats[8];
  cols[0] = srgb(vec3(0.56, 0.55, 0.55)); lats[0] = -60.0;
  cols[1] = srgb(vec3(0.72, 0.62, 0.5));  lats[1] = -36.0;
  cols[2] = srgb(vec3(0.9, 0.85, 0.75));  lats[2] = -24.0;
  cols[3] = srgb(vec3(0.66, 0.46, 0.33)); lats[3] = -14.0;
  cols[4] = srgb(vec3(0.95, 0.9, 0.8));   lats[4] = 0.0;
  cols[5] = srgb(vec3(0.62, 0.42, 0.3));  lats[5] = 13.0;
  cols[6] = srgb(vec3(0.9, 0.84, 0.72));  lats[6] = 24.0;
  cols[7] = srgb(vec3(0.6, 0.58, 0.56));  lats[7] = 48.0;
  vec4 c = bandedGiant(d, cols, lats, 3.0, uSeed);
  float tb = sin(asin(clamp(d.y, -1.0, 1.0)) * 26.0) * 0.5 + 0.5;
  c.rgb *= 0.94 + 0.08 * tb;
  // البقعة الحمراء العظيمة (خط عرض 22.5° جنوباً)
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  float dl = lon - 0.9;
  dl = atan(sin(dl), cos(dl));
  vec2 e = vec2(dl / 0.125, (lat + 0.393) / 0.085);
  float rr = length(e);
  float swirl = fbm(vec3(e * 1.3, 2.0) + vec3(rr * 2.0), 4);
  vec3 grs = mix(srgb(vec3(0.72, 0.33, 0.2)), srgb(vec3(0.85, 0.5, 0.32)), smoothstep(-0.4, 0.5, swirl));
  c.rgb = mix(c.rgb, grs, smoothstep(1.05, 0.75, rr));
  c.rgb = mix(c.rgb, srgb(vec3(0.95, 0.9, 0.82)), exp(-pow((rr - 1.12) / 0.12, 2.0)) * 0.6);
  // أشكال بيضاوية بيضاء
  for (int k = 0; k < 4; k++) {
    float ol = -0.72 + float(k) * 1.6;
    float dd = atan(sin(lon - ol), cos(lon - ol));
    float ro = length(vec2(dd / 0.04, (lat + 0.58) / 0.03));
    c.rgb = mix(c.rgb, srgb(vec3(0.97, 0.95, 0.9)), smoothstep(1.0, 0.6, ro));
  }
  return c;
}
vec4 genSaturn(vec3 d) {
  vec3 cols[8];
  float lats[8];
  cols[0] = srgb(vec3(0.62, 0.6, 0.55));  lats[0] = -70.0;
  cols[1] = srgb(vec3(0.8, 0.72, 0.55));  lats[1] = -45.0;
  cols[2] = srgb(vec3(0.88, 0.79, 0.6));  lats[2] = -25.0;
  cols[3] = srgb(vec3(0.83, 0.71, 0.5));  lats[3] = -10.0;
  cols[4] = srgb(vec3(0.93, 0.85, 0.66)); lats[4] = 0.0;
  cols[5] = srgb(vec3(0.84, 0.72, 0.52)); lats[5] = 15.0;
  cols[6] = srgb(vec3(0.88, 0.8, 0.62));  lats[6] = 35.0;
  cols[7] = srgb(vec3(0.66, 0.66, 0.62)); lats[7] = 62.0;
  vec4 c = bandedGiant(d, cols, lats, 1.5, uSeed);
  // الإعصار السداسي عند القطب الشمالي (≈ 78° شمالاً)
  float colat = acos(clamp(d.y, -1.0, 1.0));
  float phi = atan(d.z, d.x);
  float seg = mod(phi + PI / 6.0, PI / 3.0) - PI / 6.0;
  float hexR = 0.2 / cos(seg);
  float inside = smoothstep(hexR + 0.012, hexR - 0.012, colat);
  c.rgb = mix(c.rgb, srgb(vec3(0.52, 0.58, 0.62)), inside * 0.8);
  c.rgb = mix(c.rgb, srgb(vec3(0.35, 0.4, 0.45)), smoothstep(0.05, 0.0, colat));
  return c;
}
vec4 genUranus(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float n = fbm(vec3(d.x, d.y * 10.0, d.z) * 2.0 + uSeed, 4);
  vec3 c = srgb(vec3(0.66, 0.85, 0.88));
  c *= 0.97 + 0.04 * n + 0.03 * sin(lat * 12.0);
  c = mix(c, srgb(vec3(0.78, 0.92, 0.93)), smoothstep(0.9, 1.4, lat) * 0.6);
  return vec4(c, 0.5);
}
vec4 genNeptune(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  float n = fbm(vec3(d.x * 2.0, d.y * 16.0, d.z * 2.0) + uSeed, 5);
  vec3 c = mix(srgb(vec3(0.2, 0.33, 0.78)), srgb(vec3(0.33, 0.5, 0.92)), 0.5 + 0.5 * sin(lat * 9.0 + n * 1.5));
  float dl = atan(sin(lon - 2.0), cos(lon - 2.0));
  float spot = length(vec2(dl / 0.18, (lat + 0.35) / 0.07));
  c = mix(c, srgb(vec3(0.08, 0.14, 0.42)), smoothstep(1.0, 0.6, spot));
  float wc = smoothstep(0.55, 0.8, fbm(vec3(d.x * 3.0, d.y * 30.0, d.z * 3.0) + 9.0, 4)) * exp(-pow((abs(lat) - 0.55) / 0.12, 2.0));
  c = mix(c, vec3(0.95), wc * 0.8);
  return vec4(c, 0.5);
}
vec4 genPluto(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  float h = crateredHeight(d, uSeed, 0.5) * 0.6 + fbm(d * 3.0, 5) * 0.4;
  vec3 c = mix(srgb(vec3(0.62, 0.48, 0.36)), srgb(vec3(0.82, 0.72, 0.6)), smoothstep(-0.4, 0.5, fbm(d * 2.5 + 3.0, 5)));
  // منطقة تومبو (القلب) — خط طول ≈ 180°، عرض ≈ 20° شمالاً
  float dl1 = atan(sin(lon - 3.05), cos(lon - 3.05));
  float lobeW = length(vec2(dl1 / 0.32, (lat - 0.3) / 0.38));
  float dl2 = atan(sin(lon + 2.75), cos(lon + 2.75));
  float lobeE = length(vec2(dl2 / 0.38, (lat - 0.15) / 0.42));
  float heart = max(smoothstep(1.0, 0.8, lobeW), smoothstep(1.0, 0.75, lobeE + fbm(d * 6.0, 3) * 0.2));
  c = mix(c, srgb(vec3(0.95, 0.9, 0.84)), heart);
  // ماكيولا كثولو الداكنة قرب خط الاستواء
  float cth = smoothstep(0.25, -0.05, abs(lat + 0.1) + fbm(d * 4.0 + 7.0, 4) * 0.15) * smoothstep(-0.2, 0.4, sin(lon - 1.6));
  c = mix(c, srgb(vec3(0.28, 0.14, 0.09)), cth * (1.0 - heart));
  c = mix(c, srgb(vec3(0.7, 0.6, 0.5)), smoothstep(1.0, 1.3, lat) * 0.6);
  return vec4(c, clamp(h * 0.5 + 0.5, 0.0, 1.0) * (1.0 - heart * 0.4));
}
vec4 genIo(vec3 d) {
  float n = fbm(d * 3.0 + uSeed, 6);
  vec3 c = mix(srgb(vec3(0.85, 0.78, 0.38)), srgb(vec3(0.95, 0.9, 0.6)), smoothstep(-0.3, 0.5, n));
  c = mix(c, srgb(vec3(0.78, 0.5, 0.22)), smoothstep(0.25, 0.6, fbm(d * 2.0 + 17.0, 5)) * 0.6);
  vec3 w = worley(d * 9.0 + 4.0);
  float vent = smoothstep(0.12, 0.0, w.x) * step(0.45, w.y);
  float ringR = exp(-pow((w.x - 0.3 - fbm(d * 20.0, 3) * 0.08) / 0.09, 2.0)) * step(0.9, w.y) * (0.5 + 0.5 * fbm(d * 30.0, 3));
  c = mix(c, srgb(vec3(0.12, 0.08, 0.05)), vent);
  c = mix(c, srgb(vec3(0.75, 0.35, 0.18)), clamp(ringR, 0.0, 1.0) * 0.55);
  float pole = smoothstep(0.9, 1.4, abs(asin(clamp(d.y, -1.0, 1.0))));
  c *= 1.0 - pole * 0.25;
  return vec4(c, 0.5 + n * 0.2 - vent * 0.2);
}
vec4 genEuropa(vec3 d) {
  float n = fbm(d * 2.5 + uSeed, 5);
  vec3 c = mix(srgb(vec3(0.75, 0.68, 0.58)), srgb(vec3(0.92, 0.9, 0.86)), smoothstep(-0.4, 0.4, n));
  float lines = 0.0;
  for (int k = 0; k < 4; k++) {
    float s = snoise(d * (3.0 + float(k) * 2.3) + vec3(float(k) * 7.1));
    lines = max(lines, smoothstep(0.035, 0.0, abs(s)) * (0.6 + 0.4 * float(k == 0)));
  }
  c = mix(c, srgb(vec3(0.55, 0.35, 0.2)), lines * 0.75);
  float chaos = smoothstep(0.45, 0.7, fbm(d * 4.0 + 33.0, 5));
  c = mix(c, srgb(vec3(0.62, 0.45, 0.3)), chaos * 0.5);
  return vec4(c, 0.5 + lines * 0.08 - chaos * 0.1);
}
vec4 genGanymede(vec3 d) {
  float region = smoothstep(-0.1, 0.15, fbm(d * 1.7 + uSeed, 6));
  float grooves = sin(dot(d, normalize(vec3(1.0, 0.3, 0.7))) * 220.0 + fbm(d * 8.0, 3) * 6.0) * 0.5 + 0.5;
  vec3 dark = srgb(vec3(0.36, 0.32, 0.27));
  vec3 bright = srgb(vec3(0.68, 0.64, 0.6)) * (0.92 + 0.12 * grooves);
  vec3 c = mix(dark, bright, region);
  float h = crateredHeight(d, uSeed + 2.0, 0.6);
  c *= 0.88 + 0.25 * smoothstep(-0.5, 0.5, h);
  c = mix(c, srgb(vec3(0.85, 0.85, 0.85)), smoothstep(1.0, 1.35, abs(asin(clamp(d.y, -1.0, 1.0)))) * 0.5);
  return vec4(c, clamp(h * 0.5 + 0.5, 0.0, 1.0));
}
vec4 genCallisto(vec3 d) {
  float h = crateredHeight(d, uSeed, 1.3);
  vec3 c = mix(srgb(vec3(0.24, 0.21, 0.18)), srgb(vec3(0.42, 0.38, 0.33)), smoothstep(-0.4, 0.4, fbm(d * 3.0, 5)));
  vec3 w = worley(d * 30.0 + 5.0);
  c = mix(c, srgb(vec3(0.85, 0.83, 0.8)), smoothstep(0.12, 0.0, w.x) * step(0.5, w.y));
  float valhalla = exp(-pow(length(d - normalize(vec3(0.8, 0.25, -0.55))) / 0.25, 2.0));
  c = mix(c, srgb(vec3(0.6, 0.56, 0.5)), valhalla * 0.6);
  return vec4(c, clamp(h * 0.5 + 0.5, 0.0, 1.0));
}
vec4 genTitan(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float n = fbm(vec3(d.x, d.y * 4.0, d.z) * 2.0 + uSeed, 5);
  vec3 c = mix(srgb(vec3(0.78, 0.55, 0.22)), srgb(vec3(0.88, 0.66, 0.3)), smoothstep(-0.5, 0.5, n));
  c = mix(c, srgb(vec3(0.62, 0.45, 0.22)), smoothstep(0.9, 1.3, lat) * 0.6);
  return vec4(c, 0.5);
}
vec4 genTriton(vec3 d) {
  vec3 w = worley(d * 18.0 + uSeed);
  float cant = smoothstep(0.0, 0.25, w.z - w.x);
  vec3 c = mix(srgb(vec3(0.66, 0.58, 0.56)), srgb(vec3(0.84, 0.76, 0.72)), cant);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float cap = smoothstep(0.1, -0.35, lat + fbm(d * 5.0, 4) * 0.15);
  c = mix(c, srgb(vec3(0.93, 0.86, 0.84)), cap);
  float streak = smoothstep(0.6, 0.85, fbm(vec3(d.x * 8.0, d.y * 2.0, d.z * 8.0) + 3.0, 4)) * cap;
  c = mix(c, srgb(vec3(0.35, 0.3, 0.3)), streak * 0.7);
  return vec4(c, 0.5 + (1.0 - cant) * 0.1);
}
vec4 genPhobos(vec3 d) {
  float h = crateredHeight(d, uSeed, 1.4);
  vec3 c = mix(srgb(vec3(0.26, 0.23, 0.21)), srgb(vec3(0.42, 0.38, 0.34)), smoothstep(-0.5, 0.5, h + fbm(d * 4.0, 4) * 0.3));
  float grooves = smoothstep(0.85, 1.0, sin(dot(d, vec3(0.2, 1.0, 0.1)) * 60.0) * 0.5 + 0.5) * smoothstep(0.0, 0.6, d.x);
  c *= 1.0 - grooves * 0.2;
  return vec4(c, clamp(h * 0.5 + 0.5 - grooves * 0.1, 0.0, 1.0));
}
vec4 genSun(vec3 d) {
  float n = fbm(d * 8.0, 6);
  return vec4(srgb(vec3(1.0, 0.75, 0.35)) * (0.85 + 0.15 * n), 1.0);
}

void main() {
  vec3 d = dirFromUv(vUv);
  vec4 o;
  if (uType == 0) o = genMercury(d);
  else if (uType == 1) o = genVenus(d);
  else if (uType == 2) o = genVenusClouds(d);
  else if (uType == 3) o = genEarth(d);
  else if (uType == 4) o = genEarthClouds(d);
  else if (uType == 5) o = genEarthNight(d);
  else if (uType == 6) o = genMoon(d);
  else if (uType == 7) o = genMars(d);
  else if (uType == 8) o = genJupiter(d);
  else if (uType == 9) o = genSaturn(d);
  else if (uType == 10) o = genUranus(d);
  else if (uType == 11) o = genNeptune(d);
  else if (uType == 12) o = genPluto(d);
  else if (uType == 13) o = genIo(d);
  else if (uType == 14) o = genEuropa(d);
  else if (uType == 15) o = genGanymede(d);
  else if (uType == 16) o = genCallisto(d);
  else if (uType == 17) o = genTitan(d);
  else if (uType == 18) o = genTriton(d);
  else if (uType == 19) o = genPhobos(d);
  else o = genSun(d);
  gl_FragColor = vec4(max(o.rgb, 0.0), clamp(o.a, 0.0, 1.0));
}
`;

/** أرقام أنواع التوليد في BAKE_FRAG */
export const PROC_TYPES = {
  mercury: 0, venus: 1, venusClouds: 2, earth: 3, earthClouds: 4, earthNight: 5, moon: 6,
  mars: 7, jupiter: 8, saturn: 9, uranus: 10, neptune: 11, pluto: 12, io: 13, europa: 14,
  ganymede: 15, callisto: 16, titan: 17, triton: 18, phobos: 19, deimos: 19, sun: 20,
};
