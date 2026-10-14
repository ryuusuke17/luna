import {defineHandler} from "nitro";
import {readBody,createError,getQuery} from "nitro/h3";
import {requireMutation,requireUser} from "../../lib/request";
import {db} from "../../lib/db";
import {createTransaction,resolveTransaction,transactionFeedback} from "../../lib/ledger";
export default defineHandler(async event=>{
 const user=requireUser(event);
 if(event.req.method==="GET"){
  const q=getQuery(event),where=["t.owner_id=?","t.voided_at IS NULL"],values:any[]=[user.id];
  function integer(key:string){const v=q[key];if(typeof v!=="string"||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1)throw createError({statusCode:400,statusMessage:`Invalid ${key}`});return Number(v);}
  if(q.month!==undefined){if(typeof q.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month))throw createError({statusCode:400,statusMessage:"Invalid month"});where.push("substr(t.posted_date,1,7)=?");values.push(q.month);}
  if(q.kind!==undefined){if(typeof q.kind!=="string"||!["income","expense","refund","transfer","opening","adjustment"].includes(q.kind))throw createError({statusCode:400,statusMessage:"Invalid type"});where.push("t.kind=?");values.push(q.kind);}
  for(const [key,column] of [["account","t.account_id"],["category","t.category_id"],["id","t.id"]])if(q[key]!==undefined){const n=integer(key);where.push(key==="account"?"(t.account_id=? OR t.counter_account_id=?)":`${column}=?`);values.push(key==="id"?resolveTransaction(user.id,n):n);if(key==="account")values.push(n);}
  if(q.search!==undefined){if(typeof q.search!=="string"||q.search.length>100)throw createError({statusCode:400,statusMessage:"Invalid search"});where.push("(instr(lower(t.description),lower(?))>0 OR instr(lower(t.merchant),lower(?))>0)");values.push(q.search.trim(),q.search.trim());}
  const sorts:Record<string,string>={newest:"t.posted_date DESC,t.id DESC",oldest:"t.posted_date,t.id",highest:"t.amount DESC,t.id DESC",lowest:"t.amount,t.id"};if(q.sort!==undefined&&(typeof q.sort!=="string"||!sorts[q.sort]))throw createError({statusCode:400,statusMessage:"Invalid sort"});
  const paged=q.page!==undefined,page=paged?integer("page"):1,limit=paged?50:500,sql=`FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN accounts d ON d.id=t.counter_account_id WHERE ${where.join(" AND ")}`;
  const records=db.prepare(`SELECT t.*,a.name account_name,c.name category_name,d.name counter_account_name ${sql} ORDER BY ${sorts[String(q.sort??"newest")]} LIMIT ? OFFSET ?`).all(...values,limit,(page-1)*limit);
  const items=(records as {id:number}[]).map(t=>({...t,...transactionFeedback(user.id,t.id)}));
  return paged?{items,total:(db.prepare(`SELECT COUNT(*) total ${sql}`).get(...values) as {total:number}).total,page,pageSize:limit}:items;
 }
 if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody<any>(event);if(JSON.stringify(body??{}).length>2000)throw createError({statusCode:413,statusMessage:"Payload too large"});try{return createTransaction(user.id,body)}catch(error){throw createError({statusCode:400,statusMessage:error instanceof Error?error.message:"Invalid transaction"})}
});
