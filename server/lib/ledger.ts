import { atomic,db } from "./db.ts";
import { isCalendarDate,MAX_MINOR } from "../../src/lib/finance.ts";
export type LedgerInput={kind:"income"|"expense"|"refund"|"transfer"|"opening"|"adjustment";date:string;amount:number;accountId:number;counterAccountId?:number;categoryId?:number;description?:string;idempotencyKey:string};
export function createTransaction(ownerId:number,input:LedgerInput){
 if(!input||!Number.isSafeInteger(ownerId)||ownerId<=0||!Number.isSafeInteger(input.accountId)||input.accountId<=0||!isCalendarDate(input.date)||input.date>new Date().toISOString().slice(0,10)||!Number.isSafeInteger(input.amount)||input.amount<=0||input.amount>MAX_MINOR||typeof input.idempotencyKey!=="string"||!input.idempotencyKey.trim()||input.idempotencyKey.length>100||typeof input.kind!=="string"||!["income","expense","refund","transfer","opening","adjustment"].includes(input.kind)||input.counterAccountId!==undefined&&(!Number.isSafeInteger(input.counterAccountId)||input.counterAccountId<=0)||input.categoryId!==undefined&&(!Number.isSafeInteger(input.categoryId)||input.categoryId<=0)||input.description!==undefined&&typeof input.description!=="string")throw new Error("Invalid transaction");
 if(input.kind==="transfer"&&(!input.counterAccountId||input.counterAccountId===input.accountId))throw new Error("Transfer needs two different accounts");
 if(input.kind!=="transfer"&&input.counterAccountId)throw new Error("Counter account only applies to transfers");
 if(["income","expense","refund"].includes(input.kind)&&!input.categoryId)throw new Error("Choose a category");
 if(["opening","adjustment","transfer"].includes(input.kind)&&input.categoryId)throw new Error("This transaction type cannot have a category");
 return atomic(()=>{
  const existing=db.prepare("SELECT id FROM transactions WHERE owner_id=? AND idempotency_key=?").get(ownerId,input.idempotencyKey) as {id:number}|undefined;if(existing)return{id:existing.id};
  const account=db.prepare("SELECT type,opening_date,archived_at FROM accounts WHERE id=? AND owner_id=?").get(input.accountId,ownerId) as {type:string;opening_date:string;archived_at:string|null}|undefined;
  if(!account||account.archived_at)throw new Error("Account unavailable");if(input.date<account.opening_date&&input.kind!=="opening")throw new Error("Transaction predates account opening");
  if(input.counterAccountId){const second=db.prepare("SELECT type,opening_date,archived_at FROM accounts WHERE id=? AND owner_id=?").get(input.counterAccountId,ownerId) as typeof account;if(!second||second.archived_at)throw new Error("Counter account unavailable");if(second.opening_date>input.date)throw new Error("Transaction predates counter account opening");}
  if(input.categoryId){const category=db.prepare("SELECT kind FROM categories WHERE id=? AND owner_id=? AND archived_at IS NULL").get(input.categoryId,ownerId) as {kind:string}|undefined;if(!category||category.kind!== (input.kind==="income"?"income":"expense"))throw new Error("Category does not match transaction type");}
  if(input.kind==="opening"&&db.prepare("SELECT 1 FROM transactions WHERE owner_id=? AND account_id=? AND kind='opening' AND voided_at IS NULL").get(ownerId,input.accountId))throw new Error("Opening balance already exists");
  if(input.kind==="adjustment"&&!input.description?.trim())throw new Error("Adjustment requires a reason");
  const row=db.prepare("INSERT INTO transactions(owner_id,kind,posted_date,amount,account_id,counter_account_id,category_id,description,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)").run(ownerId,input.kind,input.date,input.amount,input.accountId,input.counterAccountId??null,input.categoryId??null,input.description?.trim().slice(0,240)??"",input.idempotencyKey);
  const id=Number(row.lastInsertRowid),isLiability=(type:string)=>["credit_card","loan","liability"].includes(type),entries=db.prepare("INSERT INTO account_entries(transaction_id,account_id,delta) VALUES(?,?,?)");
  if(input.kind==="opening")entries.run(id,input.accountId,input.amount*(isLiability(account.type)?-1:1));
  else if(input.kind==="adjustment")entries.run(id,input.accountId,input.amount);
  else if(input.kind==="income"||input.kind==="refund")entries.run(id,input.accountId,input.amount);
  else if(input.kind==="expense")entries.run(id,input.accountId,-input.amount);
  else {entries.run(id,input.accountId,-input.amount);entries.run(id,input.counterAccountId!,input.amount);}
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,?,?)").run(ownerId,"transaction.create",id);return{id};
 });
}
export function voidTransaction(ownerId:number,id:number){return atomic(()=>{const result=db.prepare("UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND voided_at IS NULL").run(id,ownerId);if(!result.changes)throw new Error("Transaction not found");db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,'transaction.void',?)").run(ownerId,id);return{ok:true}})}
export function balanceFor(ownerId:number,accountId:number,through?:string){return(db.prepare("SELECT COALESCE(SUM(e.delta),0) balance FROM account_entries e JOIN transactions t ON t.id=e.transaction_id WHERE e.account_id=? AND t.owner_id=? AND t.voided_at IS NULL AND (? IS NULL OR t.posted_date<=?)").get(accountId,ownerId,through??null,through??null) as {balance:number}).balance}
