/* Full storefront pages. Orders are confirmed only after the PHP API saves them. */
(() => {
  'use strict';
  const store = window.RichkidStore;
  if (!store) return;
  const { state, products, formatPrice: money, escapeHTML: e, icon, config } = store;
  const page = document.body.dataset.page || 'home';
  const params = new URLSearchParams(location.search);
  let selectedSize = '';
  let productQuantity = 1;
  let quote = null;
  let quoteVersion = 0;
  let submitting = false;
  let idempotencyKey = '';

  const empty = (title, text, link = 'shop.html', label = 'Explore the collection') => `<div class="page-empty">${icon('bag', 40)}<h2>${e(title)}</h2><p>${e(text)}</p><a class="button button-dark" href="${link}">${e(label)} ${icon('arrow-right', 17)}</a></div>`;
  const itemsPayload = () => state.cart.map(({ id, size, quantity }) => ({ id, size, quantity }));
  const deliveryLabel = zone => zone === 'outside' ? 'Outside Dhaka' : 'Inside Dhaka';

  function renderProduct() {
    const root = document.getElementById('product-page-content');
    if (!root) return;
    const product = store.findProduct(params.get('id'));
    if (!product) { root.innerHTML = empty('This piece could not be found.', 'Explore the collection to find your next favorite.'); document.title = 'Product not found — ' + (config.name || 'RICHKID'); return; }
    document.title = product.name + ' — ' + (config.name || 'RICHKID');
    const images = [...new Set(product.images?.length ? product.images : [product.image])];
    const available = selectedSize ? store.availableStock(product, selectedSize) : null;
    root.innerHTML = `<div class="page-product-layout"><div class="page-product-gallery"><img id="product-main-image" src="${e(product.image)}" alt="${e(product.name)}" fetchpriority="high">${images.length > 1 ? `<div class="page-product-thumbnails">${images.map((image, index) => `<button type="button" data-page-action="image" data-image="${e(image)}" aria-label="View product photo ${index + 1}"><img src="${e(image)}" alt=""></button>`).join('')}</div>` : ''}</div>
      <div class="page-product-info"><p class="section-label">${e(product.category)}</p><h1>${e(product.name)}</h1><p class="page-product-price">${money(product.price)} ${product.originalPrice ? `<span class="original-price">${money(product.originalPrice)}</span>` : ''}</p><p>${e(product.description)}</p>
      <form id="page-product-form" class="page-form"><div class="size-label"><span>Select size${selectedSize ? ' — ' + e(selectedSize) : ''}</span><a href="faq.html#sizing">Size guide</a></div><div class="size-options">${product.sizes.map(size => `<button type="button" class="size-option ${selectedSize === size ? 'selected' : ''}" data-page-action="size" data-size="${e(size)}" aria-pressed="${selectedSize === size}" ${store.availableStock(product, size) === 0 ? 'disabled' : ''}>${e(size)}</button>`).join('')}</div><p class="page-stock-note">${available === null ? 'Choose your size for the right fit.' : available > 0 ? `${available} available in size ${e(selectedSize)}.` : 'This size is sold out.'}</p><label class="page-field">Quantity<input id="page-product-quantity" name="quantity" type="number" min="1" max="${available === null ? 10 : Math.min(10, available)}" value="${productQuantity}" required inputmode="numeric"></label><p id="product-form-message" class="page-form-message" role="alert" hidden></p><button class="button button-dark button-full" type="submit">Add to bag ${icon('bag', 18)}</button></form><button class="text-link" data-action="save" data-id="${product.id}">${icon('heart', 17)} ${state.saved.includes(product.id) ? 'Saved to your wishlist' : 'Save to your wishlist'}</button>
      <div class="page-product-benefits"><p>${icon('truck', 18)} Delivery charge is confirmed at checkout.</p><p>${icon('shield', 18)} Cash on delivery when the store is open.</p><p>${icon('rotate', 18)} <a href="returns.html">Read our exchange policy</a></p></div><details><summary>Product details & care</summary><p>${e(product.description)}</p><p>Follow the care label on your garment. Wash similar colors together and avoid bleach.</p></details></div></div><section class="page-related"><div class="section-heading"><h2>You might also like</h2><a class="text-link" href="shop.html">Shop all ${icon('arrow-up-right', 17)}</a></div><div class="product-grid">${products.filter(item => item.id !== product.id).slice(0, 4).map(store.productCard).join('')}</div></section>`;
  }

  function cartLines(bag) {
    return bag.items.map(item => `<article class="page-cart-item"><a href="product.html?id=${item.id}"><img class="page-item-image" src="${e(item.product.image)}" alt="${e(item.product.name)}"></a><div class="page-item-info"><span class="product-category">${e(item.product.category)}</span><h2><a href="product.html?id=${item.id}">${e(item.product.name)}</a></h2><p>Size: ${e(item.size)} · ${money(item.product.price)} each</p><div class="page-item-actions"><div class="quantity-control"><button type="button" data-action="bag-minus" data-id="${item.id}" data-size="${e(item.size)}" aria-label="Decrease ${e(item.product.name)} quantity">${icon('minus', 14)}</button><span>${item.quantity}</span><button type="button" data-action="bag-plus" data-id="${item.id}" data-size="${e(item.size)}" aria-label="Increase ${e(item.product.name)} quantity" ${item.quantity >= Math.min(10, store.availableStock(item.product, item.size) ?? 10) ? 'disabled' : ''}>${icon('plus', 14)}</button></div><button class="text-link" type="button" data-action="remove" data-id="${item.id}" data-size="${e(item.size)}">Remove ${icon('trash', 14)}</button></div></div><strong class="page-item-total">${money(item.quantity * item.product.price)}</strong></article>`).join('');
  }

  function summary(bag, checkout = false) {
    const subtotal = quote?.subtotal ?? bag.subtotal;
    const shipping = quote?.shipping ?? bag.delivery;
    const total = quote?.total ?? bag.total;
    return `<h2>Order summary</h2><div class="cart-totals"><span>Subtotal (${bag.count} items)</span><strong>${money(subtotal)}</strong></div><div class="cart-totals"><span>${checkout ? deliveryLabel(state.deliveryZone) + ' delivery' : 'Estimated delivery'}</span><span>${shipping ? money(shipping) : 'Free'}</span></div><div class="cart-total"><span>Total</span><strong>${money(total)}</strong></div>${checkout ? '<p class="page-summary-note">Pay cash when your order is delivered. No online payment is collected.</p>' : `<label class="page-field">Estimate delivery<select id="cart-delivery-zone"><option value="dhaka" ${state.deliveryZone === 'dhaka' ? 'selected' : ''}>Inside Dhaka</option><option value="outside" ${state.deliveryZone === 'outside' ? 'selected' : ''}>Outside Dhaka</option></select></label><a class="button button-dark button-full" href="checkout.html">Continue to checkout ${icon('arrow-right', 18)}</a><a class="text-link" href="shop.html">Continue shopping</a><p class="page-summary-note">Free delivery on merchandise orders of ${money(state.shipping.freeThreshold)} or more.</p>`}`;
  }

  function renderCart() {
    const root = document.getElementById('cart-page-content');
    if (!root) return;
    const bag = store.bagSummary();
    root.innerHTML = bag.items.length ? `<div class="page-cart-layout"><div class="page-cart-items">${cartLines(bag)}</div><aside class="page-order-summary">${summary(bag)}</aside></div>` : empty('Your bag is waiting.', 'Find an everyday essential you will want to wear on repeat.');
  }

  function renderWishlist() {
    const root = document.getElementById('wishlist-page-content');
    if (!root) return;
    const saved = products.filter(product => state.saved.includes(product.id));
    root.innerHTML = saved.length ? `<div class="product-grid">${saved.map(store.productCard).join('')}</div>` : empty('Save a little inspiration.', 'Tap the heart on any product to keep your favorites here.');
  }

  function renderSearch() {
    const root = document.getElementById('search-page-content');
    if (!root) return;
    const input = document.getElementById('page-search-input');
    const query = input.value.trim();
    const matches = products.filter(product => `${product.name} ${product.category} ${product.description} ${product.colors.map(color => color.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    root.innerHTML = `<p class="page-result-count">${query ? `${matches.length} results for “${e(query)}”` : 'Explore all essentials'}</p>${matches.length ? `<div class="product-grid">${matches.map(store.productCard).join('')}</div>` : empty('Nothing found just yet.', 'Try a category such as shirts, polos, tees, or trousers.')}`;
  }

  function renderCheckout() {
    const root = document.getElementById('checkout-page-content');
    if (!root) return;
    const bag = store.bagSummary();
    if (!bag.items.length) { root.innerHTML = empty('Your bag is empty.', 'Choose a product and size before checking out.'); return; }
    if (!document.getElementById('checkout-form')) {
      root.innerHTML = `<div class="page-checkout-layout"><form class="page-form page-checkout-form" id="checkout-form"><h2>Delivery details</h2><p>Enter the details we need to deliver your order.</p><label class="page-field">Full name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label><div class="page-field-row"><label class="page-field">Mobile number<input name="phone" type="tel" autocomplete="tel" placeholder="01XXXXXXXXX" pattern="(?:[+]?88)?01[3-9][0-9]{8}" required title="Enter a valid Bangladesh mobile number"></label><label class="page-field">Email (optional)<input name="email" type="email" autocomplete="email" maxlength="254"></label></div><label class="page-field">Full delivery address<textarea name="address" autocomplete="street-address" required minlength="10" maxlength="500" rows="3" placeholder="House, road, area, and nearby landmark"></textarea></label><div class="page-field-row"><label class="page-field">City / district<input name="city" autocomplete="address-level2" required minlength="2" maxlength="80"></label><label class="page-field">Delivery area<select name="deliveryZone" id="checkout-delivery-zone"><option value="dhaka">Inside Dhaka</option><option value="outside">Outside Dhaka</option></select></label></div><div class="checkout-payment">${icon('check-circle', 20)}<span><strong>Cash on delivery</strong><small>Pay the courier when your parcel arrives.</small></span></div><label class="page-check"><input name="terms" type="checkbox" required><span>I have read the <a href="terms.html" target="_blank" rel="noopener">terms</a>, <a href="shipping.html" target="_blank" rel="noopener">delivery policy</a>, and <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a>.</span></label><p id="checkout-readiness" class="page-form-message" role="status"></p><p id="checkout-error" class="page-form-message" role="alert" hidden></p><button type="submit" id="place-order-button" class="button button-dark button-full" disabled>Place order ${icon('arrow-right', 18)}</button></form><aside class="page-order-summary"><div id="checkout-summary">${summary(bag, true)}</div><div class="page-checkout-items">${bag.items.map(item => `<div class="page-checkout-item"><img src="${e(item.product.image)}" alt=""><span>${e(item.product.name)}<small>Size ${e(item.size)} · Qty ${item.quantity}</small></span><strong>${money(item.quantity * item.product.price)}</strong></div>`).join('')}</div></aside></div>`;
    }
    const readiness = document.getElementById('checkout-readiness');
    readiness.textContent = state.orderingEnabled ? 'Checking current prices and stock…' : 'Online ordering is not open yet. Your bag is saved; no order or payment will be submitted.';
    document.getElementById('place-order-button').disabled = true;
    refreshQuote();
  }

  async function refreshQuote() {
    if (page !== 'checkout' || !document.getElementById('checkout-summary')) return;
    const version = ++quoteVersion;
    const button = document.getElementById('place-order-button');
    button.disabled = true;
    quote = null;
    document.getElementById('checkout-summary').innerHTML = summary(store.bagSummary(), true);
    if (!state.orderingEnabled) return;
    try {
      const result = await store.api('quote', { method: 'POST', body: { items: itemsPayload(), deliveryZone: state.deliveryZone } });
      if (version !== quoteVersion) return;
      if (![result.subtotal, result.shipping, result.total].every(Number.isFinite)) throw new Error('The order total could not be verified.');
      quote = result;
      document.getElementById('checkout-summary').innerHTML = summary(store.bagSummary(), true);
      document.getElementById('checkout-readiness').textContent = 'Prices and stock checked. Your order will be submitted to the store.';
      button.disabled = submitting;
    } catch (error) {
      if (version !== quoteVersion) return;
      document.getElementById('checkout-readiness').textContent = error.message + ' Please review your bag and try again.';
    }
  }

  function makeIdempotencyKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function checkoutKey(payload) {
    if (!crypto.subtle) return idempotencyKey || makeIdempotencyKey();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      const previous = JSON.parse(sessionStorage.getItem('richkid-pending-checkout'));
      if (previous?.fingerprint === fingerprint && /^[a-f0-9]{48}$/.test(previous.key)) return previous.key;
    } catch { /* Only an opaque key and payload digest are retained, never delivery details. */ }
    const key = makeIdempotencyKey();
    try { sessionStorage.setItem('richkid-pending-checkout', JSON.stringify({ fingerprint, key })); } catch {}
    return key;
  }

  async function placeOrder(form) {
    if (submitting || !state.orderingEnabled || !quote || !form.reportValidity()) return;
    for (const name of ['name', 'address', 'city']) {
      const input = form.elements.namedItem(name);
      input.setCustomValidity(input.value.trim().length >= (name === 'address' ? 10 : 2) ? '' : 'Please complete this field.');
    }
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const payload = { items: itemsPayload(), customer: { name: values.get('name').trim(), phone: values.get('phone').trim(), email: values.get('email').trim(), address: values.get('address').trim(), city: values.get('city').trim(), deliveryZone: values.get('deliveryZone') } };
    if (!payload.items.length) return;
    const button = document.getElementById('place-order-button');
    const errorElement = document.getElementById('checkout-error');
    submitting = true;
    button.disabled = true;
    button.textContent = 'Submitting your order…';
    errorElement.hidden = true;
    try {
      idempotencyKey = await checkoutKey(payload);
      const result = await store.api('orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: payload });
      const order = result.order;
      if (!order?.reference || !Number.isFinite(order.total)) throw new Error('We could not verify the order confirmation. Keep your bag and contact the store before retrying.');
      const receipt = { reference: order.reference, status: order.status, items: order.items, subtotal: order.subtotal, shipping: order.shipping, total: order.total, createdAt: order.createdAt, paymentMethod: 'cod' };
      try { sessionStorage.setItem('richkid-receipt', JSON.stringify(receipt)); } catch { /* The confirmation can still be retrieved using reference and phone. */ }
      try { sessionStorage.removeItem('richkid-pending-checkout'); } catch {}
      store.clearBag();
      location.href = 'order-confirmation.html?reference=' + encodeURIComponent(order.reference);
    } catch (error) {
      errorElement.hidden = false;
      errorElement.textContent = error.message + ' Your bag has not been cleared. You have not been charged.';
      if (error.status && error.status < 500 && error.status !== 429) {
        idempotencyKey = '';
        try { sessionStorage.removeItem('richkid-pending-checkout'); } catch {}
      }
      button.disabled = !state.orderingEnabled;
    } finally {
      submitting = false;
      if (document.body.contains(button)) button.innerHTML = `Place order ${icon('arrow-right', 18)}`;
    }
  }

  function renderConfirmation() {
    const root = document.getElementById('confirmation-page-content');
    if (!root) return;
    let receipt;
    try { receipt = JSON.parse(sessionStorage.getItem('richkid-receipt')); } catch { receipt = null; }
    if (!receipt || receipt.reference !== params.get('reference') || !Array.isArray(receipt.items)) { root.innerHTML = empty('Check your order confirmation.', 'Use your order reference and mobile number to view an order saved by the store.', 'order-status.html', 'Check order status'); return; }
    root.innerHTML = `<div class="page-confirmation"><div class="page-confirmation-header">${icon('check-circle', 52)}<p class="section-label">ORDER RECEIVED</p><h2>Thank you. We have your order.</h2><p>The store will review your order before dispatch. Save the reference below.</p></div><div class="page-confirmation-grid"><section><h3>Reference</h3><strong class="page-order-reference">${e(receipt.reference)}</strong><p>Status: ${e(receipt.status || 'pending')}</p><p>Payment: Cash on delivery</p><a class="text-link" href="order-status.html?reference=${encodeURIComponent(receipt.reference)}">Check order status ${icon('arrow-right', 17)}</a></section><section><h3>Your items</h3>${receipt.items.map(item => `<p>${e(item.name)} · ${e(item.size)} · Qty ${Number(item.quantity)}</p>`).join('')}<div class="cart-total"><span>Total payable on delivery</span><strong>${money(receipt.total)}</strong></div></section></div><a class="button button-dark" href="shop.html">Continue shopping ${icon('arrow-right', 18)}</a></div>`;
  }

  async function findOrder(form) {
    const target = document.getElementById('order-status-result');
    const values = new FormData(form);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    target.innerHTML = '<p class="page-form-message" role="status">Looking up your order…</p>';
    try {
      const data = await store.api('order-status', { method: 'POST', body: { reference: values.get('reference').trim(), phone: values.get('phone').trim() } });
      const order = data.order || data;
      if (!order.reference || !Array.isArray(order.items)) throw new Error('The order could not be verified.');
      const stages = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
      const current = stages.indexOf(order.status);
      target.innerHTML = `<section class="page-status-card"><p class="section-label">${e(order.reference)}</p><h2>${e(order.status.charAt(0).toUpperCase() + order.status.slice(1))}</h2><p>Total: ${money(order.total)} · Cash on delivery</p>${order.status === 'cancelled' ? '<p>This order has been cancelled. Contact the store if you have questions.</p>' : `<ol class="page-status-timeline">${stages.map((stage, index) => `<li class="${index <= current ? 'is-complete' : ''}">${e(stage.charAt(0).toUpperCase() + stage.slice(1))}</li>`).join('')}</ol>`}<h3>Items</h3>${order.items.map(item => `<p>${e(item.name)} · ${e(item.size)} · Qty ${Number(item.quantity)}</p>`).join('')}</section>`;
    } catch (error) { target.innerHTML = `<p class="page-form-message" role="alert">${e(error.message)}</p>`; }
    finally { button.disabled = false; }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-page-action]');
    if (!button) return;
    if (button.dataset.pageAction === 'size') { selectedSize = button.dataset.size; renderProduct(); document.querySelector(`[data-page-action="size"][data-size="${CSS.escape(selectedSize)}"]`)?.focus({ preventScroll: true }); }
    if (button.dataset.pageAction === 'image') document.getElementById('product-main-image').src = button.dataset.image;
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'page-product-quantity') productQuantity = Number(event.target.value);
    if (event.target.id === 'cart-delivery-zone') { quote = null; store.setDeliveryZone(event.target.value); renderCart(); }
    if (event.target.id === 'checkout-delivery-zone') { store.setDeliveryZone(event.target.value); refreshQuote(); }
  });
  document.addEventListener('input', event => {
    if (event.target.closest('#checkout-form')) { event.target.setCustomValidity(''); idempotencyKey = ''; }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'page-product-form') {
      event.preventDefault();
      const message = document.getElementById('product-form-message');
      if (!selectedSize) { message.hidden = false; message.textContent = 'Please select your size.'; return; }
      productQuantity = Number(form.elements.namedItem('quantity').value);
      if (!Number.isInteger(productQuantity) || productQuantity < 1 || productQuantity > 10) { message.hidden = false; message.textContent = 'Choose a quantity from 1 to 10.'; return; }
      store.addItem(store.findProduct(params.get('id')), selectedSize, productQuantity);
    }
    if (form.id === 'page-search-form') { event.preventDefault(); history.replaceState(null, '', 'search.html?q=' + encodeURIComponent(document.getElementById('page-search-input').value.trim())); renderSearch(); }
    if (form.id === 'checkout-form') { event.preventDefault(); placeOrder(form); }
    if (form.id === 'order-status-form') { event.preventDefault(); if (form.reportValidity()) findOrder(form); }
    if (form.id === 'contact-form') {
      event.preventDefault();
      const status = document.getElementById('contact-form-message');
      status.hidden = false;
      if (!config.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) { status.textContent = 'Email support is not configured yet. No message has been sent.'; return; }
      const values = new FormData(form);
      const body = `${values.get('message')}\n\nFrom: ${values.get('name')}\nReply to: ${values.get('email')}`;
      location.href = `mailto:${encodeURIComponent(config.email)}?subject=${encodeURIComponent('Store enquiry from ' + values.get('name'))}&body=${encodeURIComponent(body)}`;
      status.textContent = 'Your email app will open. Review and send the message there; it has not been sent by this website.';
    }
  });

  function updatePages() { renderProduct(); renderCart(); renderWishlist(); renderCheckout(); if (page === 'search') renderSearch(); }
  document.addEventListener('store:ready', updatePages);
  document.addEventListener('store:changed', () => { renderCart(); renderWishlist(); if (page === 'product') renderProduct(); });
  document.querySelectorAll('[data-delivery-inside]').forEach(element => { element.textContent = money(state.shipping.insideDhaka); });
  document.querySelectorAll('[data-delivery-outside]').forEach(element => { element.textContent = money(state.shipping.outsideDhaka); });
  document.querySelectorAll('[data-free-shipping-threshold]').forEach(element => { element.textContent = money(state.shipping.freeThreshold); });
  document.querySelectorAll('[data-policy-notice]').forEach(element => { element.hidden = config.policiesConfirmed === true; });
  for (const [hook, value, prefix] of [['data-contact-email', config.email, 'mailto:'], ['data-contact-phone', config.phone, 'tel:']]) {
    document.querySelectorAll(`[${hook}]`).forEach(link => { if (value) link.href = prefix + value; else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); } });
  }
  if (page === 'search') document.getElementById('page-search-input').value = params.get('q') || '';
  if (page === 'order-status' && params.get('reference')) document.getElementById('order-reference').value = params.get('reference');
  updatePages();
  renderConfirmation();
})();
