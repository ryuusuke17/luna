import assert from "node:assert/strict";
import test from "node:test";
process.env.LUNA_DB_PATH=":memory:";
const {db}=await import("./db.ts");
const {createTransaction,correctTransaction,voidTransaction,transactionVersion,balanceFor}=await import("./ledger.ts");
const {accountDeletionPreview,deleteAccount}=await import("./account-deletion.ts");
const {mutateBudget}=await import("./budgets.ts");
const {commitCsv,previewCsv}=await import("./csv-imports.ts");
const {importStatement,knownSource}=await import("./imports.ts");
const {CSV_TEMPLATE}=await import("../../src/lib/csv.ts");
const {saveBill,payBill,saveGoal,listGoals,preferences}=await import("./planning.ts");
const owner=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('records','hash')").run().lastInsertRowid),other=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('records-other','hash')").run().lastInsertRowid);
function account(name:string,type="bank",who=owner){return Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?,?,?,'2025-01-01')").run(who,name,type).lastInsertRowid);}
const bank=account("Survivor"),card=account("Purge card","credit_card"),foreign=account("Other owner","bank",other),category=Number(db.prepare("INSERT INTO categories(owner_id,name,kind) VALUES(?,'Food','expense')").run(owner).lastInsertRowid),second=Number(db.prepare("INSERT INTO categories(owner_id,name,kind) VALUES(?,'Other','expense')").run(owner).lastInsertRowid);
function budgetSnapshot(id:number){const b=db.prepare("SELECT * FROM budgets WHERE id=?").get(id) as any;return JSON.stringify({id:b.id,month:b.month,name:b.name,category_id:b.category_id,amount:b.amount});}
test("budget updates preserve identity; collisions and stale updates leave both records intact",()=>{
 const a=mutateBudget(owner,undefined,{name:"Food",categoryId:category,month:"2025-01",amount:"100"}) as {id:number},b=mutateBudget(owner,undefined,{categoryId:second,month:"2025-01",amount:"200"}) as {id:number};const prior=budgetSnapshot(a.id);
 assert.throws(()=>mutateBudget(owner,a.id,{expected:prior,categoryId:second,month:"2025-01",amount:"300"}),/already has a budget/);assert.equal(budgetSnapshot(a.id),prior);assert.equal(db.prepare("SELECT amount FROM budgets WHERE id=?").get(b.id)?.amount,20000);
 assert.equal((mutateBudget(owner,a.id,{expected:prior,name:"Moved",categoryId:second,month:"2025-02",amount:"150"}) as {id:number}).id,a.id);assert.throws(()=>mutateBudget(owner,a.id,{expected:prior},true),/changed/);assert.throws(()=>mutateBudget(other,a.id,{},true),/unavailable/);
 const count=db.prepare("SELECT COUNT(*) n FROM transactions").get()?.n;mutateBudget(owner,a.id,{expected:budgetSnapshot(a.id)},true);assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions").get()?.n,count);
});
test("imported correction and void reserve source keys and invalidate reconciliation",()=>{
 const csv=CSV_TEMPLATE+"2025-02-01,CSV purchase,,expense,1,Food,csv-key,\n";commitCsv(owner,bank,csv,{});const row=db.prepare("SELECT transaction_id FROM csv_import_rows WHERE account_id=?").get(bank) as any;const replacement=correctTransaction(owner,row.transaction_id,{kind:"expense",date:"2025-02-01",amount:200,accountId:bank,categoryId:category,idempotencyKey:"csv-correct"},transactionVersion(owner,row.transaction_id));assert.equal(db.prepare("SELECT transaction_id FROM csv_import_rows WHERE account_id=?").get(bank)?.transaction_id,replacement.id);assert.equal(db.prepare("SELECT reconciliation_stale FROM csv_import_batches WHERE account_id=?").get(bank)?.reconciliation_stale,1);voidTransaction(owner,replacement.id,transactionVersion(owner,replacement.id));assert.equal(previewCsv(owner,bank,csv).rows[0].known,true);assert.equal(commitCsv(owner,bank,csv,{}).imported,0);
 const statement={schema_version:1,statement_id:"statement",account_key:"card",currency:"PHP",period:{start:"2025-03-01",end:"2025-03-31"},opening_balance:"0",closing_balance:"10",transactions:[{source_id:"json-key",posted_date:"2025-03-01",type:"purchase",description:"JSON purchase",amount:"10"}]};importStatement(owner,card,statement,{0:category},{});const tx=db.prepare("SELECT transaction_id FROM statement_import_rows WHERE account_id=?").get(card) as any;correctTransaction(owner,tx.transaction_id,{kind:"expense",date:"2025-03-01",amount:1200,accountId:card,categoryId:category,idempotencyKey:"json-correct"},transactionVersion(owner,tx.transaction_id));assert.equal(knownSource(owner,card,`${card}:json-key`),true);assert.equal(db.prepare("SELECT reconciliation_stale FROM statement_imports WHERE account_id=?").get(card)?.reconciliation_stale,1);assert.equal(importStatement(owner,card,statement,{0:category},{}).duplicate,true);
});
test("account purge removes both transfer entries, correction chains, linked bills and imports; stale preview aborts",()=>{
 const outgoing=createTransaction(owner,{kind:"transfer",date:"2025-04-01",amount:500,accountId:card,counterAccountId:bank,idempotencyKey:"outgoing"});
 const incoming=createTransaction(owner,{kind:"transfer",date:"2025-04-02",amount:300,accountId:bank,counterAccountId:card,idempotencyKey:"incoming"});
 const moved=correctTransaction(owner,outgoing.id,{kind:"expense",date:"2025-04-01",amount:700,accountId:bank,categoryId:category,idempotencyKey:"moved-from-card"},transactionVersion(owner,outgoing.id));
 const expenseBill=saveBill(owner,{name:"Linked bill",amount:"2",accountId:card,categoryId:category,dueDate:"2025-04-03",cadence:"once"});payBill(owner,{billId:expenseBill.id,date:"2025-04-03"});
 const repayment=saveBill(owner,{name:"Repayment",amount:"3",accountId:card,paymentKind:"credit_repayment",dueDate:"2025-04-04",cadence:"once"});payBill(owner,{billId:repayment.id,date:"2025-04-04",fundingAccountId:bank});
 const csv=CSV_TEMPLATE+"2025-04-05,Move,,transfer,4,,linked-source,\n";commitCsv(owner,bank,csv,{0:{destinationId:card}});
 const staleGoal=saveGoal(owner,{name:"Stale goal",target:"10"}),staleVersion=listGoals(owner).find(g=>g.id===staleGoal.id).version;saveGoal(owner,{id:staleGoal.id,version:staleVersion,name:"Changed goal",target:"20"});assert.throws(()=>saveGoal(owner,{id:staleGoal.id,version:staleVersion,name:"Overwrite",target:"30"}),/changed/);
 const goal=saveGoal(owner,{name:"Unrelated",target:"100"}),prefs=preferences(owner),budgets=db.prepare("SELECT * FROM budgets").all(),foreignBalance=balanceFor(other,foreign);
 let preview=accountDeletionPreview(owner,card);assert.throws(()=>accountDeletionPreview(other,card),/unavailable/);assert.throws(()=>deleteAccount(owner,card,{version:preview.version,confirmation:"wrong"}),/review/);
 const newTx=createTransaction(owner,{kind:"expense",date:"2025-04-06",amount:100,accountId:card,categoryId:category,idempotencyKey:"new-dependency"});assert.throws(()=>deleteAccount(owner,card,{version:preview.version,confirmation:preview.account.name}),/changed/);assert.ok(db.prepare("SELECT id FROM transactions WHERE id=?").get(newTx.id));
 preview=accountDeletionPreview(owner,card);const predicted=preview.surviving.find(a=>a.id===bank)!.after;deleteAccount(owner,card,{version:preview.version,confirmation:preview.account.name});
 assert.equal(balanceFor(owner,bank),predicted);assert.equal(balanceFor(other,foreign),foreignBalance);assert.equal(db.pragma("foreign_key_check").length,0);for(const id of [outgoing.id,incoming.id,moved.id,newTx.id])assert.equal(db.prepare("SELECT id FROM transactions WHERE id=?").get(id),undefined);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM bills WHERE account_id=?").get(card)?.n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM statement_imports WHERE account_id=?").get(card)?.n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM statement_import_rows WHERE account_id=?").get(card)?.n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM csv_import_rows WHERE source_id='linked-source'").get()?.n,0);
 assert.ok(db.prepare("SELECT id FROM goals WHERE id=?").get(goal.id));assert.deepEqual(db.prepare("SELECT * FROM budgets").all(),budgets);assert.deepEqual(preferences(owner),prefs);const audit=db.prepare("SELECT details FROM audit_events WHERE action='account.purge'").get() as any;assert.doesNotMatch(audit.details,/JSON purchase|Purge card|Linked bill/);
});
test.after(()=>db.close());
