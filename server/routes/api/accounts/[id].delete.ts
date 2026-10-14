import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {deleteAccount} from "../../../lib/account-deletion";
export default defineHandler(async event=>{const user=requireUser(event);requireMutation(event);const body=await readBody<any>(event);const id=Number(getRouterParam(event,"id"));if(!Number.isSafeInteger(id)||id<=0)throw createError({statusCode:400,statusMessage:"Invalid record ID"});try{const result=deleteAccount(user.id,id,body);return result;}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid request"});}});