import {db} from "./db.ts";
import {statementDetail} from "./statements.ts";

export function statementPayments(owner:number,id:number){
 const s=statementDetail(owner,id),allocations=db.prepare("SELECT p.*,t.posted_date,t.description,t.voided_at,a.name source_name FROM statement_payment_allocations p JOIN transactions t ON t.id=p.transaction_id JOIN accounts a ON a.id=t.account_id WHERE p.owner_id=? AND p.statement_id=? ORDER BY p.id").all(owner,id) as any[];
 const applied=allocations.filter(p=>!p.reversed_at&&!p.voided_at).reduce((n,p)=>n+p.amount,0),original=s.summary?.outstandingBalance;
 const available=db.prepare("SELECT t.id,t.posted_date,t.amount,t.description,a.name source_name,t.amount-COALESCE((SELECT SUM(p.amount) FROM statement_payment_allocations p WHERE p.owner_id=t.owner_id AND p.transaction_id=t.id AND p.reversed_at IS NULL),0) available FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.owner_id=? AND t.kind='transfer' AND t.counter_account_id=? AND a.type IN('cash','bank','wallet') AND t.voided_at IS NULL ORDER BY t.posted_date DESC,t.id DESC").all(owner,s.account_id);
 return{allocations,available,original:original??null,applied,remaining:original===undefined?null:Math.max(0,original-applied)};
}
export function allocatePayment(owner:number,id:number,input:{transactionId:number;amount:number;requestKey:string}){return db.transaction(()=>{
 if(!input||!Number.isSafeInteger(input.transactionId)||input.transactionId<1||!Number.isSafeInteger(input.amount)||input.amount<=0||typeof input.requestKey!=="string"||!/^[a-zA-Z0-9-]{1,100}$/.test(input.requestKey))throw Error("Invalid payment allocation");
 const prior=db.prepare("SELECT * FROM statement_payment_allocations WHERE owner_id=? AND request_key=?").get(owner,input.requestKey) as any;if(prior){if(prior.statement_id!==id||prior.transaction_id!==input.transactionId||prior.amount!==input.amount||prior.reversed_at)throw Error("Allocation request key already used");return{id:prior.id};}
 const s=statementDetail(owner,id);if(s.account_type!=="credit_card"||s.summary?.outstandingBalance===undefined)throw Error("Allocation requires a credit-card statement with an original balance");
 const p=statementPayments(owner,id),t=(p.available as any[]).find(t=>t.id===input.transactionId);if(!t||input.amount>t.available)throw Error("Allocation exceeds this payment's available amount");if(input.amount>(p.remaining??0))throw Error("Allocation exceeds the statement's remaining balance");
 const result=db.prepare("INSERT INTO statement_payment_allocations(owner_id,statement_id,transaction_id,amount,request_key) VALUES(?,?,?,?,?)").run(owner,id,input.transactionId,input.amount,input.requestKey);
 db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'payment.allocate',?,?)").run(owner,Number(result.lastInsertRowid),JSON.stringify({statementId:id,transactionId:input.transactionId,amount:input.amount}));return{id:Number(result.lastInsertRowid)};
 }).immediate();}
export function reverseAllocation(owner:number,id:number,allocationId:number,reason:string){return db.transaction(()=>{
 if(!Number.isSafeInteger(allocationId)||allocationId<1||typeof reason!=="string"||!reason.trim()||reason.length>500)throw Error("Allocation reversal requires a reason");
 const result=db.prepare("UPDATE statement_payment_allocations SET reversed_at=CURRENT_TIMESTAMP,reverse_reason=? WHERE owner_id=? AND statement_id=? AND id=? AND reversed_at IS NULL").run(reason.trim(),owner,id,allocationId);if(!result.changes)throw Error("Active allocation unavailable");
 db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'payment.reverse',?,?)").run(owner,allocationId,JSON.stringify({reason:reason.trim()}));return{ok:true};
 }).immediate();}
