import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { atomic, db } from "../../lib/db";
import { balanceFor, createTransaction } from "../../lib/ledger";
import { requireMutation, requireUser } from "../../lib/request";
import { isCalendarDate, parseMoney } from "../../../src/lib/finance";
import { accountHistory, selectAccountDisplay } from "../../lib/account-details";
import { defaultAccountName } from "../../../src/lib/accounts";

const optionalText = (value: unknown) => value === undefined || typeof value === "string" && value.trim().length <= 160;

export default defineHandler(async event => {
  const user = requireUser(event);
  if (event.req.method === "GET") {
    return (db.prepare("SELECT * FROM accounts WHERE owner_id=? ORDER BY archived_at,name").all(user.id) as { id: number; name: string; type: string; opening_date: string; archived_at: string | null }[])
      .map(account => ({ ...account, balance: balanceFor(user.id, account.id), display: selectAccountDisplay(account.type==="credit_card"?accountHistory(user.id, account.id).filter(s=>s.source==="issued"):[]) }));
  }
  if (event.req.method !== "POST") throw createError({ statusCode: 405, statusMessage: "Method not allowed" });
  requireMutation(event);
  const body = await readBody<any>(event);
  if (!body || body.name !== undefined && (typeof body.name !== "string" || body.name.length > 80) || !isCalendarDate(body.openingDate) || body.openingDate > new Date().toISOString().slice(0, 10) || !["cash", "bank", "wallet", "credit_card", "loan", "asset", "liability"].includes(body.type) || typeof body.liquid !== "undefined" && typeof body.liquid !== "boolean" || !optionalText(body.issuer) || !optionalText(body.product) || !optionalText(body.network)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid account" });
  }
  let balance = 0;
  try { balance = parseMoney(String(body.openingBalance ?? "0")); }
  catch (error) { throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "Invalid balance" }); }
  let creditLimit: number | null = null;
  if (body.creditLimit !== undefined && body.creditLimit !== "") {
    try { creditLimit = parseMoney(String(body.creditLimit)); }
    catch (error) { throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "Invalid credit limit" }); }
  }
  if (body.type === "credit_card" && (!creditLimit || creditLimit <= 0)) throw createError({ statusCode: 400, statusMessage: "Credit cards require a positive credit limit" });
  const last4 = typeof body.last4 === "string" && /^\d{4}$/.test(body.last4) ? body.last4 : null;
  const id = atomic(() => {
    const result = db.prepare("INSERT INTO accounts(owner_id,name,type,liquid,opening_date,last4,credit_limit,issuer,product,network) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(user.id, body.name?.trim() || defaultAccountName(body.type, body.issuer, body.product), body.type, body.liquid ? 1 : 0, body.openingDate, last4, creditLimit, body.issuer?.trim() || null, body.product?.trim() || null, body.network?.trim() || null);
    const accountId = Number(result.lastInsertRowid);
    if (balance) createTransaction(user.id, { kind: "opening", date: body.openingDate, amount: balance, accountId, idempotencyKey: `opening-${accountId}` });
    return accountId;
  });
  return { id };
});
