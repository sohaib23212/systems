<?php
/**
 * صفحة الهبوط للمنصة: صفحة مستقلة بأنماطها وسكربتها الخفيف (لا تحمّل أنماط النظام ولا سكربته).
 * كل المحتوى ظاهر بلا جافاسكربت، والحركة تحسين فقط.
 * @var App\Core\View $v
 * @var string $content
 */
use App\Core\Brand;
use App\Core\Session;
use App\Core\Theme;
use App\Platform\Landing;

$flash = Session::pull('_flash', []) ?: [];
?><!doctype html>
<html <?= \App\Core\Lang::htmlAttrs() ?><?= Theme::attrs() ?>>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="<?= e(Landing::get('hero_text')) ?>">
<meta property="og:title" content="<?= e(Brand::NAME . ' — ' . Landing::get('hero_title')) ?>">
<meta property="og:description" content="<?= e(Landing::get('hero_text')) ?>">
<meta property="og:type" content="website">
<title><?= e(Brand::NAME . ' — ' . Brand::TAGLINE) ?></title>
<link rel="stylesheet" href="<?= e(asset('css/landing.css')) ?>">
<?= Theme::style() ?>
<?= Brand::headTags() ?>
</head>
<body class="lp">
<?php foreach ($flash as $f): ?>
<div class="lp-flash is-<?= e(($f['type'] ?? '') === 'error' ? 'error' : 'ok') ?>" role="status"><?= e((string) ($f['message'] ?? '')) ?></div>
<?php endforeach; ?>
<?= $content ?>
<script src="<?= e(asset('js/landing.js')) ?>" defer></script>
</body>
</html>
