import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {statementDetail,commitStatement,reconcileStatement,reopenStatement,reprocessStatement} from "../../../lib/statements";
export default defineHandler(async event=>{
 const user=requireUser(event),id=Number(getRouterParam(event,"id"));if(!Number.isSafeInteger(id)||id<1)throw createError({statusCode:400,statusMessage:"Invalid statement ID"});
 try{if(event.req.method==="GET")return statementDetail(user.id,id);if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody<any>(event);if(!body||JSON.stringify(body).length>4_000_000)throw Error("Invalid statement action");
 switch(body.action){case "commit":return commitStatement(user.id,id,body);case "preview":return reconcileStatement(user.id,id,body,true);case "reconcile":return reconcileStatement(user.id,id,body);case "reopen":return reopenStatement(user.id,id,body);case "reprocess":return reprocessStatement(user.id,id);default:throw Error("Unknown statement action");}
 }catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error&&!("code" in e)&&!(e instanceof SyntaxError)?e.message:"Statement unavailable. Check private storage or retry."});}
});
