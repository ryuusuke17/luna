import { atomic, db } from "./db";
import { isCalendarDate, MAX_MINOR } from "../../src/lib/finance";

export type LedgerInput = { kind: "income" | "expense" | "refund" | "transfer" | "opening" | "adjustment"; date: string; amount: number; accountId: number; counterAccountId?: number; categoryId?: number; description?: string; idempotencyKey: string };
export function createTransaction(input: LedgerInput) {
  if (!isCalendarDate(input.date) || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_MINOR || !input.idempotencyKey) throw new Error("Invalid transaction");
  if (input.kind === "transfer" && (!input.counterAccountId || input.counterAccountId === input.accountId)) throw new Error("Transfer needs two different accounts");
  return atomic(() => {
    const existing = db.prepare("SELECT id FROM transactions WHERE idempotency_key=?").get(input.idempotencyKey) as {id:number}|undefined;
    if (existing) return { id: existing.id };
    const row = db.prepare("INSERT INTO transactions(kind,posted_date,amount,account_id,counter_account_id,category_id,description,idempotency_key) VALUES(?,?,?,?,?,?,?,?)").run(input.kind,input.date,input.amount,input.accountId,input.counterAccountId ?? null,input.categoryId ?? null,input.description?.slice(0,240) ?? "",input.idempotencyKey);
    const id = Number(row.lastInsertRowid);
    const balanceSign = (accountId: number) => {
      const account = db.prepare("SELECT type FROM accounts WHERE id=?").get(accountId) as {type:string}|undefined;
      if (!account) throw new Error("Account not found");
      return ["credit_card","loan","liability"].includes(account.type) ? -1 : 1;
    };
    const sign = balanceSign(input.accountId);
    const entries = db.prepare("INSERT INTO account_entries(transaction_id,account_id,delta) VALUES(?,?,?)");
    if (input.kind === "opening") entries.run(id,input.accountId,input.amount * sign);
    else if (input.kind === "adjustment") entries.run(id,input.accountId,input.amount);
    else if (input.kind === "income" || input.kind === "refund") entries.run(id,input.accountId,input.amount);
    else if (input.kind === "expense") entries.run(id,input.accountId,-input.amount);
    else {
      entries.run(id,input.accountId,-input.amount);
      entries.run(id,input.counterAccountId!,input.amount);
    }
    db.prepare("INSERT INTO audit_events(action,entity_id) VALUES(?,?)").run("transaction.create",id);
    return { id };
  });
}

export function voidTransaction(id: number) {
  return atomic(() => {
    const result = db.prepare("UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE id=? AND voided_at IS NULL").run(id);
    if (!result.changes) throw new Error("Transaction not found");
    db.prepare("INSERT INTO audit_events(action,entity_id) VALUES('transaction.void',?)").run(id);
    return { ok: true };
  });
}

export function balanceFor(accountId: number, through?: string) {
  return (db.prepare(`SELECT COALESCE(SUM(e.delta),0) AS balance FROM account_entries e JOIN transactions t ON t.id=e.transaction_id WHERE e.account_id=? AND t.voided_at IS NULL AND (? IS NULL OR t.posted_date<=?)`).get(accountId,through ?? null,through ?? null) as {balance:number}).balance;
}
