import {defineHandler} from "nitro";
import {createError,getRouterParam,readBody} from "nitro/h3";
import {requireMutation,requireUser} from "../../../lib/request";
import {editGoalContribution} from "../../../lib/planning";

export default defineHandler(async event=>{
 const user=requireUser(event);requireMutation(event);
 const record=Number(getRouterParam(event,"id")),body=await readBody(event);
 if(!Number.isSafeInteger(record)||record<=0||!body||typeof body!=="object"||Array.isArray(body))throw createError({statusCode:400,statusMessage:"Invalid contribution request"});
 const payload=body as Record<string,unknown>;
 if(typeof payload.expected!=="string"||payload.expected.length>128)throw createError({statusCode:400,statusMessage:"Invalid contribution request"});
 try{return editGoalContribution(user.id,record,payload.goalId,payload.expected,payload)}
 catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid request"})}
});
