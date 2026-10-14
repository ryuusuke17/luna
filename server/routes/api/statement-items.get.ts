import {defineHandler} from "nitro";
import {createError,getQuery} from "nitro/h3";
import {requireUser} from "../../lib/request";
import {statementItems} from "../../lib/statement-items";
export default defineHandler(event=>{const user=requireUser(event);try{return statementItems(user.id,getQuery(event));}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid filters"});}});
