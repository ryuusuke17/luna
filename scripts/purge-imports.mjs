import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { readdirSync, unlinkSync, existsSync } from 'node:fs';

const dbPath = resolve(process.env.LUNA_DB_PATH || './data/luna.sqlite');
console.log('Connecting to database:', dbPath);

if (!existsSync(dbPath)) {
  console.log('Database file not found at:', dbPath);
  process.exit(0);
}

const db = new Database(dbPath);
db.pragma('foreign_keys=OFF');

try {
  const transaction = db.transaction(() => {
    // 1. Purge statement decisions, allocations, entries, and statements
    const decisions = db.prepare('DELETE FROM statement_decisions').run();
    console.log(`Deleted ${decisions.changes} rows from statement_decisions`);

    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_payment_allocations'").get()) {
      const allocs = db.prepare('DELETE FROM statement_payment_allocations').run();
      console.log(`Deleted ${allocs.changes} rows from statement_payment_allocations`);
    }

    const entries = db.prepare('DELETE FROM statement_entries').run();
    console.log(`Deleted ${entries.changes} rows from statement_entries`);

    const stmts = db.prepare('DELETE FROM statements').run();
    console.log(`Deleted ${stmts.changes} rows from statements`);

    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_import_rows'").get()) {
      const sRows = db.prepare('DELETE FROM statement_import_rows').run();
      console.log(`Deleted ${sRows.changes} rows from statement_import_rows`);
    }

    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_imports'").get()) {
      const sImports = db.prepare('DELETE FROM statement_imports').run();
      console.log(`Deleted ${sImports.changes} rows from statement_imports`);
    }

    // 2. Clean up files in private statements folder if it exists
    const statementsDir = resolve(process.env.LUNA_STATEMENTS_PATH || './data/private-statements');
    if (existsSync(statementsDir)) {
      const files = readdirSync(statementsDir);
      let removedFiles = 0;
      for (const file of files) {
        if (/^[a-f0-9-]{36}\.csv$/.test(file)) {
          unlinkSync(resolve(statementsDir, file));
          removedFiles++;
        }
      }
      console.log(`Removed ${removedFiles} private statement CSV files from disk`);
    }
  });

  transaction();
  console.log('Imports purge completed successfully.');
} catch (err) {
  console.error('Purge error:', err);
  process.exit(1);
} finally {
  db.close();
}
