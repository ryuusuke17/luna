import PaymentMethods from "@/components/PaymentMethods";
import AccountCard, { type Account } from "@/components/AccountCard";
import {usePageAction} from "@/components/PageAction";
import {transactionType,transactionTypeLabel} from "@/lib/transactions";
import AccountDeletionDialog from "@/components/AccountDeletionDialog";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useSearchParams,Link} from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Wallet, ArrowUpRight } from "lucide-react";
import { api, send } from "@/lib/api";
import { formatMoney } from "@/lib/finance";
import { cardNetworks, cardProducts, ewalletProviders, type CardType } from "@/lib/card-directory";

type AccountType = "cash" | "bank" | "wallet" | "credit_card" | "loan" | "asset" | "liability";
const options: { value: AccountType; label: string; cardType?: CardType }[] = [
  { value: "credit_card", label: "Credit card", cardType: "credit" },
  { value: "bank", label: "Debit card / bank", cardType: "debit" },
  { value: "wallet", label: "E-wallet", cardType: "ewallet" },
  { value: "cash", label: "Cash" }, { value: "loan", label: "Loan" }, { value: "asset", label: "Other asset" }, { value: "liability", label: "Other liability" },
];

export default function Accounts() {
  const client=useQueryClient(),[params]=useSearchParams(),[selected,setSelected]=useState<Account|null>(null),[busy,setBusy]=useState(false);
  const query=useQuery({queryKey:["accounts"],queryFn:()=>api<Account[]>("accounts")});
  const items=query.data??[];
  const [deleting,setDeleting]=useState<number|null>(null),[status,setStatus]=useState("");
  const recent=useQuery({queryKey:["transactions","account",selected?.id],queryFn:()=>api<{id:number;posted_date:string;description:string;merchant?:string;is_installment?:number|null;kind:string;amount:number}[]>(`transactions?account=${selected?.id}`),enabled:Boolean(selected)});
  const  [error, setError] = useState(""), [show, setShow] = useState(false), [editing, setEditing] = useState<Account | null>(null);
  const [type, setType] = useState<AccountType>("credit_card"), [issuer, setIssuer] = useState(""), [product, setProduct] = useState(""), [network, setNetwork] = useState(""), [customIssuer, setCustomIssuer] = useState("");
  const option = options.find(item => item.value === type);
  const directoryProducts = option?.cardType ? cardProducts[option.cardType] : [];
  const issuers = useMemo(() => type === "wallet" ? ewalletProviders : [...new Set(directoryProducts.map(item => item.issuer))], [directoryProducts, type]);
  const products = directoryProducts.filter(item => item.issuer === issuer);

  const details=useRef<HTMLElement>(null),editor=useRef<HTMLFormElement>(null);
  usePageAction(show?"Close account form":"Add account",()=>{setShow(!show);setEditing(null);setError("");if(!show)changeType("credit_card");},busy);
  useEffect(()=>{if(show||editing)editor.current?.querySelector<HTMLElement>("input,select")?.focus();},[show,editing]);
  async function load(){await client.invalidateQueries();setStatus("Account changes saved. Financial views refreshed.");}
  useEffect(()=>{if(params.get("id")&&query.data)setSelected(query.data.find(a=>String(a.id)===params.get("id"))??null);},[params,query.data]);
  useEffect(()=>{if(selected){details.current?.focus({preventScroll:true});details.current?.scrollIntoView({block:"start"});}},[selected?.id]);

  function changeType(value: AccountType) { setType(value); setIssuer(""); setProduct(""); setNetwork(""); setCustomIssuer(""); }
  function changeIssuer(value: string) { setIssuer(value); setProduct(""); setNetwork(""); }
  function changeProduct(value: string) {
    setProduct(value);
    const selected = products.find(item => item.product === value);
    if (selected && selected.network !== "Varies / not specified") setNetwork(selected.network);
    else setNetwork("");
  }
  function startEdit(account: Account) {
    const cardType = options.find(item => item.value === account.type)?.cardType;
    const accountIssuers = account.type === "wallet" ? ewalletProviders : cardType ? [...new Set(cardProducts[cardType].map(item => item.issuer))] : [];
    setError(""); setShow(false); setEditing(account); setType(account.type as AccountType);
    setIssuer(accountIssuers.includes(account.issuer || "") ? account.issuer || "" : account.issuer ? "Other" : "");
    setCustomIssuer(accountIssuers.includes(account.issuer || "") ? "" : account.issuer || ""); setProduct(account.product || ""); setNetwork(account.network || "");
  }
  function closeEdit() { setEditing(null); changeType("credit_card"); }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const provider = issuer === "Other" ? customIssuer.trim() : issuer;
    if(busy)return;setBusy(true);setError("");
    try {
      await send("accounts", { name: form.get("name"), type, openingDate: form.get("date"), openingBalance: "0", last4:form.get("last4")||undefined, creditLimit: form.get("creditLimit") || undefined, liquid: form.get("liquid") === "on", issuer: provider || undefined, product: product || undefined, network: network || undefined });
      setShow(false); changeType("credit_card"); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save account"); } finally{setBusy(false);}
  }
  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editing) return;
    const form = new FormData(e.currentTarget), provider = issuer === "Other" ? customIssuer.trim() : issuer;
    if(busy)return;setBusy(true);setError("");
    try {
      await api(`accounts/${editing.id}`, { method: "PATCH", body: JSON.stringify({ expected:JSON.stringify((({balance,...record})=>record)(editing)),name: form.get("name"), issuer: provider || null, product: product || null, network: network || null, last4: form.get("last4") || null, creditLimit: form.get("creditLimit") || undefined, liquid: form.get("liquid") === "on" }) });
      closeEdit(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update account"); } finally{setBusy(false);}
  }

  const accountForm = (isEdit: boolean) => <form ref={editor} aria-busy={busy} onSubmit={isEdit ? saveEdit : add} className="panel mb-5 grid gap-3 sm:grid-cols-2">
    <fieldset disabled={busy} className="contents">
    <div className="flex items-center justify-between sm:col-span-2"><h2 className="font-bold">{isEdit ? "Edit account details" : "New account"}</h2>{isEdit && <button type="button" onClick={closeEdit} aria-label="Close edit form" className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button>}</div>
    <label className="text-sm font-semibold">Account name<input name="name" aria-invalid={Boolean(error)} aria-describedby={error?"account-error":undefined} required maxLength={80} defaultValue={isEdit ? editing?.name : ""} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label>
    <label className="text-sm font-semibold">Account / card type<select value={type} disabled={isEdit} onChange={e => changeType(e.target.value as AccountType)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 disabled:opacity-70">{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{isEdit && <span className="mt-1 block text-xs text-muted-foreground">Account type cannot be changed after transactions are recorded.</span>}</label>
    {option?.cardType && <>
      <label className="text-sm font-semibold">Issuer / e-wallet provider<select value={issuer} onChange={e => changeIssuer(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select provider</option>{issuers.map(item => <option key={item} value={item}>{item}</option>)}<option value="Other">Other provider</option></select></label>
      {issuer === "Other" && <label className="text-sm font-semibold">Provider name<input value={customIssuer} onChange={e => setCustomIssuer(e.target.value)} required maxLength={80} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" placeholder="Enter provider" /></label>}
      {issuer && issuer !== "Other" && <label className="text-sm font-semibold">Card / product<select value={product} onChange={e => changeProduct(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select product (optional)</option>{products.map((item, index) => <option key={`${item.product}-${index}`} value={item.product}>{item.product}{item.status && !item.status.startsWith("Official catalog") ? ` · ${item.status}` : ""}</option>)}</select></label>}
      <label className="text-sm font-semibold">Card network<select value={network} onChange={e => setNetwork(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"><option value="">Select network</option>{cardNetworks.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    </>}
    {!isEdit && <label className="text-sm font-semibold">Opening date<input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label>}
    {type === "credit_card" && <><label className="text-sm font-semibold">Last 4 digits (optional)<input name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={isEdit ? editing?.last4 || "" : ""} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-semibold">Credit limit · PHP<input name="creditLimit" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={isEdit && editing?.credit_limit ? editing.credit_limit / 100 : ""} className="mt-2 h-11 w-full rounded-xl border bg-background px-3" /></label></>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="liquid" defaultChecked={isEdit ? Boolean(editing?.liquid) : false} />Liquid cash/bank/wallet for cash-flow reports</label>
    <button disabled={busy} aria-busy={busy} className="action self-end">{busy?"Saving…":isEdit ? "Save changes" : "Save account"}</button>
    </fieldset>
  </form>;

  return <><header className="page-heading"><div><h1>Accounts</h1><p className="mt-3 text-sm text-muted-foreground">Your balances. Your bigger picture. Always based on recorded history.</p></div></header>
    {status&&<p role="status" className="mb-3">{status}</p>}
    {show && accountForm(false)}{editing && <div className="my-5">{accountForm(true)}</div>}
    {error && <p id="account-error" role="alert" className="my-4 text-destructive">{error}</p>}
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><article data-dark className="dark-band rounded-lg p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-white/70">Recorded assets</p><Wallet size={20} aria-hidden/></div><p className="metric">{query.isPending||query.error?"—":formatMoney(items.reduce((n,a)=>n+Math.max(0,a.balance),0))}</p><p className="mt-3 text-xs text-white/65">Positive recorded account balances</p></article><article className="panel"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Recorded debt</p><ArrowUpRight size={20} aria-hidden/></div><p className="metric">{query.isPending||query.error?"—":formatMoney(items.reduce((n,a)=>n+Math.max(0,-a.balance),0))}</p><p className="mt-3 text-xs text-muted-foreground">Negative recorded account balances</p></article></div>
    {query.isPending?<p role="status">Loading accounts…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:<div className="space-y-5">{[["Cash, bank and wallet",["cash","bank","wallet"]],["Credit cards",["credit_card"]],["Other accounts",["loan","asset","liability"]]].map(([label,types])=><section key={String(label)}><h2 className="mb-3">{String(label)}</h2>{items.some(a=>(types as string[]).includes(a.type))?<ul className="luna-account-grid">{items.filter(a=>(types as string[]).includes(a.type)).map(account=><AccountCard key={account.id} account={account} busy={busy} onView={()=>setSelected(account)} onEdit={()=>startEdit(account)} onDelete={()=>setDeleting(account.id)}/>)}</ul>:<p className="text-muted-foreground">No accounts in this group.</p>}</section>)}</div>}
    <PaymentMethods accounts={items}/>
    {params.has("id")&&!selected&&!query.isPending&&<p role="status">Record deleted or unavailable</p>}
    {deleting!==null&&<AccountDeletionDialog id={deleting} onClose={()=>{setDeleting(null);setSelected(null);document.getElementById("main")?.focus();}}/>}
    {selected&&<section ref={details} tabIndex={-1} aria-label={`${selected.name} account details`} className="panel mt-5 scroll-mt-24"><div className="flex flex-wrap justify-between gap-3"><h2>{selected.name} · details</h2><Link className="quiet inline-flex min-h-11 items-center" to={`/import-export?account=${selected.id}&upload=1`}>Import transactions</Link><Link className="quiet inline-flex min-h-11 items-center" to={`/statements?account=${selected.id}`}>View statements</Link><button className="quiet" onClick={()=>setSelected(null)}>Close account details</button></div><p className="mt-3">Opening date: {selected.opening_date} · recorded balance {formatMoney(selected.balance)}</p><p className="mt-3 text-muted-foreground">Directory edits never replace ledger balances. No live bank synchronization.</p><h3 className="mt-4">Recent account activity</h3>{recent.isPending?<p role="status">Loading activity…</p>:recent.error?<p role="alert" className="text-destructive">{recent.error.message}</p>:recent.data?.length?<ul className="mt-3 divide-y">{recent.data.slice(0,10).map(t=><li key={t.id} className="flex flex-wrap justify-between gap-3 py-3"><div><Link className="underline" to={"/transactions?id="+t.id}>{t.merchant||t.description||transactionTypeLabel(transactionType(t))}</Link><p className="text-xs text-muted-foreground">{t.posted_date} · {transactionTypeLabel(transactionType(t))}</p></div><strong>{formatMoney(t.amount)}</strong></li>)}</ul>:<p className="mt-3">No activity recorded for this account.</p>}</section>}
  </>;
}
