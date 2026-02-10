(() => {
  "use strict";

  const PS = {
    config: null,
    products: [],
    cacheBuster: Date.now(),
    cartKey: "ps_cart_v4"
  };

  // ---------- utils ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function money(n){
    const v = Number(n || 0);
    return `$${v.toFixed(2)}`;
  }

  function getParam(name){
    const url = new URL(location.href);
    return url.searchParams.get(name);
  }

  async function loadJSON(file){
    const url = `${file}?v=${PS.cacheBuster}`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
    return await res.json();
  }

  function showNotice(msg){
    const box = $("#loadNotice");
    if(!box) return;
    box.style.display = "block";
    box.textContent = msg;
  }

  function hideNotice(){
    const box = $("#loadNotice");
    if(!box) return;
    box.style.display = "none";
    box.textContent = "";
  }

  // ---------- cart ----------
  function getCart(){
    try{
      const raw = localStorage.getItem(PS.cartKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    }catch{
      return [];
    }
  }

  function setCart(cart){
    localStorage.setItem(PS.cartKey, JSON.stringify(cart));
    updateCartBadge();
  }

  function cartCount(){
    return getCart().reduce((sum, it) => sum + (Number(it.qty)||0), 0);
  }

  function updateCartBadge(){
    const el = $("#cartCount");
    if(el) el.textContent = String(cartCount());
  }

  function addToCart(productId, variantLabel){
    const cart = getCart();
    const hit = cart.find(it => it.id === productId && it.variant === variantLabel);
    if(hit) hit.qty += 1;
    else cart.push({ id: productId, variant: variantLabel, qty: 1 });
    setCart(cart);
    toast("Added to cart.");
  }

  function toast(msg){
    const t = $("#toast");
    const tt = $("#toastText");
    if(!t || !tt) return;
    tt.textContent = msg;
    t.classList.add("show");
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => t.classList.remove("show"), 2000);
  }

  // ---------- rating ----------
  function stars(rating){
    const r = Math.max(0, Math.min(5, Number(rating || 0)));
    const full = Math.floor(r);
    const half = (r - full) >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    // We keep it simple visually (no half glyph), still looks good
    return "★".repeat(full + half) + "☆".repeat(empty);
  }

  // ---------- config apply ----------
  function applyBrand(){
    if(!PS.config) return;
    const s = PS.config.store || {};
    const name = s.name || "Premium Supply";
    const tag = s.tagline || "Space Store";
    const badge = s.countryBadge || "100% Canadian";

    const brandName = $("#brandName"); if(brandName) brandName.textContent = name;
    const brandTag = $("#brandTag"); if(brandTag) brandTag.textContent = tag;
    const badgeEl = $("#topbarLeft"); if(badgeEl) badgeEl.textContent = badge;

    const year = $("#year"); if(year) year.textContent = String(new Date().getFullYear());
    const brandNameFoot = $("#brandNameFoot"); if(brandNameFoot) brandNameFoot.textContent = name;

    // rules pills
    const rules = s.rules || {};
    const min = rules.minimumOrder ?? 75;
    const free = rules.freeShippingThreshold ?? 250;

    const minP = $("#minOrderPill"); if(minP) minP.textContent = `Min order $${min}`;
    const freeP = $("#freeShipPill"); if(freeP) freeP.textContent = `Free shipping $${free}+`;
  }

  // ---------- promo strip (single banner under header) ----------
  function initPromoStrip(){
    const strip = $("#promoStrip");
    const textEl = $("#promoStripText");
    const ctaEl = $("#promoStripCta");

    if(!strip || !textEl || !ctaEl) return;

    const ps = PS.config?.store?.promoStrip;
    if(!ps || ps.enabled === false){
      strip.hidden = true;
      return;
    }

    textEl.textContent = ps.text || "";
    ctaEl.textContent = ps.ctaLabel || "Shop";
    ctaEl.href = ps.ctaHref || "shop.html";
    strip.hidden = false;
  }

  // ---------- sidebar categories ----------
  function renderDrawerCategories(activeCategory){
    const host = $("#drawerCats");
    if(!host) return;

    const cats = (PS.config?.categories || []).filter(Boolean);
    host.innerHTML = cats.map(c => {
      const isActive = activeCategory && String(c).toLowerCase() === String(activeCategory).toLowerCase();
      return `<a class="cat-link" href="category.html?c=${encodeURIComponent(c)}" ${isActive ? 'aria-current="page"' : ""}>
        ${escapeHtml(c)}
      </a>`;
    }).join("");
  }

  // ---------- category dropdown ----------
  function initCategoryDropdown(currentCategory){
    const sel = $("#categorySelect");
    if(!sel) return;

    const cats = (PS.config?.categories || []).filter(Boolean);
    sel.innerHTML =
      `<option value="__all__">All Products</option>` +
      cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

    if(currentCategory && cats.includes(currentCategory)) sel.value = currentCategory;
    else sel.value = "__all__";

    sel.addEventListener("change", () => {
      const val = sel.value;
      if(val === "__all__") location.href = "shop.html";
      else location.href = `category.html?c=${encodeURIComponent(val)}`;
    });
  }

  // ---------- pricing helpers ----------
  function defaultVariantLabel(p){
    const v = Array.isArray(p.variants) ? p.variants : [];
    return v[0]?.label || "";
  }

  function variantPrice(p, label){
    const v = Array.isArray(p.variants) ? p.variants : [];
    const hit = v.find(x => x.label === label);
    return hit ? Number(hit.price) : Number(v[0]?.price || 0);
  }

  function basePrice(p){
    return variantPrice(p, defaultVariantLabel(p));
  }

  // ---------- product card for GRID pages ----------
  function productCard(p){
    const list = Array.isArray(p.variants) ? p.variants : [];
    const selected = defaultVariantLabel(p);
    const price = variantPrice(p, selected);

    const sale = (p.badges || []).map(b => String(b).toLowerCase()).includes("sale");

    return `
      <article class="product-tile" data-id="${escapeHtml(p.id)}">
        <div class="product-tile__media">
          ${sale ? `<span class="sale-bubble">Sale!</span>` : ""}
          <a class="product-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${escapeHtml(p.name)}">
            <div class="media-square">
              <img src="${escapeHtml(p.image || "")}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
            </div>
            <div class="type-strip">${escapeHtml(p.type || "—")}</div>
          </a>
        </div>

        <div class="product-tile__body">
          <div class="pill-row">
            <span class="pill-mini">${escapeHtml(p.tier || "Premium")}</span>
            <span class="pill-mini">${escapeHtml(p.category || "")}</span>
          </div>

          <a class="product-title-link" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a>

          <div class="rating">
            <div class="stars">${stars(p.rating)}</div>
            <div class="reviews">${Number(p.reviews||0)} reviews</div>
          </div>

          <div class="price">
            <span class="money js-price" data-id="${escapeHtml(p.id)}">${money(price)}</span>
            <span class="muted">${escapeHtml(PS.config?.store?.currency || "CAD")}</span>
          </div>

          <div class="buy-row">
            <div class="qty-block">
              <div class="qty-block__label">Quantity</div>
              <div class="qty-block__selectwrap">
                <select class="variant-select js-variant" data-id="${escapeHtml(p.id)}" aria-label="Quantity">
                  ${list.map(v => `<option value="${escapeHtml(v.label)}" ${v.label===selected?"selected":""}>${escapeHtml(v.label)}</option>`).join("")}
                </select>
              </div>
            </div>

            <button class="btn btn--solid js-buy" type="button" data-id="${escapeHtml(p.id)}">Buy</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderGrid(list){
    const grid = $("#grid");
    if(!grid) return;
    grid.innerHTML = list.map(productCard).join("");

    // variant change updates price
    $$(".js-variant", grid).forEach(sel => {
      sel.addEventListener("change", () => {
        const id = sel.dataset.id;
        const p = PS.products.find(x => x.id === id);
        if(!p) return;
        const price = variantPrice(p, sel.value);
        const priceEl = $(`.js-price[data-id="${CSS.escape(id)}"]`);
        if(priceEl) priceEl.textContent = money(price);
      });
    });

    // buy buttons
    $$(".js-buy", grid).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const sel = $(`.js-variant[data-id="${CSS.escape(id)}"]`, grid);
        const variant = sel ? sel.value : "";
        addToCart(id, variant);
      });
    });
  }

  // ---------- HOME mini card + carousels ----------
  function miniCard(p){
    const price = basePrice(p);
    return `
      <div class="carousel__item">
        <a class="mini-card" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${escapeHtml(p.name)}">
          <div class="mini-card__media">
            <div class="mini-card__frame">
              <img src="${escapeHtml(p.image||"")}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
            </div>
            <div class="mini-card__tag">${escapeHtml(p.type || "—")}</div>
          </div>

          <div class="mini-card__body">
            <div class="mini-card__name">${escapeHtml(p.name)}</div>

            <div class="mini-card__meta">
              <div class="mini-stars">${stars(p.rating)}</div>
              <div class="mini-reviews">${Number(p.reviews||0)} reviews</div>
            </div>

            <div class="mini-card__price">
              <span class="mini-money">${money(price)}</span>
              <span class="muted">${escapeHtml(PS.config?.store?.currency || "CAD")}</span>
            </div>
          </div>
        </a>
      </div>
    `;
  }

  function renderHome(){
    renderDrawerCategories(null);

    // category chips
    const chipHost = $("#homeCatChips");
    const cats = (PS.config?.categories || []).filter(Boolean);

    if(chipHost){
      chipHost.innerHTML = cats.map(c => {
        const icon = ({
          "Flower":"fa-seedling",
          "Concentrates":"fa-droplet",
          "Edibles":"fa-cookie-bite",
          "Vapes":"fa-wind",
          "CBD":"fa-leaf",
          "Mushrooms":"fa-mug-hot",
          "Oils":"fa-bottle-droplet",
          "Male Enhancers":"fa-bolt"
        })[c] || "fa-star";

        return `<a class="cat-chip" href="category.html?c=${encodeURIComponent(c)}">
          <i class="fa-solid ${icon}"></i> ${escapeHtml(c)}
        </a>`;
      }).join("");
    }

    // carousels by category
    const host = $("#homeCarousels");
    if(!host) return;

    const count = Number(PS.config?.store?.home?.carouselCount ?? 10);

    host.innerHTML = cats.map(cat => {
      const items = PS.products
        .filter(p => String(p.category) === String(cat))
        .slice()
        .sort((a,b) => (Number(b.rating||0) - Number(a.rating||0)) || (basePrice(b) - basePrice(a)))
        .slice(0, count);

      return `
        <div class="home-row">
          <div class="home-row__head">
            <h3 class="home-row__title">${escapeHtml(cat)}</h3>
            <a class="link" href="category.html?c=${encodeURIComponent(cat)}">View all</a>
          </div>

          <div class="carousel" aria-label="${escapeHtml(cat)} products">
            ${items.map(miniCard).join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------- Search ----------
  const state = { q: "", sort: "price_desc" };

  function applyFilters(baseList){
    let list = baseList.slice();

    const q = state.q.trim().toLowerCase();
    if(q){
      list = list.filter(p =>
        String(p.name||"").toLowerCase().includes(q) ||
        String(p.category||"").toLowerCase().includes(q) ||
        String(p.type||"").toLowerCase().includes(q)
      );
    }

    if(state.sort === "price_desc"){
      list.sort((a,b) => basePrice(b) - basePrice(a));
    } else if(state.sort === "price_asc"){
      list.sort((a,b) => basePrice(a) - basePrice(b));
    } else if(state.sort === "rating_desc"){
      list.sort((a,b) => Number(b.rating||0) - Number(a.rating||0));
    }

    return list;
  }

  function initSearch(baseList, onUpdate){
    const q = $("#q");
    const sort = $("#sort");
    const clearBtn = $("#clearBtn");
    if(!q || !sort || !clearBtn) return;

    q.value = "";
    sort.value = state.sort;

    q.addEventListener("input", () => {
      state.q = q.value;
      onUpdate(applyFilters(baseList));
    });

    sort.addEventListener("change", () => {
      state.sort = sort.value;
      onUpdate(applyFilters(baseList));
    });

    clearBtn.addEventListener("click", () => {
      q.value = "";
      state.q = "";
      onUpdate(applyFilters(baseList));
    });

    // auto-open if ?search=1
    const open = getParam("search");
    const toggle = $("#searchToggle");
    if(open === "1" && toggle){
      toggle.checked = true;
      q.focus();
    }
  }

  // ---------- Pages ----------
  function initShopPage(){
    renderDrawerCategories(null);
    initCategoryDropdown(null);

    state.sort = PS.config?.sortDefault || "price_desc";

    const list = applyFilters(PS.products);
    renderGrid(list);
    initSearch(PS.products, (newList) => renderGrid(newList));
  }

  function initCategoryPage(){
    const category = getParam("c") || "";
    $("#topbarTitle") && ($("#topbarTitle").textContent = category || "Category");
    $("#catTitle") && ($("#catTitle").textContent = category || "Category");

    renderDrawerCategories(category);
    initCategoryDropdown(category);

    state.sort = PS.config?.sortDefault || "price_desc";

    const base = PS.products.filter(p => String(p.category) === String(category));
    if(!base.length){
      showNotice(`No products found for "${category}". Make sure catalog.json uses the exact same category name.`);
      renderGrid([]);
      return;
    }

    hideNotice();
    const list = applyFilters(base);
    renderGrid(list);
    initSearch(base, (newList) => renderGrid(newList));
  }

  function initProductPage(){
    const id = getParam("id") || "";
    const p = PS.products.find(x => x.id === id);
    if(!p){
      showNotice("Product not found. Check the product id in the URL.");
      return;
    }

    renderDrawerCategories(p.category || null);

    const root = $("#productRoot");
    const selected = defaultVariantLabel(p);
    const price = variantPrice(p, selected);

    root.innerHTML = `
      <div class="detail">
        <div class="media-square">
          <img src="${escapeHtml(p.image||"")}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
        </div>

        <div>
          <h1>${escapeHtml(p.name)}</h1>
          <p>${escapeHtml(p.short || "Premium product, space-store quality.")}</p>

          <div class="rating" style="margin-top:12px;">
            <div class="stars">${stars(p.rating)}</div>
            <div class="reviews">${Number(p.reviews||0)} reviews</div>
          </div>

          <div class="price" style="margin-top:10px;">
            <span class="money" id="detailPrice">${money(price)}</span>
            <span class="muted">${escapeHtml(PS.config?.store?.currency || "CAD")}</span>
          </div>

          <div class="actions">
            <div class="qty-block">
              <div class="qty-block__label">Quantity</div>
              <div class="qty-block__selectwrap">
                <select class="variant-select" id="detailVariant" aria-label="Quantity">
                  ${(p.variants||[]).map(v => `<option value="${escapeHtml(v.label)}" ${v.label===selected?"selected":""}>${escapeHtml(v.label)}</option>`).join("")}
                </select>
              </div>
            </div>

            <button class="btn btn--solid" id="detailBuy">Buy</button>

            <p class="muted">${escapeHtml(p.description || "")}</p>
          </div>
        </div>
      </div>
    `;

    const sel = $("#detailVariant");
    const priceEl = $("#detailPrice");
    sel.addEventListener("change", () => {
      priceEl.textContent = money(variantPrice(p, sel.value));
    });

    $("#detailBuy").addEventListener("click", () => {
      addToCart(p.id, sel.value);
    });
  }

  function cartTotals(cart){
    const rules = PS.config?.store?.rules || {};
    const minOrder = Number(rules.minimumOrder ?? 75);
    const freeShip = Number(rules.freeShippingThreshold ?? 250);
    const shipFlat = Number(rules.standardShippingFlat ?? 20);

    let subtotal = 0;
    for(const it of cart){
      const p = PS.products.find(x => x.id === it.id);
      if(!p) continue;
      const unit = variantPrice(p, it.variant);
      subtotal += unit * (Number(it.qty)||0);
    }

    const shipping = subtotal >= freeShip ? 0 : (subtotal > 0 ? shipFlat : 0);
    const total = subtotal + shipping;
    return { subtotal, shipping, total, minOrder, freeShip };
  }

  function initCartPage(){
    const root = $("#cartRoot");
    const cart = getCart();

    if(!cart.length){
      root.innerHTML = `
        <div class="notice">Your cart is empty.</div>
        <a class="btn btn--solid" href="shop.html">Back to shop</a>
      `;
      return;
    }

    const t = cartTotals(cart);
    const minMissing = Math.max(0, t.minOrder - t.subtotal);

    root.innerHTML = `
      ${minMissing > 0 ? `<div class="notice" style="border-color: rgba(255,77,77,.35);">
        Minimum order is $${t.minOrder}. Add ${money(minMissing)} more to checkout.
      </div>` : ""}

      <div class="notice">
        <strong>Free shipping</strong> on orders $${t.freeShip}+.
      </div>

      <div class="surface" style="margin-top:12px;">
        ${cart.map(it => {
          const p = PS.products.find(x => x.id === it.id);
          if(!p) return "";
          const unit = variantPrice(p, it.variant);
          const line = unit * it.qty;
          return `
            <div class="notice" style="display:grid; gap:10px;">
              <div style="display:flex; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                  <div style="font-weight:1200;">${escapeHtml(p.name)}</div>
                  <div class="muted" style="margin-top:2px;">Quantity: ${escapeHtml(it.variant)}</div>
                </div>
                <div style="text-align:right; font-weight:1200;">
                  ${money(line)}
                  <div class="muted" style="font-weight:1000;">${money(unit)} each</div>
                </div>
              </div>

              <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
                <div style="display:flex; gap:10px; align-items:center;">
                  <button class="btn" data-dec="${escapeHtml(it.id)}||${escapeHtml(it.variant)}">-</button>
                  <div style="min-width:40px; text-align:center; font-weight:1200;">${it.qty}</div>
                  <button class="btn" data-inc="${escapeHtml(it.id)}||${escapeHtml(it.variant)}">+</button>
                </div>
                <button class="btn" data-rm="${escapeHtml(it.id)}||${escapeHtml(it.variant)}">Remove</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <div class="notice" style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-top:6px;"><span>Shipping</span><strong>${t.shipping === 0 ? "FREE" : money(t.shipping)}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:18px;"><span>Total</span><strong>${money(t.total)}</strong></div>
      </div>

      <a class="btn btn--solid" href="checkout.html" ${minMissing>0 ? 'style="opacity:.6; pointer-events:none;"' : ""}>Checkout</a>
      <a class="btn" href="shop.html" style="margin-top:10px;">Continue shopping</a>
    `;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if(!btn) return;

      const cart = getCart();
      const inc = btn.getAttribute("data-inc");
      const dec = btn.getAttribute("data-dec");
      const rm  = btn.getAttribute("data-rm");

      function splitKey(k){ const [id, variant] = k.split("||"); return {id, variant}; }

      if(inc){
        const {id, variant} = splitKey(inc);
        const hit = cart.find(x => x.id===id && x.variant===variant);
        if(hit) hit.qty += 1;
        setCart(cart);
        location.reload();
      }
      if(dec){
        const {id, variant} = splitKey(dec);
        const hit = cart.find(x => x.id===id && x.variant===variant);
        if(hit){
          hit.qty -= 1;
          if(hit.qty <= 0) cart.splice(cart.indexOf(hit), 1);
        }
        setCart(cart);
        location.reload();
      }
      if(rm){
        const {id, variant} = splitKey(rm);
        const idx = cart.findIndex(x => x.id===id && x.variant===variant);
        if(idx >= 0) cart.splice(idx, 1);
        setCart(cart);
        location.reload();
      }
    });
  }

  function initCheckoutPage(){
    const root = $("#checkoutRoot");
    const cart = getCart();
    if(!cart.length){
      root.innerHTML = `
        <div class="notice">Your cart is empty.</div>
        <a class="btn btn--solid" href="shop.html">Back to shop</a>
      `;
      return;
    }

    const t = cartTotals(cart);
    if(t.subtotal < t.minOrder){
      root.innerHTML = `
        <div class="notice" style="border-color: rgba(255,77,77,.35);">
          Minimum order is $${t.minOrder}. Your subtotal is ${money(t.subtotal)}.
        </div>
        <a class="btn btn--solid" href="cart.html">Back to cart</a>
      `;
      return;
    }

    const pay = PS.config?.store?.payment || {};
    const payEmail = pay.email || "payments@premium-supply.ca";
    const payLabel = pay.methodLabel || "Interac e‑Transfer";

    root.innerHTML = `
      <div class="notice">
        <strong>Payment method:</strong> ${escapeHtml(payLabel)}<br>
        Send payment to: <strong>${escapeHtml(payEmail)}</strong><br>
        <span class="muted">You’ll receive an Order ID after placing the order.</span>
      </div>

      <div class="notice" style="border-color: rgba(255,77,77,.35);">
        <strong style="color: var(--danger);">IMPORTANT:</strong>
        If you don't pay in the next 24 hours for the order your account will be closed in 48 hours.
      </div>

      <div class="notice">
        <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-top:6px;"><span>Shipping</span><strong>${t.shipping === 0 ? "FREE" : money(t.shipping)}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:18px;"><span>Total</span><strong>${money(t.total)}</strong></div>
      </div>

      <div class="notice">
        <strong>Customer details</strong>
        <div style="display:grid; gap:10px; margin-top:10px;">
          <input id="cName" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="Full name">
          <input id="cEmail" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="Email">
          <input id="cPhone" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="Phone">
          <input id="cAddr" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="Address">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <input id="cCity" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="City">
            <input id="cProv" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="Province">
          </div>
          <input id="cPostal" class="variant-select" style="background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.14);" placeholder="Postal code">
        </div>
      </div>

      <button class="btn btn--solid" id="placeOrder">Place order</button>
      <a class="btn" href="cart.html" style="margin-top:10px;">Back to cart</a>

      <div id="orderResult" style="margin-top:12px;"></div>
    `;

    $("#placeOrder").addEventListener("click", () => {
      const name = ($("#cName").value || "").trim();
      const email = ($("#cEmail").value || "").trim();
      const phone = ($("#cPhone").value || "").trim();
      const addr = ($("#cAddr").value || "").trim();

      if(!name || !email || !phone || !addr){
        $("#orderResult").innerHTML = `<div class="notice" style="border-color: rgba(255,77,77,.35);">Please fill all required fields.</div>`;
        return;
      }

      const orderId = `PS-${Math.random().toString(36).slice(2,7).toUpperCase()}-${Date.now().toString().slice(-5)}`;
      const order = {
        orderId,
        createdAt: new Date().toISOString(),
        customer: { name, email, phone, addr },
        items: getCart()
      };

      localStorage.setItem("ps_last_order", JSON.stringify(order));
      localStorage.setItem("ps_last_order_total", String(t.total));

      $("#orderResult").innerHTML = `
        <div class="notice">
          <strong>Order placed!</strong><br>
          Order ID: <strong>${orderId}</strong><br>
          Total: <strong>${money(t.total)}</strong><br><br>
          Send ${escapeHtml(payLabel)} to: <strong>${escapeHtml(payEmail)}</strong><br>
          Include your Order ID in the message: <strong>${orderId}</strong>
        </div>
      `;
    });
  }

  // ---------- promo modal + age gate ----------
  function initPromo(){
    const promo = PS.config?.store?.promo;
    if(!promo || !promo.enabled) return;

    const dismissed = localStorage.getItem("ps_promo_dismissed") === "1";
    if(dismissed) return;

    const modal = $("#promoModal");
    if(!modal) return;

    $("#promoTitle").textContent = promo.title || "Welcome";
    $("#promoMsg").textContent = promo.message || "";
    modal.classList.add("show");

    const close = () => modal.classList.remove("show");
    $("#promoClose")?.addEventListener("click", close);
    $("#promoContinue")?.addEventListener("click", close);

    $("#promoDontShow")?.addEventListener("click", () => {
      localStorage.setItem("ps_promo_dismissed", "1");
      close();
    });

    modal.addEventListener("click", (e) => {
      if(e.target && e.target.hasAttribute("data-close")) close();
    });
  }

  function initAgeGate(){
    const enabled = !!PS.config?.store?.ageGate?.enabled;
    if(!enabled) return;

    const ok = localStorage.getItem("ps_age_ok") === "1";
    if(ok) return;

    const modal = $("#ageGate");
    if(!modal) return;

    const text = PS.config?.store?.ageGate?.text;
    if(text) $("#ageGateText").textContent = text;

    modal.classList.add("show");
    $("#ageYes")?.addEventListener("click", () => {
      localStorage.setItem("ps_age_ok", "1");
      modal.classList.remove("show");
    });
  }

  // ---------- boot ----------
  async function boot(){
    updateCartBadge();

    try{
      PS.config = await loadJSON("site-config.json");
      PS.products = await loadJSON("catalog.json");

      if(!Array.isArray(PS.products)) throw new Error("catalog.json must be an array []");

      applyBrand();
      initPromoStrip();
      initPromo();
      initAgeGate();

      const page = document.body.dataset.page || "home";

      if(page === "home") renderHome();
      if(page === "shop") initShopPage();
      if(page === "category") initCategoryPage();
      if(page === "product") initProductPage();
      if(page === "cart") initCartPage();
      if(page === "checkout") initCheckoutPage();

    }catch(err){
      console.error(err);
      showNotice(`ERROR: ${err.message}. Make sure site-config.json and catalog.json are in the same folder as your HTML files.`);
      const grid = $("#grid");
      if(grid) grid.innerHTML = "";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();