import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,chmodSync} from "node:fs";
import {join,resolve,relative,isAbsolute} from "node:path";
import {db} from "./db.ts";
import {createTransaction} from "./ledger.ts";
import {uploadStatement,statementDetail,commitStatement} from "./statements.ts";
import {sampleStatements} from "./sample-statements.ts";

function storage(){
 if(process.env.NODE_ENV==="production"&&!process.env.LUNA_STATEMENTS_PATH)throw Error("Configure private persistent statement storage before resetting.");
 const root=resolve(process.env.LUNA_STATEMENTS_PATH||"./data/private-statements");for(const publicRoot of [resolve('public'),resolve('.output/public'),resolve('src')]){const p=relative(publicRoot,root);if(!p||!p.startsWith('..')&&!isAbsolute(p))throw Error("Backup storage must be outside public and source directories");}mkdirSync(root,{recursive:true,mode:0o700});chmodSync(root,0o700);return root;
}
function snapshot(owner:number){
 if(!db.prepare("SELECT 1 FROM users WHERE id=?").get(owner))throw Error("Workspace unavailable");
 if(db.prepare("SELECT 1 FROM cc_line_decisions d JOIN cc_statement_lines l ON l.id=d.line_id JOIN cc_statements s ON s.id=l.statement_id WHERE s.owner_id=? AND d.transaction_id IS NOT NULL UNION SELECT 1 FROM cc_payments WHERE owner_id=? AND transaction_id IS NOT NULL").get(owner,owner))throw Error("Sample reset is unavailable while issued statement evidence links to ledger history. Use a separate disposable workspace; existing financial records must remain intact.");
 const data:Record<string,unknown[]>={};for(const table of ['accounts','categories','transactions','statement_imports','statement_import_rows','csv_import_batches','csv_import_rows','statements','reconciliations','statement_payment_allocations','payment_methods','bills','bill_payments','budgets','goals','goal_contributions','merchant_rules','service_providers','workspace_preferences','audit_events'])data[table]=db.prepare(`SELECT * FROM ${table} WHERE owner_id=? ORDER BY rowid`).all(owner);
 data.account_entries=db.prepare("SELECT e.* FROM account_entries e JOIN transactions t ON t.id=e.transaction_id WHERE t.owner_id=? ORDER BY e.id").all(owner);
 data.statement_entries=db.prepare("SELECT e.* FROM statement_entries e JOIN statements s ON s.id=e.statement_id WHERE s.owner_id=? ORDER BY e.id").all(owner);
 data.statement_decisions=db.prepare("SELECT d.* FROM statement_decisions d JOIN statements s ON s.id=d.statement_id WHERE s.owner_id=? ORDER BY d.entry_id").all(owner);
 return data;
}
export function sampleResetPreview(owner:number){const data=snapshot(owner);return{version:createHash('sha256').update(JSON.stringify(data)).digest('hex'),transactions:data.transactions.length,statements:data.statements.length,legacyImports:data.csv_import_batches.length+data.statement_imports.length,paymentRecords:data.bill_payments.length+data.statement_payment_allocations.length};}
export function resetSampleWorkspace(owner:number,input:{version:string;confirmation:string;requestKey:string;cardId?:number;cashId?:number;bankId?:number}){
 if(!input||input.confirmation!=="RESET MY WORKSPACE"||typeof input.requestKey!=="string"||!/^[a-zA-Z0-9-]{1,100}$/.test(input.requestKey)||typeof input.version!=="string")throw Error("Review the reset preview and type RESET MY WORKSPACE");
 const prior=db.prepare("SELECT result_json FROM workspace_resets WHERE owner_id=? AND request_key=?").get(owner,input.requestKey) as {result_json:string}|undefined;if(prior)return{...JSON.parse(prior.result_json),duplicate:true};
 const root=storage(),beforeFiles=new Set((db.prepare("SELECT file_key FROM statements WHERE owner_id=?").all(owner) as {file_key:string}[]).map(s=>s.file_key));
 let backupKey="";const uploadedFiles:string[]=[];
 try{const result=db.transaction(()=>{
  if(sampleResetPreview(owner).version!==input.version)throw Error("Workspace changed. Refresh the reset preview before continuing.");
  const data=snapshot(owner),originals=(data.statements as {id:number;file_key:string;file_hash:string}[]).map(s=>{if(!/^[a-f0-9-]{36}\.csv$/.test(s.file_key))throw Error("Invalid private statement reference");const bytes=readFileSync(join(root,s.file_key));if(createHash('sha256').update(bytes).digest('hex')!==s.file_hash)throw Error("Original statement file differs from its recorded hash; reset blocked");return{statementId:s.id,fileKey:s.file_key,sha256:s.file_hash,base64:bytes.toString('base64')};});
  const backups=join(root,'workspace-backups');mkdirSync(backups,{recursive:true,mode:0o700});chmodSync(backups,0o700);backupKey=`${randomUUID()}.json`;const payload=JSON.stringify({schemaVersion:1,ownerId:owner,createdAt:new Date().toISOString(),version:input.version,data,originals});writeFileSync(join(backups,backupKey),payload,{flag:'wx',mode:0o600});if(readFileSync(join(backups,backupKey),'utf8')!==payload)throw Error("Backup verification failed; reset blocked");
  const existingOpenings=(data.transactions as any[]).filter(t=>t.kind==='opening'&&!t.voided_at);
  for(const table of ['statement_payment_allocations','bill_payments','reconciliations','statement_import_rows','csv_import_rows'])db.prepare(`DELETE FROM ${table} WHERE owner_id=?`).run(owner);
  db.prepare("DELETE FROM statement_decisions WHERE statement_id IN(SELECT id FROM statements WHERE owner_id=?)").run(owner);
  db.prepare("DELETE FROM statement_entries WHERE statement_id IN(SELECT id FROM statements WHERE owner_id=?)").run(owner);
  for(const table of ['statements','statement_imports','csv_import_batches'])db.prepare(`DELETE FROM ${table} WHERE owner_id=?`).run(owner);
  db.prepare("DELETE FROM account_entries WHERE transaction_id IN(SELECT id FROM transactions WHERE owner_id=?)").run(owner);
  db.prepare("UPDATE transactions SET replaces_id=NULL WHERE owner_id=?").run(owner);db.prepare("DELETE FROM transactions WHERE owner_id=?").run(owner);
  db.prepare("UPDATE accounts SET reconciled_through=NULL,reconciliation_stale=0 WHERE owner_id=?").run(owner);
  function select(type:string,id:number|undefined,name:string,issuer:string|null=null){
   if(id!==undefined){if(!Number.isSafeInteger(id)||id<=0)throw Error("Invalid sample account mapping");const a=db.prepare("SELECT * FROM accounts WHERE owner_id=? AND id=? AND type=? AND archived_at IS NULL").get(owner,id,type) as any;if(!a)throw Error(`Choose an active owned ${type} account`);return a.id as number;}
   const matches=db.prepare("SELECT id FROM accounts WHERE owner_id=? AND name=? AND type=? AND archived_at IS NULL").all(owner,name,type) as {id:number}[];if(matches.length>1)throw Error(`Multiple ${name} accounts; choose one explicitly`);if(matches.length)return matches[0].id;
   return Number(db.prepare("INSERT INTO accounts(owner_id,name,type,liquid,opening_date,issuer,credit_limit) VALUES(?,?,?,?,?,?,?)").run(owner,name,type,['cash','bank'].includes(type)?1:0,'2026-04-01',issuer,type==='credit_card'?16450000:null).lastInsertRowid);
  }
  const card=select('credit_card',input.cardId,'UnionBank Credit Card','UnionBank'),cash=select('cash',input.cashId,'Cash on Hand'),bank=select('bank',input.bankId,'BDO Mastercard Debit account','BDO'),loan=select('loan',undefined,'EasyCash Loan','UnionBank');
  for(const id of [card,cash,bank,loan]){db.prepare("UPDATE accounts SET opening_date='2026-04-01' WHERE owner_id=? AND id=?").run(owner,id);if(id===card)db.prepare("UPDATE accounts SET issuer='UnionBank',credit_limit=16450000 WHERE owner_id=? AND id=?").run(owner,id);if(id===cash||id===bank)db.prepare("UPDATE accounts SET liquid=1 WHERE owner_id=? AND id=?").run(owner,id);}
  for(const t of existingOpenings)if(![card,cash,bank,loan].includes(t.account_id)){const a=db.prepare('SELECT archived_at FROM accounts WHERE owner_id=? AND id=?').get(owner,t.account_id) as any;if(a&&!a.archived_at)createTransaction(owner,{kind:'opening',date:t.posted_date,amount:t.amount,accountId:t.account_id,idempotencyKey:`sample-opening-${t.account_id}`});}
  createTransaction(owner,{kind:'opening',date:'2026-04-01',amount:1496931,accountId:card,description:'May source previous balance; migration opening debt',idempotencyKey:'sample-card-opening'});
  createTransaction(owner,{kind:'opening',date:'2026-04-01',amount:1500000,accountId:cash,description:'Confirmed April cash opening',idempotencyKey:'sample-cash-opening'});
  createTransaction(owner,{kind:'transfer',date:'2026-04-16',amount:5000000,accountId:loan,counterAccountId:bank,description:'EasyCash loan proceeds received',notes:'Separate loan liability; not income. Installment allocations require review.',idempotencyKey:'sample-easycash-receipt'});
  function category(name:string,kind:string){const found=db.prepare('SELECT id FROM categories WHERE owner_id=? AND name=? AND kind=? AND archived_at IS NULL').get(owner,name,kind) as {id:number}|undefined;if(found)return found.id;let label=name;while(db.prepare('SELECT 1 FROM categories WHERE owner_id=? AND name=?').get(owner,label))label+=' ';return Number(db.prepare('INSERT INTO categories(owner_id,name,kind) VALUES(?,?,?)').run(owner,label,kind).lastInsertRowid);}
  const income=category('Cash income','income'),expense=category('Statement expenses','expense');
  for(const month of ['05','06','07','08','09'])createTransaction(owner,{kind:'income',date:`2026-${month}-01`,amount:3800000,accountId:cash,categoryId:income,description:'Monthly cash on hand income',idempotencyKey:`sample-income-2026-${month}`});
  if(!db.prepare("SELECT 1 FROM payment_methods WHERE owner_id=? AND account_id=? AND type='debit' AND archived_at IS NULL").get(owner,bank))db.prepare("INSERT INTO payment_methods(owner_id,account_id,type,display_name) VALUES(?,?,'debit','BDO Mastercard Debit')").run(owner,bank);
  let rows=0,imported=0,pending=0;const statements:number[]=[];
  for(const sample of sampleStatements){
   const u=uploadStatement(owner,{accountId:card,fundingAccountId:cash,filename:sample.filename,mime:'text/csv',base64:Buffer.from(sample.text).toString('base64')});statements.push(u.id);uploadedFiles.push((db.prepare("SELECT file_key FROM statements WHERE id=?").get(u.id) as {file_key:string}).file_key);let s=statementDetail(owner,u.id);if(s.status==='failed'||s.entries.some(e=>!e.row)||s.discrepancies.length)throw Error(`Sample validation failed: ${sample.filename}`);
   for(const e of s.entries){const description=e.row!.description;if(/instalment|installment/i.test(description)&&!/processing fee/i.test(description)||/^\(\d{2}\/\d{2}\)/.test(description)){if(/Credit for Transaction Instalment/i.test(description))continue;db.prepare("UPDATE statement_entries SET review_required=? WHERE id=?").run('Installment treatment unconfirmed. Identify purchase, interest or loan-principal transfer before approving; no schedule generated.',e.id);}}
   s=statementDetail(owner,u.id);const decisions:any[]=[];
   for(const e of s.entries){const r=e.row!,description=r.description;rows++;
    if(description==='EasyCash'||/Credit for Transaction Instalment/i.test(description)){decisions.push({entryId:e.id,action:'skip',reason:'Confirmed conversion pair: excluded from spending. Separate ₱50,000 EasyCash loan receipt into BDO on April 16; source evidence retained.'});continue;}
    if((e as any).reviewRequired){pending++;continue;}
    if(r.kind==='unresolved'&&description!=='BDO BILLS PAYMENT -CASH'&&!/^PINGGY\.IO.*USD -30\.00/i.test(description)){pending++;continue;}
    decisions.push({entryId:e.id,action:'import',categoryId:r.kind==='transfer'||description==='BDO BILLS PAYMENT -CASH'?undefined:expense,destinationId:r.kind==='transfer'||description==='BDO BILLS PAYMENT -CASH'?cash:undefined,reviewedKind:r.kind==='unresolved'?(description==='BDO BILLS PAYMENT -CASH'?'transfer':'refund'):undefined,reason:'Provided source row retained separately in the confirmed clean sample import; equal amounts/dates without institution references are not proof of duplication.'});
   }
   if(decisions.length)imported+=commitStatement(owner,u.id,{version:s.version,decisions}).imported;
  }
  const result={ok:true,statements:statements.length,statementIds:statements,rows,imported,pending,income:19000000,backupKey};
  db.prepare("INSERT INTO workspace_resets(owner_id,request_key,backup_key,result_json) VALUES(?,?,?,?)").run(owner,input.requestKey,backupKey,JSON.stringify(result));db.prepare("INSERT INTO audit_events(owner_id,action,details) VALUES(?,'workspace.sample_reset',?)").run(owner,JSON.stringify({backupKey,version:input.version,result}));return result;
 }).immediate();
 // Originals remain inside the verified private backup. Cleanup after SQLite commit; leftover files are private, never financial records.
 for(const key of beforeFiles)try{unlinkSync(join(root,key));}catch{}
 return result;
 }catch(e){for(const key of uploadedFiles)try{unlinkSync(join(root,key));}catch{}
 throw e;
 }
}
export function downloadResetBackup(owner:number,key:string){if(!/^[a-f0-9-]{36}\.json$/.test(key)||!db.prepare('SELECT 1 FROM workspace_resets WHERE owner_id=? AND backup_key=?').get(owner,key))throw Error('Backup unavailable');return readFileSync(join(storage(),'workspace-backups',key));}
