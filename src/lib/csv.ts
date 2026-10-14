import {decimalAmount} from "./finance.ts";
export const CSV_TEMPLATE = "date,description,merchant,type,amount,category,source_id,destination\r\n";
export function tokenizeCsv(input: string, maxRows = 5001): string[][] {
 if(typeof input!=="string"||new TextEncoder().encode(input).length>2_000_000)throw Error("CSV exceeds 2 MB");
 const text=input.replace(/^\uFEFF/,""),rows:string[][]=[];let row:string[]=[],field="",quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
 if(c==='"'){if(field||closed)throw Error("Malformed CSV quotes");quoted=true;}
 else if(c===','||c==='\n'||c==='\r'){row.push(field);field="";closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];if(rows.length>maxRows)throw Error("CSV exceeds 5,000 rows");}}
 else{if(closed)throw Error("Unexpected text after closing quote");field+=c;}}
 if(quoted)throw Error("Unclosed CSV quote");if(field||closed||row.length){row.push(field);rows.push(row);}if(rows.length>maxRows)throw Error("CSV exceeds 5,000 rows");
 return rows;
}
export function parseCsv(input: string): Record<string,string>[] {
 const rows=tokenizeCsv(input);
 const headers=rows.shift()?.map(h=>h.trim());if(!headers||new Set(headers).size!==headers.length||headers.some(h=>!h))throw Error("Missing or duplicate CSV headers");
 const allowed=["date","description","merchant","type","amount","category","source_id","destination"];
 if(["date","description","merchant","type","amount"].some(h=>!headers.includes(h))||headers.some(h=>!allowed.includes(h)))throw Error("Use the Luna CSV v1 template headers");
 return rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`Row ${i+1}: inconsistent columns`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
export function decimalMoney(minor: number): string { if(!Number.isSafeInteger(minor))throw Error("Invalid amount");const sign=minor<0?"-":"",n=BigInt(Math.abs(minor));return `${sign}${n/100n}.${String(n%100n).padStart(2,"0")}`; }
export function csvCell(value: string, text = true): string { const safe=text&&/^[\s]*[=+\-@\t\r]/.test(value)?`'${value}`:value;return `"${safe.replace(/"/g,'""')}"`; }
export function exportCsv(rows: {posted_date:string;description:string;merchant?:string;kind:string;amount:number;account_name?:string;category_name?:string;counter_account_name?:string;original_currency?:string;original_amount?:number;exchange_rate?:string;included_fee?:number}[]):string {
 return ["date,description,merchant,type,amount_php,account,category,destination,original_currency,original_total,exchange_rate_php,included_fee,original_subtotal",...rows.map(r=>{const currency=r.original_currency??"PHP",total=r.original_amount??r.amount,fee=r.included_fee??0;return [csvCell(r.posted_date),csvCell(r.description),csvCell(r.merchant??""),csvCell(r.kind),csvCell(decimalMoney(r.amount),false),csvCell(r.account_name??""),csvCell(r.category_name??""),csvCell(r.counter_account_name??""),csvCell(currency),csvCell(decimalAmount(total,currency),false),csvCell(r.exchange_rate??"1",false),csvCell(decimalAmount(fee,currency),false),csvCell(decimalAmount(total-fee,currency),false)].join(",");})].join("\r\n");
}
