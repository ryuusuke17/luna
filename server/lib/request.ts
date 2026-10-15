import { createError,getCookie,getRequestHeader } from "nitro/h3";
import { session,validateCsrf } from "./auth.ts";
export async function readLimitedJson(event:{req:Request},limit:number){
 if(Number(event.req.headers.get("content-length"))>limit)throw createError({statusCode:413,statusMessage:"Upload exceeds the supported size"});
 const reader=event.req.body?.getReader();if(!reader)throw createError({statusCode:400,statusMessage:"Request body required"});
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit){await reader.cancel();throw createError({statusCode:413,statusMessage:"Upload exceeds the supported size"});}chunks.push(chunk.value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}catch{throw createError({statusCode:400,statusMessage:"Invalid JSON request"});}
}
export function requireUser(event:any){const token=getCookie(event,"luna_session"),user=session(token);if(!user)throw createError({statusCode:401,statusMessage:"Sign in required"});return user}
export function requireMutation(event:any){const token=getCookie(event,"luna_session"),csrf=getCookie(event,"luna_csrf"),header=getRequestHeader(event,"x-luna-csrf");if(process.env.NODE_ENV==="production"){const origin=getRequestHeader(event,"origin"),host=getRequestHeader(event,"host");if(!origin||!host||new URL(origin).host!==host)throw createError({statusCode:403,statusMessage:"Invalid request origin"})}if(!validateCsrf(token,csrf,header))throw createError({statusCode:403,statusMessage:"Invalid CSRF token"})}
