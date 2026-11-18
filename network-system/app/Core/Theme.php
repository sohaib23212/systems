<?php
declare(strict_types=1);

namespace App\Core;

/**
 * التصميم العام: الخط، لوحة الألوان، الزوايا، الكثافة، القائمة الجانبية، وحركة ظهور العناصر.
 * في وضع المنصة يُدار من لوحة المسؤول ويُطبّق على كل الأنظمة؛ في التثبيت المفرد من الإعدادات.
 */
final class Theme
{
    /** المفتاح => [الاسم، اسم العائلة، ملف الخط، الأوزان] */
    public const FONTS = [
        'plex'    => ['IBM Plex Arabic', 'Plex Arabic', 'ibm-plex-sans-arabic', [400, 500, 600, 700]],
        'cairo'   => ['Cairo', 'Cairo', 'cairo', [400, 600, 700]],
        'tajawal' => ['Tajawal', 'Tajawal', 'tajawal', [400, 500, 700]],
        'almarai' => ['Almarai', 'Almarai', 'almarai', [400, 700]],
        'kufi'    => ['Noto Kufi Arabic', 'Noto Kufi Arabic', 'noto-kufi-arabic', [400, 600, 700]],
        'readex'  => ['Readex Pro', 'Readex Pro', 'readex-pro', [400, 500, 700]],
    ];

    /** المفتاح => [الاسم، اللون الفاتح، اللون في الوضع الداكن] */
    public const PALETTES = [
        'royal'    => ['أزرق ملكي', '#2453d6', '#5383ff'],
        'ocean'    => ['محيطي', '#0e7490', '#22c3e6'],
        'emerald'  => ['زمردي', '#047857', '#34d399'],
        'violet'   => ['بنفسجي', '#6d28d9', '#a78bfa'],
        'indigo'   => ['نيلي', '#4338ca', '#818cf8'],
        'sunset'   => ['برتقالي', '#c2410c', '#fb923c'],
        'rose'     => ['وردي', '#be123c', '#fb7185'],
        'graphite' => ['جرافيتي', '#334155', '#a5b4c8'],
        'gold'     => ['ذهبي', '#a16207', '#eab308'],
    ];

    public const RADIUS = ['sharp' => 'حادّة', 'normal' => 'متوسطة', 'round' => 'دائرية'];
    public const DENSITY = ['compact' => 'مضغوطة', 'normal' => 'متوازنة', 'comfortable' => 'مريحة'];
    public const SIDEBAR = ['light' => 'فاتحة', 'dark' => 'داكنة', 'brand' => 'بلون الهوية'];
    public const MOTION = [
        'rise'  => 'صعود من الأسفل',
        'drop'  => 'سقوط من الأعلى',
        'fade'  => 'تلاشي',
        'zoom'  => 'تكبير ناعم',
        'slide' => 'انزلاق جانبي',
        'none'  => 'بدون حركة',
    ];

    public const DEFAULTS = [
        'design.font'        => 'plex',
        'design.palette'     => 'royal',
        'design.radius'      => 'normal',
        'design.density'     => 'normal',
        'design.sidebar'     => 'light',
        'design.motion'      => 'rise',
        'design.stagger'     => '45',
        'design.speed'       => '380',
        'design.page_fx'     => '1',
        'design.haptics'     => '1',
    ];

    private static ?array $cache = null;

    public static function current(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $out = [];
        foreach (self::DEFAULTS as $k => $def) {
            try {
                $v = Platform::enabled() ? Platform::setting($k, $def) : (Config::installed() ? (string) Settings::get($k, $def) : $def);
            } catch (\Throwable) {
                $v = $def;
            }
            $out[substr($k, 7)] = $v;
        }
        $out['font'] = isset(self::FONTS[$out['font']]) ? $out['font'] : 'plex';
        $out['palette'] = isset(self::PALETTES[$out['palette']]) ? $out['palette'] : 'royal';
        $out['radius'] = isset(self::RADIUS[$out['radius']]) ? $out['radius'] : 'normal';
        $out['density'] = isset(self::DENSITY[$out['density']]) ? $out['density'] : 'normal';
        $out['sidebar'] = isset(self::SIDEBAR[$out['sidebar']]) ? $out['sidebar'] : 'light';
        $out['motion'] = isset(self::MOTION[$out['motion']]) ? $out['motion'] : 'rise';
        $out['stagger'] = (string) max(0, min(200, (int) $out['stagger']));
        $out['speed'] = (string) max(120, min(1200, (int) $out['speed']));
        return self::$cache = $out;
    }

    public static function flush(): void
    {
        self::$cache = null;
    }

    /** خصائص وسم html */
    public static function attrs(): string
    {
        $t = self::current();
        return ' data-motion="' . e($t['motion']) . '" data-density="' . e($t['density']) . '" data-radius="' . e($t['radius']) . '" data-sidebar-style="' . e($t['sidebar']) . '"'
            . ' data-page-fx="' . ($t['page_fx'] === '1' ? '1' : '0') . '" data-haptics="' . ($t['haptics'] === '1' ? '1' : '0') . '"';
    }

    /** تعريفات @font-face لخط معيّن */
    public static function fontFaces(string $key, ?array $only = null): string
    {
        if ($key === 'plex' || !isset(self::FONTS[$key])) {
            return '';
        }
        [, $family, $file, $weights] = self::FONTS[$key];
        $css = '';
        foreach ($only !== null ? array_intersect($weights, $only) : $weights as $w) {
            foreach (['arabic' => 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC',
                'latin' => 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'] as $sub => $range) {
                $css .= '@font-face{font-family:"' . $family . '";font-weight:' . $w . ';font-style:normal;font-display:swap;src:url("' . asset('fonts/' . $file . '-' . $sub . '-' . $w . '-normal.woff2') . '") format("woff2");unicode-range:' . $range . '}';
            }
        }
        return $css;
    }

    /** وسم style بالمتغيرات والخط المختار */
    public static function style(?array $t = null): string
    {
        $t ??= self::current();
        $family = self::FONTS[$t['font']][1];
        $css = self::fontFaces($t['font']);
        [, $light, $dark] = self::PALETTES[$t['palette']];
        $radius = ['sharp' => ['6px', '8px', '10px'], 'normal' => ['10px', '12px', '16px'], 'round' => ['14px', '18px', '22px']][$t['radius']];
        $css .= ':root{--font:"' . $family . '", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif;'
            . '--motion-stagger:' . (int) $t['stagger'] . 'ms;--motion-speed:' . (int) $t['speed'] . 'ms;'
            . '--radius-sm:' . $radius[0] . ';--radius:' . $radius[1] . ';--radius-lg:' . $radius[2] . ';}';
        if ($t['palette'] !== 'royal') {
            $css .= ':root[data-theme="light"],:root:not([data-theme]){' . self::accent($light, false) . '}'
                . ':root[data-theme="dark"]{' . self::accent($dark, true) . '}';
        }
        // الانتقال بين الصفحات: المتصفحات الحديثة تمزج الصفحة القديمة بالجديدة بنعومة بدل الوميض (يتبع خيار «حركة الصفحات»)
        if ($t['page_fx'] === '1') {
            $css .= '@view-transition{navigation:auto}';
        }
        return '<style id="theme-vars">' . $css . '</style>';
    }

    private static function accent(string $hex, bool $dark): string
    {
        [$r, $g, $b] = sscanf($hex, '#%02x%02x%02x');
        $hover = $dark ? self::mix([$r, $g, $b], [255, 255, 255], .14) : self::mix([$r, $g, $b], [0, 0, 0], .14);
        return '--primary:' . $hex . ';--primary-hover:' . $hover . ';'
            . '--primary-soft:' . ($dark ? "rgba($r, $g, $b, .16)" : self::mix([$r, $g, $b], [255, 255, 255], .9)) . ';'
            . "--primary-ring:rgba($r, $g, $b, " . ($dark ? '.34' : '.22') . ');';
    }

    private static function mix(array $a, array $b, float $t): string
    {
        return sprintf('#%02x%02x%02x', (int) round($a[0] + ($b[0] - $a[0]) * $t), (int) round($a[1] + ($b[1] - $a[1]) * $t), (int) round($a[2] + ($b[2] - $a[2]) * $t));
    }
}
