<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header_remove('X-Powered-By');
define('STORE_API', true);
require __DIR__ . '/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store');
header('Content-Security-Policy: default-src \'none\'; frame-ancestors \'none\'');

function checkout_result(PDO $database, array $row): array { $order = store_order($database, $row); unset($order['notes'], $order['events']); return ['order' => $order]; }

try {
    store_check_origin();
    if (store_secure()) header('Strict-Transport-Security: max-age=31536000');
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $method = $_SERVER['REQUEST_METHOD']; $route = $method . ' ' . $path;
    if ($route === 'GET /api/health' || $route === 'GET /api/catalog') {
        $database = null;
        try { $database = store_db(); } catch (StoreError $error) { /* Read-only browsing remains available before deployment setup. */ }
        $result = store_readiness($database);
        if ($route === 'GET /api/catalog') $result['products'] = store_inventory($database); else $result['ok'] = true;
        store_json(200, $result);
    }
    $database = store_db();
    if ($route === 'POST /api/quote') {
        store_rate_limit($database, 'quote', 120, 60); $input = store_body();
        store_json(200, array_merge(store_quote($database, store_items($input['items'] ?? null), $input['deliveryZone'] ?? null), ['orderingEnabled' => store_readiness($database)['orderingEnabled']]));
    }
    if ($route === 'POST /api/orders') {
        store_rate_limit($database, 'orders', 12, 600); $input = store_body();
        $person = store_customer($input['customer'] ?? null); $items = store_items($input['items'] ?? null);
        $key = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';
        if (!preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $key)) store_fail(422, 'IDEMPOTENCY_REQUIRED', 'A unique checkout request key is required.');
        $requestHash = hash('sha256', json_encode(['customer' => $person, 'items' => $items], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $findDuplicate = function () use ($database, $key, $requestHash): array|false {
            $statement = $database->prepare('SELECT * FROM orders WHERE idempotency_key=?'); $statement->execute([$key]); $row = $statement->fetch();
            if ($row && !hash_equals($row['request_hash'], $requestHash)) store_fail(409, 'IDEMPOTENCY_CONFLICT', 'This checkout key was already used for different order details.');
            return $row;
        };
        if ($existing = $findDuplicate()) store_json(200, checkout_result($database, $existing));
        if (!store_readiness($database)['orderingEnabled']) {
            if ($existing = $findDuplicate()) store_json(200, checkout_result($database, $existing));
            store_fail(503, 'STORE_NOT_READY', 'The store is not accepting orders yet. Please try again after the owner enables checkout.');
        }
        try {
            $reference = store_transaction($database, function () use ($database, $key, $requestHash, $person, $items): string {
                $reference = 'RK-' . gmdate('Ymd') . '-' . strtoupper(bin2hex(random_bytes(6)));
                // Claim the idempotency key before reserving inventory. A simultaneous
                // retry waits for this transaction, then returns the same saved order.
                $statement = $database->prepare("INSERT INTO orders(reference,idempotency_key,request_hash,status,customer_json,items_json,subtotal,shipping,total,created_at,updated_at) VALUES(?,?,?,'pending',?,'[]',0,0,0,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
                $statement->execute([$reference, $key, $requestHash, json_encode($person, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
                $totals = store_quote($database, $items, $person['deliveryZone'], true);
                $decrement = $database->prepare('UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND size=? AND quantity>=?');
                foreach ($items as $item) { $decrement->execute([$item['quantity'], $item['id'], $item['size'], $item['quantity']]); if ($decrement->rowCount() !== 1) store_fail(409, 'OUT_OF_STOCK', 'An item has just sold out. Please update your bag.'); }
                $statement = $database->prepare('UPDATE orders SET items_json=?,subtotal=?,shipping=?,total=? WHERE reference=?');
                $statement->execute([json_encode($totals['items'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $totals['subtotal'], $totals['shipping'], $totals['total'], $reference]);
                $database->prepare("INSERT INTO order_events(reference,status,created_at) VALUES(?,'pending',UTC_TIMESTAMP(6))")->execute([$reference]);
                return $reference;
            });
        } catch (PDOException $error) {
            if (($error->errorInfo[1] ?? null) === 1062 && ($existing = $findDuplicate())) store_json(200, checkout_result($database, $existing));
            throw $error;
        }
        store_json(201, checkout_result($database, store_find_order($database, $reference)));
    }
    if ($route === 'POST /api/order-status') {
        store_rate_limit($database, 'status', 20, 600); $input = store_body();
        $reference = strtoupper(store_text($input['reference'] ?? null, 'Order reference', 10, 50)); $number = store_phone($input['phone'] ?? null);
        $row = store_find_order($database, $reference);
        if (!$row || !hash_equals(json_decode($row['customer_json'], true, 64, JSON_THROW_ON_ERROR)['phone'], $number)) store_fail(404, 'ORDER_NOT_FOUND', 'No order matches that reference and phone number.');
        $order = store_order($database, $row, false); unset($order['subtotal'], $order['shipping']);
        $order['items'] = array_map(fn(array $item): array => ['name' => $item['name'], 'size' => $item['size'], 'quantity' => $item['quantity']], $order['items']);
        store_json(200, $order);
    }
    if ($route === 'POST /api/admin/login') {
        store_rate_limit($database, 'login', 8, 900); $input = store_body(); $config = store_config();
        $supplied = is_string($input['password'] ?? null) && strlen($input['password']) <= 1024 ? $input['password'] : '';
        $valid = false;
        if (store_admin_configured()) $valid = $config['admin_password_hash'] !== '' ? password_verify($supplied, $config['admin_password_hash']) : hash_equals(hash('sha256', $config['admin_password']), hash('sha256', $supplied));
        if (!$valid) store_fail(401, 'INVALID_CREDENTIALS', 'The administrator password is incorrect or not configured.');
        store_session(false, false); session_regenerate_id(true);
        $_SESSION = ['authenticated' => true, 'expires' => time() + 28800, 'csrfToken' => bin2hex(random_bytes(32))];
        $csrfToken = $_SESSION['csrfToken']; session_write_close(); store_json(200, ['ok' => true, 'csrfToken' => $csrfToken]);
    }
    if (str_starts_with($path, '/api/admin/')) {
        $auth = store_session();
        if ($route === 'GET /api/admin/session') { session_write_close(); store_json(200, $auth); }
        if ($route === 'POST /api/admin/logout') {
            $_SESSION = []; session_destroy(); setcookie('RKADMIN', '', ['expires' => time() - 3600, 'path' => '/api/admin', 'secure' => store_secure(), 'httponly' => true, 'samesite' => 'Strict']);
            store_json(200, ['ok' => true]);
        }
        session_write_close();
        if ($route === 'GET /api/admin/status') store_json(200, store_readiness($database));
        $states = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if ($route === 'GET /api/admin/orders') {
            $status = $_GET['status'] ?? '';
            if (!is_string($status) || ($status !== '' && !in_array($status, $states, true))) store_fail(422, 'INVALID_STATUS', 'Choose a valid order status.');
            $pageInput = $_GET['page'] ?? '1'; $page = is_scalar($pageInput) ? max(1, min(1000000, (int)$pageInput)) : 1; $pageSize = 50;
            $where = $status !== '' ? ' WHERE status=?' : '';
            $statement = $database->prepare('SELECT * FROM orders' . $where . ' ORDER BY created_at DESC LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)); $statement->execute($status !== '' ? [$status] : []);
            $orders = array_map(fn(array $row): array => store_order($database, $row), $statement->fetchAll());
            $statement = $database->prepare('SELECT COUNT(*) FROM orders' . $where); $statement->execute($status !== '' ? [$status] : []);
            store_json(200, ['orders' => $orders, 'total' => (int)$statement->fetchColumn(), 'page' => $page, 'pageSize' => $pageSize]);
        }
        if ($route === 'GET /api/admin/orders.csv' || $route === 'GET /api/admin/export') {
            header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="orders.csv"');
            $output = fopen('php://output', 'wb'); fwrite($output, "\xEF\xBB\xBF");
            $writeRow = function (array $row) use ($output): void { $safe = array_map(function (mixed $value): string { $value = (string)($value ?? ''); return preg_match('/^\s*[=+\-@\t\r\n]/u', $value) ? "'" . $value : $value; }, $row); fputcsv($output, $safe, ',', '"', ''); };
            $writeRow(['Reference', 'Status', 'Created at', 'Name', 'Phone', 'Email', 'Address', 'City', 'Delivery zone', 'Items', 'Subtotal BDT', 'Delivery BDT', 'Total BDT']);
            $statement = $database->query('SELECT * FROM orders ORDER BY created_at DESC');
            while ($row = $statement->fetch()) {
                $person = json_decode($row['customer_json'], true, 64, JSON_THROW_ON_ERROR); $items = json_decode($row['items_json'], true, 64, JSON_THROW_ON_ERROR);
                $writeRow([$row['reference'], $row['status'], store_iso($row['created_at']), $person['name'], $person['phone'], $person['email'], $person['address'], $person['city'], $person['deliveryZone'], implode('; ', array_map(fn(array $item): string => $item['name'] . ' / ' . $item['size'] . ' × ' . $item['quantity'], $items)), $row['subtotal'], $row['shipping'], $row['total']]);
            }
            fclose($output); exit;
        }
        if ($route === 'GET /api/admin/inventory' || $route === 'GET /api/admin/stock') store_json(200, ['products' => store_inventory($database)]);
        if ($route === 'PATCH /api/admin/inventory' || $route === 'PATCH /api/admin/stock') {
            $input = store_body(); $items = $input['items'] ?? null;
            if (!is_array($items) || !array_is_list($items) || !$items || count($items) > 500) store_fail(422, 'VALIDATION_ERROR', 'Include between 1 and 500 inventory variants.');
            $seen = [];
            foreach ($items as $item) {
                $product = is_array($item) && is_int($item['id'] ?? null) ? store_product($item['id']) : null;
                if (!$product || !in_array($item['size'] ?? null, $product['sizes'], true) || !is_int($item['quantity'] ?? null) || $item['quantity'] < 0 || $item['quantity'] > 100000) store_fail(422, 'VALIDATION_ERROR', 'Inventory needs a valid product, size, and quantity between 0 and 100000.');
                if (array_key_exists('expectedQuantity', $item) && (!is_int($item['expectedQuantity']) || $item['expectedQuantity'] < 0 || $item['expectedQuantity'] > 100000)) store_fail(422, 'VALIDATION_ERROR', 'The original inventory quantity must be an integer between 0 and 100000.');
                $key = $item['id'] . ':' . $item['size']; if (isset($seen[$key])) store_fail(422, 'DUPLICATE_VARIANT', 'Include each inventory variant only once.'); $seen[$key] = true;
            }
            usort($items, fn(array $left, array $right): int => ($left['id'] <=> $right['id']) ?: strcmp($left['size'], $right['size']));
            store_transaction($database, function () use ($database, $items): void {
                $find = $database->prepare('SELECT quantity FROM inventory WHERE product_id=? AND size=? FOR UPDATE');
                $update = $database->prepare('INSERT INTO inventory(product_id,size,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)');
                foreach ($items as $item) {
                    $find->execute([$item['id'], $item['size']]); $current = (int)($find->fetchColumn() ?: 0);
                    if (isset($item['expectedQuantity']) && $current !== $item['expectedQuantity']) store_fail(409, 'INVENTORY_CHANGED', 'Stock changed while you were editing. Reload inventory and apply your adjustment again.', ['id' => $item['id'], 'size' => $item['size'], 'currentQuantity' => $current]);
                    $update->execute([$item['id'], $item['size'], $item['quantity']]);
                }
            });
            store_json(200, ['products' => store_inventory($database)]);
        }
        if ($method === 'PATCH' && preg_match('~^/api/admin/orders/(RK-[A-Z0-9-]{10,35})$~D', $path, $matches)) {
            $input = store_body(); $note = store_text($input['note'] ?? null, 'Note', 1, 1000, true);
            $transitions = ['pending' => ['confirmed', 'processing', 'cancelled'], 'confirmed' => ['processing', 'cancelled'], 'processing' => ['shipped', 'cancelled'], 'shipped' => ['delivered'], 'delivered' => [], 'cancelled' => []];
            $reference = $matches[1];
            store_transaction($database, function () use ($database, $reference, $input, $note, $states, $transitions): void {
                $row = store_find_order($database, $reference, true); if (!$row) store_fail(404, 'ORDER_NOT_FOUND', 'That order was not found.');
                $next = $input['status'] ?? $row['status'];
                if (!is_string($next) || !in_array($next, $states, true) || ($next !== $row['status'] && !in_array($next, $transitions[$row['status']], true))) store_fail(409, 'INVALID_TRANSITION', 'That order status change is not allowed.');
                if ($next === $row['status'] && $note === '') store_fail(422, 'NO_CHANGE', 'Choose a new status or enter an internal note.');
                if ($next === 'cancelled' && $row['status'] !== 'cancelled') {
                    $restore = $database->prepare('UPDATE inventory SET quantity=quantity+? WHERE product_id=? AND size=?');
                    foreach (json_decode($row['items_json'], true, 64, JSON_THROW_ON_ERROR) as $item) $restore->execute([$item['quantity'], $item['id'], $item['size']]);
                }
                $database->prepare('UPDATE orders SET status=?,updated_at=UTC_TIMESTAMP(6) WHERE reference=?')->execute([$next, $reference]);
                if ($next !== $row['status']) $database->prepare('INSERT INTO order_events(reference,status,created_at) VALUES(?,?,UTC_TIMESTAMP(6))')->execute([$reference, $next]);
                if ($note !== '') $database->prepare('INSERT INTO order_notes(reference,note_text,created_at) VALUES(?,?,UTC_TIMESTAMP(6))')->execute([$reference, $note]);
            });
            store_json(200, ['order' => store_order($database, store_find_order($database, $reference))]);
        }
    }
    store_fail(404, 'API_NOT_FOUND', 'That API endpoint does not exist.');
} catch (StoreError $error) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $payload = ['error' => $error->getMessage(), 'code' => $error->errorCode]; if ($error->details !== null) $payload['details'] = $error->details;
    store_json($error->httpStatus, $payload);
} catch (Throwable $error) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    // Deliberately omit exception messages, SQL, personal data and credentials.
    error_log('Store API request failed: ' . get_class($error));
    store_json(500, ['error' => 'The server could not complete that request. Please try again.', 'code' => 'INTERNAL_ERROR']);
}
