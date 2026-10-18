import TransactionDialog,{type TransactionRecord} from "@/components/TransactionDialog";
import TransactionFilters from "@/components/TransactionFilters";
import {normalizeTransactionFilters} from "@/lib/transaction-filters";
import AlertDialogContent from "@/components/WorkspaceAlertDialogContent";
import {AlertDialog,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter} from "@/components/ui/alert-dialog";
import DialogContent from "@/components/WorkspaceDialogContent";
import {useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {Dialog,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {api} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import {transactionType,transactionTypeLabel} from "@/lib/transactions";
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,CalendarClock,Wallet,SlidersHorizontal,Undo2,Trash2} from "lucide-react";
type Tx=TransactionRecord&{issued?:{id:number;account_id:number;filename:string;line_id:number}[];source?:string;imports?:{id:number;account_id:number;filename:string;raw:Record<string,string>}[];bill_linked:boolean;balance_impacts:{id:number;name:string;change:number}[];id:number;posted_date:string;kind:string;description:string;merchant:string;notes:string;amount:number;account_name:string;category_name:string;counter_account_name:string};
function TransactionTypeIcon({type}:{type:string}){
 const Icon=({income:ArrowDownLeft,expense:ArrowUpRight,installment:CalendarClock,transfer:ArrowLeftRight,refund:Undo2,opening:Wallet,adjustment:SlidersHorizontal}[type]??SlidersHorizontal);
 const color=({income:"text-[hsl(var(--success))]",expense:"text-destructive",installment:"text-[hsl(var(--warning))]",transfer:"text-[hsl(var(--chart-4))]",refund:"text-[hsl(var(--chart-2))]",opening:"text-[hsl(var(--chart-1))]",adjustment:"text-muted-foreground"}[type]??"text-muted-foreground");
 const label=transactionTypeLabel(type);
 return <span className={`inline-flex items-center ${color}`} title={label}><Icon size={18} aria-hidden/><span className="sr-only">{label}</span></span>;
}
export default function TransactionHistory({accountId,params,onParamsChange}:{accountId?:number;params:URLSearchParams;onParamsChange:(params:URLSearchParams,options?:{replace?:boolean})=>void}){
 const client=useQueryClient(),[editing,setEditing]=useState<Tx|null>(null),[deleting,setDeleting]=useState<Tx|null>(null),[error,setError]=useState(""),[status,setStatus]=useState(""),[selected,setSelected]=useState<Tx|null>(null);
 const navigate=useNavigate();
 const setParams=onParamsChange;
 const scoped=new URLSearchParams(params);if(accountId){scoped.set("account",String(accountId));if(!["month","start","end"].some(k=>scoped.has(k)))scoped.set("period","all");}
 const filters=normalizeTransactionFilters(scoped),normalizedParams=filters.toString(),rawParams=params.toString();
 useEffect(()=>{if(rawParams!==normalizedParams)setParams(new URLSearchParams(normalizedParams),{replace:true});},[rawParams,normalizedParams,setParams]);
const start=filters.get("start")??"",end=filters.get("end")??"",source=filters.get("source")??"",month=filters.get("month")??"",kind=filters.get("kind")??"",category=filters.get("category")??"",account=filters.get("account")??"",search=filters.get("search")??"",sort=filters.get("sort")??"newest",page=/^[1-9]\d*$/.test(filters.get("page")??"1")&&Number.isSafeInteger(Number(filters.get("page")??1))?Number(filters.get("page")??1):1,batch=filters.get("batch");

const qs=new URLSearchParams({page:String(page),sort});for(const key of ["start","end","source","month","kind","category","account","search","batch","legacy","importId"])if(filters.get(key))qs.set(key,filters.get(key)!);
 const query=useQuery({queryKey:["transactions",qs.toString()],queryFn:()=>api<{items:Tx[];total:number;pageSize:number}>(`transactions?${qs}`)}),accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string}[]>("accounts")}),categories=useQuery({queryKey:["categories"],queryFn:()=>api<{id:number;name:string}[]>("categories")});
 const deletion=useMutation({mutationFn:()=>api(`transactions/${deleting?.id}`,{method:"DELETE",body:JSON.stringify({version:deleting?.version})}),onSuccess:()=>{client.invalidateQueries();setDeleting(null);setSelected(null);setStatus("Transaction voided. Balances and reports updated.");document.getElementById("main")?.focus();},onError:(e:Error)=>setError(e.message)});
 function filter(key:string,value:string){const next=new URLSearchParams(filters);next.delete("id");next.set(key,value);setParams(next,{replace:true});}
 useEffect(()=>{if(query.data){const last=Math.max(1,Math.ceil(query.data.total/query.data.pageSize));if(page>last){const next=new URLSearchParams(params);next.set("page",String(last));setParams(next,{replace:true});}}},[query.data,page,params,setParams]);
 const reveal=useQuery({queryKey:["transaction",params.get("id"),accountId],queryFn:()=>api<Tx[]>(`transactions?id=${params.get("id")}${accountId?`&account=${accountId}`:""}`),enabled:Boolean(params.get("id"))});
 useEffect(()=>{if(reveal.data?.[0])setSelected(reveal.data[0]);else if(reveal.data)setSelected(null);},[reveal.data]);

return <>
<TransactionFilters lockedAccountId={accountId} params={filters} accounts={accounts.data??[]} categories={categories.data??[]} onChange={(next,replace=false)=>{if(accountId)next.set("account",String(accountId));setParams(next,{replace});}}/>
{status&&<p id="import-result" tabIndex={-1} role="status" className="mb-3">{status}</p>}{params.has("id")&&reveal.data&&!reveal.data.length&&<p role="status">Record deleted or unavailable</p>}{accounts.error||categories.error?<p role="alert" className="text-destructive">{(accounts.error??categories.error)?.message}</p>:null}{reveal.error&&<p role="alert" className="text-destructive">{reveal.error.message}</p>}{query.isPending?<p role="status">Loading transactions…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:!query.data.items.length?<div className="panel">{month||kind||category||account||search||start||end||source||batch||params.has("legacy")?"No transactions match these filters.":"No posted records yet. Set up an account and add a transaction."}</div>:<><div className="table-scroll records-table" role="region" aria-label="Transaction records, horizontally scrollable" tabIndex={0}><table><caption className="sr-only">Posted transactions</caption><thead><tr><th scope="col"><span className="sr-only">Type</span></th><th scope="col">Date</th><th scope="col">Merchant</th><th scope="col">Account</th><th scope="col">Amount</th><th scope="col">Source</th><th scope="col">Details</th></tr></thead><tbody>{query.data.items.map(t=><tr key={t.id}><td><TransactionTypeIcon type={transactionType(t)}/></td><td className="whitespace-nowrap">{t.posted_date}</td><td className="min-w-40">{t.merchant||"Not provided"}<span className="block break-words text-sm text-muted-foreground">{t.category_name??(["expense","income","refund"].includes(t.kind)?"Uncategorized":"Not applicable")}{t.description&&<> ㆍ {t.description}</>}</span></td><td>{t.account_name}</td><td className="amount font-semibold">{t.kind==="expense"||t.kind==="transfer"&&t.counter_account_id!==accountId?"−":"+"}{formatMoney(t.amount)}<span className="block text-sm text-muted-foreground">PHP</span></td><td>{t.source??"manual"}</td><td><Button variant="outline" className="min-h-11" aria-label={`View ${t.merchant||t.description||transactionTypeLabel(transactionType(t))} on ${t.posted_date}`} onClick={()=>setSelected(t)}>View</Button></td></tr>)}</tbody></table></div><ul className="record-list records-list rounded-lg border bg-card" aria-label="Posted transactions">{query.data.items.map(t=><li key={t.id}><div className="record-line"><div><button className="record-title" aria-label={`View ${t.merchant||t.description||transactionTypeLabel(transactionType(t))} on ${t.posted_date}`} onClick={()=>setSelected(t)}>{t.merchant||t.description||transactionTypeLabel(transactionType(t))}</button><p className="break-words text-sm text-muted-foreground">{t.category_name??(["expense","income","refund"].includes(t.kind)?"Uncategorized":"Not applicable")}{t.description&&<> ㆍ {t.description}</>}</p></div><span className="record-amount">{t.kind==="expense"||t.kind==="transfer"&&t.counter_account_id!==accountId?"−":"+"}{formatMoney(t.amount)}<span className="block text-xs font-normal text-muted-foreground">PHP</span></span></div><div className="record-meta"><TransactionTypeIcon type={transactionType(t)}/><span>{t.posted_date}</span><span>{t.account_name}</span><span>{t.source??"manual"}</span></div></li>)}</ul><nav aria-label="Transaction pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status">{query.data.total} records · page {page} of {Math.ceil(query.data.total/query.data.pageSize)}</p><div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={page===1} onClick={()=>filter("page",String(page-1))}>Previous</Button><Button variant="outline" className="min-h-11" disabled={page*query.data.pageSize>=query.data.total} onClick={()=>filter("page",String(page+1))}>Next</Button></div></nav></>}
<Dialog open={Boolean(selected)} onOpenChange={v=>{if(!v)setSelected(null);}}>
 <DialogContent className="transaction-details-dialog" aria-describedby={undefined}>
  <DialogHeader>
   <DialogTitle className="text-xl leading-snug">{selected&&(selected.merchant||selected.description||transactionTypeLabel(transactionType(selected)))}</DialogTitle>
  </DialogHeader>
  {selected&&<div className="space-y-5">
   <section aria-label="Transaction amount" className="rounded-lg border bg-secondary p-4 sm:p-5">
    <p className="text-3xl font-semibold tabular-nums">{formatMoney(selected.amount)}</p>
    <p className="mt-3 flex items-center gap-2 text-sm font-medium"><TransactionTypeIcon type={transactionType(selected)}/>{transactionTypeLabel(transactionType(selected))}</p>
   </section>
   <section aria-labelledby="transaction-breakdown-heading">
    <h3 id="transaction-breakdown-heading" className="mb-3 text-base font-semibold">Amount breakdown</h3>
    <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 sm:p-5 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:font-medium [&_dd]:tabular-nums">
     <div><dt>Original total · {selected.original_currency}</dt><dd>{formatMoney(selected.original_amount,selected.original_currency)}</dd></div>
     <div><dt>Subtotal</dt><dd>{formatMoney(selected.original_amount-selected.included_fee,selected.original_currency)}</dd></div>
     <div><dt>Included fee</dt><dd>{formatMoney(selected.included_fee,selected.original_currency)}</dd></div>
    </dl>
   </section>
   <section aria-labelledby="transaction-information-heading">
    <h3 id="transaction-information-heading" className="mb-3 text-base font-semibold">Transaction details</h3>
    <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 sm:p-5 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:font-medium">
     <div><dt>Account</dt><dd>{selected.account_name}{selected.counter_account_name?` → ${selected.counter_account_name}`:""}</dd></div>
     <div><dt>Category</dt><dd>{selected.category_name??(["expense","income","refund"].includes(selected.kind)?"Uncategorized":"Not applicable")}</dd></div>
     <div className="sm:col-span-2"><dt>Merchant</dt><dd>{selected.merchant||"Not provided"}</dd></div>
     <div className="sm:col-span-2"><dt>Description</dt><dd className="whitespace-pre-wrap">{selected.description||"Not provided"}</dd></div>
     <div className="border-t pt-4 sm:col-span-2"><dt>Notes</dt><dd className="whitespace-pre-wrap">{selected.notes||"No notes"}</dd></div>
    </dl>
   </section>
   {selected.issued?.map(s=><Button key={s.line_id} variant="outline" onClick={()=>navigate(`/statements?document=${s.id}`)}>Statement #{s.id} · source row #{s.line_id} · {s.filename}</Button>)}
   {selected.imports?.length?<details className="rounded-lg border p-4 sm:p-5">
    <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-sm font-semibold">Import sources ({selected.imports.length})</summary>
    {selected.imports.map((item,index)=><div className="mt-3 min-w-0 border-t pt-3" key={`${item.id}-${index}`}>
     <Button variant="outline" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>navigate(`/import-export?tab=history&batch=${item.id}&account=${item.account_id}`)}>{item.filename}</Button>
     <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-relaxed">{JSON.stringify(item.raw,null,2)}</pre>
    </div>)}
   </details>:null}
  </div>}
  <div className="dialog-actions"><Button onClick={()=>{setEditing(selected);setSelected(null);}}>Edit transaction</Button><Button variant="destructive" size="icon" className="size-11" aria-label="Delete transaction" title="Delete transaction" onClick={()=>{setDeleting(selected);setSelected(null);setError("");}}><Trash2 size={18} aria-hidden/></Button></div>
 </DialogContent>
</Dialog>
<TransactionDialog open={Boolean(editing)} transaction={editing??undefined} onOpenChange={v=>{if(!v){setEditing(null);document.getElementById("main")?.focus();}}} onSaved={()=>setStatus("Transaction corrected. Previous history retained; balances and reports updated.")}/><AlertDialog open={Boolean(deleting)} onOpenChange={v=>{if(!v&&!deletion.isPending)setDeleting(null);}}><AlertDialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={e=>{e.preventDefault();document.getElementById("main")?.focus();}} onEscapeKeyDown={e=>{if(deletion.isPending)e.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>Delete transaction #{deleting?.id}</AlertDialogTitle><AlertDialogDescription>This voids the transaction. Ledger and audit history remain retained. Affected balances change by the amounts below. Imported source references stay reserved, preventing accidental re-import.</AlertDialogDescription></AlertDialogHeader>{deleting?.kind==="opening"&&<p>This removes an opening balance from active history and changes all later historical balances.</p>}{deleting?.bill_linked&&<p>This payment is linked to a bill. The reminder becomes unpaid and can be paid again.</p>}<ul>{deleting?.balance_impacts.map(a=><li key={a.id} className="break-words">{a.name}: {formatMoney(a.change)}</li>)}</ul>{error&&<p role="alert" className="text-destructive">{error}</p>}<AlertDialogFooter className="dialog-actions"><Button data-dialog-cancel variant="outline" disabled={deletion.isPending} onClick={()=>setDeleting(null)}>Cancel deletion</Button><Button variant="destructive" disabled={deletion.isPending} aria-busy={deletion.isPending} onClick={()=>deletion.mutate()}>{deletion.isPending?"Voiding…":"Delete transaction"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
