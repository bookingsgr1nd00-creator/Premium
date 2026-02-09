(() => {
  const PS_DEFAULT = {
    brand: { name:"Premium Supply", tagline:"Space Store", logo:"assets/brand/logo-planet.png" },
    store: { currency:"CAD", minOrder:75, freeShippingOver:250, flatShipping:15, paymentEmail:"payments@premiumsupply.ca" },
    ui: { topbarLeft:"CANADA WIDE DELIVERY", heroTitle:"DAILY OUT OF SPACE DEALS, SPACESHIP FAST DELIVERY🚀", heroSubtitle:"Pick your size • Add to cart • Simple checkout" },
    promo: { enabled:true, showOnce:true, title:"Welcome to Premium Supply ✨", message:"Minimum order $75 • Free shipping $250+", ctaText:"Shop now", dontShowText:"Don’t show again" },
    categories: ["Flower","Concentrates","Edibles","Vapes","CBD","Male Enhancers"]
  };

  const PS = window.PS = {
    cartKey: "ps_cart_v2",
    promoKey: "ps_promo_dismissed_v2",
    lastOrderKey: "ps_last_order_v2",
    config: PS_DEFAULT,
    catalog: null
  };

  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const getParam = (name) => new URLSearchParams(location.search).get(name);

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  function deepMerge(a,b){
    if(Array.isArray(a) && Array.isArray(b)) return b;
    if(a && typeof a === "object" && b && typeof b === "object"){
      for(const k of Object.keys(b)){
        a[k] = (k in a) ? deepMerge(a[k], b[k]) : b[k];
      }
      return a;
    }
    return (b === undefined) ? a : b;
  }

  async function loadConfig(){
    try{
      const res = await fetch("site-config.json", { cache:"no-store" });
      if(!res.ok) return PS_DEFAULT;
      const cfg = await res.json();
      return deepMerge(clone(PS_DEFAULT), cfg);
    }catch{
      return PS_DEFAULT;
    }
  }

  async function loadCatalog(){
    const res = await fetch("catalog.json", { cache:"no-store" });
    if(!res.ok) throw new Error("catalog.json missing");
    return await res.json();
  }

  function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function initCategoryDropdown(currentCategory){
  const sel = document.getElementById("categorySelect");
  if(!sel) return;

  const cats = PS.config.categories || [];

  sel.innerHTML =
    `<option value="__all__">All Products</option>` +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  // Preselect current
  if(currentCategory && cats.includes(currentCategory)){
    sel.value = currentCategory;
  } else {
    sel.value = "__all__";
  }

  sel.addEventListener("change", () => {
    const val = sel.value;
    if(val === "__all__"){
      window.location.href = "products.html";
    } else {
      window.location.href = `category.html?c=${encodeURIComponent(val)}`;
    }
  });
}

  function money(n){
    const cur = PS.config?.store?.currency || "CAD";
    return new Intl.NumberFormat("en-CA", { style:"currency", currency:cur }).format(Number(n||0));
  }

  function typeClass(type){
    const t = String(type||"").toLowerCase();
    if(t.includes("indica")) return "type-strip--indica";
    if(t.includes("hybrid")) return "type-strip--hybrid";
    if(t.includes("sativa")) return "type-strip--sativa";
    return "type-strip--other";
  }

  function toStarHTML(rating){
    const r = Math.round((Number(rating)||0) * 2) / 2;
    const full = Math.floor(r);
    const half = (r - full) >= 0.5;
    let html = "";
    for(let i=0;i<full;i++) html += '<i class="fa-solid fa-star"></i>';
    if(half) html += '<i class="fa-solid fa-star-half-stroke"></i>';
    const empty = 5 - full - (half ? 1 : 0);
    for(let i=0;i<empty;i++) html += '<i class="fa-regular fa-star"></i>';
    return html;
  }

  function readCart(){
    try { return JSON.parse(localStorage.getItem(PS.cartKey) || "{}"); }
    catch { return {}; }
  }
  function writeCart(cart){ localStorage.setItem(PS.cartKey, JSON.stringify(cart)); }
  function cartCount(cart){ return Object.values(cart).reduce((s,i)=> s + (Number(i.qty)||0), 0); }
  function updateCartBadges(){
    const c = cartCount(readCart());
    $$(".js-cart-count").forEach(el => el.textContent = String(c));
  }

  function showToast(msg){
    const toast = $("#toast");
    if(!toast) return;
    const t = $("#toastText");
    if(t) t.textContent = msg;
    toast.classList.add("toast--show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toast.classList.remove("toast--show"), 2200);
  }

  function variantList(p){ return Array.isArray(p.variants) ? p.variants : []; }
  function defaultVariantLabel(p){
    const list = variantList(p);
    const preferred = list.find(v => v.label === "3.5g");
    return (preferred || list[0] || {label:""}).label;
  }
  function variantPrice(p, label){
    const v = variantList(p).find(x => x.label === label);
    return Number(v?.price ?? 0);
  }

  function applyBrand(){
    const cfg = PS.config;

    const logo = cfg.brand?.logo || "assets/brand/logo-planet.png";
    $$(".js-brand-logo").forEach(img => img.setAttribute("src", logo));
    $$(".js-brand-name").forEach(el => el.textContent = cfg.brand?.name || "Premium Supply");
    $$(".js-brand-tag").forEach(el => el.textContent = cfg.brand?.tagline || "Space Store");

    const topLeft = $("#topbarLeft");
    if(topLeft) topLeft.innerHTML = `<i class="fa-solid fa-maple-leaf"></i> ${cfg.ui?.topbarLeft || "100% Canadian"}`;
  }

  function renderDrawerCategories(activeCategory){
  const host = document.getElementById("drawerCats");
  if(!host) return;

  const cats = (PS.config.categories || []).filter(Boolean);

  host.innerHTML = cats.map(c => {
    const isActive = activeCategory && String(c).toLowerCase() === String(activeCategory).toLowerCase();
    return `
      <a class="cat-link" href="category.html?c=${encodeURIComponent(c)}" ${isActive ? 'aria-current="page"' : ""}>
        ${escapeHtml(c)}
      </a>
    `;
  }).join("");
}
    const quick = $("#quickCats");
    if(quick){
      quick.innerHTML = cats.map(c=>`<a class="cat-pill" href="category.html?c=${encodeURIComponent(c)}">${c}</a>`).join("");
    }
  }

  function initPromoIfPresent(){
    const cfg = PS.config.promo || {};
    const modal = $("#promoModal");
    if(!modal) return;
    if(!cfg.enabled) return;

    const dismissed = localStorage.getItem(PS.promoKey) === "1";
    if(cfg.showOnce && dismissed) return;

    $("#promoTitle").textContent = cfg.title || "Welcome ✨";
    $("#promoMsg").textContent = cfg.message || "";
    $("#promoContinue").textContent = cfg.ctaText || "Shop now";
    $("#promoDontShow").textContent = cfg.dontShowText || "Don’t show again";

    modal.classList.add("promo-modal--show");

    const close = () => modal.classList.remove("promo-modal--show");
    $("#promoClose").onclick = close;
    $("#promoContinue").onclick = close;
    $("#promoDontShow").onclick = () => { localStorage.setItem(PS.promoKey, "1"); close(); };
    modal.querySelector("[data-close]").onclick = close;
  }

  function productCard(p){
  const sale = (p.badges || []).map(b => String(b).toLowerCase()).includes("sale");
  const list = Array.isArray(p.variants) ? p.variants : [];
  const selected = defaultVariantLabel(p);
  const unitPrice = selected ? variantPrice(p, selected) : 0;

  const mediaHTML = p.image
    ? `<div class="media-square">
         <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async">
       </div>`
    : `<div class="media-square"><div class="media-placeholder" aria-hidden="true"></div></div>`;

  const selector = list.length
    ? `<div class="qty-block">
         <div class="qty-block__label">Quantity</div>
         <div class="qty-block__selectwrap">
           <select class="variant-select js-variant" data-id="${p.id}">
             ${list.map(v => `<option value="${v.label}" ${v.label===selected ? "selected":""}>${v.label}</option>`).join("")}
           </select>
         </div>
       </div>`
    : `<div class="qty-block">
         <div class="qty-block__label">Quantity</div>
         <div class="qty-block__selectwrap">
           <span class="muted">Not set</span>
         </div>
       </div>`;

  return `
    <article class="product-tile" data-id="${p.id}">
      <div class="product-tile__media">
        ${sale ? `<span class="sale-bubble">Sale!</span>` : ""}
        <a class="product-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${p.name}">
          ${mediaHTML}
          <div class="type-strip ${typeClass(p.type)}">${p.type || "—"}</div>
        </a>
      </div>

      <div class="product-tile__body">
        <div class="pill-row">
          <span class="pill pill--tier">${p.tier || "Premium"}</span>
          <span class="pill pill--tag">${p.category || "Category"}</span>
        </div>

        <a class="product-title-link" href="product.html?id=${encodeURIComponent(p.id)}">${p.name}</a>

        <div class="rating">
          <div class="stars">${toStarHTML(p.rating)}</div>
          <div class="reviews">${Number(p.reviews||0)} reviews</div>
        </div>

        <div class="price">
          <span class="js-price" data-id="${p.id}">${money(unitPrice)}</span>
          <span class="muted">${PS.config.store.currency}</span>
        </div>

        <div class="buy-row">
          ${selector}
          <button class="btn btn--solid btn--full js-buy" type="button" data-id="${p.id}" ${list.length ? "" : "disabled"}>Buy</button>
        </div>
      </div>
    </article>
  `;
}

  function bindCatalogInteractions(catalog){
    // Update price on variant change
    document.addEventListener("change", (e) => {
      const sel = e.target.closest(".js-variant");
      if(!sel) return;
      const id = sel.dataset.id;
      const p = catalog.find(x => x.id === id);
      if(!p) return;
      const priceEl = document.querySelector(`.js-price[data-id="${id}"]`);
      if(priceEl) priceEl.textContent = money(variantPrice(p, sel.value));
    });

    // Buy adds 1 unit of selected size
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".js-buy");
      if(!btn) return;

      const id = btn.dataset.id;
      const p = catalog.find(x => x.id === id);
      if(!p) return;

      const sel = document.querySelector(`.js-variant[data-id="${id}"]`);
      const size = sel ? sel.value : defaultVariantLabel(p);
      const unitPrice = variantPrice(p, size);

      const lineKey = `${id}::${size}`;
      const cart = readCart();

      if(cart[lineKey]) cart[lineKey].qty += 1;
      else cart[lineKey] = { ...p, variant: size, price: unitPrice, qty: 1 };

      writeCart(cart);
      updateCartBadges();
      showToast(`Added 1 × ${p.name} (${size})`);
    });
  }

  async function initProductsPage(){
    initPromoIfPresent();

    // hero texts
    const heroTitle = $("#heroTitle");
    const heroSubtitle = $("#heroSubtitle");
    const minOrderText = $("#minOrderText");
    const freeShipText = $("#freeShipText");

    if(heroTitle) heroTitle.textContent = PS.config.ui.heroTitle;
    if(heroSubtitle) heroSubtitle.textContent = PS.config.ui.heroSubtitle;
    if(minOrderText) minOrderText.textContent = `Min order $${PS.config.store.minOrder}`;
    if(freeShipText) freeShipText.textContent = `Free shipping $${PS.config.store.freeShippingOver}+`;

    const grid = $("#grid");
    const q = $("#q");
    const sort = $("#sort");
    const clearBtn = $("#clearBtn");

    const catalog = PS.catalog = await loadCatalog();
    bindCatalogInteractions(catalog);

    function filtered(){
      const query = (q?.value || "").trim().toLowerCase();
      const mode = (sort?.value || "price_desc");

      let list = catalog.slice();
      if(query){
        list = list.filter(p => ([p.name,p.category,p.type,p.tier,p.tag].join(" ").toLowerCase()).includes(query));
      }

      list.sort((a,b) => {
        const ap = variantPrice(a, defaultVariantLabel(a));
        const bp = variantPrice(b, defaultVariantLabel(b));
        if(mode === "price_asc") return ap - bp;
        if(mode === "rating_desc") return (b.rating||0) - (a.rating||0);
        return bp - ap;
      });

      return list;
    }

    function render(){
      const list = filtered();
      if(!list.length){
        grid.innerHTML = `<div class="card" style="grid-column:1/-1;">
          <strong>No results.</strong>
          <p class="muted" style="margin:.5rem 0 0;">Try another search.</p>
        </div>`;
        return;
      }
      grid.innerHTML = list.map(productCard).join("");
    }

    q?.addEventListener("input", render);
    sort?.addEventListener("change", render);
    clearBtn?.addEventListener("click", ()=>{ q.value=""; render(); });

    render();
  }

  async function initCategoryPage(){
    const grid = $("#grid");
    const title = $("#catTitle");
    const q = $("#q");
    const sort = $("#sort");
    const clearBtn = $("#clearBtn");

    const category = (getParam("c") || "Category").trim();
    if(title) title.textContent = category;

    const catalog = PS.catalog = await loadCatalog();
    bindCatalogInteractions(catalog);

    function filtered(){
      const query = (q?.value || "").trim().toLowerCase();
      const mode = (sort?.value || "price_desc");

      let list = catalog.filter(p => String(p.category||"") === category);

      if(query){
        list = list.filter(p => ([p.name,p.category,p.type,p.tier,p.tag].join(" ").toLowerCase()).includes(query));
      }

      list.sort((a,b) => {
        const ap = variantPrice(a, defaultVariantLabel(a));
        const bp = variantPrice(b, defaultVariantLabel(b));
        if(mode === "price_asc") return ap - bp;
        if(mode === "rating_desc") return (b.rating||0) - (a.rating||0);
        return bp - ap;
      });

      return list;
    }

    function render(){
      const list = filtered();
      if(!list.length){
        grid.innerHTML = `<div class="card" style="grid-column:1/-1;">
          <strong>No products yet.</strong>
          <p class="muted" style="margin:.5rem 0 0;">Add products in <b>catalog.json</b>.</p>
        </div>`;
        return;
      }
      grid.innerHTML = list.map(productCard).join("");
    }

    q?.addEventListener("input", render);
    sort?.addEventListener("change", render);
    clearBtn?.addEventListener("click", ()=>{ q.value=""; render(); });

    render();
  }

  async function initProductPage(){
    const id = getParam("id");
    const vParam = getParam("v");

    const details = $("#detailsCard");
    if(!id){
      details.innerHTML = `<strong>Missing product ID.</strong><p class="muted">Open from the product list.</p>`;
      return;
    }

    const catalog = PS.catalog = await loadCatalog();
    const p = catalog.find(x => x.id === id);

    if(!p){
      details.innerHTML = `<strong>Product not found.</strong><p class="muted">This item may have been removed.</p>`;
      return;
    }

    document.title = `${PS.config.brand.name} — ${p.name}`;

    $("#name").textContent = p.name;
    $("#tier").textContent = p.tier || "Premium";
    $("#category").textContent = p.category || "Category";
    $("#type").textContent = p.type || "—";
    $("#reviews").textContent = String(Number(p.reviews||0));
    $("#stars").innerHTML = toStarHTML(p.rating);
    $("#currency").textContent = PS.config.store.currency;

    $("#noteMin").textContent = `$${PS.config.store.minOrder} ${PS.config.store.currency}`;
    $("#noteShip").textContent = `$${PS.config.store.freeShippingOver}+ ${PS.config.store.currency}`;

    if(p.category){
      const a = $("#backToCategory");
      a.style.display = "inline";
      a.href = `category.html?c=${encodeURIComponent(p.category)}`;
      a.textContent = `Back to ${p.category}`;
    }

    if(p.image){
      $("#mediaSquare").innerHTML = `<img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async">`;
    }

    const list = variantList(p);
    const select = $("#variantSelect");

    if(!list.length){
      select.innerHTML = `<option value="">No sizes</option>`;
      $("#buyBtn").disabled = true;
      $("#buyBtn").textContent = "Unavailable";
      return;
    }

    select.innerHTML = list.map(v => `<option value="${v.label}">${v.label}</option>`).join("");

    const defaultLabel = (vParam && list.some(x => x.label === vParam))
      ? vParam
      : (list.find(x => x.label === "3.5g")?.label || list[0].label);

    select.value = defaultLabel;

    function updatePrice(){
      $("#price").textContent = money(variantPrice(p, select.value));
    }
    updatePrice();
    select.addEventListener("change", updatePrice);

    $("#buyBtn").addEventListener("click", () => {
      const size = select.value;
      const unitPrice = variantPrice(p, size);

      const lineKey = `${p.id}::${size}`;
      const cart = readCart();

      if(cart[lineKey]) cart[lineKey].qty += 1;
      else cart[lineKey] = { ...p, variant: size, price: unitPrice, qty: 1 };

      writeCart(cart);
      updateCartBadges();
      showToast(`Added 1 × ${p.name} (${size})`);
    });
  }

  function calcCart(cart){
    const items = Object.entries(cart).map(([key, item]) => ({ key, ...item }));
    const subtotal = items.reduce((s,i)=> s + (Number(i.price||0) * Number(i.qty||0)), 0);
    const shipping = items.length ? (subtotal >= PS.config.store.freeShippingOver ? 0 : PS.config.store.flatShipping) : 0;
    const total = subtotal + shipping;
    return { items, subtotal, shipping, total };
  }

  async function initCartPage(){
    const itemsEl = $("#items");

    function render(){
      const cart = readCart();
      updateCartBadges();

      const { items, subtotal, shipping, total } = calcCart(cart);

      $("#subtotal").textContent = money(subtotal);
      $("#shipping").textContent = money(shipping);
      $("#total").textContent = money(total);

      $("#minLabel").textContent = `$${PS.config.store.minOrder} ${PS.config.store.currency}`;
      $("#shipLabel").textContent = `$${PS.config.store.freeShippingOver}+`;
      $("#flatLabel").textContent = money(PS.config.store.flatShipping);

      const minOk = subtotal >= PS.config.store.minOrder;
      $("#minAlert").style.display = (!items.length || minOk) ? "none" : "block";

      $("#checkoutBtn").disabled = (!items.length || !minOk);

      if(!items.length){
        itemsEl.innerHTML = `<p class="muted">Your cart is empty. <a href="products.html" style="text-decoration:underline; font-weight:950;">Shop products</a>.</p>`;
        return;
      }

      itemsEl.innerHTML = items.map(i => {
        const variant = i.variant ? ` — ${i.variant}` : "";
        return `
          <div class="cart-item" data-key="${encodeURIComponent(i.key)}">
            <div class="cart-thumb">
              ${i.image ? `<img src="${i.image}" alt="${i.name}" loading="lazy" decoding="async">` : ``}
            </div>

            <div class="cart-meta">
              <h3 style="margin:0;">
                <a href="product.html?id=${encodeURIComponent(i.id)}&v=${encodeURIComponent(i.variant||"")}" style="text-decoration:underline; text-underline-offset:3px;">
                  ${i.name}${variant}
                </a>
              </h3>
              <div class="meta">${i.category || ""} • ${i.tier || ""} • ${i.type || ""}</div>
              <div class="meta"><strong>${money(Number(i.price||0))}</strong> each</div>

              <div class="variant" style="margin-top:10px;">
                <span>Units</span>
                <div style="display:flex; gap:10px; width:100%; justify-content:center;">
                  <button class="btn js-minus" type="button" style="height:42px;">−</button>
                  <input class="variant-select js-qty" type="number" min="1" value="${Number(i.qty||1)}" style="max-width:140px;">
                  <button class="btn js-plus" type="button" style="height:42px;">+</button>
                </div>
              </div>
            </div>

            <div class="cart-actions">
              <button class="btn" type="button" data-remove>Remove</button>
              <div class="muted">${money(Number(i.price||0) * Number(i.qty||0))}</div>
            </div>
          </div>
        `;
      }).join("");
    }

    document.addEventListener("click", (e) => {
      const row = e.target.closest(".cart-item");
      if(!row) return;

      const key = decodeURIComponent(row.dataset.key);
      const cart = readCart();

      if(e.target.closest("[data-remove]")){
        delete cart[key];
        writeCart(cart);
        render();
        return;
      }
      if(e.target.closest(".js-plus")){
        cart[key].qty = Math.max(1, Number(cart[key].qty||1) + 1);
        writeCart(cart);
        render();
        return;
      }
      if(e.target.closest(".js-minus")){
        cart[key].qty = Math.max(1, Number(cart[key].qty||1) - 1);
        writeCart(cart);
        render();
        return;
      }
    });

    document.addEventListener("input", (e) => {
      const input = e.target.closest(".js-qty");
      if(!input) return;

      const row = e.target.closest(".cart-item");
      if(!row) return;

      const key = decodeURIComponent(row.dataset.key);
      const cart = readCart();
      cart[key].qty = Math.max(1, Number(input.value||1));
      writeCart(cart);
      render();
    });

    $("#checkoutBtn").addEventListener("click", () => location.href = "checkout.html");

    render();
  }

  function fmtDateTime(ms){
    return new Intl.DateTimeFormat("en-CA", { dateStyle:"medium", timeStyle:"short" }).format(new Date(ms));
  }
  function fmtCountdown(msLeft){
    const s = Math.max(0, Math.floor(msLeft/1000));
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s%60;
    return `${h}h ${m}m ${sec}s`;
  }
  function makeOrderId(){
    const now = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2,6).toUpperCase();
    return `PS-${now}-${rnd}`;
  }

  async function initCheckoutPage(){
    const readLastOrder = () => {
      try { return JSON.parse(localStorage.getItem(PS.lastOrderKey) || "null"); }
      catch { return null; }
    };
    const writeLastOrder = (order) => localStorage.setItem(PS.lastOrderKey, JSON.stringify(order));

    function buildSummary(order){
      const lines = [];
      lines.push(`${PS.config.brand.name} — Order Summary`);
      lines.push(`Order ID: ${order.orderId}`);
      lines.push(`Created: ${fmtDateTime(order.createdAt)}`);
      lines.push(`Pay by: ${fmtDateTime(order.payByAt)} (24 hours)`);
      lines.push(`Account closure time: ${fmtDateTime(order.closeAt)} (48 hours)`);
      lines.push("");
      lines.push("Items:");
      order.items.forEach(i => {
        const v = i.variant ? ` — ${i.variant}` : "";
        lines.push(`- ${i.qty} x ${i.name}${v} @ ${money(i.price)}`);
      });
      lines.push("");
      lines.push(`Subtotal: ${money(order.subtotal)}`);
      lines.push(`Shipping: ${money(order.shipping)}`);
      lines.push(`Total: ${money(order.total)}`);
      lines.push("");
      lines.push(`Payment: Interac e‑Transfer to ${PS.config.store.paymentEmail}`);
      lines.push(`Reference/Message: ${order.orderId}`);
      return lines.join("\n");
    }

    let countdownTimer = null;

    function showConfirmation(order){
      if(countdownTimer) clearInterval(countdownTimer);

      $("#confirmWrap").style.display = "block";
      $("#orderIdText").textContent = order.orderId;
      $("#payByText").textContent = fmtDateTime(order.payByAt);
      $("#payEmail").textContent = PS.config.store.paymentEmail;
      $("#payRef").textContent = order.orderId;

      const summary = buildSummary(order);
      $("#summaryBox").textContent = summary;

      function tick(){ $("#timeLeftText").textContent = fmtCountdown(order.payByAt - Date.now()); }
      tick();
      countdownTimer = setInterval(tick, 1000);

      $("#copySummaryBtn").onclick = async () => {
        try{
          await navigator.clipboard.writeText(summary);
          $("#copySummaryBtn").textContent = "Copied ✓";
          setTimeout(()=> $("#copySummaryBtn").textContent="Copy summary", 1200);
        }catch{
          alert("Copy failed on this browser. Please select and copy manually.");
        }
      };

      $("#downloadSummaryBtn").onclick = () => {
        const blob = new Blob([summary], { type:"text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${order.orderId}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };

      $("#restoreCartBtn").onclick = () => {
        if(order.cartSnapshot){
          writeCart(order.cartSnapshot);
          location.href = "cart.html";
        }
      };
    }

    function renderReview(){
      updateCartBadges();

      const cart = readCart();
      const totals = calcCart(cart);

      $("#subtotal").textContent = money(totals.subtotal);
      $("#shipping").textContent = money(totals.shipping);
      $("#total").textContent = money(totals.total);

      $("#minLabel").textContent = `$${PS.config.store.minOrder} ${PS.config.store.currency}`;

      const minOk = totals.subtotal >= PS.config.store.minOrder;
      $("#minAlert").style.display = (!totals.items.length || minOk) ? "none" : "block";
      $("#placeOrderBtn").disabled = (!totals.items.length || !minOk);

      const review = $("#reviewItems");

      if(!totals.items.length){
        review.innerHTML = `<p class="muted">Your cart is empty. <a href="products.html" style="text-decoration:underline; font-weight:950;">Shop products</a>.</p>`;
        return totals;
      }

      review.innerHTML = totals.items.map(i => {
        const variant = i.variant ? ` — <strong>${i.variant}</strong>` : "";
        return `
          <div class="cart-item" style="grid-template-columns: 60px 1fr;">
            <div class="cart-thumb" style="width:60px;height:60px;">
              ${i.image ? `<img src="${i.image}" alt="${i.name}" loading="lazy" decoding="async">` : ``}
            </div>
            <div class="cart-meta">
              <h3 style="margin:0;font-size:.98rem;">${i.name}${variant}</h3>
              <div class="meta"><strong>${i.qty}</strong> × ${money(Number(i.price||0))}</div>
            </div>
          </div>
        `;
      }).join("");

      return totals;
    }

    $("#placeOrderBtn").addEventListener("click", () => {
      const cart = readCart();
      const totals = calcCart(cart);

      if(!totals.items.length) return;
      if(totals.subtotal < PS.config.store.minOrder){
        alert(`Minimum order is $${PS.config.store.minOrder} ${PS.config.store.currency} before shipping.`);
        return;
      }

      const createdAt = Date.now();
      const order = {
        orderId: makeOrderId(),
        createdAt,
        payByAt: createdAt + 24*60*60*1000,
        closeAt: createdAt + 48*60*60*1000,
        items: totals.items,
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        total: totals.total,
        cartSnapshot: cart
      };

      writeLastOrder(order);
      writeCart({});
      renderReview();
      showConfirmation(order);
      window.scrollTo({ top: 0, behavior:"smooth" });
    });

    renderReview();

    const last = readLastOrder();
    if(last && last.orderId){
      showConfirmation(last);
    }
  }

  async function bootstrap(){
    PS.config = await loadConfig();
    applyBrand();
    buildDrawerLinks();
    updateCartBadges();

    const page = document.body.dataset.page;

    try{
      if(page === "products") await initProductsPage();
      if(page === "category") await initCategoryPage();
      if(page === "product") await initProductPage();
      if(page === "cart") await initCartPage();
      if(page === "checkout") await initCheckoutPage();
    }catch(err){
      console.error(err);
      const grid = $("#grid");
      if(grid){
        grid.innerHTML = `<div class="card" style="grid-column:1/-1;">
          <strong>Data failed to load.</strong>
          <p class="muted" style="margin:.5rem 0 0;">
            Make sure <b>catalog.json</b> and <b>site-config.json</b> are in <b>/Premium/</b>.
          </p>
        </div>`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();