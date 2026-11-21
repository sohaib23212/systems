<?php
/*
 * madix speed [HOURS]: how long the server takes to build each page, from the Apache timing log
 * (/var/log/apache2/madix-timing.log, written for every page but not for /assets files).
 * Each line: unix-time status total-µs first-byte-µs method uri
 *   first byte = the time the server spent building the page (PHP and the database)
 *   total      = until the whole page was handed to the visitor's connection (includes slow networks)
 */
declare(strict_types=1);

$hours = max(1, min(24 * 30, (int) ($argv[1] ?? 24)));
$since = time() - $hours * 3600;
$files = glob('/var/log/apache2/madix-timing.log*') ?: [];
if (!$files) {
    echo "No timing log yet. It starts after this update; open some pages, then run: madix speed\n";
    exit(0);
}

/** link without numbers and keys, so /net/subscribers/12 and /net/subscribers/13 count as one page */
function page_of(string $uri): string
{
    $path = (string) parse_url($uri, PHP_URL_PATH);
    $path = (string) preg_replace('#/[0-9a-f]{24,}(?=/|$|\.)#i', '/{key}', $path);
    $path = (string) preg_replace('#/\d+(?=/|$)#', '/{id}', $path);
    return $path === '' ? '/' : $path;
}

function pct(array $sorted, float $p): float
{
    if (!$sorted) {
        return 0.0;
    }
    return $sorted[(int) min(count($sorted) - 1, floor($p * (count($sorted) - 1) + 0.5))];
}

$pages = [];
$all = [];
$slow = [];
$errors = 0;
$total = 0;
foreach ($files as $file) {
    $h = str_ends_with($file, '.gz') ? @gzopen($file, 'r') : @fopen($file, 'r');
    if (!$h) {
        continue;
    }
    while (($line = str_ends_with($file, '.gz') ? gzgets($h) : fgets($h)) !== false) {
        $p = explode(' ', rtrim($line), 6);
        if (count($p) < 6 || (int) $p[0] < $since) {
            continue;
        }
        [$ts, $status, $us, $fb, $method, $uri] = $p;
        $build = ((int) $fb > 0 ? (int) $fb : (int) $us) / 1000;
        $sent = (int) $us / 1000;
        $page = $method . ' ' . page_of($uri);
        $pages[$page]['b'][] = $build;
        $pages[$page]['s'][] = $sent;
        $all[] = $build;
        $total++;
        if ((int) $status >= 500) {
            $errors++;
        }
        $slow[] = [$build, (int) $ts, (int) $status, $method . ' ' . (string) parse_url($uri, PHP_URL_PATH)];
        if (count($slow) > 200) {
            usort($slow, static fn ($a, $b) => $b[0] <=> $a[0]);
            $slow = array_slice($slow, 0, 10);
        }
    }
    str_ends_with($file, '.gz') ? gzclose($h) : fclose($h);
}
if (!$total) {
    echo "No pages were opened in the last $hours hours.\n";
    exit(0);
}
sort($all);
usort($slow, static fn ($a, $b) => $b[0] <=> $a[0]);

$B = "\033[1m";
$N = "\033[0m";
$G = "\033[32m";
$Y = "\033[33m";
$R = "\033[31m";
$color = static fn (float $ms) => $ms < 300 ? $G : ($ms < 1000 ? $Y : $R);

printf("%sMADIX NEXUS speed%s  last %d hours, %d page requests\n", $B, $N, $hours, $total);
printf("Server time to build a page: half under %s%.0f ms%s, 95%% under %s%.0f ms%s, slowest %s%.0f ms%s\n",
    $color(pct($all, 0.5)), pct($all, 0.5), $N, $color(pct($all, 0.95)), pct($all, 0.95), $N, $color(end($all)), end($all), $N);
if ($errors) {
    printf("%sServer errors (5xx): %d%s  see: madix logs\n", $R, $errors, $N);
}

$rows = [];
foreach ($pages as $page => $v) {
    sort($v['b']);
    sort($v['s']);
    $rows[] = [$page, count($v['b']), pct($v['b'], 0.5), pct($v['b'], 0.95), end($v['b']), pct($v['s'], 0.95)];
}
usort($rows, static fn ($a, $b) => $b[3] <=> $a[3]);
echo "\n{$B}Slowest pages{$N} (server build time in ms; 'sent' includes sending to the visitor)\n";
printf("  %7s %7s %7s %9s %6s  %s\n", 'median', '95%', 'max', 'sent 95%', 'count', 'page');
foreach (array_slice($rows, 0, 15) as [$page, $n, $med, $p95, $max, $s95]) {
    printf("  %s%7.0f %7.0f %7.0f%s %9.0f %6d  %s\n", $color($p95), $med, $p95, $max, $N, $s95, $n, $page);
}

echo "\n{$B}Slowest single requests{$N}\n";
foreach (array_slice($slow, 0, 8) as [$ms, $ts, $status, $page]) {
    printf("  %s%7.0f ms%s  %s  %d  %s\n", $color($ms), $ms, $N, date('m-d H:i:s', $ts), $status, $page);
}

$p95 = pct($all, 0.95);
echo "\n";
if ($p95 < 300) {
    echo "{$G}The server builds pages fast.{$N} If pages still feel slow, the time goes to the network or the phone.\n";
} elseif ($p95 < 1000) {
    echo "{$Y}Some pages take the server a noticeable time.{$N} The pages at the top of the list are the ones to look at.\n";
} else {
    echo "{$R}Some pages are slow on the server.{$N} Check memory and the pages at the top: madix status, madix doctor.\n";
}
