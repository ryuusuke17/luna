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
test("summary cards use cash/wallet ledger only and signed currency-separated credit-card snapshots",async()=>{
 const {accountSummary}=await import("../../src/lib/accounts.ts");
 const base={id:1,name:"Summary fixture",balance:100,opening_date:"2026-01-01"};
 const statement=(snapshots:AccountSnapshot[])=>({count:1,date:"2026-04-30",source:"statement" as const,snapshots,reason:null});
 const result=accountSummary([
  {...base,type:"cash",balance:1000},{...base,type:"wallet",balance:-100},
  {...base,type:"bank",balance:999999},{...base,type:"loan",balance:-999999},
  {...base,type:"credit_card",balance:-999999,display:statement([snapshot({amount:500}),snapshot({currency:"USD",amount:200})])},
  {...base,type:"credit_card",display:statement([snapshot({amount:-100})])},
  {...base,type:"credit_card",display:statement([snapshot({amount:50,semantics:"asset-positive"})])},
  {...base,type:"credit_card",display:statement([snapshot({currency:"JPY",amount:0})])},
  {...base,type:"credit_card",balance:-999999},
 ]);
 assert.deepEqual(result,{cashWallet:900,statementBalances:[["JPY",0],["PHP",350],["USD",200]],missingStatements:1});
 assert.deepEqual(accountSummary([]),{cashWallet:0,statementBalances:[],missingStatements:0});
});
test("account reset requires fresh confirmation, removes owned history/files, preserves foreign records and unlinked archives",async()=>{
 const {accountResetPreview,resetAccounts}=await import("./account-reset.ts");
 const {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync}=await import("node:fs");
 const {join}=await import("node:path"),{tmpdir}=await import("node:os");
 const root=mkdtempSync(join(tmpdir(),"account-reset-")),originalPath=process.env.LUNA_STATEMENTS_PATH;
 process.env.LUNA_STATEMENTS_PATH=root;mkdirSync(join(root,"archive-only"));
 try{
  const user=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('reset-fixture','hash')").run().lastInsertRowid);
  const bank=Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date) VALUES(?,'Reset bank','bank','2026-01-01')").run(user).lastInsertRowid);
  createTransaction(user,{kind:"opening",accountId:bank,date:"2026-01-01",amount:1000,idempotencyKey:"reset-opening"});
  db.prepare("INSERT INTO goals(owner_id,name,target) VALUES(?,'Keep goal',100)").run(user);
  const key="00000000-0000-0000-0000-000000000001.csv",unlinkedKey="00000000-0000-0000-0000-000000000002.csv",bankKey="00000000-0000-0000-0000-000000000003.csv";
  const insertArchive=db.prepare("INSERT INTO statement_archives(owner_id,account_id,filename,file_key,file_hash,size,parser_version,summary_json,raw_summary_json,rows_json,warnings_json) VALUES(?,?,'source.csv',?,?,1,'test','{}','[]','[]','[]')");
  insertArchive.run(user,bank,key,'linked');insertArchive.run(user,null,unlinkedKey,'unlinked');
  writeFileSync(join(root,'archive-only',key),'linked');writeFileSync(join(root,'archive-only',unlinkedKey),'unlinked');writeFileSync(join(root,bankKey),'bank');
  const statement=Number(db.prepare("INSERT INTO statements(owner_id,account_id,filename,file_key,file_hash,size,status) VALUES(?,?,'bank.csv',?,'bank',4,'ready_for_review')").run(user,bank,bankKey).lastInsertRowid);
  db.prepare("INSERT INTO statement_entries(statement_id,row_index,raw_json) VALUES(?,1,'{}')").run(statement);
  const foreignBefore=JSON.stringify(db.prepare("SELECT * FROM accounts WHERE owner_id=?").all(owner));
  const preview=accountResetPreview(user);
  assert.throws(()=>resetAccounts(user,{version:preview.version,confirmation:'wrong'}));
  db.prepare("UPDATE accounts SET name='Changed bank' WHERE id=?").run(bank);
  assert.throws(()=>resetAccounts(user,{version:preview.version,confirmation:'DELETE ALL ACCOUNTS'}));
  const current=accountResetPreview(user);
  db.exec("CREATE TRIGGER reset_failure BEFORE DELETE ON accounts WHEN OLD.name='Changed bank' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
  assert.throws(()=>resetAccounts(user,{version:current.version,confirmation:'DELETE ALL ACCOUNTS'}));
  assert.ok(existsSync(join(root,bankKey)));assert.ok(existsSync(join(root,'archive-only',key)));
  assert.equal(accountResetPreview(user).version,current.version);db.exec('DROP TRIGGER reset_failure');
  assert.equal(resetAccounts(user,{version:current.version,confirmation:'DELETE ALL ACCOUNTS'}).ok,true);
  assert.equal(accountResetPreview(user).counts.accounts,0);assert.equal(accountResetPreview(user).counts.transactions,0);
  assert.equal(accountResetPreview(user).counts.statements,0);assert.equal(accountResetPreview(user).counts.statement_entries,0);
  assert.equal(existsSync(join(root,bankKey)),false);assert.equal(existsSync(join(root,'archive-only',key)),false);
  assert.ok(existsSync(join(root,'archive-only',unlinkedKey)));
  assert.equal((db.prepare('SELECT COUNT(*) n FROM statement_archives WHERE owner_id=?').get(user) as {n:number}).n,1);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM goals WHERE owner_id=?').get(user) as {n:number}).n,1);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM accounts WHERE owner_id=?').all(owner)),foreignBefore);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{if(originalPath===undefined)delete process.env.LUNA_STATEMENTS_PATH;else process.env.LUNA_STATEMENTS_PATH=originalPath;rmSync(root,{recursive:true,force:true});}
});
test.after(()=>db.close());
