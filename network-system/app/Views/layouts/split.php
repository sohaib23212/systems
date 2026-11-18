<?php
/**
 * شاشة الدخول المقسومة: لوحة الهوية + النموذج.
 * @var App\Core\View $v
 * @var string $content
 * @var ?string $paneTitle  اسم الشبكة أو المنصة
 * @var ?string $paneMark   علامة HTML (شعار الشبكة)
 * @var ?string $paneSub
 */
use App\Core\Brand;
use App\Core\Config;
use App\Core\Session;

$paneTitle = $paneTitle ?? Brand::networkName();
$paneMark = $paneMark ?? Brand::networkMark('net-mark-xl');
$paneSub = $paneSub ?? Brand::TAGLINE;
$flash = Config::installed() || PHP_SAPI !== 'cli' ? (Session::pull('_flash', []) ?: []) : [];
?><!doctype html>
<html lang="ar" dir="rtl" data-theme="light"<?= \App\Core\Theme::attrs() ?>>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<meta name="base-url" content="<?= e(base_path()) ?>">
<meta name="icons-url" content="<?= e(asset('img/icons.svg')) ?>">
<meta name="robots" content="noindex, nofollow">
<title><?= e(($v->title !== '' ? $v->title . ' · ' : '') . $paneTitle) ?></title>
<script>
(function () {
  var p = 'system';
  try { p = localStorage.getItem('sn-theme') || 'system'; } catch (e) {}
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', p === 'system' ? (dark ? 'dark' : 'light') : p);
  document.documentElement.setAttribute('data-theme-pref', p);
})();
</script>
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
<?= \App\Core\Theme::style() ?>
<?= Brand::headTags() ?>
</head>
<body class="login-body <?= e($v->bodyClass) ?>">
<div class="login-shell">
  <aside class="login-pane" aria-hidden="true">
    <svg class="login-net" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
      <g stroke="currentColor" stroke-width="1.2" fill="none" opacity=".55">
        <path d="M60 120 L210 230 L380 140 L540 260 M210 230 L250 420 L420 380 L540 260 M250 420 L120 560 L300 650 L470 590 L420 380 M120 560 L60 380 L210 230 M300 650 L330 770 M470 590 L580 700"/>
      </g>
      <g fill="currentColor">
        <circle class="n1" cx="60" cy="120" r="4"/><circle class="n2" cx="210" cy="230" r="6"/><circle class="n3" cx="380" cy="140" r="4"/>
        <circle class="n1" cx="540" cy="260" r="5"/><circle class="n3" cx="250" cy="420" r="7"/><circle class="n2" cx="420" cy="380" r="5"/>
        <circle class="n1" cx="120" cy="560" r="5"/><circle class="n2" cx="300" cy="650" r="6"/><circle class="n3" cx="470" cy="590" r="4"/>
        <circle class="n2" cx="60" cy="380" r="3.5"/><circle class="n1" cx="330" cy="770" r="3.5"/><circle class="n3" cx="580" cy="700" r="3.5"/>
      </g>
    </svg>
    <div class="login-pane-top">
      <?= Brand::mark(34, 'is-glass') ?>
      <?= Brand::wordmark('is-light') ?>
    </div>
    <div class="login-pane-center">
      <?= $paneMark ?>
      <div class="login-network"><?= e($paneTitle) ?></div>
      <div class="login-tagline"><?= e($paneSub) ?></div>
    </div>
    <div class="login-pane-foot">&copy; <?= date('Y') ?> <?= Brand::NAME ?></div>
  </aside>
  <main class="login-main">
    <div class="login-mobile-head">
      <?= $paneMark ?>
      <div>
        <div class="login-network"><?= e($paneTitle) ?></div>
        <div class="login-tagline"><?= e($paneSub) ?></div>
      </div>
    </div>
    <div class="login-card">
      <?= $content ?>
    </div>
    <div class="login-foot">
      <?= $v->partial('madix-credit') ?>
      <div class="dropdown">
        <button type="button" class="btn btn-ghost btn-xs" data-dropdown><?= icon('sun-moon', 'icon-sm') ?>المظهر</button>
        <div class="dropdown-menu">
          <button type="button" class="dropdown-item" data-theme-set="light"><?= icon('sun') ?>فاتح</button>
          <button type="button" class="dropdown-item" data-theme-set="dark"><?= icon('moon') ?>داكن</button>
          <button type="button" class="dropdown-item" data-theme-set="system"><?= icon('monitor') ?>حسب الجهاز</button>
        </div>
      </div>
    </div>
  </main>
</div>
<div class="toasts" aria-live="polite"></div>
<?php if ($flash): ?>
<script type="application/json" id="flash-data"><?= json_encode($flash, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<?php endif; ?>
<script src="<?= e(asset('js/app.js')) ?>"></script>
<script src="<?= e(asset('js/app-bridge.js')) ?>"></script>
<?php foreach ($v->scripts as $script): ?>
<script src="<?= e(asset($script)) ?>"></script>
<?php endforeach; ?>
</body>
</html>
