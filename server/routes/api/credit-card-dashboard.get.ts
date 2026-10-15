import {defineHandler} from "nitro";
import {createError,getQuery} from "nitro/h3";
import {requireUser} from "../../lib/request";
import {creditCardDashboard} from "../../lib/credit-card-dashboard";
export default defineHandler(event=>{
 const user=requireUser(event);
 try{return creditCardDashboard(user.id,getQuery(event));}
 catch(error){throw createError({statusCode:400,statusMessage:error instanceof Error&&!("code" in error)?error.message:"Dashboard unavailable; retry or review filters"});}
});
