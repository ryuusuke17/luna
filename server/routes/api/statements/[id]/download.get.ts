import {defineHandler} from "nitro";
import {getRouterParam,createError} from "nitro/h3";
import {requireUser} from "../../../../lib/request";
import {downloadStatement} from "../../../../lib/statements";
export default defineHandler(event=>{const user=requireUser(event),id=Number(getRouterParam(event,"id"));try{const file=downloadStatement(user.id,id);return new Response(file.bytes,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="statement-${id}.csv"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch{throw createError({statusCode:404,statusMessage:"Statement file unavailable"});}});
