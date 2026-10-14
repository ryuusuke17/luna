import {defineHandler} from "nitro";
import {createError,readBody} from "nitro/h3";
import {requireUser,requireMutation} from "../../lib/request";
import {db} from "../../lib/db";
export default defineHandler(async event=>{
 const user=requireUser(event);if(event.req.method==='GET')return db.prepare('SELECT p.*,a.name account_name FROM payment_methods p JOIN accounts a ON a.id=p.account_id AND a.owner_id=p.owner_id WHERE p.owner_id=? AND p.archived_at IS NULL AND a.archived_at IS NULL ORDER BY p.display_name').all(user.id);
 if(event.req.method!=='POST')throw createError({statusCode:405,statusMessage:'Method not allowed'});requireMutation(event);const b=await readBody<any>(event);
 if(!b||!Number.isSafeInteger(b.accountId)||b.accountId<1||!['debit','credit'].includes(b.type)||typeof b.displayName!=='string'||!b.displayName.trim()||b.displayName.length>80||b.last4!==undefined&&(typeof b.last4!=='string'||!/^\d{4}$/.test(b.last4)))throw createError({statusCode:400,statusMessage:'Enter a payment method name, backing account and optional four digits'});
 const a=db.prepare('SELECT type FROM accounts WHERE owner_id=? AND id=? AND archived_at IS NULL').get(user.id,b.accountId) as {type:string}|undefined;if(!a||a.type!==(b.type==='debit'?'bank':'credit_card'))throw createError({statusCode:400,statusMessage:'Debit instruments require a bank account; credit instruments require a credit liability account'});
 return{id:Number(db.prepare('INSERT INTO payment_methods(owner_id,account_id,type,display_name,last4) VALUES(?,?,?,?,?)').run(user.id,b.accountId,b.type,b.displayName.trim(),b.last4??null).lastInsertRowid)};
});
