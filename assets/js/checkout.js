(() => {
  // ------------------ CONFIG (EDIT THESE) ------------------
  const CONFIG = {
    interacEmail: "payments@premiumsupply.ca", // <-- CHANGE THIS
    interacQuestionTemplate: "Which Canadian city is assigned to this order?",
    supportEmailForOrders: "orders@premiumsupply.ca", // <-- CHANGE THIS (where order summary email goes)

    cryptoWallets: {
      BTC: "bc1qYOUR_BTC_ADDRESS_HERE",
      ETH: "0xYOUR_ETH_ADDRESS_HERE",
      LTC: "ltc1qYOUR_LTC_ADDRESS_HERE",
      USDT: "0xYOUR_USDT_ADDRESS_HERE (ERC20)",
      DOGE: "DYourDogeAddressHere"
    }
  };

  // Cart rules
  const CART_KEY = "ps_cart_v2";
  const MIN_ORDER = 75;
  const FREE_SHIP = 250;

  // Orders (client-side demo)
  const ORDER_COUNTER_KEY = "ps_order_counter";
  const LAST_ORDER_KEY = "ps_last_order";
  const ORDERS_KEY = "ps_orders";

  // Draft checkout data
  const DRAFT_KEY = "ps_checkout_draft";

  const $ = (id) => document.getElementById(id);

  function safeParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function getCartItems() {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = safeParse(raw);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return items.map(x => ({
      id: String(x.id || ""),
      name: String(x.name || "Item"),
      category: String(x.category || "Premium"),
      variant: String(x.variant || "Default"),
      unitPrice: Number(x.unitPrice || x.price || 0) || 0,
      qty: Math.max(1, Number(x.qty || x.quantity || 1) || 1),
      image: String(x.image || ""),
      productUrl: String(x.productUrl || x.url || "")
    }));
  }

  function money(n) {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
  }

  function subtotal(items) {
    return items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  }

  function updateCartBadge() {
    const items = getCartItems();
    const count = items.reduce((s, it) => s + it.qty, 0);
    document.querySelectorAll(".js-cart-count").forEach(el => el.textContent = String(count));
  }

  function showAlert(msg) {
    const el = $("checkoutAlert");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  function getDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    const d = safeParse(raw) || {};
    return {
      fullName: d.fullName || "",
      phone: d.phone || "",
      email: d.email || "",
      province: d.province || "",
      addr1: d.addr1 || "",
      addr2: d.addr2 || "",
      city: d.city || "",
      postal: d.postal || "",
      notes: d.notes || "",
      payMethod: d.payMethod || "interac",
      cryptoCurrency: d.cryptoCurrency || "BTC"
    };
  }

  function setDraft(patch) {
    const d = getDraft();
    const next = { ...d, ...patch };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    return next;
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  function isPhone(v) {
    const s = String(v || "").replace(/[^\d+]/g, "");
    return s.length >= 10;
  }

  function isPostal(v) {
    const s = String(v || "").trim().toUpperCase();
    // Canadian postal (loose): A1A 1A1
    return /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/.test(s);
  }

  function normalizePostal(v) {
    const s = String(v || "").trim().toUpperCase().replace(/\s+/g, "");
    if (s.length === 6) return `${s.slice(0,3)} ${s.slice(3)}`;
    return String(v || "").trim().toUpperCase();
  }

  function setStep(step) {
    const steps = document.querySelectorAll(".wizard-step");
    steps.forEach(sec => {
      const s = Number(sec.getAttribute("data-step"));
      sec.hidden = s !== step;
    });

    document.querySelectorAll(".step").forEach(btn => {
      const goto = Number(btn.getAttribute("data-goto"));
      btn.classList.toggle("is-active", goto === step);
    });

    showAlert("");
    localStorage.setItem("ps_checkout_step", String(step));
  }

  function getPayMethod() {
    const checked = document.querySelector('input[name="payMethod"]:checked');
    return checked ? checked.value : "interac";
  }

  function setPayMethod(method) {
    document.querySelectorAll('input[name="payMethod"]').forEach(r => {
      r.checked = (r.value === method);
    });
    $("cryptoPick").hidden = method !== "crypto";
    setDraft({ payMethod: method });
  }

  function computeShippingText(sub) {
    return sub >= FREE_SHIP ? "FREE" : "—";
  }

  function renderReview() {
    const d = getDraft();
    const items = getCartItems();
    const sub = subtotal(items);
    const ship = computeShippingText(sub);
    const total = sub;

    // Shipping summary
    $("shipSummary").innerHTML = `
      <div><strong>${escapeHtml(d.fullName || "—")}</strong></div>
      <div>${escapeHtml(d.addr1 || "—")}${d.addr2 ? `, ${escapeHtml(d.addr2)}` : ""}</div>
      <div>${escapeHtml(d.city || "—")}, ${escapeHtml(d.province || "—")} ${escapeHtml(normalizePostal(d.postal || "—"))}</div>
      <div>${escapeHtml(d.phone || "—")}</div>
      <div>${escapeHtml(d.email || "—")}</div>
      ${d.notes ? `<div style="margin-top:8px"><strong>Notes:</strong> ${escapeHtml(d.notes)}</div>` : ""}
      <div style="margin-top:10px" class="muted"><strong>Payment:</strong> ${escapeHtml(d.payMethod === "crypto" ? `Crypto (${d.cryptoCurrency})` : "Interac E‑Transfer")}</div>
    `;

    // Cart summary
    if (!items.length) {
      $("cartSummary").innerHTML = `<div class="muted">Your cart is empty. Go back to shop.</div>`;
    } else {
      $("cartSummary").innerHTML = items.map(it => `
        <div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08)">
          <div style="min-width:0">
            <div style="font-weight:1300; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(it.name)}</div>
            <div class="muted">${escapeHtml(it.category)} • ${escapeHtml(it.variant)} • x${it.qty}</div>
          </div>
          <div style="font-weight:1400">${money(it.unitPrice * it.qty)}</div>
        </div>
      `).join("");
    }

    $("sumSubtotal").textContent = money(sub);
    $("sumShipping").textContent = ship;
    $("sumTotal").textContent = money(total);
  }

  function generateOrderNumber() {
    let n = Number(localStorage.getItem(ORDER_COUNTER_KEY) || 10000);
    n += 1;
    localStorage.setItem(ORDER_COUNTER_KEY, String(n));

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    // Ascending counter + date → stable and easy to read
    return `PS-${y}${m}${day}-${n}`;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function generateInteracQA(orderNo) {
    const cities = [
      "Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton",
      "Ottawa", "Winnipeg", "Quebec City", "Hamilton", "Halifax",
      "Victoria", "Saskatoon", "Regina", "St. John’s", "Kelowna"
    ];

    const idx = hashStr(orderNo) % cities.length;
    const answer = cities[idx];

    return {
      question: CONFIG.interacQuestionTemplate,
      answer
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[m]));
  }

  function validateShipping() {
    const d = getDraft();
    const items = getCartItems();
    const sub = subtotal(items);

    if (!items.length) return "Your cart is empty. Add products first.";
    if (sub < MIN_ORDER) return `Minimum order is $75 CAD. Add ${money(MIN_ORDER - sub)} more.`;

    if (!d.fullName.trim()) return "Please enter your full name.";
    if (!isPhone(d.phone)) return "Please enter a valid phone number.";
    if (!isEmail(d.email)) return "Please enter a valid email address.";
    if (!d.province) return "Please select a province.";
    if (!d.addr1.trim()) return "Please enter your address.";
    if (!d.city.trim()) return "Please enter your city.";
    if (!isPostal(d.postal)) return "Please enter a valid Canadian postal code (A1A 1A1).";

    return "";
  }

  function buildOrderSummaryText(order) {
    const lines = [];
    lines.push(`Premium Supply Order`);
    lines.push(`Order #: ${order.orderNo}`);
    lines.push(`Created: ${new Date(order.createdAt).toLocaleString("en-CA")}`);
    lines.push(`Total: ${money(order.total)} CAD`);
    lines.push(`Payment: ${order.payMethod === "crypto" ? `Crypto (${order.cryptoCurrency})` : "Interac E-Transfer"}`);
    lines.push(``);

    lines.push(`Shipping`);
    lines.push(`${order.shipping.fullName}`);
    lines.push(`${order.shipping.addr1}${order.shipping.addr2 ? ", " + order.shipping.addr2 : ""}`);
    lines.push(`${order.shipping.city}, ${order.shipping.province} ${order.shipping.postal}`);
    lines.push(`${order.shipping.phone}`);
    lines.push(`${order.shipping.email}`);
    if (order.shipping.notes) lines.push(`Notes: ${order.shipping.notes}`);
    lines.push(``);

    lines.push(`Items`);
    order.items.forEach(it => {
      lines.push(`- ${it.name} (${it.category} • ${it.variant}) x${it.qty} = ${money(it.unitPrice * it.qty)}`);
    });
    lines.push(`Subtotal: ${money(order.subtotal)} CAD`);
    lines.push(`Shipping: ${order.shippingText}`);
    lines.push(`Total: ${money(order.total)} CAD`);
    lines.push(``);

    if (order.payMethod === "interac") {
      lines.push(`Interac`);
      lines.push(`Send to: ${CONFIG.interacEmail}`);
      lines.push(`Message: ${order.orderNo}`);
      lines.push(`Security Q: ${order.interacQA.question}`);
      lines.push(`Answer: ${order.interacQA.answer}`);
    } else {
      lines.push(`Crypto wallets`);
      Object.entries(CONFIG.cryptoWallets).forEach(([k, v]) => lines.push(`${k}: ${v}`));
    }

    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function renderPaymentInstructions(order) {
    $("orderNo").textContent = order.orderNo;
    $("orderAmount").textContent = money(order.total);

    const methodLine = order.payMethod === "crypto"
      ? `Payment method: Crypto (${order.cryptoCurrency})`
      : `Payment method: Interac E‑Transfer`;

    $("payMethodLine").textContent = methodLine;

    $("panelInterac").hidden = order.payMethod !== "interac";
    $("panelCrypto").hidden = order.payMethod !== "crypto";

    // Interac
    $("interacEmail").textContent = CONFIG.interacEmail;
    $("interacAmount").textContent = money(order.total);
    $("interacMessage").textContent = order.orderNo;
    $("interacQ").textContent = order.interacQA.question;
    $("interacA").textContent = order.interacQA.answer;

    // Crypto wallets
    if (order.payMethod === "crypto") {
      const wrap = $("wallets");
      wrap.innerHTML = "";

      Object.entries(CONFIG.cryptoWallets).forEach(([code, addr]) => {
        const row = document.createElement("div");
        row.className = "wallet";

        row.innerHTML = `
          <div class="wallet-top">
            <div>
              <div class="wallet-code">${code}</div>
              <div class="muted">${code === order.cryptoCurrency ? "Selected for this order" : "Available"}</div>
            </div>
            <button class="btn" type="button" data-copy="${escapeHtml(addr)}">Copy</button>
          </div>
          <div class="wallet-addr">${escapeHtml(addr)}</div>
        `;

        wrap.appendChild(row);
      });

      wrap.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-copy]");
        if (!btn) return;
        const text = btn.getAttribute("data-copy") || "";
        try {
          await copyText(text);
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        } catch {
          btn.textContent = "Copy failed";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        }
      }, { once: true });
    }

    // Copy + email buttons
    const summaryText = buildOrderSummaryText(order);

    $("copyOrderBtn").onclick = async () => {
      try {
        await copyText(summaryText);
        $("copyOrderBtn").textContent = "Copied ✅";
        setTimeout(() => ($("copyOrderBtn").textContent = "Copy order summary"), 1400);
      } catch {
        $("copyOrderBtn").textContent = "Copy failed";
        setTimeout(() => ($("copyOrderBtn").textContent = "Copy order summary"), 1400);
      }
    };

    // Mailto (not a payment processor; just sends details to you)
    const subject = encodeURIComponent(`Premium Supply Order ${order.orderNo}`);
    const body = encodeURIComponent(summaryText);
    $("emailOrderBtn").href = `mailto:${CONFIG.supportEmailForOrders}?subject=${subject}&body=${body}`;
  }

  function placeOrder() {
    const err = validateShipping();
    if (err) {
      showAlert(err);
      setStep(1);
      return;
    }

    const d = getDraft();
    const items = getCartItems();
    const sub = subtotal(items);

    const orderNo = generateOrderNumber();
    const interacQA = generateInteracQA(orderNo);

    const createdAt = Date.now();
    const dueAt = createdAt + 24 * 60 * 60 * 1000;
    const lockAt = createdAt + 48 * 60 * 60 * 1000;

    const order = {
      orderNo,
      createdAt,
      dueAt,
      lockAt,
      payMethod: d.payMethod,
      cryptoCurrency: d.cryptoCurrency,

      items,
      subtotal: sub,
      shippingText: sub >= FREE_SHIP ? "FREE" : "—",
      total: sub,

      shipping: {
        fullName: d.fullName.trim(),
        phone: d.phone.trim(),
        email: d.email.trim(),
        province: d.province,
        addr1: d.addr1.trim(),
        addr2: d.addr2.trim(),
        city: d.city.trim(),
        postal: normalizePostal(d.postal),
        notes: d.notes.trim()
      },

      interacQA
    };

    // Save orders (client-side demo storage)
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
    const prev = safeParse(localStorage.getItem(ORDERS_KEY)) || [];
    prev.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(prev));

    // Optional: clear cart after placing order (prevents accidental duplicates)
    localStorage.removeItem(CART_KEY);

    updateCartBadge();
    renderPaymentInstructions(order);
    setStep(4);
  }

  function wireStepButtons() {
    // Stepper click (only allow going backward unless order is placed)
    document.querySelectorAll(".step").forEach(btn => {
      btn.addEventListener("click", () => {
        const go = Number(btn.getAttribute("data-goto"));
        const current = Number(localStorage.getItem("ps_checkout_step") || 1);

        // allow backward navigation; forward requires validations
        if (go <= current) setStep(go);
      });
    });

    $("toStep2").addEventListener("click", () => {
      const err = validateShipping();
      if (err) return showAlert(err);
      setStep(2);
    });

    $("backTo1").addEventListener("click", () => setStep(1));

    $("toStep3").addEventListener("click", () => {
      const err = validateShipping();
      if (err) return showAlert(err);
      renderReview();
      setStep(3);
    });

    $("backTo2").addEventListener("click", () => setStep(2));

    $("editShippingBtn").addEventListener("click", () => setStep(1));

    $("placeOrderBtn").addEventListener("click", () => {
      const agree = $("agreePolicy").checked;
      if (!agree) {
        showAlert("Please confirm by checking “I agree” before placing the order.");
        return;
      }
      placeOrder();
    });
  }

  function wireFormAutosave() {
    const map = [
      ["fullName", "fullName"],
      ["phone", "phone"],
      ["email", "email"],
      ["province", "province"],
      ["addr1", "addr1"],
      ["addr2", "addr2"],
      ["city", "city"],
      ["postal", "postal"],
      ["notes", "notes"]
    ];

    map.forEach(([id, key]) => {
      const el = $(id);
      el.addEventListener("input", () => setDraft({ [key]: el.value }));
      el.addEventListener("change", () => setDraft({ [key]: el.value }));
    });
  }

  function applyDraftToForm() {
    const d = getDraft();
    $("fullName").value = d.fullName;
    $("phone").value = d.phone;
    $("email").value = d.email;
    $("province").value = d.province;
    $("addr1").value = d.addr1;
    $("addr2").value = d.addr2;
    $("city").value = d.city;
    $("postal").value = d.postal;
    $("notes").value = d.notes;

    setPayMethod(d.payMethod);
    $("cryptoCurrency").value = d.cryptoCurrency;
    $("cryptoPick").hidden = d.payMethod !== "crypto";
  }

  function wirePaymentControls() {
    document.querySelectorAll('input[name="payMethod"]').forEach(r => {
      r.addEventListener("change", () => {
        const m = getPayMethod();
        setPayMethod(m);
      });
    });

    $("cryptoCurrency").addEventListener("change", () => {
      setDraft({ cryptoCurrency: $("cryptoCurrency").value });
    });
  }

  function init() {
    updateCartBadge();

    // if cart empty, warn (still allow view)
    const items = getCartItems();
    if (!items.length) {
      showAlert("Your cart is empty. Go back to shop and add items.");
    } else {
      const sub = subtotal(items);
      if (sub < MIN_ORDER) {
        showAlert(`Minimum order is $75 CAD. Add ${money(MIN_ORDER - sub)} more.`);
      }
    }

    applyDraftToForm();
    wireFormAutosave();
    wirePaymentControls();
    wireStepButtons();

    // Restore last step (safe)
    const lastStep = Number(localStorage.getItem("ps_checkout_step") || 1);
    setStep([1,2,3,4].includes(lastStep) ? lastStep : 1);

    // If an order already exists, allow the user to view instructions again
    const lastOrder = safeParse(localStorage.getItem(LAST_ORDER_KEY));
    if (lastOrder && lastStep === 4) {
      renderPaymentInstructions(lastOrder);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();