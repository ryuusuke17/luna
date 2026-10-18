import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {api} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import {statusLabel,type StatementDashboard} from "@/lib/credit-card-statements";

export default function CreditCardImportHistory({account}:{account?:string}){
 const [open,setOpen]=useState(true),[page,setPage]=useState(1);
 useEffect(()=>{setPage(1);},[account]);
 const query=useQuery({
  queryKey:["credit-card-statements","history",account,page],
  queryFn:()=>api<StatementDashboard>(`credit-card-statements?${account?`cards=${encodeURIComponent(account)}&`:""}page=${page}`),
 });
 const data=query.data,items=data?.items??[];
 return <details open={open} className="panel mb-5 min-w-0" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="min-h-11 cursor-pointer font-semibold">Credit card statement imports</summary>
  {query.isPending?<p role="status" className="mt-3">Loading credit card statements…</p>:query.error?<p role="alert" className="mt-3 text-destructive">{query.error.message}</p>:!items.length?<p className="mt-3">No credit card statements uploaded for this account yet.</p>:<ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-border">
   {items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
    <div className="min-w-0 basis-full sm:flex-1">
     <p className="break-words font-medium">{item.filename}</p>
     <p className="text-sm text-muted-foreground">{item.card_name} · Issue {item.statement_date} · Due {item.due_date} · {formatMoney(item.original_balance,item.currency)} · {statusLabel(item.status)}{item.superseded_by?" · Superseded":""}</p>
    </div>
    <div className="flex flex-wrap gap-3">
     <Button variant="outline" asChild><Link to={`/statements?document=${item.id}`}>View statement #{item.id}</Link></Button>
     <a className="quiet inline-flex min-h-11 items-center underline" href={`/api/credit-card-statements/${item.id}/download`} download>Download original</a>
    </div>
   </li>)}
  </ul>}
  {Boolean(data&&data.total>data.pageSize)&&<nav className="mt-4 flex flex-wrap items-center gap-3" aria-label="Credit card statement pagination">
   <p role="status" className="text-xs text-muted-foreground">{data!.total} statements · page {data!.page} of {Math.max(1,Math.ceil(data!.total/data!.pageSize))}</p>
   <Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous statements</Button>
   <Button variant="outline" disabled={page*data!.pageSize>=data!.total} onClick={()=>setPage(p=>p+1)}>Next statements</Button>
  </nav>}
 </details>;
}
