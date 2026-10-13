import { defineHandler } from "nitro";
import { getCookie, readBody, createError } from "nitro/h3";
import { session } from "../../lib/auth";
import { db } from "../../lib/db";
export default defineHandler(async event => {
  if(!session(getCookie(event,"luna_session"))) throw createError({statusCode:401,statusMessage:"Sign in required"});
  if(event.req.method==="GET") return db.prepare("SELECT * FROM categories ORDER BY kind,name").all();
  const body=await readBody<any>(event);
  if(typeof body?.name!=="string"||!body.name.trim()||body.name.length>60||!['income','expense'].includes(body.kind)) throw createError({statusCode:400,statusMessage:"Invalid category"});
  try { return {id:Number(db.prepare("INSERT INTO categories(name,kind) VALUES(?,?)").run(body.name.trim(),body.kind).lastInsertRowid)}; }
  catch { throw createError({statusCode:409,statusMessage:"Category already exists"}); }
});
