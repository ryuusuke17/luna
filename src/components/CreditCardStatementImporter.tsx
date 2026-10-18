import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {api,send} from "@/lib/api";
import {formatMoney,supportedCurrencies,currencyDigits} from "@/lib/finance";
import {cardLabel,type ImportResult,type StatementDashboard} from "@/lib/credit-card-statements";

export default function CreditCardStatementImporter({initialAccount}:{initialAccount?:string}){
 const client=useQueryClient(),cards=useQuery({queryKey:["credit-card-statements","cards"],queryFn:()=>api<StatementDashboard>("credit-card-statements")});
 const prefs=useQuery({queryKey:["preferences"],queryFn:()=>api<{default_transaction_currency:string}>("preferences")});
 const [file,setFile]=useState<File|null>(null),[cardId,setCardId]=useState(initialAccount??""),[issuer,setIssuer]=useState(""),[currency,setCurrency]=useState(""),[base64,setBase64]=useState(""),[result,setResult]=useState<ImportResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[ack,setAck]=useState(false),[note,setNote]=useState(""),[revision,setRevision]=useState(""),[completed,setCompleted]=useState(false);

 useEffect(()=>{
  if(prefs.data?.default_transaction_currency&&!currency){
   setCurrency(prefs.data.default_transaction_currency);
  }
 },[prefs.data?.default_transaction_currency]);
 function reset(){setResult(null);setBase64("");setAck(false);setNote("");setRevision("");setCompleted(false);setError("");}
 async function preview(event:React.FormEvent){
  event.preventDefault();if(!file||busy)return;setError("");setBusy(true);
  try{
   if(!file.size||file.size>2_000_000||!file.name.toLowerCase().endsWith(".csv"))throw Error("Choose a nonempty UTF-8 CSV up to 2 MB");
   const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error("File could not be read; choose it again"));reader.readAsDataURL(file);});
   const response=await send<ImportResult>("credit-card-statements",{filename:file.name,base64:encoded,cardId:Number(cardId),currency});setBase64(encoded);setResult(response);
  }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 async function confirm(){
  if(!file||busy)return;setBusy(true);setError("");
  try{const response=await send<ImportResult>("credit-card-statements",{filename:file.name,base64,cardId:Number(cardId),currency,confirm:true,acknowledge:ack,reviewNote:note,...(revision==="additional"?{allowAdditional:true}:revision?{supersedesId:Number(revision)}:{})});setResult(response);setCompleted(true);await client.invalidateQueries();}
  catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 const p=result?.preview;
 return <section className="panel mt-2 w-full p-3 sm:p-4 text-sm space-y-3" aria-labelledby="credit-card-import-title">
  <h2 id="credit-card-import-title" className="text-base font-semibold leading-none">Import Credit Card Statement</h2>
  <p className="text-xs text-muted-foreground">Statements only. No ledger transactions, account balances or payment postings change. One file per exact card. Currency requires explicit selection.</p>
  <p className="text-xs text-muted-foreground">Statement summary first; then Sale date, Post date, Merchant, Amount, Category, Transaction notes, Transaction type. Sale date may be blank; Post date is required. Expense, Installments and Card repayment received stay separate from Category. Positive billed charges; negative payments/credits. Earlier Type-column templates remain supported.</p>
  {cards.isPending?<p role="status" className="text-xs text-muted-foreground">Loading cards…</p>:cards.error?<p role="alert" className="text-xs text-destructive">{cards.error.message}</p>:!cards.data?.allCards.some(c=>!c.archived_at)?<p className="text-xs">No active credit cards. <Link className="underline" to="/accounts">Create a credit card account</Link> first.</p>:<form onSubmit={preview}><fieldset disabled={busy||Boolean(result)} className="grid gap-2.5 sm:grid-cols-2 text-xs">
   <label>Bank / issuer<select className="field text-xs" value={issuer} onChange={e=>{setIssuer(e.target.value);setCardId("");}}><option value="">Choose bank / issuer</option>{cards.data.issuers.map(i=><option key={i} value={i}>{i}</option>)}</select></label>
   <label>Exact credit card<select className="field text-xs" required value={cardId} onChange={e=>setCardId(e.target.value)}><option value="">Choose nickname and last four</option>{cards.data.allCards.filter(c=>!c.archived_at&&(!issuer||c.issuer===issuer)).map(c=><option key={c.id} value={c.id}>{cardLabel(c)}</option>)}</select></label>
   <label>Statement currency<select required className="field text-xs" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">Choose printed currency</option>{supportedCurrencies.filter(c=>currencyDigits(c)===2).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
   <label>Statement CSV<input required className="field text-xs max-w-full" type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <div className="sm:col-span-2 flex justify-end pt-1">
    <Button size="sm" disabled={busy||!cardId||!currency||!file} aria-busy={busy}>{busy?"Parsing…":"Parse and preview statement"}</Button>
   </div>
  </fieldset></form>}
  {error&&<p role="alert" className="break-words text-xs text-destructive">{error}</p>}
  {result?.existingId&&<p role="status" className="text-xs">{result.duplicate?"Already imported.":completed?"Statement imported.":""} <Link className="underline" to={`/statements?document=${result.existingId}`}>View statement {result.existingId}</Link>. No transactions or balances changed.</p>}
  {p&&<div className="space-y-3 pt-2 border-t border-border">
   <h3 className="font-semibold text-sm">Review {p.metadata.title} · {p.metadata.statementMonth} · {p.lines.length} lines</h3>
   <p className="text-xs text-muted-foreground">{p.metadata.issuer} · Issue {p.metadata.statementDate} · Due {p.metadata.dueDate} · {currency}. Cutoff and billing period: Unknown.</p>
   <dl className="grid gap-2 sm:grid-cols-3 text-xs">{Object.entries(p.reconciliation).map(([key,value])=><div key={key}><dt className="text-muted-foreground">{key.replace(/([A-Z])/g," $1")}</dt><dd className="font-medium">{formatMoney(value,currency)}</dd></div>)}</dl>
   <p className="text-xs">Original balance: {formatMoney(p.metadata.originalOutstandingBalance,currency)}. Imported credits are already included; never deducted again.</p>
   {p.warnings.length>0&&<ul className="list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-300" aria-label="Import warnings">{p.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}
   <div className="table-scroll max-h-60 overflow-y-auto text-xs" tabIndex={0} role="region" aria-label="Statement import preview"><table><thead><tr>{["Source row","Sale date","Post date","Merchant","Signed amount","Source type","Source category","Source notes"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{p.lines.slice(0,50).map(line=><tr key={line.rowNumber}><td>{line.rowNumber}</td><td>{line.saleDate}</td><td>{line.postDate}</td><td className="max-w-sm break-words">{line.merchantRaw}</td><td>{formatMoney(line.amountSigned,currency)}</td><td>{line.typeRaw||"Blank"}</td><td>{line.categoryRaw||"Blank"}</td><td>{line.transactionNotesRaw||"Blank"}</td></tr>)}</tbody></table></div>{p.lines.length>50&&<p className="text-xs text-muted-foreground">Preview shows first 50 lines; all {p.lines.length} validated lines will be imported.</p>}
   <details className="text-xs"><summary className="cursor-pointer py-1 font-medium">Original metadata</summary><pre className="overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(p.metadataRaw,null,2)}</pre></details>
   <fieldset disabled={busy} className="space-y-3 pt-1">
    {!!result.sameDate?.length&&<label className="block text-xs">Same-card issue already exists<select required className="field text-xs" value={revision} onChange={e=>setRevision(e.target.value)}><option value="">Choose a reviewed action</option><option value="additional">Additional issue; keep both active</option>{result.sameDate.map(s=><option key={s.id} value={s.id}>Supersede #{s.id} — {s.filename}</option>)}</select><span className="text-xs text-muted-foreground">Replacement retains original records. Statements with allocations cannot be replaced.</span></label>}
    {result.requiresReview&&<><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed the balance, issuer and destination warnings.</label><label className="block text-xs">Review explanation<textarea className="field text-xs" required maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label></>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={reset}>Cancel preview</Button><Button size="sm" disabled={busy||Boolean(result.requiresReview&&(!ack||!note.trim()))||Boolean(result.sameDate?.length&&!revision)} aria-busy={busy} onClick={confirm}>{busy?"Importing…":"Confirm statement import"}</Button></div>
   </fieldset>
  </div>}
  {result&&!p&&<div className="flex justify-end pt-1"><Button variant="outline" size="sm" onClick={reset}>Import another statement</Button></div>}
 </section>;
}
