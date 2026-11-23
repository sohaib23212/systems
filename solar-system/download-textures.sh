#!/usr/bin/env bash
# =============================================================================
#  download-textures.sh — تحميل صور الكواكب إلى مجلد textures
#  -----------------------------------------------------------------------------
#  المصدر: Solar System Scope (CC BY 4.0) — https://www.solarsystemscope.com/textures/
#  (صور الأرض عندهم مبنية على NASA Blue Marble للنهار و NASA Black Marble لليل)
#
#  الاستخدام:
#     ./download-textures.sh          → 2K + 8K (الكل، ≈ 230 ميغابايت)
#     ./download-textures.sh --2k     → 2K فقط (≈ 25 ميغابايت، أسرع)
#     ./download-textures.sh --nasa   → بالإضافة: صور NASA الأصلية للأرض (Blue/Black Marble)
#
#  ملاحظة: خريطتا Normal و Specular للأرض تُنشران بصيغة TIFF والمتصفح لا يقرأها،
#  فالسكربت يحوّلهما إلى PNG تلقائياً (ImageMagick أو Python Pillow).
# =============================================================================
set -u
cd "$(dirname "$0")/textures" || exit 1

BASE="https://www.solarsystemscope.com/textures/download"
ONLY2K=0
NASA=0
for a in "$@"; do
  case "$a" in
    --2k) ONLY2K=1 ;;
    --nasa) NASA=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
  esac
done

FILES_2K=(
  2k_sun.jpg 2k_mercury.jpg 2k_venus_surface.jpg 2k_venus_atmosphere.jpg
  2k_earth_daymap.jpg 2k_earth_nightmap.jpg 2k_earth_clouds.jpg
  2k_earth_normal_map.tif 2k_earth_specular_map.tif
  2k_moon.jpg 2k_mars.jpg 2k_jupiter.jpg 2k_saturn.jpg 2k_saturn_ring_alpha.png
  2k_uranus.jpg 2k_neptune.jpg 2k_stars_milky_way.jpg
)
FILES_8K=(
  8k_sun.jpg 8k_mercury.jpg 8k_venus_surface.jpg 4k_venus_atmosphere.jpg
  8k_earth_daymap.jpg 8k_earth_nightmap.jpg 8k_earth_clouds.jpg
  8k_earth_normal_map.tif 8k_earth_specular_map.tif
  8k_moon.jpg 8k_mars.jpg 8k_jupiter.jpg 8k_saturn.jpg 8k_saturn_ring_alpha.png
  8k_stars_milky_way.jpg
)

FILES=("${FILES_2K[@]}")
[ "$ONLY2K" -eq 0 ] && FILES+=("${FILES_8K[@]}")

fetch() { # $1 = اسم الملف المحلي، $2 = الرابط
  if [ -s "$1" ]; then echo "✓ موجود: $1"; return 0; fi
  echo "↓ تحميل: $1"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 2 -o "$1.part" "$2" && mv "$1.part" "$1" && return 0
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$1.part" "$2" && mv "$1.part" "$1" && return 0
  else
    echo "✗ لا يوجد curl ولا wget"; return 1
  fi
  rm -f "$1.part"; echo "✗ فشل: $1"; return 1
}

for f in "${FILES[@]}"; do fetch "$f" "$BASE/$f"; done

# --- صور NASA الأصلية (اختياري) ---
if [ "$NASA" -eq 1 ]; then
  fetch nasa_blue_marble_src.jpg "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg"
  fetch nasa_black_marble_src.jpg "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg"
fi

# --- تحويل TIFF → PNG وتصغير صور NASA إلى 8192×4096 ---
convert_img() { # $1 مصدر، $2 هدف، $3 مقاس اختياري
  [ -s "$1" ] || return 0
  [ -s "$2" ] && { echo "✓ موجود: $2"; return 0; }
  echo "⟳ تحويل: $1 → $2"
  if command -v magick >/dev/null 2>&1; then magick "$1" ${3:+-resize $3!} "$2" && return 0; fi
  if command -v convert >/dev/null 2>&1; then convert "$1" ${3:+-resize $3!} "$2" && return 0; fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" "$2" "${3:-}" <<'PY' && return 0
import sys
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, dst, size = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src)
if im.mode not in ('RGB', 'L'): im = im.convert('RGB')
if size:
    w, h = (int(x) for x in size.split('x'))
    im = im.resize((w, h), Image.LANCZOS)
im.save(dst, quality=92) if dst.lower().endswith('.jpg') else im.save(dst)
PY
  fi
  echo "✗ تعذّر تحويل $1 — ثبّت ImageMagick أو: pip install pillow"; return 1
}
for t in 2k_earth_normal_map 2k_earth_specular_map 8k_earth_normal_map 8k_earth_specular_map; do
  convert_img "$t.tif" "$t.png"
done
if [ "$NASA" -eq 1 ]; then
  convert_img nasa_blue_marble_src.jpg nasa_blue_marble_8k.jpg 8192x4096
  convert_img nasa_black_marble_src.jpg nasa_black_marble_8k.jpg 8192x4096
fi

# --- قائمة الملفات الموجودة (للسيرفرات التي لا تعرض محتوى المجلد) ---
{
  printf '['
  first=1
  for f in *.jpg *.jpeg *.png *.webp; do
    [ -e "$f" ] || continue
    [ $first -eq 1 ] && first=0 || printf ','
    printf '"%s"' "$f"
  done
  printf ']\n'
} > manifest.json
echo "✓ تم إنشاء textures/manifest.json"
echo "انتهى. شغّل المحاكاة: npx serve .  (من داخل مجلد solar-system)"
