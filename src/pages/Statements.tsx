import {useSearchParams,Link} from "react-router-dom";
import {useRef} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import CreditCardActivity from "@/components/CreditCardActivity";
import CreditCardStatementDetail from "@/components/CreditCardStatementDetail";
import CreditCardStatements from "@/components/CreditCardStatements";
import LegacyStatementArchives from "@/components/LegacyStatementArchives";
import {api} from "@/lib/api";
import {cardLabel,statusLabel} from "@/lib/credit-card-statements";
import {statementMonthLabel,type CreditDashboard} from "@/lib/credit-card-dashboard";

const filterKeys=["year","month","issuer","cards","status","search","dueStart","dueEnd","page","sort","lineSearch","lineAmount","lineCurrency","lineType","category","start","end","lineSort","linePage"];
export default function Statements(){
 const [params,setParams]=useSearchParams(),document=params.get("document"),query=new URLSearchParams(),trigger=useRef<HTMLElement|null>(null);
 for(const key of filterKeys)if(params.get(key))query.set(key,params.get(key)!);
 const data=useQuery({queryKey:["credit-card-statements","dashboard",query.toString()],queryFn:()=>api<CreditDashboard>(`credit-card-dashboard?${query}`),placeholderData:(previous,previousQuery)=>new URLSearchParams(String(previousQuery?.queryKey[2]??"")).get("cards")===query.get("cards")?previous:undefined}),dashboard=data.data;
 function filter(key:string,value:string){const next=new URLSearchParams(params);if(key!=="page"&&key!=="linePage"){next.delete("page");next.delete("linePage");}if(value)next.set(key,value);else next.delete(key);setParams(next,{replace:true});}
 function open(id:number){trigger.current=window.document.activeElement as HTMLElement;const next=new URLSearchParams(params);next.set("document",String(id));setParams(next);}
 function close(){const next=new URLSearchParams(params);next.delete("document");setParams(next);requestAnimationFrame(()=>trigger.current?.focus());}
 return <>
  <header className="page-heading"><div><h1>Statements</h1><p className="mt-2 text-muted-foreground">Credit-card billing evidence across all months. Ledger review remains explicit.</p></div><Link className="quiet inline-flex min-h-11 items-center underline" to="/import-export?tab=import">Go to Import</Link></header>
  <section className="mb-5 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Statement filters">
   <label>Issue month<select className="field" value={params.get("month")??""} onChange={e=>filter("month",e.target.value)}><option value="">All months</option>{dashboard?.availableMonths.map(m=><option key={m} value={m}>{statementMonthLabel(m)}</option>)}</select></label>
   <label>Issue year<select className="field" value={params.get("year")??""} onChange={e=>filter("year",e.target.value)}><option value="">All years</option>{[...new Set(dashboard?.availableMonths.map(m=>m.slice(0,4)))].map(y=><option key={y}>{y}</option>)}</select></label>
   <label>Issuer<select className="field" value={params.get("issuer")??""} onChange={e=>filter("issuer",e.target.value)}><option value="">All issuers</option>{dashboard?.issuers.map(i=><option key={i}>{i}</option>)}</select></label>
   <label>Card<select className="field" value={params.get("cards")??""} onChange={e=>filter("cards",e.target.value)}><option value="">All cards</option>{params.get("cards")?.includes(",")&&<option value={params.get("cards")!}>Multiple selected cards</option>}{dashboard?.allCards.map(c=><option key={c.id} value={c.id}>{cardLabel(c)} · #{c.id}</option>)}</select></label>
   <label>Payment status<select className="field" value={params.get("status")??""} onChange={e=>filter("status",e.target.value)}><option value="">All tracker states</option>{["not_tracked","unpaid","partial","paid","past_due_unverified","credit_balance"].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
   <label>Search statement metadata<input className="field" type="search" maxLength={200} placeholder="Account, title, filename" value={params.get("search")??""} onChange={e=>filter("search",e.target.value)}/></label>
   {[["dueStart","Due date from"],["dueEnd","Due date to"]].map(([key,label])=><label key={key}>{label}<input type="date" className="field" value={params.get(key)??""} onChange={e=>filter(key,e.target.value)}/></label>)}
   <Button variant="outline" onClick={()=>setParams(document?{document}:{})}>Clear all filters</Button>
  </section>
  {data.isFetching&&!data.isPending&&<p role="status">Updating results; previous selection remains visible until complete.</p>}
  {data.isPending?<p role="status">Loading statements…</p>:data.error?<div className="panel" role="alert"><p>{data.error.message}</p><Button variant="outline" onClick={()=>data.refetch()}>Retry statements</Button></div>:dashboard&&<><CreditCardStatements data={dashboard} onOpen={open} onPage={page=>filter("page",String(page))}/><CreditCardActivity activity={dashboard.activity} params={params} onFilter={filter} onOpen={open}/></>}
  {document&&<CreditCardStatementDetail key={document} id={document} onClose={close}/>}
  <Link className="mt-6 inline-flex min-h-11 items-center underline" to="/import-export?tab=history">Reference uploads and Import history</Link>
  {params.has("archive")&&<LegacyStatementArchives initialId={Number(params.get("archive"))}/>}
 </>;
}
