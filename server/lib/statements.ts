import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,chmodSync} from "node:fs";
import {resolve,join,relative,isAbsolute} from "node:path";
import {db} from "./db.ts";
import {createTransaction,balanceFor} from "./ledger.ts";
import {parseStatementCsv,statementDiscrepancies,parseTransactionCsv,transactionCsvFormatting} from "./statement-csv.ts";
import {isCalendarDate,parseMoney,MAX_MINOR} from "../../src/lib/finance.ts";
import {transactionType} from "../../src/lib/transactions.ts";

type Row={date:string;description:string;merchant:string;kind:"income"|"expense"|"refund"|"transfer"|"unresolved";isInstallment?:boolean;saleDate?:string;postDate?:string;sourceAmount?:number;notes?:string;categoryHint?:string;amount:number;direction:number;sourceId:string|null;destinationId?:number;categoryId?:number};
type Correction={date:string;description:string;merchant:string;type:string;amount:string;notes?:string;category?:string};
type Decision={entryId:number;action:"import"|"link"|"skip";transactionId?:number;categoryId?:number|null;destinationId?:number;reviewedKind?:"expense"|"refund"|"transfer";reason?:string;correction?:Correction};
const decisionPayload=(d:Decision)=>JSON.stringify([d.action,d.transactionId??null,d.categoryId??null,d.destinationId??null,d.reviewedKind??null,d.reason?.trim()??"",...(d.correction?[Object.keys(d.correction).sort().map(key=>[key,d.correction![key as keyof Correction]])]:[])]);
const hash=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex");
const integer=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
function account(owner:number,id:number){const a=db.prepare("SELECT * FROM accounts WHERE owner_id=? AND id=? AND archived_at IS NULL").get(owner,id) as any;if(!integer(id)||!a)throw Error("Account unavailable");return a;}
function statement(owner:number,id:number){const s=db.prepare("SELECT s.*,a.name account_name,a.type account_type FROM statements s JOIN accounts a ON a.id=s.account_id AND a.owner_id=s.owner_id WHERE s.owner_id=? AND s.id=?").get(owner,id) as any;if(!integer(id)||!s)throw Error("Statement unavailable");return s;}
function directory(){
 const configured=process.env.LUNA_STATEMENTS_PATH;if(process.env.NODE_ENV==="production"&&!configured)throw Error("Configure LUNA_STATEMENTS_PATH on a persistent private volume before uploading statements.");
 const root=resolve(configured||"./data/private-statements");
 for(const publicRoot of [resolve("public"),resolve(".output/public"),resolve("src")]){const rel=relative(publicRoot,root);if(!rel||!rel.startsWith("..")&&!isAbsolute(rel))throw Error("Statement storage must be outside public and source directories.");}
 mkdirSync(root,{recursive:true,mode:0o700});chmodSync(root,0o700);return root;
}
function filePath(key:string){if(!/^[a-f0-9-]{36}\.csv$/.test(key))throw Error("Invalid private file reference");return join(directory(),key);}
function normalize(owner:number,a:any,r:Record<string,string>):Row{
 if(!isCalendarDate(r.date))throw Error(`Invalid calendar date: ${r.date}; use unambiguous ISO YYYY-MM-DD.`);
 const installment=r.type.trim()==="installment",payment=r.type.trim()==="payment",kind=(payment?"transfer":installment?"expense":r.type.trim()) as Row['kind'];if(payment&&a.type!=="credit_card")throw Error("Payment rows require a credit card; choose the funding account during review.");if(!["income","expense","refund","transfer"].includes(kind)||(!r.description.trim()&&!r.merchant.trim())||r.description.length>240||r.merchant.length>240||(r.notes??"").length>500||(r.source_id??"").length>160||(r.category??"").length>60)throw Error("Invalid posting date, type or text length; use the PHP CSV template.");
 const amount=parseMoney(r.amount);if(amount<=0)throw Error("Amount must be positive, exact PHP with at most two decimal places.");
 const destinations=r.destination?.trim()?db.prepare("SELECT id FROM accounts WHERE owner_id=? AND archived_at IS NULL AND name=?").all(owner,r.destination.trim()) as {id:number}[]:[];
 return{date:r.date,description:r.description,merchant:r.merchant,kind,isInstallment:kind==="expense"?installment:undefined,amount,direction:payment||kind==="income"||kind==="refund"?1:-1,sourceId:r.source_id?.trim()||null,notes:r.notes,categoryHint:r.category,destinationId:destinations.length===1?destinations[0].id:undefined};
}
function reviewedRow(r:Row,kind?:string|null):Row{
 if(r.kind!=="unresolved")return r.kind==="expense"&&kind==="transfer"?{...r,kind:"transfer"}:r;
 if(kind!=="refund"&&kind!=="transfer")throw Error("Negative row requires explicit payment or refund classification");
 return{...r,kind};
}
function dateBlocker(a:any,r:Row){
 const today=new Date().toISOString().slice(0,10);
 if(!isCalendarDate(r.date))return{code:"invalid_date",message:"Invalid calendar date: "+r.date};
 if(r.date>today)return{code:"future_date",message:"Future posting date: "+r.date+"; latest allowed UTC date is "+today+"."};
 if(r.date<a.opening_date)return{code:"before_history",message:"Before account history: source posting date "+r.date+"; account opens "+a.opening_date+"."};
 return null;
}
function parsedSource(owner:number,a:any,bytes:Buffer){
 const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);if(text.includes("\0"))throw Error("Binary files are unsupported; export the PHP CSV template.");
 const full=parseStatementCsv(text);if(full&&a.type!=="credit_card")throw Error("Full spreadsheet statements require a credit-card account");
 const raw=full?full.rows:parseTransactionCsv(text);if(!raw.length)throw Error("CSV has no data rows");
 const rows=raw.map(value=>{
  let row:Row|undefined,warning="",source:Record<string,string>;
  if(full){const parsed=value as typeof full.rows[number];source=parsed.raw;row=parsed.row;warning=parsed.warning;}
  else{source=value as Record<string,string>;try{row=normalize(owner,a,source);}catch(e){warning=(e as Error).message;}}
  if(row?.kind==="expense"&&(!full||row.isInstallment===undefined))row.isInstallment=Boolean(row.isInstallment)||transactionType(row)==="installment";
  return{row,raw:source,warning};
 });
 return{full,rows,changes:transactionCsvFormatting(text)};
}
function stage(owner:number,s:any,bytes:Buffer){
 try{
  const a=account(owner,s.account_id),{full,rows}=parsedSource(owner,a,bytes);
  db.prepare("UPDATE statements SET parser_version=?,summary_json=?,raw_summary_json=?,date_policy=? WHERE id=?").run(full?.parserVersion??"luna-csv-v1",full?JSON.stringify(full.summary):null,full?JSON.stringify(full.rawSummary):null,full?"ISO or English month-name calendar dates; posting date; UTC; no pending rows":"ISO calendar dates; posting date; UTC; no pending rows",s.id);
  const insert=db.prepare("INSERT INTO statement_entries(statement_id,row_index,raw_json,normalized_json,warnings) VALUES(?,?,?,?,?)");let invalid=0;
  for(const [index,value] of rows.entries()){const warning=value.warning||(value.row?dateBlocker(a,value.row)?.message??"":"");if(warning)invalid++;insert.run(s.id,index,JSON.stringify(value.raw),value.row?JSON.stringify(value.row):null,warning);}
  db.prepare("UPDATE statements SET status=?,error=? WHERE id=?").run(invalid?"needs_attention":"ready_for_review",invalid?invalid+" rows need attention. Correct or skip them in Transactions.":full?.metadataWarnings.join(" ")??"",s.id);
 }catch(e){db.prepare("UPDATE statements SET status='failed',error=? WHERE id=?").run(e instanceof Error?e.message:"Unsupported CSV",s.id);}
}
type UploadInput={accountId:number;filename:string;mime:string;base64:string;fundingAccountId?:number};
function validatedUpload(owner:number,input:UploadInput){
 const a=account(owner,input?.accountId);if(typeof input.filename!=="string"||input.filename.length>180||/[\x00-\x1f/\\]/.test(input.filename)||!/^.+\.csv$/i.test(input.filename)||typeof input.mime!=="string"||!["text/csv","application/csv","application/vnd.ms-excel","text/plain",""].includes(input.mime)||typeof input.base64!=="string"||input.base64.length>2_666_668||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw Error("Only UTF-8 PHP template CSV files up to 2 MB are supported. XLSX/PDF are unsupported.");
 if(input.fundingAccountId!==undefined){if(a.type!=="credit_card")throw Error("Payment funding default requires a credit-card statement");fundingAccount(owner,a.id,input.fundingAccountId);}
 const bytes=Buffer.from(input.base64,"base64");if(!bytes.length||bytes.length>2_000_000)throw Error("Choose a nonempty CSV up to 2 MB");
 return{a,bytes};
}
export function previewTransactionImport(owner:number,input:UploadInput){
 const {a,bytes}=validatedUpload(owner,input),parsed=parsedSource(owner,a,bytes);
 const rows=parsed.rows.map((value,index)=>({index,row:value.row??null,warning:value.warning||(value.row?dateBlocker(a,value.row)?.message??"":"")}));
 return{preview:true as const,changes:parsed.changes,rows,version:hash(JSON.stringify([owner,input,a.opening_date,a.archived_at,rows,parsed.changes]))};
}
export function uploadStatement(owner:number,input:{accountId:number;filename:string;mime:string;base64:string;fundingAccountId?:number}){
 const {a,bytes}=validatedUpload(owner,input);
 const fileHash=hash(bytes),existing=db.prepare("SELECT id FROM statements WHERE owner_id=? AND account_id=? AND file_hash=?").get(owner,a.id,fileHash) as any;if(existing)return{id:existing.id,duplicate:true};
 const key=`${randomUUID()}.csv`,path=filePath(key);writeFileSync(path,bytes,{flag:"wx",mode:0o600});
 try{return db.transaction(()=>{const id=Number(db.prepare("INSERT INTO statements(owner_id,account_id,filename,file_key,file_hash,size,status,funding_account_id) VALUES(?,?,?,?,?,?,'processing',?)").run(owner,a.id,input.filename,key,fileHash,bytes.length,input.fundingAccountId??null).lastInsertRowid);stage(owner,{id,account_id:a.id},bytes);audit(owner,"statement.upload",id,{hash:fileHash,size:bytes.length});return{id,duplicate:false};}).immediate();}catch(e){unlinkSync(path);throw e;}
}
function audit(owner:number,action:string,id:number,details:unknown){db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,?,?,?)").run(owner,action,id,JSON.stringify(details));}
export function listStatements(owner:number){return db.prepare("SELECT s.id,s.filename,s.status,s.error,s.parser_version,s.currency,s.period_start,s.period_end,s.summary_json,s.created_at,a.name account_name,s.account_id,(SELECT count(*) FROM statement_entries e WHERE e.statement_id=s.id) rows,(SELECT count(*) FROM statement_decisions d WHERE d.statement_id=s.id AND d.action='skip') skipped,(SELECT count(*) FROM statement_decisions d WHERE d.statement_id=s.id AND d.action='import') imported,(SELECT count(*) FROM statement_decisions d WHERE d.statement_id=s.id AND d.action='link') matched,(SELECT count(*) FROM statement_entries e WHERE e.statement_id=s.id AND NOT EXISTS(SELECT 1 FROM statement_decisions d WHERE d.entry_id=e.id)) needs_review FROM statements s JOIN accounts a ON a.id=s.account_id AND a.owner_id=s.owner_id WHERE s.owner_id=? ORDER BY s.id DESC").all(owner);}
function candidates(owner:number,accountId:number,r:Row){
 const sign=r.direction;
 const text=(s:string)=>s.trim().toLowerCase().replace(/\s+/g," ");
 return (db.prepare("SELECT t.id,t.posted_date,t.kind,t.description,t.merchant,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND t.voided_at IS NULL AND e.account_id=? AND e.delta=? AND t.kind=? AND t.original_currency='PHP' AND t.posted_date BETWEEN date(?,'-3 days') AND date(?,'+3 days') ORDER BY t.id DESC LIMIT 50").all(owner,accountId,r.amount*sign,r.kind,r.date,r.date) as any[]).map(t=>({...t,evidence:t.posted_date===r.date&&(text(r.merchant)&&text(r.merchant)===text(t.merchant)||text(r.description)&&(text(r.description)===text(t.description)||!!r.postDate&&text(r.description)===text(t.merchant)))?"Strong: same signed PHP amount, posting date and text. Review required.":"Ambiguous: same signed PHP amount within three days. Not proof.",score:t.posted_date===r.date?70:40}));
}
function known(owner:number,accountId:number,r:Row){
 if(!r.sourceId)return null;
 const ids=db.prepare("SELECT transaction_id FROM csv_import_rows WHERE owner_id=? AND account_id=? AND source_id=? UNION SELECT transaction_id FROM statement_import_rows WHERE owner_id=? AND account_id=? AND source_id=? UNION SELECT d.transaction_id FROM statement_entries e JOIN statements s ON s.id=e.statement_id JOIN statement_decisions d ON d.entry_id=e.id WHERE s.owner_id=? AND s.account_id=? AND d.transaction_id IS NOT NULL AND json_extract(e.normalized_json,'$.sourceId')=?").all(owner,accountId,r.sourceId,owner,accountId,`${accountId}:${r.sourceId}`,owner,accountId,r.sourceId) as {transaction_id:number}[];
 return ids.length===1?ids[0].transaction_id:ids.length?"conflict":null;
}
function fundingAccount(owner:number,accountId:number,id:number){const a=account(owner,id);if(!["cash","bank","wallet"].includes(a.type)||a.id===accountId)throw Error("Credit payment requires a distinct cash, bank or wallet funding account.");return a;}
function categoryResolution(owner:number,r:Row,hint:string,explicit?:number|null,_create=false):{id?:number;label:string;defaultOther:boolean;error?:string}{
 if(explicit!=null&&!integer(explicit))throw Error("Category unavailable or type mismatch");
 if(r.kind==="transfer"&&explicit!=null)throw Error("Transfers cannot have a category");
 if(r.kind==="transfer"||explicit===null)return{label:r.kind==="transfer"?"No category":"Uncategorized",defaultOther:false};
 const kind=r.kind==="income"?"income":"expense";
 if(explicit!==undefined){const c=db.prepare("SELECT id,name FROM categories WHERE owner_id=? AND id=? AND kind=? AND archived_at IS NULL").get(owner,explicit,kind) as any;return c?{id:c.id,label:c.name,defaultOther:false}:{label:"Unavailable category",defaultOther:false,error:"Category unavailable or type mismatch"};}
 const matches=(db.prepare("SELECT id,name FROM categories WHERE owner_id=? AND kind=? AND archived_at IS NULL").all(owner,kind) as any[]).filter(c=>c.name.trim().toLowerCase()===hint.trim().toLowerCase());
 return matches.length===1?{id:matches[0].id,label:matches[0].name,defaultOther:false}:{label:"Uncategorized",defaultOther:false};
}
const rowText=(r:Row)=>[r.postDate?"":r.description,r.merchant||(r.postDate?r.description:"")].map(text=>text.trim().toLowerCase());
const signature=(r:Row)=>JSON.stringify([r.date,r.kind,r.amount,r.direction,...rowText(r)]);
export function statementDetail(owner:number,id:number){
 const s=statement(owner,id);
 const stored=db.prepare("SELECT e.*,d.action,d.transaction_id,d.category_id,d.destination_id,d.reason,d.reviewed_kind,d.request_json FROM statement_entries e LEFT JOIN statement_decisions d ON d.entry_id=e.id WHERE e.statement_id=? ORDER BY e.row_index").all(id) as any[];
 const current=db.prepare("SELECT * FROM accounts WHERE id=? AND owner_id=?").get(s.account_id,owner) as any;
 let recovered:ReturnType<typeof recoveryRows>|undefined,recoveryError="";
 if(stored.some(e=>!e.action&&!e.normalized_json))try{recovered=recoveryRows(owner,s,stored);}catch(error){recoveryError=(error as Error).message;}
 const normalized=stored.map(e=>e.normalized_json?JSON.parse(e.normalized_json) as Row:!e.action?recovered?.[e.row_index]?.row??null:null);
 const counts=new Map<string,number>();for(const row of normalized)if(row)for(const key of [signature(row),...(row.sourceId?[`source:${row.sourceId}`]:[])])counts.set(key,(counts.get(key)??0)+1);
 const entries=stored.map((e,index)=>{
  const row=normalized[index],raw=JSON.parse(e.raw_json);
  const effective=row&&(e.reviewed_kind?reviewedRow(row,e.reviewed_kind):row.kind!=="unresolved"?row:null);
  const matches=effective?candidates(owner,s.account_id,effective):row?(["refund","transfer"] as const).flatMap(kind=>candidates(owner,s.account_id,reviewedRow(row,kind))):[];
  const source=row?known(owner,s.account_id,row):null,repeated=!!row&&((counts.get(signature(row))??0)>1||!!row.sourceId&&(counts.get(`source:${row.sourceId}`)??0)>1);
  const category=row?categoryResolution(owner,effective??row,row.categoryHint??raw.category??"",e.action?e.category_id:undefined):null;
  const blockers:{code:string;message:string}[]=[];
  if(!e.action){
   if(row){const bound=dateBlocker(current,row);if(bound)blockers.push(bound);}
   if(!row)blockers.push({code:/calendar date|month-name dates/i.test(e.warnings)?"invalid_date":"invalid",message:e.warnings||"Invalid source row; exclude with reason or upload a corrected file"});
   if(row?.kind==="unresolved")blockers.push({code:"classification",message:"Negative row requires explicit payment or refund classification"});
   if(category?.error)blockers.push({code:"category",message:category.error});
   if(effective?.kind==="transfer"){
    try{const otherId=effective.destinationId??(effective.direction===1?s.funding_account_id:null);if(!otherId)throw Error(effective.direction===1?"Choose the paying account":"Choose the transfer destination");const other=effective.direction===1?fundingAccount(owner,s.account_id,otherId):account(owner,otherId);if(other.id===s.account_id||effective.date<other.opening_date)throw Error(`Funding/transfer account ${other.name} opens ${other.opening_date}; source posting date ${effective.date}. Choose an account open on that date.`);}catch(error){blockers.push({code:"funding",message:(error as Error).message});}
   }
   if(source)blockers.push({code:"source",message:"Source already imported or conflicting; link or exclude this row"});
   if(matches.length||repeated)blockers.push({code:"duplicate",message:repeated?"Repeated transaction signature in this file; review each row":"Possible duplicate; link, exclude, or import separately with reason"});
   if(row&&current.archived_at)blockers.push({code:"history",message:"Account unavailable"});
  }
  return{id:e.id,index:e.row_index,raw,row,reviewRequired:e.review_required,warnings:row?dateBlocker(current,row)?.message??"":e.warnings,action:e.action,transactionId:e.transaction_id,categoryId:e.category_id,destinationId:e.destination_id,reason:e.reason,reviewedKind:e.reviewed_kind,requestJson:e.request_json,candidates:matches,known:source,repeated,category,blockers,eligible:!e.action&&!blockers.length,queue:e.action?"resolved":!row?"invalid":row.kind==="unresolved"?"classification required":source?"already-imported":matches.some(m=>m.evidence.startsWith("Strong"))?"strong match":matches.length||repeated?"ambiguous":"new"};
 });
 const reconciliation=db.prepare("SELECT * FROM reconciliations WHERE owner_id=? AND statement_id=? ORDER BY id DESC LIMIT 1").get(owner,id);
 const {file_key,file_hash,owner_id,...metadata}=s,summary=s.summary_json?JSON.parse(s.summary_json):null,rawSummary=s.raw_summary_json?JSON.parse(s.raw_summary_json):null;
 // Include selectable defaults in evidence so archived/renamed categories or funding invalidate stale approval.
 const options=db.prepare("SELECT id,name,kind,archived_at FROM categories WHERE owner_id=? ORDER BY id").all(owner),accounts=db.prepare("SELECT id,type,opening_date,archived_at FROM accounts WHERE owner_id=? ORDER BY id").all(owner);
 const affected=entries.filter(e=>!e.action&&e.row&&e.blockers.some(b=>b.code==="before_history"));
 let sourceAffected=affected;
 if(affected.length)try{const source=recoveryRows(owner,s,stored);sourceAffected=affected.filter(e=>source[e.index].row&&dateBlocker(current,source[e.index].row!)?.code==="before_history").map(e=>({...e,row:source[e.index].row!}));}catch(error){recoveryError=(error as Error).message;}
 const conflict=historyConflict(owner,current);
 const historyExtension=sourceAffected.length&&current.type==="credit_card"?{openingDate:current.opening_date as string,proposedDate:sourceAffected.map(e=>e.row!.date).sort()[0],affectedRows:sourceAffected.length,sourceDates:[...new Set(sourceAffected.map(e=>e.row!.date))].sort(),allowed:!conflict&&!recoveryError,conflict:recoveryError||conflict}:null;
 return{...metadata,summary,rawSummary,historyExtension,recoveryError,discrepancies:statementDiscrepancies(summary,entries.map(e=>e.row)),entries,reconciliation,version:hash(JSON.stringify([metadata,entries,reconciliation,options,accounts,historyExtension,recoveryError]))};
}
import {historyConflict} from "./account-history.ts";
function recoveryRows(owner:number,s:any,stored:any[]){
 const bytes=readFileSync(filePath(s.file_key));if(hash(bytes)!==s.file_hash)throw Error("Source mismatch. Reload; original file integrity must be restored before recovery.");
 const parsed=parsedSource(owner,account(owner,s.account_id),bytes).rows;
 const canonical=(raw:Record<string,string>)=>JSON.stringify(Object.keys(raw).sort().map(key=>[key,raw[key]]));
 if(parsed.length!==stored.length||stored.some((entry,index)=>entry.row_index!==index||canonical(JSON.parse(entry.raw_json))!==canonical(parsed[index].raw)))throw Error("Source/index mismatch. Recovery aborted; no history or rows changed.");
 return parsed;
}
export function extendStatementHistory(owner:number,id:number,input:{version:string}){return db.transaction(()=>{
 const s=statement(owner,id),a=account(owner,s.account_id),detail=statementDetail(owner,id);
 if(typeof input?.version!=="string"||input.version!==detail.version)throw Error("Statement or account changed. Reload before extending history.");
 const extension=detail.historyExtension;
 if(a.type!=="credit_card"||!extension)throw Error("No eligible historical card rows. Reload this import.");
 if(!extension.allowed)throw Error(extension.conflict);
 const stored=db.prepare("SELECT e.*,d.action FROM statement_entries e LEFT JOIN statement_decisions d ON d.entry_id=e.id WHERE e.statement_id=? ORDER BY e.row_index").all(id) as any[];
 const rows=recoveryRows(owner,s,stored);
 db.prepare("UPDATE accounts SET opening_date=? WHERE owner_id=? AND id=?").run(extension.proposedDate,owner,a.id);
 for(const entry of stored)if(!entry.action&&!entry.normalized_json&&rows[entry.row_index].row){db.prepare("UPDATE statement_entries SET normalized_json=?,warnings=? WHERE id=?").run(JSON.stringify(rows[entry.row_index].row),rows[entry.row_index].warning,entry.id);}
 audit(owner,"statement.extend-history",id,{accountId:a.id,oldOpeningDate:a.opening_date,newOpeningDate:extension.proposedDate,affectedRows:extension.affectedRows});
 return{ok:true,message:"History extended. Continue import to add eligible transactions."};
}).immediate();}
export function reprocessStatement(owner:number,id:number){return db.transaction(()=>{const s=statement(owner,id);if(!["failed","needs_attention","ready_for_review"].includes(s.status))throw Error("Committed statements cannot be reprocessed; upload a corrected file separately.");if(db.prepare("SELECT 1 FROM statement_decisions WHERE statement_id=?").get(id))throw Error("Reviewed entries cannot be rewritten");db.prepare("DELETE FROM statement_entries WHERE statement_id=?").run(id);stage(owner,s,readFileSync(filePath(s.file_key)));audit(owner,"statement.reprocess",id,{parser:statement(owner,id).parser_version});return{ok:true};}).immediate();}
export function downloadStatement(owner:number,id:number){const s=statement(owner,id);return{filename:s.filename,bytes:readFileSync(filePath(s.file_key))};}
export function removeStatement(owner:number,id:number,input:{version:string}){
 let deletedFile:{path:string;bytes:Buffer}|undefined;
 try{return db.transaction(()=>{
  const s=statement(owner,id);
  if(!["failed","needs_attention","ready_for_review"].includes(s.status)||db.prepare("SELECT 1 FROM statement_decisions WHERE statement_id=?").get(id)||db.prepare("SELECT 1 FROM reconciliations WHERE statement_id=?").get(id))throw Error("Only unapproved uploads can be removed. Approved or reconciled statements must be kept.");
  if(input?.version!==statementDetail(owner,id).version)throw Error("Statement changed. Close this dialog and review it again before removing.");
  const path=filePath(s.file_key);let bytes:Buffer|undefined;
  try{bytes=readFileSync(path);}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
  db.prepare("DELETE FROM statement_entries WHERE statement_id=?").run(id);
  db.prepare("DELETE FROM statements WHERE owner_id=? AND id=?").run(owner,id);
  audit(owner,"statement.remove",id,{filename:s.filename,hash:s.file_hash,status:s.status});
  if(bytes){unlinkSync(path);deletedFile={path,bytes};}
  return{ok:true};
 }).immediate();}catch(e){
  // Restore the private file if SQLite fails to commit after unlinking it.
  if(deletedFile)writeFileSync(deletedFile.path,deletedFile.bytes,{flag:"wx",mode:0o600});
  throw e;
 }
}
export function commitStatement(owner:number,id:number,input:{version:string;decisions:Decision[]}){return db.transaction(()=>{
 const detail=statementDetail(owner,id);
 if(!Array.isArray(input?.decisions)||!input.decisions.length||input.decisions.length>5000)throw Error("Choose at least one unresolved row before approval");
 const decisions=new Map<number,Decision>();for(const d of input.decisions){if(!d||!integer(d.entryId)||!["import","link","skip"].includes(d.action)||typeof(d.reason??"")!=="string"||(d.reason??"").length>500||(d.reviewedKind!==undefined&&!["expense","refund","transfer"].includes(d.reviewedKind))||[d.transactionId,d.destinationId].some(v=>v!==undefined&&!integer(v))||d.categoryId!=null&&!integer(d.categoryId)||decisions.has(d.entryId)||!detail.entries.some(e=>e.id===d.entryId))throw Error("Invalid review decision");decisions.set(d.entryId,d);}
 const payload=decisionPayload;
 const submitted=detail.entries.filter(e=>decisions.has(e.id));
 for(const e of submitted.filter(e=>e.action)){const d=decisions.get(e.id)!;if(!e.requestJson||e.requestJson!==payload(d)||e.transactionId&&!db.prepare("SELECT 1 FROM transactions t JOIN account_entries a ON a.transaction_id=t.id WHERE t.owner_id=? AND t.id=? AND t.voided_at IS NULL AND a.account_id=? AND a.delta=? AND t.kind=? AND t.original_currency='PHP' AND t.posted_date BETWEEN date(?,'-3 days') AND date(?,'+3 days')").get(owner,e.transactionId,detail.account_id,(e.row?.amount??0)*(e.row?.direction??1),e.reviewedKind??e.row?.kind,e.row?.date,e.row?.date))throw Error("Saved row decision differs from this retry. Reload and review pending rows.");}
 if(submitted.every(e=>e.action))return{duplicate:true,imported:0,matched:0,excluded:0,remaining:detail.entries.filter(e=>!e.action).length};
 if(input.version!==detail.version)throw Error("Statement or matches changed. Reload and review before approving.");
 const a=account(owner,detail.account_id);let imported=0,matched=0,excluded=0;
 const stored=db.prepare("SELECT e.*,d.action FROM statement_entries e LEFT JOIN statement_decisions d ON d.entry_id=e.id WHERE e.statement_id=? ORDER BY e.row_index").all(id) as any[];
 if(stored.some(e=>!e.action&&!e.normalized_json&&submitted.some(item=>item.id===e.id&&decisions.get(e.id)!.action!=="skip"))){
  const recovered=recoveryRows(owner,statement(owner,id),stored);
  for(const e of stored)if(!e.action&&!e.normalized_json&&recovered[e.row_index].row)db.prepare("UPDATE statement_entries SET normalized_json=?,warnings=? WHERE id=?").run(JSON.stringify(recovered[e.row_index].row),recovered[e.row_index].warning,e.id);
 }

 const matches=new Map<number,ReturnType<typeof candidates>>(submitted.filter(entry=>!entry.action&&entry.row&&decisions.get(entry.id)!.action!=="skip").map(entry=>[entry.id,candidates(owner,a.id,reviewedRow(entry.row!,decisions.get(entry.id)!.reviewedKind))]));
 for(const entry of submitted.filter(e=>!e.action)){const d=decisions.get(entry.id)!;const r=entry.row&&d.action!=="skip"?reviewedRow(entry.row,d.reviewedKind):entry.row;let tx:number|undefined,categoryId:number|undefined,destinationId:number|undefined;
  if(d.action==="skip"){if(!d.reason?.trim())throw Error(`Row ${entry.index+1}: exclusion requires a reason`);excluded++;}
  else{if(!r)throw Error(`Row ${entry.index+1}: invalid row must be explicitly excluded`);
   const bound=dateBlocker(a,r);if(bound)throw Error(`Row ${entry.index+1}: ${bound.message}`);
   if(r.kind==="transfer"){
    const otherId=d.destinationId??r.destinationId??(r.direction===1?detail.funding_account_id:undefined);
    if(otherId){const other=r.direction===1?fundingAccount(owner,a.id,otherId):account(owner,otherId);const otherBound=dateBlocker(other,r);if(other.id===a.id||otherBound)throw Error(otherBound?.message??"Transfer needs a distinct account");}
   }
   if(d.action==="link"){
    if(!integer(d.transactionId))throw Error("Choose an existing transaction");
    const t=db.prepare("SELECT t.*,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND t.id=? AND e.account_id=? AND t.voided_at IS NULL").get(owner,d.transactionId,a.id) as any;
    const delta=r.amount*r.direction;if(!t||t.kind!==r.kind||t.original_currency!=="PHP"||t.delta!==delta||Math.abs(Date.parse(t.posted_date)-Date.parse(r.date))>3*86400000)throw Error("Match must use the same owned account, signed PHP amount, type and compatible posting date");
    if(r.kind==="transfer"){const otherId=d.destinationId??r.destinationId??(r.direction===1?detail.funding_account_id:undefined),actualOther=r.direction===1?t.account_id:t.counter_account_id;if(otherId&&otherId!==actualOther)throw Error("Matched transfer has a different destination or paying account");if(r.direction===1&&a.type==="credit_card")fundingAccount(owner,a.id,actualOther);}
    if(d.categoryId!=null){const category=categoryResolution(owner,r,"",d.categoryId);if(category.error)throw Error(category.error);}
    const prior=db.prepare("SELECT e.normalized_json,d.reviewed_kind,s.account_id FROM statement_decisions d JOIN statement_entries e ON e.id=d.entry_id JOIN statements s ON s.id=e.statement_id WHERE s.owner_id=? AND d.transaction_id=?").all(owner,t.id) as {normalized_json:string;reviewed_kind:string|null;account_id:number}[];
    if(prior.some(p=>{const row=reviewedRow(JSON.parse(p.normalized_json) as Row,p.reviewed_kind);if(p.account_id!==a.id)return t.kind!=="transfer"||row.kind!=="transfer"||r.kind!=="transfer"||row.amount!==r.amount||row.direction===r.direction||Math.abs(Date.parse(row.date)-Date.parse(r.date))>3*86400000;return row.date!==r.date||row.kind!==r.kind||row.amount!==r.amount||row.direction!==r.direction||(row.sourceId&&r.sourceId&&row.sourceId!==r.sourceId)||(!(row.sourceId&&row.sourceId===r.sourceId)&&(JSON.stringify(rowText(row))!==JSON.stringify(rowText(r))));}))throw Error("Transaction already linked to an incompatible statement row");
    if(entry.known&&entry.known!==t.id)throw Error("Source reference conflicts with the selected transaction");tx=t.id;matched++;
   }else{
    if(known(owner,a.id,r))throw Error("Source already imported or conflicting; link or exclude this row");if(((matches.get(entry.id)?.length??0)||entry.repeated)&&!d.reason?.trim())throw Error("Possible duplicate requires a reason to import separately");
    if(r.kind==="transfer"){if(d.categoryId!=null)throw Error("Transfers cannot have a category");destinationId=d.destinationId??r.destinationId??(r.direction===1?detail.funding_account_id??undefined:undefined);if(r.direction===1){if(!destinationId)throw Error("Payment funding required");fundingAccount(owner,a.id,destinationId);}else account(owner,destinationId!);}else{const category=categoryResolution(owner,r,r.categoryHint??entry.raw.category??"",d.categoryId,true);if(category.error)throw Error(category.error);categoryId=category.id;}
    tx=createTransaction(owner,{kind:r.kind as "income"|"expense"|"refund"|"transfer",isInstallment:r.isInstallment,date:r.date,amount:r.amount,accountId:r.kind==="transfer"&&r.direction===1?destinationId!:a.id,categoryId,counterAccountId:r.kind==="transfer"?(r.direction===1?a.id:destinationId):undefined,description:r.postDate?"":r.description,merchant:r.merchant||(r.postDate?r.description:""),notes:r.notes,idempotencyKey:`statement:${id}:${entry.id}`}).id;imported++;
   }
  }
  db.prepare("INSERT INTO statement_decisions(entry_id,statement_id,action,transaction_id,category_id,destination_id,reason,evidence,actor_id,reviewed_kind,request_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(entry.id,id,d.action,tx??null,d.action==="import"&&r?.kind!=="transfer"?categoryId??null:null,d.action==="import"&&r?.kind==="transfer"?destinationId??null:null,d.reason?.trim()??"",JSON.stringify(matches.get(entry.id)??entry.candidates),owner,(entry.row?.kind==="unresolved"||entry.reviewRequired)&&d.action!=="skip"?r?.kind:null,payload(d));
 }
 const remaining=detail.entries.filter(e=>!e.action&&!decisions.has(e.id)).length;
 db.prepare("UPDATE statements SET status=?,error='' WHERE id=?").run(remaining?"partially_imported":"imported",id);audit(owner,"statement.commit",id,{imported,matched,excluded,remaining});return{imported,matched,excluded,remaining,conflicts:statementDetail(owner,id).entries.filter(e=>!e.action&&!e.eligible).length,duplicate:false};
}).immediate();}
function importResult(owner:number,id:number,duplicate=false){
 const detail=statementDetail(owner,id);
 return{id,accountId:detail.account_id,duplicate,status:detail.status,error:detail.error,imported:detail.entries.filter(e=>e.action==="import").length,linked:detail.entries.filter(e=>e.action==="link").length,skipped:detail.entries.filter(e=>e.action==="skip").length,needsAttention:detail.entries.filter(e=>!e.action).length};
}
export function autoImportStatement(owner:number,id:number,version?:string){return db.transaction(()=>{
 const detail=statementDetail(owner,id);account(owner,detail.account_id);if(version!==undefined&&version!==detail.version)throw Error("This import changed. Reload before continuing.");
 const decisions:Decision[]=[];
 for(const entry of detail.entries){
  if(entry.action||!entry.row||entry.repeated||entry.blockers.some(b=>["before_history","future_date","invalid_date","history","funding"].includes(b.code)))continue;
  const row=entry.row;
  if(typeof entry.known==="number"&&row.kind!=="unresolved"){
   const known=db.prepare("SELECT t.*,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND t.id=? AND t.voided_at IS NULL AND e.account_id=?").get(owner,entry.known,detail.account_id) as {kind:string;original_currency:string;posted_date:string;delta:number;account_id:number;counter_account_id:number|null}|undefined;
   const otherId=row.destinationId??(row.direction===1?detail.funding_account_id:undefined);
   if(known&&known.kind===row.kind&&known.original_currency==="PHP"&&known.posted_date===row.date&&known.delta===row.amount*row.direction&&(!otherId||(row.direction===1?known.account_id:known.counter_account_id)===otherId))decisions.push({entryId:entry.id,action:"link",transactionId:entry.known});
  }else if(entry.eligible)decisions.push({entryId:entry.id,action:"import"});
 }
 if(decisions.length)commitStatement(owner,id,{version:detail.version,decisions});
 audit(owner,"import.auto",id,{rows:decisions.length});return importResult(owner,id);
}).immediate();}
export function importTransactions(owner:number,input:Parameters<typeof uploadStatement>[1]){
 const uploaded=uploadStatement(owner,input);
 if(uploaded.duplicate)return importResult(owner,uploaded.id,true);
 try{return autoImportStatement(owner,uploaded.id);}catch(error){
  const message=error instanceof Error&&!("code" in error)?error.message:"Posting failed; no rows from this attempt were committed. Continue this import to retry.";
  db.prepare("UPDATE statements SET status='needs_attention',error=? WHERE id=? AND owner_id=?").run(message,uploaded.id,owner);
  return importResult(owner,uploaded.id);
 }
}
export function resolveStatement(owner:number,id:number,input:{version:string;decisions:(Decision|Omit<Decision,"action">&{action:"edit"})[]}){return db.transaction(()=>{
 const detail=statementDetail(owner,id);
 if(!Array.isArray(input?.decisions)||!input.decisions.length||input.decisions.length>5000)throw Error("Choose rows to resolve");
 if(new Set(input.decisions.map(d=>d?.entryId)).size!==input.decisions.length||input.decisions.some(d=>!d||!integer(d.entryId)||!["import","link","skip","edit"].includes(d.action)||!detail.entries.some(e=>e.id===d.entryId)||d.action==="edit"&&(!d.correction||detail.entries.some(e=>e.id===d.entryId&&e.action))))throw Error("Import row unavailable or invalid correction");
 if(input.decisions.some(d=>!detail.entries.find(e=>e.id===d.entryId)?.action)&&detail.version!==input.version)throw Error("This import changed. Reload before saving.");
 for(const decision of input.decisions){
  const entry=detail.entries.find(e=>e.id===decision.entryId)!;
  if(entry.action||!decision.correction||decision.action==="skip")continue;
  const correction=decision.correction;
  if(!correction||typeof correction!=="object"||Object.keys(correction).some(key=>!["date","description","merchant","type","amount","notes","category"].includes(key))||Object.values(correction).some(value=>typeof value!=="string")||!["date","description","merchant","type","amount"].every(key=>typeof correction[key as keyof Correction]==="string"))throw Error("Invalid row correction");
  const row=normalize(owner,account(owner,detail.account_id),{...correction,source_id:entry.row?.sourceId??entry.raw.source_id??""});
  const bound=dateBlocker(account(owner,detail.account_id),row);if(bound)throw Error(bound.message);
  if(decision.categoryId!==undefined){const category=categoryResolution(owner,row,"",decision.categoryId);if(category.error)throw Error(category.error);row.categoryHint=category.id?category.label:"";}
  if(decision.destinationId!==undefined){const other=account(owner,decision.destinationId);if(row.kind!=="transfer"||other.id===detail.account_id)throw Error("Transfer needs a distinct destination");if(row.direction===1)fundingAccount(owner,detail.account_id,other.id);row.destinationId=other.id;}
  if(row.kind==="transfer"){
   const otherId=row.destinationId??(row.direction===1?detail.funding_account_id:undefined);
   if(otherId){const other=account(owner,otherId),otherBound=dateBlocker(other,row);if(otherBound)throw Error(`Funding/transfer account ${other.name}: ${otherBound.message}`);}
  }
  audit(owner,"import.row.correct",id,{entryId:entry.id,before:entry.row,after:row});
  db.prepare("UPDATE statement_entries SET normalized_json=?,warnings='',review_required='' WHERE statement_id=? AND id=?").run(JSON.stringify(row),id,entry.id);
 }
 const decisions=input.decisions.filter((decision):decision is Decision=>decision.action!=="edit");
 const result=decisions.length?commitStatement(owner,id,{version:statementDetail(owner,id).version,decisions}):null;
 return{...importResult(owner,id),duplicate:result?.duplicate??false};
}).immediate();}
function signedMoney(v:unknown){if(typeof v!=="string"||! /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v))throw Error("Balances must be exact signed PHP decimals");return parseMoney(v.startsWith("-")?v.slice(1):v)*(v.startsWith("-")?-1:1);}
export function reconcileStatement(owner:number,id:number,input:{start:string;end:string;opening:string;closing:string;version:string},preview=false){return db.transaction(()=>{
 const s=statementDetail(owner,id);if(s.status!=="imported"||s.version!==input?.version)throw Error("Reload an imported statement before reconciliation");
 if(!isCalendarDate(input.start)||!isCalendarDate(input.end)||input.start>input.end||input.end>new Date().toISOString().slice(0,10)||input.start<account(owner,s.account_id).opening_date)throw Error("Choose valid completed period boundaries within account history");
 if(s.entries.some(e=>!e.action||e.row&&(e.row.date<input.start||e.row.date>input.end)))throw Error("Every row must be resolved within the confirmed statement period");
 if(db.prepare("SELECT 1 FROM reconciliations WHERE owner_id=? AND account_id=? AND state='finalized' AND period_start<=? AND period_end>=?").get(owner,s.account_id,input.end,input.start))throw Error("Period overlaps a finalized reconciliation; reopen it first");
 if(s.discrepancies.length)throw Error(s.discrepancies.join(" "));
 const opening=signedMoney(input.opening),closing=signedMoney(input.closing);
 if(s.summary?.previousBalance!==undefined&&opening!==s.summary.previousBalance||s.summary?.outstandingBalance!==undefined&&closing!==s.summary.outstandingBalance)throw Error("Confirmed balances must match the immutable previous/outstanding statement snapshots");
 const factor=["credit_card","loan","liability"].includes(s.account_type)?-1:1;
 const before=new Date(`${input.start}T00:00:00Z`);before.setUTCDate(before.getUTCDate()-1);if(balanceFor(owner,s.account_id,before.toISOString().slice(0,10))*factor!==opening)throw Error("Opening balance differs from the ledger; correct coverage before reconciling");
 const canonical=db.prepare("SELECT t.id,t.kind,t.posted_date,t.original_currency,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND e.account_id=? AND t.voided_at IS NULL AND t.posted_date BETWEEN ? AND ?").all(owner,s.account_id,input.start,input.end) as {id:number;kind:string;posted_date:string;original_currency:string;delta:number}[];
 for(const entry of s.entries.filter(e=>e.transactionId)){const t=canonical.find(t=>t.id===entry.transactionId),r=entry.row?reviewedRow(entry.row,entry.reviewedKind):null;if(!t||!r||t.kind!==r.kind||t.original_currency!=="PHP"||t.delta!==r.amount*r.direction||Math.abs(Date.parse(t.posted_date)-Date.parse(r.date))>3*86400000)throw Error("Linked transaction changed or was voided. Correct it to match the immutable statement row before reconciliation.");}
 const resolved=new Set(s.entries.filter(e=>e.transactionId).map(e=>e.transactionId));if(canonical.some(t=>!resolved.has(t.id)))throw Error("Ledger contains unrepresented transactions in this period. Resolve missing statement coverage first.");
 const movements=canonical.reduce((n,t)=>{const total=n+t.delta*factor;if(!Number.isSafeInteger(total)||Math.abs(total)>MAX_MINOR)throw Error("Period total exceeds supported money range");return total;},0),expected=opening+movements,difference=closing-expected;
 if(!Number.isSafeInteger(expected)||Math.abs(expected)>MAX_MINOR)throw Error("Closing balance exceeds supported money range");if(preview)return{ok:difference===0,difference,expected};if(difference!==0)throw Error(`Reconciliation discrepancy: ${difference} PHP minor units. Correct rows or balances; no balancing entry is created.`);
 const rid=Number(db.prepare("INSERT INTO reconciliations(owner_id,statement_id,account_id,period_start,period_end,opening_balance,closing_balance,expected_closing,difference,state,resolved_entries,actor_id) VALUES(?,?,?,?,?,?,?,?,?,'finalized',?,?)").run(owner,id,s.account_id,input.start,input.end,opening,closing,expected,difference,JSON.stringify(s.entries.map(e=>({id:e.id,action:e.action,transactionId:e.transactionId,reason:e.reason}))),owner).lastInsertRowid);
 db.prepare("UPDATE statements SET status='reconciled',period_start=?,period_end=? WHERE id=?").run(input.start,input.end,id);audit(owner,"statement.reconcile",id,{reconciliationId:rid,start:input.start,end:input.end,opening,closing,expected,difference});return{ok:true,difference,expected};
}).immediate();}
export function reopenStatement(owner:number,id:number,input:{reason:string;version:string}){return db.transaction(()=>{const s=statementDetail(owner,id);if(s.status!=="reconciled"||s.version!==input?.version||typeof input.reason!=="string"||!input.reason.trim()||input.reason.length>500)throw Error("Reload a reconciled statement and provide a reopening reason");db.prepare("UPDATE reconciliations SET state='reopened',reopened_at=CURRENT_TIMESTAMP,reopen_reason=? WHERE owner_id=? AND statement_id=? AND state='finalized'").run(input.reason.trim(),owner,id);db.prepare("UPDATE statements SET status='imported' WHERE id=?").run(id);audit(owner,"statement.reopen",id,{reason:input.reason.trim()});return{ok:true};}).immediate();}
