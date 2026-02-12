// server/server.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();

const PORT = Number(process.env.PORT || 5050);
const ROOT = path.join(__dirname, ".."); // repo root (index.html lives here)
const DATA_DIR = path.join(__dirname, "data");
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");
const CATALOG_PATH = path.join(ROOT, "catalog.json");
const UPLOADS_BASE = path.join(ROOT, "assets", "uploads");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "";
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// ---- helpers
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
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

function safeFolderName(folder) {
  // allow only a-z 0-9 dash slash (subfolders)
  const cleaned = String(folder || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9/-]+/g, "")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
  // prevent traversal
  if (cleaned.includes("..")) return "";
  return cleaned;
}

function signToken(username) {
  return jwt.sign({ sub: username, role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

// ---- init dirs/files
ensureDir(DATA_DIR);
ensureDir(UPLOADS_BASE);

if (!fs.existsSync(ORDERS_PATH)) writeJson(ORDERS_PATH, []);
if (!fs.existsSync(CATALOG_PATH)) {
  // If you don't already have catalog.json at root, create a minimal one.
  writeJson(CATALOG_PATH, {
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
        crypto: { BTC: "", ETH: "", LTC: "", USDT: "", DOGE: "" }
      }
    },
    promotions: [],
    categories: [],
    products: [],
    home: { hotPicks: [] }
  });
}

// ---- middleware
app.use(
  helmet({
    // your storefront uses inline scripts sometimes; disabling CSP avoids local dev headaches
    contentSecurityPolicy: false
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Block access to server internals (important even in local)
app.use((req, res, next) => {
  const p = req.path || "";
  if (
    p === "/server" ||
    p.startsWith("/server/") ||
    p.startsWith("/.git") ||
    p === "/.env" ||
    p.startsWith("/server/.env") ||
    p.startsWith("/server/data") ||
    p.includes("..")
  ) {
    return res.status(404).send("Not found");
  }
  next();
});

// ---- API
app.get("/api/health", (req, res) => res.json({ ok: true, mode: "local", time: new Date().toISOString() }));

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing username/password" });
  if (username !== ADMIN_USER) return res.status(401).json({ error: "Invalid login" });

  const ok = ADMIN_PASS_HASH
    ? bcrypt.compareSync(String(password), String(ADMIN_PASS_HASH))
    : String(password) === String(ADMIN_PASS);

  if (!ok) return res.status(401).json({ error: "Invalid login" });

  return res.json({ token: signToken(username) });
});

app.get("/api/catalog", (req, res) => {
  const cat = readJson(CATALOG_PATH, null);
  if (!cat) return res.status(500).json({ error: "catalog.json missing/broken" });
  res.json(cat);
});

app.put("/api/catalog", requireAuth, (req, res) => {
  const body = req.body;

  // Light validation (keeps you safe from accidental breakage)
  if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON" });
  if (!Array.isArray(body.products)) return res.status(400).json({ error: "catalog.products must be an array" });
  if (!Array.isArray(body.categories)) return res.status(400).json({ error: "catalog.categories must be an array" });
  if (!Array.isArray(body.promotions)) return res.status(400).json({ error: "catalog.promotions must be an array" });

  writeJson(CATALOG_PATH, body);
  res.json({ ok: true });
});

// Upload endpoint (images)
// POST /api/upload?folder=products or ?folder=promos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = safeFolderName(req.query.folder || "");
    const dest = folder ? path.join(UPLOADS_BASE, folder) : UPLOADS_BASE;
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const base = slugify(path.basename(file.originalname || "image", ext)) || "image";
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const rel = path.relative(ROOT, req.file.path).replace(/\\/g, "/");
  res.json({ path: rel });
});

// Orders (optional now, useful soon)
function generateOrderNumber() {
  const a = Date.now().toString(36).toUpperCase();
  const b = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PS-${a}-${b}`;
}

function pickEtransferQA(settings, orderCount) {
  const qa = settings?.payments?.etransfer?.qa || [];
  if (!qa.length) return null;
  const idx = orderCount % qa.length;
  return qa[idx];
}

app.get("/api/orders", requireAuth, (req, res) => {
  const orders = readJson(ORDERS_PATH, []);
  res.json(orders);
});

app.post("/api/orders", (req, res) => {
  const catalog = readJson(CATALOG_PATH, null);
  if (!catalog) return res.status(500).json({ error: "Catalog unavailable" });

  const rules = catalog?.settings?.rules || { minOrder: 75, freeShipping: 250 };
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];

  if (!items.length) return res.status(400).json({ error: "Cart is empty" });

  // compute totals from catalog
  let subtotal = 0;
  const normalizedItems = [];

  for (const it of items) {
    const productId = String(it.productId || "");
    const variantLabel = String(it.variantLabel || "");
    const qty = Math.max(1, Number(it.qty || 1));

    const p = (catalog.products || []).find((x) => x.id === productId);
    if (!p) return res.status(400).json({ error: `Unknown product: ${productId}` });

    const v = (p.variants || []).find((x) => String(x.label) === variantLabel);
    if (!v) return res.status(400).json({ error: `Unknown variant: ${variantLabel} for ${p.name}` });

    const price = Number(v.price || 0);
    const line = price * qty;
    subtotal += line;

    normalizedItems.push({
      productId,
      name: p.name,
      image: p.image || "",
      variantLabel,
      unitPrice: price,
      qty,
      lineTotal: Number(line.toFixed(2))
    });
  }

  subtotal = Number(subtotal.toFixed(2));

  if (subtotal < Number(rules.minOrder || 75)) {
    return res.status(400).json({
      error: "MIN_ORDER",
      message: `Minimum order is $${Number(rules.minOrder || 75).toFixed(0)}.`,
      minOrder: Number(rules.minOrder || 75),
      subtotal
    });
  }

  const qualifiesFree = subtotal >= Number(rules.freeShipping || 250);
  const shipping = qualifiesFree ? 0 : null; // null = "—" / calculated later
  const total = Number((subtotal + (shipping || 0)).toFixed(2));

  const orders = readJson(ORDERS_PATH, []);
  const orderNumber = generateOrderNumber();

  const qa = pickEtransferQA(catalog.settings, orders.length);
  const etransfer = {
    email: catalog?.settings?.payments?.etransfer?.email || "",
    recipient: catalog?.settings?.payments?.etransfer?.recipient || "",
    question: qa?.q || "",
    answer: qa?.a || ""
  };

  const order = {
    orderNumber,
    createdAt: new Date().toISOString(),
    status: "PENDING_PAYMENT",
    customer: body.customer || {},
    shippingAddress: body.shippingAddress || {},
    paymentMethod: body.paymentMethod || "etransfer",
    cryptoCurrency: body.cryptoCurrency || "",
    items: normalizedItems,
    subtotal,
    shipping,
    total
  };

  orders.unshift(order);
  writeJson(ORDERS_PATH, orders);

  res.json({
    ok: true,
    orderNumber,
    totals: { subtotal, shipping, total, qualifiesFree },
    etransfer,
    crypto: catalog?.settings?.payments?.crypto || {},
    disclaimer: catalog?.settings?.disclaimer || ""
  });
});

// ---- static site
app.use(express.static(ROOT, { extensions: ["html"] }));

// nice defaults
app.get("/", (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/admin", (req, res) => res.redirect("/admin/login.html"));

app.listen(PORT, () => {
  console.log(`✅ Premium Supply local server running: http://localhost:${PORT}`);
  console.log(`🛠 Admin: http://localhost:${PORT}/admin/login.html`);
});