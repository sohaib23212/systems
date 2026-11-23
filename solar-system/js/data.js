/* ============================================================================
 *  data.js — كل البيانات والإعدادات بمكان واحد
 *  ---------------------------------------------------------------------------
 *  1) SIGNATURE / APP      : معلومات التطبيق والتوقيع
 *  2) CONSTANTS            : ثوابت فلكية
 *  3) DATA                 : بيانات كل الأجرام (NASA Planetary Fact Sheet,
 *                            JPL Keplerian Elements, JPL Satellite Mean
 *                            Elements, IAU WGCCRE rotation models)
 *  4) TEXTURES             : مسارات كل الصور (Solar System Scope + NASA)
 *  5) QUALITY_PRESETS      : إعدادات الجودة (منخفض/متوسط/عالي/فائق)
 *  6) SCALE                : إعدادات المقياس المرئي
 *  7) TIME_SPEEDS          : سرعات الوقت
 *
 *  الوحدات: المسافات بالكيلومتر، الزوايا بالدرجات، الأزمنة بالأيام/الساعات
 *  كما هو مذكور بجانب كل حقل.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * 1) التوقيع
 * ------------------------------------------------------------------------- */
export const SIGNATURE = 'Py | Sohaib Qudeih';

export const APP = {
  titleAr: 'النظام الشمسي',
  subtitleAr: 'محاكاة ثلاثية الأبعاد بدقة علمية',
  threeVersion: '0.187.0',
};

/* ---------------------------------------------------------------------------
 * 2) الثوابت
 * ------------------------------------------------------------------------- */
export const CONSTANTS = {
  AU_KM: 149597870.7,              // الوحدة الفلكية (IAU 2012)
  J2000_JD: 2451545.0,             // 2000-01-01 12:00 TT
  OBLIQUITY_J2000_DEG: 23.4392911, // ميل دائرة البروج عن خط الاستواء السماوي (J2000)
  SUN_RADIUS_KM: 695700,           // نصف قطر الشمس الاسمي (IAU 2015)
  EARTH_RADIUS_KM: 6371.0,         // نصف قطر الأرض الحجمي المتوسط
  EARTH_EQ_RADIUS_KM: 6378.137,
  EARTH_MOON_MASS_RATIO: 81.30056, // كتلة الأرض ÷ كتلة القمر
  TT_MINUS_UTC_S: 69.184,          // 32.184 + 37 ثانية كبيسة (منذ 2017)
  LIGHT_SPEED_KM_S: 299792.458,
};

/* ---------------------------------------------------------------------------
 * 3) بيانات الأجرام
 * ---------------------------------------------------------------------------
 *  حقول كل جرم:
 *   id, type: 'star' | 'planet' | 'dwarf' | 'moon', parent (للأقمار)
 *   nameAr, nameEn, color (لون الواجهة وخط المدار)
 *   radiusKm (المتوسط الحجمي) eqRadiusKm, polarRadiusKm, shapeKm (للأجسام غير المنتظمة)
 *   facts  : أرقام بطاقة المعلومات (NASA)
 *   orbit  : نموذج حساب الموقع
 *      model 'kepler'  → عناصر JPL (Standish) — جدول 1 (1800–2050) وجدول 2 (3000ق.م–3000م)
 *           كل عنصر: [القيمة عند J2000, المعدل لكل قرن]
 *           a (AU) e (–) I (°) L (°) peri = ϖ (°) node = Ω (°)
 *      model 'lunar'   → نظرية القمر المختصرة مع الاضطرابات الرئيسية
 *      model 'mean'    → عناصر JPL المتوسطة للأقمار بالنسبة لمستوى خط استواء الكوكب
 *   rotation: نموذج IAU WGCCRE لاتجاه القطب ودوران خط الطول الرئيسي
 *      ra/dec = [القيمة, المعدل لكل قرن] (°) ،  W = [W0, المعدل °/يوم]
 *      المعدل السالب في W يعني دوران عكسي (retrograde)
 *   render : إعدادات الرسم
 * ------------------------------------------------------------------------- */
export const DATA = {
  /* ============================== الشمس ============================== */
  sun: {
    id: 'sun', type: 'star', nameAr: 'الشمس', nameEn: 'Sun', color: '#ffc95c',
    radiusKm: 695700, eqRadiusKm: 695700, polarRadiusKm: 695700,
    facts: {
      kindAr: 'نجم (قزم أصفر G2V)',
      massE24: 1988500, diameterKm: 1391400, densityKgM3: 1408, gravityMS2: 274.0,
      escapeKmS: 617.6, siderealRotationH: 609.12, obliquityDeg: 7.25,
      meanTempC: 5500, tempNoteAr: 'السطح ≈ 5,500°م (5,772 كلفن) — النواة ≈ 15 مليون°م',
      moons: null, ageGyr: 4.6,
    },
    orbit: { model: 'fixed' },
    rotation: { ra: [286.13, 0], dec: [63.87, 0], W: [84.176, 14.1844000] },
    render: { kind: 'sun', minAltitudeR: 0.05 },
    descAr: 'الشمس نجم من نوع قزم أصفر عمره نحو 4.6 مليار سنة، وتحتوي وحدها على 99.86% من كتلة النظام الشمسي. تولّد طاقتها بالاندماج النووي في نواتها حيث تبلغ الحرارة نحو 15 مليون درجة مئوية، ويستغرق ضوؤها قرابة 8 دقائق و20 ثانية ليصل إلى الأرض.',
  },

  /* ============================== عطارد ============================== */
  mercury: {
    id: 'mercury', type: 'planet', nameAr: 'عطارد', nameEn: 'Mercury', color: '#b3aca4',
    radiusKm: 2439.7, eqRadiusKm: 2440.5, polarRadiusKm: 2438.3,
    facts: {
      kindAr: 'كوكب صخري',
      massE24: 0.330, diameterKm: 4879, densityKgM3: 5429, gravityMS2: 3.7, escapeKmS: 4.3,
      siderealRotationH: 1407.6, dayLengthH: 4222.6,
      distanceMkm: 57.9, perihelionMkm: 46.0, aphelionMkm: 69.8,
      orbitalPeriodD: 88.0, orbitalVelKmS: 47.4, inclinationDeg: 7.0, eccentricity: 0.206,
      obliquityDeg: 0.034, meanTempC: 167, tempNoteAr: 'من −173°م ليلاً إلى 427°م نهاراً',
      moons: 0, rings: false,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749],
            L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
      t2: { a: [0.38709843, 0.00000000], e: [0.20563661, 0.00002123], I: [7.00559432, -0.00590158],
            L: [252.25166724, 149472.67486623], peri: [77.45771895, 0.15940013], node: [48.33961819, -0.12214182] },
    },
    rotation: { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], W: [329.5988, 6.1385108] },
    render: {
      kind: 'rocky', proc: 'mercury', lunar: 0.75, bumpFromMap: 1.2, minAltitudeR: 0.0015,
    },
    descAr: 'أصغر كواكب المجموعة الشمسية وأقربها إلى الشمس. سطحه مليء بالفوهات ويشبه سطح القمر، ولا يملك غلافاً جوياً يحفظ الحرارة، فتتراوح حرارته بين 427°م نهاراً و−173°م ليلاً. يدور حول نفسه 3 مرات كل دورتين حول الشمس (رنين 3:2).',
  },

  /* ============================== الزهرة ============================== */
  venus: {
    id: 'venus', type: 'planet', nameAr: 'الزهرة', nameEn: 'Venus', color: '#e9c98f',
    radiusKm: 6051.8, eqRadiusKm: 6051.8, polarRadiusKm: 6051.8,
    facts: {
      kindAr: 'كوكب صخري',
      massE24: 4.87, diameterKm: 12104, densityKgM3: 5243, gravityMS2: 8.9, escapeKmS: 10.4,
      siderealRotationH: -5832.5, dayLengthH: 2802.0,
      distanceMkm: 108.2, perihelionMkm: 107.5, aphelionMkm: 108.9,
      orbitalPeriodD: 224.7, orbitalVelKmS: 35.0, inclinationDeg: 3.4, eccentricity: 0.007,
      obliquityDeg: 177.4, meanTempC: 464, tempNoteAr: 'ثابتة تقريباً ليلاً ونهاراً (≈ 464°م)',
      moons: 0, rings: false, pressureBar: 92,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890],
            L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
      t2: { a: [0.72332102, -0.00000026], e: [0.00676399, -0.00005107], I: [3.39777545, 0.00043494],
            L: [181.97970850, 58517.81560260], peri: [131.76755713, 0.05679648], node: [76.67261496, -0.27274174] },
    },
    // دوران عكسي: معدل W سالب
    rotation: { ra: [272.76, 0], dec: [67.16, 0], W: [160.20, -1.4813688] },
    render: {
      kind: 'rocky', proc: 'venus', lunar: 0.0, bumpFromMap: 0.6, minAltitudeR: 0.0015,
      // الغيوم: دوران فائق (Super-rotation) للغلاف الجوي العلوي كل ≈ 4 أيام أرضية، بنفس اتجاه الكوكب العكسي
      clouds: { heightR: 0.0115, rotationDays: -4.0, opacity: 1.0, proc: 'venusClouds', defaultVisible: true },
      atmosphere: { topR: 0.03, hR: 0.0026, hM: 0.004, tauR: [0.05, 0.09, 0.2], tauM: [0.45, 0.4, 0.28], g: 0.7, intensity: 9 },
    },
    descAr: 'أشد الكواكب حرارة رغم أنه ليس الأقرب إلى الشمس، بسبب غلافه الجوي الكثيف من ثاني أكسيد الكربون وغيوم حمض الكبريتيك التي تسبب احتباساً حرارياً هائلاً. يدور حول نفسه عكس اتجاه معظم الكواكب ويومه أطول من سنته، والضغط على سطحه يعادل 92 ضعف ضغط الأرض.',
  },

  /* ============================== الأرض ============================== */
  earth: {
    id: 'earth', type: 'planet', nameAr: 'الأرض', nameEn: 'Earth', color: '#5aa9ff',
    radiusKm: 6371.0, eqRadiusKm: 6378.137, polarRadiusKm: 6356.752,
    facts: {
      kindAr: 'كوكب صخري',
      massE24: 5.97, diameterKm: 12756, densityKgM3: 5514, gravityMS2: 9.8, escapeKmS: 11.2,
      siderealRotationH: 23.9345, dayLengthH: 24.0,
      distanceMkm: 149.6, perihelionMkm: 147.1, aphelionMkm: 152.1,
      orbitalPeriodD: 365.2, orbitalVelKmS: 29.8, inclinationDeg: 0.0, eccentricity: 0.017,
      obliquityDeg: 23.44, meanTempC: 15, tempNoteAr: 'من −89°م إلى 57°م',
      moons: 1, rings: false, pressureBar: 1.014,
    },
    // عناصر مركز ثقل نظام الأرض-القمر (EM Bary)؛ موقع الأرض = المركز − (موقع القمر ÷ 82.3)
    orbit: {
      model: 'kepler', barycenterWithMoon: true,
      t1: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
            L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0] },
      t2: { a: [1.00000018, -0.00000003], e: [0.01673163, -0.00003661], I: [-0.00054346, -0.01337178],
            L: [100.46691572, 35999.37306329], peri: [102.93005885, 0.31795260], node: [-5.11260389, -0.24123856] },
    },
    rotation: { ra: [0.00, -0.641], dec: [90.00, -0.557], W: [190.147, 360.9856235] },
    render: {
      kind: 'earth', minAltitudeR: 0.0012, bumpFromMap: 0.0,
      clouds: { heightR: 0.0016, rotationDays: 0, driftDegPerDay: 9, opacity: 1.0, proc: 'earthClouds', defaultVisible: true },
      atmosphere: { topR: 0.0157, hR: 0.001256, hM: 0.000188, tauR: [0.0464, 0.1085, 0.265], tauM: [0.021, 0.021, 0.021], g: 0.76, intensity: 13 },
      nightIntensity: 1.35,
    },
    descAr: 'كوكبنا الأزرق، والكوكب الوحيد المعروف بوجود الحياة عليه. يغطي الماء نحو 71% من سطحه، ويحميه غلاف جوي من النيتروجين والأكسجين ومجال مغناطيسي قوي. ميل محوره 23.44° هو سبب تعاقب الفصول الأربعة.',
  },

  /* ============================== القمر ============================== */
  moon: {
    id: 'moon', type: 'moon', parent: 'earth', nameAr: 'القمر', nameEn: 'Moon', color: '#d4d4d4',
    radiusKm: 1737.4, eqRadiusKm: 1738.1, polarRadiusKm: 1736.0,
    facts: {
      kindAr: 'قمر طبيعي (تابع الأرض)',
      massE24: 0.07346, diameterKm: 3475, densityKgM3: 3344, gravityMS2: 1.62, escapeKmS: 2.38,
      siderealRotationH: 655.72, dayLengthH: 708.7,
      parentDistanceKm: 384400, periapsisKm: 363300, apoapsisKm: 405500,
      orbitalPeriodD: 27.3217, orbitalVelKmS: 1.022, inclinationDeg: 5.145, eccentricity: 0.0549,
      obliquityDeg: 6.68, meanTempC: -20, tempNoteAr: 'من −173°م ليلاً إلى 127°م نهاراً',
      moons: 0,
    },
    orbit: { model: 'lunar' },
    rotation: { model: 'iau-moon' },
    render: { kind: 'rocky', proc: 'moon', lunar: 0.85, bumpFromMap: 1.6, minAltitudeR: 0.0015 },
    descAr: 'التابع الطبيعي الوحيد للأرض وخامس أكبر قمر في النظام الشمسي. مقيَّد مدّياً فيُظهر لنا الوجه نفسه دائماً. تكوّن على الأرجح من اصطدام جرم بحجم المريخ بالأرض قبل نحو 4.5 مليار سنة، ووطئه 12 رائد فضاء بين 1969 و1972.',
  },

  /* ============================== المريخ ============================== */
  mars: {
    id: 'mars', type: 'planet', nameAr: 'المريخ', nameEn: 'Mars', color: '#e2703f',
    radiusKm: 3389.5, eqRadiusKm: 3396.2, polarRadiusKm: 3376.2,
    facts: {
      kindAr: 'كوكب صخري',
      massE24: 0.642, diameterKm: 6792, densityKgM3: 3934, gravityMS2: 3.7, escapeKmS: 5.0,
      siderealRotationH: 24.6229, dayLengthH: 24.7,
      distanceMkm: 228.0, perihelionMkm: 206.7, aphelionMkm: 249.3,
      orbitalPeriodD: 687.0, orbitalVelKmS: 24.1, inclinationDeg: 1.8, eccentricity: 0.094,
      obliquityDeg: 25.19, meanTempC: -65, tempNoteAr: 'من −140°م إلى 20°م',
      moons: 2, rings: false, pressureBar: 0.006,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131],
            L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
      t2: { a: [1.52371243, 0.00000097], e: [0.09336511, 0.00009149], I: [1.85181869, -0.00724757],
            L: [-4.56813164, 19140.29934243], peri: [-23.91744784, 0.45223625], node: [49.71320984, -0.26852431] },
    },
    rotation: { ra: [317.68143, -0.1061], dec: [52.88650, -0.0609], W: [176.630, 350.89198226] },
    render: {
      kind: 'rocky', proc: 'mars', lunar: 0.25, bumpFromMap: 1.0, minAltitudeR: 0.0015,
      atmosphere: { topR: 0.02, hR: 0.0033, hM: 0.0033, tauR: [0.002, 0.005, 0.012], tauM: [0.22, 0.16, 0.10], g: 0.65, intensity: 11 },
    },
    descAr: 'الكوكب الأحمر، ولونه من أكاسيد الحديد في تربته. فيه أعلى بركان في النظام الشمسي (أوليمبوس مونس بارتفاع نحو 22 كم) وأخدود وادي مارينر الهائل. غلافه الجوي رقيق جداً، وتجوبه اليوم مركبات جوّالة مثل برسفيرنس وكيوريوسيتي.',
  },

  /* ============================== فوبوس ============================== */
  phobos: {
    id: 'phobos', type: 'moon', parent: 'mars', nameAr: 'فوبوس', nameEn: 'Phobos', color: '#a89482',
    radiusKm: 11.08, eqRadiusKm: 11.08, polarRadiusKm: 11.08, shapeKm: [13.0, 11.4, 9.1],
    facts: {
      kindAr: 'قمر طبيعي (تابع المريخ)',
      massE24: 1.0659e-8, diameterKm: 22.2, densityKgM3: 1861, gravityMS2: 0.0057, escapeKmS: 0.0114,
      siderealRotationH: 7.6538, parentDistanceKm: 9376, orbitalPeriodD: 0.31891,
      inclinationDeg: 1.075, eccentricity: 0.0151, meanTempC: -40, tempNoteAr: 'من −112°م إلى −4°م', moons: 0,
    },
    orbit: { model: 'mean', aKm: 9376, e: 0.0151, iDeg: 1.075, nodeDeg: 207.784, wDeg: 150.057, MDeg: 91.059,
             nDegPerDay: 1128.8447569, PwYr: 1.1316, PnodeYr: 2.2617 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'phobos', lunar: 0.8, bumpFromMap: 1.4, irregular: { seed: 3.1, amp: 0.10 }, minAltitudeR: 0.02 },
    descAr: 'أكبر قمرَي المريخ وأقربهما، جسم صخري غير منتظم الشكل تميّزه فوهة ستيكني الكبيرة. يدور حول المريخ ثلاث مرات يومياً تقريباً ويقترب منه تدريجياً، وسيتحطم أو يتحول إلى حلقة خلال نحو 50 مليون سنة.',
  },

  /* ============================== دايموس ============================== */
  deimos: {
    id: 'deimos', type: 'moon', parent: 'mars', nameAr: 'دايموس', nameEn: 'Deimos', color: '#b9a690',
    radiusKm: 6.2, eqRadiusKm: 6.2, polarRadiusKm: 6.2, shapeKm: [7.8, 6.0, 5.1],
    facts: {
      kindAr: 'قمر طبيعي (تابع المريخ)',
      massE24: 1.4762e-9, diameterKm: 12.4, densityKgM3: 1471, gravityMS2: 0.003, escapeKmS: 0.0056,
      siderealRotationH: 30.3, parentDistanceKm: 23458, orbitalPeriodD: 1.26244,
      inclinationDeg: 1.788, eccentricity: 0.0002, meanTempC: -40, tempNoteAr: 'من −112°م إلى −4°م', moons: 0,
    },
    orbit: { model: 'mean', aKm: 23458, e: 0.0002, iDeg: 1.788, nodeDeg: 24.525, wDeg: 260.729, MDeg: 325.329,
             nDegPerDay: 285.1618790, PwYr: 27.0, PnodeYr: 54.5364 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'deimos', lunar: 0.8, bumpFromMap: 1.0, irregular: { seed: 7.7, amp: 0.08 }, minAltitudeR: 0.02 },
    descAr: 'أصغر قمرَي المريخ وأبعدهما، صغير وغير منتظم الشكل وسطحه أملس نسبياً بسبب طبقة سميكة من الغبار. يُرجَّح أنه كويكب أُسر أو بقايا اصطدام قديم بالمريخ.',
  },

  /* ============================== المشتري ============================== */
  jupiter: {
    id: 'jupiter', type: 'planet', nameAr: 'المشتري', nameEn: 'Jupiter', color: '#d9b48a',
    radiusKm: 69911, eqRadiusKm: 71492, polarRadiusKm: 66854,
    facts: {
      kindAr: 'عملاق غازي',
      massE24: 1898, diameterKm: 142984, densityKgM3: 1326, gravityMS2: 23.1, escapeKmS: 59.5,
      siderealRotationH: 9.9250, dayLengthH: 9.9,
      distanceMkm: 778.5, perihelionMkm: 740.6, aphelionMkm: 816.4,
      orbitalPeriodD: 4331, orbitalVelKmS: 13.1, inclinationDeg: 1.3, eccentricity: 0.049,
      obliquityDeg: 3.13, meanTempC: -110, tempNoteAr: 'عند مستوى ضغط 1 بار',
      moons: 95, rings: true,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],
            L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
      t2: { a: [5.20248019, -0.00002864], e: [0.04853590, 0.00018026], I: [1.29861416, -0.00322699],
            L: [34.33479152, 3034.90371757], peri: [14.27495244, 0.18199196], node: [100.29282654, 0.13024619],
            b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000 },
    },
    rotation: { ra: [268.056595, -0.006499], dec: [64.495303, 0.002413], W: [284.95, 870.5360000] },
    render: {
      kind: 'gas', proc: 'jupiter', minnaert: 1.08, minAltitudeR: 0.002,
      atmosphere: { topR: 0.012, hR: 0.0012, hM: 0.0015, tauR: [0.008, 0.014, 0.03], tauM: [0.04, 0.036, 0.03], g: 0.7, intensity: 3.2 },
    },
    descAr: 'أكبر كواكب المجموعة الشمسية، وكتلته أكبر من ضعفي كتلة بقية الكواكب مجتمعة. عملاق غازي من الهيدروجين والهيليوم تزيّنه أحزمة سحب ملونة والبقعة الحمراء العظيمة: عاصفة أكبر من الأرض مستمرة منذ أكثر من 350 عاماً. يومه الأقصر بين الكواكب (أقل من 10 ساعات).',
  },

  /* ============================== آيو ============================== */
  io: {
    id: 'io', type: 'moon', parent: 'jupiter', nameAr: 'آيو', nameEn: 'Io', color: '#e8d36a',
    radiusKm: 1821.6, eqRadiusKm: 1821.6, polarRadiusKm: 1821.6,
    facts: {
      kindAr: 'قمر غاليلي (تابع المشتري)',
      massE24: 0.08932, diameterKm: 3643.2, densityKgM3: 3528, gravityMS2: 1.796, escapeKmS: 2.56,
      siderealRotationH: 42.46, parentDistanceKm: 421800, orbitalPeriodD: 1.769,
      inclinationDeg: 0.04, eccentricity: 0.0041, meanTempC: -163, tempNoteAr: 'البراكين تتجاوز 1,600°م', moons: 0,
    },
    // الطور (MDeg) معايَر مقابل نظرية L1.2 لأقمار المشتري (خطأ < 1°)
    orbit: { model: 'mean', aKm: 421800, e: 0.0041, iDeg: 0.036, nodeDeg: 43.977, wDeg: 84.129, MDeg: 251.840,
             nDegPerDay: 203.4889538, PwYr: 0.0, PnodeYr: 0.0 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'io', lunar: 0.4, bumpFromMap: 0.6, minAltitudeR: 0.0015 },
    descAr: 'أكثر الأجرام نشاطاً بركانياً في النظام الشمسي، فيه أكثر من 400 بركان نشط تقذف الكبريت عشرات الكيلومترات. سبب ذلك الحرارة الناتجة عن قوى المد الهائلة من المشتري وتأثير القمرين أوروبا وغانيميد.',
  },

  /* ============================== أوروبا ============================== */
  europa: {
    id: 'europa', type: 'moon', parent: 'jupiter', nameAr: 'أوروبا', nameEn: 'Europa', color: '#d8cdb8',
    radiusKm: 1560.8, eqRadiusKm: 1560.8, polarRadiusKm: 1560.8,
    facts: {
      kindAr: 'قمر غاليلي (تابع المشتري)',
      massE24: 0.04800, diameterKm: 3121.6, densityKgM3: 3013, gravityMS2: 1.314, escapeKmS: 2.025,
      siderealRotationH: 85.23, parentDistanceKm: 671100, orbitalPeriodD: 3.551,
      inclinationDeg: 0.466, eccentricity: 0.0094, meanTempC: -171, tempNoteAr: 'قشرة جليدية فوق محيط مائي', moons: 0,
    },
    orbit: { model: 'mean', aKm: 671100, e: 0.0094, iDeg: 0.466, nodeDeg: 219.106, wDeg: 88.970, MDeg: 266.430,
             nDegPerDay: 101.3747235, PwYr: 0.0, PnodeYr: 30.207 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'europa', lunar: 0.3, bumpFromMap: 0.5, minAltitudeR: 0.0015 },
    descAr: 'قمر جليدي أملس تغطيه قشرة متشققة من الجليد، ويُعتقد أن تحتها محيطاً مالحاً عالمياً فيه ماء أكثر مما في كل محيطات الأرض. من أقوى المرشحين لاحتضان حياة خارج الأرض، وتدرسه مركبة يوروبا كليبر.',
  },

  /* ============================== غانيميد ============================== */
  ganymede: {
    id: 'ganymede', type: 'moon', parent: 'jupiter', nameAr: 'غانيميد', nameEn: 'Ganymede', color: '#b8ab9b',
    radiusKm: 2631.2, eqRadiusKm: 2631.2, polarRadiusKm: 2631.2,
    facts: {
      kindAr: 'قمر غاليلي (تابع المشتري)',
      massE24: 0.14819, diameterKm: 5262.4, densityKgM3: 1942, gravityMS2: 1.428, escapeKmS: 2.741,
      siderealRotationH: 171.71, parentDistanceKm: 1070400, orbitalPeriodD: 7.155,
      inclinationDeg: 0.177, eccentricity: 0.0013, meanTempC: -163, tempNoteAr: 'من −203°م إلى −121°م', moons: 0,
    },
    orbit: { model: 'mean', aKm: 1070400, e: 0.0013, iDeg: 0.177, nodeDeg: 63.552, wDeg: 192.417, MDeg: 325.818,
             nDegPerDay: 50.3176081, PwYr: 0.0, PnodeYr: 137.812 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'ganymede', lunar: 0.4, bumpFromMap: 0.8, minAltitudeR: 0.0015 },
    descAr: 'أكبر قمر في النظام الشمسي، وقطره أكبر من قطر كوكب عطارد. القمر الوحيد المعروف بامتلاكه مجالاً مغناطيسياً خاصاً به، ويُعتقد بوجود محيط مائي تحت سطحه. تستهدفه مركبة جوس الأوروبية.',
  },

  /* ============================== كاليستو ============================== */
  callisto: {
    id: 'callisto', type: 'moon', parent: 'jupiter', nameAr: 'كاليستو', nameEn: 'Callisto', color: '#8f8270',
    radiusKm: 2410.3, eqRadiusKm: 2410.3, polarRadiusKm: 2410.3,
    facts: {
      kindAr: 'قمر غاليلي (تابع المشتري)',
      massE24: 0.10759, diameterKm: 4820.6, densityKgM3: 1834, gravityMS2: 1.235, escapeKmS: 2.440,
      siderealRotationH: 400.54, parentDistanceKm: 1882700, orbitalPeriodD: 16.689,
      inclinationDeg: 0.192, eccentricity: 0.0074, meanTempC: -139, tempNoteAr: 'من −193°م إلى −108°م', moons: 0,
    },
    orbit: { model: 'mean', aKm: 1882700, e: 0.0074, iDeg: 0.192, nodeDeg: 298.848, wDeg: 52.643, MDeg: 89.487,
             nDegPerDay: 21.5710715, PwYr: 0.0, PnodeYr: 577.264 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'callisto', lunar: 0.6, bumpFromMap: 1.2, minAltitudeR: 0.0015 },
    descAr: 'ثاني أكبر أقمار المشتري، وسطحه من أكثر الأسطح امتلاءً بالفوهات في النظام الشمسي ولم يتغير كثيراً منذ مليارات السنين. يقع خارج حزام الإشعاع الأشد للمشتري، لذلك يُعدّ موقعاً محتملاً لقواعد استكشاف مستقبلية.',
  },

  /* ============================== زحل ============================== */
  saturn: {
    id: 'saturn', type: 'planet', nameAr: 'زحل', nameEn: 'Saturn', color: '#e7cf96',
    radiusKm: 58232, eqRadiusKm: 60268, polarRadiusKm: 54364,
    facts: {
      kindAr: 'عملاق غازي',
      massE24: 568, diameterKm: 120536, densityKgM3: 687, gravityMS2: 9.0, escapeKmS: 35.5,
      siderealRotationH: 10.656, dayLengthH: 10.7,
      distanceMkm: 1432.0, perihelionMkm: 1357.6, aphelionMkm: 1506.5,
      orbitalPeriodD: 10747, orbitalVelKmS: 9.7, inclinationDeg: 2.5, eccentricity: 0.052,
      obliquityDeg: 26.73, meanTempC: -140, tempNoteAr: 'عند مستوى ضغط 1 بار',
      moons: 274, rings: true,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],
            L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
      t2: { a: [9.54149883, -0.00003065], e: [0.05550825, -0.00032044], I: [2.49424102, 0.00451969],
            L: [50.07571329, 1222.11494724], peri: [92.86136063, 0.54179478], node: [113.63998702, -0.25015002],
            b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125000 },
    },
    rotation: { ra: [40.589, -0.036], dec: [83.537, -0.004], W: [38.90, 810.7939024] },
    render: {
      kind: 'gas', proc: 'saturn', minnaert: 1.05, minAltitudeR: 0.002,
      // الحلقات (كم): D/C/B/Cassini/A/Encke/Keeler/F
      rings: { innerKm: 66900, outerKm: 140400, proc: 'saturn', textureInnerKm: 74500, textureOuterKm: 136780, brightness: 1.0 },
      atmosphere: { topR: 0.015, hR: 0.0018, hM: 0.002, tauR: [0.006, 0.011, 0.022], tauM: [0.04, 0.036, 0.028], g: 0.7, intensity: 3.2 },
    },
    descAr: 'جوهرة المجموعة الشمسية بحلقاته المذهلة المكوّنة من بلايين القطع الجليدية والصخرية؛ يمتد نظام حلقاته الرئيسي لنحو 280 ألف كم بينما سماكته غالباً لا تتجاوز عشرات الأمتار. كثافته أقل من كثافة الماء، وعند قطبه الشمالي إعصار سداسي الشكل فريد.',
  },

  /* ============================== تيتان ============================== */
  titan: {
    id: 'titan', type: 'moon', parent: 'saturn', nameAr: 'تيتان', nameEn: 'Titan', color: '#e3a857',
    radiusKm: 2574.73, eqRadiusKm: 2574.73, polarRadiusKm: 2574.73,
    facts: {
      kindAr: 'قمر (تابع زحل)',
      massE24: 0.13452, diameterKm: 5149.5, densityKgM3: 1880, gravityMS2: 1.352, escapeKmS: 2.639,
      siderealRotationH: 382.69, parentDistanceKm: 1221870, orbitalPeriodD: 15.945,
      inclinationDeg: 0.28, eccentricity: 0.0288, meanTempC: -179, tempNoteAr: 'ضغط سطحه 1.5 ضعف ضغط الأرض', moons: 0, pressureBar: 1.5,
    },
    orbit: { model: 'mean', aKm: 1221870, e: 0.0288, iDeg: 0.280, nodeDeg: 24.502, wDeg: 180.532, MDeg: 163.310,
             nDegPerDay: 22.5769768, PwYr: 703.0, PnodeYr: 703.0 },
    rotation: { model: 'tidal' },
    render: {
      kind: 'rocky', proc: 'titan', lunar: 0.0, bumpFromMap: 0.0, minAltitudeR: 0.0015,
      atmosphere: { topR: 0.2, hR: 0.016, hM: 0.03, tauR: [0.05, 0.08, 0.15], tauM: [1.1, 0.75, 0.32], g: 0.6, intensity: 9 },
    },
    descAr: 'أكبر أقمار زحل وثاني أكبر قمر في النظام الشمسي، والقمر الوحيد ذو غلاف جوي كثيف (معظمه نيتروجين). على سطحه بحيرات وأنهار من الميثان والإيثان السائلين، وهبط عليه مسبار هويغنز عام 2005، وستزوره مركبة دراغونفلاي.',
  },

  /* ============================== أورانوس ============================== */
  uranus: {
    id: 'uranus', type: 'planet', nameAr: 'أورانوس', nameEn: 'Uranus', color: '#9fe2ea',
    radiusKm: 25362, eqRadiusKm: 25559, polarRadiusKm: 24973,
    facts: {
      kindAr: 'عملاق جليدي',
      massE24: 86.8, diameterKm: 51118, densityKgM3: 1270, gravityMS2: 8.7, escapeKmS: 21.3,
      siderealRotationH: -17.24, dayLengthH: 17.2,
      distanceMkm: 2867.0, perihelionMkm: 2732.7, aphelionMkm: 3001.4,
      orbitalPeriodD: 30589, orbitalVelKmS: 6.8, inclinationDeg: 0.8, eccentricity: 0.047,
      obliquityDeg: 97.77, meanTempC: -195, tempNoteAr: 'عند مستوى ضغط 1 بار',
      moons: 29, rings: true,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939],
            L: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589] },
      t2: { a: [19.18797948, -0.00020455], e: [0.04685740, -0.00001550], I: [0.77298127, -0.00180155],
            L: [314.20276625, 428.49512595], peri: [172.43404441, 0.09266985], node: [73.96250215, 0.05739699],
            b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025000 },
    },
    // ميل ≈ 98° ودوران عكسي (معدل W سالب)
    rotation: { ra: [257.311, 0], dec: [-15.175, 0], W: [203.81, -501.1600928] },
    render: {
      kind: 'gas', proc: 'uranus', minnaert: 1.0, minAltitudeR: 0.002,
      rings: { innerKm: 37850, outerKm: 51250, proc: 'uranus', brightness: 0.8 },
      atmosphere: { topR: 0.02, hR: 0.0022, hM: 0.002, tauR: [0.03, 0.08, 0.12], tauM: [0.02, 0.03, 0.035], g: 0.7, intensity: 9 },
    },
    descAr: 'عملاق جليدي يتميّز بميل محوره الشديد (نحو 98°) فيبدو كأنه يتدحرج على مداره، فيعيش كل قطب نحو 42 سنة من النهار المتواصل ثم 42 سنة من الليل. لونه الأزرق المخضر من غاز الميثان ودورانه عكسي. اكتشفه ويليام هيرشل عام 1781.',
  },

  /* ============================== نبتون ============================== */
  neptune: {
    id: 'neptune', type: 'planet', nameAr: 'نبتون', nameEn: 'Neptune', color: '#5b7dff',
    radiusKm: 24622, eqRadiusKm: 24764, polarRadiusKm: 24341,
    facts: {
      kindAr: 'عملاق جليدي',
      massE24: 102, diameterKm: 49528, densityKgM3: 1638, gravityMS2: 11.0, escapeKmS: 23.5,
      siderealRotationH: 16.11, dayLengthH: 16.1,
      distanceMkm: 4515.0, perihelionMkm: 4471.1, aphelionMkm: 4558.9,
      orbitalPeriodD: 59800, orbitalVelKmS: 5.4, inclinationDeg: 1.8, eccentricity: 0.010,
      obliquityDeg: 28.32, meanTempC: -200, tempNoteAr: 'عند مستوى ضغط 1 بار',
      moons: 16, rings: true,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372],
            L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664] },
      t2: { a: [30.06952752, 0.00006447], e: [0.00895439, 0.00000818], I: [1.77005520, 0.00022400],
            L: [304.22289287, 218.46515314], peri: [46.68158724, 0.01009938], node: [131.78635853, -0.00606302],
            b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000 },
    },
    rotation: { model: 'iau-neptune' },
    render: {
      kind: 'gas', proc: 'neptune', minnaert: 1.0, minAltitudeR: 0.002,
      rings: { innerKm: 40000, outerKm: 63500, proc: 'neptune', brightness: 0.8 },
      atmosphere: { topR: 0.02, hR: 0.0016, hM: 0.002, tauR: [0.03, 0.07, 0.16], tauM: [0.02, 0.025, 0.03], g: 0.7, intensity: 9 },
    },
    descAr: 'أبعد الكواكب عن الشمس، عملاق جليدي أزرق تهب فيه أسرع رياح في النظام الشمسي (أكثر من 2,000 كم/س). اكتُشف عام 1846 بالحسابات الرياضية قبل أن يُرصد بالتلسكوب، ويحتاج نحو 165 سنة أرضية ليكمل دورة واحدة حول الشمس.',
  },

  /* ============================== تريتون ============================== */
  triton: {
    id: 'triton', type: 'moon', parent: 'neptune', nameAr: 'تريتون', nameEn: 'Triton', color: '#e9c9bf',
    radiusKm: 1353.4, eqRadiusKm: 1353.4, polarRadiusKm: 1353.4,
    facts: {
      kindAr: 'قمر (تابع نبتون) — مدار تراجعي',
      massE24: 0.02139, diameterKm: 2706.8, densityKgM3: 2061, gravityMS2: 0.779, escapeKmS: 1.455,
      siderealRotationH: 141.04, parentDistanceKm: 354759, orbitalPeriodD: -5.877,
      inclinationDeg: 156.865, eccentricity: 0.000016, meanTempC: -235, tempNoteAr: 'من أبرد الأسطح المعروفة', moons: 0,
    },
    orbit: { model: 'mean', aKm: 354759, e: 0.0000, iDeg: 156.865, nodeDeg: 177.608, wDeg: 344.046, MDeg: 264.775,
             nDegPerDay: 61.2588532, PwYr: 0.0, PnodeYr: 688.0 },
    rotation: { model: 'tidal' },
    render: { kind: 'rocky', proc: 'triton', lunar: 0.4, bumpFromMap: 0.6, minAltitudeR: 0.0015 },
    descAr: 'أكبر أقمار نبتون، ويدور حوله بعكس اتجاه دوران الكوكب (مدار تراجعي)، ما يدل على أنه جرم من حزام كايبر أسَرَه نبتون. سطحه من أبرد الأسطح المعروفة (−235°م) وفيه ينابيع تقذف النيتروجين.',
  },

  /* ============================== بلوتو ============================== */
  pluto: {
    id: 'pluto', type: 'dwarf', nameAr: 'بلوتو', nameEn: 'Pluto', color: '#d8bf9f',
    radiusKm: 1188.3, eqRadiusKm: 1188.3, polarRadiusKm: 1188.3,
    facts: {
      kindAr: 'كوكب قزم (حزام كايبر)',
      massE24: 0.0130, diameterKm: 2376, densityKgM3: 1854, gravityMS2: 0.62, escapeKmS: 1.21,
      siderealRotationH: -153.2928, dayLengthH: 153.3,
      distanceMkm: 5906.4, perihelionMkm: 4436.8, aphelionMkm: 7375.9,
      orbitalPeriodD: 90560, orbitalVelKmS: 4.7, inclinationDeg: 17.2, eccentricity: 0.244,
      obliquityDeg: 122.53, meanTempC: -225, tempNoteAr: 'من −240°م إلى −218°م',
      moons: 5, rings: false, pressureBar: 0.00001,
    },
    orbit: {
      model: 'kepler',
      t1: { a: [39.48211675, -0.00031596], e: [0.24882730, 0.00005170], I: [17.14001206, 0.00004818],
            L: [238.92903833, 145.20780515], peri: [224.06891629, -0.04062942], node: [110.30393684, -0.01183482] },
      t2: { a: [39.48686035, 0.00449751], e: [0.24885238, 0.00006016], I: [17.14104260, 0.00000501],
            L: [238.96535011, 145.18042903], peri: [224.09702598, -0.00968827], node: [110.30167986, -0.00809981],
            b: -0.01262724, c: 0, s: 0, f: 0 },
    },
    rotation: { ra: [132.993, 0], dec: [-6.163, 0], W: [302.695, 56.3625225] },
    render: {
      kind: 'rocky', proc: 'pluto', lunar: 0.35, bumpFromMap: 0.6, minAltitudeR: 0.0015,
      atmosphere: { topR: 0.12, hR: 0.04, hM: 0.04, tauR: [0.0015, 0.003, 0.006], tauM: [0.002, 0.003, 0.006], g: 0.6, intensity: 8 },
    },
    descAr: 'كوكب قزم في حزام كايبر، كان يُعدّ الكوكب التاسع حتى عام 2006. كشفت مركبة نيو هورايزنز عام 2015 سهلاً جليدياً على شكل قلب (منطقة تومبو) وجبالاً من جليد الماء. مداره بيضاوي ومائل بشدة، ويدور حول نفسه دوراناً عكسياً.',
  },
};

/** ترتيب الأجرام في القائمة والتنقل بالأسهم */
export const BODY_ORDER = [
  'sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos',
  'jupiter', 'io', 'europa', 'ganymede', 'callisto',
  'saturn', 'titan', 'uranus', 'neptune', 'triton', 'pluto',
];

/** مجموعات القائمة الجانبية */
export const BODY_GROUPS = [
  { titleAr: 'النجم', ids: ['sun'] },
  { titleAr: 'الكواكب', ids: ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] },
  { titleAr: 'كوكب قزم', ids: ['pluto'] },
  { titleAr: 'الأقمار', ids: ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'triton'] },
];

/** إعدادات حزام الكويكبات (توزيع واقعي مع فجوات كيركوود) */
export const ASTEROID_BELT = {
  aMinAU: 2.06, aMaxAU: 3.30,
  // فجوات كيركوود (رنين مع المشتري): [مركز الفجوة AU, نصف العرض AU]
  kirkwoodGaps: [[2.502, 0.03], [2.825, 0.025], [2.958, 0.02], [3.279, 0.03]],
  eccentricitySigma: 0.07, eccentricityMax: 0.30,
  inclinationSigmaDeg: 7.0, inclinationMaxDeg: 30,
  radiusMinKm: 0.6, radiusMaxKm: 60, radiusPowerLaw: 2.4,
  shapeVariants: 6,
};

/* ---------------------------------------------------------------------------
 * 4) الصور (Textures)
 * ---------------------------------------------------------------------------
 *  ضع الملفات داخل مجلد  solar-system/textures/  بنفس الأسماء بالضبط.
 *  لكل خانة قائمة أسماء بديلة تُجرّب بالترتيب؛ وإذا فشلت كلها يُولَّد بديل
 *  بالكود (procedural) تلقائياً والمحاكاة تكمل.
 *   '2k' = الدقة الأساسية (تحميل أولي سريع)
 *   '8k' = الدقة العالية (تُحمَّل تدريجياً عند الاقتراب — LOD)
 * ------------------------------------------------------------------------- */
export const TEXTURES = {
  basePath: './textures/',
  sources: {
    solarSystemScope: 'https://www.solarsystemscope.com/textures/download/',
  },
  bodies: {
    sun:      { map: { '2k': ['2k_sun.jpg'], '8k': ['8k_sun.jpg'] } },
    mercury:  { map: { '2k': ['2k_mercury.jpg'], '8k': ['8k_mercury.jpg'] } },
    venus: {
      map:    { '2k': ['2k_venus_surface.jpg'], '8k': ['8k_venus_surface.jpg'] },
      clouds: { '2k': ['2k_venus_atmosphere.jpg'], '8k': ['4k_venus_atmosphere.jpg'] },
    },
    earth: {
      // النهار: Blue Marble (NASA) — الليل: Black Marble (NASA) — عبر Solar System Scope
      map:      { '2k': ['2k_earth_daymap.jpg'], '8k': ['8k_earth_daymap.jpg', 'nasa_blue_marble_8k.jpg'] },
      night:    { '2k': ['2k_earth_nightmap.jpg'], '8k': ['8k_earth_nightmap.jpg', 'nasa_black_marble_8k.jpg'] },
      clouds:   { '2k': ['2k_earth_clouds.jpg'], '8k': ['8k_earth_clouds.jpg'] },
      // ملاحظة: Solar System Scope ينشر هذين الملفين بصيغة TIFF، والمتصفح لا يقرأ TIFF،
      // لذلك سكربت التحميل يحوّلهما إلى PNG تلقائياً.
      normal:   { '2k': ['2k_earth_normal_map.png', '2k_earth_normal_map.jpg'], '8k': ['8k_earth_normal_map.png', '8k_earth_normal_map.jpg'] },
      specular: { '2k': ['2k_earth_specular_map.png', '2k_earth_specular_map.jpg'], '8k': ['8k_earth_specular_map.png', '8k_earth_specular_map.jpg'] },
    },
    moon:     { map: { '2k': ['2k_moon.jpg'], '8k': ['8k_moon.jpg'] }, bump: { '2k': ['moon_bump.jpg'] } },
    mars:     { map: { '2k': ['2k_mars.jpg'], '8k': ['8k_mars.jpg'] } },
    jupiter:  { map: { '2k': ['2k_jupiter.jpg'], '8k': ['8k_jupiter.jpg'] } },
    saturn: {
      map:  { '2k': ['2k_saturn.jpg'], '8k': ['8k_saturn.jpg'] },
      ring: { '2k': ['2k_saturn_ring_alpha.png'], '8k': ['8k_saturn_ring_alpha.png'] },
    },
    uranus:   { map: { '2k': ['2k_uranus.jpg'] } },
    neptune:  { map: { '2k': ['2k_neptune.jpg'] } },
    // اختيارية (غير متوفرة في Solar System Scope) — إذا لم تجدها يُولَّد سطح بالكود
    pluto:    { map: { '2k': ['pluto.jpg'] } },
    phobos:   { map: { '2k': ['phobos.jpg'] } },
    deimos:   { map: { '2k': ['deimos.jpg'] } },
    io:       { map: { '2k': ['io.jpg'] } },
    europa:   { map: { '2k': ['europa.jpg'] } },
    ganymede: { map: { '2k': ['ganymede.jpg'] } },
    callisto: { map: { '2k': ['callisto.jpg'] } },
    titan:    { map: { '2k': ['titan.jpg'] } },
    triton:   { map: { '2k': ['triton.jpg'] } },
  },
  sky: { '2k': ['2k_stars_milky_way.jpg'], '8k': ['8k_stars_milky_way.jpg'] },
  // إزاحة خط الطول (°) إذا كانت صورة ما ليست متمركزة على خط الطول 0
  lonOffsetDeg: { },
  // اتجاه صورة درب التبانة: الصورة بإحداثيات مجرّية، المركز في المنتصف و l تزداد لليسار
  skyFlipX: false,
};

/** سطر نسب الحقوق الظاهر في الواجهة */
export const CREDITS_AR =
  'الصور: Solar System Scope (CC BY 4.0) · NASA Visible Earth (Blue Marble / Black Marble) · ' +
  'البيانات: NASA NSSDCA Planetary Fact Sheet · JPL Solar System Dynamics · IAU WGCCRE · ' +
  'المحرك: three.js';

/* ---------------------------------------------------------------------------
 * 5) إعدادات الجودة
 * ------------------------------------------------------------------------- */
export const QUALITY_PRESETS = {
  low: {
    nameAr: 'منخفض', pixelRatio: 1.0, msaa: 0, maxTier: '2k', hiResOnApproach: false,
    sphereSegments: [128, 64, 32], asteroidCount: 2500, atmoSteps: 8, normalMaps: false,
    detail: false, bloom: true, bloomResolution: 0.5, procSize: 1024, skyTier: '2k', anisotropy: 4,
  },
  medium: {
    nameAr: 'متوسط', pixelRatio: 1.5, msaa: 2, maxTier: '2k', hiResOnApproach: false,
    sphereSegments: [256, 96, 40], asteroidCount: 6000, atmoSteps: 12, normalMaps: true,
    detail: true, bloom: true, bloomResolution: 0.75, procSize: 2048, skyTier: '2k', anisotropy: 16,
  },
  high: {
    nameAr: 'عالي', pixelRatio: 2.0, msaa: 4, maxTier: '8k', hiResOnApproach: true, hiResAll: false,
    hiResSlots: ['map', 'clouds', 'ring'],
    sphereSegments: [384, 128, 48], asteroidCount: 12000, atmoSteps: 16, normalMaps: true,
    detail: true, bloom: true, bloomResolution: 1.0, procSize: 2048, skyTier: '8k', anisotropy: 16,
  },
  ultra: {
    nameAr: 'فائق', pixelRatio: 2.0, msaa: 4, maxTier: '8k', hiResOnApproach: true, hiResAll: true, preloadHigh: ['earth'],
    hiResSlots: ['map', 'night', 'clouds', 'normal', 'specular', 'ring'],
    sphereSegments: [512, 192, 64], asteroidCount: 20000, atmoSteps: 24, normalMaps: true,
    detail: true, bloom: true, bloomResolution: 1.0, procSize: 2048, skyTier: '8k', anisotropy: 16,
  },
};

/* ---------------------------------------------------------------------------
 * 6) المقياس المرئي (مسافات مضغوطة وأحجام مكبرة)
 *    المسافة عن الشمس:  r' = R☉ × (offset + factor × r_AU^exponent)
 *    نصف القطر:         R' = R☉ × earthR × (R / R_earth)^exponent
 *    بُعد القمر:        d' = R'_parent × (base + factor × (d / R_parent)^exponent)
 *    الانتقال بين الوضعين لوغاريتمي (ناعم) خلال transitionSeconds
 * ------------------------------------------------------------------------- */
export const SCALE = {
  visual: {
    distance: { offset: 2.5, factor: 22, exponent: 0.6 },
    radius: { earthR: 0.1, exponent: 0.7 },
    moonDistance: { base: 1.6, factor: 1.1, exponent: 0.5 },
  },
  transitionSeconds: 2.6,
  defaultMode: 'visual', // 'visual' | 'real'
};

/* ---------------------------------------------------------------------------
 * 7) سرعات الوقت (ثانية محاكاة لكل ثانية حقيقية)
 * ------------------------------------------------------------------------- */
export const TIME_SPEEDS = [
  { id: 'real', labelAr: 'حقيقي', rate: 1 },
  { id: 'hour', labelAr: 'ساعة/ث', rate: 3600 },
  { id: 'day', labelAr: 'يوم/ث', rate: 86400 },
  { id: 'month', labelAr: 'شهر/ث', rate: 2629746 },
  { id: 'year', labelAr: 'سنة/ث', rate: 31556952 },
];
