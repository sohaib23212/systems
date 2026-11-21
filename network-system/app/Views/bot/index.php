<?php
/**
 * صندوق محادثات الزبائن.
 * @var App\Core\View $v
 * @var App\Core\Request $request
 * @var array $chats @var App\Core\Paginator $pager @var string $f @var string $channel @var string $q @var array $filters @var array $counts
 */
use App\Services\BotAgent;

$v->title = 'محادثات الزبائن';
if (can('bot.manage')) {
    $v->actions = '<a class="btn" href="' . e(url('/bot/settings')) . '">' . icon('bot-message-square') . 'إعدادات البوت</a>';
}
$channelIcons = ['whatsapp' => 'phone', 'telegram' => 'send', 'web' => 'globe', 'test' => 'sparkles'];
?>
<div class="panel">
  <form class="filters" method="get">
    <div class="field"><label for="f">العرض</label>
      <select class="input" id="f" name="f" onchange="this.form.submit()">
        <?php foreach ($filters as $k => $label): ?>
          <option value="<?= e($k) ?>"<?= selected($f, $k) ?>><?= e($label) ?><?= $k === 'waiting' && (int) ($counts['waiting'] ?? 0) > 0 ? ' (' . num($counts['waiting']) . ')' : '' ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div class="field"><label for="channel">القناة</label>
      <select class="input" id="channel" name="channel" onchange="this.form.submit()">
        <option value="">كل القنوات</option>
        <?php foreach (BotAgent::CHANNELS as $k => $label): if ($k === 'test') { continue; } ?>
          <option value="<?= e($k) ?>"<?= selected($channel, $k) ?>><?= e($label) ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div class="field grow"><label for="q">بحث</label><input class="input" id="q" name="q" value="<?= e($q) ?>" placeholder="الاسم أو الرقم أو نص الرسالة"></div>
    <div class="field" style="flex:0 0 auto"><button class="btn btn-primary"><?= icon('search') ?>بحث</button></div>
  </form>
  <?php if (!$chats): ?>
    <div class="empty"><?= icon('message-square') ?><div class="empty-title"><?= $f === 'waiting' ? 'لا توجد محادثات بانتظار موظف' : 'لا توجد محادثات' ?></div></div>
  <?php else: ?>
  <div class="bot-list">
    <?php foreach ($chats as $c): ?>
      <a class="bot-row<?= (int) $c['needs_human'] && $c['status'] === 'open' ? ' is-waiting' : '' ?>" href="<?= e(url('/bot/chats/' . $c['id'])) ?>">
        <span class="bot-row-icon is-<?= e($c['channel']) ?>" title="<?= e(BotAgent::CHANNELS[$c['channel']] ?? $c['channel']) ?>"><?= icon($channelIcons[$c['channel']] ?? 'message-circle') ?></span>
        <span class="bot-row-main">
          <span class="bot-row-title">
            <b><?= e($c['name'] ?: ($c['phone'] ?: ($c['channel'] === 'web' ? 'زائر الموقع' : $c['external_id']))) ?></b>
            <?php if ($c['subscriber']): ?><span class="badge badge-outline"><?= icon('user-check') ?><?= e($c['subscriber']) ?></span><?php endif; ?>
            <?php if ((int) $c['needs_human'] && $c['status'] === 'open'): ?><span class="badge badge-danger badge-dot">بانتظار موظف</span>
            <?php elseif ($c['mode'] === 'human' && $c['status'] === 'open'): ?><span class="badge badge-info">مع موظف</span>
            <?php elseif ($c['status'] === 'closed'): ?><span class="badge badge-outline">مغلقة</span><?php endif; ?>
          </span>
          <span class="bot-row-last"><?= e((string) $c['last_message']) ?></span>
        </span>
        <span class="bot-row-end">
          <span class="text-sm text-muted nowrap"><?= e(fmt_dt($c['last_at'])) ?></span>
          <?php if ((int) $c['unread'] > 0): ?><span class="nav-badge is-danger"><?= (int) $c['unread'] > 99 ? '99+' : (int) $c['unread'] ?></span><?php endif; ?>
        </span>
      </a>
    <?php endforeach; ?>
  </div>
  <?= $pager->render($request) ?>
  <?php endif; ?>
</div>
