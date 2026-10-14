import {defineHandler} from "nitro";
import {getRouterParam,readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../../../lib/request";
import {accountDeletionPreview} from "../../../../lib/account-deletion";
export default defineHandler(async event=>{const user=requireUser(event);const id=Number(getRouterParam(event,"id"));if(!Number.isSafeInteger(id)||id<=0)throw createError({statusCode:400,statusMessage:"Invalid record ID"});try{const result=accountDeletionPreview(user.id,id);const {ids,billIds,statementRows,csvRows,...preview}=result;return preview;}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid request"});}});