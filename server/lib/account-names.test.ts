import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createJiti } from "jiti";
import type { EventHandler } from "nitro/h3";
import { accountLabels, defaultAccountName, editableAccountRecord } from "../../src/lib/accounts.ts";

process.env.LUNA_DB_PATH = ":memory:";
process.env.LUNA_SETUP_TOKEN = randomUUID();
type RouteModule = { default: EventHandler };
const load = createJiti(import.meta.url), { H3 } = await load.import<typeof import("nitro/h3")>("nitro/h3"), app = new H3();
app.all("/api/auth/:action", (await load.import<RouteModule>("../routes/api/auth/[action].ts")).default);
app.all("/api/accounts", (await load.import<RouteModule>("../routes/api/accounts.ts")).default);
const getAccount = (await load.import<RouteModule>("../routes/api/accounts/[id].get.ts")).default;
const patchAccount = (await load.import<RouteModule>("../routes/api/accounts/[id].patch.ts")).default;
app.all("/api/accounts/:id", event => event.req.method === "PATCH" ? patchAccount(event) : getAccount(event));
const { db } = await load.import<typeof import("./db.ts")>("./db.ts");
after(() => db.close());
let cookie = "", csrf = "";
async function request(path: string, data?: unknown, method = data === undefined ? "GET" : "POST") {
  return app.fetch(new Request(`http://isolated.test/api/${path}`, {
    method, headers: { origin: "http://isolated.test", host: "isolated.test", "content-type": "application/json", cookie, "x-luna-csrf": csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
  })) as Promise<Response>;
}
async function json(path: string, data?: unknown, method?: string) {
  const response = await request(path, data, method), text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text);
}
before(async () => {
  const credentials = { username: "optional-name", password: "fixture-password-only-2026" };
  await json("auth/setup", { ...credentials, setupToken: process.env.LUNA_SETUP_TOKEN });
  const login = await request("auth/login", credentials);
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie().map(value => value.split(";")[0]);
  cookie = cookies.join("; "); csrf = cookies.find(value => value.startsWith("luna_csrf="))!.slice(10);
});

test("default account names use provider/product once, type fallback, and the name length limit", () => {
  assert.equal(defaultAccountName("bank", "BDO", "BDO Mastercard Debit"), "BDO Mastercard Debit");
  assert.equal(defaultAccountName("bank", " BDO ", " Visa Debit "), "BDO Visa Debit");
  assert.equal(defaultAccountName("credit_card", "BDO", "ShopMore Mastercard"), "BDO ShopMore Mastercard");
  assert.equal(defaultAccountName("wallet", "GCash", "unused"), "GCash");
  for (const type of Object.keys(accountLabels) as (keyof typeof accountLabels)[]) assert.equal(defaultAccountName(type), accountLabels[type]);
  assert.equal(defaultAccountName("bank", "Bank", "x".repeat(160)).length, 80);
});

test("real authenticated create/edit accepts blank, whitespace and omitted account names without changing balances", async () => {
  for (const name of ["", "   ", undefined]) {
    const created = await json("accounts", { name, type: "bank", issuer: "BDO", product: "BDO Mastercard Debit", network: "Mastercard", last4: "1502", openingDate: "2025-01-01", openingBalance: "25", liquid: false });
    let account = (await json(`accounts/${created.id}`)).account;
    assert.equal(account.name, "BDO Mastercard Debit"); assert.equal(account.balance, 2500);
    const original = JSON.stringify(db.prepare("SELECT * FROM transactions").all());
    const body = { name, issuer: account.issuer, product: account.product, network: account.network, last4: account.last4, liquid: true, expected: JSON.stringify(editableAccountRecord(account)) };
    await json(`accounts/${created.id}`, body, "PATCH");
    account = (await json(`accounts/${created.id}`)).account;
    assert.equal(account.name, "BDO Mastercard Debit"); assert.equal(account.liquid, 1); assert.equal(account.last4, "1502"); assert.equal(account.balance, 2500);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM transactions").all()), original);
    assert.equal((await request(`accounts/${created.id}`, body, "PATCH")).status, 409);
  }
  const cash = await json("accounts", { name: " ", type: "cash", openingDate: "2025-01-01" });
  assert.equal((await json(`accounts/${cash.id}`)).account.name, "Cash");
});

test("custom names still save and invalid names remain rejected", async () => {
  const input = { name: " Daily bank ", type: "bank", openingDate: "2025-01-01", liquid: false };
  const created = await json("accounts", input), account = (await json(`accounts/${created.id}`)).account;
  assert.equal(account.name, "Daily bank");
  for (const name of [123, {}, "x".repeat(81)]) {
    assert.equal((await request("accounts", { ...input, name })).status, 400);
    assert.equal((await request(`accounts/${created.id}`, { name, liquid: false, expected: JSON.stringify(editableAccountRecord(account)) }, "PATCH")).status, 400);
  }
});
