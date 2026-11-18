<?php
/**
 * شاشات الدخول والتسجيل: لوحة عرض بألوان التصميم المختار + بطاقة النموذج.
 * كل الألوان والخطوط والزوايا والأزرار من التصميم المطبّق (Theme)، فتتبع الشاشة أي تصميم يختاره المسؤول.
 * @var App\Core\View $v
 * @var string $content
 * @var ?string $paneTitle  اسم الشبكة أو المنصة
 * @var ?string $paneMark   علامة HTML (شعار الشبكة)
 * @var ?string $paneSub
 */
use App\Core\Brand;
use App\Core\Config;
use App\Core\Lang;
use App\Core\Session;

$paneTitle = $paneTitle ?? Brand::networkName();
$paneMark = $paneMark ?? Brand::networkMark('net-mark-xl');
$paneSub = $paneSub ?? Brand::TAGLINE;
$flash = Config::installed() || PHP_SAPI !== 'cli' ? (Session::pull('_flash', []) ?: []) : [];
$features = [
    ['ticket', 'الكروت والهوتسبوت'],
    ['users', 'المشتركون والاشتراكات'],
    ['router', 'أجهزة MikroTik لحظة بلحظة'],
    ['map', 'خريطة الشبكة والمواقع'],
    ['chart-column', 'المبيعات والتقارير'],
];
$tools = static function (string $cls) {
    ob_start(); ?>
    <div class="login-tools <?= e($cls) ?>">
      <?php if (Lang::switchable()): ?>
      <a class="login-tool" href="<?= e(Lang::switchUrl(Lang::isEn() ? 'ar' : 'en')) ?>" data-no-loading aria-label="<?= Lang::isEn() ? 'العربية' : 'English' ?>"><?= icon('globe') ?><?= Lang::isEn() ? '<span lang="ar">العربية</span>' : '<span lang="en" dir="ltr">English</span>' ?></a>
      <?php endif; ?>
      <div class="dropdown">
        <button type="button" class="login-tool" data-dropdown aria-label="المظهر"><?= icon('sun-moon') ?><span>المظهر</span></button>
        <div class="dropdown-menu">
          <button type="button" class="dropdown-item" data-theme-set="light"><?= icon('sun') ?>فاتح</button>
          <button type="button" class="dropdown-item" data-theme-set="dark"><?= icon('moon') ?>داكن</button>
          <button type="button" class="dropdown-item" data-theme-set="system"><?= icon('monitor') ?>حسب الجهاز</button>
        </div>
      </div>
    </div>
    <?php return (string) ob_get_clean();
};
?><!doctype html>
<html <?= Lang::htmlAttrs() ?> data-theme="light"<?= \App\Core\Theme::attrs() ?>>
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
    <div class="login-aurora"><span></span><span></span><span></span></div>
    <div class="login-gridfx"></div>
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
      <div class="login-hub">
        <svg class="login-hub-svg" viewBox="0 0 320 320">
          <circle class="login-orbit" cx="160" cy="160" r="124"/><circle class="login-orbit is-inner" cx="160" cy="160" r="82"/>
          <path class="login-link" d="M160 160 L160.0 36.0"/><path class="login-link" d="M160 160 L267.4 98.0"/><path class="login-link" d="M160 160 L267.4 222.0"/><path class="login-link" d="M160 160 L160.0 284.0"/><path class="login-link" d="M160 160 L52.6 222.0"/><path class="login-link" d="M160 160 L52.6 98.0"/>
          <circle class="login-packet" r="2.6"><animateMotion dur="2.60s" begin="0.0s" repeatCount="indefinite" path="M160 160 L160.0 36.0"/></circle><circle class="login-packet" r="2.6"><animateMotion dur="2.95s" begin="-0.7s" repeatCount="indefinite" path="M160 160 L267.4 98.0"/></circle><circle class="login-packet" r="2.6"><animateMotion dur="3.30s" begin="-1.4s" repeatCount="indefinite" path="M160 160 L267.4 222.0"/></circle><circle class="login-packet" r="2.6"><animateMotion dur="3.65s" begin="-2.1s" repeatCount="indefinite" path="M160 160 L160.0 284.0"/></circle><circle class="login-packet" r="2.6"><animateMotion dur="4.00s" begin="-2.8s" repeatCount="indefinite" path="M160 160 L52.6 222.0"/></circle><circle class="login-packet" r="2.6"><animateMotion dur="4.35s" begin="-3.5s" repeatCount="indefinite" path="M160 160 L52.6 98.0"/></circle>
        </svg>
        <?php foreach (['router', 'radio-tower', 'smartphone', 'wifi', 'laptop', 'satellite-dish'] as $i => $ic): ?>
        <span class="login-node" style="--a:<?= -90 + $i * 60 ?>deg;--d:<?= $i * 0.45 ?>s"><span><?= icon($ic) ?></span></span>
        <?php endforeach; ?>
        <div class="login-hub-core"><?= $paneMark ?></div>
      </div>
      <div class="login-network"><?= e($paneTitle) ?></div>
      <div class="login-tagline"><?= e($paneSub) ?></div>
      <ul class="login-features">
        <?php foreach ($features as $i => [$ic, $label]): ?>
          <li style="--i:<?= $i ?>"><span class="login-feature-icon"><?= icon($ic) ?></span><?= e($label) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
    <div class="login-pane-foot">
      <span class="login-secure"><?= icon('shield-check') ?>اتصال مشفّر وآمن</span>
      <span dir="ltr">&copy; <?= date('Y') ?> <?= Brand::NAME ?></span>
    </div>
  </aside>
  <main class="login-main">
    <?= $tools('is-desktop') ?>
    <div class="login-mobile-head">
      <?= $tools('is-mobile') ?>
      <div class="login-mobile-brand">
        <?= $paneMark ?>
        <div>
          <div class="login-network"><?= e($paneTitle) ?></div>
          <div class="login-tagline"><?= e($paneSub) ?></div>
        </div>
      </div>
    </div>
    <div class="login-card">
      <?= $content ?>
    </div>
    <div class="login-foot">
      <?= $v->partial('madix-credit') ?>
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
