import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {retireVerification} from "./transaction-first-migration.ts";

const root=mkdtempSync(join(tmpdir(),"luna-transaction-first-")),originals=join(root,"originals");
mkdirSync(originals);process.env.LUNA_DB_PATH=":memory:";process.env.LUNA_STATEMENTS_PATH=originals;
const {db}=await import("./db.ts");
const {importTransactions,uploadStatement,autoImportStatement,statementDetail,resolveStatement,downloadStatement,extendStatementHistory,previewTransactionImport,commitStatement,reprocessStatement}=await import("./statements.ts");
const {createTransaction,correctTransaction,transactionVersion,balanceFor}=await import("./ledger.ts");
const {exportRows}=await import("./csv-imports.ts");
db.exec("INSERT INTO users(id,username,password_hash) VALUES(1,'owner','fixture'),(2,'other','fixture');INSERT INTO categories(id,owner_id,name,kind) VALUES(1,1,'Food','expense'),(2,1,'Salary','income'),(3,2,'Foreign','expense')");
const header="date,description,merchant,type,amount,category,source_id,destination\n";
function account(name="Bank",type="bank",owner=1){return Number(db.prepare("INSERT INTO accounts(owner_id,name,type,opening_date,liquid) VALUES(?,?,?,'2025-01-01',?)").run(owner,name,type,type==="bank"?1:0).lastInsertRowid);}
function input(accountId:number,text:string,extra={}){return{accountId,filename:"transactions.csv",mime:"text/csv",base64:Buffer.from(text).toString("base64"),...extra};}
function transaction(accountId:number,extra={}){return{kind:"expense" as const,date:"2025-04-10",amount:1000,accountId,categoryId:null,description:"Lunch",merchant:"Cafe",idempotencyKey:crypto.randomUUID(),...extra};}
function resolveRow(id:number,index:number,decision:Omit<Parameters<typeof resolveStatement>[2]["decisions"][number],"entryId">){const detail=statementDetail(1,id);return resolveStatement(1,id,{version:detail.version,decisions:[{entryId:detail.entries[index].id,...decision}]});}

test("mixed CSV posts clear rows atomically, including same-amount distinct purchases; categories stay optional",()=>{
 const bank=account(),before=db.prepare("SELECT * FROM categories").all();
 const text=header+"2025-04-10,Lunch,Cafe,expense,10,,,\n2025-04-10,Taxi,Ride,expense,10,Unknown source label,taxi,\n2025-04-11,Salary,Employer,income,25,,,\n2025-02-30,Impossible,Cafe,expense,4,,,\n";
 const result=importTransactions(1,input(bank,text));
 assert.equal(result.imported,3);assert.equal(result.needsAttention,1);assert.equal(balanceFor(1,bank),500);
 assert.deepEqual(db.prepare("SELECT * FROM categories").all(),before);
 const detail=statementDetail(1,result.id);assert.equal(detail.entries[1].raw.category,"Unknown source label");assert.equal(detail.entries[3].row,null);
 assert.ok(exportRows(1).filter(row=>row.account_id===bank).every(row=>row.category_id===null&&row.category_name===null));
 assert.equal(downloadStatement(1,result.id).bytes.toString(),text);
 assert.equal(importTransactions(1,input(bank,text,{filename:"renamed.csv"})).duplicate,true);assert.equal(balanceFor(1,bank),500);
});

test("statement merchant names, installment types, legacy display and exports preserve originals and exact balances",async()=>{
 const {transactionFeedback,transactionVersion}=await import("./ledger.ts"),{exportCsv}=await import("../../src/lib/csv.ts");
 const card=account("Merchant installment fixture","credit_card");
 const text='Sale date,Post date,Description,Amount,Category,Notes\n"Apr 5, 2025","Apr 7, 2025","(2/12) Fixture Shop, Quezon City",1791.25,,\n';
 const imported=importTransactions(1,input(card,text));assert.equal(imported.imported,1);
 const entry=statementDetail(1,imported.id).entries[0],id=entry.transactionId!;
 assert.deepEqual(db.prepare("SELECT description,merchant,is_installment,kind FROM transactions WHERE id=?").get(id),{description:"",merchant:"(2/12) Fixture Shop, Quezon City",is_installment:1,kind:"expense"});
 assert.equal(balanceFor(1,card),-179125);assert.equal(downloadStatement(1,imported.id).bytes.toString(),text);
 const count=()=>(db.prepare("SELECT count(*) n FROM transactions WHERE account_id=?").get(card) as {n:number}).n;
 assert.equal(importTransactions(1,input(card,text)).duplicate,true);assert.equal(count(),1);
 db.prepare("UPDATE transactions SET description=merchant,merchant='',is_installment=NULL WHERE id=?").run(id);
 const version=transactionVersion(1,id),feedback=transactionFeedback(1,id);
 assert.equal(feedback.merchant,"(2/12) Fixture Shop, Quezon City");assert.equal(feedback.description,"");assert.equal(feedback.is_installment,1);assert.equal(transactionVersion(1,id),version);
 const rows=exportRows(1).filter(row=>row.account_id===card);assert.equal(rows[0].merchant,feedback.merchant);assert.equal(rows[0].description,"");assert.ok(exportCsv(rows).includes('"installment"'));
 assert.equal((db.prepare("SELECT count(*) n FROM transactions WHERE account_id=? AND transaction_type(kind,is_installment,description,merchant,notes)='installment'").get(card) as {n:number}).n,1);
 const overlapping=importTransactions(1,input(card,text.replace(/\n/g,"\r\n")));assert.equal(overlapping.imported,0);assert.equal(overlapping.needsAttention,1);assert.equal(count(),1);
 resolveRow(overlapping.id,0,{action:"link",transactionId:id,correction:{date:"2025-04-07",description:"",merchant:"(2/12) Fixture Shop, Quezon City",type:"installment",amount:"1791.25",notes:""}});assert.equal(count(),1);assert.equal(statementDetail(1,overlapping.id).entries[0].action,"link");
 const separate=account("Explicit CSV installment","credit_card");
 const flat=importTransactions(1,input(separate,header+'2025-04-08,Laptop,Fixture Shop,installment,12.34,,installment-source,\n'));
 assert.equal(flat.imported,1);assert.equal(balanceFor(1,separate),-1234);
});

test("CSV merchant installment markers default to installments without changing financial types or manual overrides",()=>{
 const card=account("Automatic merchant installments","credit_card"),merchant="Fixture Shop (04/12)";
 const text=header+`2025-04-15,Laptop,${merchant},expense,12.34,,automatic-installment,\n2025-04-16,Normal purchase,Fixture Shop,expense,2,,normal-purchase,\n2025-04-17,Refund,${merchant},refund,1,,marked-refund,\n`;
 const imported=importTransactions(1,input(card,text));assert.equal(imported.imported,3);
 const detail=statementDetail(1,imported.id),id=detail.entries[0].transactionId!;
 assert.equal(detail.entries[0].row?.isInstallment,true);
 assert.deepEqual(db.prepare("SELECT kind,is_installment,merchant FROM transactions WHERE id=?").get(id),{kind:"expense",is_installment:1,merchant});
 assert.deepEqual(db.prepare("SELECT kind,is_installment FROM transactions WHERE id IN (?,?) ORDER BY id").all(detail.entries[1].transactionId,detail.entries[2].transactionId),[{kind:"expense",is_installment:0},{kind:"refund",is_installment:0}]);
 const corrected=correctTransaction(1,id,transaction(card,{date:"2025-04-15",amount:1234,description:"Laptop",merchant,isInstallment:false}),transactionVersion(1,id));
 assert.equal(db.prepare("SELECT transaction_type(kind,is_installment,description,merchant,notes) type FROM transactions WHERE id=?").get(corrected.id)?.type,"expense");
 assert.equal(importTransactions(1,input(card,text)).duplicate,true);
 assert.equal(autoImportStatement(1,imported.id).imported,3);
 assert.equal(db.prepare("SELECT is_installment FROM transactions WHERE id=?").get(corrected.id)?.is_installment,0);
 assert.equal(balanceFor(1,card),-1334);assert.equal(downloadStatement(1,imported.id).bytes.toString(),text);
});

test("a manually corrected import type overrides a merchant installment marker before posting",()=>{
 const card=account("Manual installment override","credit_card"),merchant="(04/12) Fixture Shop";
 const uploaded=uploadStatement(1,input(card,header+`2025-04-18,Laptop,${merchant},expense,12.34,,manual-installment,\n`));
 assert.equal(statementDetail(1,uploaded.id).entries[0].row?.isInstallment,true);
 resolveRow(uploaded.id,0,{action:"edit",correction:{date:"2025-04-18",description:"Laptop",merchant,type:"expense",amount:"12.34"}});
 assert.equal(statementDetail(1,uploaded.id).entries[0].row?.isInstallment,false);
 assert.equal(autoImportStatement(1,uploaded.id).imported,1);
 const id=statementDetail(1,uploaded.id).entries[0].transactionId!;
 assert.equal(db.prepare("SELECT is_installment FROM transactions WHERE id=?").get(id)?.is_installment,0);
 assert.equal(balanceFor(1,card),-1234);
});

test("revised Merchant Type Category template imports the supplied quoted rows and trailing empty cells",()=>{
 const card=account("Revised import template","credit_card");
 const text='Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes\n"Mar 7, 2026","Mar 9, 2026","UNIQLO SM FAIRVIEW, QUEZON CITY",1292.00,,,,\n"Apr 5, 2026","Apr 7, 2026",(15/24) SILICON VALLEY-SM FAIR,1791.25,,,,\n';
 const imported=importTransactions(1,input(card,text));assert.equal(imported.imported,2);assert.equal(imported.needsAttention,0);
 const detail=statementDetail(1,imported.id);assert.equal(detail.parser_version,"luna-full-statement-v2");
 assert.deepEqual(exportRows(1).filter(row=>row.account_id===card).map(row=>({merchant:row.merchant,description:row.description,kind:row.kind,installment:row.is_installment,category:row.category_id,amount:row.amount})),[
  {merchant:"UNIQLO SM FAIRVIEW, QUEZON CITY",description:"",kind:"expense",installment:0,category:null,amount:129200},
  {merchant:"(15/24) SILICON VALLEY-SM FAIR",description:"",kind:"expense",installment:1,category:null,amount:179125}
 ]);
 assert.equal(detail.entries[0].raw.type,"");assert.equal(detail.entries[0].raw["unknown column 8"],"");
 assert.equal(balanceFor(1,card),-308325);assert.equal(downloadStatement(1,imported.id).bytes.toString(),text);
 assert.equal(importTransactions(1,input(card,text)).duplicate,true);assert.equal(balanceFor(1,card),-308325);
});

test("source Type and Category are independent; explicit credits post correctly and invalid types or signs stay unposted",()=>{
 const card=account("Independent import classification","credit_card"),text="Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes\n,2025-05-01,Typed installment,10,Installments,Food,Billed only\n,2025-05-02,Typed expense (04/12),2,Expense,,\n,2025-05-03,Typed refund,3,Refund,Food,\n,2025-05-04,Typed income,4,Income,Salary,\n,2025-05-05,Unclear credit,-1,,Food,\n,2025-05-06,Wrong type,8,Food,Expense,\n,2025-05-07,Wrong sign,-8,Expense,,\n,2025-05-08,Unfunded payment,-5,Payment,,\n";
 const imported=importTransactions(1,input(card,text));assert.equal(imported.imported,4);assert.equal(imported.needsAttention,4);
 const detail=statementDetail(1,imported.id),rows=exportRows(1).filter(row=>row.account_id===card);
 assert.deepEqual(rows.map(row=>[row.kind,row.is_installment,row.category_id]),[["expense",1,1],["expense",0,null],["refund",0,1],["income",0,2]]);
 assert.equal(detail.entries[0].raw.type,"Installments");assert.equal(detail.entries[0].raw.categoryHint,"Food");assert.equal(detail.entries[0].row?.notes,"Billed only");
 assert.equal(detail.entries[4].row?.kind,"unresolved");assert.equal(detail.entries[5].row,null);assert.match(detail.entries[5].warnings,/type/i);assert.equal(detail.entries[6].row,null);
 assert.equal(balanceFor(1,card),-500);
});

test("full statements import billed installments only; metadata is informational; unknown credits and unfunded repayments wait",()=>{
 const card=account("Card","credit_card");
 const text="Issuer,Fixture\nUnknown summary,keep me\nPrevious balance,0\nOutstanding balance,999\nSale date,Post date,Description,Amount,Category,Transaction notes\n,2025-04-10,First purchase,10,,\n,2025-04-11,Installment,12,,INSTALMENT 1 OF 12\n,2025-04-12,PAYMENT RECEIVED - THANK YOU,-5,,\n,2025-04-13,Merchant credit,-3,,\n,2025-04-14,Invalid amount,1.234,,\n";
 const result=importTransactions(1,input(card,text));assert.equal(result.imported,2);assert.equal(result.needsAttention,3);assert.equal(balanceFor(1,card),-2200);
 const detail=statementDetail(1,result.id);assert.equal(detail.entries[1].row?.notes,"INSTALMENT 1 OF 12");assert.ok(detail.discrepancies.length);assert.equal(detail.entries[3].row?.kind,"unresolved");
 resolveRow(result.id,3,{action:"import",reviewedKind:"refund"});assert.equal(balanceFor(1,card),-1900);
 assert.equal((db.prepare("SELECT count(*) n FROM transactions WHERE account_id=?").get(card) as {n:number}).n,3);
});

test("blank categories create, assign, clear and export; explicitly invalid categories are rejected",()=>{
 const bank=account(),created=createTransaction(1,transaction(bank));
 const assigned=correctTransaction(1,created.id,transaction(bank,{categoryId:1}),transactionVersion(1,created.id));
 const cleared=correctTransaction(1,assigned.id,transaction(bank),transactionVersion(1,assigned.id));
 assert.equal(exportRows(1).find(row=>row.id===cleared.id)?.category_id,null);assert.equal(balanceFor(1,bank),-1000);
 for(const categoryId of [0,-1,1.5,2,3,999])assert.throws(()=>createTransaction(1,transaction(bank,{categoryId})),/category|Category|Invalid/);
 const imported=importTransactions(1,input(bank,header+"2025-05-12,Imported,Shop,expense,3,Food,clear-category,\n"));
 const record=exportRows(1).find(row=>row.description==="Imported")!;assert.equal(record.category_id,1);
 const changed=correctTransaction(1,record.id,transaction(bank,{date:record.posted_date,amount:record.amount,description:record.description,merchant:record.merchant}),transactionVersion(1,record.id));
 assert.equal(statementDetail(1,imported.id).entries[0].transactionId,changed.id);assert.equal(exportRows(1).find(row=>row.id===changed.id)?.category_name,null);
});

test("stable source identities auto-link only agreeing financial details; possible matches require a choice",()=>{
 const bank=account(),first=importTransactions(1,input(bank,header+"2025-04-10,Lunch,Cafe,expense,10,,stable,\n"));
 const overlap=importTransactions(1,input(bank,header+"2025-04-10,Changed source text,Cafe,expense,10,,stable,\n"));assert.equal(overlap.linked,1);assert.equal(overlap.imported,0);
 const conflict=importTransactions(1,input(bank,header+"2025-04-10,Lunch,Cafe,expense,11,,stable,\n"));assert.equal(conflict.needsAttention,1);assert.equal(conflict.imported,0);
 const possible=importTransactions(1,input(bank,header+"2025-04-10,Lunch,Cafe,expense,10,,different,\n"));assert.equal(possible.needsAttention,1);
 resolveRow(possible.id,0,{action:"import",reason:"A second legitimate purchase"});assert.equal(balanceFor(1,bank),-2000);
 const original=statementDetail(1,first.id).entries[0].transactionId;assert.ok(original);
 const withoutIdentity=importTransactions(1,input(bank,header+"2025-04-10,Different text,Cafe,expense,10,,,\n"));
 assert.throws(()=>resolveRow(withoutIdentity.id,0,{action:"link",transactionId:original}),/incompatible/);
 assert.equal(balanceFor(1,bank),-2000);
});

test("legitimate repeated purchases stay unresolved until explicitly imported separately; retries do not duplicate",()=>{
 const bank=account(),text=header+"2025-04-10,Same,Cafe,expense,10,,,\n2025-04-10,Same,Cafe,expense,10,,,\n",result=importTransactions(1,input(bank,text));
 assert.equal(result.imported,0);assert.equal(result.needsAttention,2);
 const detail=statementDetail(1,result.id),decisions=detail.entries.map(entry=>({entryId:entry.id,action:"import" as const,reason:"Two real purchases"}));
 const request={version:detail.version,decisions};resolveStatement(1,result.id,request);assert.equal(balanceFor(1,bank),-2000);
 assert.equal(resolveStatement(1,result.id,request).imported,2);assert.equal(balanceFor(1,bank),-2000);
 assert.throws(()=>resolveStatement(1,result.id,{...request,decisions:[{...decisions[0],reason:"Changed retry"}]}),/differs/);
 const overlap=importTransactions(1,input(bank,text.replace(/\n/g,"\r\n")));assert.equal(overlap.needsAttention,2);assert.equal(overlap.imported,0);
 resolveRow(overlap.id,0,{action:"skip",reason:"Already recorded"});assert.equal(balanceFor(1,bank),-2000);
});

for(const cardFirst of [true,false])test("both sides of a repayment create one transfer ("+(cardFirst?"card":"bank")+" first)",()=>{
 const bank=account("Funding "+cardFirst),other=account("Wrong funding"),card=account("Card "+cardFirst,"credit_card");
 const cardText=header+"2025-04-12,Repayment,Bank,payment,30,,card-payment,\n",bankText=header+"2025-04-12,Card debit,Card,transfer,30,,bank-payment,Card "+cardFirst+"\n";
 const first=importTransactions(1,input(cardFirst?card:bank,cardFirst?cardText:bankText,cardFirst?{fundingAccountId:bank}:{}));
 const second=importTransactions(1,input(cardFirst?bank:card,cardFirst?bankText:cardText));
 assert.equal(first.imported,1);assert.equal(second.imported,0);assert.equal(second.needsAttention,1);
 const id=statementDetail(1,first.id).entries[0].transactionId!;
 assert.throws(()=>resolveRow(second.id,0,{action:"link",transactionId:id,destinationId:other}),/different destination/);
 resolveRow(second.id,0,{action:"link",transactionId:id});
 assert.equal(balanceFor(1,bank),-3000);assert.equal(balanceFor(1,card),3000);
 assert.deepEqual(db.prepare("SELECT kind,count(*) n FROM transactions WHERE account_id=? GROUP BY kind").all(bank),[{kind:"transfer",n:1}]);
});

test("exception correction, refresh, link and skip preserve immutable source; stale/malformed edits roll back",()=>{
 const bank=account(),manual=createTransaction(1,transaction(bank,{description:"Corrected"}));
 const result=importTransactions(1,input(bank,header+"not-a-date,Bad source,Cafe,expense,10,Food,repair,\n"));
 const initial=statementDetail(1,result.id),entryId=initial.entries[0].id,raw=initial.entries[0].raw;
 const correction={date:"2025-04-10",description:"Corrected",merchant:"Cafe",type:"expense",amount:"10",notes:"Fixed date"};
 const edit={entryId,action:"edit" as const,correction,categoryId:null};
 resolveStatement(1,result.id,{version:initial.version,decisions:[edit]});
 const detail=statementDetail(1,result.id);assert.deepEqual(detail.entries[0].raw,raw);assert.equal(detail.entries[0].category?.label,"Uncategorized");assert.ok(detail.entries[0].candidates.some(candidate=>candidate.id===manual.id));assert.equal(balanceFor(1,bank),-1000);
 assert.throws(()=>resolveStatement(1,result.id,{version:initial.version,decisions:[{entryId,action:"import"}]}),/changed/);
 assert.throws(()=>resolveStatement(1,result.id,{version:detail.version,decisions:[edit,edit]}),/invalid correction/);
 assert.throws(()=>resolveRow(result.id,0,{...edit,categoryId:3}),/Category/);
 assert.throws(()=>resolveRow(result.id,0,{...edit,categoryId:"1" as unknown as number}),/Category/);
 assert.throws(()=>resolveRow(result.id,0,{...edit,correction:{...correction,amount:"1.001"}}),/amount|decimal|PHP|Invalid/);
 assert.deepEqual(statementDetail(1,result.id).entries[0].row,detail.entries[0].row);
 const request={version:detail.version,decisions:[{entryId,action:"link" as const,transactionId:manual.id,categoryId:null,correction}]};
 resolveStatement(1,result.id,request);resolveStatement(1,result.id,request);assert.equal(balanceFor(1,bank),-1000);
 assert.ok(db.prepare("SELECT 1 FROM audit_events WHERE entity_id=? AND action='import.row.correct'").get(result.id));
 const skipped=importTransactions(1,input(bank,header+"wrong,Skip,Cafe,expense,1,,,\n"));resolveRow(skipped.id,0,{action:"skip",reason:"Unusable row"});assert.equal(statementDetail(1,skipped.id).entries[0].action,"skip");
});

test("failed subset commit retains original and rows; explicit recovery is atomic and idempotent",()=>{
 const bank=account(),text=header+"2025-04-10,First,Cafe,expense,12,,first,\n2025-04-11,Second,Shop,expense,13,,second,\n";
 db.exec("CREATE TRIGGER fail_fixture BEFORE INSERT ON account_entries WHEN NEW.delta=-1300 BEGIN SELECT RAISE(ABORT,'fixture disk failure'); END");
 let result;try{result=importTransactions(1,input(bank,text));}finally{db.exec("DROP TRIGGER fail_fixture");}
 assert.equal(result.imported,0);assert.equal(result.needsAttention,2);assert.match(result.error,/Posting failed/);assert.equal(balanceFor(1,bank),0);assert.equal(downloadStatement(1,result.id).bytes.toString(),text);
 assert.equal(importTransactions(1,input(bank,text)).imported,0);
 const detail=statementDetail(1,result.id);assert.throws(()=>autoImportStatement(1,result.id,"stale"),/changed/);
 assert.equal(autoImportStatement(1,result.id,detail.version).imported,2);assert.equal(balanceFor(1,bank),-2500);autoImportStatement(1,result.id);assert.equal(balanceFor(1,bank),-2500);
});

test("unauthorized accounts and invalid files never post; existing pending uploads need explicit continuation",()=>{
 const bank=account(),foreign=account("Foreign","bank",2);
 assert.throws(()=>importTransactions(1,input(foreign,header)),/unavailable/);assert.throws(()=>importTransactions(1,input(bank,header,{filename:"secret.xlsx"})),/unsupported/);
 const failed=importTransactions(1,input(bank,"wrong\nheader\n"));assert.equal(failed.status,"failed");assert.equal(failed.imported,0);
 const text=header+"2025-04-10,Pending,Cafe,expense,7,,,\n",staged=uploadStatement(1,input(bank,text));
 assert.equal(importTransactions(1,input(bank,text)).imported,0);assert.equal(balanceFor(1,bank),0);
 assert.throws(()=>autoImportStatement(2,staged.id),/unavailable/);autoImportStatement(1,staged.id,statementDetail(1,staged.id).version);assert.equal(balanceFor(1,bank),-700);
});

test("retirement snapshots database and private files; reopens locks once; financial identities and pending uploads survive",()=>{
 const folder=join(root,"migration");mkdirSync(folder);const path=join(folder,"luna.sqlite");writeFileSync(path,db.serialize());
 const fixture=new Database(path);fixture.pragma("foreign_keys=ON");fixture.exec("DELETE FROM app_migrations");
 const upload=fixture.prepare("SELECT id,account_id FROM statements WHERE owner_id=1 LIMIT 1").get() as {id:number;account_id:number};
 fixture.prepare("INSERT INTO reconciliations(owner_id,statement_id,account_id,period_start,period_end,opening_balance,closing_balance,expected_closing,difference,state,resolved_entries,actor_id) VALUES(1,?,?,'2025-04-01','2025-04-30',0,0,0,0,'finalized','retained evidence',1)").run(upload.id,upload.account_id);
 fixture.prepare("UPDATE statements SET status='reconciled' WHERE id=?").run(upload.id);
 const repayment=fixture.prepare("SELECT s.id,t.id transaction_id FROM statements s JOIN transactions t ON t.counter_account_id=s.account_id WHERE t.kind='transfer' AND t.owner_id=s.owner_id LIMIT 1").get() as {id:number;transaction_id:number};
 fixture.prepare("INSERT INTO statement_payment_allocations(owner_id,statement_id,transaction_id,amount,request_key) VALUES(1,?,?,100,'preserved-historical-allocation')").run(repayment.id,repayment.transaction_id);
 const tables=["transactions","account_entries","statement_entries","statement_decisions","statement_payment_allocations"],before=tables.map(table=>fixture.prepare("SELECT * FROM "+table).all());
 const pending=fixture.prepare("SELECT e.* FROM statement_entries e LEFT JOIN statement_decisions d ON d.entry_id=e.id WHERE d.entry_id IS NULL").all();
 retireVerification(fixture,originals);
 assert.deepEqual(tables.map(table=>fixture.prepare("SELECT * FROM "+table).all()),before);assert.deepEqual(fixture.prepare("SELECT e.* FROM statement_entries e LEFT JOIN statement_decisions d ON d.entry_id=e.id WHERE d.entry_id IS NULL").all(),pending);
 assert.equal((fixture.prepare("SELECT state,resolved_entries FROM reconciliations").get() as {state:string}).state,"reopened");assert.equal((fixture.prepare("SELECT count(*) n FROM audit_events WHERE action='verification.retire'").get() as {n:number}).n,1);
 const snapshot=(fixture.prepare("SELECT snapshot_path FROM app_migrations").get() as {snapshot_path:string}).snapshot_path as string,saved=new Database(join(snapshot,"luna.sqlite"),{readonly:true});
 assert.equal(saved.pragma("integrity_check",{simple:true}),"ok");assert.equal((saved.prepare("SELECT state FROM reconciliations").get() as {state:string}).state,"finalized");assert.deepEqual(saved.prepare("SELECT * FROM transactions").all(),before[0]);saved.close();
 for(const file of readdirSync(originals))assert.ok(readFileSync(join(originals,file)).equals(readFileSync(join(snapshot,"private-statements",file))));
 retireVerification(fixture,originals);assert.equal(readdirSync(join(folder,"migration-backups")).length,1);assert.equal((fixture.prepare("SELECT count(*) n FROM audit_events WHERE action='verification.retire'").get() as {n:number}).n,1);fixture.close();
});

test("missing private originals abort retirement without reopening evidence or marking migration complete",()=>{
 const folder=join(root,"broken-migration");mkdirSync(folder);const path=join(folder,"luna.sqlite");writeFileSync(path,db.serialize());const fixture=new Database(path);fixture.exec("DELETE FROM app_migrations");
 assert.throws(()=>retireVerification(fixture,join(folder,"missing")),/Private originals directory missing/);assert.equal((fixture.prepare("SELECT count(*) n FROM app_migrations").get() as {n:number}).n,0);
 const incomplete=join(folder,"incomplete");mkdirSync(incomplete);assert.throws(()=>retireVerification(fixture,incomplete),/ENOENT|original/);assert.equal((fixture.prepare("SELECT count(*) n FROM app_migrations").get() as {n:number}).n,0);fixture.close();
});

test.after(()=>{db.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&root.includes("luna-transaction-first-"));rmSync(root,{recursive:true,force:true});});


test("past statement against a today-opened card retains posting dates and waits for confirmed history extension",()=>{
 const card=account("Historical card","credit_card"),today=new Date().toISOString().slice(0,10);db.prepare("UPDATE accounts SET opening_date=? WHERE id=?").run(today,card);
 const source="Sale date,Post date,Merchant,Amount\n,2025-04-10,Historical purchase,12.34\n";
 const result=importTransactions(1,input(card,source));assert.equal(result.imported,0);assert.equal(balanceFor(1,card),0);
 const before=statementDetail(1,result.id);assert.equal(before.entries[0].row?.date,"2025-04-10");assert.equal(before.entries[0].blockers[0].code,"before_history");assert.doesNotMatch(before.entries[0].blockers[0].message,/future/i);
 assert.equal(before.historyExtension?.proposedDate,"2025-04-10");assert.equal(before.historyExtension?.openingDate,today);
 extendStatementHistory(1,result.id,{version:before.version});assert.equal(balanceFor(1,card),0);
 assert.throws(()=>extendStatementHistory(1,result.id,{version:before.version}),/Reload/);
 const after=statementDetail(1,result.id);assert.equal(autoImportStatement(1,result.id,after.version).imported,1);assert.equal(balanceFor(1,card),-1234);
 autoImportStatement(1,result.id);assert.equal(balanceFor(1,card),-1234);assert.equal(downloadStatement(1,result.id).bytes.toString(),source);
});


test("legacy partial upload recovers only pending rows; funding dates, credits, malformed and future rows remain actionable",()=>{
 const today=new Date().toISOString().slice(0,10),card=account("Partial historical card","credit_card"),bank=account("Recent funding");
 db.prepare("UPDATE accounts SET opening_date=? WHERE id IN (?,?)").run(today,card,bank);
 const text=header+today+",Current,Cafe,expense,1,,current,\n2025-04-10,Old,Shop,expense,2,,old,\n2025-04-11,Payment,Bank,payment,3,,pay,\n2099-01-01,Future,Shop,expense,4,,,\n2025-02-30,Impossible,Shop,expense,5,,,\n";
 const result=importTransactions(1,input(card,text,{fundingAccountId:bank}));assert.equal(result.imported,1);
 const before=statementDetail(1,result.id),saved=db.prepare("SELECT * FROM statement_decisions WHERE statement_id=?").all(result.id),ids=before.entries.map(e=>e.id);
 db.prepare("UPDATE statement_entries SET normalized_json=NULL,warnings='Posting date must be within account history and not in the future' WHERE statement_id=? AND row_index IN (1,2,3)").run(result.id);
 const legacy=statementDetail(1,result.id);assert.equal(legacy.historyExtension?.affectedRows,2);
 assert.throws(()=>commitStatement(1,result.id,{version:legacy.version,decisions:[{entryId:ids[1],action:"import"}]}),/Before account history/);
 assert.throws(()=>reprocessStatement(1,result.id),/Committed|Reviewed/);
 extendStatementHistory(1,result.id,{version:legacy.version});
 assert.deepEqual(statementDetail(1,result.id).entries.map(e=>e.id),ids);assert.deepEqual(db.prepare("SELECT * FROM statement_decisions WHERE statement_id=?").all(result.id),saved);
 const after=statementDetail(1,result.id);assert.ok(after.entries[2].blockers.some(b=>b.code==="funding"));assert.ok(after.entries[3].blockers.some(b=>b.code==="future_date"));assert.ok(after.entries[4].blockers.some(b=>b.code==="invalid_date"));
 assert.equal(db.prepare("SELECT opening_date FROM accounts WHERE id=?").get(bank)?.opening_date,today);
 assert.equal(autoImportStatement(1,result.id,after.version).imported,2);assert.equal(balanceFor(1,card),-300);assert.equal(balanceFor(1,bank),0);
 assert.deepEqual(statementDetail(1,result.id).entries[0],after.entries[0]);
});

test("opening balances, finalized reconciliations, foreign/archived ownership and source mismatch prevent history writes",()=>{
 const today=new Date().toISOString().slice(0,10);
 for(const conflict of ["opening","reconciliation","source","index","archive"]){
  const card=account("Guard "+conflict,"credit_card");db.prepare("UPDATE accounts SET opening_date=? WHERE id=?").run(today,card);
  const uploaded=uploadStatement(1,input(card,header+"2025-04-10,Past,Shop,expense,2,,,\n"));
  if(conflict==="opening")createTransaction(1,{kind:"opening",date:today,amount:100,accountId:card,idempotencyKey:crypto.randomUUID()});
  if(conflict==="reconciliation")db.prepare("INSERT INTO reconciliations(owner_id,statement_id,account_id,period_start,period_end,opening_balance,closing_balance,expected_closing,difference,state,resolved_entries,actor_id) VALUES(1,?,?,'2025-04-01','2025-04-30',0,0,0,0,'finalized','[]',1)").run(uploaded.id,card);
  if(conflict==="source")db.prepare("UPDATE statement_entries SET raw_json='{}' WHERE statement_id=?").run(uploaded.id);
  if(conflict==="index")db.prepare("UPDATE statement_entries SET row_index=42 WHERE statement_id=?").run(uploaded.id);
  const detail=statementDetail(1,uploaded.id);
  if(conflict==="archive")db.prepare("UPDATE accounts SET archived_at=CURRENT_TIMESTAMP WHERE id=?").run(card);
  const before=db.prepare("SELECT * FROM transactions WHERE account_id=?").all(card);
  assert.throws(()=>extendStatementHistory(2,uploaded.id,{version:detail.version}),/unavailable/);
  assert.throws(()=>extendStatementHistory(1,uploaded.id,{version:detail.version}),/opening-balance|reconciliation|mismatch|unavailable/);
  assert.equal(db.prepare("SELECT opening_date FROM accounts WHERE id=?").get(card)?.opening_date,today);assert.deepEqual(db.prepare("SELECT * FROM transactions WHERE account_id=?").all(card),before);
 }
});

test("history change, row recovery and audit roll back together on database failure",()=>{
 const card=account("Rollback history","credit_card"),today=new Date().toISOString().slice(0,10);db.prepare("UPDATE accounts SET opening_date=? WHERE id=?").run(today,card);
 const uploaded=uploadStatement(1,input(card,header+"2025-04-10,Past,Shop,expense,2,,,\n"));db.prepare("UPDATE statement_entries SET normalized_json=NULL WHERE statement_id=?").run(uploaded.id);
 const detail=statementDetail(1,uploaded.id);
 db.exec("CREATE TRIGGER fail_history_audit BEFORE INSERT ON audit_events WHEN NEW.action='statement.extend-history' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 try{assert.throws(()=>extendStatementHistory(1,uploaded.id,{version:detail.version}),/fixture failure/);}finally{db.exec("DROP TRIGGER fail_history_audit");}
 assert.equal(db.prepare("SELECT opening_date FROM accounts WHERE id=?").get(card)?.opening_date,today);assert.equal(db.prepare("SELECT normalized_json FROM statement_entries WHERE statement_id=?").get(uploaded.id)?.normalized_json,null);assert.equal(balanceFor(1,card),0);
 extendStatementHistory(1,uploaded.id,{version:detail.version});assert.equal(statementDetail(1,uploaded.id).entries[0].row?.date,"2025-04-10");
});

test("formatting preview is non-mutating, exact, deterministic; malformed financial fields remain blocked",()=>{
 const card=account("Formatting preview","credit_card"),text='\uFEFF Sale   date , Posting   date , Merchant , Amount , Type , Category , Transaction notes ,\r\n,2025-04-10,"Shop, City",-12.34,Refund,,,\r\n,04/05/2025,Ambiguous,1,,,,\r\n,2025-04-12,Precision,1.234,,,,\r\n,2025-04-13,Grouping,"1,23.00",,,,\r\n,2025-04-14,Unknown,1,,,,nonempty\r\n';
 const payload=input(card,text),before=db.prepare("SELECT count(*) n FROM statements").get(),preview=previewTransactionImport(1,payload);
 assert.deepEqual(db.prepare("SELECT count(*) n FROM statements").get(),before);assert.equal(previewTransactionImport(1,payload).version,preview.version);
 assert.ok(preview.changes.some(c=>c.includes("BOM")));assert.ok(preview.changes.some(c=>c.includes("whitespace")));assert.ok(preview.changes.some(c=>c.includes("trailing")));assert.ok(preview.changes.some(c=>c.includes("aliases")));
 assert.equal(preview.rows[0].row?.amount,1234);assert.equal(preview.rows[0].row?.direction,1);assert.equal(preview.rows[0].row?.description,"Shop, City");assert.ok(preview.rows.slice(1).every(r=>r.warning));
 const uploaded=uploadStatement(1,payload),detail=statementDetail(1,uploaded.id);assert.deepEqual(detail.entries.map(e=>e.row),JSON.parse(JSON.stringify(preview.rows.map(e=>e.row))));assert.equal(downloadStatement(1,uploaded.id).bytes.toString(),text);
 db.prepare("UPDATE accounts SET opening_date='2025-04-11' WHERE id=?").run(card);assert.notEqual(previewTransactionImport(1,payload).version,preview.version);
});


test("legacy recovered duplicates remain review items before any posting",()=>{
 const card=account("Legacy duplicate card","credit_card"),today=new Date().toISOString().slice(0,10);db.prepare("UPDATE accounts SET opening_date=? WHERE id=?").run(today,card);
 const line="2025-04-10,Repeated,Shop,expense,2,,,\n",uploaded=uploadStatement(1,input(card,header+line+line));
 db.prepare("UPDATE statement_entries SET normalized_json=NULL WHERE statement_id=?").run(uploaded.id);
 let detail=statementDetail(1,uploaded.id);assert.ok(detail.entries.every(e=>e.repeated));
 extendStatementHistory(1,uploaded.id,{version:detail.version});detail=statementDetail(1,uploaded.id);
 assert.equal(autoImportStatement(1,uploaded.id,detail.version).imported,0);assert.equal(balanceFor(1,card),0);
 assert.ok(statementDetail(1,uploaded.id).entries.every(e=>e.blockers.some(b=>b.code==="duplicate")));
});

test("correction enforces funding-account history without changing evidence or balances",()=>{
 const card=account("Correction card","credit_card"),bank=account("Correction funding"),today=new Date().toISOString().slice(0,10);db.prepare("UPDATE accounts SET opening_date=? WHERE id=?").run(today,bank);
 const uploaded=uploadStatement(1,input(card,header+"2025-04-10,Payment,Bank,payment,2,,,\n",{fundingAccountId:bank}));
 const before=db.prepare("SELECT * FROM statement_entries WHERE statement_id=?").all(uploaded.id),detail=statementDetail(1,uploaded.id);
 assert.throws(()=>resolveStatement(1,uploaded.id,{version:detail.version,decisions:[{entryId:detail.entries[0].id,action:"edit",correction:{date:"2025-04-10",description:"Payment",merchant:"Bank",type:"payment",amount:"2"}}]}),/Funding.transfer account.*Before account history/);
 assert.deepEqual(db.prepare("SELECT * FROM statement_entries WHERE statement_id=?").all(uploaded.id),before);assert.equal(balanceFor(1,card),0);assert.equal(balanceFor(1,bank),0);
});
