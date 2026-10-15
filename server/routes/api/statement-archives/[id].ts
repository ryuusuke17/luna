import {defineHandler} from "nitro";
import {createError,getRouterParam} from "nitro/h3";
import {requireUser,requireMutation,readLimitedJson} from "../../../lib/request";
import {linkStatementArchive,statementArchiveDetail} from "../../../lib/statement-archives";

export default defineHandler(async event=>{
 const user=requireUser(event),id=Number(getRouterParam(event,"id"));
 try{
  if(event.req.method==="GET")return statementArchiveDetail(user.id,id);
  if(event.req.method!=="PATCH")throw createError({statusCode:405,statusMessage:"Method not allowed"});
  requireMutation(event);return linkStatementArchive(user.id,id,await readLimitedJson(event,4096));
 }catch(error){if((error as {statusCode?:number})?.statusCode)throw error;throw createError({statusCode:400,statusMessage:error instanceof Error&&!("code" in error)?error.message:"Statement unavailable. Reload and try again"});}
});
