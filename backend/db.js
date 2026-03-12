import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

const DATA_DIR = path.resolve("data");
const DB_PATH = path.join(DATA_DIR, "medchain.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

sqlite3.verbose();
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      address TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      profile_hash TEXT DEFAULT '',
      public_profile TEXT DEFAULT '{}',
      encrypted_profile TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
});

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function safeJsonParse(value, fallback = {}) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
