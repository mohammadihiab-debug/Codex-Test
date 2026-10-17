<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header_remove('X-Powered-By');
// Local testing only. Apache production uses the repository's .htaccess instead.
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$root = realpath(dirname(__DIR__)); $raw = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$pathname = rawurldecode($raw); $relative = $pathname === '/' ? 'index.html' : ltrim($pathname, '/');
if (str_starts_with($pathname, '/api/') && !preg_match('~\.(?:php|sql|ini|log|env)$~i', $pathname) && !str_starts_with($pathname, '/api/tests')) { require __DIR__ . '/index.php'; return; }
$pages = ['index.html', 'shop.html', 'product.html', 'cart.html', 'checkout.html', 'wishlist.html', 'search.html', 'contact.html', 'about.html', 'shipping.html', 'returns.html', 'privacy.html', 'terms.html', 'faq.html', 'order-status.html', 'order-confirmation.html', 'admin.html', '404.html'];
$allowed = in_array($relative, $pages, true) || preg_match('~^[a-zA-Z0-9_-]+\.(?:js|css)$~D', $relative) || in_array($relative, ['favicon.svg', 'robots.txt', 'sitemap.xml', 'catalog-data.json'], true) || preg_match('~^(?:images|fonts)/[a-zA-Z0-9_./-]+\.(?:svg|png|jpe?g|webp|avif|ico|woff2?|ttf|otf|txt)$~Di', $relative);
$filename = $root . '/' . $relative;
if (!$allowed || str_contains($pathname, '\\') || preg_match('~(?:^|/)\.~', $relative) || !is_file($filename) || realpath($filename) !== $filename) {
    http_response_code(404); header('X-Content-Type-Options: nosniff');
    if (is_file($root . '/404.html')) { header('Content-Type: text/html; charset=utf-8'); readfile($root . '/404.html'); } else { header('Content-Type: text/plain; charset=utf-8'); echo 'File not found.'; }
    return;
}
header('X-Content-Type-Options: nosniff'); header('X-Frame-Options: DENY'); header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
$mime = ['html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'avif' => 'image/avif', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf', 'otf' => 'font/otf', 'txt' => 'text/plain; charset=utf-8', 'xml' => 'application/xml; charset=utf-8', 'ico' => 'image/x-icon'];
header('Content-Type: ' . ($mime[strtolower(pathinfo($relative, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
header('Cache-Control: ' . (preg_match('/\.(?:html|js|css|json)$/i', $relative) ? 'no-cache' : 'public, max-age=3600'));
header('Content-Length: ' . filesize($filename)); if ($_SERVER['REQUEST_METHOD'] === 'HEAD') return;
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); return; }
readfile($filename);
