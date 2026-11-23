/* ============================================================================
 *  astro.js — الحسابات الفلكية (مستقل عن three.js)
 *  ---------------------------------------------------------------------------
 *  - الزمن: اليوم اليولياني (JD) و TT
 *  - حل معادلة كبلر
 *  - مواقع الكواكب: عناصر JPL (E. M. Standish) مع معدلات التغير لكل قرن
 *  - موقع القمر: نظرية مختصرة مع أهم الاضطرابات (Evection, Variation, ...)
 *  - مواقع الأقمار الأخرى: عناصر JPL المتوسطة مع تقدم الحضيض وتراجع العقدة
 *  - اتجاه محور الدوران وزاوية الدوران: نماذج IAU WGCCRE
 *  - دوال المقياس المرئي
 *
 *  نظام الإحداثيات الناتج: مسطح البروج J2000 مركزه الشمس (أو الكوكب الأم
 *  للأقمار) بالكيلومتر، كمصفوفات [x, y, z] حيث z = شمال البروج.
 * ========================================================================== */
import { CONSTANTS, DATA, SCALE } from './data.js';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
const AU = CONSTANTS.AU_KM;
const EPS = CONSTANTS.OBLIQUITY_J2000_DEG * DEG;
const COS_EPS = Math.cos(EPS);
const SIN_EPS = Math.sin(EPS);

/* ----------------------------- الزمن ----------------------------- */
export function jdFromUnixMs(ms) { return ms / 86400000 + 2440587.5; }
export function unixMsFromJd(jd) { return (jd - 2440587.5) * 86400000; }
export function jdTTFromUtc(jdUtc) { return jdUtc + CONSTANTS.TT_MINUS_UTC_S / 86400; }
export function yearFromJd(jd) { return 2000 + (jd - CONSTANTS.J2000_JD) / 365.25; }

function wrapRad(a) { a %= TWO_PI; return a < -Math.PI ? a + TWO_PI : (a > Math.PI ? a - TWO_PI : a); }
function wrapDeg360(a) { a %= 360; return a < 0 ? a + 360 : a; }

/* ----------------------------- متجهات بسيطة ----------------------------- */
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function len(a) { return Math.hypot(a[0], a[1], a[2]); }
export function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/** تحويل من الإحداثيات الاستوائية (ICRF/J2000) إلى البروجية J2000 */
export function eqToEcl(v) {
  return [v[0], COS_EPS * v[1] + SIN_EPS * v[2], -SIN_EPS * v[1] + COS_EPS * v[2]];
}
/** تحويل من البروجية إلى الاستوائية */
export function eclToEq(v) {
  return [v[0], COS_EPS * v[1] - SIN_EPS * v[2], SIN_EPS * v[1] + COS_EPS * v[2]];
}

/* ----------------------------- معادلة كبلر ----------------------------- */
/** يحل M = E − e·sin(E) بطريقة نيوتن (راديان) */
export function solveKepler(M, e) {
  M = wrapRad(M);
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

/**
 * موقع في المستوي المداري ثم تدويره إلى الإطار المرجعي.
 * @param a نصف المحور الأكبر (أي وحدة) e الانحراف, i, node (Ω), w (ω), E الشذوذ اللامركزي — راديان
 * @returns [x,y,z] بنفس وحدة a في الإطار المرجعي (المرجع = مستوى البروج أو خط استواء الكوكب)
 */
export function orbitalToReference(a, e, i, node, w, E) {
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

/* ===================== الكواكب: عناصر JPL ===================== */
/**
 * العناصر المدارية للكوكب عند الزمن jdTT.
 * جدول 1 صالح 1800–2050 (أدق للحاضر)، وجدول 2 صالح 3000ق.م–3000م.
 */
export function planetElements(body, jdTT) {
  const T = (jdTT - CONSTANTS.J2000_JD) / 36525;
  const year = yearFromJd(jdTT);
  const useT1 = year >= 1800 && year <= 2050;
  const tb = useT1 ? body.orbit.t1 : body.orbit.t2;
  const a = tb.a[0] + tb.a[1] * T;
  const e = tb.e[0] + tb.e[1] * T;
  const I = tb.I[0] + tb.I[1] * T;
  const L = tb.L[0] + tb.L[1] * T;
  const peri = tb.peri[0] + tb.peri[1] * T;
  const node = tb.node[0] + tb.node[1] * T;
  let M = L - peri;
  if (!useT1 && tb.b !== undefined) {
    M += tb.b * T * T + tb.c * Math.cos(tb.f * T * DEG) + tb.s * Math.sin(tb.f * T * DEG);
  }
  return {
    aKm: a * AU, e, i: I * DEG, node: node * DEG, w: (peri - node) * DEG, M: wrapRad(M * DEG),
    table: useT1 ? 1 : 2,
  };
}

/** موقع الكوكب حول الشمس (بروجي J2000، كم) من عناصره عند شذوذ متوسط معيّن */
export function positionFromElements(el, M = el.M) {
  const E = solveKepler(M, el.e);
  return orbitalToReference(el.aKm, el.e, el.i, el.node, el.w, E);
}

/** موقع مركز ثقل الكوكب (أو EMB للأرض) حول الشمس */
export function planetHelio(body, jdTT) {
  return positionFromElements(planetElements(body, jdTT));
}

/* ===================== القمر (تابع الأرض) ===================== */
/**
 * موقع القمر حول الأرض (بروجي J2000، كم).
 * عناصر متوسطة + 12 حداً في خط الطول + 5 في العرض + 2 في المسافة،
 * ثم تصحيح المبادرة من اعتدال التاريخ إلى J2000. الدقة ≈ بضع دقائق قوسية.
 */
export function moonGeocentric(jdTT) {
  const d = jdTT - 2451543.5; // اليوم 0 = 1999-12-31 00:00 TT
  const N = (125.1228 - 0.0529538083 * d) * DEG;
  const i = 5.1454 * DEG;
  const w = (318.0634 + 0.1643573223 * d) * DEG;
  const a = 60.2666; // أنصاف أقطار أرضية
  const e = 0.054900;
  const Mm = wrapDeg360(115.3654 + 13.0649929509 * d) * DEG;

  const E = solveKepler(Mm, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  let r = Math.hypot(xv, yv);

  const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
  const yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
  const zh = r * (Math.sin(v + w) * Math.sin(i));
  let lon = Math.atan2(yh, xh) * RAD;
  let lat = Math.atan2(zh, Math.hypot(xh, yh)) * RAD;

  // الاضطرابات
  const Ms = wrapDeg360(356.0470 + 0.9856002585 * d) * DEG;   // الشذوذ المتوسط للشمس
  const ws = (282.9404 + 4.70935e-5 * d) * DEG;
  const Ls = Ms + ws;                                         // خط الطول المتوسط للشمس
  const Lm = Mm + w + N;                                      // خط الطول المتوسط للقمر
  const D = Lm - Ls;                                          // الاستطالة المتوسطة
  const F = Lm - N;                                           // حجة العرض

  lon += -1.274 * Math.sin(Mm - 2 * D)   // Evection
       + 0.658 * Math.sin(2 * D)         // Variation
       - 0.186 * Math.sin(Ms)            // Yearly equation
       - 0.059 * Math.sin(2 * Mm - 2 * D)
       - 0.057 * Math.sin(Mm - 2 * D + Ms)
       + 0.053 * Math.sin(Mm + 2 * D)
       + 0.046 * Math.sin(2 * D - Ms)
       + 0.041 * Math.sin(Mm - Ms)
       - 0.035 * Math.sin(D)             // Parallactic equation
       - 0.031 * Math.sin(Mm + Ms)
       - 0.015 * Math.sin(2 * F - 2 * D)
       + 0.011 * Math.sin(Mm - 4 * D);
  lat += -0.173 * Math.sin(F - 2 * D)
       - 0.055 * Math.sin(Mm - F - 2 * D)
       - 0.046 * Math.sin(Mm + F - 2 * D)
       + 0.033 * Math.sin(F + 2 * D)
       + 0.017 * Math.sin(2 * Mm + F);
  r += -0.58 * Math.cos(Mm - 2 * D) - 0.46 * Math.cos(2 * D);

  // من اعتدال التاريخ إلى J2000
  lon -= 3.82394e-5 * (d - 1.5);

  const rKm = r * CONSTANTS.EARTH_EQ_RADIUS_KM;
  const cl = Math.cos(lat * DEG);
  return [rKm * cl * Math.cos(lon * DEG), rKm * cl * Math.sin(lon * DEG), rKm * Math.sin(lat * DEG)];
}

/* ===================== اتجاه المحور والدوران (IAU) ===================== */
/**
 * يعيد {ra, dec, W} بالدرجات لنموذج IAU الخاص بالجرم.
 * ra/dec: اتجاه القطب الشمالي في ICRF، W: زاوية خط الطول الرئيسي.
 */
export function iauOrientation(body, jdTT) {
  const d = jdTT - CONSTANTS.J2000_JD;
  const T = d / 36525;
  const rot = body.rotation;
  if (rot.model === 'iau-moon') {
    const E = [
      0,
      125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d,
      176.625 + 13.3407154 * d, 357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d,
      134.963 + 13.0649930 * d, 276.617 + 0.3287146 * d, 34.226 + 1.7484877 * d,
      15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
      25.053 + 12.9590088 * d,
    ].map((x) => x * DEG);
    const s = Math.sin, c = Math.cos;
    const ra = 269.9949 + 0.0031 * T - 3.8787 * s(E[1]) - 0.1204 * s(E[2]) + 0.0700 * s(E[3])
      - 0.0172 * s(E[4]) + 0.0072 * s(E[6]) - 0.0052 * s(E[10]) + 0.0043 * s(E[13]);
    const dec = 66.5392 + 0.0130 * T + 1.5419 * c(E[1]) + 0.0239 * c(E[2]) - 0.0278 * c(E[3])
      + 0.0068 * c(E[4]) - 0.0029 * c(E[6]) + 0.0009 * c(E[7]) + 0.0008 * c(E[10]) - 0.0009 * c(E[13]);
    const W = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.5610 * s(E[1]) + 0.1208 * s(E[2])
      - 0.0642 * s(E[3]) + 0.0158 * s(E[4]) + 0.0252 * s(E[5]) - 0.0066 * s(E[6]) - 0.0047 * s(E[7])
      - 0.0046 * s(E[8]) + 0.0028 * s(E[9]) + 0.0052 * s(E[10]) + 0.0040 * s(E[11]) + 0.0019 * s(E[12])
      - 0.0044 * s(E[13]);
    return { ra, dec, W };
  }
  if (rot.model === 'iau-neptune') {
    const N = (357.85 + 52.316 * T) * DEG;
    return {
      ra: 299.36 + 0.70 * Math.sin(N),
      dec: 43.46 - 0.51 * Math.cos(N),
      W: 249.978 + 541.1397757 * d - 0.48 * Math.sin(N),
    };
  }
  return { ra: rot.ra[0] + rot.ra[1] * T, dec: rot.dec[0] + rot.dec[1] * T, W: rot.W[0] + rot.W[1] * d };
}

/**
 * إطار خط الاستواء للجرم بإحداثيات البروج:
 *  P = القطب الشمالي، N = العقدة الصاعدة لخط الاستواء على خط استواء ICRF،
 *  Q = P × N  (يكمل الإطار يمينياً)
 */
export function equatorFrame(raDeg, decDeg) {
  const a = raDeg * DEG, dd = decDeg * DEG;
  const Peq = [Math.cos(dd) * Math.cos(a), Math.cos(dd) * Math.sin(a), Math.sin(dd)];
  const Neq = [-Math.sin(a), Math.cos(a), 0];
  const P = eqToEcl(Peq);
  const N = eqToEcl(Neq);
  return { P, N, Q: cross(P, N) };
}

/** ميل المحور عن مستوى المدار (للتحقق) */
export function obliquityDeg(poleEcl, orbitNormalEcl) {
  return Math.acos(Math.max(-1, Math.min(1, dot(norm(poleEcl), norm(orbitNormalEcl))))) * RAD;
}

/* ===================== الأقمار: عناصر JPL المتوسطة ===================== */
/**
 * عناصر القمر عند الزمن (مع تقدم الحضيض وتراجع العقدة).
 * المرجع: مستوى خط استواء الكوكب الأم (يقارب مستوى لابلاس المحلي).
 */
export function moonMeanElements(moon, jdTT) {
  const o = moon.orbit;
  const d = jdTT - CONSTANTS.J2000_JD;
  const dw = o.PwYr > 0 ? (360 / (o.PwYr * 365.25)) * d : 0;          // تقدم الحضيض
  const dNode = o.PnodeYr > 0 ? -(360 / (o.PnodeYr * 365.25)) * d : 0; // تراجع العقدة
  const w = o.wDeg + dw;
  const node = o.nodeDeg + dNode;
  // n في جداول JPL هي معدل خط الطول المتوسط (الفترة النجمية)،
  // لذلك يُطرح تغيّر ω و Ω من الشذوذ المتوسط حتى يبقى L = Ω + ω + M بمعدل n
  const M = o.MDeg + o.nDegPerDay * d - dw - dNode;
  return { aKm: o.aKm, e: o.e, i: o.iDeg * DEG, node: wrapDeg360(node) * DEG, w: wrapDeg360(w) * DEG, M: wrapRad(wrapDeg360(M) * DEG) };
}

/** تحويل متجه من إطار خط استواء الكوكب (x=N, y=Q, z=P) إلى البروج */
export function frameToEcl(frame, v) {
  return [
    v[0] * frame.N[0] + v[1] * frame.Q[0] + v[2] * frame.P[0],
    v[0] * frame.N[1] + v[1] * frame.Q[1] + v[2] * frame.P[1],
    v[0] * frame.N[2] + v[1] * frame.Q[2] + v[2] * frame.P[2],
  ];
}

/** موقع القمر حول كوكبه (بروجي J2000، كم) */
export function moonRelative(moon, jdTT, parentFrame, M) {
  const el = moonMeanElements(moon, jdTT);
  const E = solveKepler(M === undefined ? el.M : M, el.e);
  const v = orbitalToReference(el.aKm, el.e, el.i, el.node, el.w, E);
  return frameToEcl(parentFrame, v);
}

/* ===================== حساب كل المواقع ===================== */
/** إطار خط الاستواء للكوكب عند زمن معيّن (للأقمار والحلقات) */
export function bodyEquatorFrame(body, jdTT) {
  const o = iauOrientation(body, jdTT);
  return equatorFrame(o.ra, o.dec);
}

/**
 * يحسب المواقع الحقيقية (مركزها الشمس، بروجي J2000، كم) لكل الأجرام.
 * @returns {Object<string, number[]>}
 */
export function computeRealPositions(jdTT, out = {}) {
  out.sun = [0, 0, 0];
  const moonGeo = moonGeocentric(jdTT);
  out.__moonGeo = moonGeo;
  for (const id in DATA) {
    const b = DATA[id];
    if (b.orbit.model !== 'kepler') continue;
    const p = planetHelio(b, jdTT);
    if (b.orbit.barycenterWithMoon) {
      // الأرض = مركز الثقل − موقع القمر × m_moon/(m_earth+m_moon)
      const k = 1 / (1 + CONSTANTS.EARTH_MOON_MASS_RATIO);
      p[0] -= moonGeo[0] * k; p[1] -= moonGeo[1] * k; p[2] -= moonGeo[2] * k;
    }
    out[id] = p;
  }
  for (const id in DATA) {
    const b = DATA[id];
    if (b.type !== 'moon') continue;
    const parent = out[b.parent];
    let rel;
    if (b.orbit.model === 'lunar') rel = moonGeo;
    else rel = moonRelative(b, jdTT, bodyEquatorFrame(DATA[b.parent], jdTT));
    out[id] = [parent[0] + rel[0], parent[1] + rel[1], parent[2] + rel[2]];
    out['__rel_' + id] = rel;
  }
  return out;
}

/* ===================== المقياس المرئي ===================== */
const VS = SCALE.visual;
const R_SUN = CONSTANTS.SUN_RADIUS_KM;

/** المسافة المرئية عن الشمس (كم) */
export function visualSunDistanceKm(rKm) {
  const au = Math.max(rKm, 1) / AU;
  return R_SUN * (VS.distance.offset + VS.distance.factor * Math.pow(au, VS.distance.exponent));
}
/** نصف القطر المرئي (كم) */
export function visualRadiusKm(Rkm) {
  return R_SUN * VS.radius.earthR * Math.pow(Rkm / CONSTANTS.EARTH_RADIUS_KM, VS.radius.exponent);
}
/** بُعد القمر المرئي عن كوكبه (كم) */
export function visualMoonDistanceKm(dKm, parentRadiusKm) {
  const pv = visualRadiusKm(parentRadiusKm);
  return pv * (VS.moonDistance.base + VS.moonDistance.factor * Math.pow(Math.max(dKm, 1) / parentRadiusKm, VS.moonDistance.exponent));
}
/** استيفاء لوغاريتمي ناعم بين قيمتين موجبتين */
export function logLerp(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return Math.exp(Math.log(a) * (1 - t) + Math.log(b) * t);
}
/** نصف القطر المعروض لجرم حسب معامل المقياس t (0 = حقيقي، 1 = مرئي) */
export function displayRadiusKm(body, t) {
  if (body.type === 'star') return body.radiusKm;
  return logLerp(body.radiusKm, visualRadiusKm(body.radiusKm), t);
}
/** تحويل موقع حول الشمس إلى الموقع المعروض */
export function displaySunRelative(p, t, out = [0, 0, 0]) {
  const r = len(p);
  if (r < 1) { out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; }
  const f = logLerp(r, visualSunDistanceKm(r), t) / r;
  out[0] = p[0] * f; out[1] = p[1] * f; out[2] = p[2] * f;
  return out;
}
/** تحويل موقع قمر نسبةً لكوكبه إلى الموقع المعروض */
export function displayMoonRelative(rel, parentRadiusKm, t, out = [0, 0, 0]) {
  const d = len(rel);
  const f = logLerp(d, visualMoonDistanceKm(d, parentRadiusKm), t) / d;
  out[0] = rel[0] * f; out[1] = rel[1] * f; out[2] = rel[2] * f;
  return out;
}

/* ===================== أدوات للواجهة ===================== */
/** الفترة المدارية (أيام) لجرم من بياناته */
export function orbitalPeriodDays(body) {
  if (body.orbit.model === 'kepler') {
    const a = body.orbit.t1.a[0];
    return 365.256898326 * Math.pow(a, 1.5);
  }
  if (body.orbit.model === 'lunar') return 27.321661;
  if (body.orbit.model === 'mean') return 360 / body.orbit.nDegPerDay;
  return 0;
}
