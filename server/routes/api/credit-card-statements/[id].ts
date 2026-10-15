import {defineHandler} from "nitro";
import {createError,getQuery,getRouterParam} from "nitro/h3";
import {requireUser,requireMutation,readLimitedJson} from "../../../lib/request";
import {creditCardStatementDetail,mutateCreditCardStatement} from "../../../lib/credit-card-statements";
export default defineHandler(async event=>{
 const user=requireUser(event),id=Number(getRouterParam(event,"id"));
 try{
  if(!Number.isSafeInteger(id)||id<=0)throw Error("Statement unavailable");
  if(event.req.method==="GET")return creditCardStatementDetail(user.id,id,getQuery(event));
  if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});
  requireMutation(event);return mutateCreditCardStatement(user.id,id,await readLimitedJson(event,20000));
 }catch(error){if((error as {statusCode?:number}).statusCode)throw error;throw createError({statusCode:400,statusMessage:error instanceof Error&&!("code" in error)?error.message:"Statement update failed"});}
});
