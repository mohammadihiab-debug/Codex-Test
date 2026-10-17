<?php
declare(strict_types=1);
// Copy to api/config.local.php on your server. Never commit the local file.
// Requests to configuration files are denied by .htaccess and this guard.
if (!defined('STORE_API')) { http_response_code(404); exit; }
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => '', // Hosting panel: create a MySQL database and dedicated user.
    'db_user' => '',
    'db_password' => '',
    // Generate privately: php -r 'echo password_hash(readline("Password: "), PASSWORD_DEFAULT), PHP_EOL;'
    // Use a unique random password with at least 16 characters.
    'admin_password_hash' => '',
    'public_origin' => 'https://rojoniful.orioleflow.com',
    'trust_proxy' => false, // True only behind your own header-sanitizing proxy.
    'store_live' => false, // Enable only after importing schema and setting stock.
    'catalog_confirmed' => true, // The owner requested using sample products for now.
    'shipping_dhaka' => 80,
    'shipping_outside' => 130,
    'free_shipping_threshold' => 2500,
];
