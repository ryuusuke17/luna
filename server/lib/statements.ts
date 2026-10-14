import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,chmodSync} from "node:fs";
import {resolve,join,relative,isAbsolute} from "node:path";
import {db} from "./db.ts";
import {createTransaction,balanceFor} from "./ledger.ts";
import {parseCsv} from "../../src/lib/csv.ts";
import {parseStatementCsv,statementDiscrepancies} from "./statement-csv.ts";
import {isCalendarDate,parseMoney,MAX_MINOR} from "../../src/lib/finance.ts";

type Row={date:string;description:string;merchant:string;kind:"income"|"expense"|"refund"|"transfer"|"unresolved";saleDate?:string;postDate?:string;sourceAmount?:number;notes?:string;categoryHint?:string;amount:number;direction:number;sourceId:string|null;categoryId?:number};
type Decision={entryId:number;action:"import"|"link"|"skip";transactionId?:number;categoryId?:number;destinationId?:number;reviewedKind?:"refund"|"transfer";reason?:string};
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
 const payment=r.type.trim()==="payment",kind=(payment?"transfer":r.type.trim()) as Row['kind'];if(payment&&a.type!=="credit_card")throw Error("Payment rows require a credit card; choose the funding account during review.");if(!["income","expense","refund","transfer"].includes(kind)||!isCalendarDate(r.date)||r.date<a.opening_date||r.date>new Date().toISOString().slice(0,10)||r.description.length>240||r.merchant.length>120||(r.source_id??"").length>160||(r.category??"").length>60)throw Error("Invalid posting date, type or text length; use the PHP CSV template.");
 const amount=parseMoney(r.amount);if(amount<=0)throw Error("Amount must be positive, exact PHP with at most two decimal places.");
 return{date:r.date,description:r.description,merchant:r.merchant,kind,amount,direction:payment||kind==="income"||kind==="refund"?1:-1,sourceId:r.source_id?.trim()||null};
}
function reviewedRow(r:Row,kind?:string|null):Row{
 if(r.kind!=="unresolved")return r;
 if(kind!=="refund"&&kind!=="transfer")throw Error("Negative row requires explicit payment or refund classification");
 return{...r,kind};
}
function stage(owner:number,s:any,bytes:Buffer){
 try{
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(text.includes("\0"))throw Error("Binary files are unsupported; export the PHP CSV template.");
  const full=parseStatementCsv(text),a=account(owner,s.account_id);let invalid=0;
  if(full&&a.type!=="credit_card")throw Error("Full spreadsheet statements require a credit-card account");
  const raw=full?full.rows:parseCsv(text);if(!raw.length)throw Error("CSV has no data rows");
  db.prepare("UPDATE statements SET parser_version=?,summary_json=?,raw_summary_json=?,date_policy=? WHERE id=?").run(full?.parserVersion??"luna-csv-v1",full?JSON.stringify(full.summary):null,full?JSON.stringify(full.rawSummary):null,full?"ISO or English month-name calendar dates; posting date; UTC; no pending rows":"ISO calendar dates; posting date; UTC; no pending rows",s.id);
  const insert=db.prepare("INSERT INTO statement_entries(statement_id,row_index,raw_json,normalized_json,warnings) VALUES(?,?,?,?,?)");
  for(const [index,value] of raw.entries()){let row:Row|undefined,warning="",source:Record<string,string>;
   if(full){const parsed=value as typeof full.rows[number];source=parsed.raw;row=parsed.row;warning=parsed.warning;
    if(row&&(row.date<a.opening_date||row.date>new Date().toISOString().slice(0,10))){row=undefined;warning="Posting date must be within account history and not in the future";}
   }else{source=value as Record<string,string>;try{row=normalize(owner,a,source);}catch(e){warning=e instanceof Error?e.message:"Invalid row";}}
   if(!row)invalid++;insert.run(s.id,index,JSON.stringify(source),row?JSON.stringify(row):null,warning);
  }
  db.prepare("UPDATE statements SET status=?,error=? WHERE id=?").run(invalid?"needs_attention":"ready_for_review",invalid?`${invalid} invalid rows require explicit exclusion with a reason or a corrected file.`:"",s.id);
 }catch(e){db.prepare("UPDATE statements SET status='failed',error=? WHERE id=?").run(e instanceof Error?e.message:"Unsupported CSV",s.id);}
}
export function uploadStatement(owner:number,input:{accountId:number;filename:string;mime:string;base64:string;fundingAccountId?:number}){
 const a=account(owner,input?.accountId);if(typeof input.filename!=="string"||input.filename.length>180||/[\x00-\x1f/\\]/.test(input.filename)||!/^.+\.csv$/i.test(input.filename)||typeof input.mime!=="string"||!["text/csv","application/csv","application/vnd.ms-excel","text/plain",""].includes(input.mime)||typeof input.base64!=="string"||input.base64.length>2_666_668||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw Error("Only UTF-8 PHP template CSV files up to 2 MB are supported. XLSX/PDF are unsupported.");
 if(input.fundingAccountId!==undefined){if(a.type!=="credit_card")throw Error("Payment funding default requires a credit-card statement");fundingAccount(owner,a.id,input.fundingAccountId);}
 const bytes=Buffer.from(input.base64,"base64");if(!bytes.length||bytes.length>2_000_000)throw Error("Choose a nonempty CSV up to 2 MB");
 const fileHash=hash(bytes),existing=db.prepare("SELECT id FROM statements WHERE owner_id=? AND account_id=? AND file_hash=?").get(owner,a.id,fileHash) as any;if(existing)return{id:existing.id,duplicate:true};
 const key=`${randomUUID()}.csv`,path=filePath(key);writeFileSync(path,bytes,{flag:"wx",mode:0o600});
 try{return db.transaction(()=>{const id=Number(db.prepare("INSERT INTO statements(owner_id,account_id,filename,file_key,file_hash,size,status,funding_account_id) VALUES(?,?,?,?,?,?,'processing',?)").run(owner,a.id,input.filename,key,fileHash,bytes.length,input.fundingAccountId??null).lastInsertRowid);stage(owner,{id,account_id:a.id},bytes);audit(owner,"statement.upload",id,{hash:fileHash,size:bytes.length});return{id,duplicate:false};}).immediate();}catch(e){unlinkSync(path);throw e;}
}
function audit(owner:number,action:string,id:number,details:unknown){db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,?,?,?)").run(owner,action,id,JSON.stringify(details));}
export function listStatements(owner:number){return db.prepare("SELECT s.id,s.filename,s.status,s.error,s.parser_version,s.currency,s.period_start,s.period_end,s.summary_json,s.created_at,a.name account_name,(SELECT count(*) FROM statement_entries e WHERE e.statement_id=s.id) rows,(SELECT count(*) FROM statement_decisions d WHERE d.statement_id=s.id AND d.action='import') imported,(SELECT count(*) FROM statement_decisions d WHERE d.statement_id=s.id AND d.action='link') matched,(SELECT count(*) FROM statement_entries e WHERE e.statement_id=s.id AND NOT EXISTS(SELECT 1 FROM statement_decisions d WHERE d.entry_id=e.id)) needs_review FROM statements s JOIN accounts a ON a.id=s.account_id AND a.owner_id=s.owner_id WHERE s.owner_id=? ORDER BY s.id DESC").all(owner);}
function candidates(owner:number,accountId:number,r:Row){
 const sign=r.direction;
 const text=(s:string)=>s.trim().toLowerCase().replace(/\s+/g," ");
 return (db.prepare("SELECT t.id,t.posted_date,t.kind,t.description,t.merchant,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND t.voided_at IS NULL AND e.account_id=? AND e.delta=? AND t.kind=? AND t.original_currency='PHP' AND t.posted_date BETWEEN date(?,'-3 days') AND date(?,'+3 days') ORDER BY t.id DESC LIMIT 50").all(owner,accountId,r.amount*sign,r.kind,r.date,r.date) as any[]).map(t=>({...t,evidence:t.posted_date===r.date&&(text(r.merchant)&&text(r.merchant)===text(t.merchant)||text(r.description)&&text(r.description)===text(t.description))?"Strong: same signed PHP amount, posting date and text. Review required.":"Ambiguous: same signed PHP amount within three days. Not proof.",score:t.posted_date===r.date?70:40}));
}
function known(owner:number,accountId:number,r:Row){
 if(!r.sourceId)return null;
 const ids=db.prepare("SELECT transaction_id FROM csv_import_rows WHERE owner_id=? AND account_id=? AND source_id=? UNION SELECT transaction_id FROM statement_import_rows WHERE owner_id=? AND account_id=? AND source_id=? UNION SELECT d.transaction_id FROM statement_entries e JOIN statements s ON s.id=e.statement_id JOIN statement_decisions d ON d.entry_id=e.id WHERE s.owner_id=? AND s.account_id=? AND d.transaction_id IS NOT NULL AND json_extract(e.normalized_json,'$.sourceId')=?").all(owner,accountId,r.sourceId,owner,accountId,`${accountId}:${r.sourceId}`,owner,accountId,r.sourceId) as {transaction_id:number}[];
 return ids.length===1?ids[0].transaction_id:ids.length?"conflict":null;
}
function fundingAccount(owner:number,accountId:number,id:number){const a=account(owner,id);if(!["cash","bank","wallet"].includes(a.type)||a.id===accountId)throw Error("Credit payment requires a distinct cash, bank or wallet funding account.");return a;}
function categoryResolution(owner:number,r:Row,hint:string,explicit?:number,create=false):{id?:number;label:string;defaultOther:boolean;error?:string}{
 if(r.kind==="transfer")return{label:"No category · transfer",defaultOther:false};
 const kind=r.kind==="income"?"income":"expense",name=hint.trim()||"Other",defaultOther=!hint.trim();
 if(explicit!==undefined){const c=db.prepare("SELECT id,name FROM categories WHERE owner_id=? AND id=? AND kind=? AND archived_at IS NULL").get(owner,explicit,kind) as any;return c?{id:c.id,label:c.name,defaultOther:false}:{label:"Unavailable category",defaultOther:false,error:"Category unavailable or type mismatch"};}
 const matches=(db.prepare("SELECT id,name,kind FROM categories WHERE owner_id=? AND archived_at IS NULL").all(owner) as any[]).filter(c=>c.name.trim().toLowerCase()===name.toLowerCase()&&c.kind===kind);
 if(matches.length>1)return{label:name,defaultOther,error:`Ambiguous category: ${name}`};
 if(matches.length)return{id:matches[0].id,label:matches[0].name,defaultOther};
 if(!defaultOther)return{label:name,defaultOther,error:`Unknown category: ${name}`};
 if(create){let storedName="Other";if(db.prepare("SELECT 1 FROM categories WHERE owner_id=? AND name=?").get(owner,storedName)){storedName=kind==="income"?"other":"OTHER";while(db.prepare("SELECT 1 FROM categories WHERE owner_id=? AND name=?").get(owner,storedName))storedName+=" ";}const id=Number(db.prepare("INSERT INTO categories(owner_id,name,kind) VALUES(?,?,?)").run(owner,storedName,kind).lastInsertRowid);return{id,label:"Other",defaultOther};}
 return{label:"Other",defaultOther};
}
const signature=(r:Row)=>JSON.stringify([r.date,r.kind,r.amount,r.direction,r.description.trim().toLowerCase(),r.merchant.trim().toLowerCase()]);
export function statementDetail(owner:number,id:number){
 const s=statement(owner,id);
 const stored=db.prepare("SELECT e.*,d.action,d.transaction_id,d.category_id,d.destination_id,d.reason,d.reviewed_kind,d.request_json FROM statement_entries e LEFT JOIN statement_decisions d ON d.entry_id=e.id WHERE e.statement_id=? ORDER BY e.row_index").all(id) as any[];
 const counts=new Map<string,number>();for(const e of stored){if(e.normalized_json){const key=signature(JSON.parse(e.normalized_json));counts.set(key,(counts.get(key)??0)+1);}}
 const entries=stored.map(e=>{
  const row=e.normalized_json?JSON.parse(e.normalized_json) as Row:null,raw=JSON.parse(e.raw_json);
  const effective=row&&(row.kind!=="unresolved"?row:e.reviewed_kind?reviewedRow(row,e.reviewed_kind):null);
  const matches=effective?candidates(owner,s.account_id,effective):row?(["refund","transfer"] as const).flatMap(kind=>candidates(owner,s.account_id,reviewedRow(row,kind))):[];
  const source=row?known(owner,s.account_id,row):null,repeated=!!row&&(counts.get(signature(row))??0)>1;
  const category=row?categoryResolution(owner,effective??row,row.categoryHint??raw.category??"",e.action?e.category_id??undefined:undefined):null;
  const blockers:{code:string;message:string}[]=[];
  if(!e.action){
   if(!row)blockers.push({code:"invalid",message:e.warnings||"Invalid source row; exclude with reason or upload a corrected file"});
   if(row?.kind==="unresolved")blockers.push({code:"classification",message:"Negative row requires explicit payment or refund classification"});
   if(category?.error)blockers.push({code:"category",message:category.error});
   if(effective?.kind==="transfer"){
    if(effective.direction===1){try{if(!s.funding_account_id)throw Error("Payment funding required");const funding=fundingAccount(owner,s.account_id,s.funding_account_id);if(row!.date<funding.opening_date)throw Error("Payment predates funding account opening");if(db.prepare("SELECT 1 FROM reconciliations WHERE owner_id=? AND account_id=? AND state='finalized' AND period_end>=?").get(owner,funding.id,row!.date))throw Error("Payment funding history locked; reopen reconciliation before approval");}catch(error){blockers.push({code:"funding",message:(error as Error).message});}}
    else blockers.push({code:"funding",message:"Transfer destination required"});
   }
   if(source)blockers.push({code:"source",message:"Source already imported or conflicting; link or exclude this row"});
   if(matches.length||repeated)blockers.push({code:"duplicate",message:repeated?"Repeated transaction signature in this file; review each row":"Possible duplicate; link, exclude, or import separately with reason"});
   if(row&&(s.archived_at||db.prepare("SELECT 1 FROM accounts WHERE id=? AND archived_at IS NOT NULL").get(s.account_id)||db.prepare("SELECT 1 FROM reconciliations WHERE owner_id=? AND account_id=? AND state='finalized' AND period_end>=?").get(owner,s.account_id,row.date)))blockers.push({code:"history",message:"Account unavailable or financial history locked; reopen reconciliation before approval"});
  }
  return{id:e.id,index:e.row_index,raw,row,warnings:e.warnings,action:e.action,transactionId:e.transaction_id,categoryId:e.category_id,destinationId:e.destination_id,reason:e.reason,reviewedKind:e.reviewed_kind,requestJson:e.request_json,candidates:matches,known:source,repeated,category,blockers,eligible:!e.action&&!blockers.length,queue:e.action?"resolved":!row?"invalid":row.kind==="unresolved"?"classification required":source?"already-imported":matches.some(m=>m.evidence.startsWith("Strong"))?"strong match":matches.length||repeated?"ambiguous":"new"};
 });
 const reconciliation=db.prepare("SELECT * FROM reconciliations WHERE owner_id=? AND statement_id=? ORDER BY id DESC LIMIT 1").get(owner,id);
 const {file_key,file_hash,owner_id,...metadata}=s,summary=s.summary_json?JSON.parse(s.summary_json):null,rawSummary=s.raw_summary_json?JSON.parse(s.raw_summary_json):null;
 // Include selectable defaults in evidence so archived/renamed categories or funding invalidate stale approval.
 const options=db.prepare("SELECT id,name,kind,archived_at FROM categories WHERE owner_id=? ORDER BY id").all(owner),accounts=db.prepare("SELECT id,type,opening_date,archived_at FROM accounts WHERE owner_id=? ORDER BY id").all(owner);
 return{...metadata,summary,rawSummary,discrepancies:statementDiscrepancies(summary,entries.map(e=>e.row)),entries,reconciliation,version:hash(JSON.stringify([metadata,entries,reconciliation,options,accounts]))};
}
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
 const decisions=new Map<number,Decision>();for(const d of input.decisions){if(!d||!integer(d.entryId)||!["import","link","skip"].includes(d.action)||typeof(d.reason??"")!=="string"||(d.reason??"").length>500||(d.reviewedKind!==undefined&&!["refund","transfer"].includes(d.reviewedKind))||[d.transactionId,d.categoryId,d.destinationId].some(v=>v!==undefined&&!integer(v))||decisions.has(d.entryId)||!detail.entries.some(e=>e.id===d.entryId))throw Error("Invalid review decision");decisions.set(d.entryId,d);}
 const payload=(d:Decision)=>JSON.stringify([d.action,d.transactionId??null,d.categoryId??null,d.destinationId??null,d.reviewedKind??null,d.reason?.trim()??""]);
 const submitted=detail.entries.filter(e=>decisions.has(e.id));
 for(const e of submitted.filter(e=>e.action)){const d=decisions.get(e.id)!;if(!e.requestJson||e.requestJson!==payload(d)||e.transactionId&&!db.prepare("SELECT 1 FROM transactions t JOIN account_entries a ON a.transaction_id=t.id WHERE t.owner_id=? AND t.id=? AND t.voided_at IS NULL AND a.account_id=? AND a.delta=? AND t.kind=? AND t.original_currency='PHP' AND t.posted_date BETWEEN date(?,'-3 days') AND date(?,'+3 days')").get(owner,e.transactionId,detail.account_id,(e.row?.amount??0)*(e.row?.direction??1),e.reviewedKind??e.row?.kind,e.row?.date,e.row?.date))throw Error("Saved row decision differs from this retry. Reload and review pending rows.");}
 if(submitted.every(e=>e.action))return{duplicate:true,imported:0,matched:0,excluded:0,remaining:detail.entries.filter(e=>!e.action).length};
 if(input.version!==detail.version)throw Error("Statement or matches changed. Reload and review before approving.");
 const a=account(owner,detail.account_id);let imported=0,matched=0,excluded=0;
 for(const entry of submitted.filter(e=>!e.action)){const d=decisions.get(entry.id)!;const r=entry.row&&d.action!=="skip"?reviewedRow(entry.row,d.reviewedKind):entry.row;let tx:number|undefined,categoryId:number|undefined,destinationId:number|undefined;
  if(d.action==="skip"){if(!d.reason?.trim())throw Error(`Row ${entry.index+1}: exclusion requires a reason`);excluded++;}
  else{if(!r)throw Error(`Row ${entry.index+1}: invalid row must be explicitly excluded`);
   if(db.prepare("SELECT 1 FROM reconciliations WHERE owner_id=? AND account_id=? AND state='finalized' AND period_end>=?").get(owner,a.id,r.date))throw Error("Reopen the affected statement reconciliation with a reason before changing financial history.");
   if(d.action==="link"){
    if(!integer(d.transactionId))throw Error("Choose an existing transaction");
    const t=db.prepare("SELECT t.*,e.delta FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND t.id=? AND e.account_id=? AND t.voided_at IS NULL").get(owner,d.transactionId,a.id) as any;
    const delta=r.amount*r.direction;if(!t||t.kind!==r.kind||t.original_currency!=="PHP"||t.delta!==delta||Math.abs(Date.parse(t.posted_date)-Date.parse(r.date))>3*86400000)throw Error("Match must use the same owned account, signed PHP amount, type and compatible posting date");
    const prior=db.prepare("SELECT e.normalized_json,d.reviewed_kind FROM statement_decisions d JOIN statement_entries e ON e.id=d.entry_id JOIN statements s ON s.id=e.statement_id WHERE s.owner_id=? AND d.transaction_id=?").all(owner,t.id) as {normalized_json:string;reviewed_kind:string|null}[];
    if(prior.some(p=>{const row=reviewedRow(JSON.parse(p.normalized_json) as Row,p.reviewed_kind);return row.date!==r.date||row.kind!==r.kind||row.amount!==r.amount||row.direction!==r.direction||(row.sourceId&&r.sourceId&&row.sourceId!==r.sourceId)||row.description!==r.description||row.merchant!==r.merchant;}))throw Error("Transaction already linked to an incompatible statement row");
    if(entry.known&&entry.known!==t.id)throw Error("Source reference conflicts with the selected transaction");tx=t.id;matched++;
   }else{
    if(known(owner,a.id,r))throw Error("Source already imported or conflicting; link or exclude this row");if((candidates(owner,a.id,r).length||entry.repeated)&&!d.reason?.trim())throw Error("Possible duplicate requires a reason to import separately");
    if(r.kind==="transfer"){destinationId=d.destinationId??(r.direction===1?detail.funding_account_id??undefined:undefined);if(r.direction===1){if(!destinationId)throw Error("Payment funding required");fundingAccount(owner,a.id,destinationId);}else account(owner,destinationId!);}else{const category=categoryResolution(owner,r,r.categoryHint??entry.raw.category??"",d.categoryId,true);if(category.error)throw Error(category.error);categoryId=category.id;}
    tx=createTransaction(owner,{kind:r.kind as "income"|"expense"|"refund"|"transfer",date:r.date,amount:r.amount,accountId:r.kind==="transfer"&&r.direction===1?destinationId!:a.id,categoryId,counterAccountId:r.kind==="transfer"?(r.direction===1?a.id:destinationId):undefined,description:r.description,merchant:r.merchant,notes:r.notes,idempotencyKey:`statement:${id}:${entry.id}`}).id;imported++;
   }
  }
  db.prepare("INSERT INTO statement_decisions(entry_id,statement_id,action,transaction_id,category_id,destination_id,reason,evidence,actor_id,reviewed_kind,request_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(entry.id,id,d.action,tx??null,d.action==="import"&&r?.kind!=="transfer"?categoryId??null:null,d.action==="import"&&r?.kind==="transfer"?destinationId??null:null,d.reason?.trim()??"",JSON.stringify(entry.candidates),owner,entry.row?.kind==="unresolved"&&d.action!=="skip"?r?.kind:null,payload(d));
 }
 const remaining=detail.entries.filter(e=>!e.action&&!decisions.has(e.id)).length;
 db.prepare("UPDATE statements SET status=?,error='' WHERE id=?").run(remaining?"partially_imported":"imported",id);audit(owner,"statement.commit",id,{imported,matched,excluded,remaining});return{imported,matched,excluded,remaining,conflicts:statementDetail(owner,id).entries.filter(e=>!e.action&&!e.eligible).length,duplicate:false};
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
