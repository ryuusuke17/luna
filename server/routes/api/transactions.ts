import {defineHandler} from "nitro";
import {readBody,createError,getQuery} from "nitro/h3";
import {requireMutation,requireUser} from "../../lib/request";
import {db} from "../../lib/db";
import {isCalendarDate} from "../../../src/lib/finance";
import {createTransaction,resolveTransaction,transactionFeedback} from "../../lib/ledger";
export default defineHandler(async event=>{
 const user=requireUser(event);
 if(event.req.method==="GET"){
  const q=getQuery(event),where=["t.owner_id=?","t.voided_at IS NULL"],values:any[]=[user.id];
  function integer(key:string){const v=q[key];if(typeof v!=="string"||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1)throw createError({statusCode:400,statusMessage:`Invalid ${key}`});return Number(v);}
  if(q.month!==undefined){if(typeof q.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month))throw createError({statusCode:400,statusMessage:"Invalid month"});where.push("substr(t.posted_date,1,7)=?");values.push(q.month);}
  if(q.kind!==undefined){if(typeof q.kind!=="string"||!["income","expense","refund","transfer","opening","adjustment"].includes(q.kind))throw createError({statusCode:400,statusMessage:"Invalid type"});where.push("t.kind=?");values.push(q.kind);}
  for(const [key,column] of [["account","t.account_id"],["category","t.category_id"],["id","t.id"]])if(q[key]!==undefined){const n=integer(key);where.push(key==="account"?"(t.account_id=? OR t.counter_account_id=?)":`${column}=?`);values.push(key==="id"?resolveTransaction(user.id,n):n);if(key==="account")values.push(n);}
  if(q.search!==undefined){if(typeof q.search!=="string"||q.search.length>100)throw createError({statusCode:400,statusMessage:"Invalid search"});where.push("(instr(lower(t.description),lower(?))>0 OR instr(lower(t.merchant),lower(?))>0 OR EXISTS(SELECT 1 FROM csv_import_rows x WHERE x.owner_id=t.owner_id AND x.transaction_id=t.id AND instr(lower(x.source_id),lower(?))>0) OR EXISTS(SELECT 1 FROM statement_import_rows x WHERE x.owner_id=t.owner_id AND x.transaction_id=t.id AND instr(lower(x.source_id),lower(?))>0) OR EXISTS(SELECT 1 FROM statement_decisions x JOIN statement_entries e ON e.id=x.entry_id JOIN statements s ON s.id=e.statement_id WHERE s.owner_id=t.owner_id AND x.transaction_id=t.id AND instr(lower(json_extract(e.normalized_json,'$.sourceId')),lower(?))>0))");values.push(...Array(5).fill(q.search.trim()));}
  for(const [key,operator] of [["start",">="],["end","<="]])if(q[key]!==undefined){if(typeof q[key]!=="string"||!isCalendarDate(q[key]))throw createError({statusCode:400,statusMessage:"Invalid date range"});where.push(`t.posted_date${operator}?`);values.push(q[key]);}
  if(q.start&&q.end&&String(q.start)>String(q.end))throw createError({statusCode:400,statusMessage:"Invalid date range"});
  const imported="(EXISTS(SELECT 1 FROM csv_import_rows x WHERE x.owner_id=t.owner_id AND x.transaction_id=t.id) OR EXISTS(SELECT 1 FROM statement_import_rows x WHERE x.owner_id=t.owner_id AND x.transaction_id=t.id) OR EXISTS(SELECT 1 FROM statement_decisions x JOIN statements s ON s.id=x.statement_id WHERE s.owner_id=t.owner_id AND x.transaction_id=t.id))";
  if(q.source!==undefined){if(!["manual","import"].includes(String(q.source)))throw createError({statusCode:400,statusMessage:"Invalid source"});where.push((q.source==="manual"?"NOT ":"")+imported);}
  if(q.reconciliation!==undefined){if(!["reconciled","unreconciled"].includes(String(q.reconciliation)))throw createError({statusCode:400,statusMessage:"Invalid reconciliation state"});where.push((q.reconciliation==="unreconciled"?"NOT ":"")+"EXISTS(SELECT 1 FROM account_entries e JOIN reconciliations r ON r.account_id=e.account_id AND r.owner_id=t.owner_id WHERE e.transaction_id=t.id AND r.state='finalized' AND t.posted_date BETWEEN r.period_start AND r.period_end)");}
  const sorts:Record<string,string>={newest:"t.posted_date DESC,t.id DESC",oldest:"t.posted_date,t.id",highest:"t.amount DESC,t.id DESC",lowest:"t.amount,t.id"};if(q.sort!==undefined&&(typeof q.sort!=="string"||!sorts[q.sort]))throw createError({statusCode:400,statusMessage:"Invalid sort"});
  const paged=q.page!==undefined,page=paged?integer("page"):1,limit=paged?50:500,sql=`FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN accounts d ON d.id=t.counter_account_id WHERE ${where.join(" AND ")}`;
  const records=db.prepare(`SELECT t.*,a.name account_name,c.name category_name,d.name counter_account_name ${sql} ORDER BY ${sorts[String(q.sort??"newest")]} LIMIT ? OFFSET ?`).all(...values,limit,(page-1)*limit);
  const items=(records as {id:number}[]).map(t=>({...t,...transactionFeedback(user.id,t.id)}));
  return paged?{items,total:(db.prepare(`SELECT COUNT(*) total ${sql}`).get(...values) as {total:number}).total,page,pageSize:limit}:items;
 }
 if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody<any>(event);if(JSON.stringify(body??{}).length>2000)throw createError({statusCode:413,statusMessage:"Payload too large"});try{return createTransaction(user.id,body)}catch(error){throw createError({statusCode:400,statusMessage:error instanceof Error?error.message:"Invalid transaction"})}
});
