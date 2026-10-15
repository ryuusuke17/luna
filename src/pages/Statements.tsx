import {useSearchParams,Link} from "react-router-dom";
import {useEffect,useRef} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import MonthControl from "@/components/MonthControl";
import CreditCardActivity from "@/components/CreditCardActivity";
import CreditCardStatementDetail from "@/components/CreditCardStatementDetail";
import LegacyStatementArchives from "@/components/LegacyStatementArchives";
import {api} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import {cardLabel,statusLabel} from "@/lib/credit-card-statements";
import {statementMonthLabel,type CreditDashboard} from "@/lib/credit-card-dashboard";

const filterKeys=["year","month","issuer","cards","status","search","dueStart","dueEnd","page","sort","lineSearch","lineType","category","start","end","lineSort","linePage"];
export default function Statements(){
 const [params,setParams]=useSearchParams(),document=params.get("document"),query=new URLSearchParams(),trigger=useRef<HTMLElement|null>(null);
 for(const key of filterKeys)if(params.get(key))query.set(key,params.get(key)!);
 const data=useQuery({queryKey:["credit-card-statements","dashboard",query.toString()],queryFn:()=>api<CreditDashboard>(`credit-card-dashboard?${query}`),placeholderData:previous=>previous}),dashboard=data.data;
 const month=params.get("month")||dashboard?.selectedMonth||"",resultMonth=dashboard?.selectedMonth||month,monthLabel=resultMonth?statementMonthLabel(resultMonth):"No imported month";
 useEffect(()=>{
  if(!data.isPlaceholderData&&!params.has("month")&&dashboard?.selectedMonth){const next=new URLSearchParams(params);next.set("month",dashboard.selectedMonth);setParams(next,{replace:true});}
 },[data.isPlaceholderData,dashboard?.selectedMonth,params,setParams]);
 function filter(key:string,value:string){
  const next=new URLSearchParams(params);
  if(key!=="page"&&key!=="linePage"){next.delete("page");next.delete("linePage");}
  if(key==="issuer")next.delete("cards");
  if(key==="month")next.delete("year");
  if(value)next.set(key,value);else next.delete(key);
  if(key==="year"&&value){next.set("month",dashboard?.availableMonths.find(m=>m.startsWith(`${value}-`))??`${value}-01`);}
  setParams(next);
 }
 function open(id:number){trigger.current=window.document.activeElement as HTMLElement;const next=new URLSearchParams(params);next.set("document",String(id));setParams(next);}
 function close(){const next=new URLSearchParams(params);next.delete("document");setParams(next);requestAnimationFrame(()=>trigger.current?.focus());}
 const cards=dashboard?.allCards.filter(c=>!params.get("issuer")||c.issuer===params.get("issuer"))??[];
 const missing=dashboard?.cards.filter(c=>c.selectedMonthCount===0).length??0;
 return <>
  <header className="page-heading"><div><h1>Credit Card Dashboard</h1><p className="mt-2 text-muted-foreground">Issued balances, all statement activity, separate payment tracking. No ledger changes.</p></div><Link className="quiet inline-flex min-h-11 items-center underline" to="/import-export?tab=import">Go to Import</Link></header>
  <section className="mb-5 space-y-3" aria-label="Global statement filters">
   <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-6">
    <div className="min-w-0"><p className="mb-1 text-sm">Statement Month</p>{month?<MonthControl month={month} onChange={m=>filter("month",m)}/>:<p className="flex min-h-11 items-center text-sm text-muted-foreground">{data.isPending?"Loading issue months…":"Import a statement to begin"}</p>}</div>
    <label className="min-w-0 flex-1">Issuer<select className="field" value={params.get("issuer")??""} onChange={e=>filter("issuer",e.target.value)}><option value="">All issuers</option>{dashboard?.issuers.map(i=><option key={i}>{i}</option>)}</select></label>
    <label className="min-w-0 flex-1">Card<select className="field" value={params.get("cards")??""} onChange={e=>filter("cards",e.target.value)}><option value="">All cards</option>{params.get("cards")?.includes(",")&&<option value={params.get("cards")!}>Multiple selected cards</option>}{cards.map(c=><option key={c.id} value={c.id}>{cardLabel(c)} · #{c.id}</option>)}</select></label>
    <label className="min-w-0 flex-1">Payment status<select className="field" value={params.get("status")??""} onChange={e=>filter("status",e.target.value)}><option value="">All tracker states</option>{["not_tracked","unpaid","partial","paid","past_due_unverified","credit_balance"].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
    <label className="min-w-0 flex-1">Search statements<input className="field" type="search" maxLength={200} placeholder="Card, title, filename" value={params.get("search")??""} onChange={e=>filter("search",e.target.value)}/></label>
    <Button variant="outline" onClick={()=>setParams(document?{document}:{})}>Clear all filters</Button>
   </div>
   <details><summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3">More filters{["year","dueStart","dueEnd"].some(k=>params.has(k))?" · active":""}</summary><div className="mt-3 flex flex-wrap items-end gap-3">
    <label>Imported issue month<select className="field" value={month} onChange={e=>filter("month",e.target.value)}>{month&&!dashboard?.availableMonths.includes(month)&&<option value={month}>{monthLabel} · no import</option>}{!month&&<option value="">No imported months</option>}{dashboard?.availableMonths.map(m=><option key={m} value={m}>{statementMonthLabel(m)}</option>)}</select></label>
    <label>Issue year<select className="field" value={params.get("year")??""} onChange={e=>filter("year",e.target.value)}><option value="">Selected month’s year</option>{[...new Set([...(dashboard?.availableMonths??[]).map(m=>m.slice(0,4)),...(month?[month.slice(0,4)]:[])])].sort().reverse().map(y=><option key={y}>{y}</option>)}</select></label>
    {[["dueStart","Due date from"],["dueEnd","Due date to"]].map(([key,label])=><label key={key}>{label}<input type="date" className="field" value={params.get(key)??""} onChange={e=>filter(key,e.target.value)}/></label>)}
   </div></details>
  </section>
  {data.isFetching&&!data.isPending&&<p role="status" className="mb-3 text-sm text-muted-foreground">Updating filters… Results below show the previous selection until loading completes.</p>}
  {data.isPending?<p role="status" className="panel">Loading dashboard…</p>:data.error?<div className="panel space-y-3" role="alert"><p className="text-destructive">{data.error.message}</p><Button variant="outline" onClick={()=>data.refetch()}>Retry dashboard</Button></div>:dashboard&&<>
   {dashboard.diagnostics.issued.active?<section className="space-y-3" aria-label={`Statement summary for ${monthLabel}`}><h2>{monthLabel} overview</h2><p className="text-sm text-muted-foreground">Original issued balances, not spending or current debt. Currencies stay separate. Remaining balances reflect recorded allocations, not verified bank balances.</p>
    {dashboard.metrics.map(m=><div key={m.currency} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[[`Total statement balances · ${m.currency}`,m.originalBalance],["New charges",m.newCharges],["Post-statement payments recorded",m.applied],["Remaining statement balances",m.remaining]].map(([label,value])=><article key={label} className="panel min-w-0 break-words"><h3 className="text-sm text-muted-foreground">{label}</h3><p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(Number(value),m.currency)}</p>{label==="Remaining statement balances"&&<p className="mt-1 text-xs text-muted-foreground">Payment history may be incomplete</p>}</article>)}<p className="text-sm sm:col-span-2 xl:col-span-4">{m.currency} · {m.statements} statements / {m.cards} cards represented · Minimum due {formatMoney(m.minimumDue,m.currency)}</p></div>)}
    {dashboard.metrics.length===0&&<p className="panel">No issued statements match {monthLabel} and these filters. Balances unknown, not zero. Clear filters or import the missing issue.</p>}
    <p className="text-sm text-muted-foreground">{dashboard.cards.filter(c=>Boolean(c.selectedMonthCount)).length} / {dashboard.cards.length} selected active cards have an imported issue · {missing} not imported. Card coverage below ignores payment-status, due-date and text filters.</p>
   </section>:<section className="panel space-y-3" aria-labelledby="statement-onboarding"><h2 id="statement-onboarding">Import your first issued statement</h2><p>No validated issued statements are available. Balances and payment coverage are unknown. Existing legacy archives stay separate.</p><Link className="inline-flex min-h-11 items-center font-semibold underline" to="/import-export?tab=import">Go to Import</Link></section>}
   <section className="mt-6 space-y-4" aria-labelledby="my-credit-cards"><h2 id="my-credit-cards">My Credit Cards</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dashboard.cards.map(c=><article key={c.id} className="panel min-w-0 space-y-3 break-words">
    <div><p className="text-xs text-muted-foreground">{c.issuer||"Issuer unknown"}</p><h3 className="font-semibold">{c.name} · {c.last4?`•••• ${c.last4}`:`Last four unknown · Card #${c.id}`}</h3></div>
    {c.selectedIssues.length?c.selectedIssues.map(s=><div key={s.id} className="space-y-3 border-t pt-3"><p className="text-sm">{monthLabel} · Issued {s.statement_date} · Due {s.due_date}</p><dl className="grid grid-cols-2 gap-3 text-sm">{[["Original balance",s.original_balance],["Minimum due",s.minimum_due],["Recorded after issue",s.applied],["Remaining by tracker",s.remaining]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{formatMoney(Number(value),s.currency)}</dd></div>)}</dl>
     {s.original_balance>0&&<><progress className="block h-2 w-full accent-primary" max={s.original_balance} value={s.applied} aria-label={`Recorded payment allocation for ${c.name}, statement ${s.id}`}/><p className="text-xs text-muted-foreground">{Math.min(100,Math.round(s.applied/s.original_balance*100))}% allocated · {s.tracking_confirmed?"User-confirmed tracking":"Payment coverage unknown / partial evidence"}</p></>}
     <p className="text-sm font-medium">Imported · {statusLabel(s.status)}</p><p className="text-xs text-muted-foreground">Limit at issue: {formatMoney(s.metadata.creditLimit,s.currency)}. Not available credit.</p><Button variant="outline" onClick={()=>open(s.id)}>View statement #{s.id}</Button>
    </div>):<><p className="text-sm">{month?`No imported statement for ${monthLabel}.`:"No issued statement imported."} Balance unknown.</p>{c.latest&&<p className="text-xs text-muted-foreground">Last imported: {statementMonthLabel(c.latest.statement_date.slice(0,7))}</p>}</>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>filter("cards",String(c.id))}>Show {c.name} activity</Button>{c.latest&&<Button variant="ghost" onClick={()=>open(c.latest!.id)}>Card history</Button>}</div>
   </article>)}</div>{!dashboard.cards.length&&<p>No active credit cards match. <Link className="underline" to="/accounts">Manage credit card accounts</Link>.</p>}</section>
   {Boolean(dashboard.diagnostics.issued.active)&&<><CreditCardActivity activity={dashboard.activity} params={params} onFilter={filter} onOpen={open}/>
    <section className="mt-6 space-y-4" aria-labelledby="issued-archive"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="issued-archive">Issued Statement Archive</h2><p className="text-sm text-muted-foreground">One row per active issued statement in {monthLabel}. Open history for preserved versions.</p></div><label>Archive order<select className="field" value={params.get("sort")??"newest"} onChange={e=>filter("sort",e.target.value)}><option value="newest">Newest issue</option><option value="oldest">Oldest issue</option><option value="balance">Highest original balance</option></select></label></div>
     {dashboard.items.length>0&&<div className="table-scroll" role="region" tabIndex={0} aria-label="Issued statement archive"><table><thead><tr>{["Card / issuer","Statement date","Cutoff / period","Due date","New charges","Original balance","Minimum due","Recorded allocations","Remaining by tracker","Import / tracking","Source detail"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{dashboard.items.map(s=><tr key={s.id}><td className="min-w-48 break-words">{s.card_name} · {s.last4?`•••• ${s.last4}`:`Card #${s.card_id}`}<span className="block text-sm text-muted-foreground">{s.metadata.issuer}</span></td><td>{s.statement_date}</td><td>Unknown</td><td>{s.due_date}</td><td>{formatMoney(s.metadata.newCharges,s.currency)}</td><td>{formatMoney(s.original_balance,s.currency)}</td><td>{formatMoney(s.minimum_due,s.currency)}</td><td>{formatMoney(s.applied,s.currency)}</td><td>{formatMoney(s.remaining,s.currency)}</td><td>{s.reviewStatus} · {statusLabel(s.status)}</td><td><Button variant="outline" onClick={()=>open(s.id)}>View statement {s.id}</Button></td></tr>)}</tbody></table></div>}
     <nav className="flex flex-wrap items-center gap-3" aria-label="Statement pagination"><p>{dashboard.total} statements · page {dashboard.page}</p><Button variant="outline" disabled={dashboard.page<=1} onClick={()=>filter("page",String(dashboard.page-1))}>Previous statements</Button><Button variant="outline" disabled={dashboard.page*dashboard.pageSize>=dashboard.total} onClick={()=>filter("page",String(dashboard.page+1))}>Next statements</Button></nav>
    </section>
   </>}
   <details className="mt-6 rounded-lg border p-4"><summary className="min-h-11 cursor-pointer font-medium">Import coverage diagnostics</summary><div className="mt-3 space-y-3 text-sm"><p>{dashboard.diagnostics.issued.total} persisted issued statements · {dashboard.diagnostics.issued.active??0} active versions · {dashboard.diagnostics.lines} source lines · {dashboard.diagnostics.legacyArchives} legacy reference archives · {dashboard.diagnostics.ledgerImports} ledger-import records. Archives and ledger imports are not validated issued statements.</p>{dashboard.diagnostics.ambiguousCards.length>0&&<p>Card IDs {dashboard.diagnostics.ambiguousCards.join(", ")} share an issuer with incomplete identifiers. Verify account associations and last four in Accounts. No cards merged or deleted.</p>}<p>Owner-scoped counts only. No migration, inferred funding sources, or account balance changes.</p>{dashboard.diagnostics.issues.length>0&&<ul className="list-disc space-y-1 pl-5" aria-label="Persisted issue metadata">{dashboard.diagnostics.issues.map(i=><li key={i.id}>Statement #{i.id} · Card #{i.card_id} · {i.statement_date} · {i.currency} · {i.line_count} lines · {i.superseded_by?`Superseded by #${i.superseded_by}`:"Active"}</li>)}</ul>}</div></details>
  </>}
  {document&&<CreditCardStatementDetail key={document} id={document} onClose={close}/>}
  <LegacyStatementArchives/>
 </>;
}
