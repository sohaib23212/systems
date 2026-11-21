<?php
/**
 * محادثة زبون: الرسائل، ورد الموظف، واستلام المحادثة من البوت أو إعادتها له.
 * @var App\Core\View $v
 * @var array $chat @var array $messages @var array $subscribers @var ?string $assigned
 */
use App\Services\BotAgent;
use App\Services\SubscriberRules;

$who = $chat['name'] ?: ($chat['phone'] ?: ($chat['channel'] === 'web' ? 'زائر الموقع' : $chat['external_id']));
$v->title = $who;
$v->breadcrumbs = [['محادثات الزبائن', '/bot'], [$who, null]];
$v->script('js/bot.js');
$lastId = $messages ? (int) end($messages)['id'] : 0;
$human = $chat['mode'] === 'human';
$waOld = $chat['channel'] === 'whatsapp' && $chat['last_inbound_at'] && strtotime((string) $chat['last_inbound_at']) < time() - 86400;
$roleLabel = ['user' => 'الزبون', 'bot' => 'المساعد الآلي', 'staff' => 'موظف', 'note' => 'ملاحظة'];
?>
<div class="bot-thread-wrap">
  <div class="panel chat bot-thread" data-bot-thread data-poll="<?= e(url('/bot/chats/' . $chat['id'] . '/poll')) ?>" data-reply="<?= e(url('/bot/chats/' . $chat['id'] . '/reply')) ?>" data-last="<?= $lastId ?>">
    <div class="panel-head">
      <h3><?= icon('message-square') ?><?= e(BotAgent::CHANNELS[$chat['channel']] ?? $chat['channel']) ?></h3>
      <div class="chat-head-end">
        <span class="badge <?= $human ? 'badge-info' : 'badge-primary' ?>" data-bot-mode><?= $human ? 'مع موظف' : 'مع المساعد الآلي' ?></span>
        <span class="badge badge-danger badge-dot" data-bot-waiting<?= (int) $chat['needs_human'] ? '' : ' hidden' ?>>بانتظار موظف</span>
      </div>
    </div>
    <div class="chat-log" data-bot-log aria-live="polite">
      <?php foreach ($messages as $m): ?>
        <?php if ($m['role'] === 'note'): ?>
          <div class="bot-note" data-id="<?= (int) $m['id'] ?>"><?= icon('info') ?><span><?= e($m['body']) ?></span><small><?= e(fmt_dt($m['created_at'])) ?></small></div>
        <?php else: ?>
          <div class="chat-msg <?= $m['role'] === 'user' ? 'is-user' : 'is-assistant' ?><?= $m['role'] === 'staff' ? ' is-staff' : '' ?>" data-id="<?= (int) $m['id'] ?>"><span class="bot-msg-meta"><?= e($m['role'] === 'staff' && $m['employee'] ? $m['employee'] : $roleLabel[$m['role']]) ?> · <?= e(fmt_dt($m['created_at'])) ?><?php if ($m['tools']): ?> · <span class="mono" title="الأدوات التي استعملها المساعد"><?= e($m['tools']) ?></span><?php endif; ?></span><?= e($m['body']) ?></div>
        <?php endif; ?>
      <?php endforeach; ?>
    </div>
    <?php if ($chat['channel'] === 'test'): ?>
      <div class="bot-thread-note"><?= icon('info') ?>محادثة تجربة من صفحة الإعدادات.</div>
    <?php else: ?>
    <?php if ($waOld): ?><div class="bot-thread-note is-warning"><?= icon('triangle-alert') ?>مرّ أكثر من 24 ساعة على آخر رسالة من الزبون؛ واتساب لا يسمح بالرد الحر حتى يراسلك من جديد.</div><?php endif; ?>
    <form class="chat-form" method="post" action="<?= e(url('/bot/chats/' . $chat['id'] . '/reply')) ?>" data-bot-reply>
      <?= csrf_field() ?>
      <textarea class="input" name="body" rows="1" maxlength="4000" placeholder="اكتب ردك للزبون" aria-label="ردك" required></textarea>
      <button class="btn btn-primary btn-icon" aria-label="إرسال"><?= icon('send') ?></button>
    </form>
    <?= error_html('body') ?>
    <?php endif; ?>
  </div>

  <aside class="panel bot-side">
    <div class="panel-body">
      <div class="bot-side-actions">
        <?php if ($human): ?>
          <form method="post" action="<?= e(url('/bot/chats/' . $chat['id'] . '/mode')) ?>"><?= csrf_field() ?><input type="hidden" name="mode" value="bot"><button class="btn btn-block"><?= icon('bot') ?>إعادتها للمساعد الآلي</button></form>
        <?php else: ?>
          <form method="post" action="<?= e(url('/bot/chats/' . $chat['id'] . '/mode')) ?>"><?= csrf_field() ?><input type="hidden" name="mode" value="human"><button class="btn btn-primary btn-block"><?= icon('user-check') ?>استلام المحادثة</button></form>
        <?php endif; ?>
        <?php if ($chat['status'] === 'open'): ?>
          <form method="post" action="<?= e(url('/bot/chats/' . $chat['id'] . '/close')) ?>"><?= csrf_field() ?><button class="btn btn-block"><?= icon('circle-check') ?>إغلاق المحادثة</button></form>
        <?php else: ?>
          <form method="post" action="<?= e(url('/bot/chats/' . $chat['id'] . '/close')) ?>"><?= csrf_field() ?><input type="hidden" name="status" value="open"><button class="btn btn-block"><?= icon('rotate-ccw') ?>إعادة فتحها</button></form>
        <?php endif; ?>
      </div>

      <dl class="bot-facts">
        <dt>القناة</dt><dd><?= e(BotAgent::CHANNELS[$chat['channel']] ?? $chat['channel']) ?></dd>
        <?php if ($chat['phone']): ?><dt>الرقم</dt><dd><?= ltr(e($chat['phone'])) ?></dd><?php endif; ?>
        <dt>بدأت</dt><dd><?= e(fmt_dt($chat['created_at'])) ?></dd>
        <?php if ($assigned): ?><dt>الموظف</dt><dd><?= e($assigned) ?></dd><?php endif; ?>
      </dl>

      <?php if ($chat['channel'] !== 'test'): ?>
      <div class="form-section-title">المشترك</div>
      <?php foreach ($subscribers as $s): ?>
        <div class="bot-sub">
          <?php if (can('subscribers.view')): ?><a class="cell-title" href="<?= e(url('/subscribers/' . $s['id'])) ?>"><?= e($s['full_name']) ?></a><?php else: ?><b><?= e($s['full_name']) ?></b><?php endif; ?>
          <div class="cell-sub"><?= e($s['plan']) ?> · <?= SubscriberRules::badge($s) ?></div>
          <div class="cell-sub">ينتهي: <?= e(fmt_dt($s['expires_at'])) ?><?= (float) $s['balance'] > 0 ? ' · مستحق ' . e(money($s['balance'])) : '' ?></div>
        </div>
      <?php endforeach; ?>
      <?php if (!$subscribers): ?><div class="text-muted text-sm">غير مرتبطة بمشترك.</div><?php endif; ?>
      <?php if (can('subscribers.view')): ?>
      <form class="bot-link" method="post" action="<?= e(url('/bot/chats/' . $chat['id'] . '/link')) ?>">
        <?= csrf_field() ?>
        <div class="field-row">
          <input class="input input-ltr" name="username" value="<?= e(old('username', '')) ?>" placeholder="اسم المستخدم" aria-label="اسم مستخدم المشترك">
          <button class="btn"><?= icon('link') ?><?= $chat['subscriber_id'] ? 'تغيير' : 'ربط' ?></button>
        </div>
        <?= error_html('username') ?>
      </form>
      <?php endif; ?>
      <?php endif; ?>
    </div>
  </aside>
</div>
