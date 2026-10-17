<?php
declare(strict_types=1);
// Destructive only to an explicitly named disposable *_test database.
// See README's test instructions. Never run against a live shop database.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (getenv('STORE_TEST_ALLOW_RESET') !== 'yes' || !preg_match('/^[a-zA-Z0-9_]+_test$/D', getenv('DB_NAME') ?: '')) {
    fwrite(STDERR, "Refusing to run: set STORE_TEST_ALLOW_RESET=yes and DB_NAME to a disposable name ending in _test.\n"); exit(1);
}
define('STORE_API', true);
require dirname(__DIR__) . '/bootstrap.php';
$database = store_db(); $base = rtrim(getenv('TEST_BASE_URL') ?: 'http://127.0.0.1:5189', '/');
if (!in_array(parse_url($base, PHP_URL_HOST), ['127.0.0.1', 'localhost', '[::1]'], true)) { fwrite(STDERR, "Integration tests only target a local disposable PHP server.\n"); exit(1); }
$cookieFile = tempnam(sys_get_temp_dir(), 'store-test-cookie-'); chmod($cookieFile, 0600); $csrfToken = ''; $passed = 0;
function check(bool $value, string $message): void { global $passed; if (!$value) throw new RuntimeException($message); $passed++; fwrite(STDOUT, 'PASS ' . $message . "\n"); }
function request(string $method, string $route, mixed $payload = null, array $extra = [], bool $authenticated = false): array {
    global $base, $cookieFile, $csrfToken;
    $curl = curl_init($base . $route); $headers = ['Content-Type: application/json'];
    if ($authenticated && $csrfToken !== '') $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    foreach ($extra as $header) $headers[] = $header;
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 15]);
    if ($payload !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, is_string($payload) ? $payload : json_encode($payload, JSON_THROW_ON_ERROR));
    if ($authenticated) { curl_setopt($curl, CURLOPT_COOKIEFILE, $cookieFile); curl_setopt($curl, CURLOPT_COOKIEJAR, $cookieFile); }
    $raw = curl_exec($curl); if ($raw === false) throw new RuntimeException('HTTP request failed: ' . curl_error($curl));
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); $headerSize = curl_getinfo($curl, CURLINFO_HEADER_SIZE); curl_close($curl);
    $body = substr($raw, $headerSize); return ['status' => $status, 'headers' => substr($raw, 0, $headerSize), 'raw' => $body, 'json' => json_decode($body, true)];
}
function stock(int $id, string $size): int { $response = request('GET', '/api/catalog'); foreach ($response['json']['products'] as $product) if ($product['id'] === $id) return $product['stock'][$size]; throw new RuntimeException('Product missing.'); }
function resetData(PDO $database): void { foreach (['order_notes', 'order_events', 'orders', 'rate_limits'] as $table) $database->exec('DELETE FROM ' . $table); $database->exec('UPDATE inventory SET quantity=0'); }
function concurrentOrders(array $payloads, array $keys): array {
    global $base; $multi = curl_multi_init(); $handles = [];
    foreach ($payloads as $index => $payload) {
        $curl = curl_init($base . '/api/orders'); curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Idempotency-Key: ' . $keys[$index]]]);
        curl_multi_add_handle($multi, $curl); $handles[] = $curl;
    }
    do { $status = curl_multi_exec($multi, $running); if ($running) curl_multi_select($multi, 1); } while ($running && $status === CURLM_OK);
    $results = []; foreach ($handles as $curl) { $results[] = ['status' => curl_getinfo($curl, CURLINFO_HTTP_CODE), 'json' => json_decode(curl_multi_getcontent($curl), true)]; curl_multi_remove_handle($multi, $curl); curl_close($curl); } curl_multi_close($multi); return $results;
}
function withTestServer(array $overrides, callable $callback): void {
    global $base;
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
    if (!$socket) throw new RuntimeException('Cannot reserve a local test port.');
    $address = stream_socket_get_name($socket, false); fclose($socket);
    $oldBase = $base; $base = 'http://' . $address;
    $log = tempnam(sys_get_temp_dir(), 'store-test-server-');
    $environment = array_replace(getenv(), $overrides, ['PHP_CLI_SERVER_WORKERS' => '1']);
    $command = [PHP_BINARY]; if (php_ini_loaded_file()) array_push($command, '-c', php_ini_loaded_file());
    array_push($command, '-S', $address, 'api/dev-router.php');
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes, dirname(__DIR__, 2), $environment);
    if (!is_resource($process)) throw new RuntimeException('Cannot start auxiliary PHP test server.');
    fclose($pipes[0]);
    try {
        $ready = false;
        for ($attempt = 0; $attempt < 30; $attempt++) { $connection = @stream_socket_client('tcp://' . $address, $number, $message, 0.1); if ($connection) { fclose($connection); $ready = true; break; } usleep(100000); }
        if (!$ready) throw new RuntimeException('Auxiliary PHP test server did not start.');
        $callback();
    } finally { proc_terminate($process); proc_close($process); @unlink($log); $base = $oldBase; }
}
try {
    resetData($database);
    $response = request('GET', '/api/health'); check($response['status'] === 200 && !$response['json']['orderingEnabled'], 'zero inventory blocks checkout');
    $response = request('GET', '/api/catalog'); check(count($response['json']['products']) === 12 && stock(2, 'M') === 0, 'catalog is available without fabricated stock');
    check(request('GET', '/api/admin/orders')['status'] === 401, 'customer cannot read admin orders');
    check(request('POST', '/api/admin/login', ['password' => 'incorrect-password'])['status'] === 401, 'invalid administrator password is rejected');
    $response = request('POST', '/api/admin/login', ['password' => getenv('ADMIN_PASSWORD')], [], true);
    check($response['status'] === 200 && strlen($response['json']['csrfToken'] ?? '') === 64, 'administrator login produces a CSRF token');
    $csrfToken = $response['json']['csrfToken'];
    check(stripos($response['headers'], 'HttpOnly') !== false && stripos($response['headers'], 'SameSite=Strict') !== false, 'administrator cookie is HttpOnly and SameSite Strict');
    $inventory = ['items' => [['id' => 2, 'size' => 'M', 'quantity' => 20], ['id' => 1, 'size' => 'L', 'quantity' => 20], ['id' => 12, 'size' => 'XL', 'quantity' => 1]]];
    $savedToken = $csrfToken; $csrfToken = ''; check(request('PATCH', '/api/admin/inventory', $inventory, [], true)['status'] === 403, 'inventory mutation requires CSRF token'); $csrfToken = $savedToken;
    check(request('PATCH', '/api/admin/inventory', $inventory, ['Origin: https://evil.example'], true)['status'] === 403, 'cross-origin inventory mutation is rejected');
    check(request('PATCH', '/api/admin/inventory', $inventory, [], true)['status'] === 200 && stock(2, 'M') === 20, 'authenticated stock updates persist in MySQL');
    check(request('GET', '/api/health')['json']['orderingEnabled'], 'explicit live configuration and inventory enable ordering');
    check(request('PATCH', '/api/admin/inventory', ['items' => [['id' => 2, 'size' => 'M', 'quantity' => -1]]], [], true)['status'] === 422, 'negative inventory rejected');
    $quote = request('POST', '/api/quote', ['items' => [['id' => 2, 'size' => 'M', 'quantity' => 1, 'price' => 1]], 'deliveryZone' => 'outside']);
    check($quote['status'] === 200 && $quote['json']['subtotal'] === 690 && $quote['json']['shipping'] === 130, 'server ignores tampered prices and prices outside-Dhaka delivery');
    $quote = request('POST', '/api/quote', ['items' => [['id' => 1, 'size' => 'L', 'quantity' => 2]], 'deliveryZone' => 'dhaka']);
    check($quote['json']['subtotal'] === 2980 && $quote['json']['shipping'] === 0, 'free-delivery threshold uses authoritative subtotal');
    check(request('POST', '/api/quote', ['items' => [['id' => 2, 'size' => 'M', 'quantity' => 0.5]], 'deliveryZone' => 'dhaka'])['status'] === 422, 'fractional quantities rejected');
    $person = ['name' => '=SUM(1,2)', 'phone' => '01712345678', 'email' => 'customer@example.test', 'address' => 'House 10, Road 4, Test Area', 'city' => 'Dhaka', 'deliveryZone' => 'dhaka'];
    $payload = ['items' => [['id' => 2, 'size' => 'M', 'quantity' => 2, 'price' => 1]], 'customer' => $person, 'total' => 1];
    $invalid = $payload; $invalid['customer']['phone'] = '01112345678'; check(request('POST', '/api/orders', $invalid, ['Idempotency-Key: invalid-phone-key-1234'])['status'] === 422, 'invalid Bangladesh phone rejected');
    check(request('POST', '/api/orders', $payload)['status'] === 422, 'order creation requires idempotency key');
    check(request('POST', '/api/orders', $payload, ['Idempotency-Key: csrf-order-key-1234', 'Origin: https://evil.example'])['status'] === 403, 'cross-origin checkout rejected');
    $response = request('POST', '/api/orders', $payload, ['Idempotency-Key: original-order-key-1234']);
    check($response['status'] === 201 && $response['json']['order']['total'] === 1460 && stock(2, 'M') === 18, 'order persists authoritative totals and atomically reserves stock');
    $reference = $response['json']['order']['reference'];
    $stale = request('PATCH', '/api/admin/inventory', ['items' => [['id' => 1, 'size' => 'L', 'quantity' => 25, 'expectedQuantity' => 20], ['id' => 2, 'size' => 'M', 'quantity' => 21, 'expectedQuantity' => 20]]], [], true);
    check($stale['status'] === 409 && $stale['json']['code'] === 'INVENTORY_CHANGED' && stock(2, 'M') === 18 && stock(1, 'L') === 20, 'stale administrator stock edit cannot overwrite reservations and rolls back entire batch');
    check(request('PATCH', '/api/admin/inventory', ['items' => [['id' => 2, 'size' => 'M', 'quantity' => 18, 'expectedQuantity' => 18]]], [], true)['status'] === 200, 'stock edit with current inventory version succeeds');
    $response = request('POST', '/api/orders', $payload, ['Idempotency-Key: original-order-key-1234']);
    check($response['status'] === 200 && $response['json']['order']['reference'] === $reference && stock(2, 'M') === 18, 'retry returns same order without a second stock reservation');
    $changed = $payload; $changed['items'][0]['quantity'] = 1;
    check(request('POST', '/api/orders', $changed, ['Idempotency-Key: original-order-key-1234'])['status'] === 409, 'reusing an idempotency key with changed input is rejected');
    check(request('POST', '/api/order-status', ['reference' => $reference, 'phone' => '01812345678'])['status'] === 404, 'order tracking needs matching phone number');
    $response = request('POST', '/api/order-status', ['reference' => $reference, 'phone' => '01712345678']);
    check($response['status'] === 200 && !isset($response['json']['customer'], $response['json']['notes']) && !str_contains($response['raw'], 'customer@example.test'), 'public tracking excludes customer details and internal notes');
    check(request('PATCH', '/api/admin/orders/' . $reference, ['status' => 'delivered'], [], true)['status'] === 409, 'invalid order status transitions rejected');
    $response = request('PATCH', '/api/admin/orders/' . $reference, ['status' => 'confirmed', 'note' => 'Private courier instruction'], [], true);
    check($response['status'] === 200 && $response['json']['order']['notes'][0]['text'] === 'Private courier instruction', 'order status and private notes persist');
    $response = request('POST', '/api/orders', $payload, ['Idempotency-Key: original-order-key-1234']);
    check(!str_contains($response['raw'], 'Private courier instruction'), 'checkout retries do not disclose internal administrator notes');
    $csv = request('GET', '/api/admin/orders.csv', null, [], true);
    check($csv['status'] === 200 && str_contains($csv['raw'], "'=SUM(1,2)"), 'CSV export neutralizes spreadsheet formulas');
    check(request('PATCH', '/api/admin/orders/' . $reference, ['status' => 'cancelled'], [], true)['status'] === 200 && stock(2, 'M') === 20, 'cancellation atomically restores reserved inventory');
    request('PATCH', '/api/admin/orders/' . $reference, ['status' => 'cancelled', 'note' => 'A second note'], [], true);
    check(stock(2, 'M') === 20, 'repeated cancellation does not restore inventory twice');
    $database->exec("DELETE FROM rate_limits WHERE bucket_key IS NOT NULL");
    $racePayload = ['items' => [['id' => 12, 'size' => 'XL', 'quantity' => 1]], 'customer' => $person];
    $race = concurrentOrders([$racePayload, $racePayload], ['race-order-key-one-1234', 'race-order-key-two-1234']); $statuses = array_column($race, 'status'); sort($statuses);
    check($statuses === [201, 409] && stock(12, 'XL') === 0, 'concurrent buyers cannot oversell the final unit');
    request('PATCH', '/api/admin/inventory', ['items' => [['id' => 12, 'size' => 'XL', 'quantity' => 1]]], [], true);
    $race = concurrentOrders([$racePayload, $racePayload], ['race-same-idempotency-1234', 'race-same-idempotency-1234']); $statuses = array_column($race, 'status'); sort($statuses);
    check($statuses === [200, 201] && $race[0]['json']['order']['reference'] === $race[1]['json']['order']['reference'] && stock(12, 'XL') === 0, 'simultaneous idempotent retries create exactly one order');
    foreach (['/.git/config', '/api/config.local.php', '/api/config.example.php', '/api/schema.sql', '/api/bootstrap.php', '/api/install.php', '/api/tests/integration.php', '/api/dev-router.php', '/.env', '/README.md'] as $sensitive) check(request('GET', $sensitive)['status'] === 404, 'private file blocked: ' . $sensitive);
    check(request('POST', '/api/quote', '{broken-json')['status'] === 400, 'malformed JSON rejected without stack trace');
    check(request('POST', '/api/quote', str_repeat('x', 65537))['status'] === 413, 'oversized JSON body rejected');
    $database->exec('DELETE FROM rate_limits');
    for ($attempt = 0; $attempt < 9; $attempt++) $response = request('POST', '/api/admin/login', ['password' => 'bad-password']);
    check($response['status'] === 429, 'administrator password attempts are rate limited persistently');
    check(request('POST', '/api/admin/logout', null, [], true)['status'] === 200 && request('GET', '/api/admin/orders', null, [], true)['status'] === 401, 'logout invalidates administrator session');
    withTestServer(['PUBLIC_ORIGIN' => 'https://secure-store.example', 'TRUST_PROXY' => 'false'], function (): void {
        check(request('POST', '/api/admin/login', ['password' => getenv('ADMIN_PASSWORD')], ['Origin: https://secure-store.example'])['status'] === 403, 'HTTPS production configuration rejects plain HTTP login');
        check(request('GET', '/api/health', null, ['X-Forwarded-Proto: https'])['status'] === 403, 'untrusted forwarded protocol cannot bypass HTTPS requirement');
    });
    $database->exec('DELETE FROM rate_limits');
    withTestServer(['PUBLIC_ORIGIN' => 'https://secure-store.example', 'TRUST_PROXY' => 'true'], function (): void {
        $response = request('POST', '/api/admin/login', ['password' => getenv('ADMIN_PASSWORD')], ['Origin: https://secure-store.example', 'X-Forwarded-Proto: https']);
        check($response['status'] === 200 && preg_match('/Set-Cookie:.*;\s*secure/i', $response['headers']) === 1, 'trusted HTTPS proxy produces a Secure administrator cookie (HTTP ' . $response['status'] . ')');
    });
    withTestServer(['DB_NAME' => '', 'DB_USER' => '', 'ADMIN_PASSWORD' => '', 'ADMIN_PASSWORD_HASH' => '', 'STORE_LIVE' => 'false', 'PUBLIC_ORIGIN' => ''], function (): void {
        $response = request('GET', '/api/catalog');
        check($response['status'] === 200 && !$response['json']['orderingEnabled'] && !$response['json']['readiness']['databaseConfigured'], 'unconfigured hosting supports browsing while disabling real checkout');
    });
    fwrite(STDOUT, "\nAll " . $passed . " PHP/MySQL integration checks passed.\n");
} catch (Throwable $error) { fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n"); exit(1); }
finally { @unlink($cookieFile); }
