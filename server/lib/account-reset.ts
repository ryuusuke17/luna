import {createHash} from "node:crypto";
import {lstatSync,readFileSync,unlinkSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {z} from "zod";
import {db} from "./db.ts";
import "./credit-card-statements.ts";

const scopes = [
 ["accounts","owner_id=?"], ["transactions","owner_id=?"],
 ["account_entries","account_id IN (SELECT id FROM accounts WHERE owner_id=?)"],
 ["bills","owner_id=?"], ["bill_payments","owner_id=?"], ["payment_methods","owner_id=?"],
 ["statement_imports","owner_id=?"], ["statement_import_rows","owner_id=?"],
 ["csv_import_batches","owner_id=?"], ["csv_import_rows","owner_id=?"],
 ["statements","owner_id=?"],
 ["statement_entries","statement_id IN (SELECT id FROM statements WHERE owner_id=?)"],
 ["statement_decisions","statement_id IN (SELECT id FROM statements WHERE owner_id=?)"],
 ["reconciliations","owner_id=?"], ["statement_payment_allocations","owner_id=?"],
 ["statement_archives","owner_id=? AND account_id IS NOT NULL"],
 ["cc_statements","owner_id=?"],
 ["cc_statement_lines","statement_id IN (SELECT id FROM cc_statements WHERE owner_id=?)"],
 ["cc_line_decisions","line_id IN (SELECT l.id FROM cc_statement_lines l JOIN cc_statements s ON s.id=l.statement_id WHERE s.owner_id=?)"],
 ["cc_line_annotations","line_id IN (SELECT l.id FROM cc_statement_lines l JOIN cc_statements s ON s.id=l.statement_id WHERE s.owner_id=?)"],
 ["cc_payments","owner_id=?"],
 ["cc_allocations","payment_id IN (SELECT id FROM cc_payments WHERE owner_id=?)"],
 ["cc_payment_evidence","payment_id IN (SELECT id FROM cc_payments WHERE owner_id=?)"],
] as const;

function snapshot(owner:number){
 const records=Object.fromEntries(scopes.map(([table,where])=>[table,db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY rowid`).all(owner)]));
 const counts=Object.fromEntries(Object.entries(records).map(([table,rows])=>[table,rows.length]));
 return {counts,version:createHash("sha256").update(JSON.stringify(records)).digest("hex")};
}
export function accountResetPreview(owner:number){return db.transaction(()=>snapshot(owner))();}

const inputSchema=z.object({confirmation:z.literal("DELETE ALL ACCOUNTS"),version:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function resetAccounts(owner:number,input:unknown){
 const value=inputSchema.parse(input),removed:{path:string;bytes:Buffer}[]=[];
 try{return db.transaction(()=>{
  const preview=snapshot(owner);
  if(preview.version!==value.version)throw Error("Account history changed. Close and reopen the reset confirmation before deleting.");
  const files=db.prepare("SELECT file_key,0 archive FROM statements WHERE owner_id=? UNION ALL SELECT file_key,1 FROM statement_archives WHERE owner_id=? AND account_id IS NOT NULL").all(owner,owner) as {file_key:string;archive:number}[];
  const root=resolve(process.env.LUNA_STATEMENTS_PATH||"./data/private-statements");
  for(const file of files){
   if(!/^[a-f0-9-]{36}\.csv$/.test(file.file_key))throw Error("Invalid private statement reference; reset blocked.");
   const directory=file.archive?join(root,"archive-only"):root,path=join(directory,file.file_key);
   try{
    if(lstatSync(directory).isSymbolicLink()||lstatSync(path).isSymbolicLink())throw Error("Statement storage cannot use symbolic links during reset.");
    const bytes=readFileSync(path);unlinkSync(path);removed.push({path,bytes});
   }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  }
  const deleteTables=["cc_payment_evidence","cc_allocations","cc_line_decisions","cc_line_annotations","cc_statement_lines"];
  for(const table of deleteTables){const scope=scopes.find(([name])=>name===table)!;db.prepare(`DELETE FROM ${scope[0]} WHERE ${scope[1]}`).run(owner);}
  db.prepare("UPDATE cc_statements SET supersedes_id=NULL,superseded_by=NULL WHERE owner_id=?").run(owner);
  for(const table of ["cc_statements","cc_payments","statement_payment_allocations","reconciliations","statement_decisions","statement_entries","statements","statement_archives","bill_payments","bills","statement_import_rows","csv_import_rows","statement_imports","csv_import_batches","account_entries"]){
   const scope=scopes.find(([name])=>name===table)!;db.prepare(`DELETE FROM ${scope[0]} WHERE ${scope[1]}`).run(owner);
  }
  db.prepare("UPDATE transactions SET replaces_id=NULL WHERE owner_id=?").run(owner);
  for(const table of ["transactions","payment_methods","accounts"])db.prepare(`DELETE FROM ${table} WHERE owner_id=?`).run(owner);
  db.prepare("INSERT INTO audit_events(owner_id,action,details) VALUES(?,'accounts.reset',?)").run(owner,JSON.stringify(preview.counts));
  return {ok:true,counts:preview.counts};
 }).immediate();}catch(error){
  for(const file of removed)writeFileSync(file.path,file.bytes,{flag:"wx",mode:0o600});
  throw error;
 }
}
