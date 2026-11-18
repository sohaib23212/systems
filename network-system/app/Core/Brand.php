<?php
declare(strict_types=1);

namespace App\Core;

/**
 * هوية النظام (MADIX NEXUS) وهوية الشبكة (شعار الشبكة واسمها).
 */
final class Brand
{
    public const NAME = 'MADIX NEXUS';
    public const TAGLINE = 'نظام إدارة الشبكات';
    public const COLOR = '#1E3A8A';
    public const ACCENT = '#06B6D4';

    /** مسار شعار الشبكة المرفوع أو فارغ */
    /** صفحات المنصة نفسها (خارج أي حساب زبون) */
    public static function onPlatform(): bool
    {
        return Platform::enabled() && Tenant::current() === null;
    }

    public static function networkLogo(): string
    {
        if (self::onPlatform()) {
            return '';
        }
        try {
            return Config::installed() ? (string) Settings::get('general.logo', '') : '';
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * علامة الشبكة: شعارها المرفوع، وإلا أول حرف من اسمها.
     */
    public static function networkMark(string $class = ''): string
    {
        $logo = self::networkLogo();
        $cls = trim('net-mark ' . $class);
        if ($logo !== '') {
            return '<span class="' . e($cls) . ' has-logo"><img src="' . e(upload_url($logo)) . '" alt=""></span>';
        }
        $name = self::networkName();
        $initial = mb_strtoupper(mb_substr(preg_replace('/[^\p{L}\p{N}]/u', '', $name) ?: 'N', 0, 1));
        return '<span class="' . e($cls) . '" aria-hidden="true">' . e($initial) . '</span>';
    }

    public static function networkName(): string
    {
        if (self::onPlatform()) {
            return self::NAME;
        }
        try {
            return Config::installed() ? Settings::networkName() : self::NAME;
        } catch (\Throwable) {
            return self::NAME;
        }
    }

    /** شعار النظام كصورة */
    public static function mark(int $size = 40, string $class = ''): string
    {
        return '<img class="' . e(trim('brand-logo ' . $class)) . '" src="' . e(asset('img/brand/mark.svg')) . '" width="' . $size . '" height="' . $size . '" alt="' . self::NAME . '">';
    }

    /** علامة التوثيق الزرقاء بجانب اسم المطوّر (بنمط علامة التوثيق في إنستغرام) */
    public static function verified(int $size = 14): string
    {
        return '<img class="verified-badge" src="' . e(asset('img/brand/verified.svg')) . '" width="' . $size . '" height="' . $size . '" alt="Verified" title="Verified" decoding="async">';
    }

    /** اسم المطوّر مع علامة التوثيق: لا ينفصلان عند التفاف السطر */
    public static function developer(int $size = 14): string
    {
        return '<span class="dev-name"><b>Sohaib Qudeih</b>' . self::verified($size) . '</span>';
    }

    /** اسم النظام بخطّين */
    public static function wordmark(string $class = ''): string
    {
        return '<span class="' . e(trim('wordmark ' . $class)) . '" dir="ltr"><b>MADIX</b> <span>NEXUS</span></span>';
    }

    /** وسوم الأيقونة والتطبيق في رأس الصفحة */
    public static function headTags(): string
    {
        $logo = self::networkLogo();
        $icon = $logo !== '' ? upload_url($logo) : asset('img/brand/mark.svg');
        $type = $logo !== '' ? '' : ' type="image/svg+xml"';
        return '<link rel="icon"' . $type . ' href="' . e($icon) . '">' . "\n"
            . ($logo === '' ? '<link rel="alternate icon" href="' . e(asset('img/brand/favicon-32.png')) . '">' . "\n" : '')
            . '<link rel="apple-touch-icon" href="' . e($logo !== '' ? upload_url($logo) : asset('img/brand/apple-touch-icon.png')) . '">' . "\n"
            . '<link rel="manifest" href="' . e(url('/manifest.webmanifest')) . '">' . "\n"
            . '<meta name="theme-color" content="' . self::COLOR . '">' . "\n"
            . '<meta name="application-name" content="' . self::NAME . '">';
    }
}
