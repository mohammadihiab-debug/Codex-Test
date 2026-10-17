import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Heart, Menu, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, Trash2, Truck, X, Instagram, Facebook, Mail, RotateCcw } from 'lucide-react';
import { products, categories, formatPrice } from './catalog.js';

function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function Logo({ onClick }) {
  return <a className="logo" href="#" onClick={onClick} aria-label="Richkid home">RICHKID<span className="logo-dot">®</span></a>;
}

function Modal({ children, title, onClose, className = '', drawer = false }) {
  const panel = useRef(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => (panel.current?.querySelector('input') ?? panel.current?.querySelector('button, select, a[href]'))?.focus(), 10);
    function onKey(event) {
      if (event.key === 'Escape') closeHandler.current();
      if (event.key === 'Tab') {
        const elements = [...(panel.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
        if (!elements.length) { event.preventDefault(); return; }
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`}>
    <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
    <section ref={panel} className={`${drawer ? 'drawer' : 'modal'} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className={drawer ? 'drawer-header' : 'modal-header'}><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={23} /></button></div>
      {children}
    </section>
  </div>;
}

function ProductCard({ product, saved, onSave, onSelect }) {
  return <article className="product-card">
    <div className="product-image-wrap">
      <button className="product-image-link" onClick={() => onSelect(product)} aria-label={`View ${product.name}`}>
        <img className="product-image" src={product.image} alt={product.name} loading="lazy" />
      </button>
      {product.badge && <span className={`product-badge ${product.originalPrice ? 'badge-sale' : ''}`}>{product.badge}</span>}
      <button className={`wishlist-button ${saved ? 'is-saved' : ''}`} onClick={() => onSave(product.id)} aria-label={`${saved ? 'Remove' : 'Save'} ${product.name}${saved ? ' from' : ' to'} wishlist`} aria-pressed={saved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>
      <button className="quick-add" onClick={() => onSelect(product)}>Choose your size <Plus size={17} /></button>
    </div>
    <div className="product-details"><div className="product-category">{product.category}</div><button className="product-name" onClick={() => onSelect(product)}>{product.name}</button>
      <div className="product-bottom"><div className="product-price">{formatPrice(product.price)} {product.originalPrice && <span className="original-price">{formatPrice(product.originalPrice)}</span>}</div><div className="color-swatches" aria-label="Color palette">{product.colors.map((color, i) => <span key={color.name} title={color.name} className={`swatch ${i === 0 ? 'selected' : ''}`} style={{ backgroundColor: color.value }} />)}</div></div>
    </div>
  </article>;
}

function ProductDetail({ product, onAdd, onClose }) {
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  return <Modal title="A closer look" onClose={onClose} className="product-modal">
    <div className="product-modal-layout"><img className="product-modal-image" src={product.image} alt={product.name} />
      <div className="product-modal-info"><p className="eyebrow">RICHKID ESSENTIALS / {product.category}</p><h2>{product.name}</h2><p className="detail-price">{formatPrice(product.price)} {product.originalPrice && <span className="original-price">{formatPrice(product.originalPrice)}</span>}</p><p className="detail-description">{product.description || 'Your new everyday favorite. Thoughtfully made with a comfortable fit and quality details that go the distance.'}</p>
        <div className="size-label"><span>Select size {size && <strong>— {size}</strong>}</span><span>True to size</span></div><div className="size-options">{product.sizes.map(s => <button key={s} className={`size-option ${size === s ? 'selected' : ''}`} aria-pressed={size === s} onClick={() => { setSize(s); setSizeError(false); }}>{s}</button>)}</div>{sizeError && <p className="field-error" role="alert">Please choose your size.</p>}
        <div className="product-modal-actions"><div className="quantity-control"><button aria-label="Decrease quantity" disabled={quantity === 1} onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={14} /></button><span>{quantity}</span><button aria-label="Increase quantity" disabled={quantity === 10} onClick={() => setQuantity(q => Math.min(10, q + 1))}><Plus size={14} /></button></div><button className="button button-dark" onClick={() => { if (!size) return setSizeError(true); onAdd(product, size, quantity); }}>Add to bag <ShoppingBag size={17} /></button></div>
        <ul className="detail-list"><li><Truck size={17} /> Delivery across Bangladesh</li><li><RotateCcw size={17} /> Easy 7-day exchanges</li><li><ShieldCheck size={17} /> Cash on delivery available</li></ul>
      </div>
    </div>
  </Modal>;
}

const information = {
  'Our story': ['GOOD CLOTHES. GOOD ENERGY.', 'RICHKID is a storefront concept for everyday essentials with a little more personality. Discover easy fits, considered colors, and the pieces you reach for again and again.', 'This website is an independent design demonstration inspired by a fashion shopping experience. It is not the official richkidbd.com store.'],
  'Shipping & delivery': ['FROM OUR BAG TO YOUR DOOR.', 'This demo uses a ৳80 standard delivery charge across Bangladesh, with free delivery on merchandise orders of ৳2,500 or more.', 'A production store would confirm service areas, delivery dates, and tracking after an order is accepted. No real shipments are created here.'],
  'Returns & exchanges': ['FIND YOUR PERFECT FIT.', 'The sample storefront advertises a 7-day exchange window for unworn items in original condition. Size availability would be confirmed by the store.', 'This is a demonstration policy, not a promise from the official RICHKID store.'],
  'Contact us': ['LET’S TALK STYLE.', 'Need help choosing a size or finding an everyday essential? This concept includes product details and a shopping bag you can try.', 'Customer support channels and social accounts can be connected when the store is launched.'],
  'Privacy policy': ['YOUR DETAILS STAY WITH YOU.', 'Your shopping bag and saved items are stored in this browser. The demo checkout and email form do not send your information to a server.', 'You can remove saved data by clearing this site’s browser storage. A full privacy policy is required before collecting customer information in production.'],
  'Terms of service': ['A FEW THINGS TO KNOW.', 'This is an interactive storefront demonstration. Product listings and prices are sample content. Checkout does not process payments or submit real orders.', 'Images are used to demonstrate the design. Review assets, policies, inventory, and integrations before launching a commercial store.'],
};

export default function App() {
  const [category, setCategory] = useState('All products');
  const [sort, setSort] = useState('featured');
  const [cart, setCart] = useState(() => {
    const stored = readSaved('richkid-bag', []);
    return Array.isArray(stored) ? stored.filter(x => x && typeof x === 'object' && products.some(p => p.id === x.id && p.sizes.includes(x.size)) && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 10) : [];
  });
  const [saved, setSaved] = useState(() => { const stored = readSaved('richkid-saved', []); return Array.isArray(stored) ? stored : []; });
  const [view, setView] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [toast, setToast] = useState('');
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [order, setOrder] = useState(null);
  const [info, setInfo] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => { try { localStorage.setItem('richkid-bag', JSON.stringify(cart)); } catch {} }, [cart]);
  useEffect(() => { try { localStorage.setItem('richkid-saved', JSON.stringify(saved)); } catch {} }, [saved]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const cartItems = cart.map(item => ({ ...item, product: products.find(p => p.id === item.id) }));
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const delivery = subtotal >= 2500 || subtotal === 0 ? 0 : 80;
  const shownProducts = useMemo(() => {
    let result = products.filter(p => (category === 'All products' || p.category === category) && (!savedOnly || saved.includes(p.id)));
    if (sort === 'price-low') result.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') result.sort((a, b) => b.price - a.price);
    if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [category, sort, savedOnly, saved]);
  const searchResults = products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(search.trim().toLowerCase()));

  function notify(message) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3300); }
  function shop(next = 'All products') { setCategory(next); setSavedOnly(false); setMenuOpen(false); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function toggleSaved(id) { setSaved(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]); }
  function addToCart(product, size, quantity) {
    const existing = cart.find(x => x.id === product.id && x.size === size);
    if (existing && existing.quantity + quantity > 10) { notify('You can add up to 10 of each size.'); return; }
    setCart(current => existing ? current.map(x => x.id === product.id && x.size === size ? { ...x, quantity: x.quantity + quantity } : x) : [...current, { id: product.id, size, quantity }]);
    setSelected(null); setView('cart'); notify('Good choice. Added to your bag.');
  }
  function changeQuantity(id, size, change) { setCart(current => current.map(x => x.id === id && x.size === size ? { ...x, quantity: x.quantity + change } : x).filter(x => x.quantity > 0)); }
  function showSaved() { setSavedOnly(true); setCategory('All products'); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); }
  function closeView() { setView(null); }
  function showInfo(name) { setInfo(name); }
  function placeOrder(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setOrder({ reference: `RK-${Date.now().toString().slice(-6)}`, name: String(data.get('name')).trim().split(' ')[0], total: subtotal + delivery, count: itemCount });
    setCart([]); setView('success');
  }

  return <>
    <a className="skip-link" href="#shop">Skip to products</a>
    <div className="announcement"><div className="announcement-inner"><span>GOOD STYLE HAS NO LIMITS.</span><span>Free shipping on orders ৳2,500+ <ArrowUpRight size={12} /></span><span>MADE FOR YOUR EVERYDAY.</span></div></div>
    <header className="site-header"><div className="header-inner">
      <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={23} /></button>
      <Logo onClick={event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      <nav className="desktop-nav" aria-label="Main navigation"><a className="nav-link" href="#shop" onClick={e => { e.preventDefault(); shop(); }}>New arrivals <span className="nav-new">NEW</span></a><a className="nav-link" href="#categories">Collections <ChevronDown size={12} /></a><a className="nav-link" href="#shop" onClick={e => { e.preventDefault(); shop('T-Shirts'); }}>T-shirts</a><a className="nav-link" href="#shop" onClick={e => { e.preventDefault(); shop('Shirts'); }}>Shirts</a><a className="nav-link sale-link" href="#shop" onClick={e => { e.preventDefault(); setCategory('All products'); setSort('price-low'); shop(); }}>The good deals</a></nav>
      <div className="header-actions"><button className="icon-button" onClick={() => { setSearch(''); setView('search'); }} aria-label="Search products"><Search size={21} /></button><button className="icon-button saved-header" onClick={showSaved} aria-label={`View wishlist, ${saved.length} saved items`}><Heart size={21} />{saved.length > 0 && <span className="saved-indicator" />}</button><button className="icon-button bag-button" onClick={() => setView('cart')} aria-label={`Open shopping bag, ${itemCount} items`}><ShoppingBag size={21} /><span className="bag-count">{itemCount}</span></button></div>
    </div></header>

    <main>
      <section className="hero" aria-label="New season collection">
        <div className="hero-content"><p className="eyebrow"><span className="accent-line" /> THE NEW EVERYDAY COLLECTION</p><h1>EVERYDAY,<br /><span>ELEVATED.</span></h1><p className="hero-copy">Good fits. Fresh energy. Discover essentials<br className="desktop-break" /> that look as good as they feel.</p><button className="button button-dark" onClick={() => shop()}>Find your next favorite <ArrowUpRight size={19} /></button><div className="hero-footer"><span className="small-cross">✳︎</span><span>YOUR STYLE. YOUR WAY.<br /><strong>ALWAYS RICHKID.</strong></span></div></div>
        <div className="hero-visual"><img className="hero-image" src="/images/hero.jpg" alt="New season relaxed fashion collection" fetchPriority="high" /><div className="hero-image-label"><span>LESS EFFORT.<br /><strong>MORE YOU.</strong></span><span className="hero-image-number">THE EVERYDAY EDIT</span></div></div><div className="hero-sticker" aria-hidden="true"><span>LOOK GOOD</span><span className="sticker-star">✳︎</span><span>FEEL GOOD</span></div>
      </section>

      <section className="service-strip" aria-label="Shopping benefits"><div className="service-item"><Truck className="service-icon" size={23} strokeWidth={1.5} /><div><strong>Delivered to your doorstep</strong><span>All across Bangladesh</span></div></div><div className="service-item"><RotateCcw className="service-icon" size={22} strokeWidth={1.5} /><div><strong>Not the right fit?</strong><span>Easy 7-day exchanges</span></div></div><div className="service-item"><ShieldCheck className="service-icon" size={23} strokeWidth={1.5} /><div><strong>Shop with confidence</strong><span>Cash on delivery available</span></div></div><div className="service-item"><Package className="service-icon" size={23} strokeWidth={1.5} /><div><strong>Quality in every detail</strong><span>Made to be worn on repeat</span></div></div></section>

      <section className="section category-section" id="categories"><div className="section-heading"><div><p className="section-label">BUILD YOUR ROTATION</p><h2>Your wardrobe. Sorted.</h2></div><a className="text-link" href="#shop" onClick={e => { e.preventDefault(); shop(); }}>Explore all <ArrowUpRight size={17} /></a></div><div className="category-grid">{categories.map(cat => <button className="category-card" key={cat.name} onClick={() => shop(cat.name)}><img className="category-image" src={cat.image || products.find(p => p.category === cat.name)?.image} alt={`${cat.name} collection`} loading="lazy" /><div className="category-overlay"><div><span className="category-count">THE ESSENTIAL EDIT</span><span className="category-title">{cat.name}</span></div><span className="category-arrow"><ArrowUpRight size={20} /></span></div></button>)}</div></section>

      <section className="section shop-section" id="shop"><div className="section-heading shop-heading"><div><p className="section-label">FRESH FINDS. GOOD VIBES.</p><h2>{savedOnly ? 'Your saved favorites.' : 'Meet your new favorites.'}</h2></div><span className="collection-count">{shownProducts.length} good-looking essentials</span></div><div className="collection-controls"><div className="category-tabs" role="group" aria-label="Filter by category">{['All products', ...categories.map(c => c.name)].map(cat => <button className={`category-tab ${category === cat ? 'active' : ''}`} key={cat} onClick={() => setCategory(cat)} aria-pressed={category === cat}>{cat}</button>)}</div><label className="sort-select"><span>Sort by:</span><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select><ChevronDown size={13} /></label></div>{savedOnly && <div className="saved-filter"><Heart size={15} /> Showing your wishlist <button onClick={() => setSavedOnly(false)}>Show all products <X size={13} /></button></div>}
        <div className="product-grid">{shownProducts.map(product => <ProductCard key={product.id} product={product} saved={saved.includes(product.id)} onSave={toggleSaved} onSelect={setSelected} />)}</div>{shownProducts.length === 0 && <div className="empty-state"><Heart size={32} strokeWidth={1} /><h3>A little empty, a lot of possibilities.</h3><p>Tap the heart on something you love to save it here.</p><button className="button button-dark" onClick={() => { setSavedOnly(false); setCategory('All products'); }}>Explore the collection <ArrowRight size={17} /></button></div>}<div className="collection-footer"><span>Less scrolling. More good fits.</span><button className="text-link" onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>Back to the collection <ArrowDown size={15} /></button></div>
      </section>

      <section className="editorial"><div className="editorial-image"><img src="/images/editorial.jpg" alt="Relaxed style from the everyday collection" loading="lazy" /><span className="editorial-tag">THE RICHKID WAY</span></div><div className="editorial-content"><p className="section-label">CONFIDENCE COMES STANDARD.</p><h2>NOT JUST A FIT.<br />A FEELING.</h2><p>For the coffee runs. The late nights. The everyday<br className="desktop-break" /> moments that become your best memories.<br /><br />Wear what feels like you.</p><button className="button button-light" onClick={() => shop()}>Make it your own <ArrowUpRight size={18} /></button><span className="editorial-stamp" aria-hidden="true">✳︎</span></div></section>

      <section className="newsletter"><div className="newsletter-copy"><p className="section-label">THE INNER CIRCLE</p><h2>Good fits. First dibs.</h2><p>New drops, special offers, and a little style inspiration. Straight to your inbox.</p></div>{subscribed ? <div className="newsletter-success" role="status"><CheckCircle2 size={26} /><div><strong>You’re on the list.</strong><p>Thanks for trying the signup. This demo stores no email addresses.</p></div></div> : <form className="newsletter-form" onSubmit={event => { event.preventDefault(); setSubscribed(true); setEmail(''); }}><label className="input-group"><span className="sr-only">Your email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email address" required maxLength={254} /><button aria-label="Join the newsletter" type="submit"><ArrowRight size={23} /></button></label><span>No spam. Just the good stuff. Unsubscribe anytime.</span></form>}</section>
    </main>

    <footer className="site-footer"><div className="footer-top"><div className="footer-brand"><Logo onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /><p>Everyday essentials.<br />Uncommon style. Always you.</p><div className="footer-socials"><button onClick={() => showInfo('Contact us')} aria-label="Instagram information"><Instagram size={18} /></button><button onClick={() => showInfo('Contact us')} aria-label="Facebook information"><Facebook size={18} /></button><button onClick={() => showInfo('Contact us')} aria-label="Contact information"><Mail size={18} /></button></div></div><div className="footer-links"><h3>THE COLLECTION</h3>{categories.map(c => <button key={c.name} onClick={() => shop(c.name)}>{c.name}</button>)}</div><div className="footer-links"><h3>WE’RE HERE TO HELP</h3>{['Contact us', 'Shipping & delivery', 'Returns & exchanges'].map(item => <button key={item} onClick={() => showInfo(item)}>{item}</button>)}<button onClick={showSaved}>Your wishlist</button></div><div className="footer-links"><h3>A LITTLE ABOUT US</h3>{['Our story', 'Privacy policy', 'Terms of service'].map(item => <button key={item} onClick={() => showInfo(item)}>{item}</button>)}<span className="footer-location">Dhaka, Bangladesh <span>↗</span></span></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} RICHKID. A storefront design concept.</span><span className="footer-signoff">MADE FOR YOUR EVERYDAY. <span>✳︎</span></span><div className="payment-badges"><span>bKash</span><span>Nagad</span><span>CASH ON DELIVERY</span></div></div></footer>

    {selected && <ProductDetail key={selected.id} product={selected} onAdd={addToCart} onClose={() => setSelected(null)} />}
    {view === 'search' && <Modal title="Find your next favorite" className="search-modal" onClose={closeView}><div className="modal-body"><label className="search-input"><Search size={22} /><input type="search" placeholder="Try ‘shirt’, ‘relaxed’, or ‘polo’…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search collection" /></label><p className="search-hint">{search ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for “${search}”` : 'A few favorites to get you started'}</p><div className="search-results">{(search ? searchResults : products.slice(0, 4)).map(product => <button className="search-result" key={product.id} onClick={() => { setView(null); setSelected(product); }}><img className="search-result-image" src={product.image} alt="" /><span><small>{product.category}</small><strong>{product.name}</strong><span>{formatPrice(product.price)}</span></span><ArrowUpRight size={18} /></button>)}</div>{searchResults.length === 0 && <div className="empty-state"><Search size={27} /><h3>No matches just yet.</h3><p>Try a category like shirts, polos, or trousers.</p><button className="text-link" onClick={() => setSearch('')}>Clear search <X size={14} /></button></div>}</div></Modal>}
    {view === 'cart' && <Modal title={`Your bag (${itemCount})`} onClose={closeView} drawer><div className="drawer-body">{cartItems.length ? <><div className="shipping-progress"><p>{subtotal >= 2500 ? <><Check size={16} /> Your order qualifies for free delivery!</> : <>You’re <strong>{formatPrice(2500 - subtotal)}</strong> away from free delivery.</>}</p><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(subtotal / 2500 * 100, 100)}%` }} /></div></div>{cartItems.map(item => <article className="cart-line" key={`${item.id}-${item.size}`}><img className="cart-line-image" src={item.product.image} alt={item.product.name} /><div className="cart-line-info"><span>{item.product.category}</span><h3>{item.product.name}</h3><p>Size: {item.size}</p><div className="quantity-control"><button aria-label={`Decrease ${item.product.name} quantity`} onClick={() => changeQuantity(item.id, item.size, -1)}><Minus size={12} /></button><span>{item.quantity}</span><button aria-label={`Increase ${item.product.name} quantity`} disabled={item.quantity >= 10} onClick={() => changeQuantity(item.id, item.size, 1)}><Plus size={12} /></button></div></div><div className="cart-line-price"><strong>{formatPrice(item.product.price * item.quantity)}</strong><button className="remove-item" onClick={() => setCart(current => current.filter(x => !(x.id === item.id && x.size === item.size)))} aria-label={`Remove ${item.product.name}`}><Trash2 size={15} /></button></div></article>)}</> : <div className="empty-cart"><ShoppingBag size={44} strokeWidth={1} /><h3>Your next good fit starts here.</h3><p>Your bag is waiting for something you love.</p><button className="button button-dark" onClick={() => { closeView(); shop(); }}>Find your favorites <ArrowRight size={17} /></button></div>}</div>{cartItems.length > 0 && <div className="drawer-footer"><div className="cart-totals"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div><div className="cart-totals"><span>Delivery</span><span>{delivery ? formatPrice(delivery) : 'On us'}</span></div><div className="cart-total"><span>Total</span><strong>{formatPrice(subtotal + delivery)}</strong></div><button className="button button-dark button-full" onClick={() => setView('checkout')}>Continue to checkout <ArrowRight size={18} /></button><p className="cart-note"><ShieldCheck size={13} /> Demo checkout · No payment is collected</p></div>}</Modal>}
    {view === 'checkout' && <Modal title="The last little step" onClose={closeView} className="checkout-modal"><div className="modal-body"><p className="checkout-intro">Try the checkout experience. This is a demo; no real order or payment will be created.</p><form className="checkout-form" onSubmit={placeOrder}><label className="form-field">Full name<input name="name" autoComplete="name" placeholder="Your full name" required minLength={2} maxLength={100} /></label><div className="field-row"><label className="form-field">Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label><label className="form-field">Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="01XXXXXXXXX" required pattern="[+]?[0-9][0-9 ]{6,18}[0-9]" title="Enter 8–20 digits, optionally starting with + and including spaces" /></label></div><label className="form-field">Delivery address<textarea name="address" autoComplete="street-address" placeholder="House, road, area, and city" required minLength={8} maxLength={500} rows={3} /></label><div className="checkout-payment"><CheckCircle2 size={19} /><span><strong>Cash on delivery</strong><small>Demo payment method — nothing is charged</small></span></div><div className="cart-totals"><span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span><span>{formatPrice(subtotal)}</span></div><div className="cart-totals"><span>Delivery</span><span>{delivery ? formatPrice(delivery) : 'Free'}</span></div><div className="cart-total"><span>Total</span><strong>{formatPrice(subtotal + delivery)}</strong></div><button className="button button-dark button-full" type="submit">Place demo order <ArrowRight size={18} /></button><button className="text-link checkout-back" type="button" onClick={() => setView('cart')}>Back to your bag</button></form></div></Modal>}
    {view === 'success' && order && <Modal title="Looking good!" onClose={closeView}><div className="modal-body order-success"><CheckCircle2 size={55} strokeWidth={1.3} /><p className="eyebrow">DEMO ORDER COMPLETE</p><h2>Great choices, {order.name}.</h2><p>You’ve completed the shopping experience.<br />No real order was sent and no payment was taken.</p><div className="order-summary"><span>Reference <strong>{order.reference}</strong></span><span>{order.count} item{order.count !== 1 ? 's' : ''} <strong>{formatPrice(order.total)}</strong></span></div><button className="button button-dark" onClick={() => { closeView(); shop(); }}>Keep the good fits coming <ArrowRight size={17} /></button></div></Modal>}
    {info && <Modal title={info} onClose={() => setInfo(null)}><div className="modal-body info-content"><h3>{information[info][0]}</h3>{information[info].slice(1).map(p => <p key={p}>{p}</p>)}</div></Modal>}
    {menuOpen && <Modal title="Explore RICHKID" onClose={() => setMenuOpen(false)} drawer className="mobile-navigation"><nav aria-label="Mobile navigation"><button onClick={() => shop()}>New arrivals <ArrowUpRight size={20} /></button>{categories.map(cat => <button key={cat.name} onClick={() => shop(cat.name)}>{cat.name}<ArrowUpRight size={20} /></button>)}<button onClick={() => { setMenuOpen(false); showSaved(); }}>Your wishlist <Heart size={20} /></button></nav><p>YOUR STYLE. YOUR WAY. ALWAYS RICHKID.</p></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
  </>;
}
