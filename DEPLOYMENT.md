# Deploy to rojoniful.orioleflow.com

These instructions target the root of **https://rojoniful.orioleflow.com/** on cPanel-style PHP/MySQL hosting. This repository has not been automatically deployed to the hosting account. Access to that account and its database is still required.

## 1. Prepare the subdomain

In cPanel, confirm the document root assigned to `rojoniful.orioleflow.com`. Use the directory shown in the Domains screen; it may differ from `public_html`.

Select PHP **8.2+** for this domain and enable **PDO MySQL**, JSON and sessions. Use MySQL **5.7+** or MariaDB **10.4+**. Apache must allow the provided `.htaccess` rules, rewriting and response headers. This application uses no Composer dependencies and needs no Node.js service.

Install a valid HTTPS certificate and enable cPanel's **Force HTTPS Redirect** for the subdomain. The production API rejects HTTP requests when its configured public origin uses HTTPS. An SSL certificate alone does not redirect visitors; verify the HTTPS redirect as well.

## 2. Upload the application

Upload the release ZIP or the repository files into that subdomain's document root. `index.html`, `admin.html`, `api/`, `images/` and `fonts/` must be directly inside that root, rather than inside an additional `Codex-Test/` directory.

Enable **Show Hidden Files** in File Manager and confirm that both `.htaccess` and `api/.htaccess` were uploaded. These files route API requests and restrict configuration, database scripts, dotfiles and private files. Keep the API's PHP guards intact.

Do not upload `.git/`, local credentials, `.env` files, test output, database dumps or backups into the public site. The optional source documents and test scripts are not needed to serve customers. Never put the release ZIP or a database export in the public document root after extracting it.

The site expects `/api/...` at the domain root. Installing it in a nested path needs a separate routing change; use the subdomain root for this deployment.

## 3. Create the database

In **MySQL Databases**, create a database and a dedicated database user with a strong password. Add that user to the database. cPanel commonly adds your account name as a prefix to database and user names; use the full names it shows.

For initial installation, the user must be able to create the tables and their indexes, insert records and read/update/delete application data. After setup, the application normally needs `SELECT`, `INSERT`, `UPDATE` and `DELETE`; keep schema-change permissions only where your update process requires them.

Use phpMyAdmin to select the new database and import **`api/schema.sql`**. Confirm that `store_meta`, `inventory`, `orders`, `order_notes`, `order_events` and `rate_limits` appear. The schema import does not invent stock.

If cPanel provides Terminal or you have SSH, you can use the CLI installer instead after configuring the connection in the next step:

```sh
php api/install.php
```

Run it from the application's document root using the same PHP version as the website. The installer is CLI-only and cannot be run by visiting its URL. It is repeatable: existing orders and stock remain, and new catalog size entries start at zero. Importing the SQL alone is sufficient; saving stock in the dashboard creates missing inventory variants.

## 4. Configure private server settings

Copy `api/config.example.php` to **`api/config.local.php`** on the server. Use the cPanel editor to fill in `db_host`, `db_port`, `db_name`, `db_user` and `db_password`. The host is often `localhost`; use your hosting provider's documented value.

Keep the opening PHP guard in that file. Keep it readable only by the hosting account and PHP process using your host's recommended file permissions; never use world-writable permissions. This local file is excluded from Git.

Set the public origin exactly, with no trailing slash or path:

```php
'public_origin' => 'https://rojoniful.orioleflow.com',
'store_live' => false,
'catalog_confirmed' => true,
```

The sample catalog is accepted for now. The store stays closed for real ordering until you set `store_live` to `true`, configure administrator authentication, install the database and add sellable inventory.

### Administrator password

There is no default administrator password. Choose a unique random password of at least 16 characters. Generate its hash privately using PHP, for example in your own private terminal:

```sh
php -r 'echo password_hash(readline("Administrator password: "), PASSWORD_DEFAULT), PHP_EOL;'
```

This terminal prompt displays typed characters, so use a private terminal. The password itself is not included in shell history by this command. Paste the resulting hash into `admin_password_hash` in `api/config.local.php`. Keep the password in your password manager. Do not use an online hash generator or share the password in chat.

Use the hash option in production. The plaintext `ADMIN_PASSWORD` process-environment option is available for isolated local testing; it is unnecessary on the production host.

Leave `trust_proxy` false unless your host has documented a trusted proxy that strips untrusted forwarding headers. If the host terminates TLS at such a proxy, ask it for the correct trusted-proxy setup before enabling that setting.

## 5. Add the actual business details and stock

Edit the public **`store-config.js`** file with the store name, real support email and phone, address and any social accounts you want to publish. Public settings contain no secrets.

Read `shipping.html`, `returns.html`, `privacy.html`, `terms.html` and `faq.html`. Confirm your delivery coverage, delivery charges, exchange window and conditions, business identity, privacy contact and record-retention arrangements. Update the actual text where necessary, then set `policiesConfirmed: true` in the public settings. That switch is your acknowledgement; it does not write or legally review a policy for you.

Set matching charges in the public shipping settings and private API configuration. The defaults are ৳80 inside Dhaka, ৳130 outside Dhaka, and free delivery from ৳2,500. The API calculates the amount charged for an order.

Open **https://rojoniful.orioleflow.com/admin.html**, sign in, and enter the real available quantity for every size you want to sell. Inventory starts at zero. Do not enter placeholder quantities; checkout reserves this stock when orders are placed.

When changing products, edit **`catalog-data.json`**, including stable IDs, names, prices and sizes, then run `php tools/sync-catalog.php` locally to regenerate `catalog.js`. Upload **both** files together. Run `php tools/sync-catalog.php --check` before uploading to verify they match. The server catalog controls order prices. Keep a product's ID stable after orders exist, and use a new ID for a different product. Upload the matching real photography and product details when replacing samples.

## 6. Verify the hosted application, then open ordering

Before accepting customer traffic:

1. Visit the home, shop, product, bag, contact and policy pages on desktop and a phone. Confirm images, fonts, links, contact details and your policies.
2. Visit **`https://rojoniful.orioleflow.com/api/health`**. It should return JSON. Review `readiness` and `issues`; before the live switch is enabled, `orderingEnabled` should be false. A successful HTTP response alone does not mean the store is ready.
3. Verify `admin.html` login and a saved inventory change. Log out and confirm customer browsers cannot read administrator orders.
4. Confirm a direct request to `/api/config.local.php`, `/api/schema.sql` and `/.git/config` is denied. Do not print the configuration contents to diagnose a failure.
5. Set `'store_live' => true` in the private server configuration only when the preceding checks and policies are complete. Recheck `/api/health`; `orderingEnabled` should now be true with no remaining issues.
6. Place one clearly identified order using your own delivery details and a real item in stock. Confirm that the order appears in the dashboard, stock decreases, the total matches, and tracking works with the checkout phone number. Cancel the test order before dispatch and confirm its stock is restored.

The automated integration and browser tests are for a disposable local database. Do not run them on this production database. The short hosted verification above is a manual check of your real deployment.

If anything fails, return `store_live` to false while investigating. Browsing can remain available while order creation is closed.

## Configuration reference

Environment variables, when configured by the hosting platform, override matching values in `api/config.local.php`. PHP does **not** automatically read a `.env` file; uploading one is not configuration and can expose secrets if hosting protections are missing.

| Local PHP configuration key | Process environment variable | Purpose |
| --- | --- | --- |
| `db_host` | `DB_HOST` | MySQL hostname |
| `db_port` | `DB_PORT` | MySQL port; normally 3306 |
| `db_name` | `DB_NAME` | Full database name |
| `db_user` | `DB_USER` | Dedicated database user |
| `db_password` | `DB_PASSWORD` | Private database password |
| `admin_password_hash` | `ADMIN_PASSWORD_HASH` | PHP-generated administrator password hash |
| `admin_password` | `ADMIN_PASSWORD` | Plaintext fallback for local tests; prefer a hash in production |
| `public_origin` | `PUBLIC_ORIGIN` | Exact origin, no slash; production must use HTTPS |
| `trust_proxy` | `TRUST_PROXY` | `false` unless a trusted proxy is configured |
| `store_live` | `STORE_LIVE` | Explicitly enable ordering after setup |
| `catalog_confirmed` | `SAMPLE_CATALOG_CONFIRMED` | Acceptance of the current catalog |
| `shipping_dhaka` | `SHIPPING_DHAKA` | Inside-Dhaka charge in BDT |
| `shipping_outside` | `SHIPPING_OUTSIDE` | Outside-Dhaka charge in BDT |
| `free_shipping_threshold` | `FREE_SHIPPING_THRESHOLD` | Order subtotal for free delivery in BDT |

## Orders, backups and maintenance

Keep the administrator dashboard open during business hours and refresh it to monitor orders. Confirm customer details, book couriers yourself and update order status manually. This release does not automatically notify customers, send emails/SMS, book a courier, or collect bKash/Nagad/card payments. Do not advertise those connections as working.

Store database backups and the private configuration outside the public directory. Use your hosting provider's scheduled backups and verify a restore to a separate database. CSV exports contain customer details; restrict access and delete exports when no longer needed.

Review hosting/PHP error logs when diagnosing faults. Disable public PHP error display in production, keep logs private and set an appropriate retention period. Do not add full order payloads, passwords or database credentials to logs. Set a retention policy for customer records, describe it in the privacy policy and keep PHP and hosting security updates current.

For updates, back up first, keep the existing `api/config.local.php` and database, and upload the reviewed changed files. Avoid deleting customer data or replacing real stock with test values. Run the installer only when the update calls for schema/catalog initialization, and verify `/api/health` and a normal storefront journey afterward.
