import test,{after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {parseCreditCardStatementCsv} from "../../src/lib/credit-card-csv.ts";
process.env.LUNA_DB_PATH=":memory:";
const {db}=await import("./db.ts");
const {importCreditCardStatement,listCreditCardStatements,creditCardStatementDetail,mutateCreditCardStatement,downloadCreditCardStatement,statementPaymentStatus}=await import("./credit-card-statements.ts");
const sample=readFileSync(new URL("../../public/unionbank_april_2026_statement_sample.csv",import.meta.url),"utf8");
db.exec("INSERT INTO users(id,username,password_hash) VALUES(1,'owner','test'),(2,'other','test'); INSERT INTO accounts(id,owner_id,name,type,opening_date,last4,issuer) VALUES(1,1,'Card one','credit_card','2026-01-01','1234','UnionBank'),(2,1,'Card two','credit_card','2026-01-01','5678','UnionBank'),(3,1,'Cash','cash','2026-01-01',NULL,NULL),(4,2,'Other card','credit_card','2026-01-01','9999','UnionBank'),(5,2,'Other cash','cash','2026-01-01',NULL,NULL)");
const input=(text=sample,extra={})=>({filename:"statement.csv",base64:Buffer.from(text).toString("base64"),cardId:1,currency:"PHP",...extra});
const ledger=()=>["accounts","transactions","account_entries","statement_imports","statement_import_rows","statements","statement_entries","statement_decisions","statement_payment_allocations"].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]);
let statementId=0,paymentId=0;

test("exact supplied fixture: 13 lines; exact reconciliation; April issue month",()=>{
 const p=parseCreditCardStatementCsv(sample,{currency:"PHP"});assert.equal(p.lines.length,13);assert.equal(p.metadata.statementMonth,"2026-04");assert.equal(p.lines[0].saleDate,"2026-03-07");assert.equal(p.lines[0].merchantRaw,"UNIQLO SM FAIRVIEW, QUEZON CITY");
 assert.deepEqual(p.reconciliation,{positiveLineSum:1505142,negativeLineSum:-1120000,netLineSum:385142,calculatedClosingBalance:1496931,reportedClosingBalance:1496931,closingDifference:0,newChargesDifference:0,creditDifference:0});assert.equal(p.balanceMismatch,false);
 assert.equal(parseCreditCardStatementCsv("\uFEFF"+sample.replace(/\r?\n/g,"\r\n"),{currency:"PHP"}).lines.length,13);
});
test("strict parser: empty overflow accepted, nonempty rejected with source row, invalid fields blocked",()=>{
 const lines=sample.trimEnd().split(/\r?\n/),index=lines.findIndex(l=>l.startsWith('"Mar 7,'));assert.ok(index>0);
 const trailing=[...lines];trailing[index]+=",";assert.ok(parseCreditCardStatementCsv(trailing.join("\n"),{currency:"PHP"}).warnings.some(w=>w.includes(`Row ${index+1}`)));
 trailing[index]+="secret";assert.throws(()=>parseCreditCardStatementCsv(trailing.join("\n"),{currency:"PHP"}),new RegExp(`Row ${index+1}: unexpected nonempty`));
 for(const text of [sample.replace("1292.00","1292.001"),sample.replace("1292.00","NaN"),sample.replace("1292.00","1e3"),sample.replace("Apr 7, 2026","Apr 31, 2026"),sample.replace("Issuer,UnionBank","Unknown,UnionBank"),sample.replace("Issuer,UnionBank","Issuer,UnionBank\nIssuer,Duplicate")])assert.throws(()=>parseCreditCardStatementCsv(text,{currency:"PHP"}));
 const repeated=[...lines,lines[index]].join("\n"),p=parseCreditCardStatementCsv(repeated,{currency:"PHP"});assert.equal(p.lines.length,14);assert.notEqual(p.lines[0].rowNumber,p.lines[13].rowNumber);assert.equal(p.balanceMismatch,true);
 const title=parseCreditCardStatementCsv(sample.replace("April 2026","May 2026"),{currency:"PHP"});assert.equal(title.metadata.statementMonth,"2026-04");assert.ok(title.warnings.some(w=>w.includes("title differs")));
});
test("preview is nonpersistent; confirm atomic; duplicates; owner isolation; no ledger changes",()=>{
 const before=ledger(),preview=importCreditCardStatement(1,input());assert.ok(preview.preview);assert.equal(listCreditCardStatements(1).total,0);
 const imported=importCreditCardStatement(1,input(sample,{confirm:true}));statementId=imported.existingId!;assert.ok(statementId);
 assert.equal(importCreditCardStatement(1,input()).existingId,statementId);assert.equal(importCreditCardStatement(1,input()).duplicate,true);
 assert.equal(creditCardStatementDetail(1,statementId).remaining,1496931);assert.equal(downloadCreditCardStatement(1,statementId).bytes.toString(),sample);
 assert.throws(()=>creditCardStatementDetail(2,statementId));assert.throws(()=>downloadCreditCardStatement(2,statementId));assert.throws(()=>importCreditCardStatement(1,input(sample,{cardId:4})));
 assert.equal(listCreditCardStatements(2).total,0);assert.deepEqual(ledger(),before);
});
test("statement-date filters; exact card identity; missing is not zero; currencies separate",()=>{
 assert.equal(listCreditCardStatements(1,{month:"2026-03"}).total,0);assert.equal(listCreditCardStatements(1,{month:"2026-04",year:"2026"}).total,1);
 const april=listCreditCardStatements(1,{month:"2026-04"});assert.equal(april.cards.find(c=>c.id===2)?.selectedMonthCount,0);assert.equal(april.cards.find(c=>c.id===1)?.selectedMonthCount,1);
 assert.equal(listCreditCardStatements(1,{cards:"2"}).total,0);assert.equal(listCreditCardStatements(1,{issuer:"UnionBank"}).total,1);
 const cross=importCreditCardStatement(1,input(sample,{cardId:2,currency:"USD"}));assert.ok(cross.requiresReview);assert.throws(()=>importCreditCardStatement(1,input(sample,{cardId:2,currency:"USD",confirm:true})));
 importCreditCardStatement(1,input(sample,{cardId:2,currency:"USD",confirm:true,acknowledge:true,reviewNote:"Verified independent USD card fixture"}));
 const metrics=listCreditCardStatements(1).metrics;assert.equal(metrics.length,2);assert.equal(listCreditCardStatements(1,{cards:"1,2"}).total,2);
});
test("annotations only overlay; payment allocation is post-issue; exact remaining; source immutable",()=>{
 const before=ledger(),original=downloadCreditCardStatement(1,statementId).bytes,detail=creditCardStatementDetail(1,statementId),line=detail.lines[0];
 mutateCreditCardStatement(1,statementId,{action:"annotate",data:{lineId:line.id,type:"charge",category:"Clothing",notes:"Reviewed"}});
 const changed=creditCardStatementDetail(1,statementId);assert.deepEqual(changed.lines[0].source,line.source);assert.equal(changed.lines[0].category_override,"Clothing");
 const payment={action:"payment",data:{cardId:1,currency:"PHP",date:"2026-04-08",amount:"3000.00",sourceAccountId:3,reference:"Receipt 123",notes:"Cash source",requestKey:randomUUID()}};
 mutateCreditCardStatement(1,statementId,payment);mutateCreditCardStatement(1,statementId,payment);
 const payments=creditCardStatementDetail(1,statementId).payments;assert.equal(payments.length,1);paymentId=payments[0].id;assert.equal(payments[0].source_name_snapshot,"Cash");
 mutateCreditCardStatement(1,statementId,{action:"allocate",data:{paymentId,statementId,amount:"3000.00"}});
 const paid=creditCardStatementDetail(1,statementId);assert.equal(paid.remaining,1196931);assert.equal(paid.original_balance,1496931);assert.equal(paid.applied,300000);
 assert.throws(()=>mutateCreditCardStatement(1,statementId,{action:"allocate",data:{paymentId,statementId,amount:"3000.01"}}),/exceed/);
 const {requestKey,...correction}=payment.data;assert.ok(requestKey);
 assert.throws(()=>mutateCreditCardStatement(1,statementId,{action:"correct-payment",data:{...correction,paymentId}}),/Remove all allocations/);
 assert.throws(()=>mutateCreditCardStatement(2,statementId,{action:"tracking",confirmed:true}));
 assert.throws(()=>mutateCreditCardStatement(1,statementId,{...payment,data:{...payment.data,sourceAccountId:5,requestKey:randomUUID()}}));
 assert.deepEqual(downloadCreditCardStatement(1,statementId).bytes,original);assert.deepEqual(ledger(),before);
 assert.equal(listCreditCardStatements(1,{cards:"1"}).items[0].remaining,1196931);
});
test("later imported payment evidence links only by review; no duplicate payment or same-issue deduction",()=>{
 const may=sample.replace("April 2026","May 2026").replace('Statement date,"Apr 7, 2026"','Statement date,"May 7, 2026"').replace('Due date,"Apr 24, 2026"','Due date,"May 24, 2026"').replace('"Mar 20, 2026","Mar 23, 2026",BDO BILLS PAYMENT -CASH,-11200.00','"Apr 8, 2026","Apr 8, 2026",BDO BILLS PAYMENT -CASH,-3000.00');
 const preview=importCreditCardStatement(1,input(may));assert.ok(preview.preview?.balanceMismatch);
 assert.throws(()=>importCreditCardStatement(1,input(may,{confirm:true})),/Acknowledge/);
 const result=importCreditCardStatement(1,input(may,{confirm:true,acknowledge:true,reviewNote:"Reviewed summary-only credits"})),mayId=result.existingId!;
 const detail=creditCardStatementDetail(1,mayId),negative=detail.lines.find(l=>l.source.amountSigned<0)!;assert.ok(negative);assert.equal(detail.remaining,1496931);
 mutateCreditCardStatement(1,mayId,{action:"evidence",lineId:negative.id,paymentId});assert.equal(creditCardStatementDetail(1,mayId).lines.find(l=>l.id===negative.id)?.evidence_payment_id,paymentId);
 assert.equal(creditCardStatementDetail(1,mayId).payments.length,1);assert.equal(creditCardStatementDetail(1,mayId).remaining,1496931);
 assert.throws(()=>mutateCreditCardStatement(1,mayId,{action:"allocate",data:{paymentId,statementId:mayId,amount:"100.00"}}),/after issue/);
 mutateCreditCardStatement(1,mayId,{action:"unlink-evidence",lineId:negative.id});
});
test("supersede retains originals; allocated issues protected; transaction editing cannot mutate sources",()=>{
 const corrected=sample.replace("Statement notes,","Statement notes,Corrected notes"),source=downloadCreditCardStatement(1,statementId).bytes;
 assert.throws(()=>importCreditCardStatement(1,input(corrected,{confirm:true})),/existing issue/);
 assert.throws(()=>importCreditCardStatement(1,input(corrected,{confirm:true,supersedesId:statementId})),/Remove payment allocations/);
 mutateCreditCardStatement(1,statementId,{action:"unallocate",paymentId});
 const replacement=importCreditCardStatement(1,input(corrected,{confirm:true,supersedesId:statementId}));assert.equal(creditCardStatementDetail(1,statementId).superseded_by,replacement.existingId);assert.deepEqual(downloadCreditCardStatement(1,statementId).bytes,source);
 assert.equal(listCreditCardStatements(1,{month:"2026-04",cards:"1"}).total,1);
 const transaction=Number(db.prepare("INSERT INTO transactions(owner_id,kind,posted_date,amount,account_id,description) VALUES(1,'expense','2026-04-07',100,1,'Unrelated')").run().lastInsertRowid);db.prepare("UPDATE transactions SET description='Edited' WHERE id=?").run(transaction);db.prepare("DELETE FROM transactions WHERE id=?").run(transaction);assert.deepEqual(downloadCreditCardStatement(1,statementId).bytes,source);
});
test("one payment spans same-card cycles; over-allocation and same-day ambiguity rejected",()=>{
 const april=listCreditCardStatements(1,{cards:"1",month:"2026-04"}).items[0],may=listCreditCardStatements(1,{cards:"1",month:"2026-05"}).items[0],before=ledger();
 mutateCreditCardStatement(1,april.id,{action:"payment",data:{cardId:1,currency:"PHP",date:"2026-07-07",amount:"3000.00",sourceAccountId:null,reference:"Split fixture",notes:"",requestKey:randomUUID()}});
 const p=creditCardStatementDetail(1,april.id).payments.find(p=>p.reference==="Split fixture")!;
 mutateCreditCardStatement(1,april.id,{action:"allocate",data:{paymentId:p.id,statementId:april.id,amount:"1000.00"}});
 mutateCreditCardStatement(1,may.id,{action:"allocate",data:{paymentId:p.id,statementId:may.id,amount:"2000.00"}});
 assert.throws(()=>mutateCreditCardStatement(1,may.id,{action:"allocate",data:{paymentId:p.id,statementId:may.id,amount:"2000.01"}}),/exceed/);
 assert.equal(creditCardStatementDetail(1,april.id).remaining,1396931);assert.equal(creditCardStatementDetail(1,may.id).remaining,1296931);
 mutateCreditCardStatement(1,may.id,{action:"payment",data:{cardId:1,currency:"PHP",date:may.statement_date,amount:"100.00",sourceAccountId:null,reference:"Same-day fixture",notes:"",requestKey:randomUUID()}});
 const same=creditCardStatementDetail(1,may.id).payments.find(p=>p.reference==="Same-day fixture")!;
 assert.throws(()=>mutateCreditCardStatement(1,may.id,{action:"allocate",data:{paymentId:same.id,statementId:may.id,amount:"100.00"}}),/same-day/);
 mutateCreditCardStatement(1,may.id,{action:"allocate",data:{paymentId:same.id,statementId:may.id,amount:"100.00",sameDayConfirmed:true}});
 assert.equal(creditCardStatementDetail(1,may.id).remaining,1286931);assert.deepEqual(ledger(),before);
});
test("atomic rollback includes source bytes and lines; payment status never claims bank delinquency",()=>{
 const text=sample.replace("Statement notes,","Statement notes,Rollback fixture"),count=listCreditCardStatements(1).total;
 db.exec("CREATE TRIGGER cc_test_failure BEFORE INSERT ON audit_events WHEN NEW.action='credit-card.import' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
 try{assert.throws(()=>importCreditCardStatement(1,input(text,{confirm:true,allowAdditional:true})),/fixture rollback/);}finally{db.exec("DROP TRIGGER cc_test_failure");}
 assert.equal(listCreditCardStatements(1).total,count);
 assert.equal(statementPaymentStatus(1496931,0,"2026-04-24",false,"2026-04-10"),"not_tracked");assert.equal(statementPaymentStatus(1496931,300000,"2026-04-24",true,"2026-04-25"),"past_due_unverified");assert.equal(statementPaymentStatus(1496931,1496931,"2026-04-24",true),"paid");
 const implementation=readFileSync(new URL("./credit-card-statements.ts",import.meta.url),"utf8");assert.doesNotMatch(implementation,/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:transactions|account_entries|accounts|statement_payment_allocations)\b/i);assert.doesNotMatch(implementation,/from ["']\.\/(?:ledger|payments|statements|imports)/);
 const page=readFileSync(new URL("../../src/pages/Statements.tsx",import.meta.url),"utf8");assert.doesNotMatch(page,/type="file"|StatementImporter|uploadStatement/);
});
after(()=>db.close());
