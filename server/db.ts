import Database from "better-sqlite3";
import path from "node:path";

const database = new Database(path.resolve(process.env.ARIPI_DATABASE_PATH || "aripi.db"));
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT '',
    weight_grams REAL NOT NULL,
    category TEXT NOT NULL,
    uas_class TEXT NOT NULL DEFAULT '',
    serial TEXT NOT NULL DEFAULT '',
    operator_id TEXT NOT NULL DEFAULT '',
    remote_id TEXT NOT NULL DEFAULT '',
    camera_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS academy_progress (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    passed_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flight_approval_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status = 'DEMO_APPROVED'),
    request_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS drones_user_id ON drones(user_id);
  CREATE INDEX IF NOT EXISTS flight_approval_requests_user_id ON flight_approval_requests(user_id, submitted_at DESC);
`);

export default database;
