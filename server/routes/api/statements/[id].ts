import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {statementDetail,resolveStatement,autoImportStatement,extendStatementHistory,reprocessStatement,removeStatement} from "../../../lib/statements";
export default defineHandler(async event=>{
 const user=requireUser(event),id=Number(getRouterParam(event,"id"));if(!Number.isSafeInteger(id)||id<1)throw createError({statusCode:400,statusMessage:"Invalid statement ID"});
 try{if(event.req.method==="GET")return statementDetail(user.id,id);if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody<any>(event);if(!body||JSON.stringify(body).length>4_000_000)throw Error("Invalid statement action");
 switch(body.action){case "extend-history":return extendStatementHistory(user.id,id,body);case "commit":case "resolve":return resolveStatement(user.id,id,body);case "continue":if(typeof body.version!=="string")throw Error("Reload this import before continuing");return autoImportStatement(user.id,id,body.version);case "preview":case "reconcile":case "reopen":return new Response(JSON.stringify({message:"Statement verification has been retired. Manage records in Transactions."}),{status:410,headers:{"Content-Type":"application/json"}});case "reprocess":return reprocessStatement(user.id,id);case "remove":return removeStatement(user.id,id,body);default:throw Error("Unknown statement action");}
 }catch(e){if((e as {statusCode?:number})?.statusCode)throw e;throw createError({statusCode:400,statusMessage:e instanceof Error&&!("code" in e)&&!(e instanceof SyntaxError)?e.message:"Statement unavailable. Check private storage or retry."});}
});
