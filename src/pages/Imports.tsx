import { useEffect, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import JsonTemplate from "@/components/JsonTemplate";
import { api, send } from "@/lib/api";
import { formatMoney } from "@/lib/finance";

type Account = { id: number; name: string; type: string };
type Category = { id: number; name: string; kind: string };
type Row = { source_id?: string; posted_date: string; type: string; merchant?: string; description?: string; amount: string; category_hint?: string; counter_account_key?: string };
type Statement = { schema_version: number; statement_id: string; account_key: string; currency: string; period: { start: string; end: string }; opening_balance: string; closing_balance: string; transactions: Row[] };

function validPreview(value: unknown): value is Statement {
  if (!value || typeof value !== "object") return false;
  const s = value as Statement;
  return s.schema_version === 1 && typeof s.statement_id === "string" && typeof s.account_key === "string" && s.currency === "PHP" && !!s.period && typeof s.period.start === "string" && typeof s.period.end === "string" && typeof s.opening_balance === "string" && typeof s.closing_balance === "string" && Array.isArray(s.transactions) && s.transactions.length <= 5000 && s.transactions.every(r => !!r && typeof r === "object" && typeof r.posted_date === "string" && typeof r.type === "string" && typeof r.amount === "string" && (r.description === undefined || typeof r.description === "string") && (r.merchant === undefined || typeof r.merchant === "string") && (r.category_hint === undefined || typeof r.category_hint === "string") && (r.source_id === undefined || typeof r.source_id === "string") && (r.counter_account_key === undefined || typeof r.counter_account_key === "string"));
}

export default function Imports() {
  const [accounts, setAccounts] = useState<Account[]>([]), [categories, setCategories] = useState<Category[]>([]), [card, setCard] = useState(""), [statement, setStatement] = useState<Statement | null>(null), [categoryMap, setCategoryMap] = useState<Record<string, string>>({}), [paymentMap, setPaymentMap] = useState<Record<string, string>>({}), [error, setError] = useState(""), [result, setResult] = useState<any>(null), [busy, setBusy] = useState(false), fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api<Account[]>("accounts"), api<Category[]>("categories")]).then(([a, c]) => { setAccounts(a); setCategories(c); }).catch(e => setError(e.message));
  }, []);

  async function choose(file?: File) {
    setError(""); setResult(null); setStatement(null);
    if (!file) return;
    if (file.size > 2_000_000) { setError("JSON file exceeds 2 MB"); return; }
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!validPreview(value)) throw Error("Invalid statement JSON v1");
      const s = value;
      setStatement(s);
      setCategoryMap(Object.fromEntries(s.transactions.map((r, i) => [String(i), String(categories.find(c => c.kind === "expense" && c.name.toLowerCase() === r.category_hint?.toLowerCase())?.id ?? "")])));
      setPaymentMap({});
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid JSON file"); }
  }

  async function commit() {
    if (!statement || !card) return;
    setBusy(true); setError("");
    try {
      setResult(await send("imports", { accountId: Number(card), statement, categoryMap: Object.fromEntries(Object.entries(categoryMap).map(([k, v]) => [k, Number(v)])), paymentMap: Object.fromEntries(Object.entries(paymentMap).map(([k, v]) => [k, Number(v)])) }));
      setStatement(null); setCategoryMap({}); setPaymentMap({});
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }

  return <AppLayout>
    <header className="mb-8"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Statement review</p><h1 className="mt-2 text-3xl font-bold">JSON import</h1><p className="mt-2 text-muted-foreground">Review rows before saving. Files stay in memory and are not stored.</p></header>
    <section className="grid gap-4 rounded-3xl border bg-card p-5 sm:grid-cols-2">
      <label className="text-sm font-semibold">Credit card<select value={card} onChange={e => setCard(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select account</option>{accounts.filter(a => a.type === "credit_card").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Statement JSON<input ref={fileInput} type="file" accept="application/json,.json" onChange={e => choose(e.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>
    </section>
    <JsonTemplate />
    {statement && <section className="my-5 rounded-3xl border bg-card p-5">
      <h2 className="font-bold">{statement.statement_id} · {statement.account_key}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{statement.period.start} — {statement.period.end} · {statement.transactions.length} rows · closing debt {statement.closing_balance} PHP</p>
      <div className="mt-4 divide-y">{statement.transactions.map((r, i) => <article key={`${r.source_id ?? i}-${i}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]">
        <div><p className="font-semibold">{r.description || r.merchant || r.type}</p><p className="text-sm text-muted-foreground">{r.posted_date} · {r.type} · PHP {r.amount}{r.source_id ? ` · ${r.source_id}` : ""}</p></div>
        {["purchase", "refund", "fee", "interest"].includes(r.type) ? <label className="text-sm">Category<select value={categoryMap[String(i)] ?? ""} onChange={e => setCategoryMap(m => ({ ...m, [String(i)]: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3"><option value="">Choose category</option>{categories.filter(c => c.kind === "expense").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : r.type === "payment" ? <label className="text-sm">Paid from<select value={paymentMap[String(i)] ?? ""} onChange={e => setPaymentMap(m => ({ ...m, [String(i)]: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3"><option value="">Choose funding account</option>{accounts.filter(a => a.id !== Number(card) && a.type !== "credit_card").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : null}
      </article>)}</div>
      <div className="flex gap-3"><button disabled={!card || busy || Boolean(result)} onClick={commit} className="mt-4 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Importing…" : result ? "Imported" : "Confirm and import"}</button><button disabled={busy} onClick={() => { setStatement(null); setCategoryMap({}); setPaymentMap({}); if (fileInput.current) fileInput.current.value = ""; }} className="mt-4 rounded-xl border px-5 py-3">Cancel</button></div>
    </section>}
    {error && <p role="alert" className="my-4 rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
    {result && <section role="status" className="rounded-3xl border bg-card p-5"><h2 className="font-bold">{result.duplicate ? "Statement already imported" : "Import complete"}</h2>{!result.duplicate && <p className="mt-2 text-sm">Reconciliation difference: {formatMoney(result.difference)} · expected {formatMoney(result.expectedClosing)} debt, recorded {formatMoney(result.actualClosing)} debt</p>}<p className="mt-1 text-xs text-muted-foreground">Differences never create automatic adjustments.</p></section>}
  </AppLayout>;
}
