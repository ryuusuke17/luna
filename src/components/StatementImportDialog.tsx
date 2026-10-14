import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {api,send} from "@/lib/api";
import {Dialog,DialogTrigger,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import WorkspaceDialogContent from "@/components/WorkspaceDialogContent";
import {Button} from "@/components/WorkspaceButton";

const template='Statement month/title,September 2026\r\nStatement date,"Sep 21, 2026"\r\nDue date,"Oct 12, 2026"\r\nCredit limit,50000.00\r\nPrevious balance,4028.06\r\nNew charges,7323.10\r\nPayments/credits,4100.00\r\nOutstanding balance,7251.16\r\nMinimum due,500.00\r\nStatement notes,Historical statement snapshot\r\n\r\nSale date,Post date,Description,Amount,Transaction notes\r\n"Aug 23, 2026","Aug 24, 2026",Example purchase,7323.10,INSTALMENT 6 OF 24\r\n"Sep 10, 2026","Sep 10, 2026",PAYMENT RECEIVED - THANK YOU,-4100.00,\r\n';
export default function StatementImportDialog({onUploaded}:{onUploaded:(id:number,duplicate:boolean)=>void}){
 const client=useQueryClient(),[open,setOpen]=useState(false),[account,setAccount]=useState(""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string;type:string}[]>("accounts")});
 function download(){const url=URL.createObjectURL(new Blob([template],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="full-statement-template.csv";a.click();URL.revokeObjectURL(url);}
 async function upload(){
  if(!file||!accounts.data?.some(a=>a.id===Number(account))||busy)return;
  setError("");if(!file.size||file.size>2_000_000||!file.name.toLowerCase().endsWith(".csv")){setError("Choose a nonempty UTF-8 CSV up to 2 MB. XLSX/PDF/image extraction unsupported.");return;}
  setBusy(true);try{
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error("File could not be read. Choose it again."));reader.readAsDataURL(file);});
   const result=await send<{id:number;duplicate:boolean}>("statements",{accountId:Number(account),filename:file.name,mime:file.type,base64});
   await client.invalidateQueries({queryKey:["statements"]});await client.invalidateQueries({queryKey:["statement",result.id]});setOpen(false);setFile(null);onUploaded(result.id,result.duplicate);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogTrigger asChild><Button>Import statement</Button></DialogTrigger><WorkspaceDialogContent className="w-[calc(100%_-_2rem)] max-w-lg break-words [&_button]:!min-h-12 [&_button]:!min-w-12 [&_button]:shrink-0 [&>button]:hidden" onFocusCapture={e=>{const bounds=e.currentTarget.getBoundingClientRect(),target=e.target.getBoundingClientRect();if(target.top<bounds.top||target.bottom>bounds.bottom)e.target.scrollIntoView({block:"nearest"});}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onInteractOutside={e=>{if(busy)e.preventDefault();}}>
 <DialogTitle>Import statement</DialogTitle><DialogDescription>Archive the complete statement privately. Upload stages data only; review and approval happen on Bank Statements.</DialogDescription>
 <form className="grid min-w-0 gap-4" aria-busy={busy} onSubmit={e=>{e.preventDefault();upload();}}>
 <fieldset disabled={busy} className="grid min-w-0 gap-4"><label>Statement account<select aria-describedby={error?"statement-upload-error":undefined} className="field" required value={account} onChange={e=>setAccount(e.target.value)}><option value="">Choose an owned account</option>{accounts.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 <label>Statement CSV<input aria-describedby={error?"statement-upload-error":undefined} className="field min-w-0 max-w-full" type="file" accept=".csv,text/csv" disabled={!account} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>{file&&<p className="break-all text-sm">{file.name}</p>}
 <Button className="whitespace-normal" variant="outline" type="button" onClick={download}>Download full-statement template</Button></fieldset>
 <p className="text-sm text-muted-foreground">Spreadsheet summary labels, then Sale date, Post date, Description, Amount, Transaction notes. Quote month-name dates containing commas. ISO dates also supported. Positive PHP charges; negative credits require payment/refund review. UTF-8, 2 MB, 5,000 transactions. Legacy flat CSV accepted. No arbitrary bank exports, XLSX, PDF or images.</p>
 {accounts.isPending&&<p role="status">Loading owned accounts…</p>}{accounts.error&&<p role="alert" className="text-destructive">{accounts.error.message}</p>}{accounts.data?.length===0&&<p>No owned accounts. Create an account before uploading.</p>}
 {busy&&<p role="status" aria-live="polite">Archiving statement… Keep this dialog open. No ledger transactions approved.</p>}{error&&<p id="statement-upload-error" role="alert" className="break-words text-destructive">{error}</p>}
 <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy||!file||!accounts.data?.some(a=>a.id===Number(account))}>{busy?"Uploading…":"Upload and review"}</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button></div>
 </form></WorkspaceDialogContent></Dialog>;
}
