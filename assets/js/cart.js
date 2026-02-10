(() => {
  const CANONICAL_KEY = "ps_cart_v2";

  // We scan a LOT of possible keys (old + common tutorial keys).
  const KEY_CANDIDATES = [
    CANONICAL_KEY,
    "ps_cart_v1",
    "ps_cart",
    "psCart",
    "premiumSupplyCart",
    "premium_supply_cart",
    "premium-supply-cart",
    "cartItems",
    "cart_items",
    "cart-items",
    "shoppingCart",
    "shopping_cart",
    "basket",
    "basketItems",
    "cartData",
    "cart_data",
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

  function toNumber(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^0-9.\-]/g, "");
      const n = parseFloat(cleaned);
      return isFinite(n) ? n : 0;
    }
    return 0;
  }

  function extractItems(obj) {
    if (!obj) return [];

    // If already an array → it's probably the cart
    if (Array.isArray(obj)) return obj;

    // Common shapes
    const candidates = [
      obj.items,
      obj.cart,
      obj.lines,
      obj.products,
      obj.cartItems,
      obj.cart_items,
      obj.cartitems,
      obj.cartItemsFromStorage,
      obj.cartItemsFromLocalStorage
    ];

    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }

    // Some people store as { id: itemObj, id2: itemObj }
    if (typeof obj === "object") {
      const vals = Object.values(obj);
      if (vals.length && vals.every(v => typeof v === "object")) {
        // Heuristic: looks like items if at least one has price/name/qty
        const looksLikeItems = vals.some(v =>
          v && (v.price != null || v.unitPrice != null || v.name || v.title || v.qty || v.quantity)
        );
        if (looksLikeItems) return vals;
      }
    }

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
      it.variantLabel ?? it.variant ?? it.size ?? it.weight ?? it.option ?? it.unit ?? "Default"
    ).trim();

    const unitPrice = toNumber(it.unitPrice ?? it.price ?? it.amount ?? it.cost ?? it.money ?? 0);

    const qtyRaw = toNumber(it.qty ?? it.quantity ?? it.count ?? it.units ?? 1);
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

  function readFromStorage(storage) {
    for (const key of KEY_CANDIDATES) {
      const raw = storage.getItem(key);
      if (!raw) continue;

      const parsed = safeParse(raw);

      // Some carts are saved as plain arrays or objects; parsed may be null if not JSON.
      if (!parsed) continue;

      const items = mergeLines(extractItems(parsed));
      if (items.length) return { keyFound: key, items };
    }
    return null;
  }

  function loadCart() {
    // 1) canonical localStorage first
    const canonRaw = localStorage.getItem(CANONICAL_KEY);
    if (canonRaw) {
      const parsed = safeParse(canonRaw);
      const items = mergeLines(extractItems(parsed));
      if (items.length) return items;
    }

    // 2) scan localStorage
    const ls = readFromStorage(localStorage);
    if (ls?.items?.length) {
      localStorage.setItem(CANONICAL_KEY, JSON.stringify({ items: ls.items, updatedAt: Date.now(), migratedFrom: `localStorage:${ls.keyFound}` }));
      return ls.items;
    }

    // 3) scan sessionStorage
    const ss = readFromStorage(sessionStorage);
    if (ss?.items?.length) {
      localStorage.setItem(CANONICAL_KEY, JSON.stringify({ items: ss.items, updatedAt: Date.now(), migratedFrom: `sessionStorage:${ss.keyFound}` }));
      return ss.items;
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
    return items.reduce((sum, it) => sum + (it.unitPrice * it.qty), 0);
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
    const total = sub;

    const elSub = $("cartSubtotal");
    const elTotal = $("cartTotal");
    const elShip = $("cartShipping");

    if (elSub) elSub.textContent = money(sub);
    if (elTotal) elTotal.textContent = money(total);
    if (elShip) elShip.textContent = sub >= FREE_SHIP ? "FREE" : "—";

    const minNote = $("minOrderNote");
    if (minNote) {
      if (sub > 0 && sub < MIN_ORDER) {
        minNote.hidden = false;
        minNote.textContent = `Minimum order is $75 CAD. Add ${money(MIN_ORDER - sub)} more to checkout.`;
      } else {
        minNote.hidden = true;
        minNote.textContent = "";
      }
    }

    const freeNote = $("freeShipNote");
    if (freeNote) {
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
    }

    const checkoutBtn = $("checkoutBtn");
    if (checkoutBtn) {
      const canCheckout = (sub >= MIN_ORDER && sub > 0);
      checkoutBtn.style.pointerEvents = canCheckout ? "auto" : "none";
      checkoutBtn.style.opacity = canCheckout ? "1" : ".55";
      checkoutBtn.setAttribute("aria-disabled", String(!canCheckout));
    }
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

  function clearAllKeys() {
    // Clear canonical + all legacy keys from BOTH storages
    for (const k of KEY_CANDIDATES) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  }

  function render(items = loadCart()) {
    setBadge(items);

    const list = $("cartItems");
    const empty = $("cartEmpty");

    if (!list || !empty) {
      // This script is loaded but page doesn't have cart DOM; no-op safely.
      return;
    }

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
        clearAllKeys();
        render([]);
      });
    }
    render();
  });
})();