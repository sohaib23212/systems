# مجلد الصور (textures)

ضع كل الصور **مباشرة داخل هذا المجلد** (`solar-system/textures/`) بنفس الأسماء بالضبط.
الأسهل: شغّل سكربت التحميل من مجلد `solar-system`:

```bash
./download-textures.sh            # ماك / لينكس (2K + 8K)
./download-textures.sh --2k       # 2K فقط (أسرع وأخف)
```
```powershell
powershell -ExecutionPolicy Bypass -File .\download-textures.ps1          # ويندوز
```

> إذا أي صورة مش موجودة، المحاكاة **ما بتوقف**: بتولّد بديل بالكود (procedural) على كرت الشاشة تلقائياً.
> المحاكاة بتعرف الصور الموجودة من قائمة المجلد (أو من `manifest.json` اللي بيعمله السكربت)، فما بيطلع أي خطأ 404 بالـ console.

## 1) صور Solar System Scope — الأساسية (CC BY 4.0)
المصدر: <https://www.solarsystemscope.com/textures/>  — رابط التحميل المباشر: `https://www.solarsystemscope.com/textures/download/<اسم الملف>`

| الجرم | الدقة الأساسية (تحميل أولي) | الدقة العالية (LOD عند الاقتراب) |
|---|---|---|
| الشمس | `2k_sun.jpg` | `8k_sun.jpg` |
| عطارد | `2k_mercury.jpg` | `8k_mercury.jpg` |
| الزهرة (السطح) | `2k_venus_surface.jpg` | `8k_venus_surface.jpg` |
| الزهرة (الغيوم) | `2k_venus_atmosphere.jpg` | `4k_venus_atmosphere.jpg` |
| الأرض — نهار (NASA Blue Marble) | `2k_earth_daymap.jpg` | `8k_earth_daymap.jpg` |
| الأرض — ليل/أضواء المدن (NASA Black Marble) | `2k_earth_nightmap.jpg` | `8k_earth_nightmap.jpg` |
| الأرض — غيوم | `2k_earth_clouds.jpg` | `8k_earth_clouds.jpg` |
| الأرض — Normal map (تضاريس) | `2k_earth_normal_map.png` ⚠️ | `8k_earth_normal_map.png` ⚠️ |
| الأرض — Specular (المحيطات تلمع) | `2k_earth_specular_map.png` ⚠️ | `8k_earth_specular_map.png` ⚠️ |
| القمر | `2k_moon.jpg` | `8k_moon.jpg` |
| المريخ | `2k_mars.jpg` | `8k_mars.jpg` |
| المشتري | `2k_jupiter.jpg` | `8k_jupiter.jpg` |
| زحل | `2k_saturn.jpg` | `8k_saturn.jpg` |
| حلقات زحل (بشفافية alpha) | `2k_saturn_ring_alpha.png` | `8k_saturn_ring_alpha.png` |
| أورانوس | `2k_uranus.jpg` | — |
| نبتون | `2k_neptune.jpg` | — |
| النجوم + درب التبانة (Skybox) | `2k_stars_milky_way.jpg` | `8k_stars_milky_way.jpg` |

⚠️ Solar System Scope ينشر خريطتي Normal و Specular بصيغة **TIFF** (`.tif`)، والمتصفح ما بيقرأ TIFF.
السكربت بيحوّلهم لـ PNG تلقائياً. يدوياً: افتح الملف بأي برنامج صور واحفظه PNG بنفس الاسم.

## 2) صور NASA الأصلية للأرض (اختياري)
- Blue Marble (نهار، 21600×10800): <https://visibleearth.nasa.gov/images/73909> → صغّرها لـ 8192×4096 وسمّها `nasa_blue_marble_8k.jpg`
- Black Marble 2016 (ليل): <https://earthobservatory.nasa.gov/features/NightLights> → صغّرها لـ 8192×4096 وسمّها `nasa_black_marble_8k.jpg`

(`./download-textures.sh --nasa` بيعمل هالشي تلقائياً.)

## 3) صور اختيارية لأجرام غير موجودة في Solar System Scope
إذا ما حطيتها، بيتولّد سطح واقعي بالكود. أي صورة equirectangular (نسبة 2:1، يُفضّل 2048×1024):

| الملف | الجرم | مصدر مقترح |
|---|---|---|
| `pluto.jpg` | بلوتو | NASA/JHUAPL New Horizons global mosaic (USGS Astrogeology) |
| `io.jpg`, `europa.jpg`, `ganymede.jpg`, `callisto.jpg` | أقمار المشتري | USGS Galileo/Voyager global mosaics |
| `titan.jpg` | تيتان | Cassini ISS global map (NASA/JPL) |
| `triton.jpg` | تريتون | Voyager 2 mosaic (USGS) |
| `phobos.jpg`, `deimos.jpg` | أقمار المريخ | Viking / Mars Express maps |
| `moon_bump.jpg` | تضاريس القمر (ارتفاعات رمادية) | NASA SVS CGI Moon Kit (LOLA elevation) |

## الحقوق
- Solar System Scope textures — رخصة CC BY 4.0 (مذكورة بسطر النسب أسفل الواجهة).
- صور NASA ملكية عامة (Public Domain).
