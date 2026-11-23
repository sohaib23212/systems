# =============================================================================
#  download-textures.ps1 — تحميل صور الكواكب إلى مجلد textures (ويندوز)
#  -----------------------------------------------------------------------------
#  التشغيل (من داخل مجلد solar-system):
#     powershell -ExecutionPolicy Bypass -File .\download-textures.ps1
#     powershell -ExecutionPolicy Bypass -File .\download-textures.ps1 -Only2K
#  المصدر: Solar System Scope (CC BY 4.0) — https://www.solarsystemscope.com/textures/
#  خريطتا Normal و Specular للأرض بصيغة TIFF؛ السكربت يحوّلهما إلى PNG تلقائياً.
# =============================================================================
param([switch]$Only2K)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dir = Join-Path $PSScriptRoot 'textures'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$base = 'https://www.solarsystemscope.com/textures/download'

$files2k = @(
  '2k_sun.jpg','2k_mercury.jpg','2k_venus_surface.jpg','2k_venus_atmosphere.jpg',
  '2k_earth_daymap.jpg','2k_earth_nightmap.jpg','2k_earth_clouds.jpg',
  '2k_earth_normal_map.tif','2k_earth_specular_map.tif',
  '2k_moon.jpg','2k_mars.jpg','2k_jupiter.jpg','2k_saturn.jpg','2k_saturn_ring_alpha.png',
  '2k_uranus.jpg','2k_neptune.jpg','2k_stars_milky_way.jpg'
)
$files8k = @(
  '8k_sun.jpg','8k_mercury.jpg','8k_venus_surface.jpg','4k_venus_atmosphere.jpg',
  '8k_earth_daymap.jpg','8k_earth_nightmap.jpg','8k_earth_clouds.jpg',
  '8k_earth_normal_map.tif','8k_earth_specular_map.tif',
  '8k_moon.jpg','8k_mars.jpg','8k_jupiter.jpg','8k_saturn.jpg','8k_saturn_ring_alpha.png',
  '8k_stars_milky_way.jpg'
)
$files = $files2k
if (-not $Only2K) { $files += $files8k }

foreach ($f in $files) {
  $out = Join-Path $dir $f
  if ((Test-Path $out) -and ((Get-Item $out).Length -gt 0)) { Write-Host "✓ موجود: $f"; continue }
  Write-Host "↓ تحميل: $f"
  try { Invoke-WebRequest -Uri "$base/$f" -OutFile $out -UseBasicParsing }
  catch { Write-Host "✗ فشل: $f — $($_.Exception.Message)"; Remove-Item $out -ErrorAction SilentlyContinue }
}

# تحويل TIFF → PNG
Add-Type -AssemblyName System.Drawing
foreach ($t in @('2k_earth_normal_map','2k_earth_specular_map','8k_earth_normal_map','8k_earth_specular_map')) {
  $src = Join-Path $dir "$t.tif"; $dst = Join-Path $dir "$t.png"
  if ((Test-Path $src) -and -not (Test-Path $dst)) {
    Write-Host "⟳ تحويل: $t.tif → $t.png"
    try { $img = [System.Drawing.Image]::FromFile($src); $img.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose() }
    catch { Write-Host "✗ تعذّر التحويل — حوّل الملف يدوياً إلى PNG بأي برنامج صور" }
  }
}

# قائمة الملفات الموجودة
$names = Get-ChildItem $dir -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|webp)$' } | ForEach-Object { '"' + $_.Name + '"' }
Set-Content -Path (Join-Path $dir 'manifest.json') -Value ('[' + ($names -join ',') + ']') -Encoding UTF8
Write-Host "✓ تم إنشاء textures\manifest.json"
Write-Host "انتهى. شغّل المحاكاة: npx serve ."
