<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\AdminAuth;
use App\Core\Platform;
use App\Core\Request;
use App\Core\Response;
use App\Core\Theme;
use App\Platform\Landing;

/**
 * التصاميم والحركة لكل الأنظمة، ومحتوى صفحة الهبوط.
 */
final class DesignController extends Controller
{
    public function index(Request $request): Response
    {
        return view('admin/design', ['t' => Theme::current()], 'admin');
    }

    public function save(Request $request): Response
    {
        $in = static fn (string $k, array $allowed, string $def) => in_array($request->str($k), $allowed, true) ? $request->str($k) : $def;
        $values = [
            'design.font'    => $in('font', array_keys(Theme::FONTS), 'plex'),
            'design.palette' => $in('palette', array_keys(Theme::PALETTES), 'royal'),
            'design.radius'  => $in('radius', array_keys(Theme::RADIUS), 'normal'),
            'design.density' => $in('density', array_keys(Theme::DENSITY), 'normal'),
            'design.sidebar' => $in('sidebar', array_keys(Theme::SIDEBAR), 'light'),
            'design.motion'  => $in('motion', array_keys(Theme::MOTION), 'rise'),
            'design.stagger' => (string) max(0, min(200, $request->int('stagger', 45))),
            'design.speed'   => (string) max(120, min(1200, $request->int('speed', 380))),
            'design.page_fx' => $request->bool('page_fx') ? '1' : '0',
            'design.haptics' => $request->bool('haptics') ? '1' : '0',
        ];
        Platform::setSettings($values);
        Theme::flush();
        Platform::log(null, 'admin', 'platform.design', 'تعديل التصاميم والحركة', AdminAuth::user()['name']);
        return $this->ok('تم تطبيق التصميم على كل الأنظمة.', '/admin/design');
    }

    public function landing(Request $request): Response
    {
        return view('admin/landing', [], 'admin');
    }

    public function saveLanding(Request $request): Response
    {
        $values = [];
        foreach (array_keys(Landing::TEXT_FIELDS) as $k) {
            $values['landing.' . $k] = mb_substr(trim($request->str($k)), 0, 400);
        }
        foreach (array_keys(Landing::LIST_FIELDS) as $k) {
            $titles = (array) $request->input($k . '_title', []);
            $texts = (array) $request->input($k . '_text', []);
            $lines = [];
            foreach ($titles as $i => $title) {
                $title = trim(str_replace(['|', "\n", "\r"], ' ', (string) $title));
                $text = trim(str_replace(["\n", "\r"], ' ', (string) ($texts[$i] ?? '')));
                if ($title !== '') {
                    $lines[] = mb_substr($title, 0, 120) . ($text !== '' ? ' | ' . mb_substr($text, 0, 300) : '');
                }
            }
            $values['landing.' . $k] = implode("\n", array_slice($lines, 0, 12));
        }
        foreach (array_keys(Landing::SECTIONS) as $k) {
            $values['landing.show_' . $k] = $request->bool('show_' . $k) ? '1' : '0';
        }
        foreach ($values as $k => $v) {
            if ($v === '' && !str_starts_with($k, 'landing.show_')) {
                $values[$k] = Landing::DEFAULTS[$k] ?? '';
            }
        }
        Platform::setSettings($values);
        Platform::log(null, 'admin', 'platform.landing', 'تعديل صفحة الهبوط', AdminAuth::user()['name']);
        return $this->ok('تم حفظ صفحة الهبوط.', '/admin/landing');
    }
}
