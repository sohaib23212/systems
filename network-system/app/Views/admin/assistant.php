<?php
/** @var App\Core\View $v @var string $state */
use App\Services\Ai;

$v->title = 'مساعد المسؤول';
$v->script('js/assistant.js');
$ok = $state === 'ok';
$samples = ['كم دخل هذا الشهر مقارنة بالشهر الماضي؟', 'ما الحسابات التي تنتهي خلال أسبوع؟', 'ما الحسابات الخاملة منذ أكثر من أسبوعين؟', 'من أكثر الحسابات مشتركين؟'];
?>
<div class="panel chat" data-chat data-url="<?= e(url('/admin/assistant')) ?>"<?= $ok ? '' : ' data-disabled' ?>>
  <div class="panel-head"><h3><?= icon('sparkles') ?>مساعد المسؤول</h3><span class="badge <?= $ok ? 'badge-success' : 'badge-outline' ?>"><?= e($ok ? 'قراءة فقط' : Ai::stateLabel($state)) ?></span></div>
  <div class="chat-log" data-chat-log aria-live="polite">
    <div class="chat-empty" data-chat-empty>
      <span class="chat-empty-icon"><?= icon('sparkles') ?></span>
      <?php if ($ok): ?>
      <div class="chat-samples"><?php foreach ($samples as $q): ?><button type="button" class="chip chip-btn" data-chat-sample><?= e($q) ?></button><?php endforeach; ?></div>
      <?php else: ?>
      <div class="empty-title">غير متاح</div><div class="text-muted text-sm"><?= e(Ai::stateLabel($state)) ?></div>
      <?php endif; ?>
    </div>
  </div>
  <form class="chat-form" data-chat-form>
    <textarea class="input" name="q" rows="1" maxlength="2000" placeholder="اكتب سؤالك" aria-label="سؤالك"<?= $ok ? '' : ' disabled' ?>></textarea>
    <button class="btn btn-primary btn-icon" aria-label="إرسال"<?= $ok ? '' : ' disabled' ?>><?= icon('send') ?></button>
  </form>
</div>
