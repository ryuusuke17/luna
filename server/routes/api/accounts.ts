import { defineHandler } from "nitro";
import { readBody,getCookie,createError } from "nitro/h3";
import { session } from "../../lib/auth";
import { db } from "../../lib/db";
import { balanceFor } from "../../lib/ledger";
import { isCalendarDate,parseMoney } from "../../../src/lib/finance";

export default defineHandler(async event => {
  if (!session(getCookie(event,"luna_session"))) throw createError({statusCode:401,statusMessage:"Sign in required"});
  if (event.req.method === "GET") return (db.prepare("SELECT * FROM accounts ORDER BY archived_at,name").all() as {id:number;name:string;type:string;opening_date:string;archived_at:string|null}[]).map(a=>({...a,balance:balanceFor(a.id)}));
  if (event.req.method !== "POST") throw createError({statusCode:405,statusMessage:"Method not allowed"});
  const body=await readBody<any>(event);
  if (typeof body?.name!=="string"||!body.name.trim()||body.name.length>80||!isCalendarDate(body.openingDate)||!['cash','bank','wallet','credit_card','loan','asset','liability'].includes(body.type)) throw createError({statusCode:400,statusMessage:"Invalid account"});
  const result=db.prepare("INSERT INTO accounts(name,type,liquid,opening_date,last4,credit_limit) VALUES(?,?,?,?,?,?)").run(body.name.trim(),body.type,body.liquid?1:0,body.openingDate,body.last4||null,body.creditLimit?parseMoney(String(body.creditLimit)):null);
  if(body.openingBalance && String(body.openingBalance)!=="0") {
    const amount=parseMoney(String(body.openingBalance));
    const accountId=Number(result.lastInsertRowid);
    const txn=db.prepare("INSERT INTO transactions(kind,posted_date,amount,account_id,description,idempotency_key) VALUES('opening',?,?,?,'Opening balance',?)").run(body.openingDate,amount,accountId,`opening-${accountId}`);
    const liability=['credit_card','loan','liability'].includes(body.type);
    db.prepare("INSERT INTO account_entries(transaction_id,account_id,delta) VALUES(?,?,?)").run(Number(txn.lastInsertRowid),accountId,liability?-amount:amount);
  }
  return {id:Number(result.lastInsertRowid)};
});
