import {createHash} from "node:crypto";
import {z} from "zod";
import {db} from "./db.ts";
import {parseCreditCardStatementCsv,exactStatementSum,signedStatementAmount} from "../../src/lib/credit-card-csv.ts";
import {isCalendarDate} from "../../src/lib/finance.ts";

// ponytail: source bytes share the private SQLite backup lifecycle; use private object storage when files outgrow 2 MB.
db.exec(`
CREATE TABLE IF NOT EXISTS cc_statements(
 id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),card_id INTEGER NOT NULL REFERENCES accounts(id),
 currency TEXT NOT NULL,filename TEXT NOT NULL,file_hash TEXT NOT NULL,source_bytes BLOB NOT NULL,parser_version TEXT NOT NULL,
 metadata_json TEXT NOT NULL,raw_metadata_json TEXT NOT NULL,reconciliation_json TEXT NOT NULL,warnings_json TEXT NOT NULL,
 statement_date TEXT NOT NULL,due_date TEXT NOT NULL,original_balance INTEGER NOT NULL,minimum_due INTEGER NOT NULL,
 review_note TEXT NOT NULL DEFAULT '',supersedes_id INTEGER REFERENCES cc_statements(id),superseded_by INTEGER REFERENCES cc_statements(id),
 tracking_confirmed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,card_id,file_hash)
);
CREATE INDEX IF NOT EXISTS cc_statement_date_idx ON cc_statements(owner_id,statement_date DESC);
CREATE INDEX IF NOT EXISTS cc_statement_card_idx ON cc_statements(owner_id,card_id,statement_date DESC);
CREATE TABLE IF NOT EXISTS cc_statement_lines(
 id INTEGER PRIMARY KEY,statement_id INTEGER NOT NULL REFERENCES cc_statements(id),row_index INTEGER NOT NULL,
 post_date TEXT NOT NULL,amount INTEGER NOT NULL,source_json TEXT NOT NULL,UNIQUE(statement_id,row_index)
);
CREATE INDEX IF NOT EXISTS cc_line_date_idx ON cc_statement_lines(statement_id,post_date);
CREATE TABLE IF NOT EXISTS cc_line_annotations(
 line_id INTEGER PRIMARY KEY REFERENCES cc_statement_lines(id),actor_id INTEGER NOT NULL REFERENCES users(id),
 type_override TEXT NOT NULL DEFAULT '',category_override TEXT NOT NULL DEFAULT '',notes_override TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cc_payments(
 id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),card_id INTEGER NOT NULL REFERENCES accounts(id),
 payment_date TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),currency TEXT NOT NULL,source_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
 source_name_snapshot TEXT NOT NULL,reference TEXT NOT NULL,notes TEXT NOT NULL,request_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,request_key)
);
CREATE INDEX IF NOT EXISTS cc_payment_card_idx ON cc_payments(owner_id,card_id,payment_date);
CREATE TABLE IF NOT EXISTS cc_allocations(
 payment_id INTEGER NOT NULL REFERENCES cc_payments(id),statement_id INTEGER NOT NULL REFERENCES cc_statements(id),
 amount INTEGER NOT NULL CHECK(amount>0),PRIMARY KEY(payment_id,statement_id)
);
CREATE TABLE IF NOT EXISTS cc_payment_evidence(
 line_id INTEGER PRIMARY KEY REFERENCES cc_statement_lines(id),payment_id INTEGER NOT NULL REFERENCES cc_payments(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
const id=z.number().int().positive().safe();
const date=z.string().refine(isCalendarDate,"Choose a valid date");
const upload=z.object({filename:z.string().min(1).max(180).regex(/^[^/\\\x00-\x1f]+\.csv$/i),base64:z.string().min(1).max(2_666_668),cardId:id,currency:z.string().regex(/^[A-Z]{3}$/),confirm:z.boolean().optional(),acknowledge:z.boolean().optional(),reviewNote:z.string().max(2000).optional(),supersedesId:id.optional(),allowAdditional:z.boolean().optional()}).strict();
type Card={id:number;name:string;last4:string|null;issuer:string|null;credit_limit:number|null};
type StatementRecord={id:number;owner_id:number;card_id:number;currency:string;filename:string;file_hash:string;parser_version:string;metadata_json:string;raw_metadata_json:string;reconciliation_json:string;warnings_json:string;statement_date:string;due_date:string;original_balance:number;minimum_due:number;review_note:string;supersedes_id:number|null;superseded_by:number|null;tracking_confirmed:number;created_at:string;card_name:string;last4:string|null;issuer:string|null;applied:number};
const columns="s.id,s.owner_id,s.card_id,s.currency,s.filename,s.file_hash,s.parser_version,s.metadata_json,s.raw_metadata_json,s.reconciliation_json,s.warnings_json,s.statement_date,s.due_date,s.original_balance,s.minimum_due,s.review_note,s.supersedes_id,s.superseded_by,s.tracking_confirmed,s.created_at,a.name card_name,a.last4,a.issuer,COALESCE((SELECT SUM(x.amount) FROM cc_allocations x WHERE x.statement_id=s.id),0) applied";
function audit(owner:number,action:string,entity:number,details:unknown){db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,?,?,?)").run(owner,`credit-card.${action}`,entity,JSON.stringify(details));}
export function creditCards(owner:number){return db.prepare("SELECT id,name,last4,issuer,credit_limit FROM accounts WHERE owner_id=? AND type='credit_card' AND archived_at IS NULL ORDER BY name").all(owner) as Card[];}
function card(owner:number,cardId:number){const found=creditCards(owner).find(c=>c.id===cardId);if(!found)throw Error("Select an owned, active credit card account");return found;}
function statement(owner:number,statementId:number){
 const found=db.prepare(`SELECT ${columns} FROM cc_statements s JOIN accounts a ON a.id=s.card_id AND a.owner_id=s.owner_id WHERE s.owner_id=? AND s.id=?`).get(owner,statementId) as StatementRecord|undefined;
 if(!found)throw Error("Statement unavailable");return found;
}
export function statementPaymentStatus(balance:number,applied:number,due:string,tracked:boolean,today=new Date().toISOString().slice(0,10)){
 if(balance<0)return"credit_balance";if(balance===0||applied>=balance)return"paid";
 if(due<today)return"past_due_unverified";if(!tracked&&!applied)return"not_tracked";return applied?"partial":"unpaid";
}
function present(row:StatementRecord){
 const {owner_id,metadata_json,raw_metadata_json,reconciliation_json,warnings_json,...safe}=row;
 return{...safe,metadata:JSON.parse(metadata_json),rawMetadata:JSON.parse(raw_metadata_json),reconciliation:JSON.parse(reconciliation_json),warnings:JSON.parse(warnings_json),remaining:Math.max(0,row.original_balance-row.applied),status:statementPaymentStatus(row.original_balance,row.applied,row.due_date,Boolean(row.tracking_confirmed)),reviewStatus:row.review_note?"Reviewed differences":"Reconciled"};
}
export function importCreditCardStatement(owner:number,input:unknown){
 const value=upload.parse(input),target=card(owner,value.cardId),bytes=Buffer.from(value.base64,"base64");
 if(!bytes.length||bytes.length>2_000_000||bytes.toString("base64")!==value.base64)throw Error("Choose a valid nonempty CSV up to 2 MB");
 const fileHash=createHash("sha256").update(bytes).digest("hex");
 const existing=db.prepare("SELECT id FROM cc_statements WHERE owner_id=? AND card_id=? AND file_hash=?").get(owner,target.id,fileHash) as {id:number}|undefined;
 if(existing)return{duplicate:true,existingId:existing.id};
 let text:string;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw Error("Use UTF-8 encoding");}
 const preview=parseCreditCardStatementCsv(text,{currency:value.currency});
 const issuerMismatch=Boolean(target.issuer&&target.issuer.trim().toLowerCase()!==preview.metadata.issuer.trim().toLowerCase());
 const crossCard=db.prepare("SELECT id,card_id FROM cc_statements WHERE owner_id=? AND file_hash=?").all(owner,fileHash);
 const sameDate=db.prepare("SELECT id,filename FROM cc_statements WHERE owner_id=? AND card_id=? AND statement_date=? AND superseded_by IS NULL").all(owner,target.id,preview.metadata.statementDate) as {id:number;filename:string}[];
 const warnings=[...preview.warnings,...(issuerMismatch?["Source issuer differs from selected card issuer"]:[]),...(crossCard.length?["Identical bytes already imported to another card; verify the selected destination"]:[])];
 if(!value.confirm)return{duplicate:false,preview:{...preview,warnings},sameDate,crossCard,requiresReview:preview.balanceMismatch||issuerMismatch||crossCard.length>0};
 if((preview.balanceMismatch||issuerMismatch||crossCard.length>0)&&(!value.acknowledge||!value.reviewNote?.trim()))throw Error("Acknowledge warnings and enter a review explanation");
 if(sameDate.length&&!value.supersedesId&&!value.allowAdditional)throw Error("Review the existing issue: choose replacement or explicitly confirm an additional issue");
 return db.transaction(()=>{
  const duplicate=db.prepare("SELECT id FROM cc_statements WHERE owner_id=? AND card_id=? AND file_hash=?").get(owner,target.id,fileHash) as {id:number}|undefined;
  if(duplicate)return{duplicate:true,existingId:duplicate.id};
  if(value.supersedesId){const original=statement(owner,value.supersedesId);if(original.card_id!==target.id||original.currency!==value.currency||original.statement_date!==preview.metadata.statementDate||original.superseded_by)throw Error("Replacement must target the active issue of this card, currency and date");if(original.applied)throw Error("Remove payment allocations before replacing this statement");}
  const m=preview.metadata;
  const newId=Number(db.prepare("INSERT INTO cc_statements(owner_id,card_id,currency,filename,file_hash,source_bytes,parser_version,metadata_json,raw_metadata_json,reconciliation_json,warnings_json,statement_date,due_date,original_balance,minimum_due,review_note,supersedes_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(owner,target.id,value.currency,value.filename,fileHash,bytes,preview.parserVersion,JSON.stringify(m),JSON.stringify(preview.metadataRaw),JSON.stringify(preview.reconciliation),JSON.stringify(warnings),m.statementDate,m.dueDate,m.originalOutstandingBalance,m.minimumDue,value.reviewNote??"",value.supersedesId??null).lastInsertRowid);
  const insert=db.prepare("INSERT INTO cc_statement_lines(statement_id,row_index,post_date,amount,source_json) VALUES(?,?,?,?,?)");
  for(const line of preview.lines)insert.run(newId,line.rowNumber,line.postDate,line.amountSigned,JSON.stringify(line));
  if(value.supersedesId)db.prepare("UPDATE cc_statements SET superseded_by=? WHERE owner_id=? AND id=?").run(newId,owner,value.supersedesId);
  audit(owner,"import",newId,{hash:fileHash,cardId:target.id,rows:preview.lines.length,supersedesId:value.supersedesId??null});
  return{duplicate:false,existingId:newId};
 }).immediate();
}
const filters=z.object({year:z.string().regex(/^\d{4}$/).optional(),month:z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).optional(),issuer:z.string().max(240).optional(),cards:z.string().regex(/^\d+(?:,\d+)*$/).max(500).optional(),status:z.enum(["not_tracked","unpaid","partial","paid","past_due_unverified","credit_balance"]).optional(),search:z.string().max(200).optional(),page:z.string().regex(/^[1-9]\d{0,5}$/).optional(),sort:z.enum(["newest","oldest","balance"]).optional()}).strict();
export function listCreditCardStatements(owner:number,input:unknown={}){
 const f=filters.parse(input),where=["s.owner_id=?","s.superseded_by IS NULL"],args:(number|string)[]=[owner];
 if(f.year){where.push("substr(s.statement_date,1,4)=?");args.push(f.year);}
 if(f.month){where.push("substr(s.statement_date,1,7)=?");args.push(f.month);}
 if(f.issuer){where.push("COALESCE(a.issuer,json_extract(s.metadata_json,'$.issuer'))=?");args.push(f.issuer);}
 if(f.cards){const ids=f.cards.split(",").map(Number);if(!ids.every(Number.isSafeInteger))throw Error("Invalid card filter");where.push(`s.card_id IN (${ids.map(()=>"?").join(",")})`);args.push(...ids);}
 if(f.search){where.push("(a.name LIKE ? OR s.filename LIKE ? OR json_extract(s.metadata_json,'$.title') LIKE ?)");args.push(...Array(3).fill(`%${f.search}%`));}
 const statusExpression="CASE WHEN s.original_balance<0 THEN 'credit_balance' WHEN s.original_balance=0 OR applied>=s.original_balance THEN 'paid' WHEN s.due_date<date('now') THEN 'past_due_unverified' WHEN s.tracking_confirmed=0 AND applied=0 THEN 'not_tracked' WHEN applied>0 THEN 'partial' ELSE 'unpaid' END";
 const base=`SELECT ${columns} FROM cc_statements s JOIN accounts a ON a.id=s.card_id AND a.owner_id=s.owner_id WHERE ${where.join(" AND ")}`;
 const scoped=`SELECT *,${statusExpression} tracker_status FROM (${base}) s`;
 const final=`SELECT * FROM (${scoped}) WHERE ${f.status?"tracker_status=?":"1=1"}`,finalArgs=[...args,...(f.status?[f.status]:[])];
 // Aggregation excludes source blobs and line JSON; summary never reads the general ledger.
 const metrics=db.prepare(`SELECT currency,COUNT(*) statements,COUNT(DISTINCT card_id) cards,SUM(original_balance) originalBalance,SUM(minimum_due) minimumDue,SUM(applied) applied,SUM(MAX(0,original_balance-applied)) remaining,SUM(json_extract(metadata_json,'$.newCharges')) newCharges FROM (${final}) GROUP BY currency`).safeIntegers(true).all(...finalArgs).map(row=>Object.fromEntries(Object.entries(row as Record<string,string|bigint>).map(([key,value])=>{
  if(typeof value!=="bigint")return[key,value];const number=Number(value);if(!Number.isSafeInteger(number))throw Error("Filtered statement totals exceed supported range; narrow filters");return[key,number];
 })));
 const total=(db.prepare(`SELECT COUNT(*) total FROM (${final})`).get(...finalArgs) as {total:number}).total;
 const page=Number(f.page??1),pageSize=25,order=f.sort==="oldest"?"statement_date,id":f.sort==="balance"?"original_balance DESC,id DESC":"statement_date DESC,id DESC";
 const rows=db.prepare(`${final} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...finalArgs,pageSize,(page-1)*pageSize) as StatementRecord[];
 const allCards=creditCards(owner),selectedIds=f.cards?.split(",").map(Number);
 const cards=allCards.filter(c=>(!f.issuer||c.issuer===f.issuer)&&(!selectedIds||selectedIds.includes(c.id))).map(c=>{
  const latest=db.prepare(`SELECT ${columns} FROM cc_statements s JOIN accounts a ON a.id=s.card_id WHERE s.owner_id=? AND s.card_id=? AND s.superseded_by IS NULL ORDER BY s.statement_date DESC,s.id DESC LIMIT 1`).get(owner,c.id) as StatementRecord|undefined;
  const selected=f.month?db.prepare("SELECT id FROM cc_statements WHERE owner_id=? AND card_id=? AND substr(statement_date,1,7)=? AND superseded_by IS NULL ORDER BY statement_date DESC,id DESC").all(owner,c.id,f.month) as {id:number}[]:[];
  return{...c,latest:latest?present(latest):null,selectedMonthCount:f.month?selected.length:null,selectedMonth:selected.length?present(statement(owner,selected[0].id)):null};
 });
 return{items:rows.map(present),total,page,pageSize,metrics,cards,allCards,issuers:[...new Set(allCards.map(c=>c.issuer).filter(Boolean))]};
}
const lineFilters=z.object({page:z.string().regex(/^[1-9]\d{0,5}$/).optional(),search:z.string().max(200).optional(),type:z.string().max(100).optional(),category:z.string().max(100).optional(),sign:z.enum(["debit","credit"]).optional(),start:date.optional(),end:date.optional(),sort:z.enum(["source","sale","post","amount","merchant"]).optional()}).strict();
export function creditCardStatementDetail(owner:number,statementId:number,input:unknown={}){
 const saved=statement(owner,statementId),f=lineFilters.parse(input),where=["l.statement_id=?"],args:(string|number)[]=[statementId];
 if(f.start&&f.end&&f.start>f.end)throw Error("Start date must precede end date");
 if(f.search){where.push("(json_extract(l.source_json,'$.merchantRaw') LIKE ? OR COALESCE(n.notes_override,json_extract(l.source_json,'$.transactionNotesRaw')) LIKE ?)");args.push(`%${f.search}%`,`%${f.search}%`);}
 if(f.type){where.push("COALESCE(NULLIF(n.type_override,''),json_extract(l.source_json,'$.typeRaw'))=?");args.push(f.type);}
 if(f.category){where.push("COALESCE(NULLIF(n.category_override,''),json_extract(l.source_json,'$.categoryRaw'))=?");args.push(f.category);}
 if(f.sign)where.push(f.sign==="debit"?"l.amount>0":"l.amount<0");
 if(f.start){where.push("l.post_date>=?");args.push(f.start);}if(f.end){where.push("l.post_date<=?");args.push(f.end);}
 const condition=where.join(" AND "),joins="FROM cc_statement_lines l LEFT JOIN cc_line_annotations n ON n.line_id=l.id";
 const total=(db.prepare(`SELECT COUNT(*) total ${joins} WHERE ${condition}`).get(...args) as {total:number}).total;
 const page=Number(f.page??1),pageSize=50,order=({source:"l.row_index",sale:"json_extract(l.source_json,'$.saleDate'),l.row_index",post:"l.post_date,l.row_index",amount:"l.amount,l.row_index",merchant:"json_extract(l.source_json,'$.merchantRaw'),l.row_index"})[f.sort??"source"];
 const lines=(db.prepare(`SELECT l.id,l.source_json,n.type_override,n.category_override,n.notes_override,(SELECT payment_id FROM cc_payment_evidence e WHERE e.line_id=l.id) evidence_payment_id ${joins} WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize) as {id:number;source_json:string;type_override:string|null;category_override:string|null;notes_override:string|null;evidence_payment_id:number|null}[]).map(({source_json,...line})=>({...line,source:JSON.parse(source_json)}));
 const payments=db.prepare("SELECT p.id,p.payment_date,p.amount,p.currency,p.source_account_id,p.source_name_snapshot,p.reference,p.notes,COALESCE((SELECT SUM(amount) FROM cc_allocations x WHERE x.payment_id=p.id),0) allocated,COALESCE((SELECT amount FROM cc_allocations x WHERE x.payment_id=p.id AND x.statement_id=?),0) applied_here FROM cc_payments p WHERE p.owner_id=? AND p.card_id=? ORDER BY p.payment_date DESC,p.id DESC").all(statementId,owner,saved.card_id);
 const history=(db.prepare(`SELECT ${columns} FROM cc_statements s JOIN accounts a ON a.id=s.card_id WHERE s.owner_id=? AND s.card_id=? ORDER BY s.statement_date DESC,s.id DESC LIMIT 100`).all(owner,saved.card_id) as StatementRecord[]).map(present);
 const sources=db.prepare("SELECT id,name FROM accounts WHERE owner_id=? AND archived_at IS NULL AND type IN ('cash','bank','wallet') ORDER BY name").all(owner);
 return{...present(saved),lines,total,page,pageSize,payments,history,sources};
}
export function downloadCreditCardStatement(owner:number,statementId:number){
 statement(owner,statementId);const file=db.prepare("SELECT source_bytes,filename,file_hash FROM cc_statements WHERE owner_id=? AND id=?").get(owner,statementId) as {source_bytes:Buffer;filename:string;file_hash:string};
 if(createHash("sha256").update(file.source_bytes).digest("hex")!==file.file_hash)throw Error("Source integrity check failed");return{bytes:file.source_bytes,filename:file.filename};
}
const annotation=z.object({lineId:id,type:z.string().max(100),category:z.string().max(100),notes:z.string().max(2000)}).strict();
const payment=z.object({cardId:id,date,amount:z.string().max(40),currency:z.string().regex(/^[A-Z]{3}$/),sourceAccountId:id.nullable(),reference:z.string().max(240),notes:z.string().max(2000),requestKey:z.string().uuid()}).strict();
const allocation=z.object({paymentId:id,statementId:id,amount:z.string().max(40),sameDayConfirmed:z.boolean().optional()}).strict();
export function mutateCreditCardStatement(owner:number,statementId:number,input:unknown){
 const action=z.discriminatedUnion("action",[
  z.object({action:z.literal("annotate"),data:annotation}).strict(),
  z.object({action:z.literal("payment"),data:payment}).strict(),
  z.object({action:z.literal("correct-payment"),data:payment.omit({requestKey:true}).extend({paymentId:id})}).strict(),
  z.object({action:z.literal("allocate"),data:allocation}).strict(),
  z.object({action:z.literal("unallocate"),paymentId:id}).strict(),
  z.object({action:z.literal("evidence"),lineId:id,paymentId:id}).strict(),
  z.object({action:z.literal("unlink-evidence"),lineId:id}).strict(),
  z.object({action:z.literal("tracking"),confirmed:z.boolean()}).strict()
 ]).parse(input);
 return db.transaction(()=>{
  const saved=statement(owner,statementId);
  if(action.action==="tracking"){db.prepare("UPDATE cc_statements SET tracking_confirmed=? WHERE owner_id=? AND id=?").run(Number(action.confirmed),owner,statementId);}
  else if(action.action==="annotate"){
   const v=action.data;if(!db.prepare("SELECT id FROM cc_statement_lines WHERE id=? AND statement_id=?").get(v.lineId,statementId))throw Error("Line unavailable");
   db.prepare("INSERT INTO cc_line_annotations(line_id,actor_id,type_override,category_override,notes_override) VALUES(?,?,?,?,?) ON CONFLICT(line_id) DO UPDATE SET actor_id=excluded.actor_id,type_override=excluded.type_override,category_override=excluded.category_override,notes_override=excluded.notes_override,updated_at=CURRENT_TIMESTAMP").run(v.lineId,owner,v.type,v.category,v.notes);
  }else if(action.action==="payment"||action.action==="correct-payment"){
   const v=action.data;if(saved.superseded_by||v.cardId!==saved.card_id||v.currency!==saved.currency)throw Error("Payment must match the active statement card and currency");
   const amount=signedStatementAmount(v.amount,v.currency);if(amount<=0)throw Error("Payment must be positive");
   let source:{name:string}|undefined;if(v.sourceAccountId!==null){source=db.prepare("SELECT name FROM accounts WHERE id=? AND owner_id=? AND archived_at IS NULL AND type IN ('cash','bank','wallet')").get(v.sourceAccountId,owner) as {name:string}|undefined;if(!source)throw Error("Choose an owned cash, bank or wallet funding source");}
   if("paymentId" in v){
    const existing=db.prepare("SELECT id FROM cc_payments WHERE owner_id=? AND id=? AND card_id=? AND currency=?").get(owner,v.paymentId,v.cardId,v.currency);
    if(!existing)throw Error("Payment unavailable");
    if(db.prepare("SELECT 1 FROM cc_allocations WHERE payment_id=? UNION SELECT 1 FROM cc_payment_evidence WHERE payment_id=?").get(v.paymentId,v.paymentId))throw Error("Remove all allocations and evidence links before correcting a payment");
    db.prepare("UPDATE cc_payments SET payment_date=?,amount=?,source_account_id=?,source_name_snapshot=?,reference=?,notes=? WHERE id=? AND owner_id=?").run(v.date,amount,v.sourceAccountId,source?.name??"Unknown",v.reference,v.notes,v.paymentId,owner);
   }else{
    const existing=db.prepare("SELECT id FROM cc_payments WHERE owner_id=? AND request_key=?").get(owner,v.requestKey);if(!existing)db.prepare("INSERT INTO cc_payments(owner_id,card_id,payment_date,amount,currency,source_account_id,source_name_snapshot,reference,notes,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)").run(owner,v.cardId,v.date,amount,v.currency,v.sourceAccountId,source?.name??"Unknown",v.reference,v.notes,v.requestKey);
   }
  }else if(action.action==="allocate"){
   const v=action.data,p=db.prepare("SELECT * FROM cc_payments WHERE id=? AND owner_id=?").get(v.paymentId,owner) as {card_id:number;currency:string;amount:number;payment_date:string}|undefined;
   if(v.statementId!==statementId||!p||saved.superseded_by||p.card_id!==saved.card_id||p.currency!==saved.currency)throw Error("Allocation requires the same owned card and currency");
   if(p.payment_date<saved.statement_date||p.payment_date===saved.statement_date&&!v.sameDayConfirmed)throw Error("Payment must be after issue; same-day payments require explicit exclusion-from-source confirmation");
   const amount=signedStatementAmount(v.amount,p.currency);if(amount<=0)throw Error("Allocation must be positive");
   const others=db.prepare("SELECT amount FROM cc_allocations WHERE payment_id=? AND statement_id<>?").all(v.paymentId,statementId) as {amount:number}[];
   if(exactStatementSum([...others.map(x=>x.amount),amount])>p.amount)throw Error("Allocations exceed payment amount");
   const otherHere=db.prepare("SELECT amount FROM cc_allocations WHERE statement_id=? AND payment_id<>?").all(statementId,v.paymentId) as {amount:number}[];
   if(exactStatementSum([...otherHere.map(x=>x.amount),amount])>Math.max(0,saved.original_balance))throw Error("Allocation exceeds the statement amount due");
   db.prepare("INSERT INTO cc_allocations(payment_id,statement_id,amount) VALUES(?,?,?) ON CONFLICT(payment_id,statement_id) DO UPDATE SET amount=excluded.amount").run(v.paymentId,statementId,amount);
  }else if(action.action==="unallocate"){
   db.prepare("DELETE FROM cc_allocations WHERE statement_id=? AND payment_id IN (SELECT id FROM cc_payments WHERE owner_id=? AND id=?)").run(statementId,owner,action.paymentId);
  }else{
   const line=db.prepare("SELECT amount,post_date FROM cc_statement_lines WHERE id=? AND statement_id=?").get(action.lineId,statementId) as {amount:number;post_date:string}|undefined;
   if(!line)throw Error("Line unavailable");
   if(action.action==="unlink-evidence")db.prepare("DELETE FROM cc_payment_evidence WHERE line_id=?").run(action.lineId);
   else{
    const p=db.prepare("SELECT card_id,currency,amount,payment_date FROM cc_payments WHERE id=? AND owner_id=?").get(action.paymentId,owner) as {card_id:number;currency:string;amount:number;payment_date:string}|undefined;
    if(!p||p.card_id!==saved.card_id||p.currency!==saved.currency||line.amount>=0||p.amount!==-line.amount||Math.abs(Date.parse(p.payment_date)-Date.parse(line.post_date))>7*86400000)throw Error("Evidence requires the same card/currency, exact amount, posted within seven days");
    db.prepare("INSERT INTO cc_payment_evidence(line_id,payment_id,actor_id) VALUES(?,?,?) ON CONFLICT(line_id) DO UPDATE SET payment_id=excluded.payment_id,actor_id=excluded.actor_id,created_at=CURRENT_TIMESTAMP").run(action.lineId,action.paymentId,owner);
   }
  }
  audit(owner,action.action,statementId,action);return{ok:true};
 }).immediate();
}
