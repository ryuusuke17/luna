import {defineHandler} from "nitro";
import {createError,getRouterParam} from "nitro/h3";
import {requireUser} from "../../../lib/request";
import {downloadResetBackup} from "../../../lib/sample-workspace";
export default defineHandler(event=>{const user=requireUser(event);try{return new Response(downloadResetBackup(user.id,getRouterParam(event,'key')??''),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="workspace-before-reset.json"','cache-control':'no-store'}});}catch{throw createError({statusCode:404,statusMessage:'Backup unavailable'});}});
