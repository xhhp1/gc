import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";

sqlite3.verbose();

export function openDb() {
  return new sqlite3.Database("./data.sqlite");
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export async function initDb(db, adminUser, adminPass) {
  // Users table
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),
      created_at TEXT NOT NULL
    )`
  );

  // Personnel table (الموظفون)
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS personnel(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      subgroup TEXT NOT NULL,
      code TEXT NOT NULL,
      rank TEXT NOT NULL,
      name TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      notes TEXT DEFAULT '',
      reg_date TEXT DEFAULT '0000-00-00',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  // ✅ add columns safely if not exist (sqlite)
  await run(db, `ALTER TABLE personnel ADD COLUMN points INTEGER DEFAULT 0`).catch(()=>{});
  await run(db, `ALTER TABLE personnel ADD COLUMN hours  REAL    DEFAULT 0`).catch(()=>{});

  // Courses table (الدورات)
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS courses(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      instructor TEXT NOT NULL,
      date TEXT NOT NULL,
      duration TEXT DEFAULT '',
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  // Seed admin user if missing
  const existing = await get(db, "SELECT * FROM users WHERE username = ?", [
    adminUser,
  ]);

  if (!existing) {
    const hash = await bcrypt.hash(adminPass, 10);
    await run(
      db,
      "INSERT INTO users(username, pass_hash, role, created_at) VALUES(?,?,?,?)",
      [adminUser, hash, "admin", new Date().toISOString()]
    );
    console.log(`✅ Seeded admin user: ${adminUser} / ${adminPass}`);
  }
}

