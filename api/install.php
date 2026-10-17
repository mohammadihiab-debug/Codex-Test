<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('STORE_API', true);
require __DIR__ . '/bootstrap.php';
try {
    $database = store_db(false); $schema = file_get_contents(__DIR__ . '/schema.sql');
    foreach (explode(';', $schema) as $statement) if (trim($statement) !== '') $database->exec($statement);
    store_transaction($database, function () use ($database): void {
        $statement = $database->prepare('INSERT IGNORE INTO inventory(product_id,size,quantity) VALUES(?,?,0)');
        foreach (store_catalog() as $product) foreach ($product['sizes'] as $size) $statement->execute([$product['id'], $size]);
    });
    fwrite(STDOUT, "Database schema installed. Existing orders and inventory preserved. New sizes start at zero stock.\n");
} catch (Throwable $error) { fwrite(STDERR, "Database setup failed. Check database settings, connectivity, and CREATE/ALTER permissions. No credentials were printed.\n"); exit(1); }
