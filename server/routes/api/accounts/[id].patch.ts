import { defineHandler } from "nitro";
import { createError, getRouterParam, readBody } from "nitro/h3";
import { db } from "../../../lib/db";
import { requireMutation, requireUser } from "../../../lib/request";
import { parseMoney } from "../../../../src/lib/finance";

export default defineHandler(async event => {
  const user = requireUser(event);
  requireMutation(event);
  const id = Number(getRouterParam(event, "id"));
  const body = await readBody<any>(event);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof body?.name !== "string" || !body.name.trim() || body.name.length > 80 || [body.issuer, body.product, body.network].some(value => value !== undefined && value !== null && (typeof value !== "string" || value.length > 160)) || body.last4 !== undefined && body.last4 !== null && (typeof body.last4 !== "string" || !/^\d{4}$/.test(body.last4)) || typeof body.liquid !== "boolean") {
    throw createError({ statusCode: 400, statusMessage: "Invalid account details" });
  }
  const account = db.prepare("SELECT type FROM accounts WHERE id=? AND owner_id=? AND archived_at IS NULL").get(id, user.id) as { type: string } | undefined;
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
  let creditLimit: number | null = null;
  if (account.type === "credit_card") {
    try { creditLimit = parseMoney(String(body.creditLimit ?? "")); }
    catch (error) { throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "Invalid credit limit" }); }
    if (creditLimit <= 0) throw createError({ statusCode: 400, statusMessage: "Credit cards require a positive credit limit" });
  }
  db.prepare("UPDATE accounts SET name=?,issuer=?,product=?,network=?,last4=?,credit_limit=?,liquid=? WHERE id=? AND owner_id=?")
    .run(body.name.trim(), body.issuer?.trim() || null, body.product?.trim() || null, body.network?.trim() || null, body.last4 || null, creditLimit, body.liquid ? 1 : 0, id, user.id);
  db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,?,?)").run(user.id, "account.update", id);
  return { ok: true };
});
