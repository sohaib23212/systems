<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\DB;
use App\Core\Kernel;
use App\Core\Lang;
use App\Core\Request;
use App\Core\Response;
use App\Core\Settings;
use App\Core\Throttle;
use App\Services\BotAgent;
use App\Services\WhatsApp;
use Throwable;

/**
 * الواجهات العامة لبوت خدمة الزبائن: Webhook واتساب، ونافذة المحادثة في الموقع.
 */
final class BotPublicController extends Controller
{
    private static function hookOk(string $hook): bool
    {
        $stored = (string) Settings::get('bot.wa_hook', '');
        return $stored !== '' && hash_equals($stored, $hook);
    }

    /** تحقق Meta من رابط Webhook عند إضافته (hub.mode و hub.verify_token و hub.challenge) */
    public function whatsappVerify(Request $request, string $hook): Response
    {
        $verify = (string) Settings::get('bot.wa_verify', '');
        // PHP يحوّل النقطة في أسماء متغيرات الرابط إلى شرطة سفلية
        $mode = (string) ($request->query['hub_mode'] ?? '');
        $token = (string) ($request->query['hub_verify_token'] ?? '');
        $challenge = (string) ($request->query['hub_challenge'] ?? '');
        if (!self::hookOk($hook) || $verify === '' || $mode !== 'subscribe' || !hash_equals($verify, $token) || !preg_match('/^[\w\-]{1,128}$/', $challenge)) {
            return Response::text('forbidden', 403);
        }
        return Response::text($challenge);
    }

    /** رسائل الزبائن من واتساب: الرد 200 فوراً، والمعالجة بعد إغلاق الاتصال */
    public function whatsappWebhook(Request $request, string $hook): Response
    {
        if (!self::hookOk($hook)) {
            return Response::text('forbidden', 403);
        }
        $raw = $request->raw();
        if (!WhatsApp::signatureValid($raw, $request->header('X-Hub-Signature-256'))) {
            log_message('warning', 'whatsapp webhook: bad signature from ' . $request->ip());
            return Response::text('forbidden', 403);
        }
        $payload = json_decode($raw, true);
        $messages = is_array($payload) ? WhatsApp::parse($payload) : [];
        if ($messages && BotAgent::enabled() && WhatsApp::configured()) {
            Kernel::afterResponse(static function () use ($messages): void {
                foreach ($messages as $m) {
                    try {
                        $media = $m['text'] === '' ? self::mediaLabel($m['type']) : '';
                        $r = BotAgent::receive('whatsapp', $m['from'], $media !== '' ? $media : $m['text'], [
                            'name' => $m['name'], 'phone' => '+' . $m['from'], 'message_id' => 'wa:' . $m['id'], 'media' => $media !== '',
                        ]);
                        if (!empty($r['duplicate'])) {
                            continue;
                        }
                        WhatsApp::markRead($m['id']);
                        if ($r['reply'] !== null) {
                            $s = WhatsApp::send($m['from'], $r['reply']);
                            if (!$s['ok']) {
                                log_message('warning', 'whatsapp reply: ' . $s['message']);
                            }
                        }
                    } catch (Throwable $e) {
                        log_message('error', 'whatsapp message: ' . WhatsApp::scrub($e->getMessage()));
                    }
                }
            });
        }
        return json_response(['ok' => true]);
    }

    private static function mediaLabel(string $type): string
    {
        return match ($type) {
            'audio' => '[رسالة صوتية]',
            'image' => '[صورة]',
            'video' => '[فيديو]',
            'document' => '[ملف]',
            'sticker' => '[ملصق]',
            'location' => '[موقع]',
            'contacts' => '[جهة اتصال]',
            default => '[رسالة غير نصية]',
        };
    }

    // ------------------------------------------------------------------
    // نافذة المحادثة في الموقع
    // ------------------------------------------------------------------

    private static function webOk(string $key): bool
    {
        $stored = (string) Settings::get('bot.web_key', '');
        return BotAgent::enabled() && Settings::bool('bot.web') && $stored !== '' && hash_equals($stored, $key);
    }

    /** رسائل المحادثة بعد رقم (أو آخر 50 عند الفتح) */
    private static function since(int $chatId, int $after): array
    {
        $rows = $after > 0
            ? DB::rows("SELECT id, role, body, created_at FROM bot_messages WHERE chat_id = ? AND id > ? AND role IN ('user','bot','staff') ORDER BY id LIMIT 50", [$chatId, $after])
            : array_reverse(DB::rows("SELECT id, role, body, created_at FROM bot_messages WHERE chat_id = ? AND role IN ('user','bot','staff') ORDER BY id DESC LIMIT 50", [$chatId]));
        return array_map(static fn ($r) => [
            'id' => (int) $r['id'], 'role' => $r['role'], 'body' => $r['body'], 'at' => date('H:i', (int) strtotime((string) $r['created_at'])),
        ], $rows);
    }

    private static function sid(mixed $v): ?string
    {
        $v = (string) $v;
        return preg_match('/^[a-f0-9]{32}$/', $v) ? $v : null;
    }

    public function webSend(Request $request, string $key): Response
    {
        Lang::set('ar');
        if (!self::webOk($key)) {
            return json_response(['ok' => false, 'message' => 'المحادثة غير متاحة.'], 404);
        }
        $data = $request->json() ?: $request->all();
        $sid = self::sid($data['sid'] ?? '');
        $text = trim((string) ($data['text'] ?? ''));
        if ($sid === null || $text === '') {
            return json_response(['ok' => false, 'message' => 'اكتب رسالتك.'], 422);
        }
        if (!Throttle::rate('bot:web:' . $request->ip(), 20, 60)) {
            return json_response(['ok' => false, 'message' => 'رسائل كثيرة خلال وقت قصير. انتظر دقيقة.'], 429);
        }
        $r = BotAgent::receive('web', $sid, mb_substr($text, 0, 1000), ['name' => mb_substr(trim((string) ($data['name'] ?? '')), 0, 60)]);
        return json_response(['ok' => true, 'messages' => self::since((int) $r['chat']['id'], max(0, (int) ($data['after'] ?? 0)))]);
    }

    public function webPoll(Request $request, string $key): Response
    {
        Lang::set('ar');
        if (!self::webOk($key)) {
            return json_response(['ok' => false, 'message' => 'المحادثة غير متاحة.'], 404);
        }
        $sid = self::sid($request->str('sid'));
        if ($sid === null) {
            return json_response(['ok' => false], 422);
        }
        if (!Throttle::rate('bot:poll:' . $request->ip(), 90, 60)) {
            return json_response(['ok' => false], 429);
        }
        $id = DB::value("SELECT id FROM bot_chats WHERE channel = 'web' AND external_id = ?", [$sid]);
        return json_response(['ok' => true, 'messages' => $id ? self::since((int) $id, max(0, $request->int('after'))) : []])
            ->withHeader('Cache-Control', 'no-store');
    }

    /** صفحة محادثة كاملة (رابط يُرسل للزبائن أو يُفتح من صفحة الهوتسبوت) */
    public function webPage(Request $request, string $key): Response
    {
        Lang::set('ar');
        if (!self::webOk($key)) {
            return Response::text('<!doctype html><meta charset="utf-8"><title>غير متاح</title><p style="font-family:sans-serif;text-align:center;margin-top:20vh">المحادثة غير متاحة.</p>', 404, 'text/html; charset=UTF-8');
        }
        $title = trim((string) Settings::get('bot.name', '')) ?: 'مساعد ' . Settings::networkName();
        $endpoint = Settings::panelUrl() . '/bot/web/' . $key;
        $html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            . '<title>' . e($title) . '</title>'
            . '<style>html,body{margin:0;height:100%;background:#f4f6fb}#mxb-page{position:fixed;inset:0}</style></head><body>'
            . '<div id="mxb-page"></div>'
            . '<script src="' . e(asset('widget/bot-widget.js')) . '" data-endpoint="' . e($endpoint) . '" data-title="' . e($title) . '" data-mode="page" data-target="mxb-page"></script>'
            . '</body></html>';
        return Response::text($html, 200, 'text/html; charset=UTF-8')->withHeader('Cache-Control', 'no-store');
    }
}
