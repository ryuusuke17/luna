import {mutateBudget} from "../../lib/budgets";
import {defineHandler} from "nitro";
import {readBody,createError} from "nitro/h3";
import {requireMutation,requireUser} from "../../lib/request";
import {atomic,db} from "../../lib/db";
import {parseMoney} from "../../../src/lib/finance";
export default defineHandler(async event=>{const user=requireUser(event);if(event.req.method==="GET")return db.prepare("SELECT b.*,c.name category_name,c.kind,COALESCE((SELECT SUM(CASE WHEN t.kind='refund' THEN -t.amount ELSE t.amount END) FROM transactions t WHERE t.owner_id=b.owner_id AND t.category_id=b.category_id AND ((c.kind='income' AND t.kind='income') OR (c.kind='expense' AND t.kind IN('expense','refund'))) AND t.voided_at IS NULL AND substr(t.posted_date,1,7)=b.month),0) actual FROM budgets b JOIN categories c ON c.id=b.category_id AND c.owner_id=b.owner_id WHERE b.owner_id=? ORDER BY b.month DESC,c.name").all(user.id);if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody<any>(event);try{return mutateBudget(user.id,undefined,body)}catch(error){throw createError({statusCode:400,statusMessage:error instanceof Error?error.message:"Invalid budget"})}});
