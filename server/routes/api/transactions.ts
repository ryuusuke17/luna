import { defineHandler } from "nitro";
import { readBody, getCookie, createError, getQuery } from "nitro/h3";
import { session } from "../../lib/auth";
import { db } from "../../lib/db";
import { createTransaction, voidTransaction } from "../../lib/ledger";

export default defineHandler(async (event) => {
  const user = session(getCookie(event,"luna_session"));
  if (!user) throw createError({statusCode:401,statusMessage:"Sign in required"});
  if (event.req.method === "GET") return db.prepare("SELECT t.*,a.name account_name,c.name category_name FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id WHERE t.voided_at IS NULL ORDER BY t.posted_date DESC,t.id DESC LIMIT 500").all();
  if (event.req.method !== "POST") throw createError({statusCode:405,statusMessage:"Method not allowed"});
  const body = await readBody<any>(event);
  try { return createTransaction(body); } catch(error) { throw createError({statusCode:400,statusMessage:error instanceof Error?error.message:"Invalid transaction"}); }
});
