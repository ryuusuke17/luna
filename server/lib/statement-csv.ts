import {decimalMoney,tokenizeCsv,parseCsv} from "../../src/lib/csv.ts";
import {isCalendarDate,parseMoney,MAX_MINOR} from "../../src/lib/finance.ts";

export type StatementSummary={issuer?:string;title?:string;statementDate?:string;dueDate?:string;creditLimit?:number;previousBalance?:number;newCharges?:number;paymentsCredits?:number;outstandingBalance?:number;minimumDue?:number;notes?:string};
export type StatementRow={date:string;saleDate?:string;postDate:string;description:string;merchant:string;kind:"expense"|"income"|"refund"|"transfer"|"unresolved";isInstallment?:boolean;amount:number;direction:number;sourceAmount:number;notes?:string;categoryHint?:string;sourceId:null};
const labels:Record<string,keyof StatementSummary>={"issuer":"issuer","statement month":"title","statement title":"title","statement month/title":"title","statement date":"statementDate","due date":"dueDate","payment due date":"dueDate","credit limit":"creditLimit","previous balance":"previousBalance","new charges":"newCharges","payments/credits":"paymentsCredits","payments / credits":"paymentsCredits","payments and credits":"paymentsCredits","outstanding balance":"outstandingBalance","minimum due":"minimumDue","minimum amount due":"minimumDue","statement notes":"notes"};
const headers:Record<string,string>={"sale date":"saleDate","post date":"postDate","posting date":"postDate","description":"description","merchant":"description","amount":"amount","amount (php)":"amount","transaction type":"type","type":"type","category":"categoryHint","transaction notes":"notes","notes":"notes"};
const label=(s:string)=>s.trim().toLowerCase().replace(/:$/,"").replace(/\s+/g," ");
export function statementDate(value:string){
 let date=value.trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
  const m=/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (\d{1,2}), (\d{4})$/i.exec(date);
  if(!m)throw Error("Use ISO or English month-name dates, for example Sep 21, 2026");
  const month=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[1].slice(0,3).toLowerCase())+1;
  date=`${m[3]}-${String(month).padStart(2,"0")}-${m[2].padStart(2,"0")}`;
 }
 if(!isCalendarDate(date))throw Error(`Invalid calendar date: ${value}`);return date;
}
export function statementMoney(value:string,signed=false){
 const text=value.trim().replace(/^PHP\s+/i,"");
 if(!new RegExp(`^${signed?"-?":""}(?:0|[1-9]\\d*|[1-9]\\d{0,2}(?:,\\d{3})+)(?:\\.\\d{1,2})?$`).test(text))throw Error("Use exact PHP decimals, optional thousands commas, at most two decimal places");
 const negative=text.startsWith("-"),minor=parseMoney(text.replace(/^-/ ,"").replace(/,/g,""));return negative?-minor:minor;
}
export function parseStatementCsv(text:string){
 const cells=tokenizeCsv(text,10000);
 // ponytail: only the documented spreadsheet labels/table; add explicit versioned layouts for other exports.
 if(cells.find(r=>r.some(c=>c.trim()))?.some(c=>label(c)==="date"))return null;
 if(!cells.some(r=>r.some(c=>labels[label(c)]||label(c)==="sale date")))return null;
 const summary:StatementSummary={},rawSummary:{cells:string[];row:number}[]=[],rows:{raw:Record<string,string>;row?:StatementRow;warning:string}[]=[];
 const metadataWarnings:string[]=[];
 let columns:string[]|undefined,headerCells:string[]|undefined;
 for(const [index,c] of cells.entries()){
  if(c.every(v=>!v.trim()))continue;
  if(!columns){
   if(c.some(v=>label(v)==="sale date")){
    columns=c.map(v=>v.trim()?headers[label(v)]:"");headerCells=c;
    if(c.some((v,i)=>v.trim()&&!columns![i])||["saleDate","postDate","description","amount"].some(h=>!columns!.includes(h))||new Set(columns.filter(Boolean)).size!==columns.filter(Boolean).length)throw Error(`Row ${index+1}: unsupported transaction table headers`);
    continue;
   }
   rawSummary.push({cells:c,row:index+1});
   try{for(let i=0;i<c.length;i++){
    if(!c[i].trim())continue;const key=labels[label(c[i])];if(!key)throw Error(`Row ${index+1}: unknown summary field ${c[i]}`);
    if(Object.hasOwn(summary,key))throw Error(`Row ${index+1}: duplicate summary field ${c[i]}`);
    let j=i+1;while(j<c.length&&!c[j].trim())j++;
    if((j===c.length||labels[label(c[j])])&&(key==="notes"||key==="title"||key==="issuer")){continue;}
    if(j===c.length||labels[label(c[j])])throw Error(`Row ${index+1}: missing value for ${c[i]}; omit optional fields instead`);
    const value=c[j];if(key==="title"||key==="notes"||key==="issuer"){if(value.length>(key==="notes"?2000:240))throw Error(`Row ${index+1}: summary text too long`);summary[key]=value;}
    else if(key==="statementDate"||key==="dueDate")summary[key]=statementDate(value);
    else summary[key]=statementMoney(value);
    i=j;
   }}catch(error){metadataWarnings.push(error instanceof Error?error.message:"Invalid optional statement metadata");}
  }else{
   if(rows.length>=5000)throw Error("CSV exceeds 5,000 transaction rows");
   const raw:Record<string,string>={};c.forEach((value,i)=>{if(columns![i])raw[columns![i]]=value;else raw[`unknown column ${i+1}`]=value;});
   let row:StatementRow|undefined,warning="";
   try{
    if(c.some((v,i)=>v.trim()&&!columns![i]))throw Error("Unknown nonempty transaction column; correct the file, no fields are discarded");
    const postDate=statementDate(raw.postDate??""),saleDate=raw.saleDate?.trim()?statementDate(raw.saleDate):undefined,sourceAmount=statementMoney(raw.amount??"",true);
    if(!sourceAmount)throw Error("Transaction amount must be nonzero");
    if(!(raw.description??"").trim()||raw.description.length>240||(raw.notes??"").length>500||(raw.categoryHint??"").length>60)throw Error("Merchant required (240 characters maximum); transaction notes maximum 500 characters; category maximum 60 characters");
    const sourceType=(raw.type??"").trim().toLowerCase(),type=sourceType==="installments"?"installment":sourceType==="card repayment received"?"payment":sourceType;
    if(type&&!["expense","installment","income","refund","transfer","payment"].includes(type))throw Error("Type must be Expense, Installments, Income, Refund, Transfer or Payment; Category is separate");
    const kind:StatementRow["kind"]=type?(type==="installment"?"expense":type==="payment"?"transfer":type as StatementRow["kind"]):sourceAmount>0?"expense":raw.description.trim().toUpperCase()==="PAYMENT RECEIVED - THANK YOU"?"transfer":"unresolved";
    if(kind==="expense"&&sourceAmount<0)throw Error("Expense and Installments require a positive billed amount; classify credits as Refund or Payment");
    row={date:postDate,postDate,saleDate,description:raw.description,merchant:"",kind,isInstallment:type?type==="installment":undefined,amount:Math.abs(sourceAmount),direction:kind==="income"||kind==="refund"||type==="payment"?1:sourceAmount>0?-1:1,sourceAmount,notes:raw.notes||undefined,categoryHint:raw.categoryHint,sourceId:null};
   }catch(e){warning=`Row ${index+1}: ${(e as Error).message}`;}
   rows.push({raw,row,warning});
  }
 }
 if(!columns||!headerCells||!rows.length)throw Error("Full statement requires a Sale date, Post date, Merchant (or Description), Amount table with data rows; Type, Category and Transaction notes are optional");
 return{summary,rawSummary,rows,metadataWarnings,parserVersion:columns.includes("type")?"luna-full-statement-v2":"luna-full-statement-v1"};
}
export function statementDiscrepancies(summary:StatementSummary|null,rows:({sourceAmount?:number}|null)[]){
 if(!summary)return[];const errors:string[]=[];
 const sum=(values:number[])=>values.reduce((a,b)=>a+BigInt(b),0n);
 const money=(value:number|bigint)=>typeof value==="number"?decimalMoney(value):``;
 const {previousBalance,newCharges,paymentsCredits,outstandingBalance}=summary;
 if(previousBalance!==undefined&&newCharges!==undefined&&paymentsCredits!==undefined&&outstandingBalance!==undefined){const expected=sum([previousBalance,newCharges,-paymentsCredits]);if(expected!==BigInt(outstandingBalance))errors.push(`Summary outstanding is PHP ${decimalMoney(outstandingBalance)}; calculated outstanding is ${expected} PHP minor units. Reference totals only; no balancing adjustment is created.`);}
 if(rows.some(r=>r?.sourceAmount===undefined)){errors.push("Statement row totals unavailable: invalid or missing signed source amounts. Correct unresolved rows in Transactions.");return errors;}
 const amounts=rows.map(r=>r!.sourceAmount!),charges=sum(amounts.filter(n=>n>0)),credits=sum(amounts.filter(n=>n<0).map(n=>-n));
 if(charges>BigInt(MAX_MINOR)||credits>BigInt(MAX_MINOR))errors.push("Statement row total exceeds supported PHP range. Reference totals cannot be calculated.");
 if(newCharges!==undefined&&BigInt(newCharges)!==charges)errors.push(`Summary new charges PHP ${decimalMoney(newCharges)} differ from row charges ${charges} PHP minor units.`);
 if(paymentsCredits!==undefined&&BigInt(paymentsCredits)!==credits)errors.push(`Summary payments/credits PHP ${decimalMoney(paymentsCredits)} differ from row credits ${credits} PHP minor units.`);
 if(previousBalance!==undefined&&outstandingBalance!==undefined&&sum([previousBalance])+charges-credits!==BigInt(outstandingBalance))errors.push("Previous balance plus signed row movements differs from summary outstanding. Source totals are reference only.");
 return errors;
}

// Only transport/header formatting is normalized; source field values remain untouched.
export function transactionCsvFormatting(text:string){
 const cells=tokenizeCsv(text,10000),changes:string[]=[];
 if(text.startsWith("\uFEFF"))changes.push("Removed UTF-8 BOM");
 if(text.includes("\r\n"))changes.push("Read CRLF line endings as CSV row separators; quoted field text preserved");
 else if(text.includes("\r"))changes.push("Read CR line endings as CSV row separators; quoted field text preserved");
 const full=!cells.find(r=>r.some(c=>c.trim()))?.some(c=>label(c)==="date");
 const headerIndex=full?cells.findIndex(r=>r.some(c=>label(c)==="sale date")):0;
 const header=cells[headerIndex];
 if(header){
  const normalized=header.map(value=>value.trim().replace(/\s+/g," "));
  if(header.some((value,i)=>value!==normalized[i]))changes.push("Trimmed/collapsed header whitespace");
  if(full&&header.some(value=>["posting date","description","amount (php)","notes"].includes(label(value))))changes.push("Mapped documented header aliases to posting date, merchant, PHP amount or transaction notes");
  let width=normalized.length;while(width&&normalized[width-1]==="")width--;
  if(width<normalized.length||cells.slice(headerIndex+1).some(row=>row.length>width&&row.slice(width).every(value=>!value.trim())))changes.push("Ignored empty trailing CSV cells; nonempty columns remain validated");
 }
 return changes;
}
export function parseTransactionCsv(text:string){
 const cells=tokenizeCsv(text),header=cells.shift()?.map(value=>value.trim().replace(/\s+/g," "));
 if(!header)throw Error("Missing CSV headers");
 while(header.at(-1)==="")header.pop();
 const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"';
 const rows=cells.map((row,index)=>{
  if(row.length<header.length||row.slice(header.length).some(value=>value.trim()))throw Error(`Row ${index+1}: inconsistent or unknown nonempty columns`);
  return row.slice(0,header.length);
 });
 return parseCsv([header,...rows].map(row=>row.map(quote).join(",")).join("\n"));
}
