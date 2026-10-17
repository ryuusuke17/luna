import { defineHandler } from "nitro";
import { createError, getQuery, getRouterParam } from "nitro/h3";
import { requireUser } from "../../../lib/request";
import { accountDetails } from "../../../lib/account-details";

export default defineHandler(event => {
  const user = requireUser(event), raw = getRouterParam(event, "id") ?? "";
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw createError({statusCode:400,statusMessage:"Invalid account ID"});
  let detail;
  try { detail = accountDetails(user.id, Number(raw), getQuery(event)); }
  catch (error) { throw createError({statusCode:400,statusMessage:error instanceof Error ? error.message : "Invalid account filters"}); }
  if (!detail) throw createError({statusCode:404,statusMessage:"Account not found"});
  return detail;
});
