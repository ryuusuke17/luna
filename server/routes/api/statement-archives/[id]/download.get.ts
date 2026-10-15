import {defineHandler} from "nitro";
import {createError,getRouterParam} from "nitro/h3";
import {requireUser} from "../../../../lib/request";
import {downloadStatementArchive} from "../../../../lib/statement-archives";

export default defineHandler(event=>{
 const user=requireUser(event);
 try{const file=downloadStatementArchive(user.id,Number(getRouterParam(event,"id")));return new Response(file.bytes,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="statement.csv"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
 catch{throw createError({statusCode:404,statusMessage:"Statement original unavailable. Check the private-files backup"});}
});
