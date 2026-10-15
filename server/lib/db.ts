import Database from "better-sqlite3";
import {transactionType} from "../../src/lib/transactions.ts";
import {retireVerification} from "./transaction-first-migration.ts";
import { mkdirSync } from "node:fs";
import { dirname,resolve } from "node:path";
const location=process.env.LUNA_DB_PATH===":memory:"?":memory:":resolve(process.env.LUNA_DB_PATH||"./data/luna.sqlite");if(location!==":memory:")mkdirSync(dirname(location),{recursive:true});
export const db=new Database(location);db.pragma("foreign_keys=ON");db.pragma("journal_mode=WAL");db.pragma("busy_timeout=5000");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf_hash TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('cash','bank','wallet','credit_card','loan','asset','liability')),liquid INTEGER NOT NULL DEFAULT 0,opening_date TEXT NOT NULL,archived_at TEXT,last4 TEXT,credit_limit INTEGER,reconciled_through TEXT,issuer TEXT,product TEXT,network TEXT);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('income','expense')),archived_at TEXT);
CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN('opening','adjustment','income','expense','refund','transfer')),posted_date TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),account_id INTEGER REFERENCES accounts(id),counter_account_id INTEGER REFERENCES accounts(id),category_id INTEGER REFERENCES categories(id),description TEXT NOT NULL DEFAULT '',link_group TEXT,idempotency_key TEXT,replaces_id INTEGER REFERENCES transactions(id),voided_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS account_entries(id INTEGER PRIMARY KEY,transaction_id INTEGER NOT NULL REFERENCES transactions(id),account_id INTEGER NOT NULL REFERENCES accounts(id),delta INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS budgets(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),category_id INTEGER NOT NULL REFERENCES categories(id),month TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0));
CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),action TEXT NOT NULL,entity_id INTEGER,details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS statement_imports(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL REFERENCES accounts(id),statement_id TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,closing_balance INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(owner_id,account_id,statement_id));
CREATE TABLE IF NOT EXISTS statement_import_rows(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL REFERENCES accounts(id),source_id TEXT NOT NULL,transaction_id INTEGER NOT NULL REFERENCES transactions(id),UNIQUE(owner_id,account_id,source_id));
`);
function addColumn(table:string,column:string,definition:string){const cols=db.pragma(`table_info(${table})`) as {name:string}[];if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
addColumn("sessions","csrf_hash","TEXT");addColumn("sessions","last_seen","TEXT NOT NULL DEFAULT ''");for(const table of ["accounts","categories","transactions","budgets","audit_events"])addColumn(table,"owner_id","INTEGER REFERENCES users(id)");for(const column of ["issuer","product","network"])addColumn("accounts",column,"TEXT");addColumn("transactions","idempotency_key","TEXT");
const owner=(db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get() as {id:number}|undefined)?.id;if(owner)for(const table of ["accounts","categories","transactions","budgets","audit_events"])db.prepare(`UPDATE ${table} SET owner_id=? WHERE owner_id IS NULL`).run(owner);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS categories_owner_name_idx ON categories(owner_id,name); CREATE UNIQUE INDEX IF NOT EXISTS transactions_owner_idem_idx ON transactions(owner_id,idempotency_key); DROP INDEX IF EXISTS budgets_owner_month_idx; CREATE UNIQUE INDEX budgets_owner_month_idx ON budgets(owner_id,category_id,month); CREATE INDEX IF NOT EXISTS entry_account_idx ON account_entries(account_id); CREATE INDEX IF NOT EXISTS transaction_owner_date_idx ON transactions(owner_id,posted_date);");
export function atomic<T>(fn:()=>T):T{return db.transaction(fn)()}
db.exec(`
CREATE TABLE IF NOT EXISTS statement_archives(
 id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),
 account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,account_name_snapshot TEXT,
 filename TEXT NOT NULL,file_key TEXT NOT NULL UNIQUE,file_hash TEXT NOT NULL,size INTEGER NOT NULL,
 parser_version TEXT NOT NULL,summary_json TEXT NOT NULL,raw_summary_json TEXT NOT NULL,
 rows_json TEXT NOT NULL,warnings_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(owner_id,file_hash)
);
CREATE INDEX IF NOT EXISTS statement_archives_owner_idx ON statement_archives(owner_id,id);
`);

addColumn("transactions","merchant","TEXT NOT NULL DEFAULT ''");addColumn("transactions","notes","TEXT NOT NULL DEFAULT ''");addColumn("transactions","is_installment","INTEGER CHECK(is_installment IN (0,1))");addColumn("budgets","name","TEXT NOT NULL DEFAULT ''");
db.function("transaction_type",{deterministic:true},(kind,isInstallment,description,merchant,notes)=>transactionType({kind:String(kind),is_installment:isInstallment===null?null:Number(isInstallment),description:String(description),merchant:String(merchant),notes:String(notes)}));
db.exec(`
CREATE TABLE IF NOT EXISTS bills(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),due_date TEXT NOT NULL,account_id INTEGER NOT NULL REFERENCES accounts(id),category_id INTEGER REFERENCES categories(id),cadence TEXT NOT NULL DEFAULT 'once',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bill_payments(bill_id INTEGER PRIMARY KEY REFERENCES bills(id),owner_id INTEGER NOT NULL REFERENCES users(id),transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,target INTEGER NOT NULL CHECK(target>0),due_date TEXT,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS goal_contributions(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),goal_id INTEGER NOT NULL REFERENCES goals(id),amount INTEGER NOT NULL CHECK(amount>0),posted_date TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',request_key TEXT NOT NULL,UNIQUE(owner_id,request_key));
CREATE TABLE IF NOT EXISTS merchant_rules(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),phrase TEXT NOT NULL,category_id INTEGER NOT NULL REFERENCES categories(id),kind TEXT NOT NULL CHECK(kind IN('income','expense')),priority INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS service_providers(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,category_id INTEGER REFERENCES categories(id));
CREATE TABLE IF NOT EXISTS workspace_preferences(owner_id INTEGER PRIMARY KEY REFERENCES users(id),shortcuts INTEGER NOT NULL DEFAULT 1,bill_alerts INTEGER NOT NULL DEFAULT 1,budget_alerts INTEGER NOT NULL DEFAULT 1,goal_alerts INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS csv_import_batches(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL REFERENCES accounts(id),file_hash TEXT NOT NULL,row_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS csv_import_rows(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL REFERENCES accounts(id),batch_id INTEGER NOT NULL REFERENCES csv_import_batches(id),row_key TEXT NOT NULL,source_id TEXT,transaction_id INTEGER NOT NULL REFERENCES transactions(id),UNIQUE(owner_id,account_id,row_key));
CREATE UNIQUE INDEX IF NOT EXISTS csv_source_idx ON csv_import_rows(owner_id,account_id,source_id) WHERE source_id IS NOT NULL;
`);

addColumn("statement_import_rows","import_id","INTEGER REFERENCES statement_imports(id)");

addColumn("bills","payment_kind","TEXT NOT NULL DEFAULT 'expense'");

addColumn("transactions","original_currency","TEXT NOT NULL DEFAULT 'PHP'");
addColumn("transactions","original_amount","INTEGER");
addColumn("transactions","exchange_rate","TEXT NOT NULL DEFAULT '1'");
addColumn("transactions","included_fee","INTEGER NOT NULL DEFAULT 0");
db.exec("UPDATE transactions SET original_amount=amount WHERE original_amount IS NULL");
addColumn("workspace_preferences","default_transaction_currency","TEXT NOT NULL DEFAULT 'PHP'");
addColumn("statement_imports","reconciliation_stale","INTEGER NOT NULL DEFAULT 0");
addColumn("csv_import_batches","reconciliation_stale","INTEGER NOT NULL DEFAULT 0");
addColumn("accounts","reconciliation_stale","INTEGER NOT NULL DEFAULT 0");
db.exec(`
CREATE TABLE IF NOT EXISTS statements(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL REFERENCES accounts(id),filename TEXT NOT NULL,file_key TEXT NOT NULL UNIQUE,file_hash TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL,parser_version TEXT NOT NULL DEFAULT 'luna-csv-v1',currency TEXT NOT NULL DEFAULT 'PHP',date_policy TEXT NOT NULL DEFAULT 'ISO calendar dates; posting date; UTC; no pending rows',error TEXT NOT NULL DEFAULT '',period_start TEXT,period_end TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(owner_id,account_id,file_hash));
CREATE TABLE IF NOT EXISTS statement_entries(id INTEGER PRIMARY KEY,statement_id INTEGER NOT NULL REFERENCES statements(id),row_index INTEGER NOT NULL,raw_json TEXT NOT NULL,normalized_json TEXT,warnings TEXT NOT NULL DEFAULT '',UNIQUE(statement_id,row_index));
CREATE TABLE IF NOT EXISTS statement_decisions(entry_id INTEGER PRIMARY KEY REFERENCES statement_entries(id),statement_id INTEGER NOT NULL REFERENCES statements(id),action TEXT NOT NULL CHECK(action IN('import','link','skip')),transaction_id INTEGER REFERENCES transactions(id),category_id INTEGER REFERENCES categories(id),destination_id INTEGER REFERENCES accounts(id),reason TEXT NOT NULL DEFAULT '',evidence TEXT NOT NULL DEFAULT '',actor_id INTEGER NOT NULL REFERENCES users(id),decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(statement_id,transaction_id));
CREATE TABLE IF NOT EXISTS reconciliations(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),statement_id INTEGER NOT NULL REFERENCES statements(id),account_id INTEGER NOT NULL REFERENCES accounts(id),period_start TEXT NOT NULL,period_end TEXT NOT NULL,opening_balance INTEGER NOT NULL,closing_balance INTEGER NOT NULL,expected_closing INTEGER NOT NULL,difference INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('finalized','reopened')),resolved_entries TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reopened_at TEXT,reopen_reason TEXT);
CREATE INDEX IF NOT EXISTS statements_owner_idx ON statements(owner_id,account_id);
CREATE INDEX IF NOT EXISTS reconciliation_period_idx ON reconciliations(owner_id,account_id,state,period_start,period_end);
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_active_idx ON reconciliations(statement_id) WHERE state='finalized';
`);

addColumn("statements","summary_json","TEXT");
addColumn("statements","raw_summary_json","TEXT");
addColumn("statement_decisions","reviewed_kind","TEXT");

addColumn("statements","funding_account_id","INTEGER REFERENCES accounts(id)");
addColumn("statement_decisions","request_json","TEXT");
db.exec(`
CREATE TABLE IF NOT EXISTS payment_methods(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL REFERENCES accounts(id),type TEXT NOT NULL CHECK(type IN('debit','credit')),display_name TEXT NOT NULL,last4 TEXT CHECK(last4 IS NULL OR (length(last4)=4 AND last4 NOT GLOB '*[^0-9]*')),archived_at TEXT);
CREATE TABLE IF NOT EXISTS statement_payment_allocations(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),statement_id INTEGER NOT NULL REFERENCES statements(id),transaction_id INTEGER NOT NULL REFERENCES transactions(id),amount INTEGER NOT NULL CHECK(amount>0),request_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reversed_at TEXT,reverse_reason TEXT,UNIQUE(owner_id,request_key));
CREATE TABLE IF NOT EXISTS workspace_resets(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,backup_key TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(owner_id,request_key));
`);
addColumn("transactions","payment_method_id","INTEGER REFERENCES payment_methods(id)");

addColumn("statement_entries","review_required","TEXT NOT NULL DEFAULT ''");
retireVerification(db);
