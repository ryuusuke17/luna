import {defineHandler} from "nitro";
import {createError, readBody} from "nitro/h3";
import {db} from "../../lib/db";
import {requireUser} from "../../lib/request";
import {readdirSync, unlinkSync, existsSync} from "node:fs";
import {resolve} from "node:path";

export default defineHandler(async event => {
  const user = requireUser(event);
  if (event.req.method !== "POST") throw createError({statusCode: 405, statusMessage: "Method not allowed"});
  
  const body = await readBody<any>(event).catch(() => ({}));
  if (body?.confirm !== "PURGE_ALL_IMPORTS") {
    throw createError({statusCode: 400, statusMessage: 'Requires confirmation: { "confirm": "PURGE_ALL_IMPORTS" }'});
  }

  return db.transaction(() => {
    // Purge user's or all statement imports
    const decisions = db.prepare("DELETE FROM statement_decisions WHERE statement_id IN (SELECT id FROM statements WHERE owner_id=?)").run(user.id);
    
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_payment_allocations'").get()) {
      db.prepare("DELETE FROM statement_payment_allocations WHERE statement_id IN (SELECT id FROM statements WHERE owner_id=?)").run(user.id);
    }
    
    const entries = db.prepare("DELETE FROM statement_entries WHERE statement_id IN (SELECT id FROM statements WHERE owner_id=?)").run(user.id);
    
    const statements = db.prepare("SELECT file_key FROM statements WHERE owner_id=?").all(user.id) as {file_key: string}[];
    const stmts = db.prepare("DELETE FROM statements WHERE owner_id=?").run(user.id);

    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_import_rows'").get()) {
      db.prepare("DELETE FROM statement_import_rows WHERE owner_id=?").run(user.id);
    }
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_imports'").get()) {
      db.prepare("DELETE FROM statement_imports WHERE owner_id=?").run(user.id);
    }

    // Clean private statement files
    const dir = resolve(process.env.LUNA_STATEMENTS_PATH || "./data/private-statements");
    let unlinked = 0;
    if (existsSync(dir)) {
      for (const s of statements) {
        if (s.file_key && /^[a-f0-9-]{36}\.csv$/.test(s.file_key)) {
          const p = resolve(dir, s.file_key);
          if (existsSync(p)) {
            unlinkSync(p);
            unlinked++;
          }
        }
      }
    }

    return {
      ok: true,
      deletedStatements: stmts.changes,
      deletedEntries: entries.changes,
      deletedDecisions: decisions.changes,
      unlinkedFiles: unlinked
    };
  }).immediate();
});
