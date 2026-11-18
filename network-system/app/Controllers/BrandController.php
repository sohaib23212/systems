<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Brand;
use App\Core\Request;
use App\Core\Response;

final class BrandController extends Controller
{
    /** بيان التطبيق لإضافة النظام إلى الشاشة الرئيسية */
    public function manifest(Request $request): Response
    {
        $name = Brand::networkName();
        $icon = static fn (string $file, int $size, string $purpose = 'any') => [
            'src' => asset('img/brand/' . $file), 'sizes' => $size . 'x' . $size, 'type' => 'image/png', 'purpose' => $purpose,
        ];
        return Response::json([
            'name' => $name . ' · ' . Brand::NAME,
            'short_name' => mb_substr($name, 0, 14),
            'description' => Brand::TAGLINE,
            'lang' => 'ar',
            'dir' => 'rtl',
            'start_url' => url('/'),
            'scope' => url('/'),
            'display' => 'standalone',
            'background_color' => Brand::COLOR,
            'theme_color' => Brand::COLOR,
            'icons' => [$icon('icon-192.png', 192), $icon('icon-512.png', 512), $icon('maskable-512.png', 512, 'maskable')],
        ], 200, ['Content-Type' => 'application/manifest+json; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
    }
}
