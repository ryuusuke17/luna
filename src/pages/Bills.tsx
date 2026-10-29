import DialogContent from "@/components/WorkspaceDialogContent";
import {usePageAction} from "@/components/PageAction";
import {CarFront,Check,CreditCard,Eye,HeartPulse,House,Receipt,ShoppingBasket,Wifi,Zap} from "lucide-react";
import {useEffect,useRef,useState} from "react";
import {Link,useSearchParams} from "react-router-dom";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Dialog,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/WorkspaceButton";
import MonthControl from "@/components/MonthControl";
import {api,send} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import {decimalMoney} from "@/lib/csv";
import {currentMonth,transactionDateLabel} from "@/lib/transaction-filters";
type Bill={id:number;name:string;amount:number;due_date:string;account_id:number|null;category_id:number|null;cadence:string;notes:string;account_name:string|null;category_name:string|null;transaction_id:number|null;payment_date:string;payment_voided:string|null;payment_kind:string};
function BillKindIcon({bill}:{bill:Bill}){
 const text=`${bill.name} ${bill.category_name??""}`.toLocaleLowerCase();
 const Icon=bill.payment_kind==="credit_repayment"?CreditCard:/\b(phone|mobile|internet|wifi|broadband)\b/.test(text)?Wifi:/\b(electric|electricity|utility|utilities|water|power|gas)\b/.test(text)?Zap:/\b(home|housing|rent|mortgage)\b/.test(text)?House:/\b(health|medical|doctor|pharmacy)\b/.test(text)?HeartPulse:/\b(transport|transportation|car|vehicle|fuel)\b/.test(text)?CarFront:/\b(grocery|groceries|food)\b/.test(text)?ShoppingBasket:Receipt;
 return <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground" aria-hidden="true"><Icon size={20} strokeWidth={1.75}/></span>;
}
export default function Bills(){
 const client=useQueryClient(),[params]=useSearchParams(),[month,setMonth]=useState(currentMonth),[view,setView]=useState("upcoming"),[edit,setEdit]=useState<Bill|null|undefined>(),[selected,setSelected]=useState<Bill|null>(null),[pay,setPay]=useState<Bill|null>(null),[paymentAccountId,setPaymentAccountId]=useState(""),[fundingAccountId,setFundingAccountId]=useState(""),[paymentKind,setPaymentKind]=useState("expense"),[error,setError]=useState("");
 const bills=useQuery({queryKey:["bills"],queryFn:()=>api<Bill[]>("bills")}),accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string;type:string}[]>("accounts")}),cats=useQuery({queryKey:["categories"],queryFn:()=>api<{id:number;name:string;kind:string}[]>("categories")});
 const funding=accounts.data?.filter(a=>["cash","bank","wallet"].includes(a.type))??[];
 const mutation=useMutation({mutationFn:({path,body}:{path:string;body:unknown})=>send(path,body),onSuccess:()=>{client.invalidateQueries();setEdit(undefined);setPay(null);setSelected(null);setPaymentAccountId("");setFundingAccountId("");setError("");},onError:(e:Error)=>setError(e.message)});
 useEffect(()=>{if(params.get("id")&&bills.data){setSelected(bills.data.find(b=>String(b.id)===params.get("id"))??null);}},[params,bills.data]);
 const today=new Date().toISOString().slice(0,10),allRows=bills.data??[],rows=allRows.filter(b=>b.due_date.startsWith(`${month}-`)),monthLabel=transactionDateLabel(new URLSearchParams({month})),unpaid=rows.filter(b=>!b.transaction_id),visible=rows.filter(b=>view==="paid"?Boolean(b.transaction_id):view==="recurring"?b.cadence!=="once"&&!b.transaction_id:view==="overdue"?!b.transaction_id&&b.due_date<today:!b.transaction_id&&b.due_date>=today),credit=paymentKind==="credit_repayment",availableCats=cats.data?.filter(c=>c.kind==="expense")??[],creditCards=accounts.data?.filter(a=>a.type==="credit_card")??[];
 function startEdit(b:Bill|null){setPaymentKind(b?.payment_kind??"expense");setError("");setSelected(null);setEdit(b);}
 function startPayment(b:Bill){const suggested=accounts.data?.find(a=>String(a.id)===String(b.account_id));setPaymentAccountId(suggested&&(b.payment_kind!=="credit_repayment"||suggested.type==="credit_card")?String(suggested.id):"");setFundingAccountId("");setError("");setSelected(null);setPay(b);}
 function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(mutation.isPending)return;const f=new FormData(e.currentTarget);mutation.mutate({path:"bills",body:{id:edit?.id,name:f.get("name"),amount:f.get("amount"),dueDate:f.get("due"),paymentKind,categoryId:credit?undefined:Number(f.get("category")),cadence:f.get("cadence"),notes:f.get("notes")}});}
 function payment(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(mutation.isPending)return;const f=new FormData(e.currentTarget);mutation.mutate({path:"bill-payments",body:{billId:pay?.id,date:f.get("date"),accountId:Number(f.get("account"))||undefined,fundingAccountId:Number(f.get("funding"))||undefined}});}
 usePageAction("Add bill reminder",()=>startEdit(null));
 return <><header className="page-heading"><div><h1>Bills</h1><p className="mt-2 text-muted-foreground">Reminder records. No automatic payments or recurrence generation.</p></div><MonthControl month={month} onChange={setMonth}/></header>
 <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`Bills due in ${monthLabel}`}>{[["Unpaid commitments",formatMoney(unpaid.reduce((n,b)=>n+b.amount,0))],["Overdue reminders",String(unpaid.filter(b=>b.due_date<today).length)],["Paid reminders",String(rows.length-unpaid.length)]].map(([label,value])=><article className="panel" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="metric">{bills.isPending||bills.error?"—":value}</p></article>)}</section>
 <Tabs value={view} onValueChange={setView}><TabsList className="mb-5 h-auto flex-wrap justify-start gap-1">{["upcoming","overdue","recurring","paid"].map(t=><TabsTrigger className="min-h-11 capitalize" value={t} key={t}>{t}</TabsTrigger>)}</TabsList><TabsContent value={view}>{bills.isPending?<p role="status">Loading bills…</p>:bills.error?<p role="alert" className="text-destructive">{bills.error.message}</p>:!visible.length?<div className="panel" role="status">{allRows.length?`No ${view} reminders in ${monthLabel}.`:"No bill reminders yet. Add a planning record to begin."}</div>:<div className="space-y-5">{[...new Set(visible.map(b=>b.due_date))].map(date=><section key={date}><h2 className="mb-3">{new Date(`${date}T12:00:00`).toLocaleDateString("en-PH",{dateStyle:"full"})}</h2><ul className="record-list rounded-lg border bg-card">{visible.filter(b=>b.due_date===date).map(b=><li key={b.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-4 sm:flex-nowrap"><div className="flex min-w-0 flex-1 items-center gap-4"><BillKindIcon bill={b}/><div className="min-w-0"><h3 className="text-base font-semibold leading-tight">{b.name}</h3><p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-sm text-muted-foreground">{b.account_name&&<><span>{b.account_name}</span><span aria-hidden="true">·</span></>}<span>{b.category_name??"Credit repayment"}</span></p></div></div><div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-nowrap sm:justify-end"><strong className="whitespace-nowrap text-xl font-semibold tabular-nums">{formatMoney(b.amount)}</strong><div className="flex shrink-0 items-center gap-2" role="group" aria-label={"Bill controls for " + b.name}>
 <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={"View details for " + b.name} title="View details" onClick={()=>setSelected(b)}><Eye size={18} aria-hidden="true"/></Button>
 {b.transaction_id
  ? <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 font-semibold text-success" role="status" aria-label={"Paid: " + b.name}><Check size={18} aria-hidden="true"/>Paid</span>
  : <Button variant="outline" className="min-h-11 shrink-0 gap-2 whitespace-nowrap px-3" aria-label={"Mark " + b.name + " as paid"} onClick={()=>startPayment(b)}>Mark as paid</Button>}
</div></div></li>)}</ul></section>)}</div>}</TabsContent></Tabs>
 {params.has("id")&&bills.data&&!selected&&edit===undefined&&!pay&&!allRows.some(b=>String(b.id)===params.get("id"))&&<p role="status">Record deleted or unavailable</p>}
 <Dialog open={edit!==undefined} onOpenChange={v=>{if(!v&&!mutation.isPending)setEdit(undefined);}}><DialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={e=>{if(mutation.isPending)e.preventDefault();}} onPointerDownOutside={e=>{if(mutation.isPending)e.preventDefault();}}><DialogHeader><DialogTitle>{edit?"Edit":"Add"} bill reminder</DialogTitle><DialogDescription>Cadence is a reminder preference. No future bills are generated.</DialogDescription></DialogHeader><form onSubmit={save} aria-busy={mutation.isPending} className="grid gap-3"><fieldset disabled={mutation.isPending} className="grid gap-3 sm:grid-cols-2"><label>Name<input className="field" name="name" required maxLength={80} defaultValue={edit?.name}/></label><label>Full amount · PHP<input className="field" name="amount" required inputMode="decimal" defaultValue={edit?decimalMoney(edit.amount):""} aria-invalid={Boolean(error)} aria-describedby={error?"bill-error":undefined}/></label><label>Due date<input className="field" name="due" type="date" required defaultValue={edit?.due_date??today}/></label><label>Payment type<select className="field" value={paymentKind} onChange={e=>setPaymentKind(e.target.value)}><option value="expense">Ordinary expense</option><option value="credit_repayment">Credit-card repayment</option></select></label>{!credit&&<label>Expense category<select className="field" name="category" required defaultValue={edit?.category_id??""}><option value="">Choose category</option>{availableCats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label>Cadence · reminder preference<select className="field" name="cadence" defaultValue={edit?.cadence??"once"}>{["once","monthly","quarterly","yearly"].map(c=><option key={c} value={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}</select></label><label className="sm:col-span-2">Notes<input className="field" name="notes" maxLength={240} defaultValue={edit?.notes}/></label></fieldset>{cats.error?<p role="alert">{cats.error.message}</p>:null}{(!credit&&!availableCats.length)&&<p>Set up <Link to="/settings" className="underline" onClick={()=>setEdit(undefined)}>categories</Link>.</p>}{error&&<p role="alert" id="bill-error" className="text-destructive">{error}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setEdit(undefined)}>Cancel</Button><Button disabled={mutation.isPending||!credit&&!availableCats.length} aria-busy={mutation.isPending}>{mutation.isPending?"Saving…":"Save reminder"}</Button></div></form></DialogContent></Dialog>
  <Dialog open={Boolean(selected)} onOpenChange={v=>{if(!v)setSelected(null);}}>
   <DialogContent className="bill-details-dialog">
    <DialogHeader>
     <DialogTitle className="text-xl leading-snug">{selected?.name}</DialogTitle>
     <DialogDescription>Bill reminder details</DialogDescription>
    </DialogHeader>
    {selected&&<>
     <div className="space-y-5">
      <section aria-label="Bill amount" className="rounded-lg border bg-secondary p-4 sm:p-5">
       <p className="text-sm text-muted-foreground">Full amount · PHP</p>
       <p className="mt-1 text-3xl font-semibold tabular-nums">{formatMoney(selected.amount)}</p>
      </section>
      <dl className="grid min-w-0 grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 sm:p-5 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:font-medium">
       <div><dt>Due date</dt><dd>{selected.due_date}</dd></div>
       <div><dt>Account</dt><dd>{selected.account_name??"Choose when paid"}</dd></div>
       <div><dt>Reminder preference</dt><dd>{selected.cadence[0].toUpperCase()+selected.cadence.slice(1)}</dd></div>
       <div><dt>Category</dt><dd>{selected.category_name??"Credit repayment"}</dd></div>
       <div className="sm:col-span-2"><dt>Notes</dt><dd className="whitespace-pre-wrap">{selected.notes||"No notes."}</dd></div>
      </dl>
     </div>
     {selected.transaction_id
      ?<div className="dialog-actions"><Link className="quiet" to={`/transactions?id=${selected.transaction_id}`} onClick={()=>setSelected(null)}>View linked payment</Link></div>
      :<div className="dialog-actions"><Button variant="outline" onClick={()=>startEdit(selected)}>Edit reminder</Button><Button onClick={()=>startPayment(selected)}>Mark as paid</Button></div>}
    </>}
   </DialogContent>
  </Dialog>
 <Dialog open={Boolean(pay)} onOpenChange={v=>{if(!v&&!mutation.isPending)setPay(null);}}>
  <DialogContent onEscapeKeyDown={e=>{if(mutation.isPending)e.preventDefault();}} onPointerDownOutside={e=>{if(mutation.isPending)e.preventDefault();}}>
   <DialogHeader><DialogTitle>Mark bill as paid</DialogTitle><DialogDescription>Record the full payment in your ledger. No money is sent.</DialogDescription></DialogHeader>
   {pay&&<form onSubmit={payment} aria-busy={mutation.isPending} className="grid gap-3">
    <p>{pay.name} · {formatMoney(pay.amount)}{pay.account_name&&<> · {pay.account_name}</>}</p>
    <fieldset disabled={mutation.isPending} className="grid gap-3 sm:grid-cols-2">
     <label>Posted payment date<input className="field" name="date" type="date" required max={today} defaultValue={today} aria-invalid={Boolean(error)} aria-describedby={error?"payment-error":undefined}/></label>
     {pay.payment_kind==="credit_repayment"
      ?<>
       <label>Credit card account<select className="field" required name="account" value={paymentAccountId} onChange={e=>setPaymentAccountId(e.target.value)} disabled={accounts.isPending||Boolean(accounts.error)||!creditCards.length}><option value="">Choose credit card</option>{creditCards.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
       <label>Funding account<select className="field" required name="funding" value={fundingAccountId} onChange={e=>setFundingAccountId(e.target.value)} disabled={accounts.isPending||Boolean(accounts.error)||!funding.length}><option value="">Choose cash, bank, or wallet</option>{funding.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </>
      :<label>Account<select className="field" required name="account" value={paymentAccountId} onChange={e=>setPaymentAccountId(e.target.value)} disabled={accounts.isPending||Boolean(accounts.error)||!accounts.data?.length}><option value="">Choose account</option>{accounts.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
    </fieldset>
    {accounts.isPending?<p role="status">Loading accounts…</p>:accounts.error?<p role="alert" className="text-destructive">{accounts.error.message}</p>:pay.payment_kind==="credit_repayment"&&!creditCards.length?<p>Create a credit card <Link className="underline" to="/accounts" onClick={()=>setPay(null)}>account</Link> before recording repayment.</p>:pay.payment_kind==="credit_repayment"&&!funding.length?<p>Create a cash, bank, or wallet <Link className="underline" to="/accounts" onClick={()=>setPay(null)}>funding account</Link> before recording repayment.</p>:pay.payment_kind!=="credit_repayment"&&!accounts.data?.length?<p>Create an <Link className="underline" to="/accounts" onClick={()=>setPay(null)}>account</Link> before recording payment.</p>:null}
    <p className="text-sm text-muted-foreground">One ledger expense, or a transfer for credit repayment. Partial payment is unavailable.</p>
    {error&&<p role="alert" id="payment-error" className="text-destructive">{error}</p>}
    <div className="dialog-actions"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setPay(null)}>Cancel</Button><Button disabled={mutation.isPending||accounts.isPending||Boolean(accounts.error)||!paymentAccountId||pay.payment_kind==="credit_repayment"&&(!funding.length||!fundingAccountId)} aria-busy={mutation.isPending}>{mutation.isPending?"Recording…":"Mark as paid"}</Button></div>
   </form>}
  </DialogContent>
 </Dialog></>;
}
