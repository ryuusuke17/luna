import {tokenizeCsv} from "./csv.ts";
import {isCalendarDate,parseMoney,currencyDigits,MAX_MINOR} from "./finance.ts";

const statementLabels=["Issuer","Statement month/title","Statement date","Due date","Credit limit","Previous balance","New charges","Payments/credits","Outstanding balance","Minimum due","Statement notes"];
const statementHeaders=["Sale date","Post date","Merchant","Amount","Category","Transaction notes","Transaction type"];
const legacyStatementHeaders=["Sale date","Post date","Merchant","Amount","Type","Category","Transaction notes"];
export function statementDateOnly(value:string){
 let date=value.trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
  const match=/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (\d{1,2}), (\d{4})$/i.exec(date);
  if(!match)throw Error("Use YYYY-MM-DD or MMM D, YYYY dates");
  date=`${match[3]}-${String(["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(match[1].slice(0,3).toLowerCase())+1).padStart(2,"0")}-${match[2].padStart(2,"0")}`;
 }
 if(!isCalendarDate(date))throw Error(`Invalid date: ${value}`);return date;
}
export function signedStatementAmount(value:string,currency:string){
 const text=value.trim();if(!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text))throw Error("Use exact decimals; no separators; maximum two fractional digits");
 return (text.startsWith("-")?-1:1)*parseMoney(text.replace(/^-/,""),currency);
}
export function exactStatementSum(values:number[]){const result=values.reduce((sum,n)=>sum+BigInt(n),0n);if(result>BigInt(MAX_MINOR)||result< -BigInt(MAX_MINOR))throw Error("Statement total exceeds supported range");return Number(result);}
export function parseCreditCardStatementCsv(text:string,{currency}:{currency:string}){
 if(currencyDigits(currency)!==2)throw Error("Statement CSV v1 supports two-decimal currencies only");
 const records=tokenizeCsv(text,5100),metadataRaw:Record<string,string>={},warnings:string[]=[];
 const normalized=(s:string)=>s.trim().toLowerCase();let header=-1,legacy=false;
 for(const [i,cells] of records.entries()){
  if(cells.every(c=>!c.trim()))continue;
  if(normalized(cells[0])===normalized(statementHeaders[0])){
   legacy=cells.length===7&&cells.every((cell,j)=>normalized(cell)===normalized(legacyStatementHeaders[j]));
   if(!legacy&&(cells.length!==7||cells.some((cell,j)=>normalized(cell)!==normalized(statementHeaders[j]))))throw Error(`Row ${i+1}: use Sale date,Post date,Merchant,Amount,Category,Transaction notes,Transaction type`);
   header=i;break;
  }
  const key=statementLabels.find(label=>normalized(label)===normalized(cells[0]));
  if(!key||cells.length!==2||Object.prototype.hasOwnProperty.call(metadataRaw,key))throw Error(`Row ${i+1}: unknown, duplicate or malformed metadata`);
  metadataRaw[key]=cells[1];
 }
 if(header<0)throw Error("Missing statement line header");
 for(const key of statementLabels)if(!Object.prototype.hasOwnProperty.call(metadataRaw,key)||(key!=="Statement notes"&&!metadataRaw[key].trim()))throw Error(`Missing metadata: ${key}`);
 const amount=(key:string,signed=false)=>{const result=signedStatementAmount(metadataRaw[key],currency);if(!signed&&result<0)throw Error(`${key} must be nonnegative`);return result;};
 const statementDate=statementDateOnly(metadataRaw["Statement date"]),dueDate=statementDateOnly(metadataRaw["Due date"]);
 const metadata={issuer:metadataRaw.Issuer,title:metadataRaw["Statement month/title"],statementDate,statementMonth:statementDate.slice(0,7),dueDate,currency,creditLimit:amount("Credit limit"),previousBalance:amount("Previous balance",true),newCharges:amount("New charges"),paymentsCredits:amount("Payments/credits"),originalOutstandingBalance:amount("Outstanding balance",true),minimumDue:amount("Minimum due"),notes:metadataRaw["Statement notes"]};
 const title=metadata.title.trim(),titleMonth=/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/i.exec(title);
 const titleIso=/^\d{4}-\d{2}$/.test(title)?title:titleMonth?`${titleMonth[2]}-${String(["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(titleMonth[1].toLowerCase())+1).padStart(2,"0")}`:null;
 if(titleIso&&titleIso!==metadata.statementMonth)warnings.push("Statement title differs from issue month; issue date controls filters");
 const lines=records.slice(header+1).flatMap((cells,index)=>{
  const rowNumber=header+index+2;if(cells.every(c=>!c.trim()))return[];
  if(cells.length>7){if(cells.slice(7).some(c=>c.trim()))throw Error(`Row ${rowNumber}: unexpected nonempty column`);warnings.push(`Row ${rowNumber}: empty trailing fields ignored`);}
  if(cells.length<7)throw Error(`Row ${rowNumber}: seven fields required`);
  try{
   const [sale,post,merchantRaw,amountRaw]=cells;
   const [typeRaw,categoryRaw,transactionNotesRaw]=legacy?[cells[4],cells[5],cells[6]]:[cells[6],cells[4],cells[5]];
   if(!merchantRaw.trim()||merchantRaw.length>2000||[typeRaw,categoryRaw,transactionNotesRaw].some(s=>s.length>2000))throw Error("Merchant required; fields maximum 2000 characters");
   const amountSigned=signedStatementAmount(amountRaw,currency);
   return[{rowNumber,rawFields:cells,saleDate:sale.trim()?statementDateOnly(sale):null,postDate:statementDateOnly(post),merchantRaw,amountSigned,typeRaw,categoryRaw,transactionNotesRaw,candidateType:amountSigned<0?"payment / credit":/^(installments?|instalments?)$/i.test(typeRaw.trim())||(!typeRaw.trim()&&/instalment|installment|\(\d+\/\d+\)/i.test(merchantRaw))?"installment candidate":"charge"}];
  }catch(error){throw Error(`Row ${rowNumber}: ${(error as Error).message}`);}
 });
 if(!lines.length||lines.length>5000)throw Error("Statement requires 1–5000 lines");
 const positiveLineSum=exactStatementSum(lines.filter(l=>l.amountSigned>0).map(l=>l.amountSigned)),negativeLineSum=exactStatementSum(lines.filter(l=>l.amountSigned<0).map(l=>l.amountSigned)),calculatedClosingBalance=exactStatementSum([metadata.previousBalance,metadata.newCharges,-metadata.paymentsCredits]);
 const reconciliation={positiveLineSum,negativeLineSum,netLineSum:exactStatementSum([positiveLineSum,negativeLineSum]),calculatedClosingBalance,reportedClosingBalance:metadata.originalOutstandingBalance,closingDifference:exactStatementSum([calculatedClosingBalance,-metadata.originalOutstandingBalance]),newChargesDifference:exactStatementSum([positiveLineSum,-metadata.newCharges]),creditDifference:exactStatementSum([-negativeLineSum,-metadata.paymentsCredits])};
 const balanceMismatch=[reconciliation.closingDifference,reconciliation.newChargesDifference,reconciliation.creditDifference].some(n=>n!==0);
 if(balanceMismatch)warnings.push("Balance difference requires explicit acknowledgement and explanation; source values remain unchanged");
 return{sourceFormat:"credit_card_statement_csv_v1",parserVersion:legacy?"credit-card-csv-v1":"credit-card-csv-v2",metadataRaw,metadata,lines,reconciliation,warnings,balanceMismatch};
}
export type CreditCardPreview=ReturnType<typeof parseCreditCardStatementCsv>;
