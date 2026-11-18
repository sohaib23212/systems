<?php
/** @var App\Core\View $v */
use App\Platform\Landing;

$v->title = 'صفحة الهبوط';
$v->actions = '<a class="btn" href="' . e(url('/')) . '" target="_blank" rel="noopener">' . icon('external-link') . 'عرض الصفحة</a>';
$long = ['hero_text', 'features_text', 'apps_text', 'cta_text'];
?>
<form method="post" action="<?= e(url('/admin/landing')) ?>" data-landing-form>
  <?= csrf_field() ?>
  <div class="grid grid-main-side">
    <div class="stack">
      <div class="panel">
        <div class="panel-head"><h3><?= icon('type') ?>النصوص</h3></div>
        <div class="panel-body">
          <div class="form-grid">
            <?php foreach (Landing::TEXT_FIELDS as $k => $label): ?>
              <div class="field <?= in_array($k, $long, true) || $k === 'hero_title' ? 'col-12' : 'col-6' ?>">
                <label for="lf-<?= $k ?>"><?= e($label) ?></label>
                <?php if (in_array($k, $long, true)): ?>
                  <textarea class="input" id="lf-<?= $k ?>" name="<?= $k ?>" rows="2" maxlength="400"><?= e(Landing::get($k)) ?></textarea>
                <?php else: ?>
                  <input class="input" id="lf-<?= $k ?>" name="<?= $k ?>" value="<?= e(Landing::get($k)) ?>" maxlength="400">
                <?php endif; ?>
              </div>
            <?php endforeach; ?>
          </div>
        </div>
      </div>
      <?php foreach (Landing::LIST_FIELDS as $k => $label): ?>
      <div class="panel" data-rows="<?= $k ?>">
        <div class="panel-head"><h3><?= icon('list') ?><?= e($label) ?></h3><button type="button" class="btn btn-sm" data-row-add><?= icon('plus') ?>إضافة</button></div>
        <div class="panel-body stack rows-list" style="gap:10px">
          <?php foreach (Landing::items($k) as [$a, $b]): ?>
          <div class="row-item">
            <input class="input" name="<?= $k ?>_title[]" value="<?= e($a) ?>" maxlength="120" aria-label="العنوان">
            <input class="input" name="<?= $k ?>_text[]" value="<?= e($b) ?>" maxlength="300" aria-label="الوصف">
            <button type="button" class="btn btn-ghost btn-icon btn-sm text-danger" data-row-del title="حذف"><?= icon('trash-2') ?></button>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
    <div class="stack design-side">
      <div class="panel">
        <div class="panel-head"><h3><?= icon('layout-grid') ?>الأقسام الظاهرة</h3></div>
        <div class="panel-body stack" style="gap:12px">
          <?php foreach (Landing::SECTIONS as $k => $label): ?>
            <label class="switch"><input type="checkbox" name="show_<?= $k ?>" value="1"<?= checked(Landing::on($k)) ?>><span class="track"></span><span><?= e($label) ?></span></label>
          <?php endforeach; ?>
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-block"><?= icon('save') ?>حفظ صفحة الهبوط</button>
    </div>
  </div>
</form>
<script>
document.querySelector('[data-landing-form]').addEventListener('click', function (e) {
  var add = e.target.closest('[data-row-add]');
  var del = e.target.closest('[data-row-del]');
  if (add) {
    var panel = add.closest('[data-rows]');
    var k = panel.getAttribute('data-rows');
    var row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = '<input class="input" name="' + k + '_title[]" maxlength="120" aria-label="العنوان"><input class="input" name="' + k + '_text[]" maxlength="300" aria-label="الوصف">'
      + '<button type="button" class="btn btn-ghost btn-icon btn-sm text-danger" data-row-del title="حذف">' + SN.icon('trash-2') + '</button>';
    panel.querySelector('.rows-list').appendChild(row);
    row.querySelector('input').focus();
  }
  if (del) { del.closest('.row-item').remove(); }
});
</script>
