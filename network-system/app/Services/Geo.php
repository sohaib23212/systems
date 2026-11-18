<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\DB;
use App\Core\Request;
use App\Core\Settings;

/**
 * المواقع الجغرافية: أنواع المواقع والروابط، والتحقق من الإحداثيات.
 */
final class Geo
{
    public const SITE_TYPES = [
        'tower'   => ['برج', 'radio-tower'],
        'station' => ['محطة', 'satellite-dish'],
        'office'  => ['مكتب', 'building-2'],
        'box'     => ['نقطة توزيع', 'archive'],
        'other'   => ['أخرى', 'map-pin'],
    ];

    public const LINK_TYPES = [
        'wireless' => 'لاسلكي',
        'fiber'    => 'فايبر',
        'cable'    => 'كابل',
        'other'    => 'أخرى',
    ];

    /** نقطة البداية الافتراضية للخريطة (قطاع غزة) */
    public const DEFAULT_VIEW = [31.45, 34.40, 11];

    /**
     * قراءة الموقع من الطلب: [site_id, lat, lng] أو رسالة خطأ.
     * @return array{0:?int,1:?float,2:?float,3:?string}
     */
    public static function fromRequest(Request $request): array
    {
        $siteId = $request->int('site_id');
        $site = $siteId > 0 && DB::value('SELECT id FROM sites WHERE id = ?', [$siteId]) ? $siteId : null;
        $latRaw = trim(latin_digits($request->str('lat')));
        $lngRaw = trim(latin_digits($request->str('lng')));
        if ($latRaw === '' && $lngRaw === '') {
            return [$site, null, null, null];
        }
        if (!is_numeric($latRaw) || !is_numeric($lngRaw)) {
            return [$site, null, null, 'الإحداثيات غير صحيحة.'];
        }
        $lat = (float) $latRaw;
        $lng = (float) $lngRaw;
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return [$site, null, null, 'الإحداثيات خارج النطاق.'];
        }
        return [$site, round($lat, 7), round($lng, 7), null];
    }

    /** إعدادات العرض الافتراضي للخريطة [lat, lng, zoom] */
    public static function view(): array
    {
        $lat = Settings::get('map.lat', '');
        $lng = Settings::get('map.lng', '');
        $zoom = (int) Settings::get('map.zoom', '0');
        if (is_numeric($lat) && is_numeric($lng) && $zoom > 0) {
            return [(float) $lat, (float) $lng, $zoom];
        }
        return self::DEFAULT_VIEW;
    }

    /** قائمة المواقع لحقول الاختيار */
    public static function sitePairs(): array
    {
        return DB::pairs('SELECT id, name FROM sites ORDER BY name');
    }
}
