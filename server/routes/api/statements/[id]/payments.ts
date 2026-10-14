import {defineHandler} from "nitro";
import {createError,getRouterParam,readBody} from "nitro/h3";
import {requireUser,requireMutation} from "../../../../lib/request";
import {statementPayments,allocatePayment,reverseAllocation} from "../../../../lib/payments";
export default defineHandler(async event=>{
 const user=requireUser(event),id=Number(getRouterParam(event,"id"));if(!Number.isSafeInteger(id)||id<1)throw createError({statusCode:400,statusMessage:"Invalid statement ID"});
 try{if(event.req.method==="GET")return statementPayments(user.id,id);if(event.req.method!=="POST")throw Error("Method not allowed");requireMutation(event);const body=await readBody<any>(event);if(body?.action==="reverse")return reverseAllocation(user.id,id,body.allocationId,body.reason);return allocatePayment(user.id,id,body);}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error&&!("code" in e)?e.message:"Payment allocation unavailable"});}
});
