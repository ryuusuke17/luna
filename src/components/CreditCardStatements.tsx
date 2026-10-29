import {Link} from "react-router-dom";
import {Button} from "@/components/WorkspaceButton";
import {formatMoney} from "@/lib/finance";
import type {StatementDashboard} from "@/lib/credit-card-statements";
import {statementMonthLabel} from "@/lib/credit-card-dashboard";

export default function CreditCardStatements({data,onView,onPage,compact=false,denseRows=false}:{data:Pick<StatementDashboard,"items"|"total"|"page"|"pageSize">;onView:(id:number)=>void;onPage:(page:number)=>void;compact?:boolean;denseRows?:boolean}){
 const sortedItems=[...data.items].sort((a,b)=>b.statement_date.localeCompare(a.statement_date)||b.id-a.id);
 const months=[...new Set(sortedItems.map(s=>s.statement_date.slice(0,7)))].sort((a,b)=>b.localeCompare(a));
 return <section className={compact?"space-y-3":"space-y-4"} aria-label="Issued statements">
  {!data.items.length&&<p className="panel">No issued statements match this selection. Clear filters or visit Import & Export; missing balances are unknown, not zero.</p>}
  {months.map(month=><section key={month} className={compact||denseRows?"space-y-2":"space-y-3"} aria-label={statementMonthLabel(month)}><h2>{statementMonthLabel(month)}</h2><div className={`grid grid-cols-1 ${compact||denseRows?"gap-2":"gap-4"}`}>{sortedItems.filter(s=>s.statement_date.startsWith(month)).map(s=>{
   const details=[["Issue date",s.statement_date],["Due date",s.due_date],["Original balance",formatMoney(s.original_balance,s.currency)],["Minimum due",formatMoney(s.minimum_due,s.currency)]];
   if(denseRows)return <article key={s.id} className="grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-3 rounded-lg border bg-card px-6 py-4 [overflow-wrap:anywhere] sm:grid-cols-[minmax(11rem,1.5fr)_repeat(4,minmax(7rem,1fr))_auto]">
    <div className="col-span-2 min-w-0 sm:col-span-1"><h3 className="truncate font-semibold"><Link className="underline" to={`/accounts/${s.card_id}`}>{s.card_name}</Link></h3><p className="truncate text-xs text-muted-foreground">{s.metadata.issuer} · {s.last4?`•••• ${s.last4}`:`Card #${s.card_id}`}</p></div>
    {details.map(([label,value])=><div key={label} className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-sm font-semibold tabular-nums" title={value}>{value}</p></div>)}
    <div className="col-span-2 flex justify-end sm:col-span-1"><Button variant="outline" className="min-h-9 px-3" aria-label={`View statement #${s.id}`} onClick={()=>onView(s.id)}>View</Button></div>
   </article>;
   return compact?<article key={s.id} className="grid min-w-0 w-full grid-cols-1 items-center gap-3 rounded-lg border bg-card px-6 py-3 [overflow-wrap:anywhere] sm:grid-cols-[minmax(0,1fr)_auto]">
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">{details.map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>
    <div className="flex justify-end"><Button variant="outline" className="min-h-9 px-3" aria-label={`View statement #${s.id}`} onClick={()=>onView(s.id)}>View</Button></div>
   </article>:<article key={s.id} className="panel min-w-0 w-full space-y-3 [overflow-wrap:anywhere]">
    <h3 className="font-semibold"><Link className="inline-flex min-h-11 items-center underline" to={`/accounts/${s.card_id}`}>{s.card_name}</Link></h3><p className="text-sm text-muted-foreground">{s.metadata.issuer} · {s.last4?`•••• ${s.last4}`:`Card #${s.card_id}`}</p>
    <dl className="grid gap-3 text-sm sm:grid-cols-2 md:grid-cols-4">{details.map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>
    <Button variant="outline" aria-label={`View statement #${s.id}`} onClick={()=>onView(s.id)}>View</Button>
   </article>;
  })}</div></section>)}
  <nav className="flex flex-wrap items-center gap-3" aria-label="Statement pagination"><p role="status">{data.total} statements · page {data.page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</p><Button variant="outline" disabled={data.page<=1} onClick={()=>onPage(data.page-1)}>Previous statements</Button><Button variant="outline" disabled={data.page*data.pageSize>=data.total} onClick={()=>onPage(data.page+1)}>Next statements</Button></nav>
 </section>;
}
