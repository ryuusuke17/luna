import {useEffect,useId,useRef,useState} from "react";
import {Link} from "react-router-dom";
import {Button} from "@/components/WorkspaceButton";
import TransactionDetailsDialog from "@/components/TransactionDetailsDialog";
import TransactionTypeIcon from "@/components/TransactionTypeIcon";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {formatMoney} from "@/lib/finance";
import {statementMonthLabel,type CreditDashboard} from "@/lib/credit-card-dashboard";
import type {StatementDashboard} from "@/lib/credit-card-statements";

function activityIconType(displayType:string){
 const type=displayType.trim().toLowerCase();
 if(type.includes("install"))return "installment";
 if(type.includes("repayment")||type==="payment")return "income";
 if(type.includes("refund"))return "refund";
 if(type.includes("transfer"))return "transfer";
 if(type.includes("income"))return "income";
 if(type.includes("expense")||type.includes("charge"))return "expense";
 return type;
}

type Props={activity?:CreditDashboard["activity"];accountScoped?:boolean;emptyStatementMonth?:boolean;params:URLSearchParams;onFilter:(key:string,value:string)=>void;onOpen?:(id:number)=>void};
type ActivityFilterProps={categories?:string[];params:URLSearchParams;onFilter:(key:string,value:string)=>void;onApply:(params:URLSearchParams)=>void};
type GlobalFilterProps={cards:CreditDashboard["allCards"];months:string[];statements:StatementDashboard["items"];hasMoreStatements:boolean;loadingMoreStatements:boolean;onLoadMoreStatements:()=>void;params:URLSearchParams;categories:string[];onFilter:(key:string,value:string)=>void;onApply:(params:URLSearchParams)=>void};

export function CreditCardActivityFilters({categories=[],params,onFilter,onApply}:ActivityFilterProps){
 const searchId=useId();
 const filtersRef=useRef<HTMLDetailsElement>(null);
 const [draft,setDraft]=useState(()=>new URLSearchParams(params));
 const [filtersOpen,setFiltersOpen]=useState(false);
 useEffect(()=>{
  if(!filtersOpen)return;
  const closeOnOutsidePointer=(event:PointerEvent)=>{if(event.target&&!filtersRef.current?.contains(event.target as Node))setFiltersOpen(false);};
  document.addEventListener("pointerdown",closeOnOutsidePointer);
  return ()=>document.removeEventListener("pointerdown",closeOnOutsidePointer);
 },[filtersOpen]);
 const dateKeys=["statement","statement-month"].includes(params.get("dateMode")??"")?["lineStart","lineEnd"]:["start","end"];
 const activeFilters=["lineType","category",...dateKeys].filter(key=>params.has(key)).length+Number(Boolean(params.get("lineSort")&&params.get("lineSort")!=="source"));
 const changeDraft=(key:string,value:string)=>setDraft(current=>{const next=new URLSearchParams(current);if(value)next.set(key,value);else next.delete(key);return next;});
 const reset=()=>{const next=new URLSearchParams(params);for(const key of ["lineType","category","lineSort","lineStart","lineEnd","start","end","lineAmount","lineCurrency"])next.delete(key);setDraft(next);onApply(next);};
 return <div className="flex min-w-0 flex-[1_1_15rem] items-end gap-2" aria-label="Activity filters">
  <label htmlFor={searchId} className="sr-only">Merchant / notes</label><input id={searchId} className="field min-w-0 flex-1" type="search" maxLength={200} placeholder="Merchant / notes" value={params.get("lineSearch")??""} onChange={e=>onFilter("lineSearch",e.target.value)}/>
  <details ref={filtersRef} open={filtersOpen} className="relative shrink-0" onToggle={event=>{const open=event.currentTarget.open;setFiltersOpen(open);if(open)setDraft(new URLSearchParams(params));}}>
   <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border bg-card px-3 text-sm">Filters{activeFilters?` · ${activeFilters}`:""}</summary>
   <div className="mt-2 grid w-[min(44rem,calc(100vw-3rem))] max-w-[calc(100vw-2rem)] gap-3 rounded-lg border bg-card p-3 shadow-md sm:absolute sm:right-0 sm:top-full sm:z-20 sm:grid-cols-2 lg:grid-cols-3">
    <label>Line type<select className="field" value={draft.get("lineType")??""} onChange={e=>changeDraft("lineType",e.target.value)}><option value="">All types</option><option value="charge">Charges</option><option value="payment">Payment candidates</option><option value="credit">All credits</option><option value="installment">Installments</option><option value="other">Other</option></select></label>
    <label>Category<select className="field" value={draft.get("category")??""} onChange={e=>changeDraft("category",e.target.value)}><option value="">All categories</option>{draft.get("category")&&!categories.includes(draft.get("category")!)&&<option>{draft.get("category")}</option>}{categories.map(category=><option key={category}>{category}</option>)}</select></label>
    <label>Sort lines<select className="field" value={draft.get("lineSort")??"source"} onChange={e=>changeDraft("lineSort",e.target.value)}><option value="source">Source order</option><option value="sale">Sale date</option><option value="post">Post date</option><option value="amount">Signed amount · highest first</option><option value="merchant">Merchant</option></select></label>
    {dateKeys.map((name,index)=><label key={name}>{index===0?"Post date from":"Post date to"}<input className="field" type="date" value={draft.get(name)??""} onChange={e=>changeDraft(name,e.target.value)}/></label>)}
    <div className="col-span-full flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={reset}>Reset</Button><Button type="button" onClick={()=>{onApply(draft);setFiltersOpen(false);}}>Apply</Button></div>
   </div>
  </details>
 </div>;
}

export function CreditCardDashboardFilters({cards,months,statements,hasMoreStatements,loadingMoreStatements,onLoadMoreStatements,params,categories,onFilter,onApply}:GlobalFilterProps){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(()=>new URLSearchParams(params)),descId=useId();
 const activeCount=["lineAmount","lineCurrency","lineType","category","start","end","lineSort"].filter(key=>params.has(key)&&!(key==="lineSort"&&params.get(key)==="source")).length;
 const updateDraft=(key:string,value:string)=>setDraft(current=>{const next=new URLSearchParams(current);if(value)next.set(key,value);else next.delete(key);return next;});
 const reset=()=>{const next=new URLSearchParams(params);for(const key of ["lineAmount","lineCurrency","lineType","category","start","end","lineSort","linePage"])next.delete(key);setDraft(next);onApply(next);setOpen(false);};
 const selectedStatement=params.get("activityStatement")??"",statementKnown=statements.some(statement=>String(statement.id)===selectedStatement);
 return <section className="rounded-xl border bg-card p-3 shadow-sm" aria-label="Activity filters">
  <div className="flex min-w-0 flex-wrap items-end gap-2.5">
   <label className="min-w-36 flex-[1_1_9rem]"><span className="sr-only">Issue month</span><select className="field" aria-label="Issue month" value={params.get("activityMonth")??""} onChange={event=>onFilter("activityMonth",event.target.value)}><option value="">All issue months</option>{params.get("activityMonth")&&!months.includes(params.get("activityMonth")!)&&<option value={params.get("activityMonth")!}>{statementMonthLabel(params.get("activityMonth")!)}</option>}{months.map(month=><option key={month} value={month}>{statementMonthLabel(month)}</option>)}</select></label>
   <label className="min-w-44 flex-[1_1_12rem]"><span className="sr-only">Credit card account</span><select className="field" aria-label="Credit card account" value={params.get("activityCard")??""} onChange={event=>onFilter("activityCard",event.target.value)}><option value="">All cards</option>{cards.map(card=><option key={card.id} value={card.id}>{card.name}{card.last4?` · •••• ${card.last4}`:""}</option>)}</select></label>
   <label className="min-w-52 flex-[1.5_1_16rem]"><span className="sr-only">Statement</span><select className="field" aria-label="Statement" value={selectedStatement} onChange={event=>{if(event.target.value==="__load_older__"){onLoadMoreStatements();return;}onFilter("activityStatement",event.target.value);}}><option value="">All statements</option>{selectedStatement&&!statementKnown&&<option value={selectedStatement}>Loading selected statement (#{selectedStatement})</option>}{statements.map(statement=><option key={statement.id} value={statement.id}>{statement.card_name} · {statement.statement_date} · #{statement.id}</option>)}{hasMoreStatements&&<option value="__load_older__">{loadingMoreStatements?"Loading older statements…":"Load older statements…"}</option>}</select></label>
   <label className="min-w-44 flex-[2_1_18rem]"><span className="sr-only">Merchant / notes</span><input className="field" aria-label="Merchant / notes" type="search" maxLength={200} placeholder="Merchant / notes" value={params.get("lineSearch")??""} onChange={event=>onFilter("lineSearch",event.target.value)}/></label>
   <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)setDraft(new URLSearchParams(params));}}>
    <PopoverTrigger asChild><Button variant="outline" className="shrink-0" aria-label="More activity filters">Filters{activeCount?` · ${activeCount}`:""}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(42rem,calc(100vw-2rem))] p-3 sm:p-4" aria-label="Activity line filters" aria-describedby={descId}>
     <p id={descId} className="sr-only">Filter statement lines by type, category and post date.</p>
     <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label>Line type<select className="field" value={draft.get("lineType")??""} onChange={event=>updateDraft("lineType",event.target.value)}><option value="">All types</option><option value="charge">Charges</option><option value="payment">Payment candidates</option><option value="credit">All credits</option><option value="installment">Installments</option><option value="other">Other</option></select></label>
      <label>Category<select className="field" value={draft.get("category")??""} onChange={event=>updateDraft("category",event.target.value)}><option value="">All categories</option>{draft.get("category")&&!categories.includes(draft.get("category")!)&&<option>{draft.get("category")}</option>}{categories.map(category=><option key={category}>{category}</option>)}</select></label>
      {["start","end"].map((key,index)=><label key={key}>{index===0?"Post date from":"Post date to"}<input className="field" type="date" value={draft.get(key)??""} onChange={event=>updateDraft(key,event.target.value)}/></label>)}
     </div>
     <div className="mt-3 flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={reset}>Reset</Button><Button type="button" onClick={()=>{onApply(draft);setOpen(false);}}>Apply</Button></div>
    </PopoverContent>
   </Popover>
  </div>
 </section>;
}

export default function CreditCardActivity({activity:data,accountScoped=false,emptyStatementMonth=false,params,onFilter,onOpen,globalFilters,onApplyFilters}:Props&{globalFilters?:Omit<GlobalFilterProps,"params"|"categories"|"onFilter"|"onApply">;onApplyFilters?:(params:URLSearchParams)=>void}){
 const activity=data??{items:[],total:0,page:1,pageSize:25,categories:[]};
 const [selectedLine,setSelectedLine]=useState<CreditDashboard["activity"]["items"][number]|null>(null);
  return <section className={`mt-6 ${accountScoped?"space-y-4":"space-y-5"}`} aria-label={accountScoped?"Statement activity":"Statement transactions"}>
  {!accountScoped&&<div className="flex flex-wrap items-baseline justify-between gap-3"><div><h2 id="statement-activity-title">Statement transactions</h2><p className="mt-1 text-sm text-muted-foreground">Imported activity for the selected cards, months, or statements.</p></div>{data&&<p role="status">{activity.total} lines</p>}</div>}
  {!accountScoped&&globalFilters&&onApplyFilters&&<CreditCardDashboardFilters {...globalFilters} params={params} categories={activity.categories} onFilter={onFilter} onApply={onApplyFilters}/>}
  {!accountScoped&&!globalFilters&&<div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Activity filters">
   <label className="min-w-0 flex-1">Merchant / notes<input className="field" type="search" maxLength={200} value={params.get("lineSearch")??""} onChange={e=>onFilter("lineSearch",e.target.value)}/></label>
   <label>Exact signed amount<input className="field" inputMode="decimal" maxLength={40} placeholder="1292.00 or -3000.00" value={params.get("lineAmount")??""} onChange={e=>onFilter("lineAmount",e.target.value)}/></label>
   <label>Amount currency<input className="field" maxLength={3} placeholder="PHP" value={params.get("lineCurrency")??""} onChange={e=>onFilter("lineCurrency",e.target.value.toUpperCase())}/></label>
   <label>Line type<select className="field" value={params.get("lineType")??""} onChange={e=>onFilter("lineType",e.target.value)}><option value="">All types</option><option value="charge">Charges</option><option value="payment">Payment candidates</option><option value="credit">All credits</option><option value="installment">Installments</option><option value="other">Other</option></select></label>
   <label className="min-w-0">Category<select className="field" value={params.get("category")??""} onChange={e=>onFilter("category",e.target.value)}><option value="">All categories</option>{activity.categories.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Sort lines<select className="field" value={params.get("lineSort")??"source"} onChange={e=>onFilter("lineSort",e.target.value)}><option value="source">Source order</option><option value="sale">Sale date</option><option value="post">Post date</option><option value="amount">Signed amount · highest first</option><option value="merchant">Merchant</option></select></label>
   <details className="min-w-0"><summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3">Line date range{params.has("start")||params.has("end")?" · active":""}</summary><div className="mt-3 flex flex-wrap gap-3">{[["start","Post date from"],["end","Post date to"]].map(([name,label])=><label key={name}>{label}<input className="field" type="date" value={params.get(name)??""} onChange={e=>onFilter(name,e.target.value)}/></label>)}</div></details>
  </div>}
  {data&&<>
   {emptyStatementMonth?<p role="status" className="rounded-lg border p-5">No statement issued in {statementMonthLabel(params.get("month")??"")} for this card. Choose another statement month or Calendar month.</p>:activity.items.length?
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Unified statement transactions">
     <table className={accountScoped?"statement-activity-table":"statement-transactions-table"}>
       <thead><tr>{accountScoped?<><th scope="col"><span className="sr-only">Type</span></th><th scope="col">Sale date</th><th scope="col">Post date</th><th scope="col">Merchant / description</th><th scope="col" className="text-right">Amount</th><th scope="col">Category</th><th scope="col">Notes</th><th scope="col">Details</th></>:<><th scope="col"><span className="sr-only">Type</span></th>{["Sale date","Post date","Merchant","Card","Statement month","Amount","Category","Notes"].map(h=><th scope="col" key={h} className={h==="Sale date"?"w-32 min-w-32 text-center":"text-center"}>{h}</th>)}</>}</tr></thead>
      <tbody>{activity.items.map(line=>{
       const ledgerHref=line.ledgerTransactionId?`/accounts/${line.card_id}?account=${line.card_id}&period=all&id=${line.ledgerTransactionId}`:null;
       if(accountScoped)return <tr key={line.id}>
        <td><TransactionTypeIcon type={activityIconType(line.display_type)}/></td>
        <td className="w-24 min-w-24 whitespace-nowrap">{line.source.saleDate}</td>
        <td className="whitespace-nowrap">{line.source.postDate}</td>
        <td className="min-w-48 max-w-xs break-words font-medium">{line.source.merchantRaw}</td>
        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(line.amount,line.currency)}</td>
        <td>{line.display_category||"Uncategorized"}{line.category_override&&<span className="block text-xs text-muted-foreground">Annotation</span>}</td>
        <td className="min-w-32 max-w-48 break-words"><p>{line.notes_override||line.source.transactionNotesRaw||"No notes"}{line.notes_override?" · Annotation":""}</p>{ledgerHref&&<Link className="mt-1 inline-flex min-h-8 items-center underline" to={ledgerHref}>Ledger #{line.ledgerTransactionId}</Link>}</td>
        <td><Button variant="outline" className="min-h-11" aria-label={`View details for ${line.source.merchantRaw||line.display_type}`} onClick={()=>setSelectedLine(line)}>View</Button></td>
       </tr>;
       return <tr key={line.id}>
        <td className="text-center"><TransactionTypeIcon type={activityIconType(line.display_type)}/></td>
        <td className="w-32 min-w-32 whitespace-nowrap text-center">{line.source.saleDate}</td>
        <td className="whitespace-nowrap text-center">{line.source.postDate}</td>
        <td className="min-w-48 max-w-xs break-words font-medium">{line.source.merchantRaw}</td>
        <td className="min-w-32 break-words"><Link to={`/accounts/${line.card_id}`}>{line.card_name}</Link><span className="block text-sm text-muted-foreground">{line.last4?`•••• ${line.last4}`:`Last four unknown · Card #${line.card_id}`}</span></td>
        <td className="whitespace-nowrap text-center">{statementMonthLabel(line.statement_month)}</td>
        <td className="whitespace-nowrap text-center font-semibold tabular-nums">{formatMoney(line.amount,line.currency)}</td>
        <td className="text-center">{line.display_category||"Uncategorized"}{line.category_override&&<span className="block text-xs text-muted-foreground">Annotation</span>}</td>
        <td className="min-w-48 max-w-xs break-words text-center">{line.notes_override||line.source.transactionNotesRaw||"No notes"}</td>
       </tr>;
      })}</tbody>
     </table>
    </div>:<p className="rounded-lg border p-5">No lines match these activity filters. Clear filters to restore the selected statements’ imported activity.</p>}
   <nav className="flex flex-wrap items-center gap-3" aria-label="Activity pagination"><p>Page {activity.page} of {Math.max(1,Math.ceil(activity.total/activity.pageSize))} · {activity.total} lines</p><Button variant="outline" disabled={activity.page<=1} onClick={()=>onFilter("linePage",String(activity.page-1))}>Previous activity</Button><Button variant="outline" disabled={activity.page*activity.pageSize>=activity.total} onClick={()=>onFilter("linePage",String(activity.page+1))}>Next activity</Button></nav>
  </>}
  <TransactionDetailsDialog
   open={Boolean(selectedLine)}
   onOpenChange={open=>{if(!open)setSelectedLine(null);}}
   title={selectedLine?.source.merchantRaw||"Statement transaction"}
   amount={selectedLine?.amount??0}
   currency={selectedLine?.currency??"PHP"}
   type={selectedLine?activityIconType(selectedLine.display_type):"expense"}
   typeLabel={selectedLine?.display_type||"Transaction"}
   details={selectedLine?[{label:"Sale date",value:selectedLine.source.saleDate||"Not provided"},{label:"Post date",value:selectedLine.source.postDate||"Not provided"},{label:"Card",value:<>{selectedLine.card_name}{selectedLine.last4?` · •••• ${selectedLine.last4}`:""}</>},{label:"Category",value:selectedLine.display_category||"Uncategorized"},{label:"Statement",value:`${statementMonthLabel(selectedLine.statement_month)} · row ${selectedLine.row_index}`},{label:"Merchant",value:selectedLine.source.merchantRaw||"Not provided",className:"sm:col-span-2"},{label:"Notes",value:<span className="whitespace-pre-wrap">{selectedLine.notes_override||selectedLine.source.transactionNotesRaw||"No notes"}</span>,className:"border-t pt-4 sm:col-span-2"}]:[]}
   actions={selectedLine&&<>
    <Button asChild variant="outline"><Link to={`/statements?activityStatement=${selectedLine.statement_id}&document=${selectedLine.statement_id}`} onClick={()=>setSelectedLine(null)}>Open statement</Link></Button>
    {selectedLine.ledgerTransactionId&&<Button asChild variant="outline"><Link to={`/accounts/${selectedLine.card_id}?account=${selectedLine.card_id}&period=all&id=${selectedLine.ledgerTransactionId}`} onClick={()=>setSelectedLine(null)}>Open ledger transaction</Link></Button>}
    <Button variant="outline" onClick={()=>setSelectedLine(null)}>Close</Button>
   </>}
  />
 </section>;
}
