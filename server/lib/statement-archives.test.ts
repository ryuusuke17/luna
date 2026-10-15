import test,{after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";

const root=mkdtempSync(join(tmpdir(),"luna-statement-archive-")),originals=join(root,"originals");
mkdirSync(originals);process.env.LUNA_DB_PATH=":memory:";process.env.LUNA_STATEMENTS_PATH=originals;
const {db}=await import("./db.ts");
const {saveStatementArchive,statementArchiveDetail,linkStatementArchive,listStatementArchives,downloadStatementArchive}=await import("./statement-archives.ts");
const {createTransaction,balanceFor}=await import("./ledger.ts");
const {importTransactions,uploadStatement,statementDetail}=await import("./statements.ts");
const {accountDeletionPreview,deleteAccount}=await import("./account-deletion.ts");
db.exec("INSERT INTO users(id,username,password_hash) VALUES(1,'owner','fixture'),(2,'other','fixture');INSERT INTO categories(owner_id,name,kind) VALUES(1,'Food','expense')");
const sample='Issuer,UnionBank\nStatement month/title,April 2026\nStatement date,"Apr 7, 2026"\nDue date,"Apr 24, 2026"\nCredit limit,164500.00\nPrevious balance,11117.89\nNew charges,15051.42\nPayments/credits,11200.00\nOutstanding balance,14969.31\nMinimum due,881.45\nStatement notes,\n\nSale date,Post date,Merchant,Amount,Type,Category,Transaction notes\n"Mar 7, 2026","Mar 9, 2026","UNIQLO SM FAIRVIEW, QUEZON CITY",1292.00,,,,\n"Mar 17, 2026","Mar 19, 2026","SHOPEE PH, MANDALUYONG",78.00,,,,\n"Mar 17, 2026","Apr 7, 2026",(03/24) POWER MAC CENTER- SM C,1957.92,,,,\n"Apr 3, 2026","Apr 7, 2026",Instalment Principal (02/03) [8152612],1842.66,,,,\n"Apr 5, 2026","Apr 7, 2026",(15/24) SILICON VALLEY-SM FAIR,1791.25,,,,\n';
function input(text=sample,extra={}){return{filename:"April.csv",mime:"text/csv",base64:Buffer.from(text).toString("base64"),...extra};}
function account(name:string,owner=1,type="credit_card"){return Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date,credit_limit,issuer) VALUES(?,?,?,'2025-01-01',900000,'Fixture issuer')").run(owner,name,type).lastInsertRowid);}
function financialState(){const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN('statement_archives','audit_events') ORDER BY name").all() as {name:string}[]);return tables.map(({name})=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]);}
function files(){try{return readdirSync(join(originals,"archive-only")).sort();}catch{return[];}}
function auditCount(){return(db.prepare("SELECT COUNT(*) count FROM audit_events").get() as {count:number}).count;}

test("archive sample round-trips exactly; every financial/provenance table and balance remains unchanged",()=>{
 const card=account("Archive card"),bank=account("Archive bank",1,"bank");
 createTransaction(1,{kind:"expense",date:"2026-03-09",amount:129200,accountId:card,categoryId:null,merchant:"UNIQLO SM FAIRVIEW, QUEZON CITY",idempotencyKey:"archive-fixture-purchase"});
 createTransaction(1,{kind:"transfer",date:"2026-04-01",amount:10000,accountId:bank,counterAccountId:card,idempotencyKey:"archive-fixture-repayment"});
 const pending=uploadStatement(1,{...input('date,description,merchant,type,amount\n2026-04-01,Pending,Fixture,expense,1\n'),accountId:card}),pendingBefore=statementDetail(1,pending.id);
 const before=financialState(),balances=[balanceFor(1,card),balanceFor(1,bank)],audits=auditCount();
 const saved=saveStatementArchive(1,input(sample,{accountId:card}));
 assert.equal(saved.row_count,5);assert.equal(saved.duplicate,false);assert.equal(saved.account_id,card);
 assert.equal(saved.summary.issuer,"UnionBank");assert.equal(saved.summary.title,"April 2026");assert.equal(saved.summary.statementDate,"2026-04-07");assert.equal(saved.summary.dueDate,"2026-04-24");
 assert.equal(saved.summary.creditLimit,16450000);assert.equal(saved.summary.previousBalance,1111789);assert.equal(saved.summary.newCharges,1505142);assert.equal(saved.summary.paymentsCredits,1120000);assert.equal(saved.summary.outstandingBalance,1496931);assert.equal(saved.summary.minimumDue,88145);
 assert.equal(saved.rows.reduce((total:number,row:{amount:number})=>total+row.amount,0),696183);assert.equal(saved.rows[0].merchant,"UNIQLO SM FAIRVIEW, QUEZON CITY");assert.equal(saved.rows[2].type,"");
 assert.ok(saved.warnings.some((warning:string)=>warning.includes("row charges PHP 6961.83")));assert.equal(downloadStatementArchive(1,saved.id).bytes.toString(),sample);
 assert.equal(listStatementArchives(1,{account:String(card),issuer:"UnionBank",start:"2026-04-01",end:"2026-04-30"}).total,1);
 assert.equal(statementArchiveDetail(1,saved.id).id,saved.id);assert.deepEqual(financialState(),before);assert.deepEqual([balanceFor(1,card),balanceFor(1,bank)],balances);assert.deepEqual(statementDetail(1,pending.id),pendingBefore);
 assert.equal(auditCount(),audits+1);assert.equal((db.prepare("SELECT action FROM audit_events ORDER BY id DESC LIMIT 1").get() as {action:string}).action,"statement-archive.upload");
 const imported=importTransactions(1,{...input(sample),accountId:card});assert.equal(imported.imported,4);assert.equal(imported.needsAttention,1);assert.equal(statementArchiveDetail(1,saved.id).row_count,5);
});

test("archive idempotency, explicit relink/unlink, owner scope and stale versions",()=>{
 const card=account("Relink card"),other=account("Other owner",2),text=sample.replace("April 2026","Relink fixture"),before=financialState(),audits=auditCount();
 const saved=saveStatementArchive(1,input(text));assert.equal(saved.account_id,null);
 const repeated=saveStatementArchive(1,input(text,{filename:"renamed.csv",accountId:card}));assert.equal(repeated.id,saved.id);assert.equal(repeated.duplicate,true);assert.equal(repeated.accountMismatch,true);assert.equal(repeated.account_id,null);assert.equal(auditCount(),audits+1);
 for(const action of [()=>statementArchiveDetail(2,saved.id),()=>downloadStatementArchive(2,saved.id),()=>linkStatementArchive(2,saved.id,{version:saved.version,accountId:null}),()=>saveStatementArchive(1,input(text,{accountId:other}))])assert.throws(action);
 assert.equal(listStatementArchives(2).total,0);
 const linked=linkStatementArchive(1,saved.id,{version:saved.version,accountId:card});assert.equal(linked.account_id,card);assert.notEqual(linked.version,saved.version);
 assert.throws(()=>linkStatementArchive(1,saved.id,{version:saved.version,accountId:null}),/changed/);
 const unlinked=linkStatementArchive(1,saved.id,{version:linked.version,accountId:null});assert.equal(unlinked.account_id,null);assert.equal(unlinked.account_name_snapshot,"Relink card");
 const same=saveStatementArchive(2,input(text,{accountId:other}));assert.notEqual(same.id,saved.id);assert.deepEqual(financialState(),before);
});

test("source dates, amounts, type, category and notes remain reference values, never financial validation gates",()=>{
 const text='Issuer,Fixture\nStatement date,bad summary date\nOutstanding balance,not money\nStatement notes,Kept\nSale date,Post date,Merchant,Amount,Type,Category,Transaction notes\nbad date,2026-02-30,"Merchant, with comma",12.345,Custom type,Not a real category,Original note\n,,Credit,-30,Refund,,\n';
 const before=financialState(),saved=saveStatementArchive(1,input(text));
 assert.equal(saved.rows[0].amount,null);assert.equal(saved.rows[0].postDate,null);assert.equal(saved.rows[0].saleDate,null);assert.equal(saved.rows[0].raw.amount,"12.345");assert.equal(saved.rows[0].type,"Custom type");assert.equal(saved.rows[0].category,"Not a real category");assert.equal(saved.rows[0].notes,"Original note");assert.equal(saved.rows[1].amount,-3000);
 assert.ok(saved.rows[0].warnings.length>=3);assert.ok(saved.warnings.length>=2);assert.ok(saved.warnings.every((warning:string)=>!warning.includes("in Transactions")));assert.equal(saved.rawSummary[2].cells[1],"not money");assert.deepEqual(financialState(),before);assert.equal(downloadStatementArchive(1,saved.id).bytes.toString(),text);
});

test("reject malformed/oversized uploads, unauthorized accounts, unsafe storage and nonempty extra cells",()=>{
 const count=listStatementArchives(1).total,before=files();
 for(const invalid of [input(sample,{filename:"../April.csv"}),input(sample,{filename:"April.pdf"}),input(sample,{mime:"application/pdf"}),input(sample,{base64:"%%%"}),input(sample,{base64:""}),input(sample,{accountId:99999}),input(sample,{accountId:1.5}),input('date,description,merchant,type,amount\n2026-04-01,X,X,expense,1\n'),input('Issuer,Fixture\nSale date,Post date,Merchant,Amount\n,2026-04-01,"unclosed,1\n'),input(sample.replace('1292.00,,,,','1292.00,,,,unexpected')),input(sample,{base64:Buffer.from([0xff,0xfe,0xff]).toString("base64")}),input(sample,{base64:Buffer.alloc(2_000_001,65).toString("base64")})])assert.throws(()=>saveStatementArchive(1,invalid));
 for(const query of [{page:"0"},{account:"no"},{start:"2026-02-30"},{start:"2026-05-01",end:"2026-04-01"},{extra:"unexpected"}])assert.throws(()=>listStatementArchives(1,query));
 process.env.LUNA_STATEMENTS_PATH=resolve("public/..archive-fixture");try{assert.throws(()=>saveStatementArchive(1,input(sample.replace("April 2026","Unsafe directory"))),/private/);}finally{process.env.LUNA_STATEMENTS_PATH=originals;}
 assert.equal(listStatementArchives(1).total,count);assert.deepEqual(files(),before);
});

test("failed DB/audit commits clean only their newly created file; retry recovers without duplication",()=>{
 const text=sample.replace("April 2026","Failed commit"),before=financialState(),originalFiles=files(),count=listStatementArchives(1).total,audits=auditCount();
 db.exec("CREATE TRIGGER archive_fixture_failure BEFORE INSERT ON audit_events WHEN NEW.action='statement-archive.upload' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
 try{assert.throws(()=>saveStatementArchive(1,input(text)),/fixture audit failure/);}finally{db.exec("DROP TRIGGER archive_fixture_failure");}
 assert.deepEqual(financialState(),before);assert.deepEqual(files(),originalFiles);assert.equal(listStatementArchives(1).total,count);assert.equal(auditCount(),audits);
 const saved=saveStatementArchive(1,input(text));assert.equal(saved.duplicate,false);assert.equal(saveStatementArchive(1,input(text)).id,saved.id);assert.equal(files().length,originalFiles.length+1);
 const blocked=join(root,"not-a-directory");writeFileSync(blocked,"fixture");process.env.LUNA_STATEMENTS_PATH=blocked;try{assert.throws(()=>saveStatementArchive(1,input(sample.replace("April 2026","Failed file"))));}finally{process.env.LUNA_STATEMENTS_PATH=originals;}
 assert.equal(listStatementArchives(1).total,count+1);
});

test("missing/corrupt originals fail safely and recover from exact backup bytes",()=>{
 const saved=saveStatementArchive(1,input(sample.replace("April 2026","Recovery fixture"))),key=(db.prepare("SELECT file_key FROM statement_archives WHERE id=?").get(saved.id) as {file_key:string}).file_key,path=join(originals,"archive-only",key),bytes=readFileSync(path),before=financialState();
 renameSync(path,path+".saved");try{assert.throws(()=>downloadStatementArchive(1,saved.id));assert.throws(()=>saveStatementArchive(1,input(bytes.toString())));}finally{renameSync(path+".saved",path);}
 writeFileSync(path,"corrupt fixture");try{assert.throws(()=>downloadStatementArchive(1,saved.id),/integrity/);}finally{writeFileSync(path,bytes);}
 assert.deepEqual(downloadStatementArchive(1,saved.id).bytes,bytes);assert.equal(saveStatementArchive(1,input(bytes.toString())).duplicate,true);assert.deepEqual(financialState(),before);
});

test("account deletion preserves standalone documents, account-name snapshots and originals",()=>{
 const card=account("Deletable reference"),saved=saveStatementArchive(1,input(sample.replace("April 2026","Deleted account"),{accountId:card})),preview=accountDeletionPreview(1,card);
 deleteAccount(1,card,{version:preview.version,confirmation:preview.account.name});
 const retained=statementArchiveDetail(1,saved.id);assert.equal(retained.account_id,null);assert.equal(retained.account_name_snapshot,"Deletable reference");assert.notEqual(retained.version,saved.version);assert.equal(downloadStatementArchive(1,saved.id).bytes.toString(),sample.replace("April 2026","Deleted account"));
});

test("request bodies are bounded by declared and streamed bytes; invalid JSON is rejected",async()=>{
 const {readLimitedJson}=await import("./request.ts");
 const event=(body:string,headers={})=>({req:new Request("http://localhost/api/statement-archives",{method:"POST",headers,body})});
 assert.deepEqual(await readLimitedJson(event('{"ok":true}'),20),{ok:true});
 await assert.rejects(()=>readLimitedJson(event("x",{"content-length":"100"}),20));
 await assert.rejects(()=>readLimitedJson(event("x".repeat(21)),20));
 await assert.rejects(()=>readLimitedJson(event("{invalid}"),20));
});

test("archive pagination and dependency boundaries stay bounded and separate",()=>{
 for(let index=0;index<26;index++)saveStatementArchive(1,input(sample.replace("April 2026","Page fixture "+index)));
 const first=listStatementArchives(1),second=listStatementArchives(1,{page:"2"});assert.equal(first.items.length,25);assert.equal(first.pageSize,25);assert.ok(second.items.length>0);assert.notEqual(first.items[0].id,second.items[0].id);
 const source=readFileSync(new URL("./statement-archives.ts",import.meta.url),"utf8");assert.doesNotMatch(source,/from ["']\.\/(?:ledger|statements|imports|payments|reconciliation)/);assert.doesNotMatch(source,/\b(?:createTransaction|importTransactions|autoImportStatement|resolveStatement|commitStatement)\(/);
});

test("legacy sample reset never removes standalone archive records or originals",async()=>{
 const {sampleResetPreview,resetSampleWorkspace}=await import("./sample-workspace.ts"),before=db.prepare("SELECT * FROM statement_archives ORDER BY id").all(),originalFiles=files(),preview=sampleResetPreview(1);
 resetSampleWorkspace(1,{version:preview.version,confirmation:"RESET MY WORKSPACE",requestKey:"isolated-archive-retention"});
 assert.deepEqual(db.prepare("SELECT * FROM statement_archives ORDER BY id").all(),before);assert.deepEqual(files(),originalFiles);
 for(const item of before as {id:number;owner_id:number}[])assert.ok(downloadStatementArchive(item.owner_id,item.id).bytes.length);
});

after(()=>{db.close();assert.equal(dirname(root),resolve(tmpdir()));assert.ok(root.includes("luna-statement-archive-"));rmSync(root,{recursive:true,force:true});});
