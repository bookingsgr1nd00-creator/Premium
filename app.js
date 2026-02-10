(() => {
  "use strict";

  const PS = {
    config: null,
    products: [],
    cacheBuster: Date.now(),
    cartKey: "ps_cart_v5",
    reviewsState: { productId: null, shown: 0 }
  };

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

  // ---------------- Cart ----------------
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
  function toast(msg){
    const t = $("#toast");
    const tt = $("#toastText");
    if(!t || !tt) return;
    tt.textContent = msg;
    t.classList.add("show");
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => t.classList.remove("show"), 2000);
  }
  function addToCart(productId, variantLabel){
    const cart = getCart();
    const hit = cart.find(it => it.id === productId && it.variant === variantLabel);
    if(hit) hit.qty += 1;
    else cart.push({ id: productId, variant: variantLabel, qty: 1 });
    setCart(cart);
    toast("Added to cart.");
  }

  // ---------------- Rating & Reviews ----------------
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function stars(rating){
    const r = clamp(Number(rating || 0), 0, 5);
    const full = Math.floor(r);
    const half = (r - full) >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return "★".repeat(full + half) + "☆".repeat(empty);
  }

  // Deterministic hash (for unique reviews that never repeat)
  function hash32(str){
    let h = 2166136261;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function pick(seed, arr){
    return arr[seed % arr.length];
  }

  const REVIEW_NAMES = [
    "Alex M.","Jordan P.","Sam R.","Taylor K.","Chris L.","Morgan S.","Riley B.","Jamie T.","Casey N.","Avery D.",
    "Skyler H.","Cameron V.","Parker J.","Quinn A.","Hayden W.","Reese G."
  ];

  const REVIEW_OPENERS = [
    "Premium quality from start to finish.",
    "This one exceeded my expectations.",
    "Exactly the kind of top-shelf experience I wanted.",
    "Super clean presentation and consistent quality.",
    "Really impressed with the freshness and finish.",
    "A+ quality, would reorder without hesitation."
  ];

  const REVIEW_DETAILS = [
    "The look and packaging felt properly dialed in.",
    "The batch felt consistent and well cared for.",
    "Smooth experience and no harsh surprises.",
    "Everything matched the description perfectly.",
    "Quality was steady from the first to the last.",
    "It delivered the premium vibe I was aiming for."
  ];

  const REVIEW_CLOSERS = [
    "Definitely keeping this in the rotation.",
    "Worth it — feels like a premium pick.",
    "Would recommend to anyone who likes clean quality.",
    "I’ll be back for another order.",
    "Solid value for the quality level.",
    "One of the best picks I’ve tried lately."
  ];

  function normalizeProduct(p){
    const out = { ...p };
    out.id = String(out.id || "").trim() || String(out.name || "").toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9\-]/g,"");
    out.rating = Number(out.rating || 4.7);
    out.reviews = Math.max(6, Number(out.reviews || 0));
    out.variants = Array.isArray(out.variants) && out.variants.length ? out.variants : [{ label: "3.5g", price: 0 }];

    // Ensure image always string
    out.image = String(out.image || "");
    out.category = String(out.category || "");
    out.type = String(out.type || "—");
    out.tier = String(out.tier || "Premium");
    out.short = String(out.short || "Neon quality — space-store selection.");
    out.description = String(out.description || "Premium selection with a clean, consistent finish. Rated and reviewed for confidence.");
    return out;
  }

  function makeReview(product, index){
    // Unique per product + per index
    const base = (hash32(product.id) ^ (index * 2654435761)) >>> 0;

    const name = pick(base, REVIEW_NAMES);
    const opener = pick(base + 11, REVIEW_OPENERS);
    const detail = pick(base + 37, REVIEW_DETAILS);
    const closer = pick(base + 71, REVIEW_CLOSERS);

    // Date spread in last ~180 days
    const daysAgo = (base % 180) + 1;
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const date = d.toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"2-digit" });

    // Rating close to product rating, clamped 4.0–5.0
    const jitter = ((base % 21) - 10) / 20; // -0.5..+0.5
    const rating = clamp((Number(product.rating) + jitter), 4.0, 5.0);

    const batch = 1000 + (base % 9000); // makes text never repeat
    const text = `${opener} ${detail} ${closer} (Batch #${batch})`;

    return { name, date, rating, text };
  }

  function openReviews(productId){
    const modal = $("#reviewsModal");
    if(!modal) return;

    const p = PS.products.find(x => x.id === productId);
    if(!p) return;

    PS.reviewsState.productId = productId;
    PS.reviewsState.shown = 0;

    $("#reviewsTitle").textContent = `${p.name} — Reviews`;
    $("#reviewsSub").textContent = `${p.reviews} reviews • ${stars(p.rating)} • Rated for confidence`;

    $("#reviewsList").innerHTML = "";
    renderMoreReviews(true);

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeReviews(){
    const modal = $("#reviewsModal");
    if(!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function renderMoreReviews(first){
    const productId = PS.reviewsState.productId;
    const p = PS.products.find(x => x.id === productId);
    if(!p) return;

    const summary = $("#reviewsSummary");
    const list = $("#reviewsList");
    const moreBtn = $("#reviewsMore");

    const total = p.reviews;
    const chunk = 8;

    const start = PS.reviewsState.shown;
    const end = Math.min(total, start + chunk);

    if(first){
      summary.innerHTML = `
        <div><strong>Average</strong> ${Number(p.rating).toFixed(1)} / 5</div>
        <div><strong>Total</strong> ${total} reviews</div>
        <div><strong>Note</strong> Reviews are unique per product.</div>
      `;
    }

    for(let i=start; i<end; i++){
      const r = makeReview(p, i);
      const card = document.createElement("div");
      card.className = "review-card";
      card.innerHTML = `
        <div class="review-top">
          <div>
            <div class="review-name">${escapeHtml(r.name)}</div>
            <div class="review-date">${escapeHtml(r.date)}</div>
          </div>
          <div class="review-stars">${stars(r.rating)}</div>
        </div>
        <div class="review-text">${escapeHtml(r.text)}</div>
      `;
      list.appendChild(card);
    }

    PS.reviewsState.shown = end;

    if(end >= total){
      moreBtn.style.display = "none";
    } else {
      moreBtn.style.display = "inline-flex";
      moreBtn.textContent = `Load more reviews (${end}/${total})`;
    }
  }

  // Global click handlers for reviews modal
  function initReviewsModal(){
    const modal = $("#reviewsModal");
    if(!modal) return;

    $("#reviewsClose")?.addEventListener("click", closeReviews);
    modal.addEventListener("click", (e) => {
      const close = e.target?.closest("[data-close]");
      if(close) closeReviews();
    });
    $("#reviewsMore")?.addEventListener("click", () => renderMoreReviews(false));

    // Open reviews from anywhere
    document.addEventListener("click", (e) => {
      const t = e.target?.closest(".js-open-reviews");
      if(!t) return;

      e.preventDefault();
      e.stopPropagation();

      const id = t.getAttribute("data-id");
      if(id) openReviews(id);
    });
  }

  // ---------------- Config Apply ----------------
  function applyBrand(){
    const s = PS.config?.store || {};
    const name = s.name || "Premium Supply";
    const tag = s.tagline || "Space Store";
    const badge = s.countryBadge || "100% Canadian";

    const brandName = $("#brandName"); if(brandName) brandName.textContent = name;
    const brandTag = $("#brandTag"); if(brandTag) brandTag.textContent = tag;
    const badgeEl = $("#topbarLeft"); if(badgeEl) badgeEl.textContent = badge;

    const year = $("#year"); if(year) year.textContent = String(new Date().getFullYear());
    const brandNameFoot = $("#brandNameFoot"); if(brandNameFoot) brandNameFoot.textContent = name;

    const rules = s.rules || {};
    const min = rules.minimumOrder ?? 75;
    const free = rules.freeShippingThreshold ?? 250;

    const minP = $("#minOrderPill"); if(minP) minP.textContent = `Min order $${min}`;
    const freeP = $("#freeShipPill"); if(freeP) freeP.textContent = `Free shipping $${free}+`;
  }

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

  // ---------------- Categories ----------------
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

  // ---------------- Pricing ----------------
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

  // ---------------- Product Cards ----------------
  function productCard(p){
    const list = Array.isArray(p.variants) ? p.variants : [];
    const selected = defaultVariantLabel(p);
    const price = variantPrice(p, selected);

    return `
      <article class="product-tile" data-id="${escapeHtml(p.id)}">
        <div class="product-tile__media">
          <a class="product-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${escapeHtml(p.name)}">
            <div class="media-square">
              <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
            </div>
            <div class="type-strip">${escapeHtml(p.type)}</div>
          </a>
        </div>

        <div class="product-tile__body">
          <div class="pill-row">
            <span class="pill-mini">${escapeHtml(p.tier)}</span>
            <span class="pill-mini">${escapeHtml(p.category)}</span>
          </div>

          <a class="product-title-link" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a>

          <div class="rating">
            <div class="stars">${stars(p.rating)}</div>
            <button class="reviews-link js-open-reviews" type="button" data-id="${escapeHtml(p.id)}">
              ${Number(p.reviews)} reviews
            </button>
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

    $$(".js-buy", grid).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const sel = $(`.js-variant[data-id="${CSS.escape(id)}"]`, grid);
        const variant = sel ? sel.value : "";
        addToCart(id, variant);
      });
    });
  }

  // ---------------- Home Rendering ----------------
  function iconForCategory(c){
    const map = {
      "Flower":"fa-seedling",
      "Concentrates":"fa-droplet",
      "Edibles":"fa-cookie-bite",
      "Vapes":"fa-wind",
      "CBD":"fa-leaf",
      "Mushrooms":"fa-mug-hot",
      "Oils":"fa-bottle-droplet",
      "Male Enhancers":"fa-bolt"
    };
    return map[c] || "fa-star";
  }

  function renderHome(){
    const cats = (PS.config?.categories || []).filter(Boolean);

    // Drawer categories
    renderDrawerCategories(null);

    // Promo banners
    const banners = PS.config?.store?.home?.banners || [];
    const bannersHost = $("#homeBanners");
    if(bannersHost){
      bannersHost.innerHTML = banners.map(b => `
        <a class="promo-banner" href="${escapeHtml(b.href || "shop.html")}">
          <div class="promo-banner__bg" style="background-image:url('${escapeHtml(b.image || "")}')"></div>
          <div class="promo-banner__shade"></div>
          <div class="promo-banner__content">
            <h3 class="promo-banner__title">${escapeHtml(b.title || "Promotion")}</h3>
            <p class="promo-banner__text">${escapeHtml(b.text || "")}</p>
            <span class="promo-banner__cta">${escapeHtml(b.ctaLabel || "Shop")} <i class="fa-solid fa-arrow-right"></i></span>
          </div>
        </a>
      `).join("");
    }

    // Category tiles
    const catHost = $("#homeCategoryGrid");
    if(catHost){
      catHost.innerHTML = cats.map(c => `
        <a class="category-tile" href="category.html?c=${encodeURIComponent(c)}">
          <div class="category-tile__left">
            <div class="category-tile__icon"><i class="fa-solid ${iconForCategory(c)}"></i></div>
            <div>
              <div class="category-tile__name">${escapeHtml(c)}</div>
              <div class="category-tile__hint">Browse ${escapeHtml(c)} products</div>
            </div>
          </div>
          <div class="category-tile__arrow"><i class="fa-solid fa-chevron-right"></i></div>
        </a>
      `).join("");
    }

    // 3 products per category
    const previewHost = $("#homeCategoryPreviews");
    if(previewHost){
      const perCat = Number(PS.config?.store?.home?.categoryPreviewCount ?? 3);

      previewHost.innerHTML = cats.map(cat => {
        const items = PS.products
          .filter(p => String(p.category) === String(cat))
          .slice()
          .sort((a,b) => (basePrice(b) - basePrice(a))) // high -> low for premium feel
          .slice(0, perCat);

        // If less than 3, pad with placeholders (so it always shows 3)
        while(items.length < perCat){
          items.push({
            id: `placeholder-${cat}-${items.length}`,
            name: "Coming soon",
            category: cat,
            type: "—",
            tier: "Premium",
            rating: 5,
            reviews: 6,
            image: "assets/products/placeholder.jpg",
            variants: [{ label:"3.5g", price: 0 }]
          });
        }

        return `
          <div class="preview-row">
            <div class="preview-row__head">
              <h3 class="preview-row__title">${escapeHtml(cat)}</h3>
              <a class="link" href="category.html?c=${encodeURIComponent(cat)}">View all</a>
            </div>
            <div class="preview-row__grid">
              ${items.map(productCard).join("")}
            </div>
          </div>
        `;
      }).join("");

      // hook buy + variant change inside home previews
      previewHost.addEventListener("change", (e) => {
        const sel = e.target.closest(".js-variant");
        if(!sel) return;
        const id = sel.dataset.id;
        const p = PS.products.find(x => x.id === id) || null;
        if(!p) return;
        const priceEl = $(`.js-price[data-id="${CSS.escape(id)}"]`, previewHost);
        if(priceEl) priceEl.textContent = money(variantPrice(p, sel.value));
      });

      previewHost.addEventListener("click", (e) => {
        const btn = e.target.closest(".js-buy");
        if(!btn) return;
        const id = btn.dataset.id;
        const sel = $(`.js-variant[data-id="${CSS.escape(id)}"]`, previewHost);
        if(!sel) return;
        // ignore placeholder
        if(id.startsWith("placeholder-")) return;
        addToCart(id, sel.value);
      });
    }
  }

  // ---------------- Search & Sort ----------------
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
    if(state.sort === "price_desc") list.sort((a,b) => basePrice(b) - basePrice(a));
    if(state.sort === "price_asc") list.sort((a,b) => basePrice(a) - basePrice(b));
    if(state.sort === "rating_desc") list.sort((a,b) => Number(b.rating||0) - Number(a.rating||0));
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

    const open = getParam("search");
    const toggle = $("#searchToggle");
    if(open === "1" && toggle){
      toggle.checked = true;
      q.focus();
    }
  }

  // ---------------- Pages ----------------
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
    const title = category || "Category";
    $("#topbarTitle") && ($("#topbarTitle").textContent = title);
    $("#catTitle") && ($("#catTitle").textContent = title);

    renderDrawerCategories(category);
    initCategoryDropdown(category);

    state.sort = PS.config?.sortDefault || "price_desc";

    const base = PS.products.filter(p => String(p.category) === String(category));
    if(!base.length){
      showNotice(`No products found for "${category}". Check that catalog.json uses the exact same category name.`);
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

    renderDrawerCategories(p.category);

    const root = $("#productRoot");
    const selected = defaultVariantLabel(p);
    const price = variantPrice(p, selected);

    root.innerHTML = `
      <div class="detail">
        <div class="media-square">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
        </div>

        <div>
          <h1>${escapeHtml(p.name)}</h1>
          <p>${escapeHtml(p.short)}</p>

          <div class="rating" style="margin-top:12px;">
            <div class="stars">${stars(p.rating)}</div>
            <button class="reviews-link js-open-reviews" type="button" data-id="${escapeHtml(p.id)}">
              ${Number(p.reviews)} reviews
            </button>
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
            <p class="muted">${escapeHtml(p.description)}</p>
          </div>
        </div>
      </div>
    `;

    const sel = $("#detailVariant");
    const priceEl = $("#detailPrice");
    sel.addEventListener("change", () => {
      priceEl.textContent = money(variantPrice(p, sel.value));
    });
    $("#detailBuy").addEventListener("click", () => addToCart(p.id, sel.value));
  }

  // ---------------- Promo popup & age gate ----------------
  function initPromoPopup(){
    const promo = PS.config?.store?.promoPopup;
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

  // ---------------- Boot ----------------
  async function boot(){
    updateCartBadge();
    initReviewsModal();

    try{
      PS.config = await loadJSON("site-config.json");
      const rawCatalog = await loadJSON("catalog.json");
      if(!Array.isArray(rawCatalog)) throw new Error("catalog.json must be an array []");

      PS.products = rawCatalog.map(normalizeProduct);

      applyBrand();
      initPromoStrip();
      initPromoPopup();
      initAgeGate();

      const page = document.body.dataset.page || "home";
      if(page === "home") renderHome();
      if(page === "shop") initShopPage();
      if(page === "category") initCategoryPage();
      if(page === "product") initProductPage();

    }catch(err){
      console.error(err);
      showNotice(`ERROR: ${err.message}. Ensure site-config.json and catalog.json are in the SAME folder as your HTML files.`);
      const grid = $("#grid");
      if(grid) grid.innerHTML = "";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();