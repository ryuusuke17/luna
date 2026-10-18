import {defineHandler} from "nitro";
import {createError} from "nitro/h3";
import {z} from "zod";
import {requireUser,requireMutation} from "../../lib/request";
import {db} from "../../lib/db";
import {listStatements,importTransactions,previewTransactionImport} from "../../lib/statements";
const upload=z.object({accountId:z.number().int().positive(),fundingAccountId:z.number().int().positive().optional(),filename:z.string().min(1).max(180),mime:z.string().max(100),base64:z.string().max(2_666_668),preview:z.boolean().optional(),confirmation:z.string().max(64).optional()}).strict();
export default defineHandler(async event=>{
 const user=requireUser(event);if(event.req.method==="GET")return listStatements(user.id);
 if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});requireMutation(event);
 if(Number(event.req.headers.get("content-length"))>2_670_000)throw createError({statusCode:413,statusMessage:"Statement exceeds 2 MB limit"});
 try{const reader=event.req.body?.getReader();if(!reader)throw Error("Empty upload");const chunks:Uint8Array[]=[];let size=0;try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2_670_000){await reader.cancel();throw Error("Statement exceeds 2 MB limit");}chunks.push(chunk.value);}}finally{reader.releaseLock();}const input=upload.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));if(!input.success)throw Error("Invalid CSV upload; maximum 2 MB");const {preview,confirmation,...payload}=input.data;return db.transaction(()=>{const proposed=previewTransactionImport(user.id,payload);if(preview||proposed.changes.length&&!confirmation)return proposed;if(confirmation&&confirmation!==proposed.version)throw Error("Import preview changed. Reload the formatting preview before confirming.");return importTransactions(user.id,payload);}).immediate();}catch(e){throw createError({statusCode:400,statusMessage:e instanceof Error&&!("code" in e)&&!(e instanceof SyntaxError)?e.message:"Statement upload failed. Check private storage and CSV formatting."});}
});
