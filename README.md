# RICHKID storefront

A clothing storefront built with HTML, CSS and plain JavaScript. There is no JSX, frontend framework, npm install or build step. A PHP/MySQL API records real cash on delivery orders and powers the administrator dashboard.

Intended production address: **https://rojoniful.orioleflow.com/**. The repository contains the application and deployment instructions; it does not establish that the application has been deployed to that address.

Start with [LAUNCH.md](LAUNCH.md) for the remaining owner actions and [DEPLOYMENT.md](DEPLOYMENT.md) for cPanel installation.

## What works

- Home, collection, category filters, sorting, search and product detail pages.
- Size selection, stock checks, browser-saved wishlist and shopping bag.
- Checkout with server-calculated prices, delivery charges and stock reservation.
- Persisted MySQL orders, confirmation, and order lookup using a reference and checkout phone number.
- Password-protected `admin.html`: inventory, order filters, allowed status changes, private notes and CSV export.
- Contact, about, delivery, returns, privacy, terms, FAQ and 404 pages.
- Mobile layouts, local fonts and product photography; no third-party frontend dependency.

Orders use cash on delivery. There is no bKash, Nagad or card payment gateway, automatic courier booking, or automatic email/SMS notification. Arrange deliveries and monitor new orders through the dashboard. The contact form prepares an email in the visitor's email app; the visitor still needs to send it. Newsletter submissions are not subscribed to a mailing list by default.

## Requirements

- PHP **8.2 or newer**, with PDO MySQL, JSON and PHP sessions.
- MySQL **5.7+** or MariaDB **10.4+**, using InnoDB and `utf8mb4`.
- Production: HTTPS and Apache 2.4 compatible hosting with `.htaccess`, `mod_rewrite` and `mod_headers` support.
- PHP cURL is also needed for the integration test suite.

A static host or opening `index.html` alone supports browsing, but cannot record live orders. Run the PHP application for checkout and administrator functions.

## Local development

Each Codex cloud task already runs in an isolated environment. Use the existing checkout; do not create a Git worktree unless the user requests one.

1. Create a local MySQL database and dedicated user. Never point development or tests at the live customer database.
2. Copy the server configuration:

   ```sh
   cp api/config.example.php api/config.local.php
   ```

3. Edit that local file privately. Fill in the database connection and an administrator password hash. Use `public_origin` equal to `http://127.0.0.1:5173` for the development server below. Keep `store_live` false initially. Do not commit the file.
4. Install the tables and zero-stock inventory entries:

   ```sh
   php api/install.php
   ```

   The installer preserves existing orders and stock. Alternatively, import `api/schema.sql` into the selected database; missing inventory variants are treated as zero until saved in the dashboard.
5. Start the server from the repository root:

   ```sh
   php -S 127.0.0.1:5173 api/dev-router.php
   ```

6. Open `http://127.0.0.1:5173/` and `http://127.0.0.1:5173/admin.html`. Sign in with the password corresponding to your configured hash. Add actual stock, then enable `store_live` when ready to exercise checkout.

`api/dev-router.php` is for local development. Production uses the included Apache rules. Database settings can also come from process environment variables; see [the configuration reference](DEPLOYMENT.md#configuration-reference). PHP does not automatically load a `.env` file.

## Catalog and store settings

- `store-config.js` is public: store name, support contacts, address, social links, shipping presentation, exchange window and policy confirmation. Never put credentials there.
- `catalog-data.json` supplies the API catalog and is the source for the browser catalog. After editing it, run `php tools/sync-catalog.php` to regenerate `catalog.js`; upload both files. Use `php tools/sync-catalog.php --check` to verify they match. The API determines the actual order price; a browser-supplied price is ignored.
- `images/` contains the product, collection and editorial images. Replace example product descriptions and photography when adding your real products. The owner has accepted using the sample catalog for now.
- `api/config.local.php` contains private database settings, administrator authentication, authoritative shipping charges and the live-order switch. It is Git-ignored.
- New sizes begin with no sellable stock. Run the installer after adding sizes if desired, then set quantities in the administrator dashboard. Never reuse a product ID for a different product after taking orders.

Match the public shipping values to the API configuration. The current defaults are ৳80 inside Dhaka, ৳130 outside Dhaka, and free delivery from ৳2,500. They are configurable; confirm your actual rates before launch. Read and confirm the policy pages and contact details before setting `policiesConfirmed: true`.

## Tests

The integration suite changes data and must only use a disposable database ending in `_test`. It refuses to start without `STORE_TEST_ALLOW_RESET=yes`. It deletes test orders, notes, events and rate-limit records and resets inventory. **Never use a production database.**

Create a disposable database, bind its credentials privately in your terminal, and use the same bindings for the installer, PHP server and test process:

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=store_test
export DB_USER=your_test_database_user
# Set DB_PASSWORD privately in your terminal or private local test environment.
# Set a unique ADMIN_PASSWORD of at least 16 characters privately for this test run.
export PUBLIC_ORIGIN=http://127.0.0.1:5189
export STORE_LIVE=true SAMPLE_CATALOG_CONFIRMED=true
php api/install.php
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:5189 api/dev-router.php
```

Keep that server running. In a second terminal with the same private database and administrator bindings:

```sh
STORE_TEST_ALLOW_RESET=yes TEST_BASE_URL=http://127.0.0.1:5189 php api/tests/integration.php
```

For this test suite, use the temporary `ADMIN_PASSWORD` environment option and leave `ADMIN_PASSWORD_HASH` unset. A hash in `api/config.local.php` takes priority over a plaintext password; use a separate local test configuration without a production hash. Production should use a hash.

The integration checks cover persisted orders, stock reservation and cancellation, concurrent buyers, duplicate submission protection, server pricing, authentication, CSRF/origin protections, tracking privacy, CSV escaping and restricted files. Passing these locally does not validate the hosting account configuration.

Browser checks require Python Playwright and Chromium:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/browser-smoke.py --url http://127.0.0.1:5189
```

To include administrator and real order flow checks, pass `--admin-env-file /private/path/to/local-test.env` containing the temporary test `ADMIN_PASSWORD`. Keep this file outside the repository and restrict its permissions. Those checks modify inventory and create/cancel a test order. The browser suite only accepts loopback servers; it is not a production testing tool.

## Day-to-day operation

Open `admin.html` to check orders, confirm customers, update stock and advance fulfillment status. Customer order tracking reflects saved status changes. Canceling an eligible order restores its reserved stock once. A shipped order cannot be canceled through the normal status flow.

Back up the MySQL database and private configuration through your host, and test restoring to a separate database. Restrict access to exports and backups because they contain customer information. Set a retention period for order records and host logs, publish the relevant privacy details and keep PHP/security updates current.
