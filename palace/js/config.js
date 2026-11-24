/* ============================================================================
 *  config.js — كل إعدادات القصر بمكان واحد
 *  ---------------------------------------------------------------------------
 *  الوحدات بالمتر. المحاور: x شرق، z جنوب، y للأعلى. أرضية القصر على y = 0.
 *  1) التوقيع والتطبيق
 *  2) الجودة
 *  3) مخطط القصر: الغرف والجدران والفتحات
 *  4) الخامات والألوان
 *  5) كتالوج الأثاث
 *  6) التأثيث الافتراضي
 * ========================================================================== */

/* -------------------------------------------------------------- 1) التوقيع */
export const SIGNATURE = 'Py | Sohaib Qudeih';
export const APP = {
  titleAr: 'القصر',
  titleEn: 'The Palace',
  subtitleAr: 'تجوّل وصمّم قصرك بأدق التفاصيل',
  welcomeAr: 'أهلاً وسهلاً',
  storageKey: 'palace-design-v1',
  prefsKey: 'palace-prefs-v1',
};

/* -------------------------------------------------------------- 2) الجودة */
export const QUALITY = {
  low: {
    nameAr: 'منخفض', pixelRatio: 1, msaa: 0, shadow: 1024, shadowRadius: 3, reflection: 0, ao: false,
    bloom: true, tex: { floor: 512, wall: 512, small: 256 }, probeSize: 64, bounces: 1, anisotropy: 4,
  },
  medium: {
    nameAr: 'متوسط', pixelRatio: 1.25, msaa: 2, shadow: 2048, shadowRadius: 3, reflection: 0.35, ao: false,
    bloom: true, tex: { floor: 1024, wall: 512, small: 512 }, probeSize: 128, bounces: 1, anisotropy: 8,
  },
  high: {
    nameAr: 'عالي', pixelRatio: 1.75, msaa: 4, shadow: 4096, shadowRadius: 4, reflection: 0.5, ao: true,
    bloom: true, tex: { floor: 1024, wall: 1024, small: 512 }, probeSize: 256, bounces: 1, anisotropy: 16,
  },
  ultra: {
    nameAr: 'فائق', pixelRatio: 2, msaa: 4, shadow: 4096, shadowRadius: 4, reflection: 0.75, ao: true,
    bloom: true, tex: { floor: 1536, wall: 1024, small: 512 }, probeSize: 256, bounces: 1, anisotropy: 16,
  },
};

/* -------------------------------------------------------------- 3) المخطط
 * rect = [x0, z0, x1, z1]
 * floor/wall/ceiling = مفاتيح من القوائم بالأسفل
 */
export const ROOMS = [
  {
    id: 'entrance', nameAr: 'بهو المدخل', rect: [-10, 10, 10, 18], height: 8,
    floor: 'checker', wall: { finish: 'stucco', color: '#efe6d6' }, ceiling: 'coffered',
    view: { pos: [0, 1.65, 17.2], yaw: 0 },
  },
  {
    id: 'courtyard', nameAr: 'الفناء الأندلسي', rect: [-10, -6, 10, 10], height: 0, open: true,
    floor: 'courtyard', wall: { finish: 'stucco', color: '#f1e9da' }, ceiling: 'woodBeams',
    view: { pos: [0, 1.65, 9.2], yaw: 0 },
  },
  {
    id: 'hall', nameAr: 'القاعة الكبرى', rect: [-10, -26, 10, -6], height: 9, dome: true,
    floor: 'marbleWhite', wall: { finish: 'marble', color: '#f3ede2' }, ceiling: 'coffered',
    view: { pos: [0, 1.65, -7.4], yaw: 0 },
  },
  {
    id: 'majlis', nameAr: 'المجلس العربي', rect: [10, -12, 28, 4], height: 6,
    floor: 'marbleCream', wall: { finish: 'stucco', color: '#efe1c6' }, ceiling: 'woodBeams',
    view: { pos: [11.4, 1.65, -1], yaw: -Math.PI / 2 },
  },
  {
    id: 'dining', nameAr: 'قاعة الطعام', rect: [-28, -12, -10, 4], height: 6,
    floor: 'parquet', wall: { finish: 'damask', color: '#6e1f2a' }, ceiling: 'coffered',
    view: { pos: [-11.4, 1.65, -1], yaw: Math.PI / 2 },
  },
  {
    id: 'suite', nameAr: 'الجناح الملكي', rect: [-28, -26, -10, -12], height: 6,
    floor: 'parquet', wall: { finish: 'paint', color: '#d9c7a7' }, ceiling: 'plaster',
    view: { pos: [-11.4, 1.65, -19], yaw: Math.PI / 2 },
  },
  {
    id: 'library', nameAr: 'المكتبة', rect: [10, -26, 28, -12], height: 6,
    floor: 'parquet', wall: { finish: 'panel', color: '#5a3a24' }, ceiling: 'woodBeams',
    view: { pos: [11.4, 1.65, -19], yaw: -Math.PI / 2 },
  },
];

/** المنظر الخارجي (الحديقة والمدخل) */
export const EXTERIOR_VIEW = { id: 'garden', nameAr: 'الحديقة والواجهة', view: { pos: [0, 1.65, 44], yaw: 0 } };

/**
 * الجدران (خط المنتصف). t = السماكة، h = الارتفاع (يشمل الدروة فوق السقف)
 * الفتحات: c = موضع المركز من النقطة a، w = العرض، h = الارتفاع الكلي حتى القمة
 * sill = ارتفاع أسفل الفتحة، arch = round | pointed | horseshoe | flat
 * kind = door (بابان يفتحان) | arch (قوس مفتوح) | window (زجاج) | mashrabiya (مشربية خشبية)
 */
export const WALLS = [
  // ---- خارجية (0.6 م)
  { a: [-28, -26], b: [-10, -26], t: 0.6, h: 7.2, openings: [
    { c: 4.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' },
    { c: 13.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' }] },
  { a: [-10, -26], b: [10, -26], t: 0.6, h: 10.2, openings: [
    { c: 4, w: 2.0, h: 5.4, sill: 1.0, arch: 'pointed', kind: 'window' },
    { c: 16, w: 2.0, h: 5.4, sill: 1.0, arch: 'pointed', kind: 'window' }] },
  { a: [10, -26], b: [28, -26], t: 0.6, h: 7.2, openings: [
    { c: 4.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' },
    { c: 13.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' }] },
  { a: [-28, -26], b: [-28, -12], t: 0.6, h: 7.2, openings: [] },
  { a: [-28, -12], b: [-28, 4], t: 0.6, h: 7.2, openings: [
    { c: 3.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' },
    { c: 12.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' }] },
  { a: [28, -26], b: [28, -12], t: 0.6, h: 7.2, openings: [] },
  { a: [28, -12], b: [28, 4], t: 0.6, h: 7.2, openings: [
    { c: 3.5, w: 1.6, h: 3.4, sill: 0.8, arch: 'horseshoe', kind: 'mashrabiya' },
    { c: 12.5, w: 1.6, h: 3.4, sill: 0.8, arch: 'horseshoe', kind: 'mashrabiya' }] },
  { a: [-28, 4], b: [-10, 4], t: 0.6, h: 7.2, openings: [
    { c: 4.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' },
    { c: 13.5, w: 1.7, h: 3.6, sill: 0.8, arch: 'pointed', kind: 'window' }] },
  { a: [10, 4], b: [28, 4], t: 0.6, h: 7.2, openings: [
    { c: 4.5, w: 1.6, h: 3.4, sill: 0.8, arch: 'horseshoe', kind: 'mashrabiya' },
    { c: 13.5, w: 1.6, h: 3.4, sill: 0.8, arch: 'horseshoe', kind: 'mashrabiya' }] },
  { a: [-10, 4], b: [-10, 10], t: 0.6, h: 7.2, openings: [] },
  { a: [10, 4], b: [10, 10], t: 0.6, h: 7.2, openings: [] },
  { a: [-10, 10], b: [-10, 18], t: 0.6, h: 9.2, openings: [] },
  { a: [10, 10], b: [10, 18], t: 0.6, h: 9.2, openings: [
    { c: 4, w: 1.7, h: 4.0, sill: 1.0, arch: 'pointed', kind: 'window' }] },
  { a: [-10, 18], b: [10, 18], t: 0.8, h: 9.2, openings: [
    { c: 10, w: 3.2, h: 5.2, sill: 0, arch: 'horseshoe', kind: 'door', main: true },
    { c: 3.5, w: 1.6, h: 3.8, sill: 1.1, arch: 'pointed', kind: 'window' },
    { c: 16.5, w: 1.6, h: 3.8, sill: 1.1, arch: 'pointed', kind: 'window' }] },
  // ---- داخلية (0.4 م)
  { a: [-10, -26], b: [-10, -12], t: 0.4, h: 10.2, openings: [
    { c: 7, w: 2.0, h: 3.8, sill: 0, arch: 'round', kind: 'door' }] },
  { a: [-10, -12], b: [-10, -6], t: 0.4, h: 10.2, openings: [] },
  { a: [-10, -6], b: [-10, 4], t: 0.4, h: 7.2, openings: [
    { c: 5, w: 2.2, h: 3.9, sill: 0, arch: 'horseshoe', kind: 'door' },
    { c: 1.6, w: 1.1, h: 2.5, sill: 1.1, arch: 'horseshoe', kind: 'mashrabiya' },
    { c: 8.4, w: 1.1, h: 2.5, sill: 1.1, arch: 'horseshoe', kind: 'mashrabiya' }] },
  { a: [10, -26], b: [10, -12], t: 0.4, h: 10.2, openings: [
    { c: 7, w: 2.0, h: 3.8, sill: 0, arch: 'round', kind: 'door' }] },
  { a: [10, -12], b: [10, -6], t: 0.4, h: 10.2, openings: [] },
  { a: [10, -6], b: [10, 4], t: 0.4, h: 7.2, openings: [
    { c: 5, w: 2.2, h: 3.9, sill: 0, arch: 'horseshoe', kind: 'door' },
    { c: 1.6, w: 1.1, h: 2.5, sill: 1.1, arch: 'horseshoe', kind: 'mashrabiya' },
    { c: 8.4, w: 1.1, h: 2.5, sill: 1.1, arch: 'horseshoe', kind: 'mashrabiya' }] },
  { a: [-28, -12], b: [-10, -12], t: 0.4, h: 7.2, openings: [
    { c: 9, w: 1.8, h: 3.4, sill: 0, arch: 'round', kind: 'door' }] },
  { a: [10, -12], b: [28, -12], t: 0.4, h: 7.2, openings: [
    { c: 9, w: 1.8, h: 3.4, sill: 0, arch: 'round', kind: 'door' }] },
  { a: [-10, -6], b: [10, -6], t: 0.5, h: 10.2, openings: [
    { c: 10, w: 5.0, h: 7.2, sill: 0, arch: 'pointed', kind: 'arch' },
    { c: 4, w: 1.6, h: 3.6, sill: 1.2, arch: 'pointed', kind: 'window' },
    { c: 16, w: 1.6, h: 3.6, sill: 1.2, arch: 'pointed', kind: 'window' }] },
  { a: [-10, 10], b: [10, 10], t: 0.5, h: 9.2, openings: [
    { c: 10, w: 4.0, h: 6.0, sill: 0, arch: 'horseshoe', kind: 'arch' },
    { c: 4, w: 2.0, h: 4.0, sill: 0, arch: 'horseshoe', kind: 'arch' },
    { c: 16, w: 2.0, h: 4.0, sill: 0, arch: 'horseshoe', kind: 'arch' }] },
];

/** القبة فوق القاعة الكبرى */
export const DOME = { center: [0, -16], ringRadius: 8.6, drumHeight: 1.6, radius: 8.6, base: 9 };

/** الفناء: الأروقة والبركة */
export const COURTYARD = {
  galleryDepth: 2.6, springY: 3.0, facadeTop: 4.9, spans: 6,
  pool: { x0: -1.6, x1: 1.6, z0: -3.2, z1: 7.2, waterY: -0.06 },
  fountains: [[0, -4.3], [0, 8.3]],
  planters: [[-4.6, -2], [4.6, -2], [-4.6, 6], [4.6, 6]],
};

/* -------------------------------------------------------------- 4) الخامات */
export const FLOOR_FINISHES = [
  { id: 'marbleWhite', nameAr: 'رخام كرارا أبيض' },
  { id: 'marbleCream', nameAr: 'رخام كريما مارفيل' },
  { id: 'marbleBlack', nameAr: 'رخام أسود ماركينا' },
  { id: 'marbleGreen', nameAr: 'رخام أخضر فيردي' },
  { id: 'checker', nameAr: 'رخام شطرنجي' },
  { id: 'parquet', nameAr: 'باركيه شيفرون' },
  { id: 'zellige', nameAr: 'زليج أندلسي' },
  { id: 'travertine', nameAr: 'ترافرتين' },
  { id: 'courtyard', nameAr: 'بلاط الفناء' },
];
export const WALL_FINISHES = [
  { id: 'paint', nameAr: 'دهان ناعم', tint: true },
  { id: 'damask', nameAr: 'ورق جدران دمشقي', tint: true },
  { id: 'stucco', nameAr: 'جبس عربي محفور', tint: true },
  { id: 'marble', nameAr: 'رخام', tint: false },
  { id: 'panel', nameAr: 'كسوة خشبية', tint: true },
  { id: 'zelligeWall', nameAr: 'زليج', tint: false },
];
export const CEILING_FINISHES = [
  { id: 'plaster', nameAr: 'جبس أبيض مع كرانيش' },
  { id: 'coffered', nameAr: 'كاسيت مذهّب' },
  { id: 'woodBeams', nameAr: 'خشب منحوت' },
];
export const PAINT_COLORS = [
  { nameAr: 'عاجي', hex: '#efe6d6' }, { nameAr: 'أبيض لؤلؤي', hex: '#f5f2ec' }, { nameAr: 'بيج رملي', hex: '#d9c7a7' },
  { nameAr: 'رمادي دافئ', hex: '#a9a298' }, { nameAr: 'أخضر زيتي', hex: '#6b7553' }, { nameAr: 'أزرق ملكي', hex: '#2e3f6e' },
  { nameAr: 'تركواز', hex: '#2f7f86' }, { nameAr: 'عنابي', hex: '#6e1f2a' }, { nameAr: 'ذهبي باهت', hex: '#c9a96b' },
  { nameAr: 'وردي ترابي', hex: '#c49a90' }, { nameAr: 'كحلي', hex: '#1d2440' }, { nameAr: 'زمردي', hex: '#1f5a48' },
  { nameAr: 'جوزي', hex: '#5a3a24' }, { nameAr: 'فحمي', hex: '#2b2a2a' },
];

/** مجموعات الخامات القابلة للتبديل في الأثاث */
export const SLOT_OPTIONS = {
  fabric: [
    { id: 'velvetBurgundy', nameAr: 'مخمل عنابي', hex: '#5c1420', type: 'velvet' },
    { id: 'velvetNavy', nameAr: 'مخمل كحلي', hex: '#1a2547', type: 'velvet' },
    { id: 'velvetEmerald', nameAr: 'مخمل زمردي', hex: '#134636', type: 'velvet' },
    { id: 'velvetGold', nameAr: 'مخمل ذهبي', hex: '#a87c32', type: 'velvet' },
    { id: 'velvetRose', nameAr: 'مخمل وردي', hex: '#b97c7c', type: 'velvet' },
    { id: 'velvetTeal', nameAr: 'مخمل تركوازي', hex: '#1f6a70', type: 'velvet' },
    { id: 'linenIvory', nameAr: 'كتان عاجي', hex: '#e9e0cd', type: 'linen' },
    { id: 'linenGrey', nameAr: 'كتان رمادي', hex: '#8d8a84', type: 'linen' },
    { id: 'leatherCognac', nameAr: 'جلد كونياك', hex: '#7a3f1d', type: 'leather' },
    { id: 'leatherBlack', nameAr: 'جلد أسود', hex: '#1c1816', type: 'leather' },
  ],
  wood: [
    { id: 'walnut', nameAr: 'جوز داكن', hex: '#5b3a22', type: 'wood' },
    { id: 'mahogany', nameAr: 'ماهوجني', hex: '#6a2b1a', type: 'wood' },
    { id: 'oak', nameAr: 'بلوط فاتح', hex: '#b08655', type: 'wood' },
    { id: 'ebony', nameAr: 'أبنوس', hex: '#211a16', type: 'wood' },
    { id: 'ivoryLacquer', nameAr: 'أبيض مطلي', hex: '#efe9dc', type: 'lacquer' },
  ],
  metal: [
    { id: 'gold', nameAr: 'ذهب', hex: '#f0c46a', type: 'metal', rough: 0.22 },
    { id: 'roseGold', nameAr: 'ذهب وردي', hex: '#e7a98c', type: 'metal', rough: 0.24 },
    { id: 'silver', nameAr: 'فضة', hex: '#dfe3e8', type: 'metal', rough: 0.18 },
    { id: 'bronze', nameAr: 'برونز', hex: '#a06b3c', type: 'metal', rough: 0.35 },
    { id: 'blackChrome', nameAr: 'كروم أسود', hex: '#2c2c2f', type: 'metal', rough: 0.2 },
  ],
  stone: [
    { id: 'marbleWhite', nameAr: 'رخام أبيض', type: 'stone' },
    { id: 'marbleBlack', nameAr: 'رخام أسود', type: 'stone' },
    { id: 'marbleGreen', nameAr: 'رخام أخضر', type: 'stone' },
    { id: 'marbleCream', nameAr: 'رخام كريمي', type: 'stone' },
  ],
  rug: [
    { id: 'rugRed', nameAr: 'أحمر تبريزي', type: 'rug' },
    { id: 'rugNavy', nameAr: 'كحلي أصفهاني', type: 'rug' },
    { id: 'rugIvory', nameAr: 'عاجي كاشان', type: 'rug' },
  ],
  art: [
    { id: 'art0', nameAr: 'كثبان عند الغروب', type: 'art', index: 0 },
    { id: 'art1', nameAr: 'بحر هادئ', type: 'art', index: 1 },
    { id: 'art2', nameAr: 'جبال الفجر', type: 'art', index: 2 },
    { id: 'art3', nameAr: 'زهور', type: 'art', index: 3 },
  ],
};

/* -------------------------------------------------------------- 5) الكتالوج
 * size = [عرض x, عمق z, ارتفاع y] بالمتر — الواجهة الأمامية للقطعة باتجاه +z المحلي
 * place: floor | wall | ceiling | top (فوق سطح)
 * slots: الخانات القابلة للتغيير وقيمها الافتراضية (من SLOT_OPTIONS)
 * collide: هل تمنع المرور
 */
export const CATALOG = [
  { id: 'sofaChesterfield', cat: 'seating', nameAr: 'كنبة تشسترفيلد', size: [2.3, 0.98, 0.8], place: 'floor', collide: true, slots: { fabric: 'leatherCognac', wood: 'walnut', metal: 'gold' } },
  { id: 'sofaClassic', cat: 'seating', nameAr: 'كنبة ملكية مذهّبة', size: [2.5, 1.0, 1.15], place: 'floor', collide: true, slots: { fabric: 'velvetNavy', metal: 'gold' } },
  { id: 'armchair', cat: 'seating', nameAr: 'كرسي ملكي', size: [0.9, 0.88, 1.15], place: 'floor', collide: true, slots: { fabric: 'velvetBurgundy', metal: 'gold' } },
  { id: 'majlisSeat', cat: 'seating', nameAr: 'جلسة عربية', size: [3.0, 0.95, 0.8], place: 'floor', collide: true, slots: { fabric: 'velvetBurgundy', metal: 'gold' } },
  { id: 'ottoman', cat: 'seating', nameAr: 'بوف', size: [0.75, 0.75, 0.45], place: 'floor', collide: true, slots: { fabric: 'velvetGold', metal: 'gold' } },
  { id: 'coffeeTable', cat: 'tables', nameAr: 'طاولة قهوة رخام', size: [1.4, 0.8, 0.45], place: 'floor', collide: true, slots: { stone: 'marbleWhite', metal: 'gold' } },
  { id: 'roundTable', cat: 'tables', nameAr: 'طاولة مستديرة', size: [1.7, 1.7, 0.8], place: 'floor', collide: true, slots: { stone: 'marbleBlack', metal: 'gold' } },
  { id: 'sideTable', cat: 'tables', nameAr: 'طاولة جانبية', size: [0.55, 0.55, 0.62], place: 'floor', collide: true, slots: { stone: 'marbleWhite', metal: 'gold' } },
  { id: 'trayTable', cat: 'tables', nameAr: 'صينية نحاسية', size: [1.0, 1.0, 0.42], place: 'floor', collide: true, slots: { metal: 'bronze', wood: 'walnut' } },
  { id: 'diningTable', cat: 'tables', nameAr: 'طاولة طعام', size: [4.2, 1.3, 0.77], place: 'floor', collide: true, slots: { wood: 'walnut', metal: 'gold' } },
  { id: 'diningChair', cat: 'seating', nameAr: 'كرسي طعام', size: [0.56, 0.6, 1.15], place: 'floor', collide: true, slots: { fabric: 'velvetBurgundy', wood: 'walnut' } },
  { id: 'console', cat: 'tables', nameAr: 'طاولة كونسول', size: [1.6, 0.45, 0.86], place: 'floor', collide: true, slots: { stone: 'marbleWhite', metal: 'gold' } },
  { id: 'desk', cat: 'tables', nameAr: 'مكتب فخم', size: [2.1, 1.0, 0.78], place: 'floor', collide: true, slots: { wood: 'mahogany', fabric: 'leatherBlack', metal: 'gold' } },
  { id: 'officeChair', cat: 'seating', nameAr: 'كرسي مكتب جلد', size: [0.72, 0.75, 1.25], place: 'floor', collide: true, slots: { fabric: 'leatherBlack', wood: 'mahogany', metal: 'gold' } },
  { id: 'bed', cat: 'bedroom', nameAr: 'سرير ملكي بمظلة', size: [2.3, 2.45, 2.9], place: 'floor', collide: true, slots: { fabric: 'velvetGold', wood: 'walnut', metal: 'gold' } },
  { id: 'nightstand', cat: 'bedroom', nameAr: 'كومودينو', size: [0.62, 0.46, 0.64], place: 'floor', collide: true, slots: { wood: 'walnut', stone: 'marbleWhite', metal: 'gold' } },
  { id: 'wardrobe', cat: 'bedroom', nameAr: 'خزانة ملابس', size: [2.4, 0.66, 2.6], place: 'floor', collide: true, slots: { wood: 'ivoryLacquer', metal: 'gold' } },
  { id: 'bookcase', cat: 'storage', nameAr: 'مكتبة كتب', size: [2.0, 0.46, 3.0], place: 'floor', collide: true, slots: { wood: 'walnut', metal: 'gold' } },
  { id: 'piano', cat: 'decor', nameAr: 'بيانو كبير', size: [1.55, 2.25, 1.0], place: 'floor', collide: true, slots: { wood: 'ebony', metal: 'gold' } },
  { id: 'globe', cat: 'decor', nameAr: 'كرة أرضية أثرية', size: [0.62, 0.62, 1.12], place: 'floor', collide: true, slots: { wood: 'walnut', metal: 'bronze' } },
  { id: 'fireplace', cat: 'decor', nameAr: 'مدفأة رخام', size: [2.2, 0.55, 1.5], place: 'wall', collide: true, slots: { stone: 'marbleWhite', metal: 'gold' } },
  { id: 'chandelier', cat: 'lighting', nameAr: 'ثريا كريستال', size: [1.5, 1.5, 1.7], place: 'ceiling', collide: false, light: true, slots: { metal: 'gold' } },
  { id: 'chandelierGrand', cat: 'lighting', nameAr: 'ثريا كبرى', size: [3.0, 3.0, 3.4], place: 'ceiling', collide: false, light: true, slots: { metal: 'gold' } },
  { id: 'lanternHanging', cat: 'lighting', nameAr: 'فانوس معلّق', size: [0.7, 0.7, 1.3], place: 'ceiling', collide: false, light: true, slots: { metal: 'bronze' } },
  { id: 'floorLamp', cat: 'lighting', nameAr: 'مصباح أرضي', size: [0.5, 0.5, 1.75], place: 'floor', collide: false, slots: { metal: 'gold', fabric: 'linenIvory' } },
  { id: 'tableLamp', cat: 'lighting', nameAr: 'مصباح طاولة', size: [0.42, 0.42, 0.72], place: 'top', collide: false, slots: { metal: 'gold', fabric: 'linenIvory' } },
  { id: 'lantern', cat: 'lighting', nameAr: 'فانوس أرضي', size: [0.45, 0.45, 1.0], place: 'floor', collide: false, slots: { metal: 'bronze' } },
  { id: 'rugPersian', cat: 'decor', nameAr: 'سجادة فارسية', size: [4.0, 3.0, 0.02], place: 'floor', collide: false, slots: { rug: 'rugRed' } },
  { id: 'rugRunner', cat: 'decor', nameAr: 'سجادة ممر', size: [2.0, 6.5, 0.02], place: 'floor', collide: false, slots: { rug: 'rugNavy' } },
  { id: 'rugGrand', cat: 'decor', nameAr: 'سجادة كبيرة', size: [8.0, 6.0, 0.02], place: 'floor', collide: false, slots: { rug: 'rugRed' } },
  { id: 'palm', cat: 'plants', nameAr: 'نخلة بأصيص', size: [1.6, 1.6, 3.0], place: 'floor', collide: true, slots: { stone: 'marbleCream' } },
  { id: 'plant', cat: 'plants', nameAr: 'نبتة بأصيص', size: [0.7, 0.7, 1.5], place: 'floor', collide: true, slots: { stone: 'marbleWhite' } },
  { id: 'vase', cat: 'decor', nameAr: 'مزهرية بورد', size: [0.45, 0.45, 0.85], place: 'top', collide: false, slots: { stone: 'marbleWhite', metal: 'gold' } },
  { id: 'vaseGrand', cat: 'decor', nameAr: 'باقة كبرى', size: [1.2, 1.2, 1.5], place: 'top', collide: false, slots: { stone: 'marbleWhite', metal: 'gold' } },
  { id: 'dallah', cat: 'decor', nameAr: 'دلّة وفناجين', size: [0.45, 0.3, 0.36], place: 'top', collide: false, slots: { metal: 'gold' } },
  { id: 'incense', cat: 'decor', nameAr: 'مبخرة', size: [0.24, 0.24, 0.38], place: 'top', collide: false, slots: { metal: 'gold', wood: 'ebony' } },
  { id: 'painting', cat: 'decor', nameAr: 'لوحة زيتية', size: [1.6, 0.08, 1.15], place: 'wall', collide: false, slots: { art: 'art0', metal: 'gold' } },
  { id: 'paintingLarge', cat: 'decor', nameAr: 'لوحة كبيرة', size: [2.6, 0.1, 1.8], place: 'wall', collide: false, slots: { art: 'art2', metal: 'gold' } },
  { id: 'mirror', cat: 'decor', nameAr: 'مرآة مذهّبة', size: [1.1, 0.07, 1.8], place: 'wall', collide: false, slots: { metal: 'gold' } },
];

export const CATALOG_CATEGORIES = [
  { id: 'seating', nameAr: 'جلوس' }, { id: 'tables', nameAr: 'طاولات' }, { id: 'bedroom', nameAr: 'غرفة النوم' },
  { id: 'storage', nameAr: 'تخزين' }, { id: 'lighting', nameAr: 'إضاءة' }, { id: 'decor', nameAr: 'ديكور' }, { id: 'plants', nameAr: 'نباتات' },
];

/* -------------------------------------------------------------- 6) التأثيث الافتراضي
 * [النوع, x, z, الدوران بالدرجات, خانات مخصصة, ارتفاع y اختياري]
 * الدوران 0 = الواجهة نحو الجنوب (+z)، 90 = نحو الشرق (+x)، 180 = الشمال، -90 = الغرب
 */
const F = (type, x, z, rot = 0, slots = null, y = null) => ({ type, x, z, rot, slots, y });
export const DEFAULT_LAYOUT = [
  // ---------- بهو المدخل
  F('chandelier', 0, 14),
  F('rugRunner', 0, 14, 0, { rug: 'rugNavy' }),
  F('console', -9.55, 14, 90),
  F('vase', -9.55, 13.4, 0, null, 0.86), F('vase', -9.55, 14.6, 0, null, 0.86),
  F('palm', -8.7, 11.3), F('palm', -8.7, 16.7), F('palm', 8.7, 11.3), F('palm', 8.7, 16.7),
  F('console', 9.55, 14, -90),
  F('vase', 9.55, 14, 0, null, 0.86),
  F('paintingLarge', 9.7, 14, -90, { art: 'art2' }, 2.9),
  // ---------- الفناء
  F('lantern', -8.6, -4.8), F('lantern', -8.6, 8.8), F('lantern', 8.6, -4.8), F('lantern', 8.6, 8.8),
  F('lanternHanging', -8.7, 2), F('lanternHanging', 8.7, 2),
  // ---------- القاعة الكبرى
  F('chandelierGrand', 0, -16),
  F('roundTable', 0, -16),
  F('vaseGrand', 0, -16, 0, null, 0.8),
  F('rugGrand', -5.2, -16, 90, { rug: 'rugRed' }),
  F('sofaClassic', -7.2, -16, 90, { fabric: 'velvetBurgundy' }),
  F('armchair', -3.6, -14.3, -110, { fabric: 'velvetBurgundy' }), F('armchair', -3.6, -17.7, -70, { fabric: 'velvetBurgundy' }),
  F('coffeeTable', -5.4, -16, 90),
  F('rugGrand', 5.2, -16, 90, { rug: 'rugNavy' }),
  F('sofaClassic', 7.2, -16, -90, { fabric: 'velvetNavy' }),
  F('armchair', 3.6, -14.3, 110, { fabric: 'velvetNavy' }), F('armchair', 3.6, -17.7, 70, { fabric: 'velvetNavy' }),
  F('coffeeTable', 5.4, -16, 90),
  F('piano', 6.2, -22.6, -35),
  F('fireplace', 0, -25.42, 0),
  F('paintingLarge', 0, -25.62, 0, { art: 'art0' }, 3.6),
  F('painting', -9.62, -11.2, 90, { art: 'art1' }, 2.2), F('painting', 9.62, -11.2, -90, { art: 'art3' }, 2.2),
  F('painting', -9.62, -23.6, 90, { art: 'art2' }, 2.2), F('painting', 9.62, -23.6, -90, { art: 'art0' }, 2.2),
  F('palm', -8.9, -7.6), F('palm', 8.9, -7.6),
  F('floorLamp', -8.6, -13.9), F('floorLamp', 8.6, -18.1),
  // ---------- المجلس العربي
  F('lanternHanging', 19, -4),
  F('rugGrand', 21.5, -4, 90, { rug: 'rugRed' }),
  F('majlisSeat', 27.2, -8.6, -90), F('majlisSeat', 27.2, -5.4, -90), F('majlisSeat', 27.2, -2.2, -90), F('majlisSeat', 27.2, 1.0, -90),
  F('majlisSeat', 23.9, -11.2, 0), F('majlisSeat', 23.9, 3.2, 180),
  F('trayTable', 23.2, -4), F('dallah', 23.2, -4, 0, null, 0.42), F('incense', 23.6, -3.6, 0, null, 0.42),
  F('trayTable', 23.2, -0.6), F('trayTable', 23.2, -7.4),
  F('lantern', 11.2, -10.8), F('lantern', 11.2, 2.8),
  F('plant', 26.9, -11.1), F('plant', 26.9, 3.1),
  // ---------- قاعة الطعام
  F('chandelier', -20.6, -4), F('chandelier', -17.4, -4),
  F('rugPersian', -19, -4, 0, { rug: 'rugRed' }),
  F('diningTable', -19, -4),
  F('diningChair', -20.6, -5.05), F('diningChair', -19.8, -5.05), F('diningChair', -19, -5.05), F('diningChair', -18.2, -5.05), F('diningChair', -17.4, -5.05),
  F('diningChair', -20.6, -2.95, 180), F('diningChair', -19.8, -2.95, 180), F('diningChair', -19, -2.95, 180), F('diningChair', -18.2, -2.95, 180), F('diningChair', -17.4, -2.95, 180),
  F('diningChair', -21.55, -4, 90), F('diningChair', -16.45, -4, -90),
  F('vase', -19, -4, 0, null, 0.77),
  F('fireplace', -27.42, -4, 90, { stone: 'marbleBlack' }),
  F('paintingLarge', -27.62, -4, 90, { art: 'art1' }, 3.2),
  F('console', -24, -11.55, 0), F('console', -14, -11.55, 0),
  F('vase', -24, -11.55, 0, null, 0.86), F('vase', -14, -11.55, 0, null, 0.86),
  F('painting', -24, -11.72, 0, { art: 'art3' }, 2.4), F('painting', -14, -11.72, 0, { art: 'art0' }, 2.4),
  F('plant', -27.1, 3.1), F('plant', -11, 3.1),
  // ---------- الجناح الملكي
  F('chandelier', -19, -19),
  F('bed', -26.4, -19, 90),
  F('nightstand', -27.35, -17.3, 90), F('nightstand', -27.35, -20.7, 90),
  F('tableLamp', -27.35, -17.3, 0, null, 0.64), F('tableLamp', -27.35, -20.7, 0, null, 0.64),
  F('rugPersian', -23.6, -19, 90, { rug: 'rugIvory' }),
  F('ottoman', -24.4, -19, 90),
  F('wardrobe', -23.5, -12.55, 180),
  F('armchair', -20.2, -24.2, 20, { fabric: 'velvetRose' }), F('armchair', -17.8, -24.2, -20, { fabric: 'velvetRose' }),
  F('sideTable', -19, -24.8),
  F('console', -10.45, -23.5, -90, { stone: 'marbleCream' }),
  F('mirror', -10.24, -23.5, -90, null, 1.35),
  F('painting', -10.24, -15, -90, { art: 'art3' }, 2.1),
  F('plant', -11, -25.1), F('plant', -27.1, -25.1),
  // ---------- المكتبة
  F('chandelier', 19, -19),
  F('bookcase', 27.45, -24.2, -90), F('bookcase', 27.45, -22.1, -90), F('bookcase', 27.45, -20, -90),
  F('bookcase', 27.45, -17.9, -90), F('bookcase', 27.45, -15.8, -90), F('bookcase', 27.45, -13.7, -90),
  F('bookcase', 18, -25.45, 0), F('bookcase', 20.1, -25.45, 0),
  F('rugPersian', 19, -19.5, 0, { rug: 'rugNavy' }),
  F('desk', 19, -20.2, 0),
  F('officeChair', 19, -21.35, 0),
  F('tableLamp', 18.2, -20.15, 0, null, 0.78),
  F('globe', 23.6, -21),
  F('fireplace', 14, -12.58, 180),
  F('armchair', 13.1, -14.4, 160, { fabric: 'leatherCognac' }), F('armchair', 14.9, -14.4, -160, { fabric: 'leatherCognac' }),
  F('sideTable', 14, -15.2),
  F('floorLamp', 11.1, -13.2),
  F('sofaChesterfield', 13.2, -23.6, 60),
  F('plant', 11, -25.1),
];
