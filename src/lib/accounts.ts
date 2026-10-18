export type AccountType = "cash" | "bank" | "wallet" | "credit_card" | "loan" | "asset" | "liability";
export type AccountSnapshot = {
  id: string; source: "issued" | "bank" | "archive" | "historical"; sourceId: number;
  filename: string; date: string | null; currency: string; amount: number | null;
  semantics: "debt-positive" | "asset-positive"; status: string; eligible: boolean;
  dueDate: string | null; minimumDue: number | null; download: string | null; view: string;
};
export type AccountDisplay = { count: number; date: string | null; source: "statement" | "ledger"; snapshots: AccountSnapshot[]; reason: string | null };
export type Account = {
  id: number; name: string; type: AccountType; balance: number; opening_date: string;
  issuer?: string | null; product?: string | null; network?: string | null; liquid?: number;
  last4?: string | null; credit_limit?: number | null; archived_at?: string | null;
  reconciliation_stale?: number; display?: AccountDisplay;
};
export type AccountDetail = {
  account: Account; history: { items: AccountSnapshot[]; total: number; page: number; pageSize: number };
  period: { month: string | null; start: string | null; end: string | null; opening: number; closing: number; inflows: number; outflows: number; income: number; expenses: number; transfersIn: number; transfersOut: number };
};
export function accountSummary(accounts: Account[]) {
  const currencies = new Map<string, number>();
  let cashWallet = 0, missingStatements = 0;
  for (const account of accounts) {
    if (account.type === "cash" || account.type === "wallet") cashWallet += account.balance;
    if (account.type !== "credit_card") continue;
    const snapshots = account.display?.source === "statement" ? account.display.snapshots.filter(s => s.amount !== null) : [];
    if (!snapshots.length) missingStatements++;
    for (const snapshot of snapshots) {
      const debt = snapshot.semantics === "debt-positive" ? snapshot.amount! : -snapshot.amount!;
      currencies.set(snapshot.currency, (currencies.get(snapshot.currency) ?? 0) + debt);
    }
  }
  return { cashWallet, statementBalances: [...currencies].sort(([a], [b]) => a.localeCompare(b)), missingStatements };
}
export const accountLabels: Record<AccountType, string> = { credit_card: "Credit card", bank: "Debit card / bank", wallet: "E-wallet", cash: "Cash", loan: "Loan", asset: "Other asset", liability: "Other liability" };
export const debtAccount = (type: string) => ["credit_card", "loan", "liability"].includes(type);
// Preserve database property order for the existing optimistic-concurrency comparison.
export function editableAccountRecord(account: Account) {
  return Object.fromEntries(Object.entries(account).filter(([key]) => key !== "balance" && key !== "display"));
}
export function balanceCaption(display?: AccountDisplay) {
  if (!display?.count) return "Balance · No statements";
  return `Balance · ${display.date ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${display.date}T00:00:00Z`)) : "Date unknown"}`;
}
export function utilization(account: Account) {
  const debt=-account.balance;
  return account.credit_limit ? {percent:Math.max(0,debt)/account.credit_limit*100,source:"Ledger · PHP"}:null;
}
