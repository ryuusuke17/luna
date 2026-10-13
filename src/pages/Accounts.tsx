import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, send } from "@/lib/api";
import { formatMoney } from "@/lib/finance";
import { cardNetworks, cardProducts, ewalletProviders, type CardType } from "@/lib/card-directory";

type Account = { id: number; name: string; type: string; balance: number; opening_date: string; issuer?: string; product?: string; network?: string };
type AccountType = "cash" | "bank" | "wallet" | "credit_card" | "loan" | "asset" | "liability";
const options: { value: AccountType; label: string; cardType?: CardType }[] = [
  { value: "credit_card", label: "Credit card", cardType: "credit" },
  { value: "bank", label: "Debit card / bank", cardType: "debit" },
  { value: "wallet", label: "E-wallet", cardType: "ewallet" },
  { value: "cash", label: "Cash" }, { value: "loan", label: "Loan" }, { value: "asset", label: "Other asset" }, { value: "liability", label: "Other liability" },
];
const labels: Record<string, string> = { credit_card: "Credit card", bank: "Debit card / bank", wallet: "E-wallet", cash: "Cash", loan: "Loan", asset: "Other asset", liability: "Other liability" };

export default function Accounts() {
  const [items, setItems] = useState<Account[]>([]), [error, setError] = useState(""), [show, setShow] = useState(false);
  const [type, setType] = useState<AccountType>("credit_card"), [issuer, setIssuer] = useState(""), [product, setProduct] = useState(""), [network, setNetwork] = useState(""), [customIssuer, setCustomIssuer] = useState("");
  const option = options.find(item => item.value === type);
  const directoryProducts = option?.cardType ? cardProducts[option.cardType] : [];
  const issuers = useMemo(() => type === "wallet" ? ewalletProviders : [...new Set(directoryProducts.map(item => item.issuer))], [directoryProducts, type]);
  const products = directoryProducts.filter(item => item.issuer === issuer);

  async function load() { try { setItems(await api<Account[]>("accounts")); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load accounts"); } }
  useEffect(() => { load(); }, []);

  function changeType(value: AccountType) { setType(value); setIssuer(""); setProduct(""); setNetwork(""); setCustomIssuer(""); }
  function changeIssuer(value: string) { setIssuer(value); setProduct(""); setNetwork(""); }
  function changeProduct(value: string) {
    setProduct(value);
    const selected = products.find(item => item.product === value);
    if (selected && selected.network !== "Varies / not specified") setNetwork(selected.network);
    else setNetwork("");
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const provider = issuer === "Other" ? customIssuer.trim() : issuer;
    try {
      await send("accounts", { name: form.get("name"), type, openingDate: form.get("date"), openingBalance: form.get("balance") || "0", liquid: form.get("liquid") === "on", issuer: provider || undefined, product: product || undefined, network: network || undefined });
      setShow(false); changeType("credit_card"); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save account"); }
  }

  return <AppLayout><header className="mb-8 flex justify-between"><div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Your accounts</p><h1 className="mt-2 text-3xl font-bold">Accounts</h1></div><button onClick={() => setShow(!show)} className="rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">{show ? "Close" : "＋ Add account"}</button></header>
    {show && <form onSubmit={add} className="mb-6 grid gap-3 rounded-3xl border bg-card p-5 sm:grid-cols-2">
      <label className="text-sm font-semibold">Account name<input name="name" required maxLength={80} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label>
      <label className="text-sm font-semibold">Account / card type<select value={type} onChange={e => changeType(e.target.value as AccountType)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3">{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {option?.cardType && <>
        <label className="text-sm font-semibold">Issuer / e-wallet provider<select value={issuer} onChange={e => changeIssuer(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select provider</option>{issuers.map(item => <option key={item} value={item}>{item}</option>)}<option value="Other">Other provider</option></select></label>
        {issuer === "Other" && <label className="text-sm font-semibold">Provider name<input value={customIssuer} onChange={e => setCustomIssuer(e.target.value)} required maxLength={80} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" placeholder="Enter provider" /></label>}
        {issuer && issuer !== "Other" && <label className="text-sm font-semibold">Card / product<select value={product} onChange={e => changeProduct(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select product (optional)</option>{products.map((item, index) => <option key={`${item.product}-${index}`} value={item.product}>{item.product}{item.status && !item.status.startsWith("Official catalog") ? ` · ${item.status}` : ""}</option>)}</select></label>}
        <label className="text-sm font-semibold">Card network<select value={network} onChange={e => setNetwork(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select network</option>{cardNetworks.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </>}
      <label className="text-sm font-semibold">Opening date<input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label>
      <label className="text-sm font-semibold">Opening balance · PHP<input name="balance" inputMode="decimal" placeholder="0.00" className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label>
      {type === "credit_card" && <><label className="text-sm font-semibold">Last 4 digits (optional)<input name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-semibold">Credit limit · PHP (optional)<input name="creditLimit" inputMode="decimal" placeholder="0.00" className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label></>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="liquid" />Liquid cash/bank/wallet for cash-flow reports</label><button className="rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">Save account</button>
    </form>}
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(account => <article key={account.id} className="rounded-3xl border bg-card p-6"><div className="flex justify-between gap-3 text-sm text-muted-foreground"><span>{labels[account.type] || account.type}</span><span>since {account.opening_date}</span></div><h2 className="mt-4 text-lg font-bold">{account.name}</h2>{(account.issuer || account.product || account.network) && <p className="mt-1 text-sm text-muted-foreground">{[account.issuer, account.product, account.network].filter(Boolean).join(" · ")}</p>}<p className="mt-2 text-2xl font-bold tabular-nums">{formatMoney(account.balance)}</p><p className="mt-1 text-xs text-muted-foreground">{account.balance < 0 ? "Credit owed" : "Recorded balance"}</p></article>)}</div>
    {!items.length && !error && <div className="rounded-3xl border border-dashed p-12 text-center text-muted-foreground">Add an account to begin tracking your recorded balances.</div>}
  </AppLayout>;
}
