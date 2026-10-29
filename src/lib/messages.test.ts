import assert from "node:assert/strict";
import {test} from "node:test";
import {api, ApiError, downloadExport} from "./api.ts";
import {clearMessage, networkMessage, requestMessage} from "./messages.ts";

test("exact statement failures keep ownership-safe actionable selection errors", () => {
  assert.match(requestMessage(400,{message:"Statement unavailable for this account"},"credit-card-dashboard?issuedStatement=9"),/^Statement unavailable for this account\. Choose an owned/);
  assert.match(requestMessage(400,{statusMessage:"Dashboard unavailable; retry or review filters"},"credit-card-dashboard"),/Choose valid statement filters/);
  assert.equal(requestMessage(400,{message:"Choose a valid statement ID."},"credit-card-dashboard"),"Choose a valid statement ID.");
});

test("sign-in errors use H3 and legacy response fields without HTTP codes", () => {
  for (const field of ["statusMessage", "statusText", "message"]) {
    const text = requestMessage(400, {[field]: "Invalid username or password"}, "auth/login", "POST");
    assert.match(text, /username or password is incorrect/);
    assert.match(text, /try again/);
    assert.doesNotMatch(text, /400|HTTP|Request failed/);
  }
  assert.match(requestMessage(400, {statusText:"Bad Request",message:"Invalid username or password"}, "auth/login", "POST"), /incorrect/);
  assert.match(requestMessage(400, {message:"Too many attempts. Try again later"}, "auth/login", "POST"), /15 minutes/);
  assert.match(requestMessage(400, {}, "auth/login", "POST"), /could not sign you in/);
});

test("technical details are suppressed, actionable validation remains", () => {
  for (const detail of ["Request failed (400)", "[400] POST http://app.localhost/api/auth/login", "HTTPError", "SQLITE_CONSTRAINT: accounts.name", "Cannot read properties of undefined", "Unexpected token 'x', invalid JSON", "TypeError: fetch failed", "502", "Bad Gateway"]) {
    assert.equal(clearMessage(detail), undefined, detail);
    const text = requestMessage(400, {message:detail}, "accounts", "POST");
    assert.match(text, /Check the entered values/);
    assert.doesNotMatch(text, /HTTP|SQLITE|TypeError|localhost/);
  }
  assert.equal(clearMessage("Select at least one row"), "Select at least one row");
  assert.equal(clearMessage("Unknown internal failure"), undefined);
  assert.match(requestMessage(500, {message:"Invalid amount",stack:"private"}, "accounts", "POST"), /server encountered a problem/);
  assert.match(requestMessage(500, {}, "accounts", "POST"), /Check the records before retrying/);
  assert.match(requestMessage(401, {message:"private details"}, "accounts"), /Sign in again/);
  assert.match(requestMessage(403, {message:"Invalid CSRF token"}, "accounts", "POST"), /session could not be verified/);
  for (const status of [400,401,403,404,405,408,409,413,415,422,429,500,502,503,504]) {
    const text = requestMessage(status, {statusText:"HTTPError"}, "transactions", "POST");
    assert.ok(text.length > 20);
    assert.doesNotMatch(text, /HTTP|\b[45]\d\d\b/);
  }
  assert.match(networkMessage("POST"), /avoid duplicates/);
  assert.doesNotMatch(networkMessage(), /result is not confirmed/);
});

test("import messages preserve row numbers and concrete recovery", () => {
  assert.match(clearMessage("Row 12: inconsistent columns")!, /^Row 12: Use the same number of columns/);
  assert.match(clearMessage("Row 3: invalid date/type/text")!, /^Row 3: Check the ISO date/);
  assert.match(clearMessage("Row 4: invalid mapping")!, /Choose a valid category/);
  assert.match(clearMessage("CSV exceeds 2 MB")!, /Choose a smaller file/);
  assert.match(clearMessage("Invalid statement JSON v1")!, /JSON template/);
  assert.match(clearMessage("Request key already used for another allocation")!, /check their status/);
});

test("API translates actual responses, unreadable replies, network failures and export errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {configurable:true,value:{cookie:""}});
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({status:400,statusText:"Invalid username or password"}), {status:400});
    await assert.rejects(api("auth/login", {method:"POST"}), e => e instanceof ApiError && e.status === 400 && /incorrect/.test(e.message));
    globalThis.fetch = async () => {throw new TypeError("Failed to fetch");};
    await assert.rejects(api("transactions", {method:"POST"}), /Check the records before retrying to avoid duplicates/);
    globalThis.fetch = async () => new Response("<html>not the API</html>");
    await assert.rejects(api("accounts"), /could not read the server’s reply/);
    await assert.rejects(api("transactions", {method:"POST"}), /result is not confirmed/);
    await assert.rejects(downloadExport("csv"), /could not prepare the export file/);
    globalThis.fetch = async () => new Response(JSON.stringify({statusText:"Sign in required"}), {status:401});
    await assert.rejects(downloadExport("json"), /Sign in again/);
    globalThis.fetch = async () => new Response(JSON.stringify({ok:true}));
    assert.deepEqual(await api("accounts"), {ok:true});
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("statement removal errors retain safe actionable recovery",()=>{
 for(const message of ["Statement unavailable. Check private storage or retry.","Only unapproved uploads can be removed. Approved or reconciled statements must be kept.","Statement changed. Close this dialog and review it again before removing."])assert.equal(requestMessage(400,{statusMessage:message},"statements/1","POST"),message);
});

test("statement approval conflicts stay actionable without exposing internals",()=>{assert.match(clearMessage("Unknown category: Travel")!,/Choose an explicit active category/);assert.match(clearMessage("Ambiguous category: Food")!,/Ambiguous/);assert.match(clearMessage("Payment funding required")!,/cash, bank or wallet/);assert.match(clearMessage("Statement or matches changed. Reload and review before approving.")!,/Evidence refreshed/);assert.equal(clearMessage("Unknown category: SQLITE constraint failed"),undefined);});

test("standalone archive errors name the separate workflow and retain safe recovery",()=>{
 assert.match(requestMessage(500,{message:"SQLITE_ERROR"},"statement-archives/1","PATCH"),/statement archive/);
 assert.match(requestMessage(400,{message:"Invalid statement filters"},"statement-archives"),/clear them/);
 assert.match(requestMessage(400,{message:"Save the statement as a UTF-8 CSV and try again"},"statement-archives","POST"),/UTF-8 CSV/);
 assert.match(requestMessage(400,{message:"This statement changed. Reload it before changing the account link"},"statement-archives/1","PATCH"),/Reload/);
});

test("transaction import errors name the recovery without exposing technical details",()=>{
 assert.match(requestMessage(400,{message:"Invalid row correction"},"statements/1","POST"),/posting date/);
 assert.match(requestMessage(400,{message:"Matched transfer has a different destination or paying account"},"statements/1","POST"),/same destination/);
 assert.match(requestMessage(500,{message:"SQLITE_ERROR"},"statements/1","POST"),/transaction imports/);
});
