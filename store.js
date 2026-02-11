/* Premium Supply Storefront (static / no external services)
   - catalog.json
   - global search dropdown + Enter -> shop results
   - Home "Shop by category" dropdown
   - Shop filtering (category + sort + query)
   - Cart + checkout rules (min order, free shipping)
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

  function updateCartBadges() {
    const cart = getCart();
    const count = cart.reduce((a, i) => a + (i.units || 0), 0);
    $$("[data-cart-count]").forEach(el => {
      el.textContent = String(count);
      el.classList.toggle("is-zero", count === 0);
    });
  }

  /* ✅ Global header init: menu + promo strip + SEARCH WITH RESULTS */
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

    const promo = $("[data-promo-strip]");
    if (promo && catalog?.rules) {
      promo.textContent =
        `Min order $${catalog.rules.minOrder} • Free shipping $${catalog.rules.freeShipping}+ • Interac E‑Transfer / Crypto payments`;
    }

    // ✅ SEARCH
    const searchBtn = $("[data-open-search]");
    const searchBar = $("[data-searchbar]");
    const searchInput = $("[data-searchinput]");
    let resultsBox = $("[data-searchresults]");

    if (searchBar && searchInput && !resultsBox) {
      resultsBox = document.createElement("div");
      resultsBox.className = "ps-searchresults";
      resultsBox.setAttribute("data-searchresults", "");
      resultsBox.hidden = true;
      searchBar.appendChild(resultsBox);
    }

    function closeResults() {
      if (!resultsBox) return;
      resultsBox.hidden = true;
      resultsBox.innerHTML = "";
    }

    function openSearch() {
      if (!searchBar) return;
      searchBar.classList.add("is-open");
      searchInput?.focus();
    }

    function toggleSearch() {
      if (!searchBar) return;
      const open = searchBar.classList.toggle("is-open");
      if (open) searchInput?.focus();
      else closeResults();
    }

    searchBtn?.addEventListener("click", toggleSearch);

    function matchProducts(q) {
      const query = q.trim().toLowerCase();
      if (!query) return [];
      const list = catalog.products
        .map(p => {
          const hay = [
            p.name,
            p.description || "",
            (p.badges || []).join(" "),
          ].join(" ").toLowerCase();
          const ok = hay.includes(query);
          return ok ? p : null;
        })
        .filter(Boolean);

      // best first: rating then name
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name));
      return list.slice(0, 6);
    }

    function renderResults(q) {
      if (!resultsBox) return;
      const query = q.trim();
      if (!query) {
        closeResults();
        return;
      }

      const hits = matchProducts(query);
      const currency = catalog.rules.currency || "CAD";
      const catName = (id) => (catalog.categories.find(c => c.id === id)?.name || "Category");

      if (!hits.length) {
        resultsBox.hidden = false;
        resultsBox.innerHTML = `
          <div class="ps-searchresults__empty">
            No results for <strong>${escapeHtml(query)}</strong>.
            <a class="ps-link" href="shop.html?q=${encodeURIComponent(query)}">See all</a>
          </div>
        `;
        return;
      }

      resultsBox.hidden = false;
      resultsBox.innerHTML = `
        <div class="ps-searchresults__list">
          ${hits.map(p => `
            <a class="ps-searchitem" href="product.html?id=${encodeURIComponent(p.id)}">
              <div class="ps-searchitem__img">
                <img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy" />
              </div>
              <div class="ps-searchitem__txt">
                <div class="ps-searchitem__name">${escapeHtml(p.name)}</div>
                <div class="ps-searchitem__meta">${escapeHtml(catName(p.categoryId))} • ${priceRange(p, currency)}</div>
              </div>
            </a>
          `).join("")}
        </div>
        <a class="ps-searchresults__all" href="shop.html?q=${encodeURIComponent(query)}">View all results →</a>
      `;
    }

    searchInput?.addEventListener("input", () => renderResults(searchInput.value));

    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeResults();
        searchBar?.classList.remove("is-open");
      }
      if (e.key === "Enter") {
        const q = searchInput.value.trim();
        if (q) location.href = `shop.html?q=${encodeURIComponent(q)}`;
      }
    });

    // click outside search closes results (mobile friendly)
    document.addEventListener("click", (e) => {
      if (!searchBar || !resultsBox) return;
      const t = e.target;
      if (searchBtn && searchBtn.contains(t)) return;
      if (searchBar.contains(t)) return;
      closeResults();
    });

    // If URL already contains q=..., auto-open search
    const qParam = new URLSearchParams(location.search).get("q");
    if (qParam && searchBar && searchInput) {
      searchBar.classList.add("is-open");
      searchInput.value = qParam;
      renderResults(qParam);
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

  /* ✅ HOME: fill category dropdown + promos + category cards */
  function renderHome(catalog) {
    // Home category dropdown
    const homeSel = $("[data-home-category-select]");
    if (homeSel) {
      homeSel.innerHTML = `
        <option value="">Shop by category</option>
        ${catalog.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}
      `;
      homeSel.addEventListener("change", () => {
        const v = homeSel.value;
        if (!v) return;
        location.href = `shop.html?category=${encodeURIComponent(v)}`;
      });
    }

    const promoWrap = $("[data-home-promos]");
    if (promoWrap) {
      promoWrap.innerHTML = (catalog.promotions || []).map(p => `
        <a class="ps-promo-card" href="${p.ctaLink}">
          <div class="ps-promo-card__img">
            <img src="${p.image}" alt="${escapeHtml(p.title)}" loading="lazy" />
          </div>
          <div class="ps-promo-card__body">
            <div class="ps-promo-card__title">${escapeHtml(p.title)}</div>
            <div class="ps-promo-card__sub">${escapeHtml(p.subtitle)}</div>
            <div class="ps-promo-card__cta">${escapeHtml(p.ctaText)} →</div>
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
                <div class="ps-cat-card__name">${escapeHtml(c.name)}</div>
                <div class="ps-cat-card__hint">${escapeHtml(c.hint || "")}</div>
              </div>
              <div class="ps-cat-card__arrow">→</div>
            </div>
            <div class="ps-cat-card__mini">
              ${items.map(p => `
                <div class="ps-mini">
                  <div class="ps-mini__img"><img src="${p.image}" alt="" loading="lazy" /></div>
                  <div class="ps-mini__txt">${escapeHtml(p.name)}</div>
                </div>
              `).join("")}
            </div>
          </a>
        `;
      }).join("");
    }
  }

  /* ✅ SHOP: reads q= param and shows real results */
  function renderShop(catalog) {
    const grid = $("[data-product-grid]");
    if (!grid) return;

    const sp = new URLSearchParams(location.search);
    const category = sp.get("category") || "all";
    const sort = sp.get("sort") || "featured";
    const qParam = sp.get("q") || "";

    const categorySelect = $("[data-category-select]");
    const sortSelect = $("[data-sort-select]");
    const searchInput = $("[data-searchinput]");

    if (searchInput && qParam) searchInput.value = qParam;

    if (categorySelect) {
      categorySelect.innerHTML = [
        `<option value="all">All Products</option>`,
        ...catalog.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      ].join("");
      categorySelect.value = category;
      categorySelect.addEventListener("change", () => {
        const v = categorySelect.value;
        const nsp = new URLSearchParams(location.search);
        if (v === "all") nsp.delete("category");
        else nsp.set("category", v);
        location.search = nsp.toString();
      });
    }

    if (sortSelect) {
      sortSelect.value = sort;
      sortSelect.addEventListener("change", () => {
        const nsp = new URLSearchParams(location.search);
        nsp.set("sort", sortSelect.value);
        location.search = nsp.toString();
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
        list = list.filter(p => {
          const hay = [
            p.name,
            p.description || "",
            (p.badges || []).join(" ")
          ].join(" ").toLowerCase();
          return hay.includes(q);
        });
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
        <article class="ps-product" data-id="${escapeHtml(p.id)}">
          <a class="ps-product__img" href="${href}">
            <img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy" />
          </a>

          <div class="ps-product__body">
            <div class="ps-product__meta">
              ${(p.badges || []).slice(0, 2).map(b => `<span class="ps-badge">${escapeHtml(b)}</span>`).join("")}
            </div>

            <a class="ps-product__name" href="${href}">${escapeHtml(p.name)}</a>

            <div class="ps-product__rating">
              <div class="ps-stars">${starHTML(p.rating)}</div>
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
                <button class="ps-step" type="button" data-dec aria-label="Decrease">−</button>
                <input class="ps-stepper__val" type="number" value="1" min="1" inputmode="numeric" />
                <button class="ps-step" type="button" data-inc aria-label="Increase">+</button>
              </div>

              <button class="ps-btn ps-btn--buy" type="button" data-buy>Buy</button>
            </div>
          </div>
        </article>
      `;
    }

    function bindCard(card) {
      const id = card.getAttribute("data-id");
      const product = catalog.products.find(p => p.id === id);
      if (!product) return;

      const buyBtn = $("[data-buy]", card);
      const variantSel = $("[data-variant]", card);
      const val = $(".ps-stepper__val", card);
      const inc = $("[data-inc]", card);
      const dec = $("[data-dec]", card);

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
    }

    function render() {
      const list = getList();
      if (!list.length) {
        const q = (searchInput?.value || "").trim();
        grid.innerHTML = `
          <div class="ps-empty">
            <div class="ps-empty__title">No results</div>
            <div class="ps-empty__sub">
              ${q ? `Nothing matched <strong>${escapeHtml(q)}</strong>.` : "No products found."}
              Try another search or change category.
            </div>
          </div>
        `;
        return;
      }

      grid.innerHTML = list.map(cardHTML).join("");
      $$("article.ps-product", grid).forEach(bindCard);
    }

    searchInput?.addEventListener("input", render);
    render();
  }

  /* Everything else (product/cart/checkout) stays as-is in your project.
     If you want, I can merge your latest working cart/checkout code into this same file too.
     For now, this fixes ONLY your 2 issues: category dropdown + search results.
  */

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

    // (Your other pages can keep using your existing JS if you split files.)
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => {
  PS.init().catch(err => console.error(err));
});