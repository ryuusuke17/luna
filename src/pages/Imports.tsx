import {Link,useNavigate} from "react-router-dom";
import BankStatements from "./BankStatements";
import SampleWorkspaceReset from "@/components/SampleWorkspaceReset";
import StatementImportDialog from "@/components/StatementImportDialog";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import CsvImport from "@/components/CsvImport";
import { useRef, useState } from "react";
import JsonTemplate from "@/components/JsonTemplate";
import { api, ApiError, send } from "@/lib/api";
import { clearMessage } from "@/lib/messages";
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
  const navigate=useNavigate(),client=useQueryClient(),[mode,setMode]=useState("json"),[allowDuplicates,setAllowDuplicates]=useState(false),[csvBusy,setCsvBusy]=useState(false);
  const history=useQuery({queryKey:["import-history"],queryFn:()=>api<{id:number;format:string;account_name:string;rows:number;created_at:string;reconciliation_stale:number}[]>("import-history")});
  const accountQuery=useQuery({queryKey:["accounts"],queryFn:()=>api<Account[]>("accounts")}),categoryQuery=useQuery({queryKey:["categories"],queryFn:()=>api<Category[]>("categories")});
  const accounts=accountQuery.data??[],categories=categoryQuery.data??[];
  const  [card, setCard] = useState(""), [statement, setStatement] = useState<Statement | null>(null), [categoryMap, setCategoryMap] = useState<Record<string, string>>({}), [paymentMap, setPaymentMap] = useState<Record<string, string>>({}), [error, setError] = useState(""), [result, setResult] = useState<any>(null), [busy, setBusy] = useState(false), fileInput = useRef<HTMLInputElement>(null);

  async function choose(file?: File) {
    if(busy)return;setAllowDuplicates(false);setError(""); setResult(null); setStatement(null);
    if (!file) return;
    if (file.size > 2_000_000) { setError("This JSON file is larger than 2 MB. Choose a smaller statement file."); return; }
    setBusy(true);
    try {
      let text: string;
      try { text = await file.text(); }
      catch { throw Error("Luna could not read this file. Choose it again or save a new copy."); }
      let value: unknown;
      try { value = JSON.parse(text); }
      catch { throw Error("The file is not valid JSON. Correct its formatting or choose a file matching the JSON template."); }
      if (!validPreview(value)) throw Error("Invalid statement JSON v1");
      const s = value;
      await send("imports",{action:"preview",statement:s});
      const rules=await api<{phrase:string;category_id:number;kind:string;enabled:number;priority:number;id:number}[]>("merchant-rules");
      setCategoryMap(Object.fromEntries(s.transactions.map((r,i)=>{const hint=categories.find(c=>c.kind==="expense"&&c.name.trim().toLowerCase()===r.category_hint?.trim().toLowerCase()),rule=rules.filter(r=>r.enabled&&r.kind==="expense").sort((a,b)=>a.priority-b.priority||a.id-b.id).find(rule=>categories.some(c=>c.id===rule.category_id&&c.kind==="expense")&&(r.merchant??"").trim().toLowerCase().includes(rule.phrase.trim().toLowerCase()));return [String(i),String(hint?.id??rule?.category_id??"")];})));
      setPaymentMap({});
      setStatement(s);
    } catch (e) { setError(e instanceof ApiError ? e.message : clearMessage(e instanceof Error ? e.message : undefined) ?? "Luna could not review this file. Check it against the JSON template and choose it again."); } finally{setBusy(false);}
  }

  async function commit() {
    if (!statement || !card || busy) return;
    setBusy(true); setError("");
    try {
      setResult(await send("imports", { accountId: Number(card), statement, allowDuplicates, categoryMap: Object.fromEntries(Object.entries(categoryMap).map(([k, v]) => [k, Number(v)])), paymentMap: Object.fromEntries(Object.entries(paymentMap).map(([k, v]) => [k, Number(v)])) }));
      client.invalidateQueries();
      setStatement(null); setCategoryMap({}); setPaymentMap({});
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">Statement review</p><h1>Imports</h1><p className="mt-3 text-sm text-muted-foreground">Full statements archive privately; legacy CSV/JSON files remain in-memory workflows.</p></div><StatementImportDialog onUploaded={(id,duplicate)=>navigate(`/imports?statement=${id}${duplicate?"&duplicate=1":""}`)}/></header>
    <SampleWorkspaceReset/>
    <BankStatements importMode/>
    <Tabs value={mode} onValueChange={setMode}><TabsList className="mb-5 h-auto max-w-full flex-wrap"><TabsTrigger disabled={csvBusy} className="min-h-11 whitespace-normal" value="json">Legacy JSON statements · PHP</TabsTrigger><TabsTrigger disabled={busy} className="min-h-11 whitespace-normal" value="csv">Legacy flat CSV · PHP</TabsTrigger></TabsList><TabsContent value={mode}>
    {mode==="csv"?<CsvImport onBusyChange={setCsvBusy}/>:<div>
    <section className="panel grid min-w-0 gap-5 sm:grid-cols-2 [&>label]:min-w-0 [&_input]:min-w-0">
      <label className="text-sm font-semibold">Credit card<select disabled={busy} value={card} onChange={e => setCard(e.target.value)} className="field"><option value="">Select account</option>{accounts.filter(a => a.type === "credit_card").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="text-sm font-semibold" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)choose(e.dataTransfer.files[0]);}}>Choose or drop statement JSON<input ref={fileInput} disabled={busy} type="file" accept="application/json,.json" onChange={e => choose(e.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>
    </section>
    {accountQuery.isPending||categoryQuery.isPending?<p role="status" className="mt-3">Loading accounts/categories…</p>:accountQuery.error||categoryQuery.error?<p role="alert" className="mt-3 text-destructive">{(accountQuery.error??categoryQuery.error)?.message}</p>:!accounts.some(a=>a.type==="credit_card")||!categories.some(c=>c.kind==="expense")?<p className="mt-3">Set up a credit card in <Link className="underline" to="/accounts">Accounts</Link> and expense categories in <Link className="underline" to="/settings">Settings</Link> first.</p>:null}
    <JsonTemplate />
    {busy&&<p role="status" className="my-4 text-sm text-muted-foreground">{statement?"Importing your statement. Keep this page open until the result appears.":"Reading and checking your statement. No transactions have been imported yet."}</p>}
    {statement && <section className="my-5 rounded-3xl border bg-card p-5">
      <h2 className="font-bold">{statement.statement_id} · {statement.account_key}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{statement.period.start} — {statement.period.end} · {statement.transactions.length} rows · closing debt {statement.closing_balance} PHP</p>
      <div className="mt-4 divide-y">{statement.transactions.map((r, i) => <article key={`${r.source_id ?? i}-${i}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]">
        <div><p className="font-semibold">{r.description || r.merchant || r.type}</p><p className="text-sm text-muted-foreground">{r.posted_date} · {r.type} · PHP {r.amount}{r.source_id ? ` · ${r.source_id}` : ""}</p></div>
        {["purchase", "refund", "fee", "interest"].includes(r.type) ? <label className="text-sm">Category<select disabled={busy} value={categoryMap[String(i)] ?? ""} onChange={e => setCategoryMap(m => ({ ...m, [String(i)]: e.target.value }))} className="field"><option value="">Choose category</option>{categories.filter(c => c.kind === "expense").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : r.type === "payment" ? <label className="text-sm">Paid from<select disabled={busy} value={paymentMap[String(i)] ?? ""} onChange={e => setPaymentMap(m => ({ ...m, [String(i)]: e.target.value }))} className="field"><option value="">Choose funding account</option>{accounts.filter(a => a.id !== Number(card) && ["cash","bank","wallet"].includes(a.type)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : null}
      </article>)}</div>
      <label className="mt-4 flex min-h-11 items-center gap-3"><input className="size-6" type="checkbox" disabled={busy} checked={allowDuplicates} onChange={e=>setAllowDuplicates(e.target.checked)}/>I reviewed possible cross-format content duplicates; import all statement rows if warned. Exact repeated source IDs still fail.</label>
      <div className="flex flex-wrap gap-3"><button aria-busy={busy} disabled={!card || busy || Boolean(result)||!accounts.length||statement.transactions.some((r,i)=>["purchase","refund","fee","interest"].includes(r.type)?!categoryMap[String(i)]:r.type==="payment"?!paymentMap[String(i)]:false)} onClick={commit} className="action mt-4">{busy ? "Importing…" : result ? "Imported" : "Import all statement rows"}</button><button disabled={busy} onClick={() => { setStatement(null); setCategoryMap({}); setPaymentMap({}); if (fileInput.current) fileInput.current.value = ""; }} className="quiet mt-4">Cancel</button></div>
    </section>}
    {error && <p role="alert" className="my-4 rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
    {result && <section role="status" className="rounded-3xl border bg-card p-5"><h2 className="font-bold">{result.duplicate ? "Statement already imported" : "Import complete"}</h2>{!result.duplicate && <p className="mt-2 text-sm">Reconciliation difference: {formatMoney(result.difference)} · expected {formatMoney(result.expectedClosing)} debt, recorded {formatMoney(result.actualClosing)} debt</p>}<p className="mt-1 text-xs text-muted-foreground">Differences never create automatic adjustments.</p></section>}
    </div>}</TabsContent></Tabs>
    <section className="panel mt-5"><h2>Import history</h2><p className="mt-2 text-sm text-muted-foreground">Raw files are not stored. Legacy JSON row counts may be unavailable.</p>{history.isPending?<p role="status">Loading import history…</p>:history.error?<p role="alert" className="text-destructive">{history.error.message}</p>:history.data?.length?<ul className="mt-3 divide-y">{history.data.map(h=><li className="flex flex-wrap justify-between gap-3 py-3" key={`${h.format}-${h.id}`}><div><strong>{h.account_name}</strong><p className="text-xs text-muted-foreground">{h.created_at} · {h.format.toUpperCase()} · PHP</p>{Boolean(h.reconciliation_stale)&&<p className="text-sm text-destructive">Reconciliation stale. Review corrected/deleted history against the original file; reimporting does not repair coverage.</p>}</div><span>{h.rows||h.format==="csv"?`${h.rows} rows`:"Legacy row count unavailable"}</span></li>)}</ul>:<p className="mt-4">No imports recorded.</p>}</section>
  </>;
}
