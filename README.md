# RICHKID storefront

A responsive fashion storefront concept inspired by the overall look and shopping experience requested for richkidbd.com. Built with React, Vite, and Lucide icons. Product photography and fonts are served locally.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev -- --port 5173
```

Create and serve a production build:

```sh
npm run build
npm run preview -- --port 4173
```

## Shopping experience

- Responsive collections with category filters and price/name sorting.
- Live search, product details, size selection, and quantity controls.
- Wishlist and shopping bag persisted in browser local storage.
- Delivery totals and a free-delivery threshold in Bangladeshi taka.
- Validated demo checkout, order confirmation, and email signup feedback.
- Keyboard-accessible dialogs, focus handling, and mobile navigation.

The catalog lives in `src/catalog.js`; the UI is in `src/App.jsx` and `src/styles.css`. No secrets or external services are needed to run it.

Checkout and newsletter signup demonstrate the interface only. They do not send customer data, collect payment, or submit real orders. Production ordering, inventory, payment, customer support, and email services can be connected separately.

## Assets

Sample product images: [gs-images/forever](https://github.com/avinashdm/gs-images/tree/main/forever).
Editorial images: [Build-and-Deploy-Ecommerce-Website](https://github.com/tech2etc/Build-and-Deploy-Ecommerce-Website/tree/main/img).
Fonts: [Anton](https://fonts.google.com/specimen/Anton) and [DM Sans](https://fonts.google.com/specimen/DM+Sans), with their SIL Open Font License files in `public/fonts`.

This is an independent design concept, not the official richkidbd.com website. The reference domain was inaccessible during implementation, so the design follows the requested overall aesthetic and shopping experience rather than a verified copy of its layout.
