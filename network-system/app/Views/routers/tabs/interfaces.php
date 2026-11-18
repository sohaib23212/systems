<?php
/** @var App\Core\View $v */
?>
<div class="table-wrap">
  <table class="table table-compact">
    <thead><tr><th>الواجهة</th><th>النوع</th><th>الحالة</th><th>MAC</th><th class="num">المستلم</th><th class="num">المرسل</th><th>آخر اتصال</th><th class="num">مرات الانقطاع</th><th>تعليق</th></tr></thead>
    <tbody>
    <?php foreach ($rows as $i): ?>
      <tr>
        <td><span class="mono"><?= e($i['name']) ?></span><?= $i['name'] === $router['wan_interface'] ? ' <span class="badge badge-primary">WAN</span>' : '' ?></td>
        <td><?= e($i['type']) ?></td>
        <td>
          <?php if ($i['disabled']): ?><span class="badge badge-outline">معطلة</span>
          <?php elseif ($i['running']): ?><span class="badge badge-success badge-dot">تعمل</span>
          <?php else: ?><span class="badge badge-danger badge-dot">متوقفة</span><?php endif; ?>
        </td>
        <td><span class="mono text-sm"><?= e($i['mac'] ?: '—') ?></span></td>
        <td class="num"><?= e(fmt_bytes($i['rx_byte'])) ?></td>
        <td class="num"><?= e(fmt_bytes($i['tx_byte'])) ?></td>
        <td class="nowrap text-sm"><?= e($i['link_up'] ?: '—') ?></td>
        <td class="num"><?= num($i['link_downs']) ?></td>
        <td><?= e($i['comment']) ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
</div>
