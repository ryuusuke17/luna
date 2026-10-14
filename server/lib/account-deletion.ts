import {createHash} from "node:crypto";
import {atomic,db} from "./db.ts";
import {balanceFor} from "./ledger.ts";

export function accountDeletionPreview(owner:number,id:number){
 const account=db.prepare("SELECT * FROM accounts WHERE owner_id=? AND id=?").get(owner,id) as any;if(!account)throw Error("Account unavailable");
 const transactions=db.prepare("WITH RECURSIVE affected(id) AS (SELECT id FROM transactions WHERE owner_id=? AND (account_id=? OR counter_account_id=?) UNION SELECT t.id FROM transactions t JOIN affected x ON t.replaces_id=x.id WHERE t.owner_id=? UNION SELECT t.replaces_id FROM transactions t JOIN affected x ON t.id=x.id WHERE t.owner_id=? AND t.replaces_id IS NOT NULL) SELECT t.* FROM transactions t JOIN affected x ON x.id=t.id ORDER BY t.id").all(owner,id,id,owner,owner) as any[];
 const ids=transactions.map(t=>t.id),marks=ids.length?ids.map(()=>"?").join(","):"NULL";
 if(db.prepare(`SELECT 1 FROM statements WHERE owner_id=? AND account_id=? UNION SELECT 1 FROM statement_decisions d JOIN statements s ON s.id=d.statement_id WHERE s.owner_id=? AND d.transaction_id IN (${marks}) UNION SELECT 1 FROM reconciliations r JOIN account_entries e ON e.account_id=r.account_id WHERE r.owner_id=? AND r.state='finalized' AND e.transaction_id IN (${marks})`).get(owner,id,owner,...ids,owner,...ids))throw Error("Account history is protected by a statement archive or reconciliation. Purging would destroy retained provenance and is unavailable.");
 const entries=db.prepare(`SELECT * FROM account_entries WHERE transaction_id IN (${marks}) ORDER BY id`).all(...ids) as any[];
 const bills=db.prepare(`SELECT * FROM bills WHERE owner_id=? AND (account_id=? OR id IN(SELECT bill_id FROM bill_payments WHERE owner_id=? AND transaction_id IN (${marks}))) ORDER BY id`).all(owner,id,owner,...ids) as any[];
 const billIds=bills.map(b=>b.id),billMarks=billIds.length?billIds.map(()=>"?").join(","):"NULL";
 const payments=db.prepare(`SELECT * FROM bill_payments WHERE owner_id=? AND (transaction_id IN (${marks}) OR bill_id IN (${billMarks})) ORDER BY bill_id`).all(owner,...ids,...billIds);
 const statementRows=db.prepare(`SELECT * FROM statement_import_rows WHERE owner_id=? AND (account_id=? OR transaction_id IN (${marks})) ORDER BY id`).all(owner,id,...ids) as any[];
 const csvRows=db.prepare(`SELECT * FROM csv_import_rows WHERE owner_id=? AND (account_id=? OR transaction_id IN (${marks})) ORDER BY id`).all(owner,id,...ids) as any[];
 const statements=db.prepare("SELECT * FROM statement_imports WHERE owner_id=? AND account_id=? ORDER BY id").all(owner,id);
 const batches=db.prepare("SELECT * FROM csv_import_batches WHERE owner_id=? AND account_id=? ORDER BY id").all(owner,id);
 const impacts=new Map<number,number>();for(const e of entries)if(e.account_id!==id&&!transactions.find(t=>t.id===e.transaction_id)?.voided_at)impacts.set(e.account_id,(impacts.get(e.account_id)??0)-e.delta);
 const surviving=[...impacts].map(([accountId,change])=>{const a=db.prepare("SELECT name FROM accounts WHERE owner_id=? AND id=?").get(owner,accountId) as {name:string};const before=balanceFor(owner,accountId);if(!Number.isSafeInteger(before+change))throw Error("This deletion would exceed a surviving account’s supported balance limit.");return{id:accountId,name:a.name,before,change,after:before+change};});
 const counts={transactions:ids.length,ledger_entries:entries.length,bills:bills.length,payments:payments.length,statement_rows:statementRows.length,csv_rows:csvRows.length,statements:statements.length,csv_batches:batches.length};
 const version=createHash("sha256").update(JSON.stringify([account,transactions,entries,bills,payments,statementRows,csvRows,statements,batches,surviving])).digest("hex");
 return{account:{id,name:account.name},counts,surviving,version,ids,billIds,statementRows,csvRows};
}
export function deleteAccount(owner:number,id:number,body:any){return atomic(()=>{
 const p=accountDeletionPreview(owner,id);if(body?.confirmation!==p.account.name||body?.version!==p.version)throw Error("This account or its history changed. Reload the deletion preview and review before deleting.");
 const marks=p.ids.length?p.ids.map(()=>"?").join(","):"NULL",billMarks=p.billIds.length?p.billIds.map(()=>"?").join(","):"NULL";
 db.prepare(`DELETE FROM bill_payments WHERE owner_id=? AND (transaction_id IN (${marks}) OR bill_id IN (${billMarks}))`).run(owner,...p.ids,...p.billIds);
 db.prepare(`DELETE FROM bills WHERE owner_id=? AND id IN (${billMarks})`).run(owner,...p.billIds);
 for(const table of ["statement_import_rows","csv_import_rows"])db.prepare(`DELETE FROM ${table} WHERE owner_id=? AND (account_id=? OR transaction_id IN (${marks}))`).run(owner,id,...p.ids);
 db.prepare("DELETE FROM statement_imports WHERE owner_id=? AND account_id=?").run(owner,id);db.prepare("DELETE FROM csv_import_batches WHERE owner_id=? AND account_id=?").run(owner,id);
 const affectedAccounts=new Set([...p.surviving.map(a=>a.id),...p.statementRows.map(r=>r.account_id),...p.csvRows.map(r=>r.account_id)]);
 for(const affectedId of affectedAccounts){db.prepare("UPDATE accounts SET reconciliation_stale=1 WHERE owner_id=? AND id=?").run(owner,affectedId);db.prepare("UPDATE statement_imports SET reconciliation_stale=1 WHERE owner_id=? AND account_id=?").run(owner,affectedId);db.prepare("UPDATE csv_import_batches SET reconciliation_stale=1 WHERE owner_id=? AND account_id=?").run(owner,affectedId);}
 db.prepare(`DELETE FROM account_entries WHERE transaction_id IN (${marks})`).run(...p.ids);
 db.prepare(`UPDATE transactions SET replaces_id=NULL WHERE owner_id=? AND id IN (${marks})`).run(owner,...p.ids);
 db.prepare(`DELETE FROM transactions WHERE owner_id=? AND id IN (${marks})`).run(owner,...p.ids);
 db.prepare("DELETE FROM accounts WHERE owner_id=? AND id=?").run(owner,id);
 db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'account.purge',?,?)").run(owner,id,JSON.stringify({counts:p.counts,transaction_ids:p.ids,bill_ids:p.billIds}));return{ok:true};
});}
