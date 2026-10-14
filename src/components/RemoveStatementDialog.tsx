import {useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {api,send} from "@/lib/api";
import {Dialog,DialogTrigger,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import WorkspaceDialogContent from "@/components/WorkspaceDialogContent";
import {Button} from "@/components/WorkspaceButton";

export default function RemoveStatementDialog({id,filename,disabled,onRemoved}:{id:number;filename:string;disabled:boolean;onRemoved:()=>void}){
 const client=useQueryClient(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const removed=useRef(false);
 const detail=useQuery({queryKey:["statement-removal",id],queryFn:()=>api<{version:string;status:string;entries:{action?:string}[];reconciliation?:unknown}>(`statements/${id}`),enabled:open,staleTime:0});
 const removable=detail.data&&["failed","needs_attention","ready_for_review"].includes(detail.data.status)&&!detail.data.entries.some(e=>e.action)&&!detail.data.reconciliation;
 async function remove(){
  if(busy||!removable||!detail.data)return;
  setBusy(true);setError("");
  try{await send(`statements/${id}`,{action:"remove",version:detail.data.version});removed.current=true;setOpen(false);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy){setError("");setOpen(value);}}}>
 <DialogTrigger asChild><Button variant="outline" disabled={disabled} aria-label={`Remove ${filename}`}>Remove</Button></DialogTrigger>
 <WorkspaceDialogContent className="max-w-lg break-words [&_button]:max-w-full [&_button]:whitespace-normal [&>button]:hidden" onFocusCapture={e=>{const bounds=e.currentTarget.getBoundingClientRect(),target=e.target.getBoundingClientRect();if(target.top<bounds.top||target.bottom>bounds.bottom)e.target.scrollIntoView({block:"nearest"});}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onInteractOutside={e=>{if(busy)e.preventDefault();}} onCloseAutoFocus={e=>{if(removed.current){e.preventDefault();onRemoved();client.removeQueries({queryKey:["statement-removal",id]});void client.invalidateQueries({queryKey:["statements"]});}}}>
 <DialogTitle>Remove uploaded statement?</DialogTitle>
 <DialogDescription>This permanently deletes the original CSV and staged rows. It cannot be undone. Ledger transactions stay unchanged. Approved or reconciled statements cannot be removed.</DialogDescription>
 <p className="break-all font-semibold">{filename}</p>
 {detail.isFetching&&<p role="status">Checking statement…</p>}
 {detail.error&&<p role="alert" className="text-destructive">{detail.error.message}</p>}
 {detail.data&&!removable&&<p role="alert" className="text-destructive">Only unapproved uploads can be removed. This statement must be kept.</p>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 <form aria-busy={busy} className="grid gap-4" onSubmit={e=>{e.preventDefault();remove();}}>
 {busy&&<p role="status">Removing statement… Keep this dialog open.</p>}
 <div className="flex flex-wrap gap-3"><Button autoFocus variant="outline" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy||detail.isFetching||Boolean(detail.error)||!removable}>{busy?"Removing…":"Remove statement permanently"}</Button></div>
 </form>
 </WorkspaceDialogContent></Dialog>;
}
