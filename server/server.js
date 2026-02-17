import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { openDb, initDb, get, all, run } from "./db.js";

dotenv.config();

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

const app = express();
app.use(cors());
app.use(express.json());

const db = openDb();
await initDb(db, ADMIN_USER, ADMIN_PASS);

function signToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/* ---------- AUTH ---------- */
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });

  const user = await get(db, "SELECT * FROM users WHERE username = ?", [username]);
  if (!user) return res.status(401).json({ error: "Bad credentials" });

  const ok = await bcrypt.compare(password, user.pass_hash);
  if (!ok) return res.status(401).json({ error: "Bad credentials" });

  return res.json({
    token: signToken(user),
    user: { id: user.id, username: user.username, role: user.role }
  });
});

/* ---------- USERS (admin only) ---------- */
app.get("/api/users", auth, requireRole("admin"), async (req, res) => {
  const users = await all(db, "SELECT id, username, role, created_at FROM users ORDER BY id DESC");
  res.json({ users });
});

app.post("/api/users", auth, requireRole("admin"), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  if (!["admin", "editor", "viewer"].includes(role)) return res.status(400).json({ error: "Bad role" });

  const hash = await bcrypt.hash(password, 10);

  try {
    const r = await run(
      db,
      "INSERT INTO users(username, pass_hash, role, created_at) VALUES(?,?,?,?)",
      [username, hash, role, new Date().toISOString()]
    );
    res.json({ id: r.id });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.put("/api/users/:id/role", auth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (!["admin", "editor", "viewer"].includes(role)) return res.status(400).json({ error: "Bad role" });

  await run(db, "UPDATE users SET role = ? WHERE id = ?", [role, id]);
  res.json({ ok: true });
});

/* ---------- PERSONNEL (الموظفون) ---------- */
app.get("/api/personnel", auth, async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const section = (req.query.section || "").toString().trim();

  let sql = "SELECT * FROM personnel WHERE 1=1";
  const params = [];

  if (section) {
    sql += " AND section = ?";
    params.push(section);
  }

  if (q) {
    sql += " AND (name LIKE ? OR code LIKE ? OR discord_id LIKE ? OR subgroup LIKE ? OR rank LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY section ASC, subgroup ASC, id ASC";

  const rows = await all(db, sql, params);
  res.json({ rows });
});

app.post("/api/personnel", auth, requireRole("admin", "editor"), async (req, res) => {
  const { section, subgroup, code, rank, name, discord_id, notes, reg_date } = req.body || {};
  if (!section || !subgroup || !code || !rank || !name || !discord_id) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const now = new Date().toISOString();
  const r = await run(
    db,
    `INSERT INTO personnel(section, subgroup, code, rank, name, discord_id, notes, reg_date, created_by, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      section,
      subgroup,
      code,
      rank,
      name,
      discord_id,
      notes || "",
      reg_date || "0000-00-00",
      req.user.uid,
      now,
      now
    ]
  );

  res.json({ id: r.id });
});

app.put("/api/personnel/:id", auth, requireRole("admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  const { section, subgroup, code, rank, name, discord_id, notes, reg_date } = req.body || {};

  if (!section || !subgroup || !code || !rank || !name || !discord_id) {
    return res.status(400).json({ error: "Missing fields" });
  }

  await run(
    db,
    `UPDATE personnel
     SET section=?, subgroup=?, code=?, rank=?, name=?, discord_id=?, notes=?, reg_date=?, updated_at=?
     WHERE id=?`,
    [
      section,
      subgroup,
      code,
      rank,
      name,
      discord_id,
      notes || "",
      reg_date || "0000-00-00",
      new Date().toISOString(),
      id
    ]
  );

  res.json({ ok: true });
});

app.delete("/api/personnel/:id", auth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await run(db, "DELETE FROM personnel WHERE id = ?", [id]);
  res.json({ ok: true });
});

/* ---------- COURSES (الدورات) ---------- */
app.get("/api/courses", auth, async (req, res) => {
  const q = (req.query.q || "").toString().trim();

  let sql = "SELECT * FROM courses WHERE 1=1";
  const params = [];

  if (q) {
    sql += " AND (title LIKE ? OR instructor LIKE ? OR date LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY date DESC, id DESC";

  const rows = await all(db, sql, params);
  res.json({ rows });
});

app.post("/api/courses", auth, requireRole("admin", "editor"), async (req, res) => {
  const { title, instructor, date, duration, location, notes } = req.body || {};
  if (!title || !instructor || !date) return res.status(400).json({ error: "Missing fields" });

  const now = new Date().toISOString();
  const r = await run(
    db,
    `INSERT INTO courses(title, instructor, date, duration, location, notes, created_by, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      title,
      instructor,
      date,
      duration || "",
      location || "",
      notes || "",
      req.user.uid,
      now,
      now
    ]
  );

  res.json({ id: r.id });
});

app.put("/api/courses/:id", auth, requireRole("admin", "editor"), async (req, res) => {
  const id = Number(req.params.id);
  const { title, instructor, date, duration, location, notes } = req.body || {};
  if (!title || !instructor || !date) return res.status(400).json({ error: "Missing fields" });

  await run(
    db,
    `UPDATE courses
     SET title=?, instructor=?, date=?, duration=?, location=?, notes=?, updated_at=?
     WHERE id=?`,
    [
      title,
      instructor,
      date,
      duration || "",
      location || "",
      notes || "",
      new Date().toISOString(),
      id
    ]
  );

  res.json({ ok: true });
});

app.delete("/api/courses/:id", auth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await run(db, "DELETE FROM courses WHERE id = ?", [id]);
  res.json({ ok: true });
});
app.post("/api/personnel/adjust", auth, requireRole("admin","editor"), async (req, res) => {
  const { discord_id, addPoints, addHours } = req.body || {};
  if (!discord_id) return res.status(400).json({ error: "Missing discord_id" });

  const p = Number(addPoints || 0);
  const h = Number(addHours  || 0);

  const row = await get(db, "SELECT * FROM personnel WHERE discord_id = ?", [discord_id]);
  if (!row) return res.status(404).json({ error: "User not found" });

  const newPoints = Math.max(0, Number(row.points || 0) + p);
  const newHours  = Math.max(0, Number(row.hours  || 0) + h);

  await run(db, "UPDATE personnel SET points=?, hours=?, updated_at=? WHERE id=?",
    [newPoints, newHours, new Date().toISOString(), row.id]
  );

  res.json({ ok: true, id: row.id, points: newPoints, hours: newHours });
});

app.listen(PORT, () => console.log(`✅ API running on http://localhost:${PORT}`));
