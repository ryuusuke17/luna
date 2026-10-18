import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {statementDetail,resolveStatement,autoImportStatement,extendStatementHistory,reprocessStatement,removeStatement} from "../../../lib/statements";
export default defineHandler(async event=>{
 const rawId=getRouterParam(event,"id");
 if(rawId==="force-purge-all"){
  const user=requireUser(event);requireMutation(event);
  const {db}=await import("../../../lib/db");
  const {existsSync,readdirSync,unlinkSync}=await import("node:fs");
  const {resolve}=await import("node:path");
  return db.transaction(()=>{
   db.prepare("DELETE FROM statement_decisions WHERE statement_id IN (SELECT id FROM statements WHERE owner_id=?)").run(user.id);
   if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_payment_allocations'").get()) {
    db.prepare("DELETE FROM statement_payment_allocations WHERE statement_id IN (SELECT id FROM statements WHERE owner_id=?)").run(user.id);
   }
   db.prepare("DELETE FROM statement_entries WHERE statement_id IN (SELECT id FROM statements WHERE owner_id=?)").run(user.id);
   const statements = db.prepare("SELECT file_key FROM statements WHERE owner_id=?").all(user.id) as {file_key: string}[];
   db.prepare("DELETE FROM statements WHERE owner_id=?").run(user.id);
   if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_import_rows'").get()) {
    db.prepare("DELETE FROM statement_import_rows WHERE owner_id=?").run(user.id);
   }
   if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='statement_imports'").get()) {
    db.prepare("DELETE FROM statement_imports WHERE owner_id=?").run(user.id);
   }
   const dir = resolve(process.env.LUNA_STATEMENTS_PATH || "./data/private-statements");
   if (existsSync(dir)) {
    for (const s of statements) {
     if (s.file_key && /^[a-f0-9-]{36}\.csv$/.test(s.file_key)) {
      const p = resolve(dir, s.file_key);
      if (existsSync(p)) unlinkSync(p);
     }
    }
   }
   return {ok:true};
  }).immediate();
 }
 const user=requireUser(event),id=Number(rawId);if(!Number.isSafeInteger(id)||id<1)throw createError({statusCode:400,statusMessage:"Invalid statement ID"});
 try{if(event.req.method==="GET")return statementDetail(user.id,id);if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody<any>(event);if(!body||JSON.stringify(body).length>4_000_000)throw Error("Invalid statement action");
 switch(body.action){case "extend-history":return extendStatementHistory(user.id,id,body);case "commit":case "resolve":return resolveStatement(user.id,id,body);case "continue":if(typeof body.version!=="string")throw Error("Reload this import before continuing");return autoImportStatement(user.id,id,body.version);case "preview":case "reconcile":case "reopen":return new Response(JSON.stringify({message:"Statement verification has been retired. Manage records in Transactions."}),{status:410,headers:{"Content-Type":"application/json"}});case "reprocess":return reprocessStatement(user.id,id);case "remove":return removeStatement(user.id,id,body);default:throw Error("Unknown statement action");}
 }catch(e){if((e as {statusCode?:number})?.statusCode)throw e;throw createError({statusCode:400,statusMessage:e instanceof Error&&!("code" in e)&&!(e instanceof SyntaxError)?e.message:"Statement unavailable. Check private storage or retry."});}
});
