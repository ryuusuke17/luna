import {decimalMoney,tokenizeCsv} from "../../src/lib/csv.ts";
import {isCalendarDate,parseMoney,MAX_MINOR} from "../../src/lib/finance.ts";

export type StatementSummary={issuer?:string;title?:string;statementDate?:string;dueDate?:string;creditLimit?:number;previousBalance?:number;newCharges?:number;paymentsCredits?:number;outstandingBalance?:number;minimumDue?:number;notes?:string};
export type StatementRow={date:string;saleDate?:string;postDate:string;description:string;merchant:string;kind:"expense"|"transfer"|"unresolved";amount:number;direction:number;sourceAmount:number;notes?:string;categoryHint?:string;sourceId:null};
const labels:Record<string,keyof StatementSummary>={"issuer":"issuer","statement month":"title","statement title":"title","statement month/title":"title","statement date":"statementDate","due date":"dueDate","payment due date":"dueDate","credit limit":"creditLimit","previous balance":"previousBalance","new charges":"newCharges","payments/credits":"paymentsCredits","payments / credits":"paymentsCredits","payments and credits":"paymentsCredits","outstanding balance":"outstandingBalance","minimum due":"minimumDue","minimum amount due":"minimumDue","statement notes":"notes"};
const headers:Record<string,string>={"sale date":"saleDate","post date":"postDate","posting date":"postDate","description":"description","amount":"amount","amount (php)":"amount","category":"categoryHint","transaction notes":"notes","notes":"notes"};
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
   for(let i=0;i<c.length;i++){
    if(!c[i].trim())continue;const key=labels[label(c[i])];if(!key)throw Error(`Row ${index+1}: unknown summary field ${c[i]}`);
    if(Object.hasOwn(summary,key))throw Error(`Row ${index+1}: duplicate summary field ${c[i]}`);
    let j=i+1;while(j<c.length&&!c[j].trim())j++;
    if((j===c.length||labels[label(c[j])])&&(key==="notes"||key==="title"||key==="issuer")){continue;}
    if(j===c.length||labels[label(c[j])])throw Error(`Row ${index+1}: missing value for ${c[i]}; omit optional fields instead`);
    const value=c[j];if(key==="title"||key==="notes"||key==="issuer"){if(value.length>(key==="notes"?2000:240))throw Error(`Row ${index+1}: summary text too long`);summary[key]=value;}
    else if(key==="statementDate"||key==="dueDate")summary[key]=statementDate(value);
    else summary[key]=statementMoney(value);
    i=j;
   }
  }else{
   if(rows.length>=5000)throw Error("CSV exceeds 5,000 transaction rows");
   const raw:Record<string,string>={};c.forEach((value,i)=>{if(columns![i])raw[columns![i]]=value;else raw[`unknown column ${i+1}`]=value;});
   let row:StatementRow|undefined,warning="";
   try{
    if(c.some((v,i)=>v.trim()&&!columns![i]))throw Error("Unknown nonempty transaction column; correct the file, no fields are discarded");
    const postDate=statementDate(raw.postDate??""),saleDate=raw.saleDate?.trim()?statementDate(raw.saleDate):undefined,sourceAmount=statementMoney(raw.amount??"",true);
    if(!sourceAmount)throw Error("Transaction amount must be nonzero");
    if(!(raw.description??"").trim()||raw.description.length>240||(raw.notes??"").length>500||(raw.categoryHint??"").length>60)throw Error("Description required (240 characters maximum); transaction notes maximum 500 characters; category maximum 60 characters");
    row={date:postDate,postDate,saleDate,description:raw.description,merchant:"",kind:sourceAmount>0?"expense":raw.description.trim().toUpperCase()==="PAYMENT RECEIVED - THANK YOU"?"transfer":"unresolved",amount:Math.abs(sourceAmount),direction:sourceAmount>0?-1:1,sourceAmount,notes:raw.notes||undefined,categoryHint:raw.categoryHint,sourceId:null};
   }catch(e){warning=`Row ${index+1}: ${(e as Error).message}`;}
   rows.push({raw,row,warning});
  }
 }
 if(!columns||!headerCells||!rows.length)throw Error("Full statement requires summary labels followed by a Sale date, Post date, Description, Amount, Transaction notes table with data rows");
 return{summary,rawSummary,rows,parserVersion:"luna-full-statement-v1"};
}
export function statementDiscrepancies(summary:StatementSummary|null,rows:({sourceAmount?:number}|null)[]){
 if(!summary)return[];const errors:string[]=[];
 const sum=(values:number[])=>values.reduce((a,b)=>a+BigInt(b),0n);
 const money=(value:number|bigint)=>typeof value==="number"?decimalMoney(value):``;
 const {previousBalance,newCharges,paymentsCredits,outstandingBalance}=summary;
 if(previousBalance!==undefined&&newCharges!==undefined&&paymentsCredits!==undefined&&outstandingBalance!==undefined){const expected=sum([previousBalance,newCharges,-paymentsCredits]);if(expected!==BigInt(outstandingBalance))errors.push(`Summary outstanding is PHP ${decimalMoney(outstandingBalance)}; calculated outstanding is ${expected} PHP minor units. Review totals before reconciliation.`);}
 if(rows.some(r=>r?.sourceAmount===undefined)){errors.push("Statement row totals unavailable: invalid or missing signed source amounts. Correct the statement before reconciliation.");return errors;}
 const amounts=rows.map(r=>r!.sourceAmount!),charges=sum(amounts.filter(n=>n>0)),credits=sum(amounts.filter(n=>n<0).map(n=>-n));
 if(charges>BigInt(MAX_MINOR)||credits>BigInt(MAX_MINOR))errors.push("Statement row total exceeds supported PHP range. Final reconciliation blocked.");
 if(newCharges!==undefined&&BigInt(newCharges)!==charges)errors.push(`Summary new charges PHP ${decimalMoney(newCharges)} differ from row charges ${charges} PHP minor units.`);
 if(paymentsCredits!==undefined&&BigInt(paymentsCredits)!==credits)errors.push(`Summary payments/credits PHP ${decimalMoney(paymentsCredits)} differ from row credits ${credits} PHP minor units.`);
 if(previousBalance!==undefined&&outstandingBalance!==undefined&&sum([previousBalance])+charges-credits!==BigInt(outstandingBalance))errors.push("Previous balance plus signed row movements differs from summary outstanding. Review totals before reconciliation.");
 return errors;
}
