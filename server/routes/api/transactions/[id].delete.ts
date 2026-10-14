import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {voidTransaction} from "../../../lib/ledger";
export default defineHandler(async event=>{const user=requireUser(event);requireMutation(event);const id=Number(getRouterParam(event,"id")),body=await readBody<any>(event);if(!Number.isSafeInteger(id)||id<=0||!body||JSON.stringify(body).length>20000)throw createError({statusCode:400,statusMessage:"Invalid record ID"});if(typeof body.version!=="string")throw createError({statusCode:409,statusMessage:"This transaction changed. Reload and review before deleting."});try{return voidTransaction(user.id,id,body.version)}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid request"});}});
