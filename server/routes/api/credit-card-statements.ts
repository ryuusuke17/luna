import {defineHandler} from "nitro";
import {createError,getQuery} from "nitro/h3";
import {requireUser,requireMutation,readLimitedJson} from "../../lib/request";
import {listCreditCardStatements,importCreditCardStatement} from "../../lib/credit-card-statements";
export default defineHandler(async event=>{
 const user=requireUser(event);
 try{
  if(event.req.method==="GET")return listCreditCardStatements(user.id,getQuery(event));
  if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});
  requireMutation(event);return importCreditCardStatement(user.id,await readLimitedJson(event,2_670_000));
 }catch(error){if((error as {statusCode?:number}).statusCode)throw error;throw createError({statusCode:400,statusMessage:error instanceof Error&&!("code" in error)?error.message:"Statement request failed"});}
});
