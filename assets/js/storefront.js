(() => {
  const STORAGE_KEY = "ps_cart_v2";

  const CATALOG_PATHS = [
    "catalog.json",
    "catalog.min.json",
    "data/catalog.json",
    "assets/data/catalog.json"
  ];

  const CATEGORY_ORDER = [
    "All Products",
    "Flower",
    "Concentrates",
    "Edibles",
    "Vape",
    "CBD",
    "Male Enhancers",
    "Mushrooms",
    "Oils"
  ];

  const $ = (id) => document.getElementById(id);

  // ---------- Cart (writes in ONE format your cart page can read) ----------
  function loadCartItems() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return [];
    } catch {
      return [];
    }
  }

  function saveCartItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, updatedAt: Date.now() }));
  }

  function mergeLine(items, next) {
    const key = `${next.id}||${next.variant}||${next.unitPrice}`;
    const i = items.findIndex(x => `${x.id}||${x.variant}||${x.unitPrice}` === key);
    if (i >= 0) {
      items[i].qty += next.qty;
    } else {
      items.push(next);
    }
    return items;
  }

  function addToCart(product, variant) {
    const item = {
      id: product.id,
      name: product.name,
      category: product.category,
      variant: variant.label,
      unitPrice: Number(variant.price) || 0,
      qty: 1,
      image: product.image || "",
      productUrl: `product.html?id=${encodeURIComponent(product.id)}`
    };

    const items = loadCartItems();
    mergeLine(items, item);
    saveCartItems(items);
    updateCartBadge();
    showToast(`Added: ${product.name} (${variant.label})`);
  }

  function updateCartBadge() {
    const items = loadCartItems();
    const count = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    document.querySelectorAll(".js-cart-count").forEach(el => el.textContent = String(count));
  }

  // ---------- UI ----------
  function showToast(msg) {
    const toast = $("toast");
    const toastMsg = $("toastMsg");
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;

    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function money(n) {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
  }

  function stars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const full = Math.round(r);
    return "★★★★★☆☆☆☆☆".slice(5 - full, 10 - full);
  }

  // ---------- Reviews (unique per product) ----------
  const REVIEW_POOL = [
    "Top shelf quality — clean, smooth, and exactly as described.",
    "Packaging was solid and the product looked fresh on arrival.",
    "Great potency and flavor profile. Would reorder.",
    "Premium feel from start to finish. Consistent quality.",
    "Fast turnaround and the quantity matched perfectly.",
    "This one hit the sweet spot — strong but not harsh.",
    "Excellent value for the quality. Really impressed.",
    "Everything was sealed properly and labeled clearly.",
    "Super smooth experience. The quality is obvious.",
    "Honestly one of the best I’ve tried in a long time.",
    "Very consistent batch. No surprises — just quality.",
    "The effects were exactly what I was looking for.",
    "Clean burn / clean finish. You can tell it’s premium.",
    "Nice aroma and strong results — easy 5 stars.",
    "The product photos matched what I received.",
    "Great customer experience and the product delivered.",
    "Fresh, potent, and clearly handled with care.",
    "Legit premium — I’d recommend to friends.",
    "Quality control feels real here. Solid.",
    "Perfect for evenings. Smooth and reliable."
  ];

  function seededPick(list, seedStr, count) {
    // deterministic selection so the same product keeps its reviews
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }

    const picked = [];
    const used = new Set();
    while (picked.length < count && used.size < list.length) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      const idx = Math.abs(h) % list.length;
      if (!used.has(idx)) {
        used.add(idx);
        picked.push(list[idx]);
      }
    }
    return picked;
  }

  function buildReviews(product) {
    const count = product.reviewsCount || (40 + (product.id.length * 7) % 160);
    const rating = product.rating || (4.5 + ((product.id.length % 5) * 0.08));
    const texts = seededPick(REVIEW_POOL, product.id, 10);

    const items = texts.map((text, i) => ({
      name: ["A. Martin", "J. Nguyen", "S. Tremblay", "M. Patel", "K. Wilson", "D. Chen", "R. Singh", "C. Dubois"][i % 8],
      rating: Math.min(5, Math.max(4, Math.round(rating * 10) / 10)),
      date: new Date(Date.now() - (i + 2) * 86400000).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" }),
      text
    }));

    return { rating, count, items };
  }

  // ---------- Catalog ----------
  function normalizeCatalog(raw) {
    // Accept:
    // - { products: [...] }
    // - { items: [...] }
    // - [ ... ]
    const products = Array.isArray(raw) ? raw
      : Array.isArray(raw?.products) ? raw.products
      : Array.isArray(raw?.items) ? raw.items
      : [];

    const norm = products.map(p => ({
      id: String(p.id || slugify(p.name) || Math.random().toString(36).slice(2)),
      name: String(p.name || "Premium Item"),
      category: String(p.category || "Premium"),
      image: String(p.image || ""),
      type: String(p.type || "Premium"),
      brand: String(p.brand || "Premium"),
      rating: Number(p.rating || 0) || 0,
      reviewsCount: Number(p.reviewsCount || 0) || 0,
      variants: Array.isArray(p.variants) && p.variants.length ? p.variants.map(v => ({
        label: String(v.label),
        price: Number(v.price) || 0
      })) : [{ label: "1 pack", price: Number(p.price || 0) || 0 }]
    }));

    return norm;
  }

  async function loadCatalog() {
    for (const path of CATALOG_PATHS) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) continue;
        const json = await res.json();
        const products = normalizeCatalog(json);
        if (products.length) return products;
      } catch (_) {}
    }
    // Fallback so site ALWAYS shows products
    return fallbackCatalog();
  }

  function fallbackCatalog() {
    const flowerVariants = [
      { label: "3.5g", price: 34.99 },
      { label: "7g", price: 64.99 },
      { label: "1½ Oz", price: 179.99 },
      { label: "1 Oz", price: 219.99 },
      { label: "¼ Pound", price: 699.99 },
      { label: "½ Pound", price: 1249.99 },
      { label: "1 Pound", price: 2299.99 }
    ];

    return [
      // Flower (3)
      { id:"flower-cosmic-kush", name:"Cosmic Kush", category:"Flower", type:"Hybrid", brand:"Premium", image:"assets/images/products/flower/cosmic-kush.jpg", variants: flowerVariants },
      { id:"flower-aurora-mint", name:"Aurora Mint", category:"Flower", type:"Indica", brand:"Premium", image:"assets/images/products/flower/aurora-mint.jpg", variants: flowerVariants },
      { id:"flower-nebula-haze", name:"Nebula Haze", category:"Flower", type:"Sativa", brand:"Premium", image:"assets/images/products/flower/nebula-haze.jpg", variants: flowerVariants },

      // Concentrates (3)
      { id:"conc-nebula-shatter", name:"Nebula Shatter", category:"Concentrates", type:"Premium", brand:"Premium", image:"assets/images/products/concentrates/nebula-shatter.jpg",
        variants:[{label:"1g",price:39.99},{label:"2g",price:74.99},{label:"3.5g",price:119.99}] },
      { id:"conc-stellar-budder", name:"Stellar Budder", category:"Concentrates", type:"Premium", brand:"Premium", image:"assets/images/products/concentrates/stellar-budder.jpg",
        variants:[{label:"1g",price:42.99},{label:"2g",price:79.99},{label:"3.5g",price:129.99}] },
      { id:"conc-orbit-rosin", name:"Orbit Rosin", category:"Concentrates", type:"Premium", brand:"Premium", image:"assets/images/products/concentrates/orbit-rosin.jpg",
        variants:[{label:"1g",price:49.99},{label:"2g",price:92.99},{label:"3.5g",price:149.99}] },

      // Edibles (3)
      { id:"edible-lunar-gummies", name:"Lunar Gummies", category:"Edibles", type:"Premium", brand:"Premium", image:"assets/images/products/edibles/lunar-gummies.jpg",
        variants:[{label:"10 pack",price:24.99},{label:"20 pack",price:44.99},{label:"40 pack",price:79.99}] },
      { id:"edible-meteor-choco", name:"Meteor Chocolates", category:"Edibles", type:"Premium", brand:"Premium", image:"assets/images/products/edibles/meteor-choco.jpg",
        variants:[{label:"5 pack",price:19.99},{label:"10 pack",price:34.99}] },
      { id:"edible-star-cookies", name:"Star Cookies", category:"Edibles", type:"Premium", brand:"Premium", image:"assets/images/products/edibles/star-cookies.jpg",
        variants:[{label:"6 pack",price:22.99},{label:"12 pack",price:39.99}] },

      // Vape (3)
      { id:"vape-ion-cart", name:"Ion Vape Cartridge", category:"Vape", type:"Premium", brand:"Premium", image:"assets/images/products/vape/ion-cart.jpg",
        variants:[{label:"1 cart",price:44.99},{label:"2 carts",price:84.99},{label:"4 carts",price:159.99}] },
      { id:"vape-neon-dispo", name:"Neon Disposable", category:"Vape", type:"Premium", brand:"Premium", image:"assets/images/products/vape/neon-dispo.jpg",
        variants:[{label:"1 unit",price:39.99},{label:"2 units",price:74.99}] },
      { id:"vape-orbit-battery", name:"Orbit Battery", category:"Vape", type:"Accessory", brand:"Premium", image:"assets/images/products/vape/orbit-battery.jpg",
        variants:[{label:"1 unit",price:19.99}] },

      // CBD (3)
      { id:"cbd-calm-drops", name:"CBD Calm Drops", category:"CBD", type:"Oil", brand:"Premium", image:"assets/images/products/cbd/calm-drops.jpg",
        variants:[{label:"30ml",price:39.99},{label:"60ml",price:69.99}] },
      { id:"cbd-sleep-gummies", name:"CBD Sleep Gummies", category:"CBD", type:"Edible", brand:"Premium", image:"assets/images/products/cbd/sleep-gummies.jpg",
        variants:[{label:"30 gummies",price:34.99},{label:"60 gummies",price:59.99}] },
      { id:"cbd-muscle-balm", name:"CBD Muscle Balm", category:"CBD", type:"Topical", brand:"Premium", image:"assets/images/products/cbd/muscle-balm.jpg",
        variants:[{label:"1 jar",price:29.99},{label:"2 jars",price:54.99}] },

      // Male Enhancers (3)
      { id:"me-afterglow-pack", name:"Afterglow Pack", category:"Male Enhancers", type:"Premium", brand:"Premium", image:"assets/images/products/male-enhancers/afterglow-pack.jpg",
        variants:[{label:"1 pack",price:52.65},{label:"3 pack",price:139.99}] },
      { id:"me-night-drive", name:"Night Drive", category:"Male Enhancers", type:"Premium", brand:"Premium", image:"assets/images/products/male-enhancers/night-drive.jpg",
        variants:[{label:"1 pack",price:49.99},{label:"3 pack",price:129.99}] },
      { id:"me-spark-kit", name:"Spark Kit", category:"Male Enhancers", type:"Premium", brand:"Premium", image:"assets/images/products/male-enhancers/spark-kit.jpg",
        variants:[{label:"1 pack",price:44.99},{label:"3 pack",price:119.99}] },

      // Mushrooms (3)
      { id:"mush-astral-micro", name:"Astral Microdose", category:"Mushrooms", type:"Premium", brand:"Premium", image:"assets/images/products/mushrooms/astral-micro.jpg",
        variants:[{label:"1g",price:19.99},{label:"3.5g",price:59.99},{label:"7g",price:109.99}] },
      { id:"mush-comet-caps", name:"Comet Capsules", category:"Mushrooms", type:"Premium", brand:"Premium", image:"assets/images/products/mushrooms/comet-caps.jpg",
        variants:[{label:"15 caps",price:44.99},{label:"30 caps",price:79.99}] },
      { id:"mush-orbit-gummies", name:"Orbit Gummies", category:"Mushrooms", type:"Premium", brand:"Premium", image:"assets/images/products/mushrooms/orbit-gummies.jpg",
        variants:[{label:"10 pack",price:34.99},{label:"20 pack",price:59.99}] },

      // Oils (3)
      { id:"oil-solar-tincture", name:"Solar Tincture", category:"Oils", type:"Oil", brand:"Premium", image:"assets/images/products/oils/solar-tincture.jpg",
        variants:[{label:"30ml",price:44.99},{label:"60ml",price:79.99}] },
      { id:"oil-zen-distillate", name:"Zen Distillate", category:"Oils", type:"Distillate", brand:"Premium", image:"assets/images/products/oils/zen-distillate.jpg",
        variants:[{label:"1g",price:34.99},{label:"2g",price:64.99}] },
      { id:"oil-night-serum", name:"Night Serum", category:"Oils", type:"Oil", brand:"Premium", image:"assets/images/products/oils/night-serum.jpg",
        variants:[{label:"30ml",price:49.99},{label:"60ml",price:89.99}] }
    ];
  }

  // ---------- Rendering ----------
  function getUrlCategory() {
    const url = new URL(location.href);
    const cat = url.searchParams.get("cat");
    return cat ? decodeURIComponent(cat) : "All Products";
  }

  function setUrlCategory(cat) {
    const url = new URL(location.href);
    if (!cat || cat === "All Products") url.searchParams.delete("cat");
    else url.searchParams.set("cat", cat);
    history.replaceState({}, "", url.toString());
  }

  function buildCategoryList(products) {
    const set = new Set(products.map(p => p.category));
    const cats = ["All Products", ...Array.from(set)];

    // order nicely
    cats.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return cats;
  }

  function renderDrawerCategories(cats, currentCat) {
    const drawer = $("drawerCats");
    if (!drawer) return;

    drawer.innerHTML = "";

    cats.forEach(cat => {
      const a = document.createElement("a");
      a.className = "cat-link";
      a.href = cat === "All Products" ? "products.html" : `products.html?cat=${encodeURIComponent(cat)}`;
      a.textContent = cat;
      if (cat === currentCat) {
        a.style.borderColor = "rgba(139,92,246,.45)";
      }
      a.addEventListener("click", () => {
        const toggle = $("catDrawerToggle");
        if (toggle) toggle.checked = false;
      });
      drawer.appendChild(a);
    });
  }

  function renderCategorySelect(cats, currentCat) {
    const sel = $("categorySelect");
    if (!sel) return;

    sel.innerHTML = "";
    cats.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      if (cat === currentCat) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.onchange = () => {
      const cat = sel.value;
      setUrlCategory(cat);
      setTitles(cat);
      renderProductsWindow(cat);
    };
  }

  function setTitles(cat) {
    const pageTitle = $("pageTitle");
    const gridTitle = $("gridTitle");
    if (pageTitle) pageTitle.textContent = cat === "All Products" ? "All Products" : cat;
    if (gridTitle) gridTitle.textContent = cat === "All Products" ? "Products" : cat;
  }

  let ALL_PRODUCTS = [];
  let CURRENT_CAT = "All Products";
  let SEARCH_QUERY = "";

  function filteredProducts() {
    const catOk = (p) => CURRENT_CAT === "All Products" ? true : p.category === CURRENT_CAT;
    const q = SEARCH_QUERY.trim().toLowerCase();
    const qOk = (p) => !q ? true : (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q)
    );
    return ALL_PRODUCTS.filter(p => catOk(p) && qOk(p));
  }

  function renderProductsWindow(cat) {
    CURRENT_CAT = cat || CURRENT_CAT;
    const grid = $("productsGrid");
    if (!grid) return;

    const products = filteredProducts();

    grid.innerHTML = products.map(p => {
      const reviewData = buildReviews(p);
      const first = p.variants[0];

      return `
        <div class="product-tile">
          <a class="product-link" href="product.html?id=${encodeURIComponent(p.id)}">
            <div class="product-tile__media">
              <div class="media-square">
                <img src="${p.image || "assets/images/products/placeholder.jpg"}"
                     alt="${escapeHtml(p.name)}"
                     onerror="this.src='assets/images/products/placeholder.jpg'">
              </div>
              <div class="type-strip">${escapeHtml(p.type)}</div>
            </div>
          </a>

          <div class="product-tile__body">
            <div class="pill-row">
              <span class="pill-mini">${escapeHtml(p.brand)}</span>
              <span class="pill-mini">${escapeHtml(p.category)}</span>
            </div>

            <a class="product-title-link" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a>

            <div class="rating">
              <div class="stars">${stars(reviewData.rating)}</div>
              <button class="reviews-link" type="button" data-open-reviews="${p.id}">
                ${reviewData.count} reviews
              </button>
            </div>

            <div class="price">
              <span class="money" data-price-for="${p.id}">${money(first.price)}</span>
              <span style="opacity:.75; font-weight:1100;">CAD</span>
            </div>

            <div class="buy-row">
              <div class="qty-block">
                <div class="qty-block__label">Quantity</div>
                <div class="qty-block__selectwrap">
                  <select class="variant-select" data-variant-for="${p.id}">
                    ${p.variants.map((v, i) => `<option value="${i}">${escapeHtml(v.label)}</option>`).join("")}
                  </select>
                </div>
              </div>

              <button class="btn btn--solid" type="button" data-buy="${p.id}">Buy</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Bind interactions (event delegation)
    grid.onclick = (e) => {
      const buyBtn = e.target.closest("[data-buy]");
      if (buyBtn) {
        const id = buyBtn.getAttribute("data-buy");
        const product = ALL_PRODUCTS.find(x => x.id === id);
        if (!product) return;

        const sel = grid.querySelector(`[data-variant-for="${CSS.escape(id)}"]`);
        const idx = sel ? Number(sel.value) : 0;
        const variant = product.variants[idx] || product.variants[0];
        addToCart(product, variant);
        return;
      }

      const reviewBtn = e.target.closest("[data-open-reviews]");
      if (reviewBtn) {
        const id = reviewBtn.getAttribute("data-open-reviews");
        const product = ALL_PRODUCTS.find(x => x.id === id);
        if (!product) return;
        openReviews(product);
        return;
      }
    };

    grid.onchange = (e) => {
      const sel = e.target.closest("[data-variant-for]");
      if (!sel) return;
      const id = sel.getAttribute("data-variant-for");
      const product = ALL_PRODUCTS.find(x => x.id === id);
      if (!product) return;
      const idx = Number(sel.value) || 0;
      const v = product.variants[idx] || product.variants[0];
      const priceEl = grid.querySelector(`[data-price-for="${CSS.escape(id)}"]`);
      if (priceEl) priceEl.textContent = money(v.price);
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[m]));
  }

  // ---------- Reviews modal ----------
  function openReviews(product) {
    const modal = $("reviewsModal");
    if (!modal) return;

    const data = buildReviews(product);

    $("reviewsTitle").textContent = `${product.name} — Reviews`;
    $("reviewsSub").textContent = `${data.count} customer reviews • Avg ${data.rating.toFixed(1)}/5`;

    $("reviewsSummary").innerHTML = `
      <div><strong>Category:</strong> ${escapeHtml(product.category)}</div>
      <div><strong>Quality:</strong> Premium verified feedback</div>
      <div><strong>Avg:</strong> ${data.rating.toFixed(1)}/5</div>
    `;

    $("reviewsList").innerHTML = data.items.map(r => `
      <div class="review-card">
        <div class="review-top">
          <div>
            <div class="review-name">${escapeHtml(r.name)}</div>
            <div class="review-date">${escapeHtml(r.date)}</div>
          </div>
          <div class="review-stars">${stars(r.rating)}</div>
        </div>
        <div class="review-text">${escapeHtml(r.text)}</div>
      </div>
    `).join("");

    modal.classList.add("show");
  }

  function closeReviews() {
    const modal = $("reviewsModal");
    if (!modal) return;
    modal.classList.remove("show");
  }

  // ---------- Search ----------
  function setupSearch() {
    const input = $("searchInput");
    const clear = $("searchClearBtn");
    if (!input || !clear) return;

    input.addEventListener("input", () => {
      SEARCH_QUERY = input.value || "";
      renderProductsWindow(CURRENT_CAT);
    });

    clear.addEventListener("click", () => {
      input.value = "";
      SEARCH_QUERY = "";
      renderProductsWindow(CURRENT_CAT);
      input.focus();
    });
  }

  // ---------- Init ----------
  async function init() {
    updateCartBadge();

    ALL_PRODUCTS = await loadCatalog();

    // auto-add review metadata if catalog didn’t include it
    ALL_PRODUCTS = ALL_PRODUCTS.map(p => {
      const built = buildReviews(p);
      return {
        ...p,
        rating: p.rating || built.rating,
        reviewsCount: p.reviewsCount || built.count
      };
    });

    const cats = buildCategoryList(ALL_PRODUCTS);

    CURRENT_CAT = getUrlCategory();
    if (!cats.includes(CURRENT_CAT)) CURRENT_CAT = "All Products";

    setTitles(CURRENT_CAT);
    renderDrawerCategories(cats, CURRENT_CAT);
    renderCategorySelect(cats, CURRENT_CAT);
    setupSearch();

    // Reviews close
    $("reviewsCloseBtn")?.addEventListener("click", closeReviews);
    $("reviewsCloseOverlay")?.addEventListener("click", closeReviews);

    renderProductsWindow(CURRENT_CAT);
  }

  document.addEventListener("DOMContentLoaded", init);
})();