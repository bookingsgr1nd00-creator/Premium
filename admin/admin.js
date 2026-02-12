// admin/admin.js
(() => {
  const cfg = window.PS_ADMIN_CONFIG || { apiBase: "", requireLogin: false };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const toastEl = $("#toast");
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  const isDemo = !cfg.requireLogin || localStorage.getItem("ps_admin_demo") === "1";
  const token = localStorage.getItem("ps_admin_token") || "";

  $("#modePill").textContent = isDemo ? "Demo mode (browser draft)" : "Secure mode (server)";

  // Basic auth guard for server mode
  if (!isDemo && !token) {
    alert("You are not logged in.");
    location.href = "login.html";
    return;
  }

  // --- Catalog state
  let catalog = null;

  const DEFAULT_CATALOG = {
    settings: {
      brand: { name: "Premium Supply", tagline: "Premium Quality", logoPath: "assets/brand/logo.png" },
      rules: { currency: "CAD", minOrder: 75, freeShipping: 250 },
      disclaimer:
        "If you don’t complete payment within 24 hours, your account may be suspended. Continued non‑payment may result in loss of access within 48 hours.",
      payments: {
        etransfer: {
          email: "payments@premiumsupply.ca",
          recipient: "Premium Supply",
          qa: [
            { q: "Which Canadian city is on your shipping label?", a: "Vancouver" },
            { q: "Which province is Premium Supply serving today?", a: "Ontario" },
            { q: "What colour is the maple leaf on the Canadian flag?", a: "Red" }
          ]
        },
        crypto: {
          BTC: "",
          ETH: "",
          LTC: "",
          USDT: "",
          DOGE: ""
        }
      }
    },
    promotions: [],
    categories: [],
    products: [],
    home: { hotPicks: [] }
  };

  const DRAFT_KEY = "ps_catalog_draft_v1";

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
  }

  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (!isDemo) headers.Authorization = `Bearer ${token}`;
    return fetch((cfg.apiBase || "") + path, { ...opts, headers });
  }

  async function loadCatalog() {
    // 1) Try server mode
    if (!isDemo) {
      const res = await apiFetch("/api/catalog");
      if (!res.ok) throw new Error("Failed to load catalog from server");
      return await res.json();
    }

    // 2) Demo mode: load from /catalog.json
    const url = new URL("../catalog.json", location.href);
    let base = null;
    try {
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) base = await res.json();
    } catch {}

    // 3) fallback default
    if (!base) base = structuredClone(DEFAULT_CATALOG);

    // 4) overlay draft (if exists)
    const draftRaw = localStorage.getItem(DRAFT_KEY);
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        // draft replaces base (most predictable)
        base = draft;
      } catch {}
    }
    return base;
  }

  async function saveCatalog() {
    if (!catalog) return;

    if (!isDemo) {
      const res = await apiFetch("/api/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(catalog)
      });
      if (!res.ok) throw new Error("Save failed");
      toast("Saved to server ✅");
      return;
    }

    // demo mode: local draft only
    localStorage.setItem(DRAFT_KEY, JSON.stringify(catalog, null, 2));
    toast("Draft saved in this browser ✅ (Export to publish)");
  }

  function exportCatalog() {
    if (!catalog) return;
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "catalog.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Exported catalog.json");
  }

  function setTab(tab) {
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$("[data-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
  }

  $$(".nav-item").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  $("#btnReload").addEventListener("click", async () => {
    catalog = await loadCatalog();
    renderAll();
    toast("Reloaded");
  });

  $("#btnSave").addEventListener("click", async () => {
    try {
      pullSettingsFromUI();
      await saveCatalog();
      renderStats();
    } catch (e) {
      alert(String(e.message || e));
    }
  });

  $("#btnExport").addEventListener("click", () => {
    pullSettingsFromUI();
    exportCatalog();
  });

  $("#btnLogout").addEventListener("click", () => {
    localStorage.removeItem("ps_admin_token");
    localStorage.removeItem("ps_admin_demo");
    toast("Logged out");
    setTimeout(() => (location.href = "login.html"), 400);
  });

  $("#importJson").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      catalog = obj;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(catalog, null, 2));
      renderAll();
      toast("Imported");
    } catch {
      alert("Invalid JSON file");
    } finally {
      e.target.value = "";
    }
  });

  // --- Render
  function renderStats() {
    $("#statProducts").textContent = String(catalog?.products?.length || 0);
    $("#statCategories").textContent = String(catalog?.categories?.length || 0);
    $("#statPromos").textContent = String(catalog?.promotions?.length || 0);
  }

  function renderPromotions() {
    const root = $("#promoList");
    root.innerHTML = "";

    (catalog.promotions || []).forEach((p) => {
      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <div class="grid2">
          <div>
            <label class="field"><span>Title</span><input data-k="title" value="${escapeHtml(p.title || "")}"></label>
            <label class="field"><span>Body</span><textarea data-k="body" rows="3">${escapeHtml(p.body || "")}</textarea></label>
            <div class="grid2">
              <label class="field"><span>CTA text</span><input data-k="ctaText" value="${escapeHtml(p.ctaText || "")}"></label>
              <label class="field"><span>CTA link</span><input data-k="ctaLink" value="${escapeHtml(p.ctaLink || "")}"></label>
            </div>
          </div>
          <div>
            <label class="field"><span>Image path (optional)</span><input data-k="image" value="${escapeHtml(p.image || "")}" placeholder="assets/promos/promo-1.jpg"></label>
            <div class="pimg">${p.image ? `<img src="../${p.image}" alt="">` : `<span class="muted">No image</span>`}</div>
            <div class="row">
              <button class="btn btn-ghost" data-action="remove">Delete</button>
            </div>
          </div>
        </div>
      `;

      card.querySelector('[data-action="remove"]').addEventListener("click", () => {
        catalog.promotions = catalog.promotions.filter((x) => x.id !== p.id);
        renderPromotions();
        toast("Promotion deleted");
      });

      // bind inputs
      card.querySelectorAll("[data-k]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.k;
          p[key] = input.value;
        });
      });

      root.appendChild(card);
    });
  }

  function renderCategories() {
    const root = $("#catList");
    root.innerHTML = "";

    (catalog.categories || []).forEach((c) => {
      const card = document.createElement("div");
      card.className = "card";

      const subs = (c.subcategories || []).map((s) => s.name).join(", ");

      card.innerHTML = `
        <div class="grid2">
          <div>
            <label class="field"><span>Category name</span><input data-k="name" value="${escapeHtml(c.name || "")}"></label>
            <label class="field">
              <span>Subcategories (comma separated)</span>
              <input data-k="subs" value="${escapeHtml(subs)}" placeholder="Indica, Sativa, Hybrid">
            </label>
            <p class="muted">Tip: keep names short so the dropdown stays clean on mobile.</p>
          </div>
          <div>
            <label class="field"><span>Icon (emoji or short text)</span><input data-k="icon" value="${escapeHtml(c.icon || "")}" placeholder="🌿"></label>
            <div class="row">
              <button class="btn btn-ghost" data-action="delete">Delete category</button>
            </div>
          </div>
        </div>
      `;

      const nameInput = card.querySelector('[data-k="name"]');
      const iconInput = card.querySelector('[data-k="icon"]');
      const subsInput = card.querySelector('[data-k="subs"]');

      nameInput.addEventListener("input", () => {
        c.name = nameInput.value;
        if (!c.id) c.id = slugify(c.name) || uid("cat");
      });

      iconInput.addEventListener("input", () => (c.icon = iconInput.value));

      subsInput.addEventListener("input", () => {
        const parts = subsInput.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        c.subcategories = parts.map((name) => ({ id: slugify(name) || uid("sub"), name }));
      });

      card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        // remove products in this category? We'll keep them but unset categoryId (safer)
        catalog.products.forEach((p) => {
          if (p.categoryId === c.id) {
            p.categoryId = "";
            p.subcategoryId = "";
          }
        });
        catalog.categories = catalog.categories.filter((x) => x.id !== c.id);
        renderCategories();
        renderProducts();
        toast("Category deleted");
      });

      root.appendChild(card);
    });
  }

  function renderProducts() {
    const root = $("#productList");
    root.innerHTML = "";

    const q = ($("#productSearch").value || "").trim().toLowerCase();

    const list = (catalog.products || []).filter((p) => {
      if (!q) return true;
      return (
        (p.name || "").toLowerCase().includes(q) ||
        (p.categoryId || "").toLowerCase().includes(q) ||
        (p.subcategoryId || "").toLowerCase().includes(q)
      );
    });

    list.forEach((p) => {
      const cat = (catalog.categories || []).find((c) => c.id === p.categoryId);
      const sub = cat?.subcategories?.find((s) => s.id === p.subcategoryId);

      const card = document.createElement("div");
      card.className = "pcard";

      card.innerHTML = `
        <div class="pimg">${p.image ? `<img src="../${p.image}" alt="">` : `<span class="muted">No image</span>`}</div>
        <h3>${escapeHtml(p.name || "Untitled product")}</h3>
        <div class="pmeta">${escapeHtml(cat?.name || "No category")} • ${escapeHtml(sub?.name || "No subcategory")}</div>
        <div class="row">
          <button class="btn btn-ghost" data-action="edit">Edit</button>
          <button class="btn btn-ghost" data-action="dup">Duplicate</button>
          <button class="btn btn-danger" data-action="del">Delete</button>
        </div>
      `;

      card.querySelector('[data-action="edit"]').addEventListener("click", () => openProductEditor(p));
      card.querySelector('[data-action="dup"]').addEventListener("click", () => {
        const copy = structuredClone(p);
        copy.id = uid("p");
        copy.slug = slugify(copy.name) + "-" + Date.now().toString(16);
        catalog.products.unshift(copy);
        renderProducts();
        toast("Duplicated");
      });
      card.querySelector('[data-action="del"]').addEventListener("click", () => {
        if (!confirm("Delete this product?")) return;
        catalog.products = catalog.products.filter((x) => x.id !== p.id);
        renderProducts();
        toast("Deleted");
      });

      root.appendChild(card);
    });
  }

  function openProductEditor(p) {
    // Build modal-like editor using a card inserted at top
    const root = $("#productList");
    const editor = document.createElement("div");
    editor.className = "card";
    editor.style.marginBottom = "12px";

    const catOptions = (catalog.categories || [])
      .map((c) => `<option value="${escapeAttr(c.id)}"${c.id === p.categoryId ? " selected" : ""}>${escapeHtml(c.name)}</option>`)
      .join("");

    const selectedCat = (catalog.categories || []).find((c) => c.id === p.categoryId);
    const subOptions = (selectedCat?.subcategories || [])
      .map((s) => `<option value="${escapeAttr(s.id)}"${s.id === p.subcategoryId ? " selected" : ""}>${escapeHtml(s.name)}</option>`)
      .join("");

    const variants = (p.variants || []).map((v) => `
      <div class="grid2 variant-row">
        <label class="field"><span>Label</span><input data-vk="label" value="${escapeAttr(v.label || "")}" placeholder="3.5g"></label>
        <label class="field"><span>Price (CAD)</span><input data-vk="price" type="number" step="0.01" value="${escapeAttr(v.price ?? "")}" placeholder="29.99"></label>
      </div>
    `).join("");

    editor.innerHTML = `
      <div class="panel-head">
        <h3>Edit product</h3>
        <div class="panel-actions">
          <button class="btn btn-ghost" data-action="close">Close</button>
        </div>
      </div>

      <div class="grid2">
        <div>
          <label class="field"><span>Name</span><input id="pName" value="${escapeAttr(p.name || "")}"></label>

          <div class="grid2">
            <label class="field">
              <span>Category</span>
              <select id="pCat">
                <option value="">— Choose —</option>
                ${catOptions}
              </select>
            </label>

            <label class="field">
              <span>Subcategory</span>
              <select id="pSub">
                <option value="">— Choose —</option>
                ${subOptions}
              </select>
            </label>
          </div>

          <label class="field"><span>Short description</span><textarea id="pDesc" rows="3">${escapeHtml(p.description || "")}</textarea></label>

          <div class="grid2">
            <label class="field"><span>Rating (0-5)</span><input id="pRating" type="number" step="0.1" min="0" max="5" value="${escapeAttr(p.rating ?? 4.8)}"></label>
            <label class="field"><span>Review count</span><input id="pReviewCount" type="number" step="1" min="0" value="${escapeAttr(p.reviewCount ?? 12)}"></label>
          </div>
        </div>

        <div>
          <label class="field"><span>Image path</span><input id="pImage" value="${escapeAttr(p.image || "")}" placeholder="assets/products/flower/aurora-frost.jpg"></label>
          <div class="pimg">${p.image ? `<img src="../${p.image}" alt="">` : `<span class="muted">No image</span>`}</div>

          <div class="notice" style="margin-top:10px">
            <strong>Image workflow:</strong><br/>
            Demo mode can’t upload to GitHub Pages. Put images in your repo under <code>assets/</code>, then paste the path here.
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h3>Variants (quantity options)</h3>
        <div id="variantWrap">${variants || '<p class="muted">No variants yet.</p>'}</div>
        <button class="btn btn-primary" id="addVariant">+ Add variant</button>
      </div>

      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="applyProduct">Apply changes</button>
      </div>
    `;

    // insert editor at top
    root.prepend(editor);

    const pCat = editor.querySelector("#pCat");
    const pSub = editor.querySelector("#pSub");

    pCat.addEventListener("change", () => {
      const cat = catalog.categories.find((c) => c.id === pCat.value);
      pSub.innerHTML =
        `<option value="">— Choose —</option>` +
        (cat?.subcategories || []).map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join("");
    });

    editor.querySelector('[data-action="close"]').addEventListener("click", () => editor.remove());

    editor.querySelector("#addVariant").addEventListener("click", () => {
      if (!p.variants) p.variants = [];
      p.variants.push({ label: "3.5g", price: 29.99 });
      editor.remove();
      openProductEditor(p);
    });

    editor.querySelector("#applyProduct").addEventListener("click", () => {
      p.name = editor.querySelector("#pName").value.trim();
      p.slug = p.slug || slugify(p.name) || uid("p");
      p.categoryId = editor.querySelector("#pCat").value;
      p.subcategoryId = editor.querySelector("#pSub").value;
      p.description = editor.querySelector("#pDesc").value;
      p.image = editor.querySelector("#pImage").value.trim();
      p.rating = Number(editor.querySelector("#pRating").value || 0);
      p.reviewCount = Number(editor.querySelector("#pReviewCount").value || 0);

      // variants
      const rows = editor.querySelectorAll(".variant-row");
      const vars = [];
      rows.forEach((row) => {
        const inputs = row.querySelectorAll("input[data-vk]");
        const label = inputs[0].value.trim();
        const price = Number(inputs[1].value || 0);
        if (label) vars.push({ label, price });
      });
      p.variants = vars;

      editor.remove();
      renderProducts();
      toast("Product updated");
    });
  }

  function renderSettings() {
    const s = catalog.settings || DEFAULT_CATALOG.settings;
    catalog.settings = s;

    $("#setMinOrder").value = s.rules?.minOrder ?? 75;
    $("#setFreeShip").value = s.rules?.freeShipping ?? 250;

    $("#setStoreName").value = s.brand?.name || "Premium Supply";
    $("#setTagline").value = s.brand?.tagline || "Premium Quality";
    $("#setLogoPath").value = s.brand?.logoPath || "assets/brand/logo.png";

    $("#setEtransferEmail").value = s.payments?.etransfer?.email || "";
    $("#setEtransferName").value = s.payments?.etransfer?.recipient || "";
    $("#setDisclaimer").value = s.disclaimer || "";

    const qaLines = (s.payments?.etransfer?.qa || [])
      .map((x) => `${x.q} | ${x.a}`)
      .join("\n");
    $("#setEtransferQA").value = qaLines;

    $("#setBTC").value = s.payments?.crypto?.BTC || "";
    $("#setETH").value = s.payments?.crypto?.ETH || "";
    $("#setLTC").value = s.payments?.crypto?.LTC || "";
    $("#setUSDT").value = s.payments?.crypto?.USDT || "";
    $("#setDOGE").value = s.payments?.crypto?.DOGE || "";
  }

  function pullSettingsFromUI() {
    catalog.settings = catalog.settings || structuredClone(DEFAULT_CATALOG.settings);
    const s = catalog.settings;

    s.rules = s.rules || { currency: "CAD", minOrder: 75, freeShipping: 250 };
    s.rules.minOrder = Number($("#setMinOrder").value || 75);
    s.rules.freeShipping = Number($("#setFreeShip").value || 250);

    s.brand = s.brand || { name: "Premium Supply", tagline: "Premium Quality", logoPath: "assets/brand/logo.png" };
    s.brand.name = $("#setStoreName").value.trim() || "Premium Supply";
    s.brand.tagline = $("#setTagline").value.trim() || "Premium Quality";
    s.brand.logoPath = $("#setLogoPath").value.trim() || "assets/brand/logo.png";

    s.disclaimer = $("#setDisclaimer").value.trim();

    s.payments = s.payments || { etransfer: {}, crypto: {} };
    s.payments.etransfer = s.payments.etransfer || {};
    s.payments.etransfer.email = $("#setEtransferEmail").value.trim();
    s.payments.etransfer.recipient = $("#setEtransferName").value.trim();

    const qa = $("#setEtransferQA").value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [q, a] = l.split("|").map((x) => (x || "").trim());
        return { q, a };
      })
      .filter((x) => x.q && x.a);
    s.payments.etransfer.qa = qa;

    s.payments.crypto = s.payments.crypto || {};
    s.payments.crypto.BTC = $("#setBTC").value.trim();
    s.payments.crypto.ETH = $("#setETH").value.trim();
    s.payments.crypto.LTC = $("#setLTC").value.trim();
    s.payments.crypto.USDT = $("#setUSDT").value.trim();
    s.payments.crypto.DOGE = $("#setDOGE").value.trim();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replaceAll("\n", " ");
  }

  // Add buttons
  $("#promoAdd").addEventListener("click", () => {
    catalog.promotions.unshift({
      id: uid("promo"),
      title: "New Drop",
      body: "Fresh restocks with a premium edge.",
      ctaText: "Browse",
      ctaLink: "shop.html",
      image: ""
    });
    renderPromotions();
    renderStats();
    toast("Promotion added");
  });

  $("#catAdd").addEventListener("click", () => {
    catalog.categories.unshift({
      id: uid("cat"),
      name: "New Category",
      icon: "✨",
      subcategories: []
    });
    renderCategories();
    renderStats();
    toast("Category added");
  });

  $("#productAdd").addEventListener("click", () => {
    catalog.products.unshift({
      id: uid("p"),
      slug: "new-product-" + Date.now().toString(16),
      name: "New Product",
      categoryId: "",
      subcategoryId: "",
      image: "",
      description: "",
      rating: 4.9,
      reviewCount: 9,
      variants: [{ label: "3.5g", price: 29.99 }]
    });
    renderProducts();
    toast("Product added (edit it)");
  });

  $("#productSearch").addEventListener("input", renderProducts);

  function renderAll() {
    renderStats();
    renderPromotions();
    renderCategories();
    renderProducts();
    renderSettings();
  }

  // init
  (async () => {
    try {
      catalog = await loadCatalog();

      // Normalize missing keys
      catalog.settings = catalog.settings || structuredClone(DEFAULT_CATALOG.settings);
      catalog.promotions = Array.isArray(catalog.promotions) ? catalog.promotions : [];
      catalog.categories = Array.isArray(catalog.categories) ? catalog.categories : [];
      catalog.products = Array.isArray(catalog.products) ? catalog.products : [];
      catalog.home = catalog.home || { hotPicks: [] };

      renderAll();
      setTab("dashboard");
      toast("Admin ready");
    } catch (e) {
      alert("Admin failed to load catalog. Make sure catalog.json exists at repo root.");
      console.error(e);
    }
  })();
})();