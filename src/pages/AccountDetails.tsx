import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/WorkspaceButton";
import AccountDialog from "@/components/AccountDialog";
import AccountDeletionDialog from "@/components/AccountDeletionDialog";
import AccountOverview from "@/components/AccountOverview";
import CreditCardStatementDetail from "@/components/CreditCardStatementDetail";
import TransactionImports from "@/components/TransactionImports";
import LegacyStatementArchives from "@/components/LegacyStatementArchives";
import { api } from "@/lib/api";
import { type AccountDetail, type AccountSnapshot } from "@/lib/accounts";
import { formatMoney } from "@/lib/finance";

const sourceLabels = {issued:"Issued credit-card statement",bank:"Bank-statement upload",archive:"Legacy reference archive",historical:"Historical statement import"};
export default function AccountDetails() {
  const {id=""}=useParams(),navigate=useNavigate(),[params,setParams]=useSearchParams(),[editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[status,setStatus]=useState("");
  const heading=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLElement|null>(null);
  const query=new URLSearchParams();
  for(const key of ["month","start","end","search","page"])if(params.has(key))query.set(key,params.get(key)!);
  const detail=useQuery({queryKey:["account-detail",id,query.toString()],queryFn:()=>api<AccountDetail>(`accounts/${encodeURIComponent(id)}?${query}`),placeholderData:(previous,previousQuery)=>previousQuery?.queryKey[1]===id?previous:undefined});
  const account=detail.data?.account,source=params.get("source"),sourceId=params.get("sourceId");
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[id,Boolean(account)]);
  useEffect(()=>{if(params.has("tab")){const next=new URLSearchParams(params);next.delete("tab");setParams(next,{replace:true});}},[params,setParams]);
  useEffect(()=>{if(source&&sourceId)document.getElementById("account-source")?.focus();},[source,sourceId]);
  function filter(key:string,value:string){
    const next=new URLSearchParams(params);if(key!=="page")next.delete("page");
    next.delete("source");next.delete("sourceId");next.delete("tab");
    if(key==="month"){next.delete("start");next.delete("end");}
    if(key==="start"||key==="end")next.delete("month");
    if(value)next.set(key,value);else next.delete(key);setParams(next);
  }
  function clear(){setParams({});}
  function open(s:AccountSnapshot){opener.current=document.activeElement as HTMLElement;const next=new URLSearchParams(params);next.set("source",s.source);next.set("sourceId",String(s.sourceId));setParams(next);}
  function close(){const next=new URLSearchParams(params);next.delete("source");next.delete("sourceId");setParams(next);requestAnimationFrame(()=>opener.current?.focus());}
  const importUrl=account?.type==="credit_card"?`/import-export?account=${encodeURIComponent(id)}&tab=import#credit-card-import-title`:`/import-export?account=${encodeURIComponent(id)}&upload=1`;
  const page=Number(params.get("page")??1),result=detail.data?.history,hasFilters=["month","start","end","search","page"].some(key=>params.has(key));
  return <div className="min-w-0 space-y-5">
    <Link className="quiet inline-flex min-h-11 items-center gap-2 underline" to="/accounts"><ArrowLeft size={16} aria-hidden/>Back to accounts</Link>
    {detail.isPending?<p role="status">Loading account…</p>:detail.error?<section className="panel space-y-3" role="alert"><h1>Account unavailable</h1><p className="break-words text-destructive">{detail.error.message}</p><Button variant="outline" onClick={()=>detail.refetch()}>Retry account</Button><Button variant="outline" onClick={clear}>Clear filters</Button></section>:account&&<>
      <AccountOverview account={account} headingRef={heading}>
        <Link className="quiet inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to={importUrl}>{account.type==="credit_card"?"Import statements":"Import transactions"}</Link>
        <Button variant="outline" onClick={()=>setEditing(true)} disabled={Boolean(account.archived_at)}>Edit details</Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={()=>setDeleting(true)}>Delete account</Button>
      </AccountOverview>
      <section className="min-w-0 space-y-3" aria-labelledby="statement-uploads-heading" aria-busy={detail.isFetching}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="statement-uploads-heading">Statement uploads</h2><p className="text-xs text-muted-foreground" role="status">{detail.isFetching?"Updating statements…":`${result?.total??0} uploads · newest statement first`}</p></div>
        <section className="rounded-lg border p-3" aria-label="Statement filters">
          <div className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <label className="min-w-0 text-xs">Month<input className="field !mt-1 !min-h-11 !py-2" type="month" value={params.get("month")??""} onChange={e=>filter("month",e.target.value)}/></label>
            <label className="min-w-0 text-xs">Search statements<input className="field !mt-1 !min-h-11 !py-2" type="search" maxLength={100} placeholder="Filename or status" value={params.get("search")??""} onChange={e=>filter("search",e.target.value)}/></label>
            <Button variant="outline" className="min-h-11" disabled={!hasFilters} onClick={clear}>Clear filters</Button>
          </div>
          <details className="mt-1" open={params.has("start")||params.has("end")||undefined}>
            <summary className="flex min-h-11 cursor-pointer items-center text-xs underline">Custom date range</summary>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2"><label className="min-w-0 text-xs">Date from<input className="field !mt-1 !min-h-11 !py-2" type="date" max={params.get("end")??undefined} value={params.get("start")??""} onChange={e=>filter("start",e.target.value)}/></label><label className="min-w-0 text-xs">Date to<input className="field !mt-1 !min-h-11 !py-2" type="date" min={params.get("start")??undefined} value={params.get("end")??""} onChange={e=>filter("end",e.target.value)}/></label></div>
            <p className="mt-2 text-xs text-muted-foreground">Statement dates. A custom range replaces the month; undated uploads appear without date filters.</p>
          </details>
        </section>
        {!account.display?.count?<div className="panel space-y-3"><p>No statements uploaded</p><Link className="quiet inline-flex min-h-11 items-center underline" to={importUrl}>Import statements for {account.name}</Link></div>:!result?.total?<div className="panel space-y-2"><p>No statements match these filters.</p><Button variant="outline" onClick={clear}>Clear filters</Button></div>:<ul className="space-y-2">{result.items.map(s=>{
          const selected=source===s.source&&sourceId===String(s.sourceId);
          return <li key={s.id} className="min-w-0 rounded-lg border p-3 [overflow-wrap:anywhere]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-48"><h3 className="text-sm font-semibold">{s.filename}</h3><p className="mt-1 text-xs text-muted-foreground">{s.date??"Statement date unknown"} · {sourceLabels[s.source]} · {s.status.replace(/_/g," ")}</p><p className="mt-1 text-sm">Closing balance: {s.amount===null?"Not provided":formatMoney(s.amount,s.currency)}</p></div>
              <div className="flex max-w-full flex-wrap items-center gap-3">{s.source==="historical"?<Link className="quiet inline-flex min-h-11 items-center underline" aria-label={`View ${s.filename}`} to={s.view}>View statement</Link>:<Button variant="outline" disabled={detail.isFetching} aria-label={`View ${s.filename}`} aria-expanded={selected} aria-controls={selected?"account-source":undefined} onClick={()=>selected?close():open(s)}>{selected?"Hide statement":"View statement"}</Button>}{s.download&&<a className="quiet inline-flex min-h-11 items-center underline" aria-label={`Download original ${s.filename}`} href={s.download} download>Download</a>}</div>
            </div>
            {selected&&s.source!=="historical"&&<section id="account-source" tabIndex={-1} className="mt-3 min-w-0 scroll-mt-24 border-t pt-3" aria-label={s.source==="archive"?"Legacy statement source":s.source==="bank"?"Bank statement source":"Selected statement source"}>
              {s.source==="issued"?<CreditCardStatementDetail key={sourceId} id={String(s.sourceId)} onClose={close}/>:<><Button variant="outline" onClick={close}>Close source details</Button>{s.source==="bank"?<TransactionImports batch={s.sourceId} account={id} onSelectBatch={batch=>{const next=new URLSearchParams(params);next.set("sourceId",String(batch));setParams(next);}} onLegacy={(format,importId,accountId)=>{window.location.assign(`/transactions?legacy=${format}&importId=${importId}&account=${accountId}`);}} onStatus={setStatus}/>:<LegacyStatementArchives key={sourceId} account={id} initialId={s.sourceId}/>}</>}
            </section>}
          </li>;
        })}</ul>}
        {result&&(result.total>result.pageSize||page>1)&&<nav className="flex flex-wrap items-center gap-3" aria-label="Statement pagination"><p className="text-sm">{result.total} uploads · page {page}</p><Button variant="outline" disabled={page<=1||detail.isFetching} onClick={()=>filter("page",String(page-1))}>Previous page</Button><Button variant="outline" disabled={page*result.pageSize>=result.total||detail.isFetching} onClick={()=>filter("page",String(page+1))}>Next page</Button></nav>}
      </section>
      {status&&<p role="status">{status}</p>}
      {editing&&<AccountDialog account={account} onClose={()=>setEditing(false)}/>}
      {deleting&&<AccountDeletionDialog id={account.id} onClose={()=>setDeleting(false)} onDeleted={()=>navigate("/accounts",{replace:true})}/>}
    </>}
  </div>;
}
