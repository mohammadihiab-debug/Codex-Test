/* RICHKID storefront — browser-native JavaScript, no framework or build step. */
(() => {
  'use strict';

  const { products, categories, formatPrice } = window.RichkidCatalog;
  const config = window.StoreConfig || {};
  const query = new URLSearchParams(location.search);
  const findProduct = id => products.find(product => product.id === Number(id));
  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const icon = (name, size = 20, className = '', filled = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function loadCart() {
    const stored = readStorage('richkid-bag');
    if (!Array.isArray(stored)) return [];
    return stored.reduce((items, row) => {
      if (!row || typeof row !== 'object') return items;
      const product = findProduct(row.id);
      if (!product || product.id !== row.id || !product.sizes.includes(row.size)
        || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 10) return items;
      const existing = items.find(item => item.id === row.id && item.size === row.size);
      if (existing) existing.quantity = Math.min(10, existing.quantity + row.quantity);
      else items.push({ id: row.id, size: row.size, quantity: row.quantity });
      return items;
    }, []);
  }

  function loadWishlist() {
    const stored = readStorage('richkid-saved');
    return Array.isArray(stored) ? [...new Set(stored.filter(id => Number.isInteger(id) && findProduct(id)))] : [];
  }

  const state = {
    category: categories.some(item => item.name === query.get('category')) ? query.get('category') : 'All products',
    sort: ['price-low', 'price-high', 'name'].includes(query.get('sort')) ? query.get('sort') : 'featured', savedOnly: false,
    saleOnly: query.get('sale') === '1', deliveryZone: 'dhaka', backend: false, orderingEnabled: false, shipping: config.shipping || { insideDhaka: 80, outsideDhaka: 130, freeThreshold: 2500 },
    cart: loadCart(), saved: loadWishlist(), modal: null,
    product: null, size: '', quantity: 1, search: '', order: null,
  };
  const pageContent = document.getElementById('page-content');
  const modalRoot = document.getElementById('modal-root');
  let returnFocus = null;
  let previousOverflow = '';
  let toastTimer;

  function persist() {
    try {
      localStorage.setItem('richkid-bag', JSON.stringify(state.cart));
      localStorage.setItem('richkid-saved', JSON.stringify(state.saved));
    } catch { /* Shopping still works when browser storage is unavailable. */ }
  }

  function bagSummary() {
    const items = state.cart.map(item => ({ ...item, product: findProduct(item.id) }));
    const count = items.reduce((total, item) => total + item.quantity, 0);
    const subtotal = items.reduce((total, item) => total + item.quantity * item.product.price, 0);
    const delivery = subtotal > 0 && subtotal < state.shipping.freeThreshold ? (state.deliveryZone === 'outside' ? state.shipping.outsideDhaka : state.shipping.insideDhaka) : 0;
    return { items, count, subtotal, delivery, total: subtotal + delivery };
  }

  function updateHeader() {
    const { count } = bagSummary();
    if (document.querySelector('.bag-count')) document.querySelector('.bag-count').textContent = count;
    document.getElementById('bag-button')?.setAttribute('aria-label', `Open shopping bag, ${count} items`);
    document.getElementById('wishlist-button')?.setAttribute('aria-label', `View wishlist, ${state.saved.length} saved items`);
    if (document.querySelector('.saved-indicator')) document.querySelector('.saved-indicator').hidden = state.saved.length === 0;
  }

  function productCard(product) {
    const saved = state.saved.includes(product.id);
    return `<article class="product-card">
      <div class="product-image-wrap">
        <a class="product-image-link" href="product.html?id=${product.id}" aria-label="View ${escapeHTML(product.name)}"><img class="product-image" src="${product.image}" alt="${escapeHTML(product.name)}" loading="lazy"></a>
        ${product.badge ? `<span class="product-badge ${product.originalPrice ? 'badge-sale' : ''}">${escapeHTML(product.badge)}</span>` : ''}
        <button class="wishlist-button ${saved ? 'is-saved' : ''}" data-action="save" data-id="${product.id}" aria-label="${saved ? 'Remove' : 'Save'} ${escapeHTML(product.name)} ${saved ? 'from' : 'to'} wishlist" aria-pressed="${saved}">${icon('heart', 18, '', saved)}</button>
        <button class="quick-add" data-action="product" data-id="${product.id}">Choose your size ${icon('plus', 17)}</button>
      </div>
      <div class="product-details"><div class="product-category">${escapeHTML(product.category)}</div><a class="product-name" href="product.html?id=${product.id}">${escapeHTML(product.name)}</a>
        <div class="product-bottom"><div class="product-price">${formatPrice(product.price)} ${product.originalPrice ? `<span class="original-price">${formatPrice(product.originalPrice)}</span>` : ''}</div><div class="color-swatches" aria-label="Color palette">${product.colors.map((color, index) => `<span title="${escapeHTML(color.name)}" class="swatch ${index === 0 ? 'selected' : ''}" style="background-color:${color.value}"></span>`).join('')}</div></div>
      </div>
    </article>`;
  }

  function renderCollection() {
    if (!document.getElementById('product-grid')) return;
    const shown = products.filter(product => (state.category === 'All products' || product.category === state.category)
      && (!state.savedOnly || state.saved.includes(product.id)) && (!state.saleOnly || product.originalPrice > product.price));
    if (state.sort === 'price-low') shown.sort((a, b) => a.price - b.price);
    if (state.sort === 'price-high') shown.sort((a, b) => b.price - a.price);
    if (state.sort === 'name') shown.sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById('product-grid').innerHTML = shown.map(productCard).join('');
    document.getElementById('collection-count').textContent = `${shown.length} good-looking essentials`;
    document.getElementById('collection-heading').textContent = state.savedOnly ? 'Your saved favorites.' : state.saleOnly ? 'The good deals.' : 'Meet your new favorites.';
    document.getElementById('saved-filter').hidden = !state.savedOnly;
    document.getElementById('empty-collection').hidden = shown.length > 0;
    if (document.getElementById('sort-products')) document.getElementById('sort-products').value = state.sort;
    document.querySelectorAll('[data-action="filter"]').forEach(button => {
      const active = button.dataset.category === state.category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function shop(category = 'All products', options = {}) {
    if (options.savedOnly) { location.href = 'wishlist.html'; return; }
    const params = new URLSearchParams();
    if (categories.some(item => item.name === category)) params.set('category', category);
    if (state.sort !== 'featured') params.set('sort', state.sort);
    if (state.saleOnly) params.set('sale', '1');
    location.href = 'shop.html' + (params.size ? '?' + params.toString() : '');
  }

  function toggleSaved(id) {
    if (!findProduct(id)) return;
    state.saved = state.saved.includes(id) ? state.saved.filter(saved => saved !== id) : [...state.saved, id];
    persist();
    updateHeader();
    if (state.savedOnly) {
      renderCollection();
      (document.querySelector('.wishlist-button') || document.querySelector('[data-action="clear-wishlist-filter"]'))?.focus({ preventScroll: true });
    } else {
      document.querySelectorAll(`[data-action="save"][data-id="${id}"]`).forEach(button => {
        const saved = state.saved.includes(id);
        button.classList.toggle('is-saved', saved);
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${findProduct(id).name} ${saved ? 'from' : 'to'} wishlist`);
        button.innerHTML = icon('heart', 18, '', saved);
      });
    }
    document.dispatchEvent(new CustomEvent('store:changed'));
  }

  function notify(message) {
    clearTimeout(toastTimer);
    const root = document.getElementById('toast-root');
    root.innerHTML = `<div class="toast" role="status">${icon('check-circle', 18)}<span>${escapeHTML(message)}</span></div>`;
    toastTimer = setTimeout(() => { root.replaceChildren(); }, 3300);
  }

  function focusableElements() {
    return [...modalRoot.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]')]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  function renderModal(preserveFocus = false) {
    const focused = preserveFocus ? document.activeElement?.dataset : null;
    const focusKey = focused ? { action: focused.action, id: focused.id, size: focused.size } : null;
    const content = modalContent();
    const drawer = state.modal === 'cart' || state.modal === 'menu';
    modalRoot.innerHTML = `<div class="overlay ${drawer ? 'drawer-overlay' : ''}">
      <div class="panel-backdrop" data-action="close" aria-hidden="true"></div>
      <section class="${drawer ? 'drawer' : 'modal'} ${content.className || ''}" role="dialog" aria-modal="true" aria-label="${escapeHTML(content.title)}" tabindex="-1">
        <div class="${drawer ? 'drawer-header' : 'modal-header'}"><h2>${escapeHTML(content.title)}</h2><button class="icon-button" data-action="close" aria-label="Close dialog">${icon('x', 23)}</button></div>${content.body}
      </section>
    </div>`;
    if (state.modal === 'search') renderSearchResults();
    const matching = focusKey?.action && [...modalRoot.querySelectorAll('[data-action]')].find(element =>
      !element.disabled && element.dataset.action === focusKey.action && element.dataset.id === focusKey.id && element.dataset.size === focusKey.size);
    const target = matching || modalRoot.querySelector('input') || focusableElements()[0] || modalRoot.querySelector('[role="dialog"]');
    target.focus({ preventScroll: true });
  }

  function openModal(type) {
    if (!state.modal) {
      returnFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
    }
    state.modal = type;
    pageContent.inert = true;
    document.body.style.overflow = 'hidden';
    renderModal();
  }

  function closeModal() {
    state.modal = null;
    modalRoot.replaceChildren();
    pageContent.inert = false;
    document.body.style.overflow = previousOverflow;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else document.getElementById('bag-button').focus({ preventScroll: true });
    returnFocus = null;
  }

  function showProduct(id) {
    const product = findProduct(id);
    if (!product) return;
    state.product = product;
    state.size = '';
    state.quantity = 1;
    openModal('product');
  }

  function addToBag() {
    if (!state.size) {
      const error = modalRoot.querySelector('.field-error');
      error.hidden = false;
      modalRoot.querySelector('.size-option').focus();
      return;
    }
    const product = state.product;
    const available = availableStock(product, state.size);
    const existing = state.cart.find(item => item.id === product.id && item.size === state.size);
    if (available !== null && (existing?.quantity || 0) + state.quantity > available) return notify('That size does not have enough stock.');
    if (existing && existing.quantity + state.quantity > 10) return notify('You can add up to 10 of each size.');
    if (existing) existing.quantity += state.quantity;
    else state.cart.push({ id: product.id, size: state.size, quantity: state.quantity });
    persist();
    updateHeader();
    document.dispatchEvent(new CustomEvent('store:changed'));
    openModal('cart');
    notify('Good choice. Added to your bag.');
  }

  function changeBagQuantity(id, size, change) {
    const item = state.cart.find(row => row.id === id && row.size === size);
    if (!item || item.quantity + change > 10) return;
    const available = availableStock(findProduct(id), size);
    if (available !== null && item.quantity + change > available) return notify('There is no more stock in that size.');
    item.quantity += change;
    state.cart = state.cart.filter(row => row.quantity > 0);
    persist();
    updateHeader();
    if (state.modal) renderModal(true);
    document.dispatchEvent(new CustomEvent('store:changed'));
  }

  function renderSearchResults() {
    const query = state.search.trim();
    const matches = products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
    modalRoot.querySelector('.search-hint').textContent = query
      ? `${matches.length} result${matches.length === 1 ? '' : 's'} for “${state.search}”` : 'A few favorites to get you started';
    modalRoot.querySelector('.search-results').innerHTML = (query ? matches : products.slice(0, 4)).map(product =>
      `<a class="search-result" href="product.html?id=${product.id}"><img class="search-result-image" src="${product.image}" alt=""><span><small>${escapeHTML(product.category)}</small><strong>${escapeHTML(product.name)}</strong><span>${formatPrice(product.price)}</span></span>${icon('arrow-up-right', 18)}</a>`).join('');
    modalRoot.querySelector('.search-empty').hidden = matches.length > 0;
  }

  function productContent() {
    const product = state.product;
    return { title: 'A closer look', className: 'product-modal', body: `
      <div class="product-modal-layout"><img class="product-modal-image" src="${product.image}" alt="${escapeHTML(product.name)}">
        <div class="product-modal-info"><p class="eyebrow">RICHKID ESSENTIALS / ${escapeHTML(product.category)}</p><h2>${escapeHTML(product.name)}</h2>
          <p class="detail-price">${formatPrice(product.price)} ${product.originalPrice ? `<span class="original-price">${formatPrice(product.originalPrice)}</span>` : ''}</p><p class="detail-description">${escapeHTML(product.description)}</p>
          <div class="size-label"><span id="selected-size-label">Select size</span><span>True to size</span></div>
          <div class="size-options">${product.sizes.map(size => `<button class="size-option" data-action="size" data-size="${escapeHTML(size)}" aria-pressed="false">${escapeHTML(size)}</button>`).join('')}</div>
          <p class="field-error" role="alert" hidden>Please choose your size.</p>
          <div class="product-modal-actions"><div class="quantity-control"><button data-action="product-minus" aria-label="Decrease quantity" disabled>${icon('minus', 14)}</button><span class="product-quantity">1</span><button data-action="product-plus" aria-label="Increase quantity">${icon('plus', 14)}</button></div><button class="button button-dark" data-action="add">Add to bag ${icon('bag', 17)}</button></div>
          <ul class="detail-list"><li>${icon('truck', 17)} Delivery across Bangladesh</li><li>${icon('rotate', 17)} Read our exchange policy</li><li>${icon('shield', 17)} Cash on delivery available</li></ul>
        </div>
      </div>` };
  }

  function cartContent() {
    const bag = bagSummary();
    return { title: `Your bag (${bag.count})`, body: `<div class="drawer-body">${bag.items.length ? `
      <div class="shipping-progress"><p>${bag.subtotal >= state.shipping.freeThreshold ? `${icon('check', 16)} Your order qualifies for free delivery!` : `You’re <strong>${formatPrice(state.shipping.freeThreshold - bag.subtotal)}</strong> away from free delivery.`}</p><div class="progress-track"><div class="progress-fill" style="width:${Math.min(bag.subtotal / state.shipping.freeThreshold * 100, 100)}%"></div></div></div>
      ${bag.items.map(item => `<article class="cart-line"><img class="cart-line-image" src="${item.product.image}" alt="${escapeHTML(item.product.name)}"><div class="cart-line-info"><span>${escapeHTML(item.product.category)}</span><h3>${escapeHTML(item.product.name)}</h3><p>Size: ${escapeHTML(item.size)}</p><div class="quantity-control"><button data-action="bag-minus" data-id="${item.id}" data-size="${escapeHTML(item.size)}" aria-label="Decrease ${escapeHTML(item.product.name)} quantity">${icon('minus', 12)}</button><span>${item.quantity}</span><button data-action="bag-plus" data-id="${item.id}" data-size="${escapeHTML(item.size)}" aria-label="Increase ${escapeHTML(item.product.name)} quantity" ${item.quantity >= 10 ? 'disabled' : ''}>${icon('plus', 12)}</button></div></div><div class="cart-line-price"><strong>${formatPrice(item.product.price * item.quantity)}</strong><button class="remove-item" data-action="remove" data-id="${item.id}" data-size="${escapeHTML(item.size)}" aria-label="Remove ${escapeHTML(item.product.name)}">${icon('trash', 15)}</button></div></article>`).join('')}` : `
      <div class="empty-cart">${icon('bag', 44)}<h3>Your next good fit starts here.</h3><p>Your bag is waiting for something you love.</p><button class="button button-dark" data-action="shop">Find your favorites ${icon('arrow-right', 17)}</button></div>`}</div>
      ${bag.items.length ? `<div class="drawer-footer"><div class="cart-totals"><span>Subtotal</span><strong>${formatPrice(bag.subtotal)}</strong></div><div class="cart-totals"><span>Delivery</span><span>${bag.delivery ? formatPrice(bag.delivery) : 'On us'}</span></div><div class="cart-total"><span>Total</span><strong>${formatPrice(bag.total)}</strong></div><a class="text-link" href="cart.html">View and edit your bag</a><button class="button button-dark button-full" data-action="checkout">Continue to checkout ${icon('arrow-right', 18)}</button><p class="cart-note">${icon('shield', 13)} Cash on delivery · Confirm delivery at checkout</p></div>` : ''}` };
  }

  const informationPages = { 'Our story': 'about.html', 'Shipping & delivery': 'shipping.html', 'Returns & exchanges': 'returns.html', 'Contact us': 'contact.html', 'Privacy policy': 'privacy.html', 'Terms of service': 'terms.html' };

  function modalContent() {
    if (state.modal === 'product') return productContent();
    if (state.modal === 'cart') return cartContent();
    if (state.modal === 'search') return { title: 'Find your next favorite', className: 'search-modal', body: `<div class="modal-body"><label class="search-input">${icon('search', 22)}<input type="search" placeholder="Try ‘shirt’, ‘relaxed’, or ‘polo’…" aria-label="Search collection"></label><p class="search-hint" aria-live="polite"></p><div class="search-results"></div><div class="empty-state search-empty" hidden>${icon('search', 27)}<h3>No matches just yet.</h3><p>Try a category like shirts, polos, or trousers.</p><button class="text-link" data-action="clear-search">Clear search ${icon('x', 14)}</button></div></div>` };
    if (state.modal === 'menu') return { title: 'Explore RICHKID', className: 'mobile-navigation', body: `<nav aria-label="Mobile navigation"><button data-action="shop">New arrivals ${icon('arrow-up-right')}</button>${categories.map(category => `<button data-action="shop" data-category="${escapeHTML(category.name)}">${escapeHTML(category.name)}${icon('arrow-up-right')}</button>`).join('')}<button data-action="wishlist">Your wishlist ${icon('heart')}</button></nav><p>YOUR STYLE. YOUR WAY. ALWAYS RICHKID.</p>` };
    return { title: 'Store', body: '<div class="modal-body"><a href="shop.html">Explore the collection</a></div>' };
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled) return;
    event.preventDefault();
    const { action, category, size, info } = trigger.dataset;
    const id = Number(trigger.dataset.id);
    switch (action) {
      case 'home': location.href = 'index.html'; break;
      case 'shop': shop(category); break;
      case 'deals': state.saleOnly = true; state.sort = 'price-low'; shop(); break;
      case 'filter': state.category = category; renderCollection(); break;
      case 'wishlist': shop('All products', { savedOnly: true }); break;
      case 'clear-wishlist-filter': state.savedOnly = false; state.category = 'All products'; renderCollection(); break;
      case 'back-to-collection': document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); break;
      case 'search': state.search = ''; openModal('search'); break;
      case 'clear-search': state.search = ''; modalRoot.querySelector('input').value = ''; renderSearchResults(); modalRoot.querySelector('input').focus(); break;
      case 'menu': openModal('menu'); break;
      case 'cart': openModal('cart'); break;
      case 'close': closeModal(); break;
      case 'info': if (Object.hasOwn(informationPages, info)) location.href = informationPages[info]; break;
      case 'product': showProduct(id); break;
      case 'save': toggleSaved(id); break;
      case 'size':
        if (!state.product.sizes.includes(size)) break;
        state.size = size;
        modalRoot.querySelectorAll('.size-option').forEach(button => { button.classList.toggle('selected', button.dataset.size === size); button.setAttribute('aria-pressed', String(button.dataset.size === size)); });
        modalRoot.querySelector('#selected-size-label').textContent = `Select size — ${size}`;
        modalRoot.querySelector('.field-error').hidden = true;
        break;
      case 'product-minus':
      case 'product-plus':
        state.quantity = Math.min(10, Math.max(1, state.quantity + (action === 'product-plus' ? 1 : -1)));
        modalRoot.querySelector('.product-quantity').textContent = state.quantity;
        modalRoot.querySelector('[data-action="product-minus"]').disabled = state.quantity === 1;
        modalRoot.querySelector('[data-action="product-plus"]').disabled = state.quantity === 10;
        break;
      case 'add': addToBag(); break;
      case 'bag-minus': changeBagQuantity(id, size, -1); break;
      case 'bag-plus': changeBagQuantity(id, size, 1); break;
      case 'remove': removeItem(id, size); break;
      case 'checkout': if (state.cart.length) location.href = 'checkout.html'; break;
      default: break;
    }
  });

  document.addEventListener('change', event => {
    if (event.target.id === 'sort-products') { state.sort = event.target.value; renderCollection(); }
  });

  document.addEventListener('input', event => {
    if (event.target.matches('input[aria-label="Search collection"]')) { state.search = event.target.value; renderSearchResults(); }
    if (event.target.closest('#checkout-form')) event.target.setCustomValidity('');
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'newsletter-form') {
      event.preventDefault();
      if (!event.target.reportValidity()) return;
      document.getElementById('newsletter-signup').innerHTML = `<div class="newsletter-success" role="status">${icon('check-circle', 26)}<div><strong>Updates are not open yet.</strong><p>No email address was saved. Visit our contact page for available support.</p></div></div>`;
    }
  });

  document.addEventListener('keydown', event => {
    if (!state.modal) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const elements = focusableElements();
      if (!elements.length) return event.preventDefault();
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !modalRoot.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !modalRoot.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  });

  function availableStock(product, size) {
    if (!state.orderingEnabled) return null;
    return Number.isInteger(product?.stock?.[size]) ? product.stock[size] : 0;
  }

  function removeItem(id, size) {
    state.cart = state.cart.filter(item => !(item.id === id && item.size === size));
    persist();
    updateHeader();
    if (state.modal) renderModal(true);
    document.dispatchEvent(new CustomEvent('store:changed'));
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch('api/' + path, {
        ...options,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new Error('The store could not be reached. Check your connection and try again.');
    }
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Online ordering is not available on this host.');
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'The request could not be completed.');
      error.code = result.code;
      error.status = response.status;
      error.details = result.details;
      throw error;
    }
    return result;
  }

  async function refreshCatalog() {
    try {
      const data = await api('catalog');
      if (!Array.isArray(data.products)) throw new Error('The store catalog is unavailable.');
      data.products.forEach(product => {
        const local = findProduct(product.id);
        if (local) Object.assign(local, product);
      });
      state.backend = true;
      state.orderingEnabled = data.orderingEnabled === true;
      if (data.shipping) state.shipping = data.shipping;
    } catch {
      state.backend = false;
      state.orderingEnabled = false;
    }
    const banner = document.getElementById('launch-status-banner');
    if (banner) {
      banner.hidden = state.orderingEnabled;
      banner.textContent = 'Store preview — online orders are not being accepted yet.';
    }
    renderCollection();
    document.dispatchEvent(new CustomEvent('store:ready'));
  }

  document.querySelectorAll('[data-store-name]').forEach(element => { element.textContent = config.name || 'RICHKID'; });
  document.querySelectorAll('[data-store-email]').forEach(element => { element.textContent = config.email || 'Email support will be announced before launch.'; });
  document.querySelectorAll('[data-store-phone]').forEach(element => { element.textContent = config.phone || 'Phone support will be announced before launch.'; });
  document.querySelectorAll('[data-store-address]').forEach(element => { element.textContent = config.address || 'Store address will be announced before launch.'; });

  window.RichkidStore = {
    state, products, categories, config, formatPrice, escapeHTML, icon, api,
    findProduct, productCard, bagSummary, notify, availableStock, removeItem,
    changeQuantity: changeBagQuantity, refreshCatalog,
    addItem(product, size, quantity) {
      if (!product?.sizes.includes(size) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return false;
      state.product = product;
      state.size = size;
      state.quantity = quantity;
      const before = bagSummary().count;
      addToBag();
      return bagSummary().count > before;
    },
    clearBag() {
      state.cart = [];
      persist();
      updateHeader();
      document.dispatchEvent(new CustomEvent('store:changed'));
    },
    setDeliveryZone(zone) { state.deliveryZone = zone === 'outside' ? 'outside' : 'dhaka'; },
  };

  if (document.getElementById('current-year')) document.getElementById('current-year').textContent = new Date().getFullYear();
  persist();
  updateHeader();
  renderCollection();
  refreshCatalog();
})();
