import {useState} from "react";
import {Link} from "react-router-dom";
import {useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {send} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import type {StatementLine,StatementDetail,StatementPayment} from "@/lib/credit-card-statements";

export default function CreditCardLedgerReview({line,statement}:{line:StatementLine;statement:StatementDetail}){
 const client=useQueryClient(),[choice,setChoice]=useState(""),[classification,setClassification]=useState(line.source.amountSigned>0?"expense":""),[funding,setFunding]=useState(""),[reason,setReason]=useState(""),[similar,setSimilar]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const review=line.review;
 async function save(){if(!review||busy)return;setBusy(true);setError("");try{
  const candidate=review.candidates.find(t=>String(t.id)===choice);
  await send(`credit-card-statements/${statement.id}`,{action:"review-line",lineId:line.id,decision:choice==="import"?"import":choice==="skip"?"skip":"link",classification:choice==="skip"?"excluded":classification,reason,version:review.version,requestKey,transactionId:candidate?.id,transactionVersion:candidate?.version,fundingAccountId:candidate?.fundingAccountId??(funding?Number(funding):undefined),acknowledgeSimilar:similar});
  setRequestKey(crypto.randomUUID());await client.invalidateQueries();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!review)return <p>Unreviewed · reference-only</p>;
 return <details className="mt-3"><summary className="min-h-11 cursor-pointer">Ledger review · row {line.source.rowNumber}</summary>
  <p className="my-2 text-sm" role="status">{review.decision?review.decision.valid?review.decision.action==="skip"?`Excluded: ${review.decision.reason}`:"Reviewed ledger association":"Association needs re-review after correction or void":"Unreviewed · reference-only; not posted to accounts"}</p>
  {review.decision?.transactionId&&<Link className="inline-flex min-h-11 items-center underline" to={`/accounts/${statement.card_id}?id=${review.decision.resolvedTransactionId??review.decision.transactionId}`}>Ledger transaction #{review.decision.resolvedTransactionId??review.decision.transactionId}</Link>}
  {review.foreign&&<p className="text-sm">Foreign source: link an existing conversion or exclude. New foreign postings are prohibited.</p>}
  {review.preHistory&&<p className="text-sm">Source predates account history. Review “Extend issued-source history” above; original dates must remain unchanged.</p>}
  {review.readOnly?<p>Archived account or superseded issue · read-only</p>:!review.decision?.valid&&<form onSubmit={e=>{e.preventDefault();void save();}} className="mt-3 min-w-0 space-y-3"><fieldset disabled={busy} className="space-y-3">
   <label className="block">Review action<select className="field" required value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose explicitly</option>{review.candidates.map(t=><option key={t.id} value={t.id}>Link #{t.id} · {t.date} · {t.merchant||t.description} · {formatMoney(t.amount)} PHP</option>)}{!review.foreign&&!review.preHistory&&!review.decision?.transactionId&&<option value="import">Approve missing PHP posting</option>}<option value="skip">Exclude with reason</option></select></label>
   {choice!=="skip"&&<label className="block">Reviewed classification<select className="field" required value={classification} onChange={e=>setClassification(e.target.value)}><option value="">Choose refund or payment</option>{line.source.amountSigned>0?<option value="expense">Expense</option>:<><option value="refund">Refund</option><option value="payment">Payment transfer</option></>}</select></label>}
   {choice==="import"&&classification==="payment"&&<label className="block">Owned funding account<select className="field" required value={funding} onChange={e=>setFunding(e.target.value)}><option value="">Choose cash, bank or wallet</option>{statement.sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
   <label className="block">Review reason<textarea className="field" maxLength={2000} required={choice==="skip"||choice==="import"&&review.candidates.length>0} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {choice==="import"&&review.candidates.length>0&&<label className="flex min-h-11 items-center gap-2"><input type="checkbox" required checked={similar} onChange={e=>setSimilar(e.target.checked)}/>This is a separate purchase, not the similar existing transaction.</label>}
   <p className="text-sm">Approval changes ledger balances only for a missing PHP posting. Source reconciliation is not bank verification.</p><Button disabled={!choice||busy} aria-busy={busy}>{busy?"Saving review…":"Confirm ledger review"}</Button>
  </fieldset></form>}{error&&<p role="alert" className="text-destructive">{error}</p>}
 </details>;
}

export function CreditCardPaymentLink({payment,statement}:{payment:StatementPayment;statement:StatementDetail}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),client=useQueryClient();
 const candidates=payment.candidates??[];
 async function link(){const t=candidates.find(t=>String(t.id)===selected);if(!t||busy)return;setBusy(true);setError("");try{await send(`credit-card-statements/${statement.id}`,{action:"link-payment",paymentId:payment.id,transactionId:t.id,transactionVersion:t.version,version:payment.version});await client.invalidateQueries();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="space-y-2">{payment.transaction_id?<Link className="inline-flex min-h-11 items-center underline" to={`/accounts/${statement.card_id}?id=${payment.transaction_id}`}>Linked ledger transfer #{payment.transaction_id} · same financial event</Link>:<><p>Unlinked tracker evidence · not a ledger payment</p><Button variant="outline" onClick={()=>setOpen(!open)} aria-expanded={open}>Link existing transfer #{payment.id}</Button>{open&&<form onSubmit={e=>{e.preventDefault();void link();}} className="space-y-3"><label>Exact payment transfer within seven days<select className="field" required disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose existing transfer</option>{candidates.map(t=><option key={t.id} value={t.id}>#{t.id} · {t.posted_date} · {t.description||"Transfer"}</option>)}</select></label><p role="status">{candidates.length} compatible transfers within seven days before or after payment date.</p><p className="text-sm">No match? Keep evidence unlinked. Set the actual funding account before linking. No transfer is created here.</p><Button disabled={busy||!selected} aria-busy={busy}>{busy?"Linking…":"Confirm existing transfer link"}</Button></form>}</>}{error&&<p role="alert" className="text-destructive">{error}</p>}</div>;
}

export function IssuedHistoryExtension({statement,mutate,busy}:{statement:StatementDetail;mutate:(value:unknown)=>Promise<boolean>;busy:boolean}){
 const [confirmed,setConfirmed]=useState(false),extension=statement.historyExtension;
 if(!extension)return null;
 return <section aria-label="Issued-source history recovery" className="space-y-3 rounded-lg border p-4">
  <h3 className="font-semibold">Extend issued-source history</h3>
  <p>{extension.affectedRows} unreviewed source rows predate account start {extension.openingDate}. Proposed start: {extension.proposedDate}.</p>
  <p>Only account history start changes. Source dates, opening balance and ledger balances remain unchanged. Posting still requires separate approval.</p>
  {extension.allowed?<form onSubmit={e=>{e.preventDefault();void mutate({action:"extend-history",version:extension.version});}}>
   <label className="flex min-h-11 items-center gap-3"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the earlier start date; extend history without posting transactions.</label>
   <Button disabled={busy||!confirmed} aria-busy={busy}>{busy?"Extending history…":"Confirm issued-source history extension"}</Button>
  </form>:<p role="status">{extension.conflict}</p>}
 </section>;
}
