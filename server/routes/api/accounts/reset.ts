import {defineHandler} from "nitro";
import {createError,readBody} from "nitro/h3";
import {requireUser,requireMutation} from "../../../lib/request";
import {accountResetPreview,resetAccounts} from "../../../lib/account-reset";

export default defineHandler(async event=>{
 const user=requireUser(event);
 if(event.req.method==="GET")return accountResetPreview(user.id);
 if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});
 requireMutation(event);
 const body=await readBody<unknown>(event);
 try{return resetAccounts(user.id,body);}catch(error){throw createError({statusCode:400,statusMessage:error instanceof Error&&!("code" in error)&&error.name!=="ZodError"?error.message:"Reset failed. No account records were removed. Reload and try again."});}
});
