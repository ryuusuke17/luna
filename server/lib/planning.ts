import {createHash,randomUUID} from "node:crypto";
import { atomic, db } from "./db.ts";
import { createTransaction } from "./ledger.ts";
import { isCalendarDate, parseMoney, currencyDigits } from "../../src/lib/finance.ts";

function id(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) <= 0) throw Error("Invalid record ID"); return Number(value); }
function text(value: unknown, limit: number, required = false): string { if (typeof value !== "string" || value.length > limit || required && !value.trim()) throw Error("Invalid text"); return value.trim(); }
function money(value: unknown): number { if (typeof value !== "string") throw Error("Amount must be a decimal string"); const n = parseMoney(value); if (n <= 0) throw Error("Amount must be positive"); return n; }
function date(value: unknown): string { if (typeof value !== "string" || !isCalendarDate(value)) throw Error("Invalid calendar date"); return value; }
function account(owner: number, value: unknown) { const record = db.prepare("SELECT * FROM accounts WHERE owner_id=? AND id=? AND archived_at IS NULL").get(owner, id(value)) as {id:number;type:string}|undefined; if (!record) throw Error("Account unavailable"); return record; }
function category(owner: number, value: unknown, kind: string) { const record = db.prepare("SELECT id FROM categories WHERE owner_id=? AND id=? AND kind=? AND archived_at IS NULL").get(owner, id(value), kind); if (!record) throw Error("Category unavailable or type mismatch"); return Number(value); }
function audit(owner: number, action: string, entity: number) { db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,?,?)").run(owner, action, entity); }

export function listBills(owner: number) { return db.prepare("SELECT b.*,a.name account_name,c.name category_name,p.transaction_id,t.posted_date payment_date,t.voided_at payment_voided FROM bills b LEFT JOIN accounts a ON a.id=b.account_id AND a.owner_id=b.owner_id LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN bill_payments p ON p.bill_id=b.id AND p.owner_id=b.owner_id LEFT JOIN transactions t ON t.id=p.transaction_id WHERE b.owner_id=? ORDER BY b.due_date,b.id").all(owner); }
export function saveBill(owner: number, body: any) {
 if (!body || typeof body !== "object") throw Error("Invalid bill");
 const name=text(body.name,80,true), amount=money(body.amount), due=date(body.dueDate), paymentKind=body.paymentKind??"expense", a=body.accountId===undefined||body.accountId===null||body.accountId===""?null:account(owner,body.accountId), cat=paymentKind==="credit_repayment"?null:category(owner,body.categoryId,"expense"), notes=text(body.notes??"",240);
 if(!["expense","credit_repayment"].includes(paymentKind)||paymentKind==="credit_repayment"&&a&&a.type!=="credit_card")throw Error("Credit repayment requires a credit card");
 if (!["once","monthly","quarterly","yearly"].includes(body.cadence)) throw Error("Invalid reminder preference");
 return atomic(()=>{let record:number;
 if(body.id!==undefined){record=id(body.id);if(db.prepare("SELECT 1 FROM bill_payments WHERE bill_id=? AND owner_id=?").get(record,owner))throw Error("Paid reminders cannot be edited");const changed=db.prepare("UPDATE bills SET name=?,amount=?,due_date=?,account_id=COALESCE(?,account_id),category_id=?,cadence=?,notes=?,payment_kind=? WHERE id=? AND owner_id=?").run(name,amount,due,a?.id??null,cat,body.cadence,notes,paymentKind,record,owner);if(!changed.changes)throw Error("Bill unavailable");}
 else record=Number(db.prepare("INSERT INTO bills(owner_id,name,amount,due_date,account_id,category_id,cadence,notes,payment_kind) VALUES(?,?,?,?,?,?,?,?,?)").run(owner,name,amount,due,a?.id??null,cat,body.cadence,notes,paymentKind).lastInsertRowid);
 audit(owner,"bill.save",record);return{id:record};});
}
export function payBill(owner: number, body: any) {
 if(!body||typeof body!=="object")throw Error("Invalid payment");const billId=id(body.billId),posted=date(body.date);
 return atomic(()=>{const bill=db.prepare("SELECT * FROM bills WHERE id=? AND owner_id=?").get(billId,owner) as {id:number;name:string;amount:number;account_id:number|null;category_id:number|null;payment_kind:string}|undefined;if(!bill)throw Error("Bill unavailable");
 const previous=db.prepare("SELECT transaction_id FROM bill_payments WHERE bill_id=? AND owner_id=?").get(billId,owner) as {transaction_id:number}|undefined;if(previous)return{id:previous.transaction_id,duplicate:true};
 const accountId=body.accountId??bill.account_id;if(accountId===null||accountId===undefined||accountId==="")throw Error("Choose an account for this payment");const a=account(owner,accountId);let source=a.id,counter:number|undefined;
 if(bill.payment_kind==="credit_repayment"){if(a.type!=="credit_card")throw Error("Credit repayment account unavailable");const funding=account(owner,body.fundingAccountId);if(!["cash","bank","wallet"].includes(funding.type)||funding.id===a.id)throw Error("Select a distinct cash, bank, or wallet funding account");source=funding.id;counter=a.id;}
 const tx=createTransaction(owner,{kind:counter?"transfer":"expense",date:posted,amount:bill.amount,accountId:source,counterAccountId:counter,categoryId:counter?undefined:bill.category_id,description:bill.name,idempotencyKey:`bill:${billId}:payment:${randomUUID()}`});db.prepare("UPDATE bills SET account_id=? WHERE owner_id=? AND id=?").run(a.id,owner,billId);
 db.prepare("INSERT INTO bill_payments(bill_id,owner_id,transaction_id) VALUES(?,?,?)").run(billId,owner,tx.id);audit(owner,"bill.payment",billId);return{...tx,duplicate:false};});
}
export function listGoals(owner: number) { const goals=db.prepare("SELECT g.*,COALESCE((SELECT SUM(amount) FROM goal_contributions WHERE goal_id=g.id AND owner_id=g.owner_id),0) allocated FROM goals g WHERE g.owner_id=? ORDER BY g.id DESC").all(owner) as any[];return goals.map(g=>{const record={...g,contributions:db.prepare("SELECT * FROM goal_contributions WHERE owner_id=? AND goal_id=? ORDER BY posted_date DESC,id DESC").all(owner,g.id)};return{...record,version:createHash("sha256").update(JSON.stringify(record)).digest("hex")};}); }
export function saveGoal(owner: number, body: any) {
 if(!body||typeof body!=="object")throw Error("Invalid goal");const name=text(body.name,80,true),target=money(body.target),due=body.dueDate?date(body.dueDate):null,notes=text(body.notes??"",240);
 return atomic(()=>{let record:number;if(body.id!==undefined){record=id(body.id);const prior=listGoals(owner).find(g=>g.id===record);if(!prior)throw Error("Goal unavailable");if(body.version!==prior.version)throw Error("This goal changed. Reload and review before saving.");if(!db.prepare("UPDATE goals SET name=?,target=?,due_date=?,notes=? WHERE owner_id=? AND id=?").run(name,target,due,notes,owner,record).changes)throw Error("Goal unavailable");}else record=Number(db.prepare("INSERT INTO goals(owner_id,name,target,due_date,notes) VALUES(?,?,?,?,?)").run(owner,name,target,due,notes).lastInsertRowid);audit(owner,"goal.save",record);return{id:record};});
}
export function contribute(owner: number, body: any) {
 if(!body||typeof body!=="object")throw Error("Invalid allocation");const goal=id(body.goalId),amount=money(body.amount),posted=date(body.date),notes=text(body.notes??"",240),key=text(body.requestKey,100,true);if(posted>new Date().toISOString().slice(0,10))throw Error("Allocation date cannot be in the future");
 return atomic(()=>{if(!db.prepare("SELECT 1 FROM goals WHERE id=? AND owner_id=?").get(goal,owner))throw Error("Goal unavailable");const previous=db.prepare("SELECT id,goal_id,amount,posted_date,notes FROM goal_contributions WHERE owner_id=? AND request_key=?").get(owner,key) as any;if(previous){if(previous.goal_id!==goal||previous.amount!==amount||previous.posted_date!==posted||previous.notes!==notes)throw Error("Request key already used for another allocation");return{id:previous.id,duplicate:true};}const total=(db.prepare("SELECT COALESCE(SUM(amount),0) n FROM goal_contributions WHERE owner_id=? AND goal_id=?").get(owner,goal) as {n:number}).n;if(!Number.isSafeInteger(total+amount))throw Error("Total allocation is too large");const record=Number(db.prepare("INSERT INTO goal_contributions(owner_id,goal_id,amount,posted_date,notes,request_key) VALUES(?,?,?,?,?,?)").run(owner,goal,amount,posted,notes,key).lastInsertRowid);audit(owner,"goal.contribute",record);return{id:record,duplicate:false};});
}
export function deleteGoalContribution(owner:number,record:number,goalRecord:number,expected:string){return atomic(()=>{
 const goalId=id(goalRecord),contributionId=id(record),goal=listGoals(owner).find(g=>g.id===goalId);if(!goal)throw Error("Goal unavailable");
 if(goal.version!==expected)throw Error("This goal changed. Reload and review before deleting.");
 if(!db.prepare("SELECT 1 FROM goal_contributions WHERE id=? AND owner_id=? AND goal_id=?").get(contributionId,owner,goalId))throw Error("Contribution unavailable");
 if(!db.prepare("DELETE FROM goal_contributions WHERE id=? AND owner_id=? AND goal_id=?").run(contributionId,owner,goalId).changes)throw Error("Contribution unavailable");
 audit(owner,"goal.contribution.delete",contributionId);return{ok:true};
});}
export function editGoalContribution(owner:number,record:number,goalRecord:number,expected:string,body:unknown){
 if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid contribution");
 const payload=body as Record<string,unknown>,goalId=id(goalRecord),contributionId=id(record),amount=money(payload.amount),posted=date(payload.date),notes=text(payload.notes??"",240);
 if(posted>new Date().toISOString().slice(0,10))throw Error("Contribution date cannot be in the future");
 return atomic(()=>{
  const goal=listGoals(owner).find(g=>g.id===goalId);if(!goal)throw Error("Goal unavailable");
  if(goal.version!==expected)throw Error("This goal changed. Reload and review before editing.");
  if(!db.prepare("SELECT 1 FROM goal_contributions WHERE id=? AND owner_id=? AND goal_id=?").get(contributionId,owner,goalId))throw Error("Contribution unavailable");
  if(!db.prepare("UPDATE goal_contributions SET amount=?,posted_date=?,notes=? WHERE id=? AND owner_id=? AND goal_id=?").run(amount,posted,notes,contributionId,owner,goalId).changes)throw Error("Contribution unavailable");
  audit(owner,"goal.contribution.edit",contributionId);return{ok:true};
 });
}
export function preferences(owner: number) { return db.prepare("SELECT shortcuts,bill_alerts,budget_alerts,goal_alerts,default_transaction_currency FROM workspace_preferences WHERE owner_id=?").get(owner) ?? {shortcuts:1,bill_alerts:1,budget_alerts:1,goal_alerts:1,default_transaction_currency:"PHP"}; }
export function savePreferences(owner: number, body: any) {
 if(!body||!["shortcuts","bill_alerts","budget_alerts","goal_alerts"].every(k=>typeof body[k]==="boolean"))throw Error("Invalid preferences");
 const currency=body.default_transaction_currency??(preferences(owner) as any).default_transaction_currency;currencyDigits(currency);
 return atomic(()=>{db.prepare("INSERT INTO workspace_preferences(owner_id,shortcuts,bill_alerts,budget_alerts,goal_alerts,default_transaction_currency) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET shortcuts=excluded.shortcuts,bill_alerts=excluded.bill_alerts,budget_alerts=excluded.budget_alerts,goal_alerts=excluded.goal_alerts,default_transaction_currency=excluded.default_transaction_currency").run(owner,...["shortcuts","bill_alerts","budget_alerts","goal_alerts"].map(k=>Number(body[k])),currency);audit(owner,"preferences.save",owner);return preferences(owner);});
}
export function deleteGoal(owner:number,record:number,expected:string){return atomic(()=>{
 const goal=listGoals(owner).find(g=>g.id===record);if(!goal)throw Error("Goal unavailable");
 if(goal.version!==expected)throw Error("This goal changed. Reload and review before deleting.");
 db.prepare("DELETE FROM goal_contributions WHERE owner_id=? AND goal_id=?").run(owner,record);
 db.prepare("DELETE FROM goals WHERE owner_id=? AND id=?").run(owner,record);audit(owner,"goal.delete",record);return{ok:true};
});}
export function saveRule(owner: number, body: any) { if(!body||!["income","expense"].includes(body.kind)||!Number.isSafeInteger(body.priority)||Math.abs(body.priority)>10000||typeof body.enabled!=="boolean")throw Error("Invalid merchant rule");const phrase=text(body.phrase,100,true),cat=category(owner,body.categoryId,body.kind);return atomic(()=>{let record:number;if(body.id!==undefined){record=id(body.id);if(!db.prepare("UPDATE merchant_rules SET phrase=?,category_id=?,kind=?,priority=?,enabled=? WHERE owner_id=? AND id=?").run(phrase,cat,body.kind,body.priority,Number(body.enabled),owner,record).changes)throw Error("Rule unavailable");}else record=Number(db.prepare("INSERT INTO merchant_rules(owner_id,phrase,category_id,kind,priority,enabled) VALUES(?,?,?,?,?,?)").run(owner,phrase,cat,body.kind,body.priority,Number(body.enabled)).lastInsertRowid);audit(owner,"rule.save",record);return{id:record};}); }
export function saveProvider(owner: number, body: any) { if(!body)throw Error("Invalid provider");const name=text(body.name,80,true),cat=body.categoryId?category(owner,body.categoryId,"expense"):null;return atomic(()=>{let record:number;if(body.id!==undefined){record=id(body.id);if(!db.prepare("UPDATE service_providers SET name=?,category_id=? WHERE owner_id=? AND id=?").run(name,cat,owner,record).changes)throw Error("Provider unavailable");}else record=Number(db.prepare("INSERT INTO service_providers(owner_id,name,category_id) VALUES(?,?,?)").run(owner,name,cat).lastInsertRowid);audit(owner,"provider.save",record);return{id:record};}); }
