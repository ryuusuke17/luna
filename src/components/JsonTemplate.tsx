import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

const template = {
  schema_version: 1,
  statement_id: "my-card-2026-06",
  account_key: "my-credit-card",
  currency: "PHP",
  issuer: "My Bank",
  period: { start: "2026-06-01", end: "2026-06-30" },
  opening_balance: "5000.00",
  closing_balance: "3765.00",
  due_date: "2026-07-20",
  transactions: [
    {
      source_id: "my-card-tx-001",
      posted_date: "2026-06-03",
      transaction_date: "2026-06-02",
      type: "purchase",
      merchant: "Grocery Store",
      description: "Groceries",
      amount: "1250.00",
      category_hint: "Groceries",
    },
    {
      source_id: "my-card-tx-002",
      posted_date: "2026-06-10",
      type: "refund",
      merchant: "Grocery Store",
      description: "Returned item",
      amount: "500.00",
      related_source_id: "my-card-tx-001",
    },
    {
      source_id: "my-card-tx-003",
      posted_date: "2026-06-15",
      type: "payment",
      description: "Card repayment",
      amount: "2000.00",
      counter_account_key: "my-bank-account",
    },
    {
      source_id: "my-card-tx-004",
      posted_date: "2026-06-20",
      type: "fee",
      description: "Card fee",
      amount: "15.00",
    },
  ],
};

const json = `${JSON.stringify(template, null, 2)}\n`;

export default function JsonTemplate() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError(true);
      setCopied(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "luna-credit-card-statement-template.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="my-5 overflow-hidden rounded-3xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-bold">JSON format sample</h2>
          <p className="mt-1 text-sm text-muted-foreground">Copy or download, then replace the example values with your statement data.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copyTemplate} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-muted" aria-live="polite">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download size={16} /> Download
          </button>
        </div>
      </div>
      <pre className="max-h-96 overflow-auto bg-muted/40 p-5 text-xs leading-relaxed text-foreground"><code>{json}</code></pre>
      <p className="px-5 pb-4 text-xs text-muted-foreground">Amounts use decimal strings. Supported transaction types: purchase, refund, payment, fee, interest.</p>
      {copyError && <p role="alert" className="px-5 pb-4 text-sm text-destructive">Clipboard access unavailable. Use Download instead.</p>}
    </section>
  );
}
