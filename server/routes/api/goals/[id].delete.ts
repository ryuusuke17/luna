import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {deleteGoal} from "../../../lib/planning";
export default defineHandler(async event=>{const user=requireUser(event);requireMutation(event);const id=Number(getRouterParam(event,"id")),body=await readBody<any>(event);if(!Number.isSafeInteger(id)||id<=0||!body||JSON.stringify(body).length>20000)throw createError({statusCode:400,statusMessage:"Invalid record ID"});try{return deleteGoal(user.id,id,body.expected)}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid request"});}});
