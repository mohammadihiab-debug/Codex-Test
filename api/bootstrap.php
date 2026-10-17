<?php
declare(strict_types=1);
if (!defined('STORE_API')) { http_response_code(404); exit; }

final class StoreError extends RuntimeException {
    public int $httpStatus;
    public string $errorCode;
    public mixed $details;
    public function __construct(int $status, string $code, string $message, mixed $details = null) {
        parent::__construct($message); $this->httpStatus = $status; $this->errorCode = $code; $this->details = $details;
    }
}
function store_fail(int $status, string $code, string $message, mixed $details = null): never { throw new StoreError($status, $code, $message, $details); }

function store_config(): array {
    static $config;
    if ($config !== null) return $config;
    $local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
    if (!is_array($local)) throw new RuntimeException('Invalid local configuration.');
    $defaults = [
        'db_host' => 'localhost', 'db_port' => 3306, 'db_name' => '', 'db_user' => '', 'db_password' => '',
        'admin_password_hash' => '', 'admin_password' => '', 'public_origin' => '', 'trust_proxy' => false,
        'store_live' => false, 'catalog_confirmed' => true, 'shipping_dhaka' => 80, 'shipping_outside' => 130, 'free_shipping_threshold' => 2500,
    ];
    $envNames = ['db_host' => 'DB_HOST', 'db_port' => 'DB_PORT', 'db_name' => 'DB_NAME', 'db_user' => 'DB_USER', 'db_password' => 'DB_PASSWORD', 'admin_password_hash' => 'ADMIN_PASSWORD_HASH', 'admin_password' => 'ADMIN_PASSWORD', 'public_origin' => 'PUBLIC_ORIGIN', 'trust_proxy' => 'TRUST_PROXY', 'store_live' => 'STORE_LIVE', 'catalog_confirmed' => 'SAMPLE_CATALOG_CONFIRMED', 'shipping_dhaka' => 'SHIPPING_DHAKA', 'shipping_outside' => 'SHIPPING_OUTSIDE', 'free_shipping_threshold' => 'FREE_SHIPPING_THRESHOLD'];
    $config = array_replace($defaults, $local);
    foreach ($envNames as $key => $name) if (getenv($name) !== false) $config[$key] = getenv($name);
    foreach (['store_live', 'catalog_confirmed', 'trust_proxy'] as $key) $config[$key] = $config[$key] === true || $config[$key] === 'true' || $config[$key] === '1';
    foreach (['db_port', 'shipping_dhaka', 'shipping_outside', 'free_shipping_threshold'] as $key) {
        if (filter_var($config[$key], FILTER_VALIDATE_INT) === false || (int)$config[$key] < 0 || (int)$config[$key] > 1000000) throw new RuntimeException('Invalid numeric store setting.');
        $config[$key] = (int)$config[$key];
    }
    if ($config['public_origin'] !== '' && !preg_match('~^https?://[a-z0-9.-]+(?::[0-9]+)?$~iD', $config['public_origin'])) throw new RuntimeException('PUBLIC_ORIGIN must be an exact HTTP or HTTPS origin.');
    return $config;
}
function store_db(bool $requireSchema = true): PDO {
    static $database;
    if ($database === null) {
        $config = store_config();
        if ($config['db_name'] === '' || $config['db_user'] === '') store_fail(503, 'DATABASE_NOT_CONFIGURED', 'The store database has not been configured yet.');
        try {
            $database = new PDO('mysql:host=' . $config['db_host'] . ';port=' . $config['db_port'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4', $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 5]);
            $database->exec("SET time_zone = '+00:00'");
            $database->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
        } catch (PDOException $error) { $database = null; store_fail(503, 'DATABASE_UNAVAILABLE', 'The store database is currently unavailable. Please try again later.'); }
    }
    if ($requireSchema) {
        try { $version = $database->query("SELECT setting_value FROM store_meta WHERE setting_key='schema_version'")->fetchColumn(); }
        catch (PDOException $error) { store_fail(503, 'DATABASE_SETUP_REQUIRED', 'The store database tables must be installed before checkout can start.'); }
        if ($version !== '1') store_fail(503, 'DATABASE_SETUP_REQUIRED', 'The store database schema needs setup.');
    }
    return $database;
}
function store_catalog(): array {
    static $products;
    if ($products !== null) return $products;
    $products = json_decode(file_get_contents(dirname(__DIR__) . '/catalog-data.json'), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($products) || !array_is_list($products) || count($products) === 0) throw new RuntimeException('Invalid product catalog.');
    $seen = [];
    foreach ($products as $product) {
        if (!is_array($product) || !isset($product['id'], $product['name'], $product['price'], $product['sizes']) || !is_int($product['id']) || isset($seen[$product['id']]) || !is_int($product['price']) || $product['price'] < 1 || $product['price'] > 10000000 || !is_string($product['name']) || !is_array($product['sizes']) || !$product['sizes']) throw new RuntimeException('Invalid product catalog entry.');
        foreach ($product['sizes'] as $size) if (!is_string($size) || !preg_match('/^[a-zA-Z0-9_-]{1,20}$/D', $size)) throw new RuntimeException('Invalid catalog size.');
        $seen[$product['id']] = true;
    }
    return $products;
}
function store_product(int $id): ?array { foreach (store_catalog() as $product) if ($product['id'] === $id) return $product; return null; }
function store_shipping(): array { $config = store_config(); return ['insideDhaka' => $config['shipping_dhaka'], 'outsideDhaka' => $config['shipping_outside'], 'freeThreshold' => $config['free_shipping_threshold']]; }
function store_admin_configured(): bool {
    $config = store_config(); $hash = $config['admin_password_hash'];
    return (is_string($hash) && (password_get_info($hash)['algo'] ?? null) !== null) || (is_string($config['admin_password']) && strlen($config['admin_password']) >= 16 && strlen($config['admin_password']) <= 1024);
}
function store_inventory(?PDO $database): array {
    $stock = [];
    if ($database) foreach ($database->query('SELECT product_id,size,quantity FROM inventory')->fetchAll() as $row) $stock[$row['product_id'] . ':' . $row['size']] = (int)$row['quantity'];
    return array_map(function (array $product) use ($stock): array { $product['stock'] = []; foreach ($product['sizes'] as $size) $product['stock'][$size] = $stock[$product['id'] . ':' . $size] ?? 0; return $product; }, store_catalog());
}
function store_readiness(?PDO $database): array {
    $config = store_config(); $inventoryAvailable = false;
    foreach (store_inventory($database) as $product) foreach ($product['stock'] as $quantity) if ($quantity > 0) $inventoryAvailable = true;
    $status = ['live' => $config['store_live'], 'catalogConfirmed' => $config['catalog_confirmed'], 'adminConfigured' => store_admin_configured(), 'databaseConfigured' => $database !== null, 'inventoryAvailable' => $inventoryAvailable];
    $messages = ['live' => 'Store ordering has not been enabled by the owner.', 'catalogConfirmed' => 'The sample catalog must be confirmed or replaced before selling.', 'adminConfigured' => 'A secure administrator password must be configured.', 'databaseConfigured' => 'The MySQL database must be configured and installed.', 'inventoryAvailable' => 'Real inventory quantities must be added before selling.'];
    $issues = []; foreach ($status as $key => $value) if (!$value) $issues[] = $messages[$key];
    return ['orderingEnabled' => !in_array(false, $status, true), 'readiness' => $status, 'issues' => $issues, 'shipping' => store_shipping(), 'currency' => 'BDT', 'paymentMethods' => ['cod']];
}
function store_json(int $status, mixed $value): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); exit;
}
function store_body(): array {
    if (!preg_match('~^application/json(?:\s*;|$)~i', $_SERVER['CONTENT_TYPE'] ?? '')) store_fail(415, 'JSON_REQUIRED', 'Send a JSON request body.');
    if (isset($_SERVER['HTTP_CONTENT_ENCODING']) && $_SERVER['HTTP_CONTENT_ENCODING'] !== 'identity') store_fail(415, 'ENCODING_UNSUPPORTED', 'Compressed request bodies are not supported.');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) store_fail(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($raw) > 65536) store_fail(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    try { $input = json_decode($raw, false, 64, JSON_THROW_ON_ERROR); } catch (JsonException $error) { store_fail(400, 'INVALID_JSON', 'Request body is not valid JSON.'); }
    if (!is_object($input)) store_fail(400, 'INVALID_BODY', 'Request body must be a JSON object.');
    return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
}
function store_secure(): bool { $config = store_config(); return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($config['trust_proxy'] && trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0]) === 'https'); }
function store_check_origin(): void {
    if (str_starts_with(store_config()['public_origin'], 'https://') && !store_secure()) store_fail(403, 'HTTPS_REQUIRED', 'Use the secure HTTPS store website to continue.');
    if (in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD', 'OPTIONS'], true)) return;
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') store_fail(403, 'ORIGIN_REJECTED', 'Cross-site requests are not allowed.');
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        $expected = store_config()['public_origin'] ?: (store_secure() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
        if (!hash_equals($expected, $_SERVER['HTTP_ORIGIN'])) store_fail(403, 'ORIGIN_REJECTED', 'Use this store’s own website to submit requests.');
    }
}
function store_rate_limit(PDO $database, string $type, int $maximum, int $seconds): void {
    $config = store_config();
    $ip = $config['trust_proxy'] ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown'))[0]) : ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $key = hash('sha256', $type . ':' . $ip); $expiry = gmdate('Y-m-d H:i:s', time() + $seconds);
    $statement = $database->prepare('INSERT INTO rate_limits(bucket_key,attempts,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at<=UTC_TIMESTAMP(),1,attempts+1),expires_at=IF(expires_at<=UTC_TIMESTAMP(),VALUES(expires_at),expires_at)');
    $statement->execute([$key, $expiry]);
    $statement = $database->prepare('SELECT attempts FROM rate_limits WHERE bucket_key=?'); $statement->execute([$key]);
    if ((int)$statement->fetchColumn() > $maximum) { header('Retry-After: ' . $seconds); store_fail(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'); }
    if (random_int(1, 100) === 1) $database->exec('DELETE FROM rate_limits WHERE expires_at<UTC_TIMESTAMP()');
}
function store_session(bool $required = true, bool $csrf = true): ?array {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        ini_set('session.use_strict_mode', '1'); ini_set('session.use_only_cookies', '1'); ini_set('session.gc_maxlifetime', '28800');
        session_name('RKADMIN'); session_set_cookie_params(['lifetime' => 28800, 'path' => '/api/admin', 'secure' => store_secure(), 'httponly' => true, 'samesite' => 'Strict']);
        session_start();
    }
    $valid = isset($_SESSION['authenticated'], $_SESSION['expires'], $_SESSION['csrfToken']) && $_SESSION['authenticated'] === true && $_SESSION['expires'] > time();
    if (!$valid) {
        $_SESSION = [];
        if ($required) { session_write_close(); store_fail(401, 'AUTH_REQUIRED', 'Sign in to the administrator dashboard.'); }
        return null;
    }
    if ($csrf && !in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true) && !hash_equals($_SESSION['csrfToken'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) { session_write_close(); store_fail(403, 'CSRF_REJECTED', 'Your session has changed. Sign in again and retry.'); }
    return ['authenticated' => true, 'csrfToken' => $_SESSION['csrfToken']];
}
function store_text(mixed $value, string $name, int $minimum, int $maximum, bool $optional = false): string {
    if ($optional && ($value === null || $value === '')) return '';
    if (!is_string($value)) store_fail(422, 'VALIDATION_ERROR', $name . ' is required.');
    $value = trim($value); $length = preg_match_all('/./us', $value);
    if ($length === false || $length < $minimum || $length > $maximum || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) store_fail(422, 'VALIDATION_ERROR', $name . ' must contain ' . $minimum . ' to ' . $maximum . ' characters.');
    return $value;
}
function store_phone(mixed $input): string {
    $number = preg_replace('/[\s()-]/', '', store_text($input, 'Phone number', 11, 25));
    if (preg_match('/^01[3-9]\d{8}$/D', $number)) $number = '+88' . $number;
    elseif (preg_match('/^8801[3-9]\d{8}$/D', $number)) $number = '+' . $number;
    if (!preg_match('/^\+8801[3-9]\d{8}$/D', $number)) store_fail(422, 'VALIDATION_ERROR', 'Enter a valid Bangladeshi mobile number.');
    return $number;
}
function store_customer(mixed $input): array {
    if (!is_array($input)) store_fail(422, 'VALIDATION_ERROR', 'Delivery details are required.');
    $email = store_text($input['email'] ?? null, 'Email', 3, 254, true);
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) store_fail(422, 'VALIDATION_ERROR', 'Enter a valid email address.');
    if (!in_array($input['deliveryZone'] ?? null, ['dhaka', 'outside'], true)) store_fail(422, 'VALIDATION_ERROR', 'Choose a valid delivery zone.');
    return ['name' => store_text($input['name'] ?? null, 'Full name', 2, 100), 'phone' => store_phone($input['phone'] ?? null), 'email' => $email, 'address' => store_text($input['address'] ?? null, 'Delivery address', 10, 500), 'city' => store_text($input['city'] ?? null, 'City or district', 2, 80), 'deliveryZone' => $input['deliveryZone']];
}
function store_items(mixed $input): array {
    if (!is_array($input) || !array_is_list($input) || count($input) < 1 || count($input) > 50) store_fail(422, 'VALIDATION_ERROR', 'Choose between 1 and 20 product variants.');
    $grouped = [];
    foreach ($input as $item) {
        if (!is_array($item) || !is_int($item['id'] ?? null) || !is_int($item['quantity'] ?? null) || $item['quantity'] < 1 || $item['quantity'] > 10 || !is_string($item['size'] ?? null)) store_fail(422, 'VALIDATION_ERROR', 'Each item needs a valid product, size, and quantity from 1 to 10.');
        $product = store_product($item['id']);
        if (!$product || !in_array($item['size'], $product['sizes'], true)) store_fail(422, 'INVALID_PRODUCT', 'A product or size is no longer available.');
        $key = $item['id'] . ':' . $item['size']; $quantity = ($grouped[$key]['quantity'] ?? 0) + $item['quantity'];
        if ($quantity > 10) store_fail(422, 'QUANTITY_LIMIT', 'A maximum of 10 units per size is allowed.');
        $grouped[$key] = ['id' => $item['id'], 'size' => $item['size'], 'quantity' => $quantity];
    }
    $items = array_values($grouped); usort($items, fn(array $left, array $right): int => ($left['id'] <=> $right['id']) ?: strcmp($left['size'], $right['size']));
    if (count($items) > 20 || array_sum(array_column($items, 'quantity')) > 50) store_fail(422, 'QUANTITY_LIMIT', 'An order may contain up to 20 variants and 50 units.');
    return $items;
}
function store_quote(PDO $database, array $items, mixed $zone, bool $lock = false): array {
    if (!in_array($zone, ['dhaka', 'outside'], true)) store_fail(422, 'VALIDATION_ERROR', 'Choose a valid delivery zone.');
    $lines = []; $failures = [];
    $statement = $database->prepare('SELECT quantity FROM inventory WHERE product_id=? AND size=?' . ($lock ? ' FOR UPDATE' : ''));
    foreach ($items as $item) {
        $product = store_product($item['id']); $statement->execute([$item['id'], $item['size']]); $available = (int)($statement->fetchColumn() ?: 0);
        if ($available < $item['quantity']) $failures[] = ['id' => $item['id'], 'size' => $item['size'], 'available' => $available];
        $lines[] = array_merge($item, ['name' => $product['name'], 'image' => $product['image'], 'unitPrice' => $product['price'], 'lineTotal' => $product['price'] * $item['quantity']]);
    }
    if ($failures) store_fail(409, 'OUT_OF_STOCK', 'Some items do not have enough stock. Update your bag and try again.', $failures);
    $subtotal = array_sum(array_column($lines, 'lineTotal'));
    if ($subtotal > 1000000) store_fail(422, 'ORDER_LIMIT', 'Please contact the store for orders over ৳1,000,000.');
    $shipping = store_shipping(); $delivery = $subtotal >= $shipping['freeThreshold'] ? 0 : ($zone === 'dhaka' ? $shipping['insideDhaka'] : $shipping['outsideDhaka']);
    return ['items' => $lines, 'subtotal' => $subtotal, 'shipping' => $delivery, 'total' => $subtotal + $delivery, 'currency' => 'BDT'];
}
function store_iso(string $date): string { return (new DateTimeImmutable($date, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'); }
function store_find_order(PDO $database, string $reference, bool $lock = false): array|false { $statement = $database->prepare('SELECT * FROM orders WHERE reference=?' . ($lock ? ' FOR UPDATE' : '')); $statement->execute([$reference]); return $statement->fetch(); }
function store_order(PDO $database, array $row, bool $private = true): array {
    $order = ['reference' => $row['reference'], 'status' => $row['status'], 'items' => json_decode($row['items_json'], true, 64, JSON_THROW_ON_ERROR), 'subtotal' => (int)$row['subtotal'], 'shipping' => (int)$row['shipping'], 'total' => (int)$row['total'], 'currency' => 'BDT', 'createdAt' => store_iso($row['created_at']), 'updatedAt' => store_iso($row['updated_at']), 'paymentMethod' => 'cod'];
    if ($private) {
        $order['customer'] = json_decode($row['customer_json'], true, 64, JSON_THROW_ON_ERROR);
        $statement = $database->prepare('SELECT note_text,created_at FROM order_notes WHERE reference=? ORDER BY id'); $statement->execute([$row['reference']]);
        $order['notes'] = array_map(fn(array $note): array => ['text' => $note['note_text'], 'createdAt' => store_iso($note['created_at'])], $statement->fetchAll());
        $statement = $database->prepare('SELECT status,created_at FROM order_events WHERE reference=? ORDER BY id'); $statement->execute([$row['reference']]);
        $order['events'] = array_map(fn(array $event): array => ['status' => $event['status'], 'createdAt' => store_iso($event['created_at'])], $statement->fetchAll());
    }
    return $order;
}
function store_transaction(PDO $database, callable $callback): mixed {
    $database->beginTransaction();
    try { $result = $callback(); $database->commit(); return $result; }
    catch (Throwable $error) { if ($database->inTransaction()) $database->rollBack(); throw $error; }
}
