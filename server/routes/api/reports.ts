import { defineHandler } from "nitro";
import { getCookie,createError,getQuery } from "nitro/h3";
import { session } from "../../lib/auth";
import { db } from "../../lib/db";
import { balanceFor } from "../../lib/ledger";
export default defineHandler(event=>{
 if(!session(getCookie(event,"luna_session"))) throw createError({statusCode:401,statusMessage:"Sign in required"});
 const q=getQuery(event), month=typeof q.month==="string"&&/^\d{4}-\d{2}$/.test(q.month)?q.month:new Date().toISOString().slice(0,7), from=`${month}-01`, to=`${month}-31`;
 const totals=db.prepare("SELECT kind,COALESCE(SUM(amount),0) amount FROM transactions WHERE voided_at IS NULL AND posted_date BETWEEN ? AND ? GROUP BY kind").all(from,to) as {kind:string;amount:number}[];
 const accounts=db.prepare("SELECT id,name,type,liquid FROM accounts WHERE archived_at IS NULL").all() as {id:number;name:string;type:string;liquid:number}[];
 const assets=accounts.reduce((s,a)=>s+Math.max(0,balanceFor(a.id)),0), liabilities=accounts.reduce((s,a)=>s+Math.max(0,-balanceFor(a.id)),0);
 const sum=(kind:string)=>totals.find(x=>x.kind===kind)?.amount??0;
 return {month,assets,liabilities,netWorth:assets-liabilities,income:sum('income'),expenses:sum('expense')-sum('refund'),cashFlow:db.prepare("SELECT COALESCE(SUM(e.delta),0) amount FROM account_entries e JOIN transactions t ON t.id=e.transaction_id JOIN accounts a ON a.id=e.account_id WHERE a.liquid=1 AND t.voided_at IS NULL AND t.kind NOT IN ('opening','adjustment') AND t.posted_date BETWEEN ? AND ?").get(from,to),categories:db.prepare("SELECT c.name,SUM(CASE WHEN t.kind='refund' THEN -t.amount ELSE t.amount END) amount FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.voided_at IS NULL AND t.kind IN ('expense','refund') AND t.posted_date BETWEEN ? AND ? GROUP BY c.id ORDER BY amount DESC").all(from,to),coverage:accounts.map(a=>({account:a.name,openingDate:db.prepare("SELECT opening_date FROM accounts WHERE id=?").get(a.id)}))};
});
