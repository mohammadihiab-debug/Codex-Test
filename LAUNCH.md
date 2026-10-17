# What remains before your first sale

The code includes the storefront, live PHP/MySQL cash on delivery checkout and administrator tools. Your hosting account still needs the application files, database and private settings. A repository push alone does not deploy the website.

Use **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full cPanel steps for **https://rojoniful.orioleflow.com/**.

1. Upload the application into the subdomain's actual document root, including both `.htaccess` files. Select PHP 8.2+ with PDO MySQL and enable HTTPS plus the HTTPS redirect.
2. Create the MySQL database and user. Import `api/schema.sql` in phpMyAdmin, or run the CLI installer after configuring the connection.
3. Copy `api/config.example.php` to `api/config.local.php`. Enter the database settings privately, generate your own administrator password hash and set the exact origin `https://rojoniful.orioleflow.com`. Leave `store_live` false while setting up. There is no default admin password.
4. Fill in your real store email, phone and address in `store-config.js`. Confirm the delivery charges and your shipping, exchange and privacy terms; update the policy text where needed and mark `policiesConfirmed: true` after review. The sample catalog is accepted for now.
5. Sign in at `/admin.html` and enter real stock by product and size. All stock begins at zero. Confirm the listed products, photos, sizes and prices are what you intend to sell.
6. Check `/api/health`, page navigation and administrator access on the host. When database, stock, contacts and policies are ready, set `store_live` true. Confirm `orderingEnabled` is true, then place and cancel one owner test order and check its stock and tracking.
7. Start accepting customer orders only after that hosted order flow works. Keep monitoring the dashboard and arrange courier fulfillment manually.

This release collects **cash on delivery orders**. Online bKash, Nagad and card payments, automatic courier booking, and email/SMS notifications are not connected. Contact messages open the visitor's email app for the visitor to send.

Do not run the automated test suite against your live database. Keep private configuration and database backups outside the public web directory. Deployment and a live transaction on your hosting account must be verified there; local test results do not establish that the host is ready.
