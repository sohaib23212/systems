<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Audit;
use App\Core\Auth;
use App\Core\Crypto;
use App\Core\DB;
use App\Core\Paginator;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Core\Settings;
use App\Services\Ai;
use App\Services\BotAgent;
use App\Services\MadixCloud;
use App\Services\WhatsApp;

/**
 * بوت خدمة الزبائن: صندوق المحادثات (رد الموظفين واستلام المحادثة من البوت) وإعدادات البوت وقنواته.
 */
final class BotController extends Controller
{
    /** حقول الإعدادات [المفتاح => [القاعدة، التسمية]]؛ الأسرار تُعالج وحدها */
    private const FIELDS = [
        'bot.enabled'     => ['bool', 'تشغيل البوت'],
        'bot.name'        => ['nullable|max:60', 'اسم المساعد'],
        'bot.knowledge'   => ['nullable|max:20000', 'معلومات الشركة للمساعد'],
        'bot.notify'      => ['bool', 'تنبيه تيليجرام'],
        'bot.per_day'     => ['required|int|between:5,500', 'حد الرسائل اليومي للزبون'],
        'bot.telegram'    => ['bool', 'الرد في تيليجرام'],
        'bot.web'         => ['bool', 'نافذة الموقع'],
        'bot.whatsapp'    => ['bool', 'واتساب'],
        'bot.wa_phone_id' => ['nullable|regex:/^\\d{5,25}$/', 'معرّف رقم الهاتف'],
        'bot.erp'         => ['bool', 'الربط مع MADIX Cloud'],
        'bot.erp_url'     => ['nullable|max:200|regex:#^https?://[^\\s]+$#i', 'رابط MADIX Cloud'],
    ];

    /** الحقول السرية: تُشفَّر، والحقل الفارغ يُبقي القيمة المحفوظة */
    private const SECRETS = ['bot.wa_token' => 'رمز الوصول', 'bot.wa_secret' => 'سر التطبيق', 'bot.erp_key' => 'مفتاح MADIX Cloud'];

    private const FILTERS = ['waiting' => 'بانتظار موظف', 'open' => 'المفتوحة', 'closed' => 'المغلقة', 'all' => 'الكل'];

    // ------------------------------------------------------------------
    // صندوق المحادثات
    // ------------------------------------------------------------------

    public function index(Request $request): Response
    {
        $f = isset(self::FILTERS[$request->str('f')]) ? $request->str('f') : (BotAgent::waiting() > 0 ? 'waiting' : 'open');
        $channel = isset(BotAgent::CHANNELS[$request->str('channel')]) ? $request->str('channel') : '';
        $q = $request->str('q');
        $where = ["c.channel <> 'test'"];
        $params = [];
        if ($f === 'waiting') {
            $where[] = "c.status = 'open' AND c.needs_human = 1";
        } elseif ($f !== 'all') {
            $where[] = 'c.status = ?';
            $params[] = $f;
        }
        if ($channel !== '') {
            $where[] = 'c.channel = ?';
            $params[] = $channel;
        }
        if ($q !== '') {
            $like = '%' . DB::like($q) . '%';
            $where[] = '(c.name LIKE ? OR c.phone LIKE ? OR c.external_id LIKE ? OR c.last_message LIKE ? OR s.full_name LIKE ?)';
            array_push($params, $like, $like, $like, $like, $like);
        }
        $sqlWhere = implode(' AND ', $where);
        $total = (int) DB::value("SELECT COUNT(*) FROM bot_chats c LEFT JOIN subscribers s ON s.id = c.subscriber_id WHERE $sqlWhere", $params);
        $pager = new Paginator($total, 30, $request->int('page', 1));
        $chats = DB::rows(
            "SELECT c.*, s.full_name AS subscriber FROM bot_chats c LEFT JOIN subscribers s ON s.id = c.subscriber_id
             WHERE $sqlWhere ORDER BY c.needs_human DESC, c.last_at DESC LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        $counts = DB::row("SELECT SUM(status = 'open' AND needs_human = 1) AS waiting, SUM(status = 'open') AS open FROM bot_chats WHERE channel <> 'test'") ?? [];
        return view('bot/index', ['request' => $request, 'chats' => $chats, 'pager' => $pager, 'f' => $f, 'channel' => $channel, 'q' => $q, 'filters' => self::FILTERS, 'counts' => $counts]);
    }

    private function chatOr404(int $id): array
    {
        $chat = BotAgent::find($id);
        $this->notFoundUnless($chat);
        return (array) $chat;
    }

    public function show(Request $request, int $id): Response
    {
        $chat = $this->chatOr404($id);
        if ((int) $chat['unread'] > 0) {
            DB::update('bot_chats', ['unread' => 0], 'id = ?', [$id]);
        }
        $messages = array_reverse(DB::rows(
            'SELECT m.*, e.name AS employee FROM bot_messages m LEFT JOIN employees e ON e.id = m.employee_id WHERE m.chat_id = ? ORDER BY m.id DESC LIMIT 200',
            [$id]
        ));
        $subscribers = $chat['channel'] === 'test' ? [] : \App\Services\BotTools::subscribers($chat);
        $assigned = $chat['assigned_to'] ? DB::value('SELECT name FROM employees WHERE id = ?', [$chat['assigned_to']]) : null;
        return view('bot/show', ['chat' => $chat, 'messages' => $messages, 'subscribers' => $subscribers, 'assigned' => $assigned]);
    }

    /** الرسائل الجديدة للتحديث التلقائي */
    public function poll(Request $request, int $id): Response
    {
        Session::release();
        $chat = $this->chatOr404($id);
        $rows = DB::rows(
            'SELECT m.id, m.role, m.body, m.tools, m.created_at, e.name AS employee FROM bot_messages m LEFT JOIN employees e ON e.id = m.employee_id
             WHERE m.chat_id = ? AND m.id > ? ORDER BY m.id LIMIT 100',
            [$id, max(0, $request->int('after'))]
        );
        if ($rows && (int) $chat['unread'] > 0) {
            DB::update('bot_chats', ['unread' => 0], 'id = ?', [$id]);
        }
        return json_response([
            'ok' => true,
            'mode' => $chat['mode'], 'needs_human' => (bool) (int) $chat['needs_human'], 'status' => $chat['status'],
            'messages' => array_map(static fn ($r) => [
                'id' => (int) $r['id'], 'role' => $r['role'], 'body' => $r['body'], 'employee' => $r['employee'],
                'tools' => $r['tools'], 'at' => fmt_dt((string) $r['created_at']),
            ], $rows),
        ]);
    }

    public function reply(Request $request, int $id): Response
    {
        $chat = $this->chatOr404($id);
        $r = BotAgent::staffReply($chat, $request->str('body'), (int) Auth::id());
        if ($request->wantsJson()) {
            return json_response($r, $r['ok'] ? 200 : 422);
        }
        if (!$r['ok']) {
            return $this->backWithErrors($request, ['body' => $r['message']], '/bot/chats/' . $id);
        }
        return redirect('/bot/chats/' . $id);
    }

    /** استلام المحادثة من البوت، أو إعادتها له */
    public function mode(Request $request, int $id): Response
    {
        $chat = $this->chatOr404($id);
        $toBot = $request->str('mode') === 'bot';
        DB::update('bot_chats', $toBot
            ? ['mode' => 'bot', 'needs_human' => 0]
            : ['mode' => 'human', 'needs_human' => 0, 'assigned_to' => Auth::id()], 'id = ?', [$id]);
        BotAgent::store($chat, 'note', $toBot ? 'أُعيدت المحادثة للمساعد الآلي.' : 'استلم المحادثة ' . (string) (Auth::user()['name'] ?? '') . '.', ['employee_id' => Auth::id()]);
        Audit::log('bot.mode', ($toBot ? 'إعادة محادثة للبوت: ' : 'استلام محادثة من البوت: ') . ($chat['name'] ?: $chat['external_id']), 'bot_chat', $id);
        return $this->ok($toBot ? 'المحادثة الآن مع المساعد الآلي.' : 'المحادثة الآن معك، والبوت لن يرد فيها.', '/bot/chats/' . $id);
    }

    public function close(Request $request, int $id): Response
    {
        $chat = $this->chatOr404($id);
        $open = $request->str('status') === 'open';
        DB::update('bot_chats', $open ? ['status' => 'open'] : ['status' => 'closed', 'needs_human' => 0, 'mode' => 'bot'], 'id = ?', [$id]);
        Audit::log('bot.close', ($open ? 'إعادة فتح محادثة: ' : 'إغلاق محادثة: ') . ($chat['name'] ?: $chat['external_id']), 'bot_chat', $id);
        return $this->ok($open ? 'أُعيد فتح المحادثة.' : 'أُغلقت المحادثة، ويرد البوت على رسالة الزبون التالية.', $open ? '/bot/chats/' . $id : '/bot');
    }

    /** ربط المحادثة بمشترك يدوياً (باسم المستخدم) أو فك الربط */
    public function link(Request $request, int $id): Response
    {
        $chat = $this->chatOr404($id);
        $username = trim($request->str('username'));
        if ($username === '') {
            DB::update('bot_chats', ['subscriber_id' => null], 'id = ?', [$id]);
            return $this->ok('أُلغي ربط المحادثة بالمشترك.', '/bot/chats/' . $id);
        }
        $sub = DB::row('SELECT id, full_name FROM subscribers WHERE username = ?', [$username]);
        if (!$sub) {
            return $this->backWithErrors($request, ['username' => 'لا يوجد مشترك بهذا الاسم.'], '/bot/chats/' . $id);
        }
        DB::update('bot_chats', ['subscriber_id' => $sub['id']], 'id = ?', [$id]);
        Audit::log('bot.link', 'ربط محادثة ' . ($chat['name'] ?: $chat['external_id']) . ' بالمشترك ' . $sub['full_name'], 'subscriber', (int) $sub['id']);
        return $this->ok('رُبطت المحادثة بالمشترك ' . $sub['full_name'] . '.', '/bot/chats/' . $id);
    }

    // ------------------------------------------------------------------
    // الإعدادات
    // ------------------------------------------------------------------

    public function settings(Request $request): Response
    {
        WhatsApp::ensureKeys();
        if (!preg_match('/^[a-f0-9]{32}$/', (string) Settings::get('bot.web_key', ''))) {
            Settings::set('bot.web_key', bin2hex(random_bytes(16)));
        }
        $has = [];
        foreach (array_keys(self::SECRETS) as $k) {
            $has[$k] = (string) Settings::get($k, '') !== '';
        }
        $aiState = Ai::status();
        return view('bot/settings', ['has' => $has, 'aiState' => $aiState]);
    }

    public function save(Request $request): Response
    {
        $input = $this->settingsInput($request, self::FIELDS);
        $input['bot.erp_url'] = rtrim($input['bot.erp_url'], '/');
        foreach (self::SECRETS as $key => $label) {
            $form = str_replace('.', '__', $key);
            $raw = trim((string) $request->input($form, ''));
            if ($request->bool($form . '_clear')) {
                $input[$key] = '';
            } elseif ($raw !== '') {
                if (mb_strlen($raw) > 600 || preg_match('/\s/', $raw)) {
                    return $this->backWithErrors($request, [$form => $label . ' غير صالح.'], '/bot/settings');
                }
                $input[$key] = Crypto::encrypt($raw);
            }
        }
        if (array_key_exists('bot.erp_key', $input) || $input['bot.erp_url'] !== (string) Settings::get('bot.erp_url', '')) {
            $input['bot.erp_cache'] = '';
        }
        Settings::setMany($input);
        $log = array_diff_key($input, self::SECRETS + ['bot.knowledge' => 1, 'bot.erp_cache' => 1]);
        Audit::log('settings.update', 'تعديل إعدادات بوت خدمة الزبائن', 'settings', null, $log);
        return $this->ok('تم حفظ إعدادات البوت.', '/bot/settings');
    }

    /** تجربة البوت من صفحة الإعدادات (محادثة «تجربة» لكل موظف) */
    public function try(Request $request): Response
    {
        Session::release();
        $external = 'emp:' . (int) Auth::id();
        if ($request->bool('reset')) {
            DB::query("DELETE FROM bot_chats WHERE channel = 'test' AND external_id = ?", [$external]);
            return json_response(['ok' => true]);
        }
        $text = trim($request->str('text'));
        if ($text === '') {
            return json_response(['ok' => false, 'message' => 'اكتب رسالة.'], 422);
        }
        if (!Settings::bool('bot.enabled')) {
            return json_response(['ok' => false, 'message' => 'شغّل البوت واحفظ أولاً.'], 422);
        }
        $chat = BotAgent::chat('test', $external, ['name' => (string) (Auth::user()['name'] ?? '')]);
        if ($chat['mode'] === 'human') {
            // التجربة تعود للبوت دائماً
            DB::update('bot_chats', ['mode' => 'bot', 'needs_human' => 0], 'id = ?', [$chat['id']]);
        }
        $r = BotAgent::receive('test', $external, mb_substr($text, 0, 1000));
        $tools = (string) DB::value("SELECT tools FROM bot_messages WHERE chat_id = ? AND role = 'bot' ORDER BY id DESC LIMIT 1", [$r['chat']['id']]);
        return json_response([
            'ok' => true,
            'reply' => $r['reply'] ?? 'لم يرد البوت (المحادثة حُوّلت لموظف).',
            'tools' => $tools,
            'handoff' => ($r['chat']['mode'] ?? '') === 'human',
        ]);
    }

    public function whatsappTest(Request $request): Response
    {
        Session::release();
        $token = trim($request->str('token'));
        $r = WhatsApp::test(array_filter(['phone_id' => trim($request->str('phone_id')), 'token' => $token], static fn ($v) => $v !== ''));
        return json_response($r, $r['ok'] ? 200 : 422);
    }

    public function erpTest(Request $request): Response
    {
        Session::release();
        $with = [];
        $url = rtrim(trim($request->str('url')), '/');
        if ($url !== '') {
            if (!preg_match('#^https?://[^\s]+$#i', $url)) {
                return json_response(['ok' => false, 'message' => 'الرابط غير صالح.'], 422);
            }
            $with['base'] = $url;
        }
        if (($key = trim($request->str('key'))) !== '') {
            $with['key'] = $key;
        }
        $r = MadixCloud::test($with);
        return json_response($r, $r['ok'] ? 200 : 422);
    }

    /** رابط جديد لنافذة الموقع (الرابط القديم يتوقف) */
    public function webKey(Request $request): Response
    {
        Settings::set('bot.web_key', bin2hex(random_bytes(16)));
        Audit::log('settings.update', 'تجديد رابط نافذة المحادثة في الموقع', 'settings');
        return $this->ok('أُنشئ رابط جديد؛ حدّث كود النافذة في موقعك.', '/bot/settings');
    }
}
