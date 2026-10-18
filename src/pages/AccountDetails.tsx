import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/WorkspaceButton";
import AccountDialog from "@/components/AccountDialog";
import AccountDeletionDialog from "@/components/AccountDeletionDialog";
import { AccountIdentity } from "@/components/AccountCard";
import CreditCardStatementDetail from "@/components/CreditCardStatementDetail";
import TransactionImports from "@/components/TransactionImports";
import LegacyStatementArchives from "@/components/LegacyStatementArchives";
import { api } from "@/lib/api";
import { accountLabels, balanceCaption, debtAccount, utilization, type AccountDetail, type AccountSnapshot } from "@/lib/accounts";
import { formatMoney } from "@/lib/finance";
import { transactionType, transactionTypeLabel } from "@/lib/transactions";

type Activity = { id:number; posted_date:string; merchant:string; description:string; kind:string; is_installment?:number|null; amount:number; account_id:number; counter_account_id:number|null; balance_impacts:{id:number;change:number}[] };
const sourceLabels = {issued:"Issued credit-card statement",bank:"Bank-statement upload",archive:"Legacy reference archive",historical:"Historical statement import"};
export default function AccountDetails() {
  const {id=""}=useParams(),navigate=useNavigate(),[params,setParams]=useSearchParams(),[editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[status,setStatus]=useState("");
  const heading=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLElement|null>(null);
  const query=new URLSearchParams();
  for(const key of ["tab","month","start","end","search","page"])if(params.has(key))query.set(key,params.get(key)!);
  const detail=useQuery({queryKey:["account-detail",id,query.toString()],queryFn:()=>api<AccountDetail>(`accounts/${encodeURIComponent(id)}?${query}`),placeholderData:(previous,previousQuery)=>previousQuery?.queryKey[1]===id?previous:undefined});
  const account=detail.data?.account,period=detail.data?.period,tab=params.get("tab")??"statements",source=params.get("source"),sourceId=params.get("sourceId"),usage=account?utilization(account):null;
  const activityQuery=new URLSearchParams({account:id,page:params.get("page")??"1"});
  if(period?.start)activityQuery.set("start",period.start);if(period?.end)activityQuery.set("end",period.end);if(params.get("search"))activityQuery.set("search",params.get("search")!);
  const activity=useQuery({queryKey:["transactions","account-details",id,activityQuery.toString()],queryFn:()=>api<{items:Activity[];total:number;page:number;pageSize:number}>(`transactions?${activityQuery}`),enabled:tab==="activity"&&Boolean(account)&&!detail.isFetching&&!detail.error});
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[id,Boolean(account)]);
  useEffect(()=>{if(tab==="activity"&&period?.month&&!params.has("month")&&!params.has("start")&&!params.has("end")){const next=new URLSearchParams(params);next.set("month",period.month);setParams(next,{replace:true});}},[tab,period?.month,params,setParams]);
  useEffect(()=>{if(source&&sourceId)document.getElementById("account-source")?.focus();},[source,sourceId]);
  function filter(key:string,value:string){
    const next=new URLSearchParams(params);if(key!=="page")next.delete("page");
    next.delete("source");next.delete("sourceId");
    if(key==="month"){next.delete("start");next.delete("end");}
    if(key==="start"||key==="end")next.delete("month");
    if(value)next.set(key,value);else next.delete(key);setParams(next);
  }
  function clear(){setParams({tab});}
  function open(s:AccountSnapshot){opener.current=document.activeElement as HTMLElement;const next=new URLSearchParams(params);next.set("source",s.source);next.set("sourceId",String(s.sourceId));setParams(next);}
  function close(){const next=new URLSearchParams(params);next.delete("source");next.delete("sourceId");setParams(next);requestAnimationFrame(()=>opener.current?.focus());}
  const importUrl=account?.type==="credit_card"?`/import-export?account=${encodeURIComponent(id)}&tab=import#credit-card-import-title`:`/import-export?account=${encodeURIComponent(id)}&upload=1`;
  const page=Number(params.get("page")??1),result=tab==="activity"?activity.data:detail.data?.history;
  return <div className="min-w-0 space-y-5">
    <Link className="quiet inline-flex min-h-11 items-center gap-2 underline" to="/accounts"><ArrowLeft size={16} aria-hidden/>Back to accounts</Link>
    {detail.isPending?<p role="status">Loading account…</p>:detail.error?<section className="panel space-y-3" role="alert"><h1>Account unavailable</h1><p className="break-words text-destructive">{detail.error.message}</p><Button variant="outline" onClick={()=>detail.refetch()}>Retry account</Button><Button variant="outline" onClick={clear}>Clear filters</Button></section>:account&&<>
      <header className="panel flex flex-wrap items-start justify-between gap-4" aria-label={`${account.name} account details`}><div className="min-w-0 flex-1 space-y-3"><AccountIdentity account={account}/><h1 ref={heading} tabIndex={-1} className="break-words">{account.name}</h1><p className="break-words text-muted-foreground">{[accountLabels[account.type],account.issuer,account.product,account.last4&&["credit_card","bank"].includes(account.type)?`•••• ${account.last4}`:null].filter(Boolean).join(" · ")}</p><p>{balanceCaption(account.display)}</p>
        {account.display?.source==="statement"?account.display.snapshots.map(s=><div key={s.id} className="space-y-1"><p className="break-words text-2xl font-semibold tabular-nums">{formatMoney(s.amount!,s.currency)}</p><p className="text-sm">{sourceLabels[s.source]} · {s.date} · {s.semantics==="debt-positive"?(s.amount!<0?"Credit balance":"Debt-positive balance"):"Asset-positive balance"}</p>{account.type==="credit_card"&&<p className="text-sm">Due {s.dueDate??"Not provided"} · Minimum due {s.minimumDue===null?"Not provided":formatMoney(s.minimumDue,s.currency)}</p>}</div>):<><p className="break-words text-2xl font-semibold tabular-nums">{formatMoney(account.balance)}</p><p>{account.display?.reason}</p>{account.type==="credit_card"&&<p className="text-sm">Statement balance: Not provided · Due: Not provided · Minimum due: Not provided</p>}</>}
        {debtAccount(account.type)&&<p className="text-sm text-muted-foreground">Ledger debt: {formatMoney(Math.max(0,-account.balance))}. Positive ledger balances represent credit, not debt.</p>}
        {account.type==="credit_card"&&<><p>Limit {account.credit_limit?formatMoney(account.credit_limit):"Not provided"} · PHP</p><p className="text-sm">{usage?`${Math.round(usage.percent)}% utilization · ${usage.source}`:"Utilization: Not provided · No compatible amount/limit currency"}. Not live available credit.</p></>}
      </div><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={()=>setEditing(true)} disabled={Boolean(account.archived_at)}>Edit details</Button><Button variant="destructive" onClick={()=>setDeleting(true)}>Delete account</Button><Link className="quiet inline-flex min-h-11 items-center underline" to={importUrl}>{account.type==="credit_card"?"Import statements":"Import transactions"}</Link></div></header>
      {detail.isFetching&&<p role="status">Updating account filters…</p>}
      <Tabs value={tab} onValueChange={value=>{const next=new URLSearchParams();next.set("tab",value);setParams(next);}}>
        <TabsList className="h-auto max-w-full flex-wrap" aria-label="Account information"><TabsTrigger className="min-h-11" value="statements">Statements</TabsTrigger><TabsTrigger className="min-h-11" value="activity">Balance/activity</TabsTrigger></TabsList>
        <section className="panel my-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Account filters">
          <label className="min-w-0">Month<input className="field" type="month" value={params.get("month")??""} onChange={e=>filter("month",e.target.value)}/></label>
          <label className="min-w-0">Date from<input className="field" type="date" value={params.get("start")??""} onChange={e=>filter("start",e.target.value)}/></label>
          <label className="min-w-0">Date to<input className="field" type="date" value={params.get("end")??""} onChange={e=>filter("end",e.target.value)}/></label>
          <label className="min-w-0">{tab==="activity"?"Search activity":"Search statements"}<input className="field" type="search" maxLength={100} value={params.get("search")??""} onChange={e=>filter("search",e.target.value)}/></label>
          <Button variant="outline" onClick={clear}>Clear filters</Button><p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Month and custom dates are mutually exclusive. Search filters rows, never period balances.</p>
        </section>
        <TabsContent value="statements" className="min-w-0 space-y-4"><h2>Statement uploads</h2><p className="text-sm text-muted-foreground">All sources; newest explicit statement date first. Unknown dates stay unknown. Superseded versions remain inspectable. Snapshots never change your ledger.</p>
          {!account.display?.count?<div className="panel space-y-3"><p>No statements uploaded</p><Link className="quiet inline-flex min-h-11 items-center underline" to={importUrl}>Import statements for {account.name}</Link></div>:!detail.data!.history.total?<div className="panel"><p>No statements match these filters.</p><Button variant="outline" onClick={clear}>Clear filters</Button></div>:<ul className="space-y-3">{detail.data!.history.items.map(s=><li key={s.id} className="panel min-w-0 space-y-3 [overflow-wrap:anywhere]"><h3 className="font-semibold">{s.filename}</h3><p className="text-sm">{sourceLabels[s.source]} · {s.date??"Statement date unknown"} · {s.status.replace(/_/g," ")}</p><p>Closing balance: {s.amount===null?"Not provided":formatMoney(s.amount,s.currency)}{s.amount!==null&&` · ${s.semantics}`}</p><div className="flex flex-wrap gap-3">{s.source==="historical"?<Link className="quiet inline-flex min-h-11 items-center underline" to={s.view}>View {s.filename}</Link>:<Button variant="outline" onClick={()=>open(s)}>View {s.filename}</Button>}{s.download&&<a className="quiet inline-flex min-h-11 items-center underline" href={s.download} download>Download original {s.filename}</a>}</div></li>)}</ul>}
        </TabsContent>
        <TabsContent value="activity" className="min-w-0 space-y-4"><h2>Ledger balance and activity</h2><p className="text-sm text-muted-foreground">PHP ledger only; signed account movements. Transfers include both directions. Statement snapshots are separate. Search and pagination do not alter period totals.</p>
          <p>{period?.start??"Beginning of recorded history"} — {period?.end??"Latest recorded history"}</p>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Opening ledger balance",period!.opening],["Closing ledger balance",period!.closing],["Account inflows",period!.inflows],["Account outflows",period!.outflows]].map(([label,amount])=><div key={label} className="panel min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-xl font-semibold tabular-nums">{formatMoney(Number(amount))}</dd></div>)}</dl>
          {activity.isPending?<p role="status">Loading activity…</p>:activity.error?<p role="alert" className="text-destructive">{activity.error.message}</p>:!activity.data?.items.length?<div className="panel space-y-3"><p>No activity matches this period and search.</p><Button variant="outline" onClick={clear}>Clear filters</Button></div>:<div className="table-scroll" role="region" tabIndex={0} aria-label={`${account.name} ledger activity`}><table><thead><tr>{["Date","Transaction","Type","Account inflow","Account outflow"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{activity.data.items.map(t=>{const impact=t.balance_impacts.find(impact=>impact.id===account.id),change=impact?-impact.change:null;return <tr key={t.id}><td>{t.posted_date}</td><td className="max-w-xs break-words"><Link className="inline-flex min-h-11 items-center underline" to={`/transactions?id=${t.id}`}>{t.merchant||t.description||transactionTypeLabel(transactionType(t))}</Link></td><td>{transactionTypeLabel(transactionType(t))}</td><td>{change===null?"Not provided":change>0?formatMoney(change):"—"}</td><td>{change===null?"Not provided":change<0?formatMoney(-change):"—"}</td></tr>;})}</tbody></table></div>}
        </TabsContent>
        {result&&result.total>0&&<nav className="mt-5 flex flex-wrap items-center gap-3" aria-label={`${tab==="activity"?"Activity":"Statement"} pagination`}><p>{result.total} records · page {page}</p><Button variant="outline" disabled={page<=1} onClick={()=>filter("page",String(page-1))}>Previous page</Button><Button variant="outline" disabled={page*result.pageSize>=result.total} onClick={()=>filter("page",String(page+1))}>Next page</Button></nav>}
      </Tabs>
      {status&&<p role="status">{status}</p>}
      {sourceId&&/^\d+$/.test(sourceId)&&source==="issued"&&detail.data!.history.items.some(s=>s.source==="issued"&&s.sourceId===Number(sourceId))&&<CreditCardStatementDetail key={sourceId} id={sourceId} onClose={close}/>}
      {sourceId&&/^\d+$/.test(sourceId)&&source==="bank"&&detail.data!.history.items.some(s=>s.source==="bank"&&s.sourceId===Number(sourceId))&&<section id="account-source" tabIndex={-1} className="panel" aria-label="Bank statement source"><Button variant="outline" onClick={close}>Close source details</Button><TransactionImports batch={Number(sourceId)} account={id} onSelectBatch={batch=>{const next=new URLSearchParams(params);next.set("sourceId",String(batch));setParams(next);}} onLegacy={(format,importId,accountId)=>{window.location.assign(`/transactions?legacy=${format}&importId=${importId}&account=${accountId}`);}} onStatus={setStatus}/></section>}
      {sourceId&&/^\d+$/.test(sourceId)&&source==="archive"&&detail.data!.history.items.some(s=>s.source==="archive"&&s.sourceId===Number(sourceId))&&<section id="account-source" tabIndex={-1} aria-label="Legacy statement source"><Button variant="outline" onClick={close}>Close source details</Button><LegacyStatementArchives key={sourceId} account={id} initialId={Number(sourceId)}/></section>}
      {editing&&<AccountDialog account={account} onClose={()=>setEditing(false)}/>}
      {deleting&&<AccountDeletionDialog id={account.id} onClose={()=>setDeleting(false)} onDeleted={()=>navigate("/accounts",{replace:true})}/>}
    </>}
  </div>;
}
