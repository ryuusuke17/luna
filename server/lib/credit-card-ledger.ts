import {createHash} from "node:crypto";
import {z} from "zod";
import {db} from "./db.ts";
import "./credit-card-statements.ts";
import {createTransaction,resolveTransaction,transactionVersion} from "./ledger.ts";
import {convertToPHP} from "../../src/lib/finance.ts";
import {historyConflict} from "./account-history.ts";

type Line={id:number;statement_id:number;card_id:number;currency:string;amount:number;post_date:string;source_json:string;superseded_by:number|null;archived_at:string|null;opening_date:string};
type Transaction={id:number;kind:string;posted_date:string;amount:number;original_currency:string;original_amount:number;exchange_rate:string;account_id:number;counter_account_id:number|null;delta:number;merchant:string;description:string;voided_at:string|null};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function line(owner:number,statementId:number,lineId:number){
 const found=db.prepare("SELECT l.*,s.card_id,s.currency,s.superseded_by,a.archived_at,a.opening_date FROM cc_statement_lines l JOIN cc_statements s ON s.id=l.statement_id JOIN accounts a ON a.id=s.card_id AND a.owner_id=s.owner_id WHERE s.owner_id=? AND s.id=? AND l.id=? AND a.type='credit_card'").get(owner,statementId,lineId) as Line|undefined;
 if(!found)throw Error("Statement line unavailable");return found;
}
function transaction(owner:number,card:number,id:number){return db.prepare("SELECT t.*,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND t.id=? AND e.account_id=?").get(owner,id,card) as Transaction|undefined;}
function compatible(owner:number,l:Line,t:Transaction|undefined,classification:string,funding?:number){
 if(!t||t.voided_at||Math.abs(Date.parse(t.posted_date)-Date.parse(l.post_date))>7*86400000)return false;
 if(l.amount===0||t.original_currency!==l.currency||t.original_amount!==Math.abs(l.amount))return false;
 if((l.amount>0&&t.delta>=0)||(l.amount<0&&t.delta<=0)||Math.abs(t.delta)!==t.amount)return false;
 try{if(convertToPHP(t.original_amount,t.original_currency,t.exchange_rate)!==t.amount)return false;}catch{return false;}
 if(classification==="payment")return l.amount<0&&t.kind==="transfer"&&t.counter_account_id===l.card_id&&(!funding||t.account_id===funding)&&Boolean(db.prepare("SELECT 1 FROM accounts WHERE owner_id=? AND id=? AND type IN ('cash','bank','wallet')").get(owner,t.account_id));
 return t.account_id===l.card_id&&t.kind===(l.amount>0?"expense":"refund")&&classification===(l.amount>0?"expense":"refund");
}
function current(owner:number,l:Line){
 const decision=db.prepare("SELECT * FROM cc_line_decisions WHERE line_id=?").get(l.id) as {transaction_id:number|null;action:string;classification:string;reason:string;request_key:string;request_json:string}|undefined;
 const resolved=decision?.transaction_id?resolveTransaction(owner,decision.transaction_id):null;
 const linked=resolved?transaction(owner,l.card_id,resolved):undefined;
 const valid=decision?.action==="skip"||Boolean(decision&&compatible(owner,l,linked,decision.classification));
 return{decision:decision?{action:decision.action,classification:decision.classification,reason:decision.reason,transactionId:decision.transaction_id,resolvedTransactionId:resolved,valid}:null,version:hash([l,decision,linked])};
}
export function creditCardLedgerReview(owner:number,statementId:number,lineId:number){
 const l=line(owner,statementId,lineId),state=current(owner,l);
 const candidates=(db.prepare("SELECT t.*,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND e.account_id=? AND t.voided_at IS NULL AND t.original_currency=? AND t.original_amount=? AND t.posted_date BETWEEN date(?,'-7 days') AND date(?,'+7 days') ORDER BY t.posted_date DESC,t.id DESC").all(owner,l.card_id,l.currency,Math.abs(l.amount),l.post_date,l.post_date) as Transaction[]).filter(t=>compatible(owner,l,t,t.kind==="transfer"?"payment":l.amount>0?"expense":"refund")).map(t=>({id:t.id,date:t.posted_date,kind:t.kind,merchant:t.merchant,description:t.description,amount:t.amount,fundingAccountId:t.kind==="transfer"?t.account_id:null,version:transactionVersion(owner,t.id)}));
 return{...state,candidates,readOnly:Boolean(l.archived_at||l.superseded_by),foreign:l.currency!=="PHP",preHistory:l.post_date<l.opening_date};
}
const id=z.number().int().positive().safe();
const review=z.object({action:z.literal("review-line"),lineId:id,decision:z.enum(["link","import","skip"]),classification:z.enum(["expense","refund","payment","excluded"]),reason:z.string().trim().max(2000),transactionId:id.optional(),transactionVersion:z.string().regex(/^[a-f0-9]{64}$/).optional(),fundingAccountId:id.optional(),categoryId:id.optional(),version:z.string().regex(/^[a-f0-9]{64}$/),requestKey:z.string().uuid(),acknowledgeSimilar:z.boolean().optional()}).strict();
export function reviewCreditCardLine(owner:number,statementId:number,input:unknown){
 const v=review.parse(input);
 return db.transaction(()=>{
  const l=line(owner,statementId,v.lineId),request=JSON.stringify(v);
  const prior=db.prepare("SELECT line_id,request_json FROM cc_line_decisions WHERE actor_id=? AND request_key=?").get(owner,v.requestKey) as {line_id:number;request_json:string}|undefined;
  if(prior){if(prior.line_id!==v.lineId||prior.request_json!==request)throw Error("Request key already used for another review");return{ok:true};}
  const state=current(owner,l);
  if(l.archived_at||l.superseded_by)throw Error("Archived accounts and superseded issues are read-only");
  if(state.version!==v.version)throw Error("Review changed. Reload candidates before approving.");
  if(state.decision?.valid)throw Error("This source line is already reviewed. Correct its ledger transaction instead.");
  let transactionId:number|null=state.decision?.transactionId??null;
  if(v.decision==="skip"){
   if(!v.reason||v.classification!=="excluded")throw Error("Exclusion requires a reason and excluded classification");
  }else{
   if(v.classification!== (l.amount>0?"expense":v.classification)||l.amount===0||!['expense','refund','payment'].includes(v.classification)||l.amount<0&&v.classification==="expense")throw Error("Classify charges as expenses; negative lines as refund or payment");
   if(l.post_date<l.opening_date)throw Error("Source date predates account history. Review Extend issued-source history in this statement before approving; source dates cannot change.");
   if(v.decision==="link"){
    const t=v.transactionId?transaction(owner,l.card_id,v.transactionId):undefined;
    if(!t||!v.transactionVersion||transactionVersion(owner,t.id)!==v.transactionVersion||!compatible(owner,l,t,v.classification,v.fundingAccountId))throw Error("Candidate changed or incompatible: review owner, card, signed original amount, currency, date, type and funding source");
    if(db.prepare("SELECT 1 FROM cc_line_decisions d JOIN cc_statement_lines x ON x.id=d.line_id WHERE x.statement_id=? AND d.line_id<>? AND d.transaction_id=?").get(statementId,l.id,t.id))throw Error("This transaction is already linked to another row in this issue; repeated purchases need separate transactions");
    transactionId=t.id;
   }else{
    if(l.currency!=="PHP")throw Error("Foreign lines are reference-only. Link an existing ledger conversion; no new foreign posting is allowed.");
    if(state.decision?.transactionId)throw Error("Source identity remains reserved after correction or void. Link a reviewed replacement or exclude with a reason; do not repost.");
    if(db.prepare("SELECT 1 FROM cc_line_decisions d JOIN cc_statement_lines x ON x.id=d.line_id JOIN cc_statements s ON s.id=x.statement_id WHERE s.owner_id=? AND s.card_id=? AND s.currency=? AND s.superseded_by IS NOT NULL AND x.post_date=? AND x.amount=? AND json_extract(x.source_json,'$.merchantRaw')=json_extract(?,'$.merchantRaw') AND d.transaction_id IS NOT NULL").get(owner,l.card_id,l.currency,l.post_date,l.amount,l.source_json))throw Error("Superseded evidence reserves this activity. Review existing transactions and explicitly link; do not repost.");
    if(creditCardLedgerReview(owner,statementId,l.id).candidates.length&&(!v.acknowledgeSimilar||!v.reason))throw Error("Similar ledger activity exists. Link it or explicitly confirm a separate purchase with a reason.");
    if(v.classification==="payment"&&(!v.fundingAccountId||!db.prepare("SELECT 1 FROM accounts WHERE owner_id=? AND id=? AND archived_at IS NULL AND type IN ('cash','bank','wallet')").get(owner,v.fundingAccountId)))throw Error("Payment requires an owned active cash, bank or wallet funding account");
    const source=JSON.parse(l.source_json);
    const sourceType=source.typeRaw.trim().toLowerCase();
    transactionId=createTransaction(owner,{kind:v.classification==="payment"?"transfer":v.classification as "expense"|"refund",...(v.classification==="expense"&&sourceType?{isInstallment:/^instalments?$|^installments?$/.test(sourceType)}:{}),date:l.post_date,amount:Math.abs(l.amount),accountId:v.classification==="payment"?v.fundingAccountId!:l.card_id,counterAccountId:v.classification==="payment"?l.card_id:undefined,categoryId:v.classification==="payment"?undefined:v.categoryId,merchant:source.merchantRaw.slice(0,240),notes:source.transactionNotesRaw.slice(0,500),idempotencyKey:`cc-line:${l.id}`}).id;
   }
  }
  db.prepare("INSERT INTO cc_line_decisions(line_id,transaction_id,action,classification,reason,actor_id,request_key,request_json,version) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(line_id) DO UPDATE SET transaction_id=excluded.transaction_id,action=excluded.action,classification=excluded.classification,reason=excluded.reason,actor_id=excluded.actor_id,request_key=excluded.request_key,request_json=excluded.request_json,version=excluded.version,updated_at=CURRENT_TIMESTAMP").run(l.id,transactionId,v.decision,v.classification,v.reason,owner,v.requestKey,request,v.version);
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'credit-card.review',?,?)").run(owner,statementId,JSON.stringify({previous:state.decision,...v,transactionId}));
  return{ok:true};
 }).immediate();
}
const paymentLink=z.object({action:z.literal("link-payment"),paymentId:id,transactionId:id,transactionVersion:z.string().regex(/^[a-f0-9]{64}$/),version:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function creditCardPaymentVersion(owner:number,paymentId:number){return hash(db.prepare("SELECT * FROM cc_payments WHERE owner_id=? AND id=?").get(owner,paymentId));}
export function linkCreditCardPayment(owner:number,statementId:number,input:unknown){
 const v=paymentLink.parse(input);
 return db.transaction(()=>{
  const p=db.prepare("SELECT p.*,a.archived_at FROM cc_payments p JOIN accounts a ON a.id=p.card_id JOIN cc_statements s ON s.card_id=p.card_id AND s.owner_id=p.owner_id WHERE p.owner_id=? AND p.id=? AND s.id=? AND s.superseded_by IS NULL AND a.type='credit_card'").get(owner,v.paymentId,statementId) as {card_id:number;amount:number;currency:string;payment_date:string;source_account_id:number|null;transaction_id:number|null;archived_at:string|null}|undefined;
  if(!p||p.archived_at||!p.source_account_id)throw Error("Payment requires an active card and explicit owned funding source");
  if(p.transaction_id===v.transactionId)return{ok:true};
  if(creditCardPaymentVersion(owner,v.paymentId)!==v.version)throw Error("Payment changed. Reload before linking.");
  const t=transaction(owner,p.card_id,v.transactionId);
  if(!t||transactionVersion(owner,t.id)!==v.transactionVersion||!compatible(owner,{card_id:p.card_id,amount:-p.amount,currency:p.currency,post_date:p.payment_date} as Line,t,"payment",p.source_account_id))throw Error("Choose the same owned transfer, amount, original currency, funding account and compatible date");
  db.prepare("UPDATE cc_payments SET transaction_id=? WHERE id=? AND owner_id=?").run(t.id,v.paymentId,owner);
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'credit-card.link-payment',?,?)").run(owner,statementId,JSON.stringify(v));return{ok:true};
 }).immediate();
}

export function issuedHistoryExtension(owner:number,statementId:number){
 const s=db.prepare("SELECT s.id,s.card_id,s.file_hash,s.source_bytes,s.superseded_by,a.opening_date,a.archived_at FROM cc_statements s JOIN accounts a ON a.id=s.card_id AND a.owner_id=s.owner_id WHERE s.owner_id=? AND s.id=? AND a.type='credit_card'").get(owner,statementId) as {id:number;card_id:number;file_hash:string;source_bytes:Buffer;superseded_by:number|null;opening_date:string;archived_at:string|null}|undefined;
 if(!s)throw Error("Statement unavailable");
 const rows=db.prepare("SELECT l.id,l.post_date FROM cc_statement_lines l LEFT JOIN cc_line_decisions d ON d.line_id=l.id WHERE l.statement_id=? AND l.post_date<? AND d.line_id IS NULL ORDER BY l.post_date,l.id").all(statementId,s.opening_date) as {id:number;post_date:string}[];
 if(!rows.length)return null;
 const conflict=s.superseded_by?"Superseded issues cannot extend history.":historyConflict(owner,{id:s.card_id,archived_at:s.archived_at})||(createHash("sha256").update(s.source_bytes).digest("hex")!==s.file_hash?"Source integrity mismatch. Restore original evidence before extending history.":"");
 return {openingDate:s.opening_date,proposedDate:rows[0].post_date,affectedRows:rows.length,sourceDates:[...new Set(rows.map(r=>r.post_date))],allowed:!conflict,conflict,version:hash([s.id,s.card_id,s.file_hash,s.opening_date,s.archived_at,s.superseded_by,rows,conflict])};
}
const extensionInput=z.object({action:z.literal("extend-history"),version:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function extendIssuedHistory(owner:number,statementId:number,input:unknown){
 const v=extensionInput.parse(input);
 return db.transaction(()=>{
  const extension=issuedHistoryExtension(owner,statementId);
  if(!extension||extension.version!==v.version)throw Error("Statement or account changed. Reload before extending history.");
  if(!extension.allowed)throw Error(extension.conflict);
  db.prepare("UPDATE accounts SET opening_date=? WHERE owner_id=? AND id=(SELECT card_id FROM cc_statements WHERE owner_id=? AND id=?)").run(extension.proposedDate,owner,owner,statementId);
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,'credit-card.extend-history',?,?)").run(owner,statementId,JSON.stringify(extension));
  return {ok:true,message:"History extended. Source dates and balances unchanged. Review each posting separately."};
 }).immediate();
}
export function creditCardPaymentCandidates(owner:number,statementId:number,paymentId:number){
 const p=db.prepare("SELECT p.*,a.archived_at,s.superseded_by FROM cc_payments p JOIN cc_statements s ON s.card_id=p.card_id AND s.owner_id=p.owner_id JOIN accounts a ON a.id=s.card_id AND a.owner_id=s.owner_id WHERE p.owner_id=? AND p.id=? AND s.id=? AND a.type='credit_card'").get(owner,paymentId,statementId) as {card_id:number;amount:number;currency:string;payment_date:string;source_account_id:number|null;transaction_id:number|null;archived_at:string|null;superseded_by:number|null}|undefined;
 if(!p)throw Error("Payment unavailable");
 if(p.archived_at||p.superseded_by||p.transaction_id||!p.source_account_id)return [];
 return (db.prepare("SELECT t.*,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND e.account_id=? AND t.voided_at IS NULL AND t.kind='transfer' AND t.posted_date BETWEEN date(?,'-7 days') AND date(?,'+7 days') AND NOT EXISTS(SELECT 1 FROM cc_payments other WHERE other.transaction_id=t.id) ORDER BY t.posted_date DESC,t.id DESC").all(owner,p.card_id,p.payment_date,p.payment_date) as Transaction[])
 .filter(t=>compatible(owner,{card_id:p.card_id,amount:-p.amount,currency:p.currency,post_date:p.payment_date} as Line,t,"payment",p.source_account_id!))
 .map(t=>({id:t.id,posted_date:t.posted_date,description:t.description,version:transactionVersion(owner,t.id)}));
}
