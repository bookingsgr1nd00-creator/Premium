import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { fileURLToPath } from "url";

const app = express();

const PORT = Number(process.env.PORT || 8787);
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").trim();

// Repo root (…/Premium)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "catalog.json");

// --- security
app.use(
  helmet({
    contentSecurityPolicy: false // keep simple; your site already has inline scripts in places
  })
);
app.use(express.json({ limit: "2mb" }));

// CORS only needed if admin is on a different domain than the API
if (CORS_ORIGIN) {
  app.use(cors({ origin: CORS_ORIGIN }));
}

// --- do NOT serve dotfiles, and do not expose /server folder
app.use("/server", (req, res) => res.status(404).end());

// Serve storefront + admin from repo root
app.use(
  "/",
  express.static(ROOT, {
    extensions: ["html"],
    dotfiles: "deny"
  })
);

function signToken() {
  return jwt.sign({ sub: ADMIN_USER }, JWT_SECRET, { expiresIn: "12h" });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).send("Missing token");

  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    if (payload.sub !== ADMIN_USER) return res.status(403).send("Forbidden");
    next();
  } catch {
    return res.status(401).send("Invalid token");
  }
}

function safeReadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return {
      rules: { currency: "CAD", minOrder: 75, freeShipping: 250 },
      categories: [],
      products: [],
      promotions: [],
      home: { hotPicks: [] }
    };
  }
  const raw = fs.readFileSync(CATALOG_PATH, "utf8");
  return JSON.parse(raw);
}

function safeWriteCatalog(obj) {
  const tmp = CATALOG_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, CATALOG_PATH);
}

function ensureUnderAssets(folder) {
  const clean = String(folder || "assets/uploads").replaceAll("\\", "/");
  if (!clean.startsWith("assets/")) throw new Error("Folder must start with assets/");
  if (clean.includes("..")) throw new Error("Invalid folder");
  return clean.replace(/\/+$/, "");
}

// --- API
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER) return res.status(401).send("Invalid credentials");
  if (!ADMIN_PASS_HASH) return res.status(500).send("Server not configured (ADMIN_PASS_HASH missing)");

  const ok = bcrypt.compareSync(String(password || ""), ADMIN_PASS_HASH);
  if (!ok) return res.status(401).send("Invalid credentials");

  res.json({ token: signToken() });
});

app.get("/api/catalog", requireAuth, (req, res) => {
  try {
    res.json(safeReadCatalog());
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
});

app.put("/api/catalog", requireAuth, (req, res) => {
  try {
    const c = req.body;
    if (!c || typeof c !== "object") return res.status(400).send("Invalid JSON");
    if (!Array.isArray(c.products) || !Array.isArray(c.categories) || !Array.isArray(c.promotions)) {
      return res.status(400).send("catalog must include products[], categories[], promotions[]");
    }
    safeWriteCatalog(c);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
});

// --- uploads (images only)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const folder = ensureUnderAssets(req.body.folder || "assets/uploads");
      const abs = path.join(ROOT, folder);
      fs.mkdirSync(abs, { recursive: true });
      cb(null, abs);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".png").toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});

const allowedMimes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml"
]);

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) {
      return cb(new Error("Only image uploads are allowed (png/jpg/webp/gif/svg)."));
    }
    cb(null, true);
  }
});

app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
  try {
    const folder = ensureUnderAssets(req.body.folder || "assets/uploads");
    const rel = `${folder}/${req.file.filename}`.replaceAll("\\", "/");
    res.json({ path: rel });
  } catch (e) {
    res.status(400).send(String(e?.message || e));
  }
});

app.listen(PORT, () => {
  console.log(`Admin server running on http://localhost:${PORT}`);
  console.log(`Serving storefront from: ${ROOT}`);
});