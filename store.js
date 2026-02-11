/* Premium Supply Storefront (static / no external services)
   - Loads catalog.json
   - Renders home/shop/product
   - Cart in localStorage
   - Checkout: info -> review -> payment instructions
*/

const PS = (() => {
  const CART_KEY = "ps_cart_v4";
  let _catalog = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function money(n, currency = "CAD") {
    const val = Number(n || 0);
    return val.toLocaleString("en-CA", { style: "currency", currency });
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRand(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function loadCatalog() {
    if (_catalog) return _catalog;
    const res = await fetch("catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Unable to load catalog.json");
    _catalog = await res.json();
    return _catalog;
  }

  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadges();
  }

  function addToCart({ productId, variantLabel, units }) {
    const cart = getCart();
    const idx = cart.findIndex(i => i.productId === productId && i.variantLabel === variantLabel);
    if (idx >= 0) cart[idx].units += units;
    else cart.push({ productId, variantLabel, units });
    setCart(cart);
  }

  function removeFromCart(lineIndex) {
    const cart = getCart();
    cart.splice(lineIndex, 1);
    setCart(cart);
  }

  function setLineUnits(lineIndex, units) {
    const cart = getCart();
    if (!cart[lineIndex]) return;
    cart[lineIndex].units = clamp(units, 1, 999);
    setCart(cart);
  }

  function clearCart() {
    setCart([]);
  }

  function priceRange(product, currency = "CAD") {
    const prices = (product.variants || []).map(v => v.price).filter(n => typeof n === "number");
    if (!prices.length) return money(0, currency);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? money(min, currency) : `${money(min, currency)} – ${money(max, currency)}`;
  }

  function stars(rating) {
    const r = Number(rating || 0);
    const full = Math.floor(r);
    const half = (r - full) >= 0.5 ? 1 : 0;
    const empty = Math.max(0, 5 - full - half);
    return { full, half, empty };
  }

  function starHTML(rating) {
    const s = stars(rating);
    let out = "";
    for (let i = 0; i < s.full; i++) out += `<span class="ps-star is-on">★</span>`;
    if (s.half) out += `<span class="ps-star is-half">★</span>`;
    for (let i = 0; i < s.empty; i++) out += `<span class="ps-star">★</span>`;
    return out;
  }

  function pickReviews(catalog, product, count = 6) {
    const pool = catalog.reviewPool || [];
    if (!pool.length) return [];
    const rand = seededRand(hashSeed(product.id));
    const used = new Set();
    const out = [];
    while (out.length < count && used.size < pool.length) {
      const idx = Math.floor(rand() * pool.length);
      if (used.has(idx)) continue;
      used.add(idx);
      const base = pool[idx];
      out.push({
        name: base.name,
        rating: base.rating,
        text: base.text,
        date: randomDate(rand)
      });
    }
    return out;
  }

  function randomDate(rand) {
    const now = new Date();
    const daysAgo = Math.floor(rand() * 180);
    const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  }

  function updateCartBadges() {
    const cart = getCart();
    const count = cart.reduce((a, i) => a + (i.units || 0), 0);
    $$("[data-cart-count]").forEach(el => {
      el.textContent = String(count);
      el.classList.toggle("is-zero", count === 0);
    });
  }

  function initHeader(catalog) {
    updateCartBadges();

    const menu = $("[data-menu]");
    const openMenuBtn = $("[data-open-menu]");
    const closeMenuBtn = $("[data-close-menu]");

    openMenuBtn?.addEventListener("click", () => {
      menu?.classList.add("is-open");
      document.body.classList.add("ps-lock");
    });

    closeMenuBtn?.addEventListener("click", () => {
      menu?.classList.remove("is-open");
      document.body.classList.remove("ps-lock");
    });

    menu?.addEventListener("click", (e) => {
      if (e.target === menu) {
        menu.classList.remove("is-open");
        document.body.classList.remove("ps-lock");
      }
    });

    const searchBtn = $("[data-open-search]");
    const searchBar = $("[data-searchbar]");
    const searchInput = $("[data-searchinput]");

    searchBtn?.addEventListener("click", () => {
      if (!searchBar || !searchInput) return;
      searchBar.classList.toggle("is-open");
      if (searchBar.classList.contains("is-open")) searchInput.focus();
    });

    const promo = $("[data-promo-strip]");
    if (promo && catalog?.rules) {
      promo.textContent =
        `Min order $${catalog.rules.minOrder} • Free shipping $${catalog.rules.freeShipping}+ • Interac E‑Transfer / Crypto payments`;
    }
  }

  function buildCategoryLinks(catalog) {
    const list = $("[data-category-links]");
    if (!list) return;

    const items = [
      { href: "shop.html", label: "All Products" },
      ...catalog.categories.map(c => ({
        href: `shop.html?category=${encodeURIComponent(c.id)}`,
        label: c.name
      })),
      { href: "cart.html", label: "Cart" },
      { href: "checkout.html", label: "Checkout" }
    ];

    list.innerHTML = items.map(i => `<a class="ps-menu__link" href="${i.href}">${i.label}</a>`).join("");
  }

  function renderHome(catalog) {
    const promoWrap = $("[data-home-promos]");
    if (promoWrap) {
      promoWrap.innerHTML = (catalog.promotions || []).map(p => `
        <a class="ps-promo-card" href="${p.ctaLink}">
          <div class="ps-promo-card__img">
            <img src="${p.image}" alt="${p.title}" loading="lazy" />
          </div>
          <div class="ps-promo-card__body">
            <div class="ps-promo-card__title">${p.title}</div>
            <div class="ps-promo-card__sub">${p.subtitle}</div>
            <div class="ps-promo-card__cta">${p.ctaText} →</div>
          </div>
        </a>
      `).join("");
    }

    const catWrap = $("[data-home-categories]");
    if (catWrap) {
      const byCat = new Map();
      for (const p of catalog.products) {
        if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
        byCat.get(p.categoryId).push(p);
      }

      catWrap.innerHTML = catalog.categories.map(c => {
        const items = (byCat.get(c.id) || []).slice(0, 3);
        return `
          <a class="ps-cat-card" href="shop.html?category=${encodeURIComponent(c.id)}">
            <div class="ps-cat-card__head">
              <div>
                <div class="ps-cat-card__name">${c.name}</div>
                <div class="ps-cat-card__hint">${c.hint || ""}</div>
              </div>
              <div class="ps-cat-card__arrow">→</div>
            </div>
            <div class="ps-cat-card__mini">
              ${items.map(p => `
                <div class="ps-mini">
                  <div class="ps-mini__img"><img src="${p.image}" alt="" loading="lazy" /></div>
                  <div class="ps-mini__txt">${p.name}</div>
                </div>
              `).join("")}
            </div>
          </a>
        `;
      }).join("");
    }
  }

  function renderShop(catalog) {
    const grid = $("[data-product-grid]");
    if (!grid) return;

    const category = new URLSearchParams(location.search).get("category") || "all";
    const sort = new URLSearchParams(location.search).get("sort") || "featured";

    const categorySelect = $("[data-category-select]");
    const sortSelect = $("[data-sort-select]");
    const searchInput = $("[data-searchinput]");

    if (categorySelect) {
      categorySelect.innerHTML = [
        `<option value="all">All Products</option>`,
        ...catalog.categories.map(c => `<option value="${c.id}">${c.name}</option>`)
      ].join("");
      categorySelect.value = category;
      categorySelect.addEventListener("change", () => {
        const v = categorySelect.value;
        const sp = new URLSearchParams(location.search);
        if (v === "all") sp.delete("category");
        else sp.set("category", v);
        location.search = sp.toString();
      });
    }

    if (sortSelect) {
      sortSelect.value = sort;
      sortSelect.addEventListener("change", () => {
        const sp = new URLSearchParams(location.search);
        sp.set("sort", sortSelect.value);
        location.search = sp.toString();
      });
    }

    function minPrice(p) {
      const prices = (p.variants || []).map(v => v.price).filter(n => typeof n === "number");
      return prices.length ? Math.min(...prices) : 0;
    }

    function getList() {
      const q = (searchInput?.value || "").trim().toLowerCase();
      let list = catalog.products.slice();

      if (category !== "all") list = list.filter(p => p.categoryId === category);

      if (q) {
        list = list.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.badges || []).join(" ").toLowerCase().includes(q)
        );
      }

      if (sort === "price-low") list.sort((a, b) => minPrice(a) - minPrice(b));
      else if (sort === "price-high") list.sort((a, b) => minPrice(b) - minPrice(a));
      else if (sort === "rating") list.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      return list;
    }

    function cardHTML(p) {
      const currency = catalog.rules.currency || "CAD";
      const href = `product.html?id=${encodeURIComponent(p.id)}`;
      return `
        <article class="ps-product">
          <a class="ps-product__img" href="${href}">
            <img src="${p.image}" alt="${p.name}" loading="lazy" />
          </a>

          <div class="ps-product__body">
            <div class="ps-product__meta">
              ${(p.badges || []).slice(0, 2).map(b => `<span class="ps-badge">${b}</span>`).join("")}
            </div>

            <a class="ps-product__name" href="${href}">${p.name}</a>

            <div class="ps-product__rating">
              <div class="ps-stars" aria-label="${p.rating} stars">
                ${starHTML(p.rating)}
              </div>
              <a class="ps-reviews-link" href="${href}#reviews">${p.reviewsCount} reviews</a>
            </div>

            <div class="ps-product__price">${priceRange(p, currency)}</div>

            <div class="ps-buy">
              <div class="ps-select">
                <label>Quantity</label>
                <select data-variant>
                  ${(p.variants || []).map(v =>
                    `<option value="${escapeHtml(v.label)}">${escapeHtml(v.label)} • ${money(v.price, currency)}</option>`
                  ).join("")}
                </select>
              </div>

              <div class="ps-stepper" data-stepper>
                <button class="ps-step" data-dec aria-label="Decrease">−</button>
                <input class="ps-stepper__val" type="number" value="1" min="1" inputmode="numeric" />
                <button class="ps-step" data-inc aria-label="Increase">+</button>
              </div>

              <button class="ps-btn ps-btn--buy" data-buy>Buy</button>
            </div>
          </div>
        </article>
      `;
    }

    function render() {
      const list = getList();
      grid.innerHTML = list.map(cardHTML).join("");

      $$("article.ps-product").forEach(card => {
        const buyBtn = $("[data-buy]", card);
        const variantSel = $("[data-variant]", card);
        const stepper = $("[data-stepper]", card);
        const val = $(".ps-stepper__val", card);

        const name = $(".ps-product__name", card)?.textContent || "";
        const product = catalog.products.find(x => x.name === name);
        if (!product) return;

        const inc = $("[data-inc]", stepper);
        const dec = $("[data-dec]", stepper);

        inc?.addEventListener("click", () => {
          val.value = String(clamp(Number(val.value || 1) + 1, 1, 999));
        });
        dec?.addEventListener("click", () => {
          val.value = String(clamp(Number(val.value || 1) - 1, 1, 999));
        });

        buyBtn?.addEventListener("click", () => {
          const variantLabel = variantSel?.value || (product.variants?.[0]?.label ?? "");
          const units = clamp(Number(val.value || 1), 1, 999);
          addToCart({ productId: product.id, variantLabel, units });

          buyBtn.classList.add("is-done");
          buyBtn.textContent = "Added ✓";
          setTimeout(() => {
            buyBtn.classList.remove("is-done");
            buyBtn.textContent = "Buy";
          }, 900);
        });
      });
    }

    searchInput?.addEventListener("input", render);
    render();
  }

  function renderProduct(catalog) {
    const wrap = $("[data-product-page]");
    if (!wrap) return;

    const id = new URLSearchParams(location.search).get("id");
    const p = catalog.products.find(x => x.id === id) || catalog.products[0];
    if (!p) return;

    $("[data-product-title]") && ($("[data-product-title]").textContent = p.name);
    $("[data-product-img]") && ($("[data-product-img]").src = p.image);
    $("[data-product-img]") && ($("[data-product-img]").alt = p.name);

    const cat = catalog.categories.find(c => c.id === p.categoryId);
    $("[data-breadcrumb]") && ($("[data-breadcrumb]").innerHTML = `
      <a href="index.html">Home</a> /
      <a href="shop.html?category=${encodeURIComponent(p.categoryId)}">${cat ? cat.name : "Category"}</a> /
      <span>${escapeHtml(p.name)}</span>
    `);

    $("[data-product-badges]") &&
      ($("[data-product-badges]").innerHTML = (p.badges || []).map(b => `<span class="ps-badge">${b}</span>`).join(""));

    $("[data-product-rating]") && ($("[data-product-rating]").innerHTML = `
      <div class="ps-stars">${starHTML(p.rating)}</div>
      <a class="ps-reviews-link" href="#reviews">${p.reviewsCount} reviews</a>
    `);

    $("[data-product-desc]") && ($("[data-product-desc]").textContent = p.description || "");

    const currency = catalog.rules.currency || "CAD";
    const variantSel = $("[data-product-variant]");
    if (variantSel) {
      variantSel.innerHTML = (p.variants || []).map(v =>
        `<option value="${escapeHtml(v.label)}">${escapeHtml(v.label)} • ${money(v.price, currency)}</option>`
      ).join("");
    }

    const stepVal = $("[data-product-units]");
    const inc = $("[data-units-inc]");
    const dec = $("[data-units-dec]");
    inc?.addEventListener("click", () => stepVal.value = String(clamp(Number(stepVal.value || 1) + 1, 1, 999)));
    dec?.addEventListener("click", () => stepVal.value = String(clamp(Number(stepVal.value || 1) - 1, 1, 999)));

    const buy = $("[data-product-buy]");
    buy?.addEventListener("click", () => {
      const variantLabel = variantSel?.value || (p.variants?.[0]?.label ?? "");
      const units = clamp(Number(stepVal?.value || 1), 1, 999);
      addToCart({ productId: p.id, variantLabel, units });

      buy.classList.add("is-done");
      buy.textContent = "Added ✓";
      setTimeout(() => {
        buy.classList.remove("is-done");
        buy.textContent = "Buy";
      }, 1000);
    });

    const reviewList = $("[data-review-list]");
    if (reviewList) {
      const reviews = pickReviews(catalog, p, 8);
      reviewList.innerHTML = reviews.map(r => `
        <div class="ps-review">
          <div class="ps-review__head">
            <div class="ps-review__name">${escapeHtml(r.name)}</div>
            <div class="ps-review__meta">${escapeHtml(r.date)} • <span class="ps-stars">${starHTML(r.rating)}</span></div>
          </div>
          <div class="ps-review__text">${escapeHtml(r.text)}</div>
        </div>
      `).join("");
    }
  }

  function renderCart(catalog) {
    const wrap = $("[data-cart]");
    if (!wrap) return;

    const listEl = $("[data-cart-list]");
    const subtotalEl = $("[data-cart-subtotal]");
    const shippingEl = $("[data-cart-shipping]");
    const totalEl = $("[data-cart-total]");
    const noteEl = $("[data-cart-note]");
    const warningEl = $("[data-cart-warning]");
    const checkoutBtn = $("[data-cart-checkout]");

    const currency = catalog.rules.currency || "CAD";

    function calc(cart) {
      let subtotal = 0;
      const lines = cart.map(line => {
        const p = catalog.products.find(x => x.id === line.productId);
        if (!p) return null;
        const v = (p.variants || []).find(x => x.label === line.variantLabel) || (p.variants || [])[0];
        const price = v?.price ?? 0;
        const units = Number(line.units || 1);
        const lineTotal = price * units;
        subtotal += lineTotal;
        return { p, v, units, price, lineTotal };
      }).filter(Boolean);

      const freeShip = subtotal >= Number(catalog.rules.freeShipping || 250);
      const shipping = 0;
      const total = subtotal + shipping;

      return { lines, subtotal, shipping, total, freeShip };
    }

    function render() {
      const cart = getCart();
      const { lines, subtotal, shipping, total, freeShip } = calc(cart);

      updateCartBadges();

      if (lines.length === 0) {
        listEl.innerHTML = `
          <div class="ps-empty">
            <div class="ps-empty__title">Your cart is empty.</div>
            <div class="ps-empty__sub">Go to <a href="shop.html">All Products</a> and tap <strong>Buy</strong>.</div>
          </div>
        `;
      } else {
        listEl.innerHTML = lines.map((l, idx) => `
          <div class="ps-cart-row">
            <div class="ps-cart-row__img">
              <img src="${l.p.image}" alt="${escapeHtml(l.p.name)}" loading="lazy" />
            </div>

            <div class="ps-cart-row__info">
              <a class="ps-cart-row__name" href="product.html?id=${encodeURIComponent(l.p.id)}">${escapeHtml(l.p.name)}</a>
              <div class="ps-cart-row__meta">
                <span class="ps-badge">${escapeHtml((catalog.categories.find(c => c.id === l.p.categoryId)?.name) || "Category")}</span>
                <span class="ps-badge">${escapeHtml(l.v?.label || "")}</span>
              </div>
              <div class="ps-cart-row__meta">
                ${money(l.price, currency)} each • Line: <strong>${money(l.lineTotal, currency)}</strong>
              </div>

              <div class="ps-cart-row__actions">
                <div class="ps-stepper ps-stepper--small" data-line="${idx}">
                  <button class="ps-step" data-dec>−</button>
                  <input class="ps-stepper__val" type="number" min="1" value="${l.units}" />
                  <button class="ps-step" data-inc>+</button>
                </div>
                <button class="ps-btn ps-btn--ghost" data-remove="${idx}">Remove</button>
              </div>
            </div>
          </div>
        `).join("");
      }

      subtotalEl.textContent = money(subtotal, currency);
      shippingEl.textContent = freeShip ? "FREE" : "—";
      totalEl.textContent = money(total, currency);

      const minOrder = Number(catalog.rules.minOrder || 75);
      const okMin = subtotal >= minOrder;

      noteEl.textContent = freeShip
        ? `You qualify for FREE shipping (${catalog.rules.freeShipping}+).`
        : `Free shipping applies at $${catalog.rules.freeShipping}+`;

      // ✅ Visible minimum order warning (this is the fix you asked for)
      if (warningEl) {
        const missing = Math.max(0, minOrder - subtotal);
        const show = lines.length > 0 && !okMin;
        warningEl.hidden = !show;
        warningEl.textContent = show
          ? `Minimum order is $${minOrder}. Add ${money(missing, currency)} more to checkout.`
          : "";
      }

      checkoutBtn.disabled = !okMin || lines.length === 0;
      checkoutBtn.setAttribute("aria-disabled", String(checkoutBtn.disabled));

      $$("[data-remove]").forEach(btn => {
        btn.addEventListener("click", () => {
          removeFromCart(Number(btn.getAttribute("data-remove")));
          render();
        });
      });

      $$("[data-line]").forEach(w => {
        const idx = Number(w.getAttribute("data-line"));
        const inp = $(".ps-stepper__val", w);
        const inc = $("[data-inc]", w);
        const dec = $("[data-dec]", w);

        inc.addEventListener("click", () => {
          setLineUnits(idx, Number(inp.value || 1) + 1);
          render();
        });
        dec.addEventListener("click", () => {
          setLineUnits(idx, Number(inp.value || 1) - 1);
          render();
        });
        inp.addEventListener("change", () => {
          setLineUnits(idx, Number(inp.value || 1));
          render();
        });
      });
    }

    $("[data-clear-cart]")?.addEventListener("click", () => {
      clearCart();
      render();
    });

    render();
  }

  function renderCheckout(catalog) {
    const wrap = $("[data-checkout]");
    if (!wrap) return;

    const cart = getCart();
    if (!cart.length) {
      $("[data-checkout]").innerHTML = `
        <div class="ps-surface">
          <h2 class="ps-h2">Checkout</h2>
          <p>Your cart is empty. Go to <a href="shop.html">All Products</a>.</p>
        </div>
      `;
      return;
    }

    const currency = catalog.rules.currency || "CAD";

    const lines = cart.map(line => {
      const p = catalog.products.find(x => x.id === line.productId);
      if (!p) return null;
      const v = (p.variants || []).find(x => x.label === line.variantLabel) || (p.variants || [])[0];
      const units = Number(line.units || 1);
      const price = v?.price ?? 0;
      return { p, v, units, price, lineTotal: price * units };
    }).filter(Boolean);

    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    const minOrder = Number(catalog.rules.minOrder || 75);
    const okMin = subtotal >= minOrder;

    const freeShip = subtotal >= Number(catalog.rules.freeShipping || 250);
    const shipping = 0;
    const total = subtotal + shipping;

    const orderNumber = generateOrderNumber();
    const qa = pickEtransferQA(catalog, orderNumber);

    const steps = $$("[data-step]");
    const panels = $$("[data-panel]");
    let step = 1;

    function go(n) {
      step = clamp(n, 1, panels.length);
      steps.forEach(s => s.classList.toggle("is-active", Number(s.getAttribute("data-step")) === step));
      panels.forEach(p => p.hidden = Number(p.getAttribute("data-panel")) !== step);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ✅ Visible minimum order warning on checkout step 1
    const checkoutWarn = $("[data-checkout-warning]");
    const next1 = $("[data-next-1]");
    if (checkoutWarn && next1) {
      const missing = Math.max(0, minOrder - subtotal);
      const show = !okMin;
      checkoutWarn.hidden = !show;
      checkoutWarn.textContent = show
        ? `Minimum order is $${minOrder}. Add ${money(missing, currency)} more in your cart before checkout.`
        : "";
      next1.disabled = show;
      next1.setAttribute("aria-disabled", String(next1.disabled));
    }

    $("[data-review-cart]").innerHTML = lines.map(l => `
      <div class="ps-review-line">
        <div class="ps-review-line__left">
          <div class="ps-review-line__name">${escapeHtml(l.p.name)}</div>
          <div class="ps-review-line__meta">${escapeHtml(l.v?.label || "")} • Units: ${l.units}</div>
        </div>
        <div class="ps-review-line__right">${money(l.lineTotal, currency)}</div>
      </div>
    `).join("");

    $("[data-review-totals]").innerHTML = `
      <div class="ps-summary-row"><span>Subtotal</span><strong>${money(subtotal, currency)}</strong></div>
      <div class="ps-summary-row"><span>Shipping</span><strong>${freeShip ? "FREE" : "—"}</strong></div>
      <div class="ps-summary-row"><span>Total</span><strong>${money(total, currency)}</strong></div>
    `;

    $("[data-order-number]").textContent = orderNumber;
    $("[data-order-total]").textContent = money(total, currency);
    $("[data-etransfer-email]").textContent = catalog.payment.etransferEmail;
    $("[data-etransfer-q]").textContent = qa.q;
    $("[data-etransfer-a]").textContent = qa.a;

    const walletWrap = $("[data-wallets]");
    if (walletWrap) {
      const w = catalog.payment.cryptoWallets || {};
      walletWrap.innerHTML = Object.keys(w).map(k => `
        <div class="ps-kv">
          <div class="ps-kv__k">${k}</div>
          <div class="ps-kv__v">${escapeHtml(w[k] || "")}</div>
        </div>
      `).join("");
    }

    $("[data-next-2]")?.addEventListener("click", () => go(3));
    $("[data-prev-2]")?.addEventListener("click", () => go(1));
    $("[data-prev-3]")?.addEventListener("click", () => go(2));

    const agree = $("[data-agree]");
    const place = $("[data-place-order]");
    function syncPlace() {
      place.disabled = !agree.checked;
    }
    agree.addEventListener("change", syncPlace);
    syncPlace();

    place.addEventListener("click", () => {
      go(4);
    });

    steps.forEach(s => s.addEventListener("click", () => go(Number(s.getAttribute("data-step")))));

    go(1);
  }

  function generateOrderNumber() {
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const r = Math.floor(Math.random() * 9000) + 1000;
    return `PS-${y}${m}${d}-${r}`;
  }

  function pickEtransferQA(catalog, orderNumber) {
    const pool = catalog.payment.etransferQaPool || [];
    if (!pool.length) return { q: "Order question", a: "PremiumSupply" };
    const rand = seededRand(hashSeed(orderNumber));
    const idx = Math.floor(rand() * pool.length);
    return pool[idx];
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function init() {
    const catalog = await loadCatalog();
    initHeader(catalog);
    buildCategoryLinks(catalog);

    const page = document.body.getAttribute("data-page");

    if (page === "home") renderHome(catalog);
    if (page === "shop") renderShop(catalog);
    if (page === "product") renderProduct(catalog);
    if (page === "cart") renderCart(catalog);
    if (page === "checkout") renderCheckout(catalog);
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => {
  PS.init().catch(err => console.error(err));
});