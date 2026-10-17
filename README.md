# RICHKID storefront

A responsive fashion storefront concept inspired by the overall look and shopping experience requested for richkidbd.com. Built with HTML, CSS, and plain JavaScript. Product photography, fonts, and SVG icons are included locally; there are no frameworks, package dependencies, or build steps.

## Run locally

Open `index.html` directly in your browser. The storefront also works offline after the files are downloaded.

For an optional local server, run this command from the repository directory:

```sh
python3 -m http.server 5173 --bind 0.0.0.0
```

The server serves the project on port 5173. Node.js and npm are not required. Deploy the repository files to any static website host.

## Shopping experience

- Responsive collections with category filters and price/name sorting.
- Live search, product details, size selection, and quantity controls.
- Wishlist and shopping bag persisted in browser local storage.
- Delivery totals and a free-delivery threshold in Bangladeshi taka.
- Validated demo checkout, order confirmation, and email signup feedback.
- Keyboard-accessible dialogs, focus handling, and mobile navigation.

The page structure lives in `index.html`, styling in `styles.css`, interactions in `script.js`, and sample products in `catalog.js`. Images and fonts live in `images/` and `fonts/`. No secrets or external services are needed to run it. Wishlist and bag persistence depends on your browser allowing local storage.

Checkout and newsletter signup demonstrate the interface only. They do not send customer data, collect payment, or submit real orders. Production ordering, inventory, payment, customer support, and email services can be connected separately.

## Assets

Sample product images: [gs-images/forever](https://github.com/avinashdm/gs-images/tree/main/forever).
Editorial images: [Build-and-Deploy-Ecommerce-Website](https://github.com/tech2etc/Build-and-Deploy-Ecommerce-Website/tree/main/img).
Fonts: [Anton](https://fonts.google.com/specimen/Anton) and [DM Sans](https://fonts.google.com/specimen/DM+Sans), with their SIL Open Font License files in `fonts/`.

This is an independent design concept, not the official richkidbd.com website. The reference domain was inaccessible during implementation, so the design follows the requested overall aesthetic and shopping experience rather than a verified copy of its layout.
