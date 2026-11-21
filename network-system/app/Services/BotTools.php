<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\DB;
use App\Core\Settings;
use App\Core\Throttle;

/**
 * أدوات بوت خدمة الزبائن: قراءة فقط من بيانات الشبكة (ومن MADIX Cloud إن كان مربوطاً)،
 * والإجراء الوحيد تحويل المحادثة لموظف أو فتح تذكرة/طلب تجديد ينتظر موافقة.
 * كل أداة تعرف صاحب المحادثة من قناتها، ولا تقبل رقم حساب أو هاتف آخر من الزبون.
 */
final class BotTools
{
    private const NONE = ['type' => 'object', 'properties' => []];

    /** أقصى طول لنتيجة أداة تُعاد للنموذج */
    private const MAX = 6000;

    /** @return list<array{name:string, description:string, input_schema:array}> */
    public static function definitions(array $chat): array
    {
        $defs = [
            ['name' => 'card_balance', 'description' => 'فحص كرت إنترنت برقمه أو رقمه المختصر: الباقة، الحالة، الوقت والبيانات المتبقية، تاريخ الانتهاء. استعملها عندما يرسل الزبون رقم كرت أو يسأل عن رصيد كرت.',
             'input_schema' => ['type' => 'object', 'properties' => [
                 'code' => ['type' => 'string', 'description' => 'رقم الكرت (اسم المستخدم) أو الرقم المختصر كما كتبه الزبون'],
                 'password' => ['type' => 'string', 'description' => 'كلمة مرور الكرت، فقط إن كان رقماً مختصراً وطلبتها الأداة'],
             ], 'required' => ['code']]],
            ['name' => 'my_account', 'description' => 'حالة اشتراك الزبون نفسه في الشبكة (الباقة، تاريخ الانتهاء، الاستهلاك، المبلغ المستحق) إن كان حسابه مرتبطاً بهذه المحادثة. بلا مدخلات.', 'input_schema' => self::NONE],
            ['name' => 'price_list', 'description' => 'الأسعار المعتمدة: كروت الإنترنت (السعر، المدة، الصلاحية، البيانات، السرعة) وباقات الاشتراك الشهري. بلا مدخلات.', 'input_schema' => self::NONE],
            ['name' => 'network_status', 'description' => 'الانقطاعات الجارية الآن في الشبكة (المنطقة، السبب، منذ متى)، وهل حساب الزبون ضمن منطقة متأثرة. استعملها عند شكوى انقطاع أو بطء. بلا مدخلات.', 'input_schema' => self::NONE],
            ['name' => 'sale_points', 'description' => 'نقاط بيع الكروت (الموزعون) وعناوينهم ومناطقهم. بلا مدخلات.', 'input_schema' => self::NONE],
            ['name' => 'handoff', 'description' => 'تحويل المحادثة إلى موظف؛ يتوقف المساعد عن الرد فيها حتى يعيدها الموظف. اكتب السبب وملخصاً قصيراً لما يحتاجه الزبون.',
             'input_schema' => ['type' => 'object', 'properties' => [
                 'reason' => ['type' => 'string', 'description' => 'سبب التحويل باختصار'],
                 'summary' => ['type' => 'string', 'description' => 'ملخص طلب الزبون وما تم معه حتى الآن'],
             ], 'required' => ['reason', 'summary']]],
        ];
        if (MadixCloud::enabled()) {
            $shop = ['type' => 'string', 'description' => 'رقم المحل (C-XXXXX)، فقط إن كان لرقم الزبون أكثر من محل وحدّد أيّها'];
            $defs = array_merge($defs, [
                ['name' => 'erp_my_account', 'description' => 'MADIX ERP (نظام الكاشير): محلات الزبون وحالة ترخيص كل محل (الباقة، الانتهاء، الأيام المتبقية، عدد الأجهزة، الميزات). تعتمد رقم واتساب الزبون الموثّق، فلا تعمل في القنوات الأخرى. بلا مدخلات.', 'input_schema' => self::NONE],
                ['name' => 'erp_licenses', 'description' => 'MADIX ERP: تراخيص محل الزبون بالتفصيل لكل جهاز (الباقة، البداية، الانتهاء الفعلي، الحالة).',
                 'input_schema' => ['type' => 'object', 'properties' => ['customer' => $shop]]],
                ['name' => 'erp_devices', 'description' => 'MADIX ERP: أجهزة محل الزبون (رقم الجهاز، الاسم، ويندوز أو أندرويد، الإصدار المثبّت، آخر ظهور ومزامنة، متصل الآن، وهل يوجد تحديث).',
                 'input_schema' => ['type' => 'object', 'properties' => ['customer' => $shop]]],
                ['name' => 'erp_plans', 'description' => 'MADIX ERP: الباقات وأسعارها (شهري، سنوي، مدى الحياة) وميزات كل باقة ومدة التجربة المجانية. بلا مدخلات.', 'input_schema' => self::NONE],
                ['name' => 'erp_releases', 'description' => 'MADIX ERP: آخر إصدار لكل نظام مع رابط التحميل وما الجديد فيه.',
                 'input_schema' => ['type' => 'object', 'properties' => ['platform' => ['type' => 'string', 'enum' => ['windows', 'android', 'mac', 'ios'], 'description' => 'نظام واحد، أو اتركه للكل']]]],
                ['name' => 'erp_service_status', 'description' => 'MADIX ERP: حالة خدمة MADIX Cloud (تعمل، بطء، عطل، صيانة) والإعلانات الحالية. بلا مدخلات.', 'input_schema' => self::NONE],
                ['name' => 'erp_open_ticket', 'description' => 'MADIX ERP: فتح تذكرة دعم فني لمشكلة في نظام الكاشير لم تُحل بالشرح، تصل فريق الدعم في MADIX Cloud مع مقتطف المحادثة. لصاحب المحل على واتساب فقط.',
                 'input_schema' => ['type' => 'object', 'properties' => [
                     'subject' => ['type' => 'string', 'description' => 'موضوع قصير'],
                     'message' => ['type' => 'string', 'description' => 'وصف المشكلة كما شرحها الزبون، مع الجهاز والإصدار إن عُرفا'],
                     'category' => ['type' => 'string', 'enum' => ['problem', 'question', 'billing', 'feature', 'other'], 'description' => 'نوع التذكرة: مشكلة، سؤال، دفع واشتراك، طلب ميزة، أخرى'],
                     'device' => ['type' => 'string', 'description' => 'رقم الجهاز المعني إن عُرف من erp_devices'],
                     'customer' => $shop,
                 ], 'required' => ['subject', 'message']]],
                ['name' => 'erp_ticket_status', 'description' => 'MADIX ERP: حالة تذكرة دعم فُتحت من هذه المحادثة وآخر رد عليها من فريق الدعم.',
                 'input_schema' => ['type' => 'object', 'properties' => [
                     'id' => ['type' => 'string', 'description' => 'رقم التذكرة إن ذكره الزبون؛ اتركه فارغاً لآخر تذكرة'],
                 ]]],
                ['name' => 'erp_renewal_request', 'description' => 'MADIX ERP: تسجيل طلب تجديد ترخيص لجهاز في محل الزبون؛ ينتظر موافقة المدير بعد الدفع، ولا يجدد شيئاً بنفسه. إن كان للمحل أكثر من جهاز فحدّد الجهاز (من erp_devices) بعد سؤال الزبون.',
                 'input_schema' => ['type' => 'object', 'properties' => [
                     'plan' => ['type' => 'string', 'enum' => ['month', 'year', 'life'], 'description' => 'المدة المطلوبة إن ذكرها الزبون'],
                     'device' => ['type' => 'string', 'description' => 'رقم الجهاز المطلوب تجديده'],
                     'note' => ['type' => 'string', 'description' => 'ملاحظة الزبون (طريقة الدفع، وقت التواصل…)'],
                     'customer' => $shop,
                 ]]],
            ]);
        }
        return $defs;
    }

    /** تنفيذ أداة لمحادثة */
    public static function run(string $name, array $input, int $chatId): mixed
    {
        $chat = BotAgent::find($chatId);
        if (!$chat) {
            return ['ok' => false, 'message' => 'المحادثة غير موجودة.'];
        }
        $out = match ($name) {
            'card_balance' => self::cardBalance($chat, (string) ($input['code'] ?? ''), (string) ($input['password'] ?? '')),
            'my_account' => self::myAccount($chat),
            'price_list' => self::priceList(),
            'network_status' => self::networkStatus($chat),
            'sale_points' => self::salePoints(),
            'handoff' => self::handoff($chat, (string) ($input['reason'] ?? ''), (string) ($input['summary'] ?? '')),
            'erp_my_account' => self::erpMyAccount($chat),
            'erp_licenses' => self::erpFor($chat, 'licenses', (string) ($input['customer'] ?? '')),
            'erp_devices' => self::erpFor($chat, 'devices', (string) ($input['customer'] ?? '')),
            'erp_plans' => self::erpPublic('plans'),
            'erp_releases' => self::erpPublic('releases', in_array($input['platform'] ?? '', ['windows', 'android', 'mac', 'ios'], true) ? ['platform' => $input['platform']] : []),
            'erp_service_status' => self::erpPublic('status'),
            'erp_open_ticket' => self::erpTicket($chat, $input),
            'erp_ticket_status' => self::erpTicketStatus($chat, (string) ($input['id'] ?? '')),
            'erp_renewal_request' => self::erpRenewal($chat, $input),
            default => ['ok' => false, 'message' => 'أداة غير معروفة.'],
        };
        $json = (string) json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        return mb_strlen($json) > self::MAX ? mb_substr($json, 0, self::MAX) . '…(مختصر)' : $json;
    }

    // ------------------------------------------------------------------
    // الشبكة
    // ------------------------------------------------------------------

    private static function cardBalance(array $chat, string $code, string $password): array
    {
        $key = 'botcard:' . $chat['id'];
        if (($wait = Throttle::lockedFor($key)) > 0) {
            return ['ok' => false, 'message' => 'محاولات كثيرة لفحص الكروت من هذه المحادثة. أعد المحاولة بعد ' . max(1, (int) ceil($wait / 60)) . ' دقيقة.'];
        }
        $code = PortalService::normalizeCode(trim(latin_digits($code)));
        if ($code === '' || mb_strlen($code) > 64) {
            return ['ok' => false, 'message' => 'اكتب رقم الكرت كما هو مطبوع.'];
        }
        $owner = LoginRegistry::owner($code);
        if ($owner && $owner[0] === 'subscriber') {
            return ['ok' => false, 'message' => 'هذا اسم مستخدم اشتراك وليس كرتاً؛ حالة الاشتراك تُعرف لصاحبه فقط عبر my_account.'];
        }
        if (!$owner || !in_array($owner[0], ['card', 'card_short'], true)) {
            Throttle::fail($key, 8, 900, 1800);
            return ['ok' => false, 'found' => false, 'message' => 'لا يوجد كرت بهذا الرقم. تأكد من الرقم.'];
        }
        $card = DB::row('SELECT * FROM cards WHERE id = ?', [$owner[1]]);
        if (!$card) {
            return ['ok' => false, 'found' => false, 'message' => 'لا يوجد كرت بهذا الرقم.'];
        }
        if ($owner[0] === 'card_short' && (string) $card['short_password'] !== '') {
            $password = trim(latin_digits($password));
            if ($password === '') {
                return ['ok' => false, 'found' => true, 'needs_password' => true, 'message' => 'هذا رقم مختصر ويحتاج كلمة مرور الكرت المطبوعة معه.'];
            }
            if (!hash_equals((string) $card['short_password'], $password) && !hash_equals((string) $card['password'], $password)) {
                Throttle::fail($key, 8, 900, 1800);
                return ['ok' => false, 'found' => true, 'message' => 'كلمة مرور الكرت غير صحيحة.'];
            }
        }
        $cat = DB::row('SELECT * FROM categories WHERE id = ?', [$card['category_id']]);
        if (!$cat) {
            return ['ok' => false, 'message' => 'تعذّر قراءة باقة الكرت.'];
        }
        $info = PortalService::cardInfo($card, $cat);
        $states = ['new' => 'جديد لم يُستخدم', 'sold' => 'جديد لم يُستخدم', 'active' => 'فعّال', 'expired' => 'منتهي الصلاحية', 'depleted' => 'نفد الرصيد'];
        $state = CardRules::lifecycleStatus($card, $cat);
        return [
            'ok' => true, 'found' => true, 'card' => $card['username'], 'package' => $info['category'],
            'state' => $states[$state] ?? $state, 'stopped_by_admin' => (bool) (int) $card['is_disabled'],
            'remaining_time' => $info['remaining_time'] !== null ? fmt_duration((int) $info['remaining_time']) : 'غير محدود',
            'remaining_data' => $info['remaining_data'] !== null ? fmt_bytes((int) $info['remaining_data']) : 'غير محدودة',
            'expires_at' => $info['expires_at'] ? fmt_dt((string) $info['expires_at']) : null,
            'used' => fmt_duration((int) $info['used_time']) . '، ' . fmt_bytes((int) $info['used_data']),
            'speed' => $info['speed'],
        ];
    }

    /** مشتركو هذه المحادثة: المرتبط بها، أو المرتبط بتيليجرام، أو المسجّل برقم واتساب نفسه */
    public static function subscribers(array $chat): array
    {
        $sql = 'SELECT s.*, p.name AS plan, p.data_limit FROM subscribers s JOIN plans p ON p.id = s.plan_id';
        if ($chat['subscriber_id']) {
            return DB::rows($sql . ' WHERE s.id = ?', [$chat['subscriber_id']]);
        }
        if ($chat['channel'] === 'telegram') {
            return DB::rows($sql . ' JOIN telegram_links l ON l.subscriber_id = s.id WHERE l.chat_id = ? ORDER BY s.full_name LIMIT 5', [$chat['external_id']]);
        }
        if ($chat['channel'] === 'whatsapp') {
            $ids = array_slice(array_column(BotAgent::subscribersByPhone((string) $chat['external_id']), 'id'), 0, 5);
            return $ids ? DB::rows($sql . ' WHERE s.id IN (' . DB::in($ids) . ') ORDER BY s.full_name', array_map('intval', $ids)) : [];
        }
        return [];
    }

    private static function myAccount(array $chat): array
    {
        $subs = self::subscribers($chat);
        if (!$subs) {
            $hint = match ($chat['channel']) {
                'whatsapp' => 'رقم واتساب هذا غير مسجّل لأي مشترك؛ يستطيع الموظف ربطه، أو يراسلنا من رقمه المسجّل.',
                'telegram' => 'الحساب غير مربوط؛ يربطه الزبون من زر «ربط حسابي» في البوت باسم المستخدم وكلمة المرور.',
                default => 'لا يمكن التعرف على الزبون من الموقع؛ يراسلنا على واتساب من رقمه المسجّل.',
            };
            return ['ok' => false, 'linked' => false, 'message' => $hint];
        }
        $states = ['active' => 'فعّال', 'expiring' => 'ينتهي قريباً', 'expired' => 'منتهي', 'suspended' => 'موقوف', 'new' => 'بانتظار التفعيل'];
        return ['ok' => true, 'linked' => true, 'accounts' => array_map(static function (array $s) use ($states): array {
            $left = $s['expires_at'] ? (int) strtotime((string) $s['expires_at']) - time() : null;
            return [
                'name' => $s['full_name'], 'username' => $s['username'],
                'state' => $states[SubscriberRules::displayState($s)] ?? '',
                'package' => $s['plan'],
                'expires_at' => $s['expires_at'] ? fmt_dt((string) $s['expires_at']) : null,
                'time_left' => $left !== null && $left > 0 ? fmt_duration($left) : null,
                'usage' => $s['data_limit'] ? fmt_bytes((int) $s['period_bytes']) . ' من ' . fmt_bytes((int) $s['data_limit']) : null,
                'amount_due' => (float) $s['balance'] > 0 ? money($s['balance']) : null,
            ];
        }, $subs)];
    }

    private static function priceList(): array
    {
        $cards = DB::rows('SELECT * FROM categories WHERE is_active = 1 AND show_on_hotspot = 1 ORDER BY sort, price');
        $plans = DB::rows('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort, price');
        return [
            'ok' => true,
            'cards' => array_map(static fn ($c) => [
                'name' => $c['name'], 'price' => money($c['price']),
                'time' => Units::describeSeconds($c['time_limit'] !== null ? (int) $c['time_limit'] : null),
                'validity' => Units::describeSeconds($c['validity'] !== null ? (int) $c['validity'] : null),
                'data' => Units::describeBytes($c['data_limit'] !== null ? (int) $c['data_limit'] : null),
                'speed' => Units::describeRate($c),
            ], $cards),
            'subscriptions' => array_map(static fn ($p) => [
                'name' => $p['name'], 'price' => money($p['price']), 'days' => (int) $p['duration_days'],
                'speed' => Units::describeRate($p),
                'data' => Units::describeBytes($p['data_limit'] !== null ? (int) $p['data_limit'] : null),
            ], $plans),
        ];
    }

    private static function networkStatus(array $chat): array
    {
        $causes = ['unknown' => 'غير معروف بعد', 'power' => 'انقطاع كهرباء', 'fault' => 'عطل', 'damage' => 'أضرار', 'maintenance' => 'صيانة'];
        $rows = DB::rows(
            'SELECT o.*, a.name AS area FROM outages o LEFT JOIN areas a ON a.id = o.area_id
             WHERE o.ended_at IS NULL ORDER BY o.started_at DESC LIMIT 10'
        );
        $mine = self::subscribers($chat);
        $affected = false;
        $list = [];
        foreach ($rows as $o) {
            foreach ($mine as $s) {
                if (($o['router_id'] && (int) $o['router_id'] === (int) $s['router_id']) || ($o['area_id'] && (int) $o['area_id'] === (int) $s['area_id'])) {
                    $affected = true;
                }
            }
            $list[] = [
                'area' => $o['area'] ?: 'غير محددة', 'cause' => $causes[$o['cause']] ?? $o['cause'],
                'since' => fmt_dt((string) $o['started_at']), 'duration' => fmt_duration(time() - (int) strtotime((string) $o['started_at'])),
                'note' => $o['source'] === 'manual' ? $o['title'] : null,
            ];
        }
        return ['ok' => true, 'current_outages' => $list, 'customer_affected' => $mine ? $affected : null];
    }

    private static function salePoints(): array
    {
        $rows = DB::rows('SELECT d.name, d.address, a.name AS area FROM distributors d LEFT JOIN areas a ON a.id = d.area_id WHERE d.is_active = 1 ORDER BY a.name, d.name LIMIT 40');
        return ['ok' => true, 'points' => array_map(static fn ($d) => array_filter(['name' => $d['name'], 'area' => $d['area'], 'address' => $d['address']]), $rows)];
    }

    private static function handoff(array $chat, string $reason, string $summary): array
    {
        BotAgent::handoff($chat, 'حوّلها المساعد: ' . mb_substr(trim($reason), 0, 300), mb_substr(trim($summary), 0, 700));
        return ['ok' => true, 'message' => 'تم تحويل المحادثة لموظف، وسيرد على الزبون هنا.'];
    }

    // ------------------------------------------------------------------
    // MADIX ERP (لوحة MADIX Cloud)
    // ------------------------------------------------------------------

    private static function erpOff(): array
    {
        return ['ok' => false, 'message' => 'الربط مع MADIX Cloud غير مفعّل.'];
    }

    /** نتيجة طلب فاشل للنموذج: الرسالة ورمز الخطأ */
    private static function erpFail(array $r): array
    {
        return array_filter(['ok' => false, 'code' => $r['code'] ?? null, 'message' => $r['message']], static fn ($v) => $v !== null);
    }

    /**
     * محلات صاحب رقم واتساب الموثّق في MADIX Cloud (تُحفظ في المحادثة ساعة).
     * @return array{ok:bool, shops?:list<array{customer:string, shop:string}>, data?:mixed, message?:string}
     */
    private static function erpShops(array $chat, bool $fresh = false): array
    {
        if (!MadixCloud::enabled()) {
            return self::erpOff();
        }
        if ($chat['channel'] !== 'whatsapp') {
            return ['ok' => false, 'verified' => false, 'message' => 'بيانات المحل تُعطى فقط على واتساب من رقم صاحب المحل المسجّل في MADIX ERP.'];
        }
        $meta = BotAgent::meta($chat);
        if (!$fresh && !empty($meta['erp']['shops']) && (int) ($meta['erp']['at'] ?? 0) > time() - 3600) {
            return ['ok' => true, 'shops' => $meta['erp']['shops']];
        }
        $r = MadixCloud::call('lookup', ['phone' => '+' . $chat['external_id']]);
        if (!$r['ok']) {
            return $r['status'] === 404 ? ['ok' => false, 'found' => false, 'message' => 'رقم واتساب هذا غير مسجّل لأي محل في MADIX ERP.'] : self::erpFail($r);
        }
        $shops = MadixCloud::shops($r['data']);
        if (!$shops) {
            return ['ok' => false, 'found' => false, 'message' => 'رقم واتساب هذا غير مسجّل لأي محل في MADIX ERP.'];
        }
        $meta['erp'] = ['shops' => $shops, 'at' => time()];
        BotAgent::setMeta((int) $chat['id'], $meta);
        return ['ok' => true, 'shops' => $shops, 'data' => $r['data']];
    }

    /** المحل المقصود: ما حدّده الزبون من محلاته، أو محله الوحيد */
    private static function erpCustomer(array $chat, string $wanted): array
    {
        $acc = self::erpShops($chat);
        if (!$acc['ok']) {
            return $acc;
        }
        $ids = array_column($acc['shops'], 'customer');
        $wanted = strtoupper(trim($wanted));
        if ($wanted !== '' && in_array($wanted, $ids, true)) {
            return ['ok' => true, 'id' => $wanted];
        }
        if (count($ids) === 1) {
            return ['ok' => true, 'id' => $ids[0]];
        }
        return ['ok' => false, 'choose_shop' => true, 'shops' => $acc['shops'], 'message' => 'لهذا الرقم أكثر من محل؛ اسأل الزبون أي محل يقصد ثم أعد الطلب برقم المحل في customer.'];
    }

    private static function erpMyAccount(array $chat): array
    {
        $acc = self::erpShops($chat, true);
        return $acc['ok'] ? ['ok' => true, 'data' => $acc['data']] : $acc;
    }

    private static function erpFor(array $chat, string $route, string $wanted): array
    {
        $c = self::erpCustomer($chat, $wanted);
        if (!$c['ok']) {
            return $c;
        }
        $r = MadixCloud::call($route, ['customer' => $c['id'], 'limit' => 20]);
        return $r['ok'] ? ['ok' => true, 'customer' => $c['id'], 'data' => $r['data']] : self::erpFail($r);
    }

    private static function erpPublic(string $route, array $query = []): array
    {
        if (!MadixCloud::enabled()) {
            return self::erpOff();
        }
        $r = MadixCloud::call($route, $query);
        return $r['ok'] ? ['ok' => true, 'data' => $r['data']] : self::erpFail($r);
    }

    /** آخر رسائل المحادثة نصاً، لتُرفق بالتذكرة */
    private static function excerpt(int $chatId): string
    {
        $rows = array_reverse(DB::rows("SELECT role, body FROM bot_messages WHERE chat_id = ? AND role IN ('user','bot','staff') ORDER BY id DESC LIMIT 12", [$chatId]));
        $who = ['user' => 'الزبون', 'bot' => 'المساعد', 'staff' => 'الموظف'];
        return mb_substr(implode("\n", array_map(static fn ($r) => $who[$r['role']] . ': ' . $r['body'], $rows)), 0, 8000);
    }

    private static function erpTicket(array $chat, array $in): array
    {
        $c = self::erpCustomer($chat, (string) ($in['customer'] ?? ''));
        if (!$c['ok']) {
            return $c;
        }
        $subject = mb_substr(trim((string) ($in['subject'] ?? '')), 0, 200);
        $message = mb_substr(trim((string) ($in['message'] ?? '')), 0, 5000);
        if ($subject === '' || mb_strlen($message) < 5) {
            return ['ok' => false, 'message' => 'اكتب موضوع التذكرة ووصفاً واضحاً للمشكلة.'];
        }
        if (!Throttle::rate('bot:ticket:' . $chat['id'], 5, 86400)) {
            return ['ok' => false, 'message' => 'فُتحت تذاكر كثيرة من هذه المحادثة اليوم؛ الفريق سيتابعها.'];
        }
        $category = (string) ($in['category'] ?? '');
        $device = trim((string) ($in['device'] ?? ''));
        $r = MadixCloud::call('ticket', [], array_filter([
            'customer' => $c['id'], 'subject' => $subject, 'message' => $message, 'channel' => 'whatsapp',
            'transcript' => self::excerpt((int) $chat['id']),
            'contact_name' => $chat['name'] ?: null, 'contact' => '+' . $chat['external_id'],
            'category' => in_array($category, ['problem', 'question', 'billing', 'feature', 'other'], true) ? $category : null,
            'device' => $device !== '' ? mb_substr($device, 0, 40) : null,
        ], static fn ($v) => $v !== null));
        if (!$r['ok']) {
            return self::erpFail($r);
        }
        $d = is_array($r['data']) ? $r['data'] : [];
        $id = isset($d['id']) && is_scalar($d['id']) ? (string) $d['id'] : '';
        if ($id !== '') {
            $meta = BotAgent::meta(BotAgent::find((int) $chat['id']) ?? $chat);
            $mine = array_values(array_filter($meta['tickets'] ?? [], static fn ($t) => is_array($t) && ($t['id'] ?? '') !== $id));
            $mine[] = ['id' => $id, 'customer' => $c['id']];
            $meta['tickets'] = array_slice($mine, -10);
            BotAgent::setMeta((int) $chat['id'], $meta);
            BotAgent::store($chat, 'note', 'فُتحت تذكرة دعم في MADIX Cloud رقم ' . $id . ' للمحل ' . $c['id'] . ': ' . $subject);
        }
        return ['ok' => true, 'ticket' => $id !== '' ? $id : null, 'data' => $r['data']];
    }

    private static function erpTicketStatus(array $chat, string $id): array
    {
        if (!MadixCloud::enabled()) {
            return self::erpOff();
        }
        $mine = array_values(array_filter(BotAgent::meta($chat)['tickets'] ?? [], 'is_array'));
        if (!$mine) {
            return ['ok' => false, 'message' => 'لم تُفتح أي تذكرة من هذه المحادثة.'];
        }
        // تذاكر هذه المحادثة فقط، وتُطلب دائماً مع رقم المحل فلا تُكشف تذكرة زبون لآخر
        $id = trim($id, " #\t");
        $pick = end($mine);
        foreach ($mine as $t) {
            if ((string) ($t['id'] ?? '') === $id) {
                $pick = $t;
            }
        }
        $r = MadixCloud::call('ticket', ['id' => (string) $pick['id'], 'customer' => (string) ($pick['customer'] ?? '')]);
        return $r['ok'] ? ['ok' => true, 'ticket' => (string) $pick['id'], 'data' => $r['data']] : self::erpFail($r);
    }

    private static function erpRenewal(array $chat, array $in): array
    {
        $c = self::erpCustomer($chat, (string) ($in['customer'] ?? ''));
        if (!$c['ok']) {
            return $c;
        }
        if (!Throttle::rate('bot:renew:' . $chat['id'], 4, 86400)) {
            return ['ok' => false, 'message' => 'طلبات التجديد مسجّلة اليوم، والفريق سيتواصل مع الزبون.'];
        }
        $plan = (string) ($in['plan'] ?? '');
        $device = trim((string) ($in['device'] ?? ''));
        $r = MadixCloud::call('renewal_request', [], array_filter([
            'customer' => $c['id'], 'device' => $device !== '' ? mb_substr($device, 0, 40) : null,
            'plan' => in_array($plan, ['month', 'year', 'life'], true) ? $plan : null,
            'channel' => 'whatsapp', 'note' => mb_substr(trim((string) ($in['note'] ?? '')), 0, 1000) ?: null,
        ], static fn ($v) => $v !== null));
        if (!$r['ok']) {
            $fail = self::erpFail($r);
            if (($r['code'] ?? '') === 'device_required') {
                $fail['next'] = 'اعرض على الزبون أجهزته من erp_devices واسأله أيّها، ثم أعد الطلب مع device.';
            }
            return $fail;
        }
        $d = is_array($r['data']) ? $r['data'] : [];
        if (empty($d['already_pending'])) {
            BotAgent::store($chat, 'note', 'سُجّل طلب تجديد ترخيص MADIX ERP للمحل ' . $c['id'] . ($plan !== '' ? ' (' . $plan . ')' : '') . '.');
        }
        return ['ok' => true, 'message' => !empty($d['already_pending']) ? 'يوجد طلب تجديد سابق بانتظار الموافقة لهذا الجهاز.' : 'سُجّل طلب التجديد، ويؤكده الفريق بعد الدفع.', 'data' => $r['data']];
    }
}
