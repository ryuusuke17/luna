import LegacyStatementArchives from "@/components/LegacyStatementArchives";
import {useSearchParams,useNavigate,Link} from "react-router-dom";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Button} from "@/components/WorkspaceButton";
import TransactionImports from "@/components/TransactionImports";
import ExportButton from "@/components/ExportButton";
import CreditCardStatementImporter from "@/components/CreditCardStatementImporter";
import CreditCardImportHistory from "@/components/CreditCardImportHistory";
import {api} from "@/lib/api";

export default function ImportExport(){
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),[status,setStatus]=useState("");
 const account=params.get("account")??"",batch=params.get("batch"),tab=["import","export","history"].includes(params.get("tab")??"")?params.get("tab")!:batch?"history":"import";
 const accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string}[]>("accounts")});
 function selectBatch(id:number,accountId?:number){setParams({tab,batch:String(id),...(accountId?{account:String(accountId)}:{})});}

 const historyContent = (
  <section className="space-y-3 pt-2" aria-label="Import history section">
   <div className="flex flex-wrap items-end gap-3">
    <label className="min-w-0 flex-1">
     Import account
     <select className="field" value={account} onChange={event=>setParams({tab,...(event.target.value?{account:event.target.value}:{})})}>
      <option value="">All accounts</option>
      {accounts.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </select>
    </label>
    {(account||batch)&&<Button variant="outline" size="sm" onClick={()=>setParams({tab})}>Show all imports</Button>}
    {params.has("legacy")&&params.has("importId")&&<Link className="quiet inline-flex min-h-9 items-center text-xs underline" to={`/transactions?legacy=${encodeURIComponent(params.get("legacy")!)}&importId=${encodeURIComponent(params.get("importId")!)}${account?`&account=${encodeURIComponent(account)}`:""}`}>View earlier imported transactions</Link>}
    {batch&&<Link className="quiet inline-flex min-h-9 items-center text-xs underline" to={`/transactions?batch=${encodeURIComponent(batch)}${account?`&account=${encodeURIComponent(account)}`:""}`}>View transactions</Link>}
   </div>
   {accounts.error&&<p role="alert" className="text-destructive text-xs">{accounts.error.message}</p>}
   <CreditCardImportHistory key={`card-history-${account}`} account={account||undefined}/>
   <TransactionImports batch={batch?Number(batch):undefined} account={account} onSelectBatch={selectBatch} onLegacy={(format,id,accountId)=>{navigate(`/transactions?legacy=${encodeURIComponent(format)}&importId=${id}&account=${accountId}`);}} onStatus={setStatus} onRemoved={id=>{if(Number(batch)===id){const next=new URLSearchParams(params);next.delete("batch");setParams(next);}}}/>
   <LegacyStatementArchives key={`${account}:${params.get("archive")??""}`} account={account||undefined} initialId={params.has("archive")?Number(params.get("archive")):undefined}/>
  </section>
 );

 return <>
  <header className="page-heading"><div><h1>Import &amp; Export</h1><p className="mt-2 text-muted-foreground">Track credit-card statements without changing transactions or balances, review earlier ledger imports, or download your records.</p></div></header>
  <Tabs value={tab} onValueChange={value=>{const next=new URLSearchParams(params);next.set("tab",value);next.delete("upload");setParams(next);}}>
   <TabsList className="mb-5 flex h-auto flex-wrap justify-start gap-1" aria-label="Data transfers"><TabsTrigger className="min-h-11" value="import">Import</TabsTrigger><TabsTrigger className="min-h-11" value="export">Export</TabsTrigger><TabsTrigger className="min-h-11" value="history">Import history</TabsTrigger></TabsList>
   <p id="import-result" tabIndex={-1} role="status" className={status?"mb-5 break-words":"sr-only"}>{status}</p>
   <TabsContent value="import" className="space-y-6">
    <CreditCardStatementImporter key={account} initialAccount={account||undefined}/>
    {historyContent}
   </TabsContent>
   <TabsContent value="export"><section className="panel max-w-3xl space-y-5"><h2>Export your records</h2><p>Exports contain all your owned records in their current supported format, not only the transactions currently filtered on screen.</p><div className="flex flex-wrap gap-3"><ExportButton format="csv">Export all transactions</ExportButton><ExportButton format="json">Export workspace records</ExportButton></div><p className="text-sm text-muted-foreground">CSV contains posted transactions, including uncategorized records. Workspace JSON includes financial, planning, and configuration records. Neither includes private originals or the standalone statement archive, and neither is an automatic restore format. Download statement originals from Statements. Exports are not encrypted; keep them private.</p></section></TabsContent>
   <TabsContent value="history">{historyContent}</TabsContent>
  </Tabs>
 </>;
}
