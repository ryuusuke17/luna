import {useEffect,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Dialog,DialogTrigger,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import WorkspaceDialogContent from "@/components/WorkspaceDialogContent";
import {Button} from "@/components/WorkspaceButton";
import {api,send} from "@/lib/api";
import {decimalAmount,formatMoney} from "@/lib/finance";
import {transactionText,transactionType,transactionTypeLabel} from "@/lib/transactions";
import type {ImportResult} from "./StatementImportDialog";
import RemoveStatementDialog from "./RemoveStatementDialog";

type Account={id:number;name:string;type:string};
type History={id:number;account_id:number;account_name:string;filename:string;created_at:string;rows:number;imported:number;matched:number;skipped?:number;needs_review:number;status:string;error:string};
type Legacy={id:number;account_id:number;account_name:string;format:string;rows:number;created_at:string};
type Entry={id:number;index:number;action:string|null;transactionId:number|null;categoryId:number|null;raw:Record<string,string>;warnings:string;row:{date:string;description:string;merchant:string;kind:string;isInstallment?:boolean;amount:number;direction:number;notes?:string;destinationId?:number}|null;category:{id?:number;label:string}|null;blockers:{code:string;message:string}[];candidates:{id:number;posted_date:string;description:string;merchant?:string;delta:number}[]};
type Detail={id:number;account_id:number;account_name:string;account_type:string;filename:string;status:string;error:string;version:string;funding_account_id:number|null;entries:Entry[];historyExtension?:{openingDate:string;proposedDate:string;affectedRows:number;sourceDates:string[];allowed:boolean;conflict:string}|null;recoveryError?:string;rawSummary?:{row:number;cells:string[]}[];discrepancies:string[]};

export default function TransactionImports({batch,account,onSelectBatch,onLegacy,onStatus,onRemoved}:{batch?:number;account:string;onSelectBatch:(id:number,accountId?:number)=>void;onLegacy:(format:string,id:number,accountId:number)=>void;onStatus:(message:string)=>void;onRemoved:(id:number)=>void}){
 const client=useQueryClient(),[attention,setAttention]=useState(false),[historyOpen,setHistoryOpen]=useState(Boolean(batch)),[editing,setEditing]=useState<number|null>(null),[limit,setLimit]=useState(25),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmHistory,setConfirmHistory]=useState(false),[confirmationVersion,setConfirmationVersion]=useState("");
 const history=useQuery({queryKey:["statements"],queryFn:()=>api<History[]>("statements")});
 const legacy=useQuery({queryKey:["import-history"],queryFn:()=>api<Legacy[]>("import-history")});
 const detail=useQuery({queryKey:["statement",batch],queryFn:()=>api<Detail>(`statements/${batch}`),enabled:Boolean(batch)});
 const accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<Account[]>("accounts")});
 const categories=useQuery({queryKey:["categories"],queryFn:()=>api<{id:number;name:string;kind:string}[]>("categories")});
 useEffect(()=>{if(batch)setHistoryOpen(true);setEditing(null);setLimit(25);setError("");setConfirmHistory(false);},[batch]);
 const uploads=(history.data??[]).filter(item=>!account||item.account_id===Number(account));
 const needsAttention=uploads.reduce((total,item)=>total+item.needs_review+(item.status==="failed"?1:0),0);
 const pending=detail.data?.entries.filter(entry=>!entry.action)??[];
 async function action(body:Record<string,unknown>,version?:string){
  if(!detail.data||busy)return;setBusy(true);setError("");
  try{
   const result=await send<ImportResult>(`statements/${batch}`,{...body,version:version??detail.data.version});
   setConfirmHistory(false);await client.invalidateQueries();setEditing(null);requestAnimationFrame(()=>document.getElementById("import-result")?.focus());
   onStatus(body.action==="extend-history"?"History extended. Continue import to add eligible transactions.":result.imported===undefined?"File parsed. Continue import to add clear rows.":`${result.imported} imported · ${result.needsAttention} need attention · ${result.linked} already imported${result.error?` · ${result.error}`:""}`);
  }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 return <section className="mb-3 min-w-0" aria-label="Transaction imports">
  <details className="panel p-3 sm:p-4 text-sm min-w-0" open={historyOpen} onToggle={event=>setHistoryOpen(event.currentTarget.open)}>
   <summary className="cursor-pointer font-semibold py-1">Import history</summary>
   <div className="my-2 flex flex-wrap items-center gap-2">
    <Button size="sm" variant={attention?"default":"outline"} aria-pressed={attention} onClick={()=>{setAttention(value=>!value);if(!attention&&!pending.length){const next=uploads.find(item=>item.needs_review||item.status==="failed");if(next)onSelectBatch(next.id,next.account_id);}}}>Needs attention ({needsAttention})</Button>
    {batch&&<span className="break-words text-xs text-muted-foreground">Showing this upload. Use Show all imports to clear this selection.</span>}
   </div>
   {(history.error||legacy.error)&&<p role="alert" className="text-xs text-destructive">{(history.error??legacy.error)?.message}</p>}
   {attention&&uploads.length>0&&!uploads.some(item=>item.needs_review||item.status==="failed")&&<p role="status" className="my-2 text-xs text-muted-foreground">No imports need attention.</p>}
   {history.isPending?<p role="status" className="mt-2 text-xs text-muted-foreground">Loading imports...</p>:!uploads.length?<p className="mt-2 text-xs text-muted-foreground">No uploaded files for this account yet.</p>:<ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-border">{uploads.filter(item=>!attention||item.needs_review||item.status==="failed").map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
    <div className="min-w-0 basis-full sm:flex-1"><p className="break-words font-medium text-sm leading-snug">{item.filename}</p><p className="text-xs text-muted-foreground">{item.account_name} - {item.created_at} - {item.imported} imported, {item.matched} linked, {item.skipped??0} skipped, {item.needs_review} need attention{item.status==="failed"?" - File could not be parsed":""}</p></div>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={()=>onSelectBatch(item.id,item.account_id)}>View upload #{item.id}</Button><a className="quiet inline-flex min-h-9 items-center text-xs underline" href={`/api/statements/${item.id}/download`} download>Download original</a><RemoveStatementDialog id={item.id} filename={item.filename} disabled={busy||history.isFetching} onRemoved={()=>{onRemoved(item.id);onStatus("Uploaded statement removed. Ledger transactions unchanged.");void client.invalidateQueries({queryKey:["account-detail"]});requestAnimationFrame(()=>document.getElementById("import-result")?.focus());}}/></div>
   </li>)}</ul>}
   <div className="pt-2 border-t border-border mt-2">
    {error&&<p role="alert" className="text-destructive text-xs mb-2">{error}</p>}
    <Button variant="destructive" size="sm" disabled={busy} onClick={async()=>{
     if(!window.confirm("Warning: Force purge all statement imports and staged rows from the database?"))return;
     setBusy(true);setError("");
     try{
      await send("statements/force-purge-all",{confirm:true});
      await client.invalidateQueries();
      onRemoved(0);
      onStatus("All statement imports purged from database.");
     }catch(err){setError((err as Error).message);}
     finally{setBusy(false);}
    }}>Force purge all statement imports</Button>
   </div>
   {!attention&&legacy.data?.some(item=>!account||item.account_id===Number(account))&&<details className="mt-2 pt-2 border-t border-border"><summary className="cursor-pointer py-1 font-medium text-xs">Earlier CSV / JSON imports</summary><ul className="divide-y divide-border">{legacy.data.filter(item=>!account||item.account_id===Number(account)).map(item=><li key={`${item.format}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span className="text-xs">{item.account_name} - {item.format.toUpperCase()} #{item.id} - {item.rows} rows</span><Button variant="outline" size="sm" onClick={()=>onLegacy(item.format,item.id,item.account_id)}>View transactions</Button></li>)}</ul><p className="mt-1 text-xs text-muted-foreground">Earlier imports did not retain downloadable original files.</p></details>}
  </details>
  {detail.isFetching&&<p role="status" className="mt-3">Loading upload...</p>}{detail.error&&<p role="alert" className="mt-3 text-destructive">{detail.error.message}</p>}
  {detail.data&&<section className="mt-5 min-w-0" aria-label="Import needs attention">
   <h2 className="break-words">{detail.data.filename}</h2><p className="mt-1 text-muted-foreground">{detail.data.account_name} - {pending.length} rows need attention. Unresolved rows do not affect balances.</p>
   <a className="quiet inline-flex min-h-11 items-center" href={`/api/statements/${detail.data.id}/download`} download>Download original</a>
   {detail.data.error&&<p role="status" className="mt-3 break-words">{detail.data.error}</p>}
   {detail.data.recoveryError&&<p role="alert" className="mt-3 break-words text-destructive">{detail.data.recoveryError}</p>}
   {detail.data.historyExtension&&<div className="panel my-3 grid min-w-0 gap-3" role="region" aria-label="Before account history">
    <h3 className="font-semibold">Before account history</h3><p className="break-words">{detail.data.historyExtension.affectedRows} affected rows. Source posting dates: {detail.data.historyExtension.sourceDates.join(", ")}. Current account opening date: {detail.data.historyExtension.openingDate}. Proposed earliest date: {detail.data.historyExtension.proposedDate}.</p>
    {detail.data.historyExtension.conflict&&<p role="alert" className="break-words text-destructive">{detail.data.historyExtension.conflict}</p>}
    <Dialog open={confirmHistory} onOpenChange={value=>{if(!busy){setConfirmHistory(value);if(value){setConfirmationVersion(detail.data!.version);setError("");}}}}><DialogTrigger asChild><Button className="w-full whitespace-normal sm:w-fit" variant="outline" disabled={busy||detail.isFetching||!detail.data.historyExtension.allowed}>Extend account history</Button></DialogTrigger>
     <WorkspaceDialogContent className="w-[calc(100%_-_2rem)] max-w-lg break-words [&>button]:hidden" onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>
      <DialogTitle>Extend account history?</DialogTitle><DialogDescription>Change {detail.data.account_name} opening date from {detail.data.historyExtension.openingDate} to {detail.data.historyExtension.proposedDate} for {detail.data.historyExtension.affectedRows} historical rows.</DialogDescription>
      <p>No transactions are posted by this confirmation. Existing balances, opening-balance transactions and reconciliations are not moved or adjusted. Continue import afterward to post eligible rows on their original dates; those postings will change balances. Funding-account dates remain unchanged.</p>
      {busy&&<p role="status">Extending account history…</p>}{error&&<p role="alert" className="break-words text-destructive">{error}</p>}
      <div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirmHistory(false)}>Cancel</Button><Button disabled={busy||detail.isFetching} onClick={()=>action({action:"extend-history"},confirmationVersion)}>{busy?"Extending…":"Confirm history extension"}</Button></div>
     </WorkspaceDialogContent>
    </Dialog>
   </div>}
   <div className="my-3 flex flex-wrap gap-3">{pending.length>0&&<Button disabled={busy||detail.isFetching} onClick={()=>action({action:"continue"})}>Continue import</Button>}{detail.data.status==="failed"&&<Button variant="outline" disabled={busy||detail.isFetching} onClick={()=>action({action:"reprocess"})}>Retry parsing file</Button>}{pending.length>0&&<Button variant="outline" aria-expanded={attention} onClick={()=>setAttention(value=>!value)}>{attention?"Hide unresolved rows":"Resolve uncertain rows"}</Button>}</div>
   {busy&&<p role="status">Saving import...</p>}{error&&<p role="alert" className="break-words text-destructive">{error}</p>}
   {attention&&pending.length>0&&<ul className="divide-y divide-border">{pending.slice(0,limit).map(entry=><li key={entry.id} className="py-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">Row {entry.index+1}: {entry.row?.merchant||entry.row?.description||entry.raw.merchant||entry.raw.description||"Invalid source row"}</h3><p className="text-sm">{entry.row?.date??entry.raw.date??entry.raw.postDate} {entry.row?formatMoney(entry.row.amount):entry.raw.amount}</p><p className="mt-1 break-words text-sm text-muted-foreground">{entry.blockers.map(blocker=>blocker.message).join(". ")||entry.warnings||"Ready to import; continue this upload or save this row."}</p></div><Button variant="outline" disabled={busy} aria-expanded={editing===entry.id} onClick={()=>setEditing(editing===entry.id?null:entry.id)}>Resolve row {entry.index+1}</Button></div>
    {editing===entry.id&&<PendingEditor key={`${entry.id}-${detail.data!.version}`} entry={entry} detail={detail.data!} accounts={accounts.data??[]} categories={categories.data??[]} busy={busy||detail.isFetching||accounts.isPending||categories.isPending||Boolean(accounts.error||categories.error)} onResolve={decision=>action({action:"resolve",decisions:[decision]})}/>}
   </li>)}</ul>}
   {attention&&pending.length>limit&&<Button variant="outline" className="mt-3" onClick={()=>setLimit(value=>value+25)}>Show more unresolved rows</Button>}
   {attention&&!pending.length&&<p className="mt-3">No unresolved rows in this upload.</p>}
   {(accounts.error||categories.error)&&<p role="alert" className="text-destructive">{(accounts.error??categories.error)?.message}</p>}
   <details className="mt-4"><summary className="min-h-11 cursor-pointer">Original file details</summary><p className="text-sm text-muted-foreground">Reference only. Statement totals never create transactions or balance adjustments.</p>{detail.data.discrepancies?.map((warning,index)=><p key={index} className="mt-2 text-sm">{warning}</p>)}<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(detail.data.rawSummary??detail.data.entries.map(entry=>entry.raw),null,2)}</pre></details>
  </section>}
 </section>;
}

function PendingEditor({entry,detail,accounts,categories,busy,onResolve}:{entry:Entry;detail:Detail;accounts:Account[];categories:{id:number;name:string;kind:string}[];busy:boolean;onResolve:(decision:Record<string,unknown>)=>void}){
 const row=entry.row,text=transactionText(row??entry.raw,[entry.raw]),[kind,setKind]=useState(row?.kind==="transfer"&&row.direction===1?"payment":row?.kind==="unresolved"?"":row?transactionType({...row,is_installment:row.isInstallment===undefined?undefined:Number(row.isInstallment)}):entry.raw.type??""),[category,setCategory]=useState(String(entry.categoryId??entry.category?.id??"")),[destination,setDestination]=useState(String(row?.destinationId??(row?.direction===1?detail.funding_account_id:null)??"")),[matched,setMatched]=useState("");
 const transfer=kind==="transfer"||kind==="payment";
 function decision(form:HTMLFormElement,action:string){const values=new FormData(form);return{entryId:entry.id,action,categoryId:transfer||!category?null:Number(category),...(transfer&&destination?{destinationId:Number(destination)}:{}),...(matched?{transactionId:Number(matched)}:{}),reason:action==="skip"?"Skipped by owner in Import & Export":action==="import"&&(entry.candidates.length||entry.blockers.some(blocker=>blocker.code==="duplicate"))?"Owner confirmed this is a separate transaction":"",...(action!=="skip"?{correction:{date:String(values.get("date")),description:String(values.get("description")),merchant:String(values.get("merchant")),type:kind,amount:String(values.get("amount")),notes:String(values.get("notes"))}}:{})};}
 return <form className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2" aria-label={`Resolve row ${entry.index+1}`} onSubmit={event=>{event.preventDefault();onResolve(decision(event.currentTarget,"import"));}}><fieldset disabled={busy} className="contents">
  <label>Posted date<input className="field" type="date" name="date" required defaultValue={row?.date??entry.raw.date??entry.raw.postDate??""}/></label>
  <label>Type<select className="field" required value={kind} onChange={event=>{setKind(event.target.value);setCategory("");setMatched("");}}><option value="">Choose type</option>{["expense","installment","income","refund","transfer",...(detail.account_type==="credit_card"?["payment"]:[])].map(value=><option key={value} value={value}>{value==="payment"?"Card repayment received":transactionTypeLabel(value)}</option>)}</select></label>
  <label>Description<input className="field" name="description" maxLength={240} defaultValue={text.description}/></label><label>Amount - PHP<input className="field" required inputMode="decimal" name="amount" defaultValue={row?decimalAmount(row.amount):entry.raw.amount?.replace(/^-/ ,"")??""}/></label>
  <label>Merchant<input className="field" name="merchant" maxLength={240} defaultValue={text.merchant}/></label>
  {transfer?<label>{kind==="payment"?"Paying account":"Transfer destination"}<select className="field" value={destination} onChange={event=>setDestination(event.target.value)}><option value="">Choose an account</option>{accounts.filter(item=>item.id!==detail.account_id&&(kind!=="payment"||["cash","bank","wallet"].includes(item.type))).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:<label>Category - optional<select className="field" value={category} onChange={event=>setCategory(event.target.value)}><option value="">Uncategorized</option>{categories.filter(item=>item.kind===(kind==="income"?"income":"expense")).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
  <label className="sm:col-span-2">Notes<textarea className="field" name="notes" maxLength={500} defaultValue={row?.notes??entry.raw.notes??""}/></label>
  <div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={!kind||(transfer&&!destination)}>{entry.candidates.length?"Import separately":"Add transaction"}</Button><Button variant="outline" type="button" onClick={event=>{const form=event.currentTarget.form!;if(form.reportValidity())onResolve(decision(form,"edit"));}}>Save fields / refresh matches</Button><Button variant="outline" type="button" onClick={()=>onResolve({entryId:entry.id,action:"skip",reason:"Skipped by owner in Import & Export"})}>Skip row</Button></div>
  {entry.candidates.length>0&&<div className="sm:col-span-2"><label>Possible existing transaction<select className="field" value={matched} onChange={event=>setMatched(event.target.value)}><option value="">Choose an existing record</option>{entry.candidates.map(item=><option key={item.id} value={item.id}>#{item.id} - {item.posted_date} - {item.merchant||item.description} - {formatMoney(Math.abs(item.delta))}</option>)}</select></label><Button className="mt-3" variant="outline" type="button" disabled={!matched} onClick={event=>{const form=event.currentTarget.form!;if(form.reportValidity())onResolve(decision(form,"link"));}}>Link existing transaction</Button></div>}
  <details className="sm:col-span-2"><summary className="min-h-11 cursor-pointer">Original row</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(entry.raw,null,2)}</pre></details>
 </fieldset></form>;
}
