import {useState} from "react";
import {Link} from "react-router-dom";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {api,send} from "@/lib/api";
import {formatMoney,supportedCurrencies,currencyDigits} from "@/lib/finance";
import {cardLabel,type ImportResult,type StatementDashboard} from "@/lib/credit-card-statements";

export default function CreditCardStatementImporter({initialAccount}:{initialAccount?:string}){
 const client=useQueryClient(),cards=useQuery({queryKey:["credit-card-statements","cards"],queryFn:()=>api<StatementDashboard>("credit-card-statements")});
 const [file,setFile]=useState<File|null>(null),[cardId,setCardId]=useState(initialAccount??""),[issuer,setIssuer]=useState(""),[currency,setCurrency]=useState(""),[base64,setBase64]=useState(""),[result,setResult]=useState<ImportResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[ack,setAck]=useState(false),[note,setNote]=useState(""),[revision,setRevision]=useState(""),[completed,setCompleted]=useState(false);
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
 return <section className="panel mt-5 max-w-5xl space-y-5" aria-labelledby="credit-card-import-title">
  <h2 id="credit-card-import-title">Import Credit Card Statement</h2><p>Statements only. No ledger transactions, account balances or payment postings change. One file per exact card. Currency requires explicit selection.</p>
  <p className="text-sm text-muted-foreground">Statement summary first; then Sale date, Post date, Merchant, Amount, Category, Transaction notes, Transaction type. Sale date may be blank; Post date is required. Expense, Installments and Card repayment received stay separate from Category. Positive billed charges; negative payments/credits. Earlier Type-column templates remain supported.</p>
  {cards.isPending?<p role="status">Loading cards…</p>:cards.error?<p role="alert">{cards.error.message}</p>:!cards.data?.allCards.some(c=>!c.archived_at)?<p>No active credit cards. <Link className="underline" to="/accounts">Create a credit card account</Link> first.</p>:<form onSubmit={preview}><fieldset disabled={busy||Boolean(result)} className="grid gap-4 sm:grid-cols-2">
   <label>Bank / issuer<select className="field" value={issuer} onChange={e=>{setIssuer(e.target.value);setCardId("");}}><option value="">All issuers</option>{cards.data.issuers.map(i=><option key={i}>{i}</option>)}</select></label>
   <label>Exact credit card<select className="field" required value={cardId} onChange={e=>setCardId(e.target.value)}><option value="">Choose nickname and last four</option>{cards.data.allCards.filter(c=>!c.archived_at&&(!issuer||c.issuer===issuer)).map(c=><option key={c.id} value={c.id}>{cardLabel(c)}</option>)}</select></label>
   <label>Statement currency<select required className="field" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">Choose printed currency</option>{supportedCurrencies.filter(c=>currencyDigits(c)===2).map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Statement CSV<input required className="field max-w-full" type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <Button disabled={busy||!cardId||!currency||!file} aria-busy={busy}>{busy?"Parsing…":"Parse and preview statement"}</Button>
  </fieldset></form>}
  {error&&<p role="alert" className="break-words text-destructive">{error}</p>}
  {result?.existingId&&<p role="status">{result.duplicate?"Already imported.":completed?"Statement imported.":""} <Link className="underline" to={`/statements?document=${result.existingId}`}>View statement {result.existingId}</Link>. No transactions or balances changed.</p>}
  {p&&<div className="space-y-5">
   <h3 className="font-semibold">Review {p.metadata.title} · {p.metadata.statementMonth} · {p.lines.length} lines</h3><p>{p.metadata.issuer} · Issue {p.metadata.statementDate} · Due {p.metadata.dueDate} · {currency}. Cutoff and billing period: Unknown.</p>
   <dl className="grid gap-4 sm:grid-cols-3">{Object.entries(p.reconciliation).map(([key,value])=><div key={key}><dt className="text-sm text-muted-foreground">{key.replace(/([A-Z])/g," $1")}</dt><dd>{formatMoney(value,currency)}</dd></div>)}</dl>
   <p>Original balance: {formatMoney(p.metadata.originalOutstandingBalance,currency)}. Imported credits are already included; never deducted again.</p>
   {p.warnings.length>0&&<ul className="list-disc space-y-2 pl-5" aria-label="Import warnings">{p.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}
   <div className="table-scroll" tabIndex={0} role="region" aria-label="Statement import preview"><table><thead><tr>{["Source row","Sale date","Post date","Merchant","Signed amount","Source type","Source category","Source notes"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{p.lines.slice(0,50).map(line=><tr key={line.rowNumber}><td>{line.rowNumber}</td><td>{line.saleDate}</td><td>{line.postDate}</td><td className="max-w-sm break-words">{line.merchantRaw}</td><td>{formatMoney(line.amountSigned,currency)}</td><td>{line.typeRaw||"Blank"}</td><td>{line.categoryRaw||"Blank"}</td><td>{line.transactionNotesRaw||"Blank"}</td></tr>)}</tbody></table></div>{p.lines.length>50&&<p>Preview shows first 50 lines; all {p.lines.length} validated lines will be imported.</p>}
   <details><summary className="min-h-11 cursor-pointer">Original metadata</summary><pre className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(p.metadataRaw,null,2)}</pre></details>
   <fieldset disabled={busy} className="space-y-4">
    {!!result.sameDate?.length&&<label className="block">Same-card issue already exists<select required className="field" value={revision} onChange={e=>setRevision(e.target.value)}><option value="">Choose a reviewed action</option><option value="additional">Additional issue; keep both active</option>{result.sameDate.map(s=><option key={s.id} value={s.id}>Supersede #{s.id} — {s.filename}</option>)}</select><span className="text-sm">Replacement retains original records. Statements with allocations cannot be replaced.</span></label>}
    {result.requiresReview&&<><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed the balance, issuer and destination warnings.</label><label className="block">Review explanation<textarea className="field" required maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label></>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy||Boolean(result.requiresReview&&(!ack||!note.trim()))||Boolean(result.sameDate?.length&&!revision)} aria-busy={busy} onClick={confirm}>{busy?"Importing…":"Confirm statement import"}</Button><Button variant="outline" onClick={reset}>Cancel preview</Button></div>
   </fieldset>
  </div>}
  {result&&!p&&<Button variant="outline" onClick={reset}>Import another statement</Button>}
 </section>;
}
