(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { authenticated: false, csrfToken: '', orders: [], products: [], page: 1, total: 0, pageSize: 50, changes: new Map(), selectedOrder: null, busy: false, ordersRequest: 0 };
  const statusLabels = { pending: 'Pending', confirmed: 'Confirmed', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
  const transitions = { pending: ['confirmed', 'processing', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
  const currency = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function money(value) { return currency.format(Number(value) || 0); }
  function date(value) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : dateFormat.format(parsed) + ' BST'; }
  function statusBadge(status) { return node('span', statusLabels[status] || 'Unknown', 'status-badge status-' + (Object.hasOwn(statusLabels, status) ? status : 'unknown')); }
  function message(text, isError) {
    const target = $('notification');
    target.textContent = text;
    target.className = 'notification' + (isError ? ' error' : '');
    target.hidden = !text;
  }
  function inlineError(id, text) { $(id).textContent = text; $(id).hidden = !text; }
  function setBusy(button, busy, label) { button.disabled = busy; if (label) button.textContent = label; }

  async function request(path, options) {
    const opts = options || {};
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const headers = { Accept: opts.csv ? 'text/csv' : 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.method && opts.method !== 'GET' && state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
    try {
      const response = await fetch(path, { method: opts.method || 'GET', headers, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, body: opts.body ? JSON.stringify(opts.body) : undefined });
      const isJSON = (response.headers.get('content-type') || '').includes('application/json');
      if (response.status === 401 && !opts.login && !opts.session) {
        clearSession();
        showLogin();
        message('Your administrator session has ended. Please sign in again.', true);
      }
      if (opts.csv && response.ok && (response.headers.get('content-type') || '').includes('text/csv')) return response.blob();
      const data = isJSON ? await response.json() : null;
      if (!response.ok) {
        const error = new Error(data && typeof data.error === 'string' ? data.error : 'The store server is unavailable. Check the PHP application and database configuration.');
        error.status = response.status;
        error.code = data && data.code;
        throw error;
      }
      if (!isJSON || !data || typeof data !== 'object') throw new Error('This host is not serving the store API. Configure the PHP application and MySQL database to manage orders and inventory.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The server took too long to respond. Check your connection, then try again.');
      if (error instanceof TypeError) throw new Error('Cannot connect to the store server. Check your connection and try again.');
      throw error;
    } finally { window.clearTimeout(timeout); }
  }

  function clearSession() {
    state.authenticated = false;
    state.csrfToken = '';
    state.orders = [];
    state.products = [];
    state.changes.clear();
    state.selectedOrder = null;
    state.total = 0;
    $('orders-body').replaceChildren();
    $('inventory-products').replaceChildren();
    $('order-detail').replaceChildren();
    if ($('order-dialog').open) $('order-dialog').close();
    $('dashboard').hidden = true;
    $('logout-button').hidden = true;
    $('admin-password').value = '';
  }
  function showLogin() {
    $('connection-panel').hidden = true;
    $('login-panel').hidden = false;
    $('dashboard').hidden = true;
  }
  async function connect() {
    clearSession();
    message('');
    $('login-panel').hidden = true;
    $('connection-panel').hidden = false;
    $('connection-heading').textContent = 'Connecting to your store.';
    $('connection-message').textContent = 'Checking the server and your session…';
    $('connection-retry').hidden = true;
    try {
      const data = await request('api/admin/session', { session: true });
      if (data.authenticated && typeof data.csrfToken === 'string') await enterDashboard(data.csrfToken);
      else showLogin();
    } catch (error) {
      if (error.status === 401) showLogin();
      else {
        $('connection-heading').textContent = 'The store server is unavailable.';
        $('connection-message').textContent = error.message;
        $('connection-retry').hidden = false;
      }
    }
  }
  async function enterDashboard(token) {
    state.authenticated = true;
    state.csrfToken = token;
    state.page = 1;
    $('admin-password').value = '';
    $('login-panel').hidden = true;
    $('connection-panel').hidden = true;
    $('dashboard').hidden = false;
    $('logout-button').hidden = false;
    inlineError('login-error', '');
    selectSection('orders');
    const results = await Promise.allSettled([loadOrders(), loadInventory(), loadReadiness()]);
    if (state.authenticated && results.some((result) => result.status === 'rejected')) message('Some store data could not be loaded. Use the refresh controls to retry.', true);
  }

  function selectSection(section) {
    for (const button of document.querySelectorAll('[data-section]')) {
      const active = button.dataset.section === section;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    for (const name of ['orders', 'inventory', 'readiness']) $(name + '-section').hidden = name !== section;
  }
  function markRefreshed() { $('last-refreshed').textContent = 'Updated ' + date(new Date()); }
  async function loadOrders() {
    if (!state.authenticated) return;
    const requestId = ++state.ordersRequest;
    inlineError('orders-error', '');
    $('orders-refresh').disabled = true;
    $('orders-count').textContent = 'Loading orders…';
    $('orders-body').replaceChildren();
    $('orders-empty').hidden = true;
    $('previous-page').disabled = true;
    $('next-page').disabled = true;
    try {
      const params = new URLSearchParams({ page: String(state.page) });
      const status = $('order-status-filter').value;
      if (status) params.set('status', status);
      const data = await request('api/admin/orders?' + params);
      if (!state.authenticated || requestId !== state.ordersRequest) return;
      if (!Array.isArray(data.orders)) throw new Error('The order response was incomplete. Try refreshing.');
      state.orders = data.orders;
      state.total = Number(data.total) || 0;
      state.pageSize = Number(data.pageSize) || 50;
      renderOrders();
      markRefreshed();
    } catch (error) { if (state.authenticated && requestId === state.ordersRequest) { $('orders-count').textContent = 'Orders could not be refreshed'; inlineError('orders-error', error.message); } throw error; }
    finally { if (requestId === state.ordersRequest) $('orders-refresh').disabled = false; }
  }
  function renderOrders() {
    const body = $('orders-body');
    body.replaceChildren();
    for (const order of state.orders) {
      const tr = node('tr');
      const orderCell = node('td'); orderCell.dataset.label = 'Order';
      const orderText = node('div'); orderText.append(node('span', order.reference, 'cell-primary'), node('span', date(order.createdAt), 'cell-secondary')); orderCell.append(orderText);
      const customerCell = node('td'); customerCell.dataset.label = 'Customer';
      const customerText = node('div'); customerText.append(node('span', order.customer && order.customer.name || 'Customer', 'cell-primary'), node('span', order.customer && order.customer.city || '', 'cell-secondary')); customerCell.append(customerText);
      const totalCell = node('td', money(order.total)); totalCell.dataset.label = 'Total';
      const statusCell = node('td'); statusCell.dataset.label = 'Status'; statusCell.append(statusBadge(order.status));
      const actionCell = node('td'); actionCell.dataset.label = 'Action';
      const button = node('button', 'View order', 'button button-outline compact'); button.type = 'button'; button.setAttribute('aria-label', 'View order ' + order.reference); button.addEventListener('click', () => openOrder(order)); actionCell.append(button);
      tr.append(orderCell, customerCell, totalCell, statusCell, actionCell); body.append(tr);
    }
    $('orders-empty').hidden = state.orders.length > 0;
    $('orders-count').textContent = state.total + (state.total === 1 ? ' order' : ' orders') + ($('order-status-filter').value ? ' with this status' : ' in total');
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    $('page-label').textContent = 'Page ' + state.page + ' of ' + totalPages;
    $('previous-page').disabled = state.page <= 1;
    $('next-page').disabled = state.page >= totalPages;
  }
  function detailBox(title, lines) {
    const box = node('div', null, 'detail-box'); box.append(node('h3', title));
    for (const line of lines) if (line) box.append(node('p', line));
    return box;
  }
  function openOrder(order, keepOpen) {
    if (!state.authenticated) return;
    state.selectedOrder = order;
    const target = $('order-detail'); target.replaceChildren();
    $('order-dialog-title').textContent = order.reference;
    const meta = node('div', null, 'order-meta'); meta.append(node('span', date(order.createdAt)), statusBadge(order.status)); target.append(meta);
    const customer = order.customer || {};
    const grid = node('div', null, 'detail-grid');
    grid.append(detailBox('Customer', [customer.name, customer.phone, customer.email]), detailBox('Delivery address', [customer.address, customer.city, customer.deliveryZone === 'insideDhaka' ? 'Inside Dhaka' : customer.deliveryZone === 'outsideDhaka' ? 'Outside Dhaka' : customer.deliveryZone]));
    target.append(grid);
    const table = node('table', null, 'detail-items'); const caption = node('caption', 'Purchased items', 'sr-only'); const head = node('thead'); const headRow = node('tr');
    for (const label of ['Product', 'Qty', 'Amount']) { const th = node('th', label); th.scope = 'col'; headRow.append(th); } head.append(headRow); table.append(caption, head);
    const body = node('tbody');
    for (const item of order.items || []) {
      const tr = node('tr'); const cell = node('td');
      cell.append(node('span', item.name || 'Product', 'cell-primary'), node('span', [item.size, typeof item.color === 'object' ? item.color.name : item.color].filter(Boolean).join(' · '), 'cell-secondary'));
      const quantity = Number(item.quantity) || 0;
      const amount = item.lineTotal !== undefined ? item.lineTotal : (Number(item.unitPrice !== undefined ? item.unitPrice : item.price) || 0) * quantity;
      tr.append(cell, node('td', quantity), node('td', money(amount))); body.append(tr);
    }
    table.append(body); target.append(table);
    const totals = node('div', null, 'order-totals');
    for (const [label, value] of [['Subtotal', order.subtotal], ['Delivery', order.shipping], ['Total (COD)', order.total]]) { const row = node('div', null, label.startsWith('Total') ? 'grand-total' : ''); row.append(node('span', label), node('span', money(value))); totals.append(row); } target.append(totals);
    if (customer.notes || order.customerNote) target.append(detailBox('Customer note', [customer.notes || order.customerNote]));
    if (Array.isArray(order.notes) && order.notes.length) {
      target.append(node('h3', 'Order notes'));
      const list = node('ul', null, 'notes-list');
      for (const note of order.notes) { const li = node('li'); li.append(node('time', date(note.createdAt)), node('span', note.text)); list.append(li); } target.append(list);
    }
    const nextStatuses = transitions[order.status] || [];
    if (nextStatuses.length) {
      const form = node('form', null, 'update-form');
      const statusLabel = node('label', 'Update order status'); statusLabel.htmlFor = 'detail-status';
      const select = node('select'); select.id = 'detail-status'; select.required = true;
      const placeholder = node('option', 'Choose next status'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true; select.append(placeholder);
      for (const status of nextStatuses) { const option = node('option', statusLabels[status]); option.value = status; select.append(option); }
      const noteLabel = node('label', 'Internal note (optional)'); noteLabel.htmlFor = 'detail-note';
      const note = node('textarea'); note.id = 'detail-note'; note.rows = 2; note.maxLength = 1000; note.placeholder = 'For example, courier handover or reason for cancellation';
      const error = node('p', '', 'form-error'); error.hidden = true; error.setAttribute('role', 'alert');
      const submit = node('button', 'Save order update', 'button button-dark'); submit.type = 'submit';
      form.append(statusLabel, select, noteLabel, note, error, submit);
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!select.value || !state.authenticated) return;
        const newStatus = select.value;
        if (newStatus === 'cancelled' && !window.confirm('Cancel ' + order.reference + '? Reserved stock will be returned to inventory.')) return;
        setBusy(submit, true, 'Saving…'); error.hidden = true;
        try {
          const data = await request('api/admin/orders/' + encodeURIComponent(order.reference), { method: 'PATCH', body: { status: newStatus, ...(note.value.trim() ? { note: note.value.trim() } : {}) } });
          if (!state.authenticated) return;
          if (!data.order) throw new Error('The server did not confirm the order update. Refresh to check its status.');
          openOrder(data.order, true);
          message('Order ' + order.reference + ' updated to ' + (statusLabels[data.order.status] || data.order.status) + '.');
          await Promise.allSettled([loadOrders(), ...(state.changes.size ? [] : [loadInventory()])]);
        } catch (failure) { if (state.authenticated) { error.textContent = failure.message; error.hidden = false; setBusy(submit, false, 'Save order update'); } }
      });
      target.append(form);
    } else target.append(node('p', 'This order is ' + (statusLabels[order.status] || order.status).toLowerCase() + '. No further status changes are available.', 'notice'));
    if (!keepOpen || !$('order-dialog').open) $('order-dialog').showModal();
  }

  async function loadInventory() {
    if (!state.authenticated) return;
    $('inventory-refresh').disabled = true;
    inlineError('inventory-error', '');
    try {
      const data = await request('api/admin/inventory');
      if (!state.authenticated) return;
      if (!Array.isArray(data.products)) throw new Error('The inventory response was incomplete. Try refreshing.');
      state.products = data.products;
      state.changes.clear();
      renderInventory();
      markRefreshed();
    } catch (error) { if (state.authenticated) inlineError('inventory-error', error.message); throw error; }
    finally { $('inventory-refresh').disabled = false; }
  }
  function updateChanges() {
    const count = state.changes.size;
    $('inventory-changes').textContent = count ? count + (count === 1 ? ' size has' : ' sizes have') + ' unsaved changes' : 'No unsaved changes';
    $('inventory-save').disabled = !count || state.busy;
  }
  function renderInventory() {
    const target = $('inventory-products'); target.replaceChildren();
    if (!state.products.length) target.append(node('p', 'No products are configured on the server.', 'empty-state'));
    for (const product of state.products) {
      const card = node('article', null, 'panel stock-card'); const heading = node('div', null, 'stock-heading');
      if (typeof product.image === 'string' && /^images\/[a-zA-Z0-9_./-]+$/.test(product.image) && !product.image.includes('..')) { const image = node('img'); image.src = product.image; image.alt = ''; image.loading = 'lazy'; heading.append(image); }
      const info = node('div'); info.append(node('h3', product.name), node('p', (product.category || 'Product') + ' · ' + money(product.price) + ' · ID ' + product.id)); heading.append(info); card.append(heading);
      const sizes = node('div', null, 'stock-sizes');
      const availableSizes = Array.isArray(product.sizes) ? product.sizes : Object.keys(product.stock || {});
      for (const size of availableSizes) {
        const quantity = Number(product.stock && product.stock[size]) || 0;
        const field = node('div', null, 'stock-size'); const label = node('label', size); const input = node('input');
        input.type = 'number'; input.min = '0'; input.max = '100000'; input.step = '1'; input.required = true; input.value = String(quantity); input.inputMode = 'numeric';
        input.id = 'stock-' + product.id + '-' + String(size).replace(/[^a-zA-Z0-9-]/g, ''); label.htmlFor = input.id;
        input.setAttribute('aria-label', product.name + ', size ' + size + ', available pieces');
        input.addEventListener('input', () => {
          const key = product.id + ':' + size; const value = input.valueAsNumber;
          const changed = input.value === '' || !Number.isInteger(value) || value !== quantity;
          if (changed) state.changes.set(key, { id: product.id, size, quantity: value, expectedQuantity: quantity }); else state.changes.delete(key);
          input.classList.toggle('changed', changed); updateChanges();
        });
        field.append(label, input); sizes.append(field);
      }
      card.append(sizes); target.append(card);
    }
    updateChanges();
  }
  async function loadReadiness() {
    if (!state.authenticated) return;
    $('readiness-refresh').disabled = true;
    try {
      const data = await request('api/admin/status');
      if (!state.authenticated) return;
      const readiness = data.readiness || {};
      const live = data.orderingEnabled === true;
      $('launch-banner').className = 'launch-banner' + (live ? '' : ' warning');
      $('launch-banner').textContent = live ? 'Checkout is accepting cash-on-delivery orders. Fulfilment and courier booking must be managed by your team.' : 'Checkout is paused. Complete the server launch requirements below before accepting real orders.';
      $('readiness-summary').textContent = live ? 'Your server is accepting orders' : 'Your server is not accepting orders yet';
      const list = $('readiness-list'); list.replaceChildren();
      for (const [label, passed] of [['Live sales enabled', readiness.live === true], ['Product catalog confirmed', readiness.catalogConfirmed === true], ['Administrator password configured', readiness.adminConfigured === true], ['MySQL database connected', readiness.databaseConfigured === true], ['Sellable inventory available', readiness.inventoryAvailable === true]]) {
        const li = node('li'); li.append(node('span', label, 'check-label'), node('span', passed ? 'Ready ✓' : 'Required', passed ? 'check-pass' : 'check-fail')); list.append(li);
      }
      const issues = $('readiness-issues'); issues.replaceChildren();
      if (Array.isArray(data.issues) && data.issues.length) { const ul = node('ul', null, 'issue-list'); for (const issue of data.issues) ul.append(node('li', typeof issue === 'string' ? issue : issue.message || 'Review the server configuration.')); issues.append(ul); }
      const shipping = data.shipping || {};
      $('shipping-summary').textContent = 'Configured delivery charges: inside Dhaka ' + money(shipping.insideDhaka) + ', outside Dhaka ' + money(shipping.outsideDhaka) + (Number(shipping.freeThreshold) > 0 ? '. Free delivery threshold: ' + money(shipping.freeThreshold) + '.' : '.');
      markRefreshed();
    } catch (error) {
      if (state.authenticated) { $('launch-banner').className = 'launch-banner warning'; $('launch-banner').textContent = 'Launch status could not be verified. ' + error.message; $('readiness-summary').textContent = 'Unable to verify server configuration'; $('readiness-list').replaceChildren(); $('readiness-issues').replaceChildren(node('p', error.message, 'form-error')); }
      throw error;
    } finally { $('readiness-refresh').disabled = false; }
  }

  $('connection-retry').addEventListener('click', connect);
  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); inlineError('login-error', ''); message('');
    const password = $('admin-password').value;
    setBusy($('login-button'), true, 'Signing in…');
    try {
      const data = await request('api/admin/login', { method: 'POST', body: { password }, login: true });
      if (typeof data.csrfToken !== 'string' || !data.csrfToken) throw new Error('The server did not establish a secure session. Please try again.');
      await enterDashboard(data.csrfToken);
    } catch (error) { inlineError('login-error', error.message); $('admin-password').value = ''; $('admin-password').focus(); }
    finally { setBusy($('login-button'), false, 'Sign in securely ↗'); }
  });
  $('logout-button').addEventListener('click', async () => {
    const button = $('logout-button'); button.disabled = true;
    let failure = '';
    try { await request('api/admin/logout', { method: 'POST', body: {} }); } catch (error) { if (error.status !== 401) failure = error.message; }
    clearSession(); showLogin(); button.disabled = false;
    message(failure ? 'Store data has been hidden, but the server could not confirm sign-out. Reconnect and sign out again before leaving a shared device. ' + failure : 'You have signed out.', !!failure);
  });
  for (const button of document.querySelectorAll('[data-section]')) button.addEventListener('click', () => selectSection(button.dataset.section));
  $('orders-refresh').addEventListener('click', () => loadOrders().catch(() => {}));
  $('order-status-filter').addEventListener('change', () => { state.page = 1; loadOrders().catch(() => {}); });
  $('previous-page').addEventListener('click', () => { if (state.page > 1) { state.page--; loadOrders().catch(() => {}); } });
  $('next-page').addEventListener('click', () => { if (state.page * state.pageSize < state.total) { state.page++; loadOrders().catch(() => {}); } });
  $('inventory-refresh').addEventListener('click', () => {
    if (state.changes.size && !window.confirm('Discard unsaved stock changes and load the latest inventory?')) return;
    loadInventory().catch(() => {});
  });
  $('readiness-refresh').addEventListener('click', () => loadReadiness().catch(() => {}));
  $('order-dialog-close').addEventListener('click', () => $('order-dialog').close());
  $('order-dialog').addEventListener('click', (event) => { if (event.target === $('order-dialog')) { const bounds = $('order-dialog').getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('order-dialog').close(); } });
  $('order-dialog').addEventListener('close', () => { state.selectedOrder = null; $('order-detail').replaceChildren(); });
  $('inventory-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!state.changes.size || state.busy || !state.authenticated) return;
    if (!$('inventory-form').reportValidity()) return;
    const changes = Array.from(state.changes.values());
    if (changes.some((item) => !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 100000)) { inlineError('inventory-error', 'Stock must be a whole number between 0 and 100,000.'); return; }
    state.busy = true; setBusy($('inventory-save'), true, 'Saving…'); inlineError('inventory-error', '');
    for (const input of $('inventory-products').querySelectorAll('input')) input.disabled = true;
    $('inventory-refresh').disabled = true;
    try {
      const data = await request('api/admin/inventory', { method: 'PATCH', body: { items: changes } });
      if (!state.authenticated) return;
      if (!Array.isArray(data.products)) throw new Error('The server did not confirm inventory. Refresh to check the latest stock.');
      state.products = data.products; state.changes.clear(); renderInventory();
      message('Stock changes saved.'); loadReadiness().catch(() => {});
    } catch (error) {
      if (state.authenticated) inlineError('inventory-error', error.status === 409 && error.code === 'INVENTORY_CHANGED'
        ? 'Inventory changed while you were editing, possibly because a customer placed an order. No stock changes were saved. Refresh inventory, review the latest quantities, then enter your changes again.'
        : error.message);
    }
    finally { state.busy = false; $('inventory-save').textContent = 'Save stock changes'; for (const input of $('inventory-products').querySelectorAll('input')) input.disabled = false; $('inventory-refresh').disabled = false; updateChanges(); }
  });
  $('export-button').addEventListener('click', async () => {
    if (!state.authenticated) return;
    setBusy($('export-button'), true, 'Exporting…');
    try {
      const blob = await request('api/admin/orders.csv', { csv: true });
      if (!state.authenticated) return;
      const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = 'richkid-orders-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Orders exported. This file contains customer information; keep it private.');
    } catch (error) { if (state.authenticated) message(error.message, true); }
    finally { setBusy($('export-button'), false, 'Export CSV'); }
  });
  window.addEventListener('beforeunload', (event) => { if (state.changes.size) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pageshow', (event) => { if (event.persisted) connect(); });
  connect();
}());
