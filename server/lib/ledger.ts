import "./credit-card-statements.ts";
import {createHash} from "node:crypto";
import { atomic,db } from "./db.ts";
import { isCalendarDate,MAX_MINOR,convertToPHP,validatedRate,currencyDigits } from "../../src/lib/finance.ts";
import {transactionText,transactionType} from "../../src/lib/transactions.ts";
export type LedgerInput={kind:"income"|"expense"|"installment"|"refund"|"transfer"|"opening"|"adjustment";isInstallment?:boolean;date:string;amount:number;accountId:number;counterAccountId?:number;categoryId?:number|null;description?:string;merchant?:string;notes?:string;idempotencyKey:string;originalCurrency?:string;originalAmount?:number;exchangeRate?:string;includedFee?:number;feeEnabled?:boolean;paymentMethodId?:number};
function accountingInput(input:LedgerInput){
 if(!input||input.isInstallment!==undefined&&typeof input.isInstallment!=="boolean"||input.isInstallment&&!["expense","installment"].includes(input.kind)||input.kind==="installment"&&input.isInstallment===false)throw Error("Invalid installment type");
 return {...input,kind:input.kind==="installment"?"expense" as const:input.kind,isInstallment:input.kind==="installment"?true:input.isInstallment};
}
export function createTransaction(ownerId:number,input:LedgerInput){
 input=accountingInput(input);
 const snapshot=currencySnapshot(input);input={...input,amount:snapshot.amount};
 const installment=input.kind==="expense"&&(input.isInstallment??transactionType(input)==="installment")?1:0;
 if(!input||!Number.isSafeInteger(ownerId)||ownerId<=0||!Number.isSafeInteger(input.accountId)||input.accountId<=0||!isCalendarDate(input.date)||input.date>new Date().toISOString().slice(0,10)||!Number.isSafeInteger(input.amount)||input.amount<=0||input.amount>MAX_MINOR||typeof input.idempotencyKey!=="string"||!input.idempotencyKey.trim()||input.idempotencyKey.length>100||typeof input.kind!=="string"||!["income","expense","refund","transfer","opening","adjustment"].includes(input.kind)||input.counterAccountId!==undefined&&(!Number.isSafeInteger(input.counterAccountId)||input.counterAccountId<=0)||input.categoryId!=null&&(!Number.isSafeInteger(input.categoryId)||input.categoryId<=0)||input.description!==undefined&&typeof input.description!=="string")throw new Error("Invalid transaction");
 if(input.merchant!==undefined&&(typeof input.merchant!=="string"||input.merchant.length>240)||input.notes!==undefined&&(typeof input.notes!=="string"||input.notes.length>500)||input.description!==undefined&&input.description.length>240)throw new Error("Invalid transaction metadata");
 if(input.kind==="transfer"&&(!input.counterAccountId||input.counterAccountId===input.accountId))throw new Error("Transfer needs two different accounts");
 if(input.kind!=="transfer"&&input.counterAccountId)throw new Error("Counter account only applies to transfers");
 if(["opening","adjustment","transfer"].includes(input.kind)&&input.categoryId)throw new Error("This transaction type cannot have a category");
 return atomic(()=>{
  const existing=db.prepare("SELECT * FROM transactions WHERE owner_id=? AND idempotency_key=?").get(ownerId,input.idempotencyKey) as {id:number;kind:string;is_installment:number|null;posted_date:string;amount:number;account_id:number;counter_account_id:number|null;category_id:number|null;description:string;merchant:string;notes:string;voided_at:string|null}|undefined;if(existing){if((existing as any).original_currency!==snapshot.currency||(existing as any).original_amount!==snapshot.original||(existing as any).exchange_rate!==snapshot.rate||(existing as any).included_fee!==snapshot.fee||existing.voided_at||existing.kind!==input.kind||Number(transactionType(existing)==="installment")!==installment||existing.posted_date!==input.date||existing.amount!==input.amount||existing.account_id!==input.accountId||existing.counter_account_id!==(input.counterAccountId??null)||existing.category_id!==(input.categoryId??null)||existing.description!==(input.description?.trim()??"")||existing.merchant!==(input.merchant?.trim()??"")||existing.notes!==(input.notes?.trim()??"")||(existing as any).payment_method_id!==(input.paymentMethodId??null))throw new Error("Request key already used for a different or voided transaction");return{id:existing.id};}
  const account=db.prepare("SELECT type,opening_date,archived_at FROM accounts WHERE id=? AND owner_id=?").get(input.accountId,ownerId) as {type:string;opening_date:string;archived_at:string|null}|undefined;
  if(!account||account.archived_at)throw new Error("Account unavailable");if(input.date<account.opening_date&&input.kind!=="opening")throw new Error("Transaction predates account opening");
  if(input.counterAccountId){const second=db.prepare("SELECT type,opening_date,archived_at FROM accounts WHERE id=? AND owner_id=?").get(input.counterAccountId,ownerId) as typeof account;if(!second||second.archived_at)throw new Error("Counter account unavailable");if(second.opening_date>input.date)throw new Error("Transaction predates counter account opening");}
  if(input.paymentMethodId!==undefined){if(!Number.isSafeInteger(input.paymentMethodId)||input.paymentMethodId<=0||!db.prepare("SELECT 1 FROM payment_methods WHERE owner_id=? AND id=? AND account_id=? AND archived_at IS NULL").get(ownerId,input.paymentMethodId,input.accountId))throw Error("Payment method must belong to the selected account");}
  if(input.categoryId){const category=db.prepare("SELECT kind FROM categories WHERE id=? AND owner_id=? AND archived_at IS NULL").get(input.categoryId,ownerId) as {kind:string}|undefined;if(!category||category.kind!== (input.kind==="income"?"income":"expense"))throw new Error("Category does not match transaction type");}
  if(input.kind==="opening"&&input.date!==account.opening_date)throw Error("Opening date must match the account opening date.");
  if(input.kind==="opening"&&db.prepare("SELECT 1 FROM transactions WHERE owner_id=? AND account_id=? AND kind='opening' AND voided_at IS NULL").get(ownerId,input.accountId))throw new Error("Opening balance already exists");
  if(input.kind==="adjustment"&&!input.description?.trim())throw new Error("Adjustment requires a reason");

  const row=db.prepare("INSERT INTO transactions(owner_id,kind,posted_date,amount,account_id,counter_account_id,category_id,description,idempotency_key,merchant,notes,original_currency,original_amount,exchange_rate,included_fee) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(ownerId,input.kind,input.date,input.amount,input.accountId,input.counterAccountId??null,input.categoryId??null,input.description?.trim().slice(0,240)??"",input.idempotencyKey,input.merchant?.trim()??"",input.notes?.trim()??"",snapshot.currency,snapshot.original,snapshot.rate,snapshot.fee);
  db.prepare("UPDATE transactions SET is_installment=? WHERE id=?").run(installment,Number(row.lastInsertRowid));
  if(input.paymentMethodId)db.prepare("UPDATE transactions SET payment_method_id=? WHERE id=?").run(input.paymentMethodId,Number(row.lastInsertRowid));
  const id=Number(row.lastInsertRowid),isLiability=(type:string)=>["credit_card","loan","liability"].includes(type),entries=db.prepare("INSERT INTO account_entries(transaction_id,account_id,delta) VALUES(?,?,?)");
  if(input.kind==="opening")entries.run(id,input.accountId,input.amount*(isLiability(account.type)?-1:1));
  else if(input.kind==="adjustment")entries.run(id,input.accountId,input.amount);
  else if(input.kind==="income"||input.kind==="refund")entries.run(id,input.accountId,input.amount);
  else if(input.kind==="expense")entries.run(id,input.accountId,-input.amount);
  else {entries.run(id,input.accountId,-input.amount);entries.run(id,input.counterAccountId!,input.amount);}
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,?,?)").run(ownerId,"transaction.create",id);return{id};
 });
}
export function balanceFor(ownerId:number,accountId:number,through?:string){return(db.prepare("SELECT COALESCE(SUM(e.delta),0) balance FROM account_entries e JOIN transactions t ON t.id=e.transaction_id WHERE e.account_id=? AND t.owner_id=? AND t.voided_at IS NULL AND (? IS NULL OR t.posted_date<=?)").get(accountId,ownerId,through??null,through??null) as {balance:number}).balance}

function currencySnapshot(input:LedgerInput){
 if(!input)throw Error("Invalid transaction");if(input.originalCurrency!==undefined&&input.originalCurrency!=="PHP"&&(input.exchangeRate===undefined||input.originalAmount===undefined))throw Error("Enter the original amount and a positive manual exchange rate for foreign currency.");const currency=input.originalCurrency??"PHP";currencyDigits(currency);
 const original=input.originalAmount??input.amount,rate=validatedRate(input.exchangeRate??"1",currency),fee=input.includedFee??0;
 if(input.feeEnabled!==undefined&&typeof input.feeEnabled!=="boolean"||input.feeEnabled===true&&fee<=0||input.feeEnabled===false&&fee!==0||!Number.isSafeInteger(fee)||fee<0||fee>original)throw Error("Included fee must be greater than zero and no more than the full amount when enabled.");
 return{currency,original,rate,fee,amount:convertToPHP(original,currency,rate)};
}
export function transactionVersion(owner:number,id:number):string {
 const row=db.prepare("SELECT * FROM transactions WHERE owner_id=? AND id=?").get(owner,id);if(!row)throw Error("Transaction not found");
 const dependencies=["bill_payments","statement_import_rows","csv_import_rows"].map(table=>db.prepare("SELECT * FROM "+table+" WHERE owner_id=? AND transaction_id=?").all(owner,id));
 dependencies.push(db.prepare("SELECT * FROM statement_payment_allocations WHERE owner_id=? AND transaction_id=?").all(owner,id));
 dependencies.push(db.prepare("SELECT d.*,r.state FROM statement_decisions d JOIN statements s ON s.id=d.statement_id LEFT JOIN reconciliations r ON r.statement_id=s.id WHERE s.owner_id=? AND d.transaction_id=?").all(owner,id));
 dependencies.push(db.prepare("SELECT d.* FROM cc_line_decisions d JOIN cc_decision_projection p ON p.line_id=d.line_id WHERE p.owner_id=? AND p.resolved_transaction_id=?").all(owner,id));
 dependencies.push(db.prepare("SELECT * FROM cc_payments WHERE owner_id=? AND transaction_id=?").all(owner,id));
 return createHash("sha256").update(JSON.stringify([row,dependencies])).digest("hex");
}
export function transactionFeedback(owner:number,id:number){
 const record=db.prepare("SELECT kind,is_installment,description,merchant,notes FROM transactions WHERE owner_id=? AND id=?").get(owner,id) as {kind:string;is_installment:number|null;description:string;merchant:string;notes:string};
 const issued=db.prepare("SELECT s.id,s.card_id account_id,s.filename,l.id line_id,p.original_transaction_id,p.resolved_transaction_id FROM cc_decision_projection p JOIN cc_statement_lines l ON l.id=p.line_id JOIN cc_statements s ON s.id=l.statement_id WHERE p.owner_id=? AND p.resolved_transaction_id=?").all(owner,id);
 const source=issued.length>0||Boolean(db.prepare("SELECT 1 FROM csv_import_rows WHERE owner_id=? AND transaction_id=? UNION SELECT 1 FROM statement_import_rows WHERE owner_id=? AND transaction_id=? UNION SELECT 1 FROM statement_decisions d JOIN statements s ON s.id=d.statement_id WHERE s.owner_id=? AND d.transaction_id=?").get(owner,id,owner,id,owner,id));
 const reconciled=Boolean(db.prepare("SELECT 1 FROM transactions t JOIN account_entries e ON e.transaction_id=t.id JOIN reconciliations r ON r.account_id=e.account_id AND r.owner_id=t.owner_id WHERE t.owner_id=? AND t.id=? AND r.state='finalized' AND t.posted_date BETWEEN r.period_start AND r.period_end").get(owner,id));
 const imports=(db.prepare("SELECT s.id,s.account_id,s.filename,e.raw_json FROM statement_decisions d JOIN statement_entries e ON e.id=d.entry_id JOIN statements s ON s.id=e.statement_id WHERE s.owner_id=? AND d.transaction_id=? ORDER BY s.id").all(owner,id) as {id:number;account_id:number;filename:string;raw_json:string}[]).map(({raw_json,...item})=>({...item,raw:JSON.parse(raw_json)}));
 return{...transactionText(record,imports.map(item=>item.raw)),is_installment:transactionType(record)==="installment"?1:0,imports,issued,source:source?"import":"manual",reconciliation_state:reconciled?"reconciled":"unreconciled",version:transactionVersion(owner,id),bill_linked:Boolean(db.prepare("SELECT 1 FROM bill_payments WHERE owner_id=? AND transaction_id=?").get(owner,id)),balance_impacts:db.prepare("SELECT a.id,a.name,-e.delta change FROM account_entries e JOIN accounts a ON a.id=e.account_id WHERE e.transaction_id=? AND a.owner_id=?").all(id,owner)};
}
function reversePaymentAllocations(owner:number,id:number,reason:string){
 const evidence=db.prepare("SELECT id FROM cc_payments WHERE owner_id=? AND transaction_id=?").all(owner,id) as {id:number}[];
 for(const p of evidence){
  db.prepare("UPDATE cc_statements SET tracking_confirmed=0 WHERE owner_id=? AND id IN (SELECT statement_id FROM cc_allocations WHERE payment_id=?)").run(owner,p.id);
  db.prepare("DELETE FROM cc_allocations WHERE payment_id=?").run(p.id);
  db.prepare("DELETE FROM cc_payment_evidence WHERE payment_id=?").run(p.id);
  db.prepare("UPDATE cc_payments SET transaction_id=NULL WHERE id=?").run(p.id);
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'credit-card.invalidate-payment',?,?)").run(owner,p.id,JSON.stringify({transactionId:id,reason}));
 }
 const rows=db.prepare("SELECT id FROM statement_payment_allocations WHERE owner_id=? AND transaction_id=? AND reversed_at IS NULL").all(owner,id) as {id:number}[];
 db.prepare("UPDATE statement_payment_allocations SET reversed_at=CURRENT_TIMESTAMP,reverse_reason=? WHERE owner_id=? AND transaction_id=? AND reversed_at IS NULL").run(reason,owner,id);
 for(const row of rows)db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'payment.reverse',?,?)").run(owner,row.id,JSON.stringify({reason,transactionId:id}));
}

function invalidateCoverage(owner:number,id:number){
 const accounts=db.prepare("SELECT account_id FROM account_entries WHERE transaction_id=?").all(id) as {account_id:number}[];
 for(const a of accounts){db.prepare("UPDATE accounts SET reconciliation_stale=1 WHERE owner_id=? AND id=?").run(owner,a.account_id);db.prepare("UPDATE statement_imports SET reconciliation_stale=1 WHERE owner_id=? AND account_id=?").run(owner,a.account_id);db.prepare("UPDATE csv_import_batches SET reconciliation_stale=1 WHERE owner_id=? AND account_id=?").run(owner,a.account_id);}
}
export function voidTransaction(ownerId:number,id:number,expected?:string){return atomic(()=>{
 const row=db.prepare("SELECT * FROM transactions WHERE owner_id=? AND id=? AND voided_at IS NULL").get(ownerId,id);if(!row)throw Error("Transaction not found");
 if(expected!==undefined&&transactionVersion(ownerId,id)!==expected)throw Error("This transaction changed. Reload and review before deleting.");

 db.prepare("UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").run(id,ownerId);
 reversePaymentAllocations(ownerId,id,"Payment voided; allocation no longer usable");
 db.prepare("DELETE FROM bill_payments WHERE owner_id=? AND transaction_id=?").run(ownerId,id);invalidateCoverage(ownerId,id);
 db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,'transaction.void',?)").run(ownerId,id);return{ok:true};
});}
export function correctTransaction(owner:number,id:number,input:LedgerInput,expected:string){return atomic(()=>{
 input=accountingInput(input);
 const prior=db.prepare("SELECT * FROM transactions WHERE owner_id=? AND id=?").get(owner,id) as any;if(!prior)throw Error("Transaction not found");
 if(!input||typeof input.idempotencyKey!=="string")throw Error("Invalid transaction");
 const retry=db.prepare("SELECT id,replaces_id FROM transactions WHERE owner_id=? AND idempotency_key=?").get(owner,input?.idempotencyKey) as any;
 if(retry){if(retry.replaces_id!==id)throw Error("Request key already used for another correction");return createTransaction(owner,input);}
 if(prior.voided_at||typeof expected!=="string"||transactionVersion(owner,id)!==expected)throw Error("This transaction changed. Reload and review before editing.");

 if(["opening","adjustment"].includes(prior.kind)&&(input.kind!==prior.kind||input.accountId!==prior.account_id))throw Error("Opening balances and adjustments must keep their type and account.");
 if(!["opening","adjustment"].includes(prior.kind)&&["opening","adjustment"].includes(input.kind))throw Error("Choose income, expense, refund or transfer for this correction.");
 const payment=db.prepare("SELECT b.* FROM bills b JOIN bill_payments p ON p.bill_id=b.id WHERE p.owner_id=? AND p.transaction_id=?").get(owner,id) as any;
 if(payment){if(payment.payment_kind==="expense"&&input.kind!=="expense")throw Error("This bill payment must remain an expense. Choose expense or delete the payment first.");
 if(payment.payment_kind==="credit_repayment"&&(input.kind!=="transfer"||input.counterAccountId!==payment.account_id||!db.prepare("SELECT 1 FROM accounts WHERE owner_id=? AND id=? AND type IN('cash','bank','wallet')").get(owner,input.accountId)))throw Error("This repayment must transfer from cash, bank or wallet into the original credit card.");}
 db.prepare("UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").run(id,owner);
 reversePaymentAllocations(owner,id,"Payment corrected; explicitly allocate replacement payment");
 const replacement=createTransaction(owner,input);db.prepare("UPDATE transactions SET replaces_id=? WHERE id=? AND owner_id=?").run(id,replacement.id,owner);
 if(payment){db.prepare("UPDATE bill_payments SET transaction_id=? WHERE owner_id=? AND transaction_id=?").run(replacement.id,owner,id);db.prepare("UPDATE bills SET amount=?,account_id=?,category_id=? WHERE owner_id=? AND id=?").run(currencySnapshot(input).amount,payment.payment_kind==="expense"?input.accountId:payment.account_id,input.categoryId??null,owner,payment.id);}

 invalidateCoverage(owner,id);invalidateCoverage(owner,replacement.id);
 for(const table of ["statement_import_rows","csv_import_rows"])db.prepare("UPDATE "+table+" SET transaction_id=? WHERE owner_id=? AND transaction_id=?").run(replacement.id,owner,id);
 db.prepare("UPDATE statement_decisions SET transaction_id=? WHERE transaction_id=? AND statement_id IN(SELECT id FROM statements WHERE owner_id=?)").run(replacement.id,id,owner);
 db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'transaction.correct',?,?)").run(owner,replacement.id,JSON.stringify({replaces_id:id}));return replacement;
});}
export function resolveTransaction(owner:number,id:number):number {
 if(!db.prepare("SELECT 1 FROM transactions WHERE owner_id=? AND id=?").get(owner,id))return id;
 let current=id;while(true){const next=db.prepare("SELECT id FROM transactions WHERE owner_id=? AND replaces_id=? ORDER BY id DESC LIMIT 1").get(owner,current) as {id:number}|undefined;if(!next)return current;current=next.id;}
}
