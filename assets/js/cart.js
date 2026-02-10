(() => {
  const CANONICAL_KEY = "ps_cart_v2";

  // ✅ We read a bunch of possible keys so your cart still shows even if older pages used a different key
  const LEGACY_KEYS = [
    CANONICAL_KEY,
    "ps_cart_v1",
    "ps_cart",
    "premiumSupplyCart",
    "premium_supply_cart",
    "premium-supply-cart",
    "cart",
    "Cart",
    "SHOPPING_CART"
  ];

  const MIN_ORDER = 75;
  const FREE_SHIP = 250;

  const $ = (id) => document.getElementById(id);

  function safeParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function extractItems(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.cart)) return obj.cart;
    if (Array.isArray(obj.lines)) return obj.lines;
    if (Array.isArray(obj.products)) return obj.products;
    return [];
  }

  function normalizeItem(it) {
    const id = String(
      it.id ?? it.productId ?? it.sku ?? it.slug ?? it.handle ??
      it.product?.id ?? it.product?.slug ??
      it.name ?? it.title ?? "item"
    ).trim();

    const name = String(
      it.name ?? it.title ?? it.productName ?? it.product?.name ?? it.product?.title ?? "Item"
    ).trim();

    const category = String(
      it.category ?? it.cat ?? it.product?.category ?? it.product?.cat ?? "Premium"
    ).trim();

    const variant = String(
      it.variantLabel ?? it.variant ?? it.size ?? it.weight ?? it.option ?? it.qtyLabel ?? it.unit ?? "Default"
    ).trim();

    const unitPrice = Number(
      it.unitPrice ?? it.price ?? it.amount ?? it.cost ?? it.unit ?? it.variantPrice ?? it.money ?? 0
    ) || 0;

    const qtyRaw = Number(it.qty ?? it.quantity ?? it.count ?? it.units ?? 1);
    const qty = Math.max(1, Math.round(isFinite(qtyRaw) ? qtyRaw : 1));

    const image = String(
      it.image ?? it.img ?? it.imageUrl ?? it.photo ?? it.picture ?? it.product?.image ?? it.product?.img ?? ""
    ).trim();

    const productUrl = String(it.url ?? it.href ?? it.productUrl ?? "").trim();

    return { id, name, category, variant, unitPrice, qty, image, productUrl };
  }

  function mergeLines(items) {
    const map = new Map();
    for (const raw of items) {
      const it = normalizeItem(raw);
      const key = `${it.id}||${it.variant}||${it.unitPrice}`;
      if (map.has(key)) map.get(key).qty += it.qty;
      else map.set(key, { ...it, lineKey: key });
    }
    return Array.from(map.values());
  }

  function loadCart() {
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = safeParse(raw);
      const items = mergeLines(extractItems(parsed));

      if (items.length) {
        localStorage.setItem(CANONICAL_KEY, JSON.stringify({ items, updatedAt: Date.now() }));
        return items;
      }
    }
    return [];
  }

  function saveCart(items) {
    const merged = mergeLines(items);
    localStorage.setItem(CANONICAL_KEY, JSON.stringify({ items: merged, updatedAt: Date.now() }));
    return merged;
  }

  function readCanonical() {
    const raw = localStorage.getItem(CANONICAL_KEY);
    const parsed = safeParse(raw);
    return mergeLines(extractItems(parsed));
  }

  function money(n) {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
  }

  function subtotal(items) {
    return items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
  }

  function setBadge(items) {
    const count = items.reduce((sum, it) => sum + it.qty, 0);
    document.querySelectorAll(".js-cart-count").forEach(el => el.textContent = String(count));
  }

  function placeholderImage() {
    return "assets/images/products/placeholder.jpg";
  }

  function updateSummary(items) {
    const sub = subtotal(items);
    const total = sub; // shipping not priced; we only display qualification

    $("cartSubtotal").textContent = money(sub);
    $("cartTotal").textContent = money(total);

    // Shipping display
    $("cartShipping").textContent = sub >= FREE_SHIP ? "FREE" : "—";

    // Min order enforcement
    const meetsMin = sub >= MIN_ORDER && sub > 0;

    const minNote = $("minOrderNote");
    if (sub > 0 && sub < MIN_ORDER) {
      minNote.hidden = false;
      minNote.textContent = `Minimum order is $75 CAD. Add ${money(MIN_ORDER - sub)} more to checkout.`;
    } else {
      minNote.hidden = true;
      minNote.textContent = "";
    }

    // Free shipping note
    const freeNote = $("freeShipNote");
    if (sub > 0) {
      freeNote.hidden = false;
      freeNote.textContent =
        sub >= FREE_SHIP
          ? `You qualify for FREE shipping (250+).`
          : `Add ${money(FREE_SHIP - sub)} more to qualify for FREE shipping (250+).`;
    } else {
      freeNote.hidden = true;
      freeNote.textContent = "";
    }

    // Disable checkout if needed
    const checkoutBtn = $("checkoutBtn");
    const disabled = !meetsMin;

    checkoutBtn.style.pointerEvents = disabled ? "none" : "auto";
    checkoutBtn.style.opacity = disabled ? ".55" : "1";
    checkoutBtn.setAttribute("aria-disabled", String(disabled));
  }

  function updateQty(lineKey, qty) {
    let items = readCanonical();
    items = items.map(it => (it.lineKey === lineKey ? { ...it, qty } : it));
    items = saveCart(items);
    render(items);
  }

  function removeLine(lineKey) {
    let items = readCanonical();
    items = items.filter(it => it.lineKey !== lineKey);
    items = saveCart(items);
    render(items);
  }

  function render(items = loadCart()) {
    setBadge(items);

    const list = $("cartItems");
    const empty = $("cartEmpty");

    if (!items.length) {
      empty.hidden = false;
      list.innerHTML = "";
      updateSummary([]);
      return;
    }

    empty.hidden = true;
    list.innerHTML = "";

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "cart-row";
      row.dataset.lineKey = item.lineKey;

      const imgWrap = document.createElement("div");
      imgWrap.className = "cart-row__img";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = item.name;
      img.src = item.image || placeholderImage();
      img.onerror = () => { img.src = placeholderImage(); };
      imgWrap.appendChild(img);

      const info = document.createElement("div");
      info.className = "cart-row__info";

      const name = document.createElement("a");
      name.className = "cart-row__name";
      name.textContent = item.name;
      name.href = item.productUrl || (item.id ? `product.html?id=${encodeURIComponent(item.id)}` : "#");

      const meta1 = document.createElement("div");
      meta1.className = "cart-row__meta";
      meta1.textContent = `${item.category} • ${item.variant}`;

      const meta2 = document.createElement("div");
      meta2.className = "cart-row__meta";
      meta2.textContent = `${money(item.unitPrice)} each • Line: ${money(item.unitPrice * item.qty)}`;

      info.appendChild(name);
      info.appendChild(meta1);
      info.appendChild(meta2);

      const right = document.createElement("div");
      right.className = "cart-row__right";

      const stepper = document.createElement("div");
      stepper.className = "stepper";

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "btn";
      minus.textContent = "−";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.value = String(item.qty);

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "btn";
      plus.textContent = "+";

      stepper.appendChild(minus);
      stepper.appendChild(input);
      stepper.appendChild(plus);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn";
      remove.textContent = "Remove";

      minus.addEventListener("click", () => {
        const next = Math.max(1, Number(input.value || 1) - 1);
        input.value = String(next);
        updateQty(item.lineKey, next);
      });

      plus.addEventListener("click", () => {
        const next = Math.max(1, Number(input.value || 1) + 1);
        input.value = String(next);
        updateQty(item.lineKey, next);
      });

      input.addEventListener("change", () => {
        const next = Math.max(1, Math.round(Number(input.value || 1)));
        input.value = String(next);
        updateQty(item.lineKey, next);
      });

      remove.addEventListener("click", () => removeLine(item.lineKey));

      right.appendChild(stepper);
      right.appendChild(remove);

      row.appendChild(imgWrap);
      row.appendChild(info);
      row.appendChild(right);

      list.appendChild(row);
    }

    updateSummary(items);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const clearBtn = $("clearCartBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        // Clear canonical + legacy keys (prevents “ghost carts” from older tests)
        for (const k of LEGACY_KEYS) localStorage.removeItem(k);
        render([]);
      });
    }

    render();
  });
})();