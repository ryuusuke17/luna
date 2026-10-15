import Database from "better-sqlite3";
import {cpSync,existsSync,mkdirSync,writeFileSync,readFileSync,lstatSync} from "node:fs";
import {basename,dirname,isAbsolute,join,relative,resolve} from "node:path";
import {randomUUID} from "node:crypto";

export function retireVerification(database:Database.Database, originals=resolve(process.env.LUNA_STATEMENTS_PATH||"./data/private-statements")) {
 database.exec("CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,snapshot_path TEXT)");
 if(database.prepare("SELECT 1 FROM app_migrations WHERE name='transaction-first-v1'").get())return;
 let snapshot:string|null=null;
 if(database.name!==":memory:"&&database.prepare("SELECT 1 FROM users UNION ALL SELECT 1 FROM accounts UNION ALL SELECT 1 FROM statements LIMIT 1").get()) {
  snapshot=join(dirname(resolve(database.name)),"migration-backups",`transaction-first-${randomUUID()}`);
  const rel=relative(resolve(originals),snapshot);
  if(!rel||!rel.startsWith("..")&&!isAbsolute(rel))throw Error("Migration backup must be outside the private originals directory");
  mkdirSync(snapshot,{recursive:true,mode:0o700});
  database.prepare("VACUUM INTO ?").run(join(snapshot,"luna.sqlite"));
  const saved=new Database(join(snapshot,"luna.sqlite"),{readonly:true});
  try{if(saved.pragma("integrity_check",{simple:true})!=="ok")throw Error("Migration database snapshot failed integrity validation");}finally{saved.close();}
  if(existsSync(originals))cpSync(originals,join(snapshot,"private-statements"),{recursive:true,force:false,errorOnExist:true});
  else if(database.prepare("SELECT 1 FROM statements LIMIT 1").get())throw Error("Private originals directory missing; restore it before the transaction-first migration");
  const files=database.prepare("SELECT file_key FROM statements").all() as {file_key:string}[];
  for(const {file_key:key} of files){
   if(!key||basename(key)!==key||!lstatSync(join(originals,key)).isFile()||!readFileSync(join(originals,key)).equals(readFileSync(join(snapshot,"private-statements",key))))throw Error("Private original missing or incomplete; restore it before migration");
  }
  writeFileSync(join(snapshot,"manifest.json"),JSON.stringify({migration:"transaction-first-v1",database:resolve(database.name),originals:resolve(originals)},null,2),{flag:"wx",mode:0o600});
 }
 database.transaction(()=>{
  if(database.prepare("SELECT 1 FROM app_migrations WHERE name='transaction-first-v1'").get())return;
  const finalized=database.prepare("SELECT * FROM reconciliations WHERE state='finalized'").all() as {id:number;owner_id:number;statement_id:number}[];
  for(const row of finalized)database.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'verification.retire',?,?)").run(row.owner_id,row.id,JSON.stringify({previous:row,snapshot,reason:"Transaction-first imports: verification retired"}));
  database.exec("UPDATE reconciliations SET state='reopened',reopened_at=CURRENT_TIMESTAMP,reopen_reason='Transaction-first imports: verification retired' WHERE state='finalized'; UPDATE statements SET status='imported' WHERE status='reconciled'; UPDATE accounts SET reconciled_through=NULL,reconciliation_stale=0; UPDATE statement_imports SET reconciliation_stale=0; UPDATE csv_import_batches SET reconciliation_stale=0");
  database.prepare("INSERT INTO app_migrations(name,snapshot_path) VALUES('transaction-first-v1',?)").run(snapshot);
 }).immediate();
}
