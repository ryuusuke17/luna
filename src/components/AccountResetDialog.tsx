import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import AlertDialogContent from "@/components/WorkspaceAlertDialogContent";
import {AlertDialog,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter} from "@/components/ui/alert-dialog";
import {Button} from "@/components/WorkspaceButton";
import {api} from "@/lib/api";

type Preview={version:string;counts:Record<string,number>};
export default function AccountResetDialog({onClose}:{onClose:()=>void}){
 const client=useQueryClient(),[confirmation,setConfirmation]=useState("");
 const preview=useQuery({queryKey:["account-reset-preview"],queryFn:()=>api<Preview>("accounts/reset"),staleTime:0,refetchOnWindowFocus:false});
 const reset=useMutation({mutationFn:()=>api("accounts/reset",{method:"POST",body:JSON.stringify({version:preview.data?.version,confirmation})}),onSuccess:async()=>{await client.invalidateQueries();onClose();}});
 return <AlertDialog open onOpenChange={open=>{if(!open&&!reset.isPending)onClose();}}><AlertDialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={event=>{if(reset.isPending)event.preventDefault();}} onCloseAutoFocus={event=>{event.preventDefault();const trigger=document.getElementById("account-reset-trigger") as HTMLButtonElement|null;(trigger&&!trigger.disabled?trigger:document.getElementById("main"))?.focus();}}>
  <AlertDialogHeader><AlertDialogTitle>Remove all accounts and statements</AlertDialogTitle><AlertDialogDescription>This permanently deletes every account in your workspace, linked transactions and transfers, bills, payment methods, statement history, reconciliation records, and linked original statement files. Budgets, goals, categories, login, and unlinked uploads stay unchanged. Export first. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
  {preview.isPending?<p role="status">Loading reset preview…</p>:preview.error?<p role="alert" className="text-destructive">{preview.error.message}</p>:preview.data&&<><dl className="grid grid-cols-2 gap-3">{Object.entries(preview.data.counts).filter(([,count])=>count>0).map(([label,count])=><div key={label} className="min-w-0"><dt className="break-words capitalize">{label.replace(/_/g," ")}</dt><dd>{count}</dd></div>)}</dl><label>Type DELETE ALL ACCOUNTS to confirm<input className="field" autoComplete="off" value={confirmation} disabled={reset.isPending} onChange={event=>setConfirmation(event.target.value)} aria-describedby="account-reset-warning"/></label></>}
  <p id="account-reset-warning" className="text-sm text-muted-foreground">All current accounts will be removed. You can then add fresh accounts.</p>
  {reset.error&&<p role="alert" className="break-words text-destructive">{reset.error.message}</p>}
  {reset.isPending&&<p role="status">Deleting accounts and statements…</p>}
  <AlertDialogFooter className="dialog-actions"><Button data-dialog-cancel variant="outline" disabled={reset.isPending} onClick={onClose}>Cancel deletion</Button><Button variant="destructive" className="h-auto min-h-11 whitespace-normal" disabled={reset.isPending||preview.isFetching||Boolean(preview.error)||!preview.data||confirmation!=="DELETE ALL ACCOUNTS"} aria-busy={reset.isPending} onClick={()=>reset.mutate()}>{reset.isPending?"Deleting…":"Remove all accounts permanently"}</Button></AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}
