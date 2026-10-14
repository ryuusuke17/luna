import {defineHandler} from "nitro";
import {createError,readBody} from "nitro/h3";
import {requireUser,requireMutation} from "../../lib/request";
import {sampleResetPreview,resetSampleWorkspace} from "../../lib/sample-workspace";
export default defineHandler(async event=>{
 const user=requireUser(event);if(event.req.method==='GET')return sampleResetPreview(user.id);if(event.req.method!=='POST')throw createError({statusCode:405,statusMessage:'Method not allowed'});requireMutation(event);
 const body=await readBody<any>(event);if(JSON.stringify(body??{}).length>2000)throw createError({statusCode:413,statusMessage:'Payload too large'});
 try{return resetSampleWorkspace(user.id,body);}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error&&!("code" in e)?e.message:'Reset failed. Original database history retained; inspect private storage.'});}
});
