import assert from "node:assert/strict";
import test from "node:test";
import { isCalendarDate,netWorth,parseMoney } from "../../src/lib/finance.ts";
process.env.LUNA_DB_PATH=":memory:";
const {db}=await import("./db.ts");
const {createTransaction,balanceFor,voidTransaction,correctTransaction,transactionVersion,resolveTransaction}=await import("./ledger.ts");
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
test("untyped request values are rejected before SQL writes",()=>{assert.throws(()=>createTransaction(owner,{kind:"admin",date:"2025-01-07",amount:1,accountId:cash,idempotencyKey:"bad-kind"} as never),/Invalid transaction/);assert.throws(()=>createTransaction(owner,{kind:"expense",date:"2025-01-07",amount:1,accountId:0,categoryId:expenseCat,idempotencyKey:"bad-account"}),/Invalid transaction/);assert.throws(()=>createTransaction(owner,{kind:"expense",date:"2025-01-07",amount:1,accountId:cash,categoryId:expenseCat,idempotencyKey:"bad-description",description:42} as never),/Invalid transaction/)});

test("request keys cannot alias a different or voided transaction",()=>{const input={kind:"expense" as const,date:"2025-01-09",amount:10,accountId:cash,categoryId:expenseCat,idempotencyKey:"collision"};const tx=createTransaction(owner,input);assert.throws(()=>createTransaction(owner,{...input,amount:11}),/different or voided/);voidTransaction(owner,tx.id);assert.throws(()=>createTransaction(owner,input),/different or voided/);});
test("currency/fee snapshots are authoritative; corrections are atomic, stale-safe and idempotent",()=>{
 const input={kind:"expense" as const,date:"2025-06-01",amount:1,originalAmount:10500,originalCurrency:"USD",exchangeRate:"58",includedFee:500,accountId:cash,categoryId:expenseCat,idempotencyKey:"foreign-fee"};const before=balanceFor(owner,cash),tx=createTransaction(owner,input);
 assert.equal(balanceFor(owner,cash),before-609000);assert.equal(db.prepare("SELECT COUNT(*) n FROM account_entries WHERE transaction_id=?").get(tx.id)?.n,1);
 const row=db.prepare("SELECT * FROM transactions WHERE id=?").get(tx.id) as any;assert.equal(row.original_amount-row.included_fee,10000);assert.equal(row.amount,609000);
 assert.throws(()=>createTransaction(owner,{...input,idempotencyKey:"bad-fee",includedFee:10501}));
 assert.throws(()=>createTransaction(owner,{...input,feeEnabled:true,includedFee:0,idempotencyKey:"empty-checked-fee"}));assert.throws(()=>createTransaction(owner,{...input,feeEnabled:false,idempotencyKey:"unchecked-fee"}));
 const version=transactionVersion(owner,tx.id),next={...input,originalAmount:10000,idempotencyKey:"correction-1"};const replacement=correctTransaction(owner,tx.id,next,version);assert.equal(correctTransaction(owner,tx.id,next,version).id,replacement.id);assert.equal(resolveTransaction(owner,tx.id),replacement.id);assert.equal(balanceFor(owner,cash),before-580000);
 assert.ok(db.prepare("SELECT voided_at FROM transactions WHERE id=?").get(tx.id)?.voided_at);assert.throws(()=>correctTransaction(owner,tx.id,{...next,idempotencyKey:"stale"},version),/changed/);assert.throws(()=>correctTransaction(other,replacement.id,next,version),/not found/);
 const v=transactionVersion(owner,replacement.id);assert.throws(()=>correctTransaction(owner,replacement.id,{...next,accountId:foreign,idempotencyKey:"invalid-correction"},v));assert.equal(transactionVersion(owner,replacement.id),v);
 assert.throws(()=>voidTransaction(owner,replacement.id,"outdated"),/changed/);voidTransaction(owner,replacement.id,v);assert.equal(balanceFor(owner,cash),before);
});
test("transfer corrections update both accounts; opening/adjustment semantics stay protected",()=>{
 const beforeCash=balanceFor(owner,cash),beforeCard=balanceFor(owner,card),input={kind:"transfer" as const,date:"2025-06-02",amount:100,accountId:cash,counterAccountId:card,idempotencyKey:"transfer-correct"};const tx=createTransaction(owner,input),replacement=correctTransaction(owner,tx.id,{...input,amount:200,idempotencyKey:"transfer-replacement"},transactionVersion(owner,tx.id));assert.equal(balanceFor(owner,cash),beforeCash-200);assert.equal(balanceFor(owner,card),beforeCard+200);voidTransaction(owner,replacement.id,transactionVersion(owner,replacement.id));assert.equal(balanceFor(owner,cash),beforeCash);
 const opening=(db.prepare("SELECT * FROM transactions WHERE idempotency_key='open-cash'").get() as any);assert.throws(()=>correctTransaction(owner,opening.id,{kind:"expense",date:opening.posted_date,amount:1,accountId:cash,categoryId:expenseCat,idempotencyKey:"unsafe-opening"},transactionVersion(owner,opening.id)),/keep their type/);
});
test("installments persist as spending, retry safely and can be explicitly reclassified",()=>{
 const accountId=Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?,'Installment card','credit_card','2025-01-01')").run(owner).lastInsertRowid);
 const input={kind:"installment" as const,date:"2025-06-03",amount:179125,accountId,merchant:"Fixture merchant",description:"(2/12) Laptop",idempotencyKey:"installment-create"};
 const created=createTransaction(owner,input);
 assert.deepEqual(db.prepare("SELECT kind,is_installment,amount,merchant FROM transactions WHERE id=?").get(created.id),{kind:"expense",is_installment:1,amount:179125,merchant:"Fixture merchant"});
 assert.equal(balanceFor(owner,accountId),-179125);assert.equal(createTransaction(owner,input).id,created.id);
 assert.throws(()=>createTransaction(owner,{...input,kind:"expense",isInstallment:false}),/Request key/);
 assert.throws(()=>createTransaction(owner,{...input,kind:"income",isInstallment:true,idempotencyKey:"invalid-installment"}),/Invalid installment/);
 const correction={...input,kind:"expense" as const,isInstallment:false,idempotencyKey:"installment-correction"};
 const corrected=correctTransaction(owner,created.id,correction,transactionVersion(owner,created.id));
 assert.equal(db.prepare("SELECT is_installment FROM transactions WHERE id=?").get(corrected.id)?.is_installment,0);
 assert.equal(balanceFor(owner,accountId),-179125);assert.equal(correctTransaction(owner,created.id,correction,"old-version").id,corrected.id);
 assert.equal(db.prepare("SELECT transaction_type(kind,is_installment,description,merchant,notes) type FROM transactions WHERE id=?").get(corrected.id)?.type,"expense");
});
test.after(()=>db.close());
