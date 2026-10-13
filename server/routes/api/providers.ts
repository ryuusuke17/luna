import {defineHandler} from "nitro";
import {createError,readBody} from "nitro/h3";
import {requireUser,requireMutation} from "../../lib/request";
import {db} from "../../lib/db";
import {saveProvider} from "../../lib/planning";
export default defineHandler(async event=>{const user=requireUser(event);if(event.req.method==="GET")return db.prepare("SELECT p.*,c.name category_name FROM service_providers p LEFT JOIN categories c ON c.id=p.category_id WHERE p.owner_id=? ORDER BY p.name").all(user.id);if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);const body=await readBody(event);if(JSON.stringify(body??{}).length>4000)throw createError({statusCode:413,statusMessage:"Payload too large"});try{return saveProvider(user.id,body)}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error?e.message:"Invalid request"})}});
