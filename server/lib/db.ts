import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const location = resolve(process.env.LUNA_DB_PATH || "./data/luna.sqlite");
mkdirSync(dirname(location), { recursive: true });
export const db = new Database(location);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('cash','bank','wallet','credit_card','loan','asset','liability')), liquid INTEGER NOT NULL DEFAULT 0, opening_date TEXT NOT NULL, archived_at TEXT, last4 TEXT, credit_limit INTEGER, reconciled_through TEXT);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('income','expense')), archived_at TEXT);
CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('opening','adjustment','income','expense','refund','transfer')), posted_date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), account_id INTEGER REFERENCES accounts(id), counter_account_id INTEGER REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), description TEXT NOT NULL DEFAULT '', link_group TEXT, idempotency_key TEXT UNIQUE, replaces_id INTEGER REFERENCES transactions(id), voided_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS account_entries(id INTEGER PRIMARY KEY, transaction_id INTEGER NOT NULL REFERENCES transactions(id), account_id INTEGER NOT NULL REFERENCES accounts(id), delta INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS budgets(id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id), month TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), UNIQUE(category_id, month));
CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY, action TEXT NOT NULL, entity_id INTEGER, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS entry_account_idx ON account_entries(account_id);
CREATE INDEX IF NOT EXISTS transaction_date_idx ON transactions(posted_date);
`);
export function atomic<T>(fn: () => T): T { return db.transaction(fn)(); }
