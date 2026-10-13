import assert from "node:assert/strict";
import test from "node:test";
import { isCalendarDate,netWorth,parseMoney } from "../../src/lib/finance.ts";
process.env.LUNA_DB_PATH=":memory:";
const {db}=await import("./db.ts");
const {createTransaction,balanceFor,voidTransaction}=await import("./ledger.ts");
const owner=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('owner','hash')").run().lastInsertRowid);
const other=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('other','hash')").run().lastInsertRowid);
const cash=Number(db.prepare("INSERT INTO accounts(owner_id,name,type,liquid,opening_date) VALUES(?, 'Bank','bank',1,'2025-01-01')").run(owner).lastInsertRowid);
const card=Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?, 'Card','credit_card','2025-01-01')").run(owner).lastInsertRowid);
const foreign=Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?, 'Other','bank','2025-01-01')").run(other).lastInsertRowid);
const expenseCat=Number(db.prepare("INSERT INTO categories(owner_id,name,kind) VALUES(?, 'Food','expense')").run(owner).lastInsertRowid);
const incomeCat=Number(db.prepare("INSERT INTO categories(owner_id,name,kind) VALUES(?, 'Pay','income')").run(owner).lastInsertRowid);

test("money parsing uses exact centavos; rejects excess precision and negatives",()=>{assert.equal(parseMoney("1250.5"),125050);assert.equal(parseMoney("0.01"),1);assert.throws(()=>parseMoney("1.005"));assert.throws(()=>parseMoney("-2"))});
test("calendar and net worth invariants",()=>{assert.equal(isCalendarDate("2024-02-29"),true);assert.equal(isCalendarDate("2025-02-29"),false);assert.equal(netWorth(250000,40000),210000);assert.throws(()=>netWorth(-1,0))});
test("expense and card purchase apply correct entries; retry is idempotent",()=>{createTransaction(owner,{kind:"opening",date:"2025-01-01",amount:50000,accountId:cash,idempotencyKey:"open-cash"});createTransaction(owner,{kind:"expense",date:"2025-01-02",amount:1234,accountId:cash,categoryId:expenseCat,idempotencyKey:"food-1"});assert.equal(balanceFor(owner,cash),48766);createTransaction(owner,{kind:"expense",date:"2025-01-02",amount:1234,accountId:cash,categoryId:expenseCat,idempotencyKey:"food-1"});assert.equal(db.prepare("SELECT count(*) n FROM transactions WHERE owner_id=? AND idempotency_key='food-1'").get(owner)?.n,1);createTransaction(owner,{kind:"expense",date:"2025-01-03",amount:900,accountId:card,categoryId:expenseCat,idempotencyKey:"card-1"});assert.equal(balanceFor(owner,card),-900)});
test("transfers net to zero and foreign accounts are rejected",()=>{const before=balanceFor(owner,cash)+balanceFor(owner,card);createTransaction(owner,{kind:"transfer",date:"2025-01-04",amount:500,accountId:cash,counterAccountId:card,idempotencyKey:"move-1"});assert.equal(balanceFor(owner,cash)+balanceFor(owner,card),before);assert.throws(()=>createTransaction(owner,{kind:"transfer",date:"2025-01-05",amount:500,accountId:cash,counterAccountId:foreign,idempotencyKey:"bad-transfer"}),/Counter account unavailable/)});
test("income and void update balances and preserve history",()=>{createTransaction(owner,{kind:"income",date:"2025-01-06",amount:2000,accountId:cash,categoryId:incomeCat,idempotencyKey:"income-1"});assert.equal(balanceFor(owner,cash),50266);const id=(db.prepare("SELECT id FROM transactions WHERE idempotency_key='income-1'").get() as {id:number}).id;voidTransaction(owner,id);assert.equal(balanceFor(owner,cash),48266);assert.throws(()=>voidTransaction(other,id),/Transaction not found/) });
test("invalid dates, future dates, category mismatch and missing adjustment reason fail",()=>{assert.throws(()=>createTransaction(owner,{kind:"expense",date:"2025-02-30",amount:1,accountId:cash,categoryId:expenseCat,idempotencyKey:"bad-date"}));assert.throws(()=>createTransaction(owner,{kind:"expense",date:"2999-01-01",amount:1,accountId:cash,categoryId:expenseCat,idempotencyKey:"future"}));assert.throws(()=>createTransaction(owner,{kind:"income",date:"2025-01-07",amount:1,accountId:cash,categoryId:expenseCat,idempotencyKey:"wrong-kind"}));assert.throws(()=>createTransaction(owner,{kind:"adjustment",date:"2025-01-07",amount:1,accountId:cash,idempotencyKey:"no-reason"}))});

test.after(()=>db.close());
