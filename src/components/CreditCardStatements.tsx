import {Link} from "react-router-dom";
import {Button} from "@/components/WorkspaceButton";
import {formatMoney} from "@/lib/finance";
import {statusLabel,type StatementDashboard} from "@/lib/credit-card-statements";
import {statementMonthLabel} from "@/lib/credit-card-dashboard";

export default function CreditCardStatements({data,onOpen,onPage}:{data:Pick<StatementDashboard,"items"|"total"|"page"|"pageSize">;onOpen:(id:number)=>void;onPage:(page:number)=>void}){
 const months=[...new Set(data.items.map(s=>s.statement_date.slice(0,7)))];
 return <section className="space-y-4" aria-label="Issued statements">
  {!data.items.length&&<p className="panel">No issued statements match this selection. Clear filters or visit Import & Export; missing balances are unknown, not zero.</p>}
  {months.map(month=><section key={month} className="space-y-3" aria-label={statementMonthLabel(month)}><h2>{statementMonthLabel(month)}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.items.filter(s=>s.statement_date.startsWith(month)).map(s=><article key={s.id} className="panel min-w-0 space-y-3 [overflow-wrap:anywhere]">
   <h3 className="font-semibold"><Link className="inline-flex min-h-11 items-center underline" to={`/accounts/${s.card_id}`}>{s.card_name}</Link></h3><p className="text-sm text-muted-foreground">{s.metadata.issuer} · {s.last4?`•••• ${s.last4}`:`Card #${s.card_id}`}</p>
   <dl className="grid gap-3 text-sm sm:grid-cols-2">{[["Issue date",s.statement_date],["Due date",s.due_date],["Original balance",formatMoney(s.original_balance,s.currency)],["Minimum due",formatMoney(s.minimum_due,s.currency)]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>
   <p className="text-sm">{statusLabel(s.status)}</p><p className="text-xs text-muted-foreground">Payment tracker evidence; not bank verification or current ledger debt.</p><Button variant="outline" onClick={()=>onOpen(s.id)}>View statement #{s.id}</Button>
  </article>)}</div></section>)}
  <nav className="flex flex-wrap items-center gap-3" aria-label="Statement pagination"><p role="status">{data.total} statements · page {data.page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</p><Button variant="outline" disabled={data.page<=1} onClick={()=>onPage(data.page-1)}>Previous statements</Button><Button variant="outline" disabled={data.page*data.pageSize>=data.total} onClick={()=>onPage(data.page+1)}>Next statements</Button></nav>
 </section>;
}
