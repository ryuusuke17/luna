import {defineHandler} from "nitro";
import {createError,getRouterParam} from "nitro/h3";
import {requireUser,requireMutation} from "../../../../lib/request";
import {statementPayments} from "../../../../lib/payments";
export default defineHandler(event=>{const user=requireUser(event),id=Number(getRouterParam(event,"id"));if(!Number.isSafeInteger(id)||id<=0)throw createError({statusCode:400,statusMessage:"Invalid statement ID"});if(event.req.method==="GET")return statementPayments(user.id,id);requireMutation(event);return new Response(JSON.stringify({message:"Statement allocations have been retired. Record repayments as transfers."}),{status:410,headers:{"Content-Type":"application/json"}});});
