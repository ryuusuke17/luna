import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {mutateBudget} from "../../../lib/budgets";
export default defineHandler(async event=>{const user=requireUser(event);requireMutation(event);const id=Number(getRouterParam(event,"id")),body=await readBody(event);if(!Number.isSafeInteger(id)||id<=0)throw createError({statusCode:400,statusMessage:"Invalid record ID"});try{return mutateBudget(user.id,id,body,false)}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid budget"})}});