import {useEffect,useState,useRef} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {formatMoney} from "@/lib/finance";
import {api,send} from "@/lib/api";
import {Dialog,DialogTrigger,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import WorkspaceDialogContent from "@/components/WorkspaceDialogContent";
import {Button} from "@/components/WorkspaceButton";

type Preview={preview:true;version:string;changes:string[];rows:{index:number;row:{date:string;description:string;merchant:string;amount:number;kind:string;direction:number}|null;warning:string}[]};
export type ImportResult={id:number;accountId:number;duplicate:boolean;status:string;error:string;imported:number;linked:number;skipped:number;needsAttention:number};
export default function StatementImportDialog({onUploaded,initialAccount,initialOpen=false}:{onUploaded:(id:number,duplicate:boolean,result?:ImportResult)=>void;initialAccount?:number;initialOpen?:boolean}){
 const client=useQueryClient(),[open,setOpen]=useState(initialOpen),[account,setAccount]=useState(""),[funding,setFunding]=useState(""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState<Preview|null>(null);
 const previewHeading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(preview)previewHeading.current?.focus();},[preview]);
 const accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string;type:string}[]>("accounts")});
 useEffect(()=>{if(initialOpen)setOpen(true);},[initialOpen]);
 useEffect(()=>{if(open&&initialAccount){setAccount(String(initialAccount));setFunding("");}},[open,initialAccount]);
 async function upload(){
  if(!file||!accounts.data?.some(a=>a.id===Number(account))||busy)return;
  setError("");if(!file.size||file.size>2_000_000||!file.name.toLowerCase().endsWith(".csv")){setError("Choose a nonempty UTF-8 CSV up to 2 MB. XLSX/PDF/image extraction unsupported.");return;}
  setBusy(true);try{
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error("File could not be read. Choose it again."));reader.readAsDataURL(file);});
   const result=await send<ImportResult|Preview>("statements",{accountId:Number(account),fundingAccountId:accounts.data?.find(a=>a.id===Number(account))?.type==="credit_card"&&funding?Number(funding):undefined,filename:file.name,mime:file.type,base64,...(preview?{confirmation:preview.version}:{})});
   if("preview" in result){setPreview(result);return;}
   await client.invalidateQueries();setOpen(false);setFile(null);setPreview(null);onUploaded(result.id,result.duplicate,result);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);if(!value)setPreview(null);}}}><DialogTrigger asChild><Button>Import transactions</Button></DialogTrigger><WorkspaceDialogContent className="w-[calc(100%_-_2rem)] max-w-lg break-words [&_button]:!min-h-12 [&_button]:!min-w-12 [&_button]:shrink-0 [&>button]:hidden" onFocusCapture={e=>{const bounds=e.currentTarget.getBoundingClientRect(),target=e.target.getBoundingClientRect();if(target.top<bounds.top||target.bottom>bounds.bottom)e.target.scrollIntoView({block:"nearest"});}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onInteractOutside={e=>{if(busy)e.preventDefault();}}>
 <DialogTitle>Import transactions</DialogTitle><DialogDescription>Choose the account this file belongs to. Formatting changes require preview confirmation. Eligible transactions are then added; uncertain rows remain for review.</DialogDescription>
 <form className="grid min-w-0 gap-4" aria-busy={busy} onSubmit={e=>{e.preventDefault();upload();}}>
 <fieldset disabled={busy} className="grid min-w-0 gap-4"><label>Account or credit card<select aria-describedby={error?"statement-upload-error":undefined} className="field" required value={account} onChange={e=>{setAccount(e.target.value);setFunding("");setPreview(null);}}><option value="">Choose an owned account</option>{accounts.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 {accounts.data?.find(a=>a.id===Number(account))?.type==="credit_card"&&<label>Paying account for card repayments - optional<select className="field" value={funding} onChange={e=>{setFunding(e.target.value);setPreview(null);}}><option value="">Choose later in Needs attention</option>{accounts.data.filter(a=>a.id!==Number(account)&&["cash","bank","wallet"].includes(a.type)).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
 <label>Transaction or statement CSV<input aria-describedby={error?"statement-upload-error":undefined} className="field min-w-0 max-w-full" type="file" accept=".csv,text/csv" disabled={!account} onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);}}/></label>{file&&<p className="break-all text-sm">{file.name}</p>}
 <Button className="whitespace-normal" variant="outline" asChild><a href="/credit_card_statement_import_template.csv" download="full-statement-template.csv">Download full-statement template</a></Button></fieldset>
 <p className="text-sm text-muted-foreground">Statement summary first; then Sale date, Post date, Merchant, Amount, Category, Transaction notes, Transaction type. Sale date may be blank; Post date is required. Use Expense, Installments or Card repayment received; other supported types: Income, Refund, Transfer, Payment. Type and category stay separate. Blank types default to Expense or detect numbered installments; explicit types override detection. Positive PHP charges; negative repayments require a paying account. Quote dates and merchants containing commas. ISO dates and older templates remain supported. UTF-8, 2 MB, 5,000 transactions. No XLSX, PDF or images.</p>
 {accounts.isPending&&<p role="status">Loading owned accounts…</p>}{accounts.error&&<p role="alert" className="text-destructive">{accounts.error.message}</p>}{accounts.data?.length===0&&<p>No owned accounts. Create an account before uploading.</p>}
 {preview&&<section aria-label="Formatting preview" className="grid min-w-0 gap-3"><h3 className="font-semibold" tabIndex={-1} ref={previewHeading}>Review formatting changes</h3><ul className="list-disc pl-5">{preview.changes.map(change=><li key={change} className="break-words">{change}</li>)}</ul><p>Original file retained. Dates, merchant text, signs and exact PHP amounts are unchanged. Confirm to save this upload and post eligible transactions.</p><p>{preview.rows.length} source rows · {preview.rows.filter(row=>row.warning).length} source/date warnings. Classification, funding and duplicate checks still apply.</p><ol className="max-h-64 overflow-y-auto divide-y divide-border">{preview.rows.map(entry=><li key={entry.index} className="break-words py-2 text-sm">Row {entry.index+1}: {entry.row?<>{entry.row.date} · {entry.row.merchant||entry.row.description} · {formatMoney(entry.row.amount*entry.row.direction)} · {entry.row.kind}</>:"Invalid source row"}{entry.warning&&<p className="text-destructive">{entry.warning}</p>}</li>)}</ol></section>}
 {busy&&<p role="status" aria-live="polite">Importing transactions… Keep this dialog open until the result is confirmed.</p>}{error&&<p id="statement-upload-error" role="alert" className="break-words text-destructive">{error}</p>}
 <div className="dialog-actions"><Button variant="outline" type="button" disabled={busy} onClick={()=>{setOpen(false);setPreview(null);}}>Cancel</Button><Button type="submit" disabled={busy||!file||!accounts.data?.some(a=>a.id===Number(account))}>{busy?"Uploading…":preview?"Confirm formatting and import":"Import transactions"}</Button></div>
 </form></WorkspaceDialogContent></Dialog>;
}
