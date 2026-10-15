import {useEffect,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {api,send} from "@/lib/api";
import {Dialog,DialogTrigger,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import WorkspaceDialogContent from "@/components/WorkspaceDialogContent";
import {Button} from "@/components/WorkspaceButton";

const template='Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes\r\n"Mar 7, 2026","Mar 9, 2026","UNIQLO SM FAIRVIEW, QUEZON CITY",1292.00,,,\r\n"Apr 5, 2026","Apr 7, 2026",(15/24) SILICON VALLEY-SM FAIR,1791.25,,,\r\n';
export type ImportResult={id:number;accountId:number;duplicate:boolean;status:string;error:string;imported:number;linked:number;skipped:number;needsAttention:number};
export default function StatementImportDialog({onUploaded,initialAccount,initialOpen=false}:{onUploaded:(id:number,duplicate:boolean,result?:ImportResult)=>void;initialAccount?:number;initialOpen?:boolean}){
 const client=useQueryClient(),[open,setOpen]=useState(initialOpen),[account,setAccount]=useState(""),[funding,setFunding]=useState(""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string;type:string}[]>("accounts")});
 useEffect(()=>{if(initialOpen)setOpen(true);},[initialOpen]);
 useEffect(()=>{if(open&&initialAccount){setAccount(String(initialAccount));setFunding("");}},[open,initialAccount]);
 function download(){const url=URL.createObjectURL(new Blob([template],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="full-statement-template.csv";a.click();URL.revokeObjectURL(url);}
 async function upload(){
  if(!file||!accounts.data?.some(a=>a.id===Number(account))||busy)return;
  setError("");if(!file.size||file.size>2_000_000||!file.name.toLowerCase().endsWith(".csv")){setError("Choose a nonempty UTF-8 CSV up to 2 MB. XLSX/PDF/image extraction unsupported.");return;}
  setBusy(true);try{
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error("File could not be read. Choose it again."));reader.readAsDataURL(file);});
   const result=await send<ImportResult>("statements",{accountId:Number(account),fundingAccountId:accounts.data?.find(a=>a.id===Number(account))?.type==="credit_card"&&funding?Number(funding):undefined,filename:file.name,mime:file.type,base64});
   await client.invalidateQueries();setOpen(false);setFile(null);onUploaded(result.id,result.duplicate,result);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogTrigger asChild><Button>Import transactions</Button></DialogTrigger><WorkspaceDialogContent className="w-[calc(100%_-_2rem)] max-w-lg break-words [&_button]:!min-h-12 [&_button]:!min-w-12 [&_button]:shrink-0 [&>button]:hidden" onFocusCapture={e=>{const bounds=e.currentTarget.getBoundingClientRect(),target=e.target.getBoundingClientRect();if(target.top<bounds.top||target.bottom>bounds.bottom)e.target.scrollIntoView({block:"nearest"});}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onInteractOutside={e=>{if(busy)e.preventDefault();}}>
 <DialogTitle>Import transactions</DialogTitle><DialogDescription>Choose the account this file belongs to. Clear transactions are added immediately. Only uncertain rows need attention.</DialogDescription>
 <form className="grid min-w-0 gap-4" aria-busy={busy} onSubmit={e=>{e.preventDefault();upload();}}>
 <fieldset disabled={busy} className="grid min-w-0 gap-4"><label>Account or credit card<select aria-describedby={error?"statement-upload-error":undefined} className="field" required value={account} onChange={e=>{setAccount(e.target.value);setFunding("");}}><option value="">Choose an owned account</option>{accounts.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 {accounts.data?.find(a=>a.id===Number(account))?.type==="credit_card"&&<label>Paying account for card repayments - optional<select className="field" value={funding} onChange={e=>setFunding(e.target.value)}><option value="">Choose later in Needs attention</option>{accounts.data.filter(a=>a.id!==Number(account)&&["cash","bank","wallet"].includes(a.type)).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
 <label>Transaction or statement CSV<input aria-describedby={error?"statement-upload-error":undefined} className="field min-w-0 max-w-full" type="file" accept=".csv,text/csv" disabled={!account} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>{file&&<p className="break-all text-sm">{file.name}</p>}
 <Button className="whitespace-normal" variant="outline" type="button" onClick={download}>Download full-statement template</Button></fieldset>
 <p className="text-sm text-muted-foreground">Sale date, Post date, Merchant, Amount, Type, Category, Transaction notes. Type and category are separate and optional. Blank types default to Expense or detect numbered installments; an explicit type overrides detection. Positive PHP charges; unexplained negative credits need review. Quote dates and merchants containing commas. ISO dates, optional statement summaries and older templates remain supported. UTF-8, 2 MB, 5,000 transactions. No XLSX, PDF or images.</p>
 {accounts.isPending&&<p role="status">Loading owned accounts…</p>}{accounts.error&&<p role="alert" className="text-destructive">{accounts.error.message}</p>}{accounts.data?.length===0&&<p>No owned accounts. Create an account before uploading.</p>}
 {busy&&<p role="status" aria-live="polite">Importing transactions… Keep this dialog open until the result is confirmed.</p>}{error&&<p id="statement-upload-error" role="alert" className="break-words text-destructive">{error}</p>}
 <div className="dialog-actions"><Button variant="outline" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy||!file||!accounts.data?.some(a=>a.id===Number(account))}>{busy?"Uploading…":"Import transactions"}</Button></div>
 </form></WorkspaceDialogContent></Dialog>;
}
