import {defineHandler} from "nitro";
import {readBody,createError} from "nitro/h3";
import {requireUser,requireMutation} from "../../lib/request";
import {previewCsv,commitCsv} from "../../lib/csv-imports";
export default defineHandler(async event=>{const user=requireUser(event);requireMutation(event);const body=await readBody<any>(event);if(!body||JSON.stringify(body).length>4_000_000||!["preview","commit"].includes(body.action))throw createError({statusCode:400,statusMessage:"Invalid CSV request"});try{return body.action==="preview"?previewCsv(user.id,body.accountId,body.csv,body.mappings??{}):commitCsv(user.id,body.accountId,body.csv,body.mappings??{})}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid CSV"})}});
