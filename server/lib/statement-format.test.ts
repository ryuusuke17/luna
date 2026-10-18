import test,{after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {parseCreditCardStatementCsv} from "../../src/lib/credit-card-csv.ts";
import {parseStatementCsv,statementDiscrepancies} from "./statement-csv.ts";

process.env.LUNA_DB_PATH=":memory:";
const {db}=await import("./db.ts");
const {importCreditCardStatement,creditCardStatementDetail,downloadCreditCardStatement}=await import("./credit-card-statements.ts");
const {creditCardLedgerReview,reviewCreditCardLine}=await import("./credit-card-ledger.ts");
const sample=readFileSync(new URL("./fixtures/UnionBank - 2026-09-2.csv",import.meta.url),"utf8");
db.exec("INSERT INTO users(id,username,password_hash) VALUES(1,'owner','test'); INSERT INTO accounts(id,owner_id,name,type,opening_date,issuer) VALUES(1,1,'Card','credit_card','2026-01-01','UnionBank')");

test("attached format: both parsers retain 20 lines, blank sale dates, explicit types and exact totals",()=>{
 const card=parseCreditCardStatementCsv(sample,{currency:"PHP"}),full=parseStatementCsv(sample)!;
 assert.equal(card.lines.length,20);assert.equal(full.rows.length,20);
 assert.ok(card.lines.every(line=>line.saleDate===null));
 assert.ok(full.rows.every(entry=>entry.row&&entry.row.saleDate===undefined&&!entry.warning));
 assert.equal(card.metadata.originalOutstandingBalance,1342759);
 assert.equal(card.balanceMismatch,false);assert.deepEqual(statementDiscrepancies(full.summary,full.rows.map(entry=>entry.row!)),[]);
 assert.equal(card.reconciliation.positiveLineSum,1353668);assert.equal(card.reconciliation.negativeLineSum,-1100000);
 const payment=full.rows[14];assert.equal(payment.raw.type,"Card repayment received");assert.equal(payment.row!.kind,"transfer");assert.equal(payment.row!.direction,1);assert.equal(payment.row!.amount,1100000);
 assert.ok(full.rows.slice(-4).every(entry=>entry.row!.isInstallment));
 assert.equal(full.rows.at(-1)!.raw.notes,"Source column 8: 0");
 assert.equal(card.lines.at(-1)!.transactionNotesRaw,"Source column 8: 0");
 assert.equal(card.lines[3].merchantRaw,'LAYER7 NET* R7 NETWORK, BIEBERGEMUEND, DE (EUR 5.99)');
 assert.equal(card.lines[3].amountSigned,43715);
});

test("column mapping never confuses category, notes and type; invalid headers/dates/extra data fail safely",()=>{
 const categorized=sample.replace('500.00,,,Expense','500.00,Food,Keep note,Expense');
 const card=parseCreditCardStatementCsv(categorized,{currency:"PHP"}),full=parseStatementCsv(categorized)!;
 assert.equal(card.lines[0].typeRaw,"Expense");assert.equal(card.lines[0].categoryRaw,"Food");assert.equal(card.lines[0].transactionNotesRaw,"Keep note");
 assert.equal(full.rows[0].raw.type,"Expense");assert.equal(full.rows[0].row!.categoryHint,"Food");assert.equal(full.rows[0].row!.notes,"Keep note");
 assert.throws(()=>parseCreditCardStatementCsv(sample.replace('Transaction type','Unknown type'),{currency:"PHP"}),/Row 13/);
 assert.throws(()=>parseStatementCsv(sample.replace('Transaction type','Unknown type')),/headers/);
 assert.throws(()=>parseStatementCsv(sample.replace('Category,Transaction notes,Transaction type','Type,Transaction notes,Transaction type')),/headers/);
 assert.throws(()=>parseCreditCardStatementCsv(sample.replace('500.00,,,Expense','500.00,,,Expense,hidden'),{currency:"PHP"}),/unexpected nonempty/);
 assert.throws(()=>parseCreditCardStatementCsv(sample.replace(',"Aug 10, 2026"',',"Aug 32, 2026"'),{currency:"PHP"}),/Invalid date/);
 assert.match(parseStatementCsv(sample.replace('500.00,,,Expense','500.00,,,Unknown'))!.rows[0].warning,/Type must/);
 const template=readFileSync(new URL('../../public/credit_card_statement_import_template.csv',import.meta.url),'utf8');
 assert.equal(parseCreditCardStatementCsv(template,{currency:"PHP"}).balanceMismatch,false);
 assert.ok(parseStatementCsv(template)!.rows.every(entry=>entry.row&&!entry.warning));
});

test("issued import preserves original bytes; approval honors explicit installment and expense types",()=>{
 const input={filename:"UnionBank - 2026-09-2.csv",base64:Buffer.from(sample).toString("base64"),cardId:1,currency:"PHP"};
 const preview=importCreditCardStatement(1,input);assert.equal(preview.preview!.lines.length,20);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions").get()!.n,0);
 const saved=importCreditCardStatement(1,{...input,confirm:true}),id=saved.existingId!;
 assert.equal(importCreditCardStatement(1,input).existingId,id);
 assert.equal(downloadCreditCardStatement(1,id).bytes.toString(),sample);
 const approve=(statementId:number,lineId:number)=>reviewCreditCardLine(1,statementId,{action:"review-line",lineId,decision:"import",classification:"expense",reason:"",version:creditCardLedgerReview(1,statementId,lineId).version,requestKey:randomUUID()});
 const installment=creditCardStatementDetail(1,id).lines.at(-1)!;
 approve(id,installment.id);
 assert.equal(db.prepare("SELECT is_installment FROM transactions WHERE idempotency_key=?").get(`cc-line:${installment.id}`)!.is_installment,1);
 const explicitExpense=sample.replace('4054.70,,Source column 8: 0,Installments','4054.70,,Source column 8: 0,Expense');
 const second=importCreditCardStatement(1,{...input,base64:Buffer.from(explicitExpense).toString('base64'),confirm:true,allowAdditional:true}).existingId!;
 const expense=creditCardStatementDetail(1,second).lines.at(-1)!;
 // ponytail: void first posting to isolate explicit type mapping; duplicate guards remain covered by ledger suites.
 db.prepare("UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE idempotency_key=?").run(`cc-line:${installment.id}`);
 approve(second,expense.id);
 assert.equal(db.prepare("SELECT is_installment FROM transactions WHERE idempotency_key=?").get(`cc-line:${expense.id}`)!.is_installment,0);
 assert.equal(downloadCreditCardStatement(1,id).bytes.toString(),sample);
});
after(()=>db.close());
