<?php
declare(strict_types=1);
// One authoritative catalog for PHP pricing and the offline browser fallback.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('STORE_API', true);
require dirname(__DIR__) . '/api/bootstrap.php';
try {
    $products = store_catalog();
    $names = array_values(array_unique(array_column($products, 'category')));
    $preferred = ['T-Shirts', 'Shirts', 'Polos', 'Trousers'];
    $names = array_values(array_unique(array_merge(array_values(array_intersect($preferred, $names)), $names)));
    $categories = [];
    foreach ($names as $name) {
        foreach ($products as $product) if ($product['category'] === $name) {
            $categories[] = ['name' => $name, 'image' => $product['image']];
            break;
        }
    }
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR;
    $output = "/* Generated from catalog-data.json by php tools/sync-catalog.php. */\n(function () {\n  'use strict';\n  const products = " . json_encode($products, $flags) . ";\n  const categories = " . json_encode($categories, $flags) . ";\n  const formatPrice = price => '৳' + new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(price);\n  window.RichkidCatalog = { products, categories, formatPrice };\n})();\n";
    $path = dirname(__DIR__) . '/catalog.js';
    if (in_array('--check', $argv, true)) {
        if (!is_file($path) || file_get_contents($path) !== $output) { fwrite(STDERR, "Browser catalog is out of date. Run php tools/sync-catalog.php.\n"); exit(1); }
        fwrite(STDOUT, "Browser and server catalogs match.\n");
    } else {
        file_put_contents($path, $output);
        fwrite(STDOUT, "Browser catalog updated from authoritative server catalog.\n");
    }
} catch (Throwable $error) { fwrite(STDERR, "Catalog sync failed. Check catalog-data.json fields and JSON syntax.\n"); exit(1); }
