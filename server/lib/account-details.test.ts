import assert from "node:assert/strict";
import test from "node:test";
import type { AccountSnapshot } from "../../src/lib/accounts.ts";
process.env.LUNA_DB_PATH = ":memory:";
const { db } = await import("./db.ts");
const { selectAccountDisplay, accountDetails, accountHistory, parseAccountFilters } = await import("./account-details.ts");
const { createTransaction, voidTransaction } = await import("./ledger.ts");
const owner = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('account-details','hash')").run().lastInsertRowid);
const other = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('foreign-details','hash')").run().lastInsertRowid);
const account = Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?,'Bank','bank','2025-01-01')").run(owner).lastInsertRowid);
const card = Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?,'Card','credit_card','2025-01-01')").run(owner).lastInsertRowid);
const snapshot = (patch: Partial<AccountSnapshot> = {}): AccountSnapshot => ({id:"archive:1",source:"archive",sourceId:1,filename:"source.csv",date:"2026-04-30",currency:"PHP",amount:100,semantics:"debt-positive",status:"Reference",eligible:true,dueDate:null,minimumDue:null,download:null,view:"",...patch});
test("latest date, source priority, stable IDs, superseded issues and signed credit balances", () => {
  const rows = [snapshot(), snapshot({id:"issued:2",source:"issued",sourceId:2,amount:-50}), snapshot({id:"issued:3",source:"issued",sourceId:3,amount:0}), snapshot({id:"issued:4",source:"issued",sourceId:4,date:"2026-05-30",eligible:false})];
  assert.equal(selectAccountDisplay(rows).snapshots[0].amount,0);
  assert.equal(selectAccountDisplay(rows.toReversed()).snapshots[0].id,"issued:3");
  assert.equal(selectAccountDisplay([rows[1]]).snapshots[0].amount,-50);
  assert.equal(selectAccountDisplay([snapshot({date:"2026-03-31"}), rows[1]]).date,"2026-04-30");
});
test("missing amount/date uses explicit fallback, never older snapshot; currencies stay separate", () => {
  assert.equal(selectAccountDisplay([snapshot(),snapshot({id:"bank:2",source:"bank",date:"2026-05-01",amount:null})]).source,"ledger");
  assert.equal(selectAccountDisplay([snapshot({date:null})]).source,"ledger");
  assert.equal(selectAccountDisplay([]).count,0);
  const display=selectAccountDisplay([snapshot(),snapshot({id:"issued:2",source:"issued",sourceId:2,currency:"USD",amount:-30})]);
  assert.deepEqual(display.snapshots.map(s=>s.currency).sort(),["PHP","USD"]);
});
test("filters reject invalid IDs, overlapping period modes, dates, pagination and unknown keys", () => {
  for(const input of [{month:"2026-13"},{start:"2026-02-30"},{start:"2026-04-02",end:"2026-04-01"},{month:"2026-04",start:"2026-04-01"},{page:"0"},{account:"1"}]) assert.throws(()=>parseAccountFilters(input));
  assert.throws(()=>accountDetails(owner,0,{}));
  assert.equal(accountDetails(other,account,{}),null);
});
test("scoped history paginates after account/owner filtering, explicit dates only", () => {
  const insert=db.prepare("INSERT INTO statement_imports(owner_id,account_id,statement_id,period_start,period_end,closing_balance) VALUES(?,?,?,?,?,?)");
  for(let i=1;i<=27;i++)insert.run(owner,card,`statement-${i}`,"2025-01-01",`2025-01-${String(i).padStart(2,"0")}`,i);
  assert.equal(accountHistory(owner,account).length,0);
  assert.equal(accountHistory(other,card).length,0);
  const first=accountDetails(owner,card,{})!,second=accountDetails(owner,card,{page:"2"})!;
  assert.equal(first.history.total,27);assert.equal(first.history.items.length,25);assert.equal(second.history.items.length,2);
  assert.equal(first.history.items[0].date,"2025-01-27");assert.equal(first.history.items[0].semantics,"debt-positive");
});
test("period summaries include incoming/outgoing transfers, exclude voids, ignore search/page", () => {
  createTransaction(owner,{kind:"opening",accountId:account,date:"2025-01-01",amount:1000,idempotencyKey:"details-opening"});
  createTransaction(owner,{kind:"transfer",accountId:account,counterAccountId:card,date:"2025-02-02",amount:100,idempotencyKey:"details-out"});
  createTransaction(owner,{kind:"transfer",accountId:card,counterAccountId:account,date:"2025-02-03",amount:50,idempotencyKey:"details-in"});
  const voided=createTransaction(owner,{kind:"expense",accountId:account,date:"2025-02-04",amount:500,idempotencyKey:"details-void"});voidTransaction(owner,voided.id);
  const result=accountDetails(owner,account,{month:"2025-02"})!;
  assert.deepEqual(result.period,{month:"2025-02",start:"2025-02-01",end:"2025-02-28",opening:1000,closing:950,inflows:50,outflows:100});
  assert.deepEqual(accountDetails(owner,account,{month:"2025-02",search:"no match",page:"3"})!.period,result.period);
  assert.equal(accountDetails(owner,account,{tab:"activity"})!.period.month,"2025-02");
});
test.after(()=>db.close());
