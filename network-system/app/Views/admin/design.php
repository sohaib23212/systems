<?php
/** @var App\Core\View $v @var array $t */
use App\Core\Theme;

$v->title = 'التصاميم والحركة';
$v->script('js/design.js');
$faces = '';
foreach (array_keys(Theme::FONTS) as $fk) {
    $faces .= Theme::fontFaces($fk, [400, 700]);
}
?>
<style><?= $faces ?></style>
<form method="post" action="<?= e(url('/admin/design')) ?>" class="design-form" data-design-form>
  <?= csrf_field() ?>
  <div class="grid grid-main-side">
    <div class="stack">
      <div class="panel">
        <div class="panel-head"><h3><?= icon('type') ?>نوع الخط</h3></div>
        <div class="panel-body">
          <div class="choice-grid is-fonts">
            <?php foreach (Theme::FONTS as $k => [$label, $family]): ?>
              <label class="choice"><input type="radio" name="font" value="<?= e($k) ?>"<?= checked($t['font'] === $k) ?>>
                <span class="choice-card"><span class="font-sample" style="font-family:'<?= e($family) ?>'">أبجد هوز 123</span><small><?= e($label) ?></small></span>
              </label>
            <?php endforeach; ?>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3><?= icon('palette') ?>اللون الرئيسي</h3></div>
        <div class="panel-body">
          <div class="choice-grid is-colors">
            <?php foreach (Theme::PALETTES as $k => [$label, $light]): ?>
              <label class="choice"><input type="radio" name="palette" value="<?= e($k) ?>"<?= checked($t['palette'] === $k) ?>>
                <span class="choice-card"><span class="color-dot" style="background:<?= e($light) ?>"></span><small><?= e($label) ?></small></span>
              </label>
            <?php endforeach; ?>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3><?= icon('sparkles') ?>الحركة والانتقالات</h3></div>
        <div class="panel-body">
          <div class="choice-grid is-motion">
            <?php foreach (Theme::MOTION as $k => $label): ?>
              <label class="choice"><input type="radio" name="motion" value="<?= e($k) ?>"<?= checked($t['motion'] === $k) ?>>
                <span class="choice-card"><span class="motion-demo is-<?= e($k) ?>"><i></i><i></i><i></i></span><small><?= e($label) ?></small></span>
              </label>
            <?php endforeach; ?>
          </div>
          <div class="form-grid mt-3">
            <div class="field col-6"><label>التأخير بين العناصر المتتابعة</label><div class="input-group"><input class="input" type="number" name="stagger" min="0" max="200" step="5" value="<?= e($t['stagger']) ?>"><span class="input-addon">ملي ثانية</span></div></div>
            <div class="field col-6"><label>مدة الحركة</label><div class="input-group"><input class="input" type="number" name="speed" min="120" max="1200" step="20" value="<?= e($t['speed']) ?>"><span class="input-addon">ملي ثانية</span></div></div>
            <div class="field col-6"><label class="switch"><input type="checkbox" name="page_fx" value="1"<?= checked($t['page_fx'] === '1') ?>><span class="track"></span><span>انتقال ناعم بين الصفحات</span></label></div>
            <div class="field col-6"><label class="switch"><input type="checkbox" name="haptics" value="1"<?= checked($t['haptics'] === '1') ?>><span class="track"></span><span>الاهتزاز عند اللمس</span></label></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3><?= icon('layout-grid') ?>الشكل العام</h3></div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="field col-4"><label>الزوايا</label><div class="segmented is-block"><?php foreach (Theme::RADIUS as $k => $l): ?><label><input type="radio" name="radius" value="<?= $k ?>"<?= checked($t['radius'] === $k) ?>><span><?= e($l) ?></span></label><?php endforeach; ?></div></div>
            <div class="field col-4"><label>كثافة العرض</label><div class="segmented is-block"><?php foreach (Theme::DENSITY as $k => $l): ?><label><input type="radio" name="density" value="<?= $k ?>"<?= checked($t['density'] === $k) ?>><span><?= e($l) ?></span></label><?php endforeach; ?></div></div>
            <div class="field col-4"><label>القائمة الجانبية</label><div class="segmented is-block"><?php foreach (Theme::SIDEBAR as $k => $l): ?><label><input type="radio" name="sidebar" value="<?= $k ?>"<?= checked($t['sidebar'] === $k) ?>><span><?= e($l) ?></span></label><?php endforeach; ?></div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="stack design-side">
      <div class="panel design-preview-panel">
        <div class="panel-head"><h3><?= icon('eye') ?>معاينة</h3><button type="button" class="btn btn-sm" data-replay><?= icon('play') ?>إعادة</button></div>
        <div class="panel-body">
          <div class="design-preview" data-preview>
            <div class="pv-side"><span class="pv-logo"></span><i class="on"></i><i></i><i></i><i></i></div>
            <div class="pv-main">
              <div class="pv-title">لوحة التحكم</div>
              <div class="pv-stats"><div><small>المتصلون</small><b>248</b></div><div><small>المبيعات</small><b>1,350</b></div></div>
              <div class="pv-card"><span class="pv-btn">زر رئيسي</span><span class="pv-chip">شارة</span></div>
              <div class="pv-row"></div><div class="pv-row"></div><div class="pv-row"></div>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-block"><?= icon('check') ?>تطبيق على كل الأنظمة</button>
    </div>
  </div>
</form>
