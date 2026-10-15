import {createHash,randomUUID} from "node:crypto";
import {chmodSync,closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,unlinkSync,writeFileSync} from "node:fs";
import {isAbsolute,join,relative,resolve,sep} from "node:path";
import {z} from "zod";
import {db} from "./db.ts";
import {parseStatementCsv,statementDate,statementDiscrepancies,statementMoney} from "./statement-csv.ts";
import {isCalendarDate} from "../../src/lib/finance.ts";

const uploadSchema=z.object({filename:z.string().min(1).max(180),mime:z.string().max(100),base64:z.string().min(1).max(2_666_668),accountId:z.number().int().positive().nullable().optional()}).strict();
const linkSchema=z.object({accountId:z.number().int().positive().nullable(),version:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Stored={id:number;owner_id:number;account_id:number|null;account_name_snapshot:string|null;filename:string;file_key:string;file_hash:string;size:number;parser_version:string;summary_json:string;raw_summary_json:string;rows_json:string;warnings_json:string;revision:number;created_at:string;account_name:string|null};
const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const inside=(path:string)=>!path||path!==".."&&!path.startsWith(`..${sep}`)&&!isAbsolute(path);
const version=(record:Stored)=>hash(JSON.stringify([record.id,record.owner_id,record.account_id,record.file_hash,record.revision]));
function ownedAccount(owner:number,id:number|null|undefined){
 if(id==null)return null;
 const account=db.prepare("SELECT id,name FROM accounts WHERE id=? AND owner_id=? AND archived_at IS NULL").get(id,owner) as {id:number;name:string}|undefined;
 if(!Number.isSafeInteger(id)||!account)throw Error("Choose an available account belonging to this workspace");
 return account;
}
function record(owner:number,id:number){
 if(!Number.isSafeInteger(id)||id<1)throw Error("Statement unavailable");
 const found=db.prepare("SELECT s.*,a.name account_name FROM statement_archives s LEFT JOIN accounts a ON a.id=s.account_id AND a.owner_id=s.owner_id WHERE s.owner_id=? AND s.id=?").get(owner,id) as Stored|undefined;
 if(!found)throw Error("Statement unavailable");return found;
}
function present(stored:Stored,detail=false){
 const {file_key,owner_id,summary_json,raw_summary_json,rows_json,warnings_json,...safe}=stored;
 return{...safe,version:version(stored),summary:JSON.parse(summary_json),row_count:(JSON.parse(rows_json) as unknown[]).length,warnings:JSON.parse(warnings_json),...(detail?{rows:JSON.parse(rows_json),rawSummary:JSON.parse(raw_summary_json)}:{})};
}
function directory(){
 const configured=process.env.LUNA_STATEMENTS_PATH;
 if(process.env.NODE_ENV==="production"&&!configured)throw Error("Configure private persistent statement storage before uploading");
 const root=resolve(configured||"./data/private-statements"),directory=join(root,"archive-only");
 for(const publicRoot of [resolve("public"),resolve(".output/public"),resolve("src")]){
  for(const candidate of [root,directory])if(inside(relative(publicRoot,candidate)))throw Error("Statement storage must be private, outside public and source directories");
 }
 mkdirSync(directory,{recursive:true,mode:0o700});
 if(lstatSync(directory).isSymbolicLink())throw Error("Archive storage cannot be a symbolic link");
 for(const publicRoot of [resolve("public"),resolve(".output/public"),resolve("src")])if(existsSync(publicRoot)){
  if(inside(relative(realpathSync(publicRoot),realpathSync(directory))))throw Error("Statement storage must be private, outside public and source directories");
 }
 chmodSync(directory,0o700);return directory;
}
function filePath(key:string){if(!/^[a-f0-9-]{36}\.csv$/.test(key))throw Error("Invalid private statement reference");return join(directory(),key);}
function audit(owner:number,action:string,id:number,details:unknown){db.prepare("INSERT INTO audit_events(owner_id,action,entity_id,details) VALUES(?,?,?,?)").run(owner,action,id,JSON.stringify(details));}

export function saveStatementArchive(owner:number,input:unknown){
 const parsedInput=uploadSchema.safeParse(input);if(!parsedInput.success)throw Error("Invalid statement upload; choose a CSV up to 2 MB and an optional owned account");
 const value=parsedInput.data;
 if(!/^.+\.csv$/i.test(value.filename)||/[/\\]/.test(value.filename)||Array.from(value.filename).some(character=>character.charCodeAt(0)<32)||!["text/csv","application/csv","application/vnd.ms-excel","text/plain",""].includes(value.mime))throw Error("Choose a UTF-8 full-statement CSV. PDF and Excel extraction are unsupported");
 const bytes=Buffer.from(value.base64,"base64");if(!bytes.length||bytes.length>2_000_000||bytes.toString("base64")!==value.base64)throw Error("Choose a nonempty, valid CSV up to 2 MB");
 const account=ownedAccount(owner,value.accountId),fileHash=hash(bytes);
 const existing=db.prepare("SELECT id FROM statement_archives WHERE owner_id=? AND file_hash=?").get(owner,fileHash) as {id:number}|undefined;
 if(existing){downloadStatementArchive(owner,existing.id);const saved=statementArchiveDetail(owner,existing.id);return{...saved,duplicate:true,accountMismatch:(account?.id??null)!==saved.account_id};}
 let text:string;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw Error("Save the statement as a UTF-8 CSV and try again");}
 const parsed=parseStatementCsv(text);if(!parsed||!parsed.rawSummary.length)throw Error("Include statement summary metadata above the Sale date, Post date, Merchant, Amount table");
 const rows=parsed.rows.map(({raw},index)=>{
  if(Object.entries(raw).some(([key,value])=>key.startsWith("unknown column ")&&value.trim()))throw Error(`Row ${index+1}: nonempty unexpected column; correct the file before uploading`);
  if((raw.description??"").length>240||(raw.notes??"").length>500||(raw.categoryHint??"").length>60||(raw.type??"").length>60)throw Error(`Row ${index+1}: statement text exceeds the supported field lengths`);
  const warnings:string[]=[];
  function date(value:string|undefined,required=false){if(!value?.trim()){if(required)warnings.push("Post date is missing");return null;}try{return statementDate(value);}catch{warnings.push(`Invalid source date: ${value}`);return null;}}
  let amount:number|null=null;try{amount=statementMoney(raw.amount??"",true);}catch{warnings.push("Invalid source amount; the original value is retained");}
  if(!raw.description?.trim())warnings.push("Merchant is missing");
  return{index:index+1,raw,saleDate:date(raw.saleDate),postDate:date(raw.postDate,true),merchant:raw.description??"",amount,type:raw.type??"",category:raw.categoryHint??"",notes:raw.notes??"",warnings};
 });
 const warnings=[...parsed.metadataWarnings,...statementDiscrepancies(parsed.summary,rows.map(row=>row.amount===null?null:{sourceAmount:row.amount})).map(warning=>warning.replace("Correct unresolved rows in Transactions.","Source values are retained for reference.").replace(/(-?\d+) PHP minor units/g,(_,digits:string)=>{const minor=BigInt(digits),absolute=minor<0n?-minor:minor;return `PHP ${minor<0n?"-":""}${absolute/100n}.${String(absolute%100n).padStart(2,"0")}`;}))];
 const key=`${randomUUID()}.csv`,path=filePath(key);let created=false;
 try{const descriptor=openSync(path,"wx",0o600);created=true;try{writeFileSync(descriptor,bytes);}finally{closeSync(descriptor);}return db.transaction(()=>{
  const duplicate=db.prepare("SELECT id FROM statement_archives WHERE owner_id=? AND file_hash=?").get(owner,fileHash) as {id:number}|undefined;
  if(duplicate){unlinkSync(path);const saved=statementArchiveDetail(owner,duplicate.id);return{...saved,duplicate:true,accountMismatch:(account?.id??null)!==saved.account_id};}
  const id=Number(db.prepare("INSERT INTO statement_archives(owner_id,account_id,account_name_snapshot,filename,file_key,file_hash,size,parser_version,summary_json,raw_summary_json,rows_json,warnings_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(owner,account?.id??null,account?.name??null,value.filename,key,fileHash,bytes.length,parsed.parserVersion,JSON.stringify(parsed.summary),JSON.stringify(parsed.rawSummary),JSON.stringify(rows),JSON.stringify(warnings)).lastInsertRowid);
  audit(owner,"statement-archive.upload",id,{hash:fileHash,size:bytes.length,accountId:account?.id??null});
  return{...statementArchiveDetail(owner,id),duplicate:false,accountMismatch:false};
 }).immediate();}catch(error){if(created&&existsSync(path))unlinkSync(path);throw error;}
}

export function statementArchiveDetail(owner:number,id:number){return present(record(owner,id),true);}
export function linkStatementArchive(owner:number,id:number,input:unknown){
 const parsed=linkSchema.safeParse(input);if(!parsed.success)throw Error("Choose an account or Unlinked, then reload the statement before saving");
 return db.transaction(()=>{
  const saved=record(owner,id);if(parsed.data.version!==version(saved))throw Error("This statement changed. Reload it before changing the account link");
  const account=ownedAccount(owner,parsed.data.accountId);if(saved.account_id===(account?.id??null))return statementArchiveDetail(owner,id);
  db.prepare("UPDATE statement_archives SET account_id=?,account_name_snapshot=COALESCE(?,account_name_snapshot),revision=revision+1 WHERE id=? AND owner_id=?").run(account?.id??null,account?.name??null,id,owner);
  audit(owner,"statement-archive.link",id,{before:saved.account_id,after:account?.id??null});return statementArchiveDetail(owner,id);
 }).immediate();
}
export function listStatementArchives(owner:number,query:Record<string,unknown>={}){
 const filter=z.object({page:z.string().regex(/^[1-9]\d{0,5}$/).optional(),account:z.string().regex(/^(?:unlinked|[1-9]\d{0,14})$/).optional(),issuer:z.string().max(240).optional(),start:z.string().optional(),end:z.string().optional()}).strict().safeParse(query);
 if(!filter.success)throw Error("Invalid statement filters");
 const {account,issuer,start,end}=filter.data,page=Number(filter.data.page??1),pageSize=25;
 if(start&&!isCalendarDate(start)||end&&!isCalendarDate(end)||start&&end&&start>end)throw Error("Choose valid statement dates with start before end");
 const where=["s.owner_id=?"],args:(string|number)[]=[owner];
 if(account){where.push(account==="unlinked"?"s.account_id IS NULL":"s.account_id=?");if(account!=="unlinked")args.push(Number(account));}
 if(issuer){where.push("json_extract(s.summary_json,'$.issuer')=?");args.push(issuer);}
 if(start){where.push("json_extract(s.summary_json,'$.statementDate')>=?");args.push(start);}
 if(end){where.push("json_extract(s.summary_json,'$.statementDate')<=?");args.push(end);}
 const condition=where.join(" AND ");
 const total=(db.prepare(`SELECT COUNT(*) total FROM statement_archives s WHERE ${condition}`).get(...args) as {total:number}).total;
 const records=db.prepare(`SELECT s.*,a.name account_name FROM statement_archives s LEFT JOIN accounts a ON a.id=s.account_id AND a.owner_id=s.owner_id WHERE ${condition} ORDER BY s.id DESC LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize) as Stored[];
 const issuers=(db.prepare("SELECT DISTINCT json_extract(summary_json,'$.issuer') issuer FROM statement_archives WHERE owner_id=? ORDER BY issuer").all(owner) as {issuer:string|null}[]).map(item=>item.issuer).filter(Boolean);
 return{items:records.map(item=>present(item)),total,page,pageSize,issuers};
}
export function downloadStatementArchive(owner:number,id:number){
 const saved=record(owner,id),path=filePath(saved.file_key);
 if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw Error("Statement original unavailable");
 const bytes=readFileSync(path);if(hash(bytes)!==saved.file_hash)throw Error("Statement original failed its integrity check; restore the verified backup");
 return{filename:saved.filename,bytes};
}
