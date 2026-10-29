import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {api} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import type {StatementDashboard} from "@/lib/credit-card-statements";

export default function CreditCardImportHistory({account}:{account:string}){
 const [open,setOpen]=useState(true),[page,setPage]=useState(1);
 useEffect(()=>{setPage(1);},[account]);
 const query=useQuery({
  queryKey:["credit-card-statements","history",account,page],
  queryFn:()=>api<StatementDashboard>(`credit-card-statements?${account?`cards=${encodeURIComponent(account)}&`:""}page=${page}`),
  enabled:Boolean(account),
 });
 const data=query.data,items=data?.items??[];
 return <details open={open} className="min-w-0 border-t border-border pt-3 text-sm" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="cursor-pointer font-semibold py-1">Statement import history</summary>
  {!account?<p className="mt-2 text-xs text-muted-foreground">Choose an exact credit card above to view its statement history.</p>:query.isPending?<p role="status" className="mt-2 text-xs text-muted-foreground">Loading statement history…</p>:query.error?<p role="alert" className="mt-2 text-xs text-destructive">{query.error.message}</p>:!items.length?<p className="mt-2 text-xs text-muted-foreground">No statements imported for this card yet.</p>:<ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-border">
   {items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
    <div className="min-w-0 basis-full sm:flex-1">
     <p className="break-words font-medium text-sm leading-snug">{item.filename}</p>
     <p className="text-xs text-muted-foreground">{item.card_name} · Issue {item.statement_date} · Due {item.due_date} · {formatMoney(item.original_balance,item.currency)}{item.superseded_by?" · Superseded":""}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
     <Button variant="outline" size="sm" asChild><Link aria-label={`View statement #${item.id}`} to={`/statements?document=${item.id}`}>View</Link></Button>
     <a className="quiet inline-flex min-h-9 items-center text-xs underline" href={`/api/credit-card-statements/${item.id}/download`} download>Download original</a>
    </div>
   </li>)}
  </ul>}
  {Boolean(account&&data&&data.total>data.pageSize)&&<nav className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border" aria-label="Statement history pagination">
   <p role="status" className="text-xs text-muted-foreground">{data!.total} statements · page {data!.page} of {Math.max(1,Math.ceil(data!.total/data!.pageSize))}</p>
   <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</Button>
   <Button variant="outline" size="sm" disabled={page*data!.pageSize>=data!.total} onClick={()=>setPage(p=>p+1)}>Next</Button>
  </nav>}
 </details>;
}
