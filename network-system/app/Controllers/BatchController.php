<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Audit;
use App\Core\DB;
use App\Core\Paginator;
use App\Core\Request;
use App\Core\Response;
use App\Services\CardService;

final class BatchController extends Controller
{
    public function index(Request $request): Response
    {
        $where = '1 = 1';
        $params = [];
        if ($request->int('category') > 0) {
            $where .= ' AND b.category_id = ?';
            $params[] = $request->int('category');
        }
        if (in_array($request->str('source'), ['generated', 'imported', 'router'], true)) {
            $where .= ' AND b.source = ?';
            $params[] = $request->str('source');
        }
        $total = (int) DB::value("SELECT COUNT(*) FROM batches b WHERE $where", $params);
        $pager = Paginator::fromRequest($request, $total, 50);
        $rows = DB::rows(
            "SELECT b.*, c.name AS category_name, c.color, e.name AS employee_name,
                    (SELECT COUNT(*) FROM cards k WHERE k.batch_id = b.id) AS cards,
                    (SELECT COUNT(*) FROM cards k WHERE k.batch_id = b.id AND k.status = 'new' AND k.is_disabled = 0) AS available,
                    (SELECT COUNT(*) FROM cards k WHERE k.batch_id = b.id AND k.first_login_at IS NOT NULL) AS used,
                    (SELECT COUNT(*) FROM cards k WHERE k.batch_id = b.id AND k.printed_at IS NOT NULL) AS printed,
                    (SELECT COUNT(*) FROM cards k WHERE k.batch_id = b.id AND k.short_code IS NOT NULL) AS short_codes
             FROM batches b JOIN categories c ON c.id = b.category_id LEFT JOIN employees e ON e.id = b.created_by
             WHERE $where ORDER BY b.id DESC" . $pager->limitSql(),
            $params
        );
        $categories = DB::pairs('SELECT id, name FROM categories ORDER BY sort, name');
        return view('batches/index', compact('rows', 'pager', 'categories'));
    }

    public function show(Request $request, int $id): Response
    {
        $batch = DB::row(
            'SELECT b.*, c.name AS category_name, c.color, c.price, e.name AS employee_name
             FROM batches b JOIN categories c ON c.id = b.category_id LEFT JOIN employees e ON e.id = b.created_by WHERE b.id = ?',
            [$id]
        );
        $this->notFoundUnless($batch);
        $stats = DB::row(
            "SELECT COUNT(*) AS total, SUM(status = 'new' AND is_disabled = 0) AS available, SUM(status = 'sold') AS sold,
                    SUM(status = 'active') AS active, SUM(status IN ('expired','depleted')) AS ended, SUM(is_disabled = 1) AS disabled,
                    SUM(printed_at IS NOT NULL) AS printed, SUM(short_code IS NOT NULL) AS short_codes,
                    MIN(id) AS first_id, MAX(id) AS last_id, SUM(used_bytes_in + used_bytes_out) AS bytes, SUM(used_seconds) AS seconds
             FROM cards WHERE batch_id = ?",
            [$id]
        );
        $sample = DB::rows('SELECT id, username, password, short_code, short_password, status, is_disabled FROM cards WHERE batch_id = ? ORDER BY id LIMIT 10', [$id]);
        $templates = DB::pairs('SELECT id, name FROM print_templates ORDER BY is_default DESC, name');
        $routers = DB::pairs('SELECT id, name FROM routers WHERE is_active = 1 ORDER BY name');
        return view('batches/show', compact('batch', 'stats', 'sample', 'templates', 'routers'));
    }

    public function update(Request $request, int $id): Response
    {
        $batch = DB::row('SELECT * FROM batches WHERE id = ?', [$id]);
        $this->notFoundUnless($batch);
        $d = $this->validate($request, ['name' => 'required|max:120', 'notes' => 'nullable|max:255'], ['name' => 'اسم الدفعة']);
        DB::update('batches', ['name' => $d['name'], 'notes' => $d['notes']], 'id = ?', [$id]);
        return $this->ok('تم حفظ الدفعة.', '/batches/' . $id);
    }

    public function destroy(Request $request, int $id): Response
    {
        $batch = DB::row('SELECT * FROM batches WHERE id = ?', [$id]);
        $this->notFoundUnless($batch);
        $used = (int) DB::value('SELECT COUNT(*) FROM cards WHERE batch_id = ? AND (first_login_at IS NOT NULL OR sale_id IS NOT NULL)', [$id]);
        if ($used > 0 && !$request->bool('force')) {
            return $this->backWithErrors($request, ['id' => 'تحتوي الدفعة على ' . $used . ' كرت مستخدم أو مباع. أكّد الحذف القسري لحذفها.'], '/batches/' . $id);
        }
        $ids = array_map('intval', DB::column('SELECT id FROM cards WHERE batch_id = ?', [$id]));
        $result = $ids ? CardService::delete($ids) : ['job' => null];
        DB::delete('batches', 'id = ?', [$id]);
        Audit::log('batch.delete', 'حذف الدفعة ' . $batch['name'] . ' (' . count($ids) . ' كرت)', 'batch', $id);
        if (!empty($result['job'])) {
            flash('success', 'تم حذف الدفعة، ويجري حذف كروتها من أجهزة MikroTik.');
            return redirect('/jobs/' . $result['job']);
        }
        return $this->ok('تم حذف الدفعة.', '/batches');
    }
}
