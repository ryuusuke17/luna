import {useSearchParams,useNavigate,Link} from "react-router-dom";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Button} from "@/components/WorkspaceButton";
import StatementImportDialog from "@/components/StatementImportDialog";
import TransactionImports from "@/components/TransactionImports";
import ExportButton from "@/components/ExportButton";
import CreditCardStatementImporter from "@/components/CreditCardStatementImporter";
import {api} from "@/lib/api";

export default function ImportExport(){
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),[status,setStatus]=useState("");
 const account=params.get("account")??"",batch=params.get("batch"),tab=["import","export","history"].includes(params.get("tab")??"")?params.get("tab")!:batch?"history":"import";
 const accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string}[]>("accounts")});
 function selectBatch(id:number,accountId?:number){setParams({tab:"history",batch:String(id),...(accountId?{account:String(accountId)}:{})});}
 return <>
  <header className="page-heading"><div><h1>Import &amp; Export</h1><p className="mt-2 text-muted-foreground">Bring transactions into your accounts, resolve imports, or download your records.</p></div></header>
  <Tabs value={tab} onValueChange={value=>{const next=new URLSearchParams(params);next.set("tab",value);next.delete("upload");setParams(next);}}>
   <TabsList className="mb-5 flex h-auto flex-wrap justify-start gap-1" aria-label="Data transfers"><TabsTrigger className="min-h-11" value="import">Import</TabsTrigger><TabsTrigger className="min-h-11" value="export">Export</TabsTrigger><TabsTrigger className="min-h-11" value="history">Import history</TabsTrigger></TabsList>
   <p id="import-result" tabIndex={-1} role="status" className={status?"mb-5 break-words":"sr-only"}>{status}</p>
   <TabsContent value="import"><section className="panel max-w-3xl space-y-5"><h2>Import transactions</h2><p>Ledger import: transaction CSV files can post account movements. For separate credit-card statement tracking, use Import Credit Card Statement below instead.</p><p>Type and Category are separate. Categories are optional. Numbered installment purchases default to Installments unless you select another type.</p>
    <StatementImportDialog initialAccount={account?Number(account):undefined} initialOpen={params.get("upload")==="1"} onUploaded={(id,duplicate,result)=>{selectBatch(id,result?.accountId);setStatus(result?`${result.imported} imported · ${result.needsAttention} need attention · ${result.linked} already imported${duplicate?" · Existing upload; no records reposted.":""}${result.error?` · ${result.error}`:""}`:"Import saved.");requestAnimationFrame(()=>document.getElementById("import-result")?.focus());}}/>
   </section><CreditCardStatementImporter key={account} initialAccount={account||undefined}/></TabsContent>
   <TabsContent value="export"><section className="panel max-w-3xl space-y-5"><h2>Export your records</h2><p>Exports contain all your owned records in their current supported format, not only the transactions currently filtered on screen.</p><div className="flex flex-wrap gap-3"><ExportButton format="csv">Export all transactions</ExportButton><ExportButton format="json">Export workspace records</ExportButton></div><p className="text-sm text-muted-foreground">CSV contains posted transactions, including uncategorized records. Workspace JSON includes financial, planning, and configuration records. Neither includes private originals or the standalone statement archive, and neither is an automatic restore format. Download statement originals from Statements. Exports are not encrypted; keep them private.</p></section></TabsContent>
   <TabsContent value="history"><div className="mb-5 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1">Import account<select className="field" value={account} onChange={event=>setParams({tab:"history",...(event.target.value?{account:event.target.value}:{})})}><option value="">All accounts</option>{accounts.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{(account||batch)&&<Button variant="outline" onClick={()=>setParams({tab:"history"})}>Show all imports</Button>}{params.has("legacy")&&params.has("importId")&&<Link className="quiet inline-flex min-h-11 items-center" to={`/transactions?legacy=${encodeURIComponent(params.get("legacy")!)}&importId=${encodeURIComponent(params.get("importId")!)}${account?`&account=${encodeURIComponent(account)}`:""}`}>View earlier imported transactions</Link>}{batch&&<Link className="quiet inline-flex min-h-11 items-center" to={`/transactions?batch=${encodeURIComponent(batch)}${account?`&account=${encodeURIComponent(account)}`:""}`}>View transactions</Link>}</div>{accounts.error&&<p role="alert" className="text-destructive">{accounts.error.message}</p>}<TransactionImports batch={batch?Number(batch):undefined} account={account} onSelectBatch={selectBatch} onLegacy={(format,id,accountId)=>{navigate(`/transactions?legacy=${encodeURIComponent(format)}&importId=${id}&account=${accountId}`);}} onStatus={setStatus} onRemoved={id=>{if(Number(batch)===id){const next=new URLSearchParams(params);next.delete("batch");setParams(next);}}}/></TabsContent>
  </Tabs>
 </>;
}
