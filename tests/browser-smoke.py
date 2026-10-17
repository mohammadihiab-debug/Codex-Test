#!/usr/bin/env python3
"""Browser regression checks against a disposable local PHP/MySQL store.

Install Python Playwright, start the documented development server, then run:
  python tests/browser-smoke.py --url http://127.0.0.1:5173
  python tests/browser-smoke.py --url http://127.0.0.1:5173 \
    --admin-env-file /private/path/to/local-test.env

The administrator option exercises inventory and creates/cancels a test order.
This suite intentionally refuses all non-loopback hosts. Never use production
database bindings for a local test server. Password values are never printed.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


class Checks:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0

    def run(self, name, callback):
        try:
            callback()
            self.passed += 1
            print("PASS " + name, flush=True)
            return True
        except Exception as error:
            self.failed += 1
            # Browser assertion messages contain DOM text, never credentials.
            detail = str(error).split("Call log:", 1)[0].strip()[:500]
            print("FAIL " + name + ": " + detail, flush=True)
            return False

    def skip(self, name):
        self.skipped += 1
        print("SKIP " + name, flush=True)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def admin_password(path):
    if not path:
        return ""
    for line in Path(path).read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = shlex.split(line)
        for part in parts:
            if part.startswith("ADMIN_PASSWORD="):
                return part.split("=", 1)[1]
    raise ValueError("The local test environment file needs ADMIN_PASSWORD.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:5173")
    parser.add_argument("--admin-env-file", help="Private local-test env file; never committed")
    parser.add_argument("--screenshots", default="/tmp/richkid-browser-checks")
    args = parser.parse_args()
    parsed = urlsplit(args.url)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        parser.error("Only loopback test servers are permitted; never run this against a customer store.")
    base = args.url.rstrip("/") + "/"
    password = admin_password(args.admin_env_file)
    shots = Path(args.screenshots)
    shots.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    errors = []

    with sync_playwright() as playwright:
        executable = os.environ.get("CHROMIUM_EXECUTABLE") or shutil.which("chromium") or shutil.which("chromium-browser")
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page.set_default_timeout(6000)
        page.on("pageerror", lambda error: errors.append(str(error)))

        def visit(path):
            response = page.goto(base + path, wait_until="networkidle")
            require(response is not None and response.status < 400, "Page returned an HTTP error")
            page.locator(".page-loading").wait_for(state="hidden") if page.locator(".page-loading").count() else None
            return response

        def no_overflow():
            sizes = page.evaluate("({viewport: innerWidth, content: document.documentElement.scrollWidth})")
            require(sizes["content"] <= sizes["viewport"] + 1, "Horizontal overflow: " + str(sizes))

        def home_navigation():
            visit("index.html")
            expect(page.locator("h1")).to_contain_text("EVERYDAY")
            expect(page.locator("#product-grid .product-card")).to_have_count(12)
            page.locator(".desktop-nav").get_by_role("link", name="T-shirts", exact=True).click()
            page.wait_for_url("**/shop.html?category=T-Shirts")
            expect(page.locator("#product-grid .product-card")).to_have_count(5)
            require(all(x == "T-Shirts" for x in page.locator("#product-grid .product-category").all_text_contents()), "Category navigation shows unrelated products")

        checks.run("Home links open the correct product collection", home_navigation)

        def sorting():
            visit("shop.html")
            page.get_by_label("Sort products", exact=True).select_option("price-high")
            prices = page.locator("#product-grid .product-price").evaluate_all("els => els.map(el => Number(el.childNodes[0].textContent.replace(/[^0-9]/g, '')))")
            require(len(prices) == 12 and prices == sorted(prices, reverse=True), "Descending prices are out of order")
            page.get_by_label("Sort products", exact=True).select_option("price-low")
            prices = page.locator("#product-grid .product-price").evaluate_all("els => els.map(el => Number(el.childNodes[0].textContent.replace(/[^0-9]/g, '')))")
            require(prices == sorted(prices), "Ascending prices are out of order")

        checks.run("Shop price sorting works in both directions", sorting)

        def sale_collection():
            visit("shop.html?sale=1")
            cards = page.locator("#product-grid .product-card")
            require(cards.count() > 0, "No sale products shown")
            require(cards.count() == page.locator("#product-grid .original-price").count(), "Sale collection includes non-sale products")

        checks.run("Good deals contains discounted products only", sale_collection)

        def search_and_escape():
            visit("search.html?q=Oxford")
            expect(page.locator("#search-page-content .product-card")).to_have_count(1)
            expect(page.locator("#search-page-content")).to_contain_text("The Everyday Oxford")
            page.locator("#page-search-input").fill('<img src=x onerror="window.__searchXss=1">')
            page.locator("#page-search-form").get_by_role("button", name="Search", exact=True).click()
            page.wait_for_load_state("networkidle")
            require(page.evaluate("window.__searchXss !== 1"), "Search input executed markup")
            expect(page.locator("#search-page-content .product-card")).to_have_count(0)
            visit("search.html?q=olive")
            require(page.locator("#search-page-content .product-card").count() > 0, "Color search omitted matching products")

        checks.run("Search uses its query, handles empty results, and escapes markup", search_and_escape)

        def invalid_product():
            visit("product.html?id=999999")
            require(page.locator("#product-page-content").inner_text().strip() != "", "No missing-product explanation")
            expect(page.locator("#product-page-content")).not_to_contain_text("Getting everything ready")
            expect(page.locator("#product-page-content").get_by_role("link", name=re.compile("collection|products|shop", re.I))).to_be_visible()

        checks.run("Unknown product has a usable recovery page", invalid_product)

        def wishlist():
            visit("shop.html")
            page.locator('[data-action="save"][data-id="2"]').click()
            page.locator("#wishlist-button").click()
            page.wait_for_url("**/wishlist.html")
            expect(page.locator("#wishlist-page-content .product-card")).to_have_count(1)
            expect(page.locator("#wishlist-page-content")).to_contain_text("Essential Cotton Tee")
            page.reload(wait_until="networkidle")
            expect(page.locator("#wishlist-page-content .product-card")).to_have_count(1)
            page.locator('[data-action="save"][data-id="2"]').click()
            expect(page.locator("#wishlist-page-content .product-card")).to_have_count(0)

        checks.run("Wishlist saves, persists across reload, and removes products", wishlist)

        # More workflows below use independent pages and the real local API.
        def support_pages():
            for name in ["about", "shipping", "returns", "privacy", "terms", "faq", "contact"]:
                visit(name + ".html")
                expect(page.locator("main h1")).to_be_visible()
                expect(page.locator("main")).not_to_contain_text("Getting everything ready")
                no_overflow()

        checks.run("All support and policy pages render on desktop", support_pages)

        def broken_assets():
            visit("shop.html")
            images = page.locator("img").evaluate_all("els => els.filter(el => !el.complete || el.naturalWidth === 0).map(el => el.getAttribute('src'))")
            require(not images, "Broken images: " + ", ".join(images))

        checks.run("Collection product imagery loads", broken_assets)

        def private_resources():
            for path in ["api/config.local.php", "api/config.example.php", "api/bootstrap.php", "api/schema.sql", ".git/config", ".env", "tests/browser-smoke.py"]:
                response = context.request.get(base + path)
                require(response.status in (403, 404), "Private file accessible: " + path + " (HTTP " + str(response.status) + ")")

        checks.run("Private configuration, database schema, and repository data are inaccessible", private_resources)

        def unauthenticated_admin():
            for path in ["api/admin/orders", "api/admin/inventory", "api/admin/status", "api/admin/orders.csv"]:
                response = context.request.get(base + path)
                require(response.status == 401, "Administrator endpoint allowed anonymous access: " + path)

        checks.run("Anonymous visitors cannot read orders, inventory management, or exports", unauthenticated_admin)

        def contact_without_credentials():
            visit("contact.html")
            expect(page.locator("[data-contact-email]")).not_to_have_attribute("href", re.compile("^mailto:"))
            page.locator("#contact-name").fill("Local browser test")
            page.locator("#contact-email").fill("browser@example.invalid")
            page.locator("#contact-message").fill("This local test must not send a real email.")
            page.locator("#contact-form").get_by_role("button", name="Prepare email").click()
            expect(page.locator("#contact-form-message")).to_contain_text("No message has been sent")

        checks.run("Unconfigured contact form honestly reports that no email was sent", contact_without_credentials)

        admin = None
        admin_context = None
        csrf = ""
        original_stock = {}
        order_reference = ""
        phone = "01712345678"

        if password:
            admin_context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
            admin = admin_context.new_page()
            admin.set_default_timeout(6000)
            admin.on("pageerror", lambda error: errors.append(str(error)))

            def sign_in():
                nonlocal csrf, original_stock
                admin.goto(base + "admin.html", wait_until="networkidle")
                expect(admin.locator("#login-panel")).to_be_visible()
                expect(admin.locator("#dashboard")).to_be_hidden()
                admin.locator("#admin-password").fill(password)
                admin.locator("#login-button").click()
                expect(admin.locator("#dashboard")).to_be_visible()
                expect(admin.locator("#readiness-summary")).to_contain_text("accepting orders")
                session = admin_context.request.get(base + "api/admin/session").json()
                csrf = session["csrfToken"]
                catalog = admin_context.request.get(base + "api/admin/inventory").json()["products"]
                product = next(product for product in catalog if product["id"] == 2)
                original_stock = {size: product["stock"][size] for size in ["S", "M"]}
                require(all(isinstance(value, int) for value in original_stock.values()), "Inventory did not return integer stock")

            authenticated = checks.run("Administrator signs in and sees live database readiness", sign_in)

            def update_inventory():
                admin.locator('[data-section="inventory"]').click()
                for size, quantity in [("S", 0), ("M", 2)]:
                    admin.locator("#stock-2-" + size).fill(str(quantity))
                expect(admin.locator("#inventory-save")).to_be_enabled()
                admin.locator("#inventory-save").click()
                expect(admin.locator("#notification")).to_have_text("Stock changes saved.")
                admin.locator("#inventory-refresh").click()
                expect(admin.locator("#stock-2-M")).to_have_value("2")
                expect(admin.locator("#stock-2-S")).to_have_value("0")

            stocked = checks.run("Administrator stock changes persist in MySQL", update_inventory) if authenticated else False

            def product_sizes():
                visit("product.html?id=2")
                expect(page.locator("main h1")).to_have_text("Essential Cotton Tee")
                expect(page.locator('[data-page-action="size"][data-size="S"]')).to_be_disabled()
                page.locator("#page-product-form").get_by_role("button", name="Add to bag").click()
                expect(page.locator("#product-form-message")).to_contain_text("select your size")
                require(page.locator(".bag-count").inner_text() == "0", "Missing-size form added a bag item")
                page.locator('[data-page-action="size"][data-size="M"]').click()
                expect(page.locator("#page-product-quantity")).to_have_attribute("max", "2")
                page.locator("#page-product-quantity").fill("3")
                page.locator("#page-product-form").get_by_role("button", name="Add to bag").click()
                require(page.locator("#modal-root [role=dialog]").count() == 0, "Above-stock quantity was added")
                page.locator("#page-product-quantity").fill("2")
                page.locator("#page-product-form").get_by_role("button", name="Add to bag").click()
                expect(page.locator("#modal-root [role=dialog]")).to_be_visible()
                expect(page.locator(".bag-count")).to_have_text("2")
                page.keyboard.press("Escape")
                expect(page.locator("#modal-root [role=dialog]")).to_have_count(0)
                page.screenshot(path=str(shots / "product-desktop.png"), full_page=True)

            bag_ready = checks.run("Product sizes, sold-out controls, quantity caps, and add-to-bag work", product_sizes) if stocked else False

            def cart_controls():
                visit("cart.html")
                expect(page.locator(".page-cart-item")).to_have_count(1)
                expect(page.get_by_role("button", name="Increase Essential Cotton Tee quantity", exact=True)).to_be_disabled()
                page.get_by_role("button", name="Decrease Essential Cotton Tee quantity", exact=True).click()
                expect(page.locator(".bag-count")).to_have_text("1")
                page.get_by_role("button", name="Increase Essential Cotton Tee quantity", exact=True).click()
                expect(page.locator(".bag-count")).to_have_text("2")
                page.get_by_label("Estimate delivery").select_option("outside")
                expect(page.locator(".page-order-summary .cart-total")).to_contain_text("1,510")
                page.reload(wait_until="networkidle")
                expect(page.locator(".bag-count")).to_have_text("2")
                expect(page.locator(".page-cart-item")).to_have_count(1)

            if bag_ready:
                checks.run("Cart updates quantities, caps stock, estimates delivery, and persists", cart_controls)

            def checkout_closed():
                def pause_catalog(route):
                    response = route.fetch()
                    data = response.json()
                    data["orderingEnabled"] = False
                    route.fulfill(response=response, json=data)
                page.route("**/api/catalog", pause_catalog)
                try:
                    visit("checkout.html")
                    expect(page.locator("#place-order-button")).to_be_disabled()
                    expect(page.locator("#checkout-readiness")).to_contain_text("not open yet")
                    expect(page.locator(".bag-count")).to_have_text("2")
                finally:
                    page.unroute("**/api/catalog", pause_catalog)

            if bag_ready:
                checks.run("Checkout stays disabled when the store is paused", checkout_closed)

            def fill_checkout(target=page):
                target.locator('[name="name"]').fill("Local browser test")
                target.locator('[name="phone"]').fill(phone)
                target.locator('[name="email"]').fill("browser@example.invalid")
                target.locator('[name="address"]').fill("123 Test Road, local disposable database only")
                target.locator('[name="city"]').fill("Dhaka")
                target.locator('[name="terms"]').check()

            def failed_checkout():
                page.route("**/api/orders", lambda route: route.fulfill(status=503, json={"error": "Temporary local test failure", "code": "LOCAL_TEST"}))
                try:
                    visit("checkout.html")
                    expect(page.locator("#place-order-button")).to_be_enabled()
                    fill_checkout()
                    page.locator("#place-order-button").click()
                    expect(page.locator("#checkout-error")).to_contain_text("Your bag has not been cleared")
                    expect(page.locator(".bag-count")).to_have_text("2")
                    require("checkout.html" in page.url, "Failed order showed a confirmation")
                    require(page.evaluate("sessionStorage.getItem('richkid-receipt')") is None, "Failed order saved a receipt")
                finally:
                    page.unroute("**/api/orders")

            if bag_ready:
                checks.run("Failed order preserves the bag and never shows a false confirmation", failed_checkout)

            def authoritative_prices():
                response = context.request.post(base + "api/quote", data={"items": [{"id": 2, "size": "M", "quantity": 2, "price": 1}], "deliveryZone": "dhaka", "subtotal": 2, "shipping": 0, "total": 2})
                require(response.ok, "Server rejected a valid quote")
                quote = response.json()
                require(quote["subtotal"] == 1380 and quote["shipping"] == 80 and quote["total"] == 1460, "Server trusted browser-supplied pricing")

            if bag_ready:
                checks.run("Server ignores tampered prices and calculates the authoritative total", authoritative_prices)

            def real_order():
                nonlocal order_reference
                visit("checkout.html")
                expect(page.locator("#place-order-button")).to_be_enabled()
                fill_checkout()
                page.screenshot(path=str(shots / "checkout-desktop.png"), full_page=True)
                with page.expect_response(lambda response: "/api/orders" in response.url and response.request.method == "POST") as pending:
                    page.locator("#place-order-button").click()
                response = pending.value
                require(response.status == 201, "A new order was not persisted")
                page.wait_for_url("**/order-confirmation.html?reference=*")
                expect(page.locator("#confirmation-page-content")).to_contain_text("We have your order")
                expect(page.locator(".bag-count")).to_have_text("0")
                receipt = json.loads(page.evaluate("sessionStorage.getItem('richkid-receipt')"))
                order_reference = receipt["reference"]
                require(order_reference in page.url, "Confirmation URL does not match its receipt")
                require("customer" not in receipt and phone not in json.dumps(receipt) and "browser@example.invalid" not in json.dumps(receipt), "Receipt unnecessarily stores private customer details")
                stored = admin_context.request.get(base + "api/admin/orders").json()["orders"]
                require(any(order["reference"] == order_reference and order["total"] == 1460 for order in stored), "Order absent from persisted admin list")
                product = next(product for product in admin_context.request.get(base + "api/admin/inventory").json()["products"] if product["id"] == 2)
                require(product["stock"]["M"] == 0, "Order did not reserve its exact inventory")

            persisted = checks.run("Real checkout persists an order, reserves stock, clears bag, and shows its receipt", real_order) if bag_ready else False

            def order_tracking():
                visit("order-status.html?reference=" + order_reference)
                expect(page.locator("#order-reference")).to_have_value(order_reference)
                page.locator("#order-phone").fill("01799999999")
                page.locator("#order-status-form").get_by_role("button", name="Find my order").click()
                expect(page.locator("#order-status-result")).to_contain_text("No order matches")
                expect(page.locator("#order-status-result .page-status-card")).to_have_count(0)
                page.locator("#order-phone").fill(phone)
                page.locator("#order-status-form").get_by_role("button", name="Find my order").click()
                expect(page.locator("#order-status-result .page-status-card h2")).to_have_text("Pending")
                expect(page.locator("#order-status-result")).to_contain_text("Essential Cotton Tee")
                require("browser@example.invalid" not in page.locator("#order-status-result").inner_text(), "Public tracking exposes customer email")

            if persisted:
                checks.run("Order tracking requires the matching reference and phone", order_tracking)

            def order_admin():
                admin.locator('[data-section="orders"]').click()
                admin.locator("#orders-refresh").click()
                admin.get_by_role("button", name="View order " + order_reference, exact=True).click()
                expect(admin.locator("#order-detail")).to_contain_text("Local browser test")
                admin.locator("#detail-status").select_option("confirmed")
                admin.locator("#detail-note").fill('<img src=x onerror="window.__adminXss=1"> local test note')
                admin.get_by_role("button", name="Save order update").click()
                expect(admin.locator("#order-detail .status-badge")).to_have_text("Confirmed")
                expect(admin.locator("#order-detail .notes-list")).to_contain_text("<img src=x")
                require(admin.evaluate("window.__adminXss !== 1"), "Order note executed markup")
                admin.locator("#detail-status").select_option("cancelled")
                admin.once("dialog", lambda dialog: dialog.accept())
                admin.get_by_role("button", name="Save order update").click()
                expect(admin.locator("#order-detail .status-badge")).to_have_text("Cancelled")
                expect(admin.locator("#detail-status")).to_have_count(0)
                product = next(product for product in admin_context.request.get(base + "api/admin/inventory").json()["products"] if product["id"] == 2)
                require(product["stock"]["M"] == 2, "Cancellation failed to restore reserved inventory")
                admin.locator("#order-dialog-close").click()

            if persisted:
                checks.run("Admin updates status, safely displays notes, and cancellation restores stock", order_admin)

            def csv_export():
                with admin.expect_download() as pending:
                    admin.locator("#export-button").click()
                download = pending.value
                require(download.failure() is None, "Order CSV did not download")
                contents = Path(download.path()).read_text(encoding="utf-8-sig")
                require(order_reference in contents, "Saved order is absent from CSV")

            if persisted:
                checks.run("Administrator can export saved orders as CSV", csv_export)

            def mobile_admin():
                admin.set_viewport_size({"width": 390, "height": 844})
                for section in ["orders", "inventory", "readiness"]:
                    admin.locator('[data-section="' + section + '"]').click()
                    require(admin.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Mobile admin overflows in " + section)
                admin.screenshot(path=str(shots / "admin-mobile.png"), full_page=True)

            if authenticated:
                checks.run("Admin orders, inventory, and readiness fit a mobile screen", mobile_admin)

            def retry_after_lost_response():
                retry_context = browser.new_context(viewport={"width": 1440, "height": 1000})
                retry_page = retry_context.new_page()
                retry_page.set_default_timeout(6000)
                lost = {}
                request_keys = []
                before_orders = admin_context.request.get(base + "api/admin/orders").json()["total"]
                before_product = next(product for product in admin_context.request.get(base + "api/admin/inventory").json()["products"] if product["id"] == 2)
                before_stock = before_product["stock"]["L"]

                def discard_saved_response(route):
                    request_keys.append(route.request.headers.get("idempotency-key"))
                    response = route.fetch()
                    require(response.status == 201, "Lost-response fixture did not create an order")
                    lost["reference"] = response.json()["order"]["reference"]
                    route.abort("failed")

                try:
                    retry_page.goto(base + "index.html", wait_until="networkidle")
                    retry_page.evaluate("localStorage.setItem('richkid-bag', JSON.stringify([{id:2,size:'L',quantity:1}]))")
                    retry_page.route("**/api/orders", discard_saved_response)
                    retry_page.goto(base + "checkout.html", wait_until="networkidle")
                    expect(retry_page.locator("#place-order-button")).to_be_enabled()
                    fill_checkout(retry_page)
                    retry_page.locator("#place-order-button").click()
                    expect(retry_page.locator("#checkout-error")).to_contain_text("Your bag has not been cleared")
                    expect(retry_page.locator(".bag-count")).to_have_text("1")
                    pending_key = json.loads(retry_page.evaluate("sessionStorage.getItem('richkid-pending-checkout')"))
                    require(pending_key["key"] == request_keys[0], "Failed request did not preserve its retry key")
                    require(set(pending_key) == {"fingerprint", "key"}, "Retry state stores customer details")
                    retry_page.unroute("**/api/orders", discard_saved_response)
                    retry_page.reload(wait_until="networkidle")
                    expect(retry_page.locator("#place-order-button")).to_be_enabled()
                    fill_checkout(retry_page)
                    retry_page.on("request", lambda request: request_keys.append(request.headers.get("idempotency-key")) if request.url.endswith("/api/orders") and request.method == "POST" else None)
                    with retry_page.expect_response(lambda response: response.url.endswith("/api/orders") and response.request.method == "POST") as pending:
                        retry_page.locator("#place-order-button").click()
                    require(pending.value.status == 200, "Retry did not return the original saved order")
                    retry_page.wait_for_url("**/order-confirmation.html?reference=*")
                    receipt = json.loads(retry_page.evaluate("sessionStorage.getItem('richkid-receipt')"))
                    require(receipt["reference"] == lost["reference"], "Retry created another order reference")
                    require(len(request_keys) == 2 and request_keys[0] == request_keys[1], "Reload used a different checkout key")
                    require(retry_page.evaluate("sessionStorage.getItem('richkid-pending-checkout')") is None, "Successful retry retained pending checkout state")
                    require(admin_context.request.get(base + "api/admin/orders").json()["total"] == before_orders + 1, "Retry duplicated the order in MySQL")
                    after_product = next(product for product in admin_context.request.get(base + "api/admin/inventory").json()["products"] if product["id"] == 2)
                    require(after_product["stock"]["L"] == before_stock - 1, "Retry reserved stock twice")
                finally:
                    if lost.get("reference"):
                        response = admin_context.request.patch(base + "api/admin/orders/" + lost["reference"], headers={"X-CSRF-Token": csrf}, data={"status": "cancelled", "note": "Local lost-response browser test cleanup"})
                        require(response.ok, "Could not cancel lost-response fixture order")
                    retry_context.close()

            if authenticated:
                checks.run("Lost order response plus page reload retries the same saved order without double stock reservation", retry_after_lost_response)

            def cleanup_and_logout():
                if original_stock and csrf:
                    if order_reference:
                        orders = admin_context.request.get(base + "api/admin/orders").json()["orders"]
                        order = next((item for item in orders if item["reference"] == order_reference), None)
                        if order and order["status"] in ("pending", "confirmed", "processing"):
                            response = admin_context.request.patch(base + "api/admin/orders/" + order_reference, headers={"X-CSRF-Token": csrf}, data={"status": "cancelled", "note": "Local browser test cleanup"})
                            require(response.ok, "Could not cancel the local test order during cleanup")
                    response = admin_context.request.patch(base + "api/admin/inventory", headers={"X-CSRF-Token": csrf}, data={"items": [{"id": 2, "size": size, "quantity": quantity} for size, quantity in original_stock.items()]})
                    require(response.ok, "Could not restore local test inventory")
                admin.locator("#logout-button").click()
                expect(admin.locator("#login-panel")).to_be_visible()
                expect(admin.locator("#dashboard")).to_be_hidden()
                response = admin_context.request.get(base + "api/admin/orders")
                require(response.status == 401, "Server session remained usable after sign out")

            if authenticated:
                checks.run("Local test inventory is restored and sign-out invalidates the server session", cleanup_and_logout)
        else:
            checks.skip("Real order, stock, and admin workflows require --admin-env-file with disposable local bindings")

        def unknown_confirmation():
            visit("order-confirmation.html?reference=RK-UNKNOWN-123456789012")
            expect(page.locator("#confirmation-page-content")).not_to_contain_text("We have your order")
            expect(page.locator("#confirmation-page-content").get_by_role("link", name="Check order status", exact=True)).to_be_visible()

        checks.run("An unverified confirmation URL does not claim an order was received", unknown_confirmation)

        def mobile_store():
            page.set_viewport_size({"width": 390, "height": 844})
            for name in ["index", "shop", "search", "product.html?id=2", "wishlist", "cart", "checkout", "order-status", "order-confirmation", "about", "contact", "shipping", "returns", "privacy", "terms", "faq", "404"]:
                path = name if ".html" in name else name + ".html"
                visit(path)
                no_overflow()
                expect(page.locator("main")).to_be_visible()
            visit("product.html?id=2")
            page.screenshot(path=str(shots / "product-mobile.png"), full_page=True)
            page.get_by_role("button", name="Open navigation", exact=True).click()
            expect(page.get_by_role("navigation", name="Mobile navigation", exact=True)).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.locator("#modal-root [role=dialog]")).to_have_count(0)

        checks.run("All 17 storefront pages fit mobile and mobile navigation opens and closes", mobile_store)

        # Frontend failures should be visible independently of a missing database.
        checks.run("No uncaught browser JavaScript errors", lambda: require(not errors, "; ".join(errors[:3])))

        browser.close()

    print("\nResult: %d passed, %d failed, %d skipped" % (checks.passed, checks.failed, checks.skipped))
    return 1 if checks.failed else 0


if __name__ == "__main__":
    sys.exit(main())
