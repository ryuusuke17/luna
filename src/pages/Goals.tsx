import AlertDialogContent from "@/components/WorkspaceAlertDialogContent";
import RecordActions from "@/components/RecordActions";
import {usePageAction} from "@/components/PageAction";
import {AlertDialog,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter} from "@/components/ui/alert-dialog";
import DialogContent from "@/components/WorkspaceDialogContent";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Dialog,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/WorkspaceButton";
import {Pencil,Trash2} from "lucide-react";
import {api,send} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import {decimalMoney} from "@/lib/csv";
import "./Goals.css";
type Goal={version:string;id:number;name:string;target:number;allocated:number;due_date:string|null;notes:string;contributions:{id:number;amount:number;posted_date:string;notes:string}[]};
type GoalMutation={path:string;body:unknown;previousGoal?:Pick<Goal,"id"|"name"|"target"|"allocated">};
const CONFETTI_COLORS=["#111111","#f1bd4b","#e66d58","#6386d8","#7aa88d"];
const CONFETTI_PIECES=Array.from({length:68},(_,index)=>{
 const style={
  left:`${(index*37)%100}%`,
  width:`${5+(index*7)%5}px`,
  height:`${8+(index*11)%8}px`,
  backgroundColor:CONFETTI_COLORS[index%CONFETTI_COLORS.length],
  animationDelay:`${(index%7)*0.035}s`,
  animationDuration:`${2.8+(index%5)*0.22}s`,
  "--goal-confetti-drift":`${(index*53)%241-120}px`,
  "--goal-confetti-spin":`${(index*113)%721-360}deg`,
 } as CSSProperties;
 return <span key={index} className="goal-confetti-piece" style={style}/>;
});
export default function Goals(){const client=useQueryClient(),[view,setView]=useState("active"),[edit,setEdit]=useState<Goal|null|undefined>(),[allocation,setAllocation]=useState<Goal|null>(null),[status,setStatus]=useState(""),[error,setError]=useState(""),[deleting,setDeleting]=useState<Goal|null>(null),[celebration,setCelebration]=useState<{goalName:string;id:number}|null>(null),key=useRef(crypto.randomUUID()),celebrationKey=useRef(0);const query=useQuery({queryKey:["goals"],queryFn:()=>api<Goal[]>("goals")});const mutation=useMutation({mutationFn:({path,body}:GoalMutation)=>send(path,body),onSuccess:async(_,variables)=>{await client.invalidateQueries();const previousGoal=variables.previousGoal;const updatedGoal=previousGoal&&client.getQueryData<Goal[]>(["goals"])?.find(goal=>goal.id===previousGoal.id);const metGoal=previousGoal&&previousGoal.allocated<previousGoal.target&&updatedGoal&&updatedGoal.allocated>=updatedGoal.target?updatedGoal:undefined;if(metGoal)setCelebration({goalName:metGoal.name,id:++celebrationKey.current});setStatus(metGoal?`Goal met: ${metGoal.name}!` : "Changes saved.");setEdit(undefined);setAllocation(null);setError("");key.current=crypto.randomUUID();},onError:(e:Error)=>setError(e.message)});const deletion=useMutation({mutationFn:()=>api(`goals/${deleting?.id}`,{method:"DELETE",body:JSON.stringify({expected:deleting?.version})}),onSuccess:()=>{client.invalidateQueries();setStatus("Goal and allocations deleted. Account funds remain unchanged.");setDeleting(null);document.getElementById("main")?.focus();},onError:(e:Error)=>setError(e.message)});const rows=query.data??[],visible=rows.filter(g=>view==="active"?g.allocated<g.target:g.allocated>=g.target);useEffect(()=>{if(!celebration)return;const id=celebration.id;const timeout=window.setTimeout(()=>setCelebration(current=>current?.id===id?null:current),4300);return()=>window.clearTimeout(timeout);},[celebration]);function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(mutation.isPending)return;const f=new FormData(e.currentTarget);mutation.mutate({path:"goals",body:{id:edit?.id,version:edit?.version,name:f.get("name"),target:f.get("target"),dueDate:f.get("due"),notes:f.get("notes")},previousGoal:edit?{id:edit.id,name:edit.name,target:edit.target,allocated:edit.allocated}:undefined});}function contribute(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(mutation.isPending)return;const f=new FormData(e.currentTarget);mutation.mutate({path:"goal-contributions",body:{goalId:allocation?.id,amount:f.get("amount"),date:f.get("date"),notes:f.get("notes"),requestKey:key.current},previousGoal:allocation?{id:allocation.id,name:allocation.name,target:allocation.target,allocated:allocation.allocated}:undefined});}
usePageAction("Create goal",()=>{setError("");setEdit(null);});
return <>{celebration&&<div key={celebration.id} className="goal-confetti" aria-hidden="true">{CONFETTI_PIECES}</div>}{status&&<p role="status" className="mb-3">{status}</p>}<header className="page-heading"><div><h1>Goals</h1><p className="mt-2 text-muted-foreground">Allocate toward what matters. No account balance or net worth changes.</p></div></header><div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Allocated",formatMoney(rows.reduce((n,g)=>n+g.allocated,0))],["Target",formatMoney(rows.reduce((n,g)=>n+g.target,0))],["Active",String(rows.filter(g=>g.allocated<g.target).length)],["Achieved",String(rows.filter(g=>g.allocated>=g.target).length)]].map(([label,value])=><article key={label} className="panel"><p className="text-sm text-muted-foreground">{label}</p><p className="metric">{query.isPending||query.error?"—":value}</p></article>)}</div><Tabs value={view} onValueChange={setView}><TabsList className="mb-5 h-auto"><TabsTrigger className="min-h-11" value="active">Active</TabsTrigger><TabsTrigger className="min-h-11" value="achieved">Achieved</TabsTrigger></TabsList><TabsContent value={view}>{query.isPending?<p role="status">Loading goals…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:!visible.length?<div className="panel">{rows.length?`No ${view} goals.`:"No goals yet. Create a target to begin."}</div>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(g=><GoalCard key={g.id} goal={g} onAllocate={goal=>{setAllocation(goal);setError("");key.current=crypto.randomUUID();}} onEdit={goal=>{setEdit(goal);setError("");}} onDelete={goal=>{setDeleting(goal);setError("");}} onContributionDeleted={()=>setStatus("Contribution deleted. Goal allocation updated. Account balances unchanged.")} onContributionUpdated={(previous,updated)=>{const reachedTarget=previous.allocated<previous.target&&updated.allocated>=updated.target;if(reachedTarget){setCelebration({goalName:updated.name,id:++celebrationKey.current});setStatus(`Goal met: ${updated.name}!`);}else setStatus("Contribution updated.");}}/>)}</div>}</TabsContent></Tabs>
<Dialog open={edit!==undefined} onOpenChange={v=>{if(!v&&!mutation.isPending)setEdit(undefined);}}><DialogContent onEscapeKeyDown={e=>{if(mutation.isPending)e.preventDefault();}} onPointerDownOutside={e=>{if(mutation.isPending)e.preventDefault();}}><DialogHeader><DialogTitle>{edit?"Edit goal":"Create goal"}</DialogTitle><DialogDescription>Targets are planning records, not separate bank balances.</DialogDescription></DialogHeader><form onSubmit={save} aria-busy={mutation.isPending}><fieldset disabled={mutation.isPending} className="grid gap-3"><label>Goal name<input className="field" name="name" maxLength={80} required defaultValue={edit?.name}/></label><label>Target · PHP<input className="field" name="target" inputMode="decimal" required defaultValue={edit?decimalMoney(edit.target):""} aria-invalid={Boolean(error)} aria-describedby={error?"goal-error":undefined}/></label><label>Target date · optional<input className="field" type="date" name="due" defaultValue={edit?.due_date??""}/></label><label>Notes<input className="field" name="notes" maxLength={240} defaultValue={edit?.notes}/></label></fieldset>{error&&<p id="goal-error" role="alert" className="mt-3 text-destructive">{error}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setEdit(undefined)}>Cancel</Button><Button disabled={mutation.isPending} aria-busy={mutation.isPending}>{mutation.isPending?"Saving…":"Save goal"}</Button></div></form></DialogContent></Dialog>
<Dialog open={Boolean(allocation)} onOpenChange={v=>{if(!v&&!mutation.isPending)setAllocation(null);}}><DialogContent onEscapeKeyDown={e=>{if(mutation.isPending)e.preventDefault();}} onPointerDownOutside={e=>{if(mutation.isPending)e.preventDefault();}}><DialogHeader><DialogTitle>Allocate to {allocation?.name}</DialogTitle><DialogDescription>No money is moved. Account balances and net worth stay unchanged.</DialogDescription></DialogHeader><form onSubmit={contribute} aria-busy={mutation.isPending}><fieldset disabled={mutation.isPending} className="grid gap-3"><label>Allocation · PHP<input className="field" name="amount" required inputMode="decimal" aria-invalid={Boolean(error)} aria-describedby={error?"allocation-error":undefined}/></label><label>Date<input className="field" name="date" type="date" required max={new Date().toISOString().slice(0,10)} defaultValue={new Date().toISOString().slice(0,10)}/></label><label>Notes<input className="field" name="notes" maxLength={240}/></label></fieldset>{error&&<p id="allocation-error" role="alert" className="mt-3 text-destructive">{error}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setAllocation(null)}>Cancel</Button><Button disabled={mutation.isPending} aria-busy={mutation.isPending}>{mutation.isPending?"Recording…":"Record allocation"}</Button></div></form></DialogContent></Dialog><AlertDialog open={Boolean(deleting)} onOpenChange={v=>{if(!v&&!deletion.isPending)setDeleting(null);}}><AlertDialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={e=>{e.preventDefault();document.getElementById("main")?.focus();}} onEscapeKeyDown={e=>{if(deletion.isPending)e.preventDefault();}}><AlertDialogHeader><AlertDialogTitle className="break-words">Delete goal {deleting?.name}</AlertDialogTitle><AlertDialogDescription>This permanently deletes the goal and {deleting?.contributions.length} contributions totaling {formatMoney(deleting?.allocated??0)}. Account funds do not change. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>{error&&<p role="alert" className="text-destructive">{error}</p>}<AlertDialogFooter className="dialog-actions"><Button data-dialog-cancel variant="outline" disabled={deletion.isPending} onClick={()=>setDeleting(null)}>Cancel deletion</Button><Button variant="destructive" disabled={deletion.isPending} aria-busy={deletion.isPending} onClick={()=>deletion.mutate()}>{deletion.isPending?"Deleting…":"Delete goal and allocations permanently"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

type GoalCardProps={goal:Goal;onAllocate:(goal:Goal)=>void;onEdit:(goal:Goal)=>void;onDelete:(goal:Goal)=>void;onContributionDeleted:()=>void;onContributionUpdated:(previous:Goal,updated:Goal)=>void};
function GoalCard({goal,onAllocate,onEdit,onDelete,onContributionDeleted,onContributionUpdated}:GoalCardProps){
 const [historyOpen,setHistoryOpen]=useState(false);
 const [deletingContribution,setDeletingContribution]=useState<Goal["contributions"][number]|null>(null);
 const [editingContribution,setEditingContribution]=useState<Goal["contributions"][number]|null>(null);
 const [deleteError,setDeleteError]=useState("");
 const [editError,setEditError]=useState("");
 const client=useQueryClient();
 const contributionDeletion=useMutation({mutationFn:(contribution:Goal["contributions"][number])=>api(`goal-contributions/${contribution.id}`,{method:"DELETE",body:JSON.stringify({goalId:goal.id,expected:goal.version})}),onSuccess:async()=>{await client.invalidateQueries({queryKey:["goals"]});setDeletingContribution(null);setDeleteError("");onContributionDeleted();},onError:(error:Error)=>setDeleteError(error.message)});
 const contributionUpdate=useMutation({mutationFn:(values:{contribution:Goal["contributions"][number];previousGoal:Goal;amount:string;date:string;notes:string})=>api(`goal-contributions/${values.contribution.id}`,{method:"PATCH",body:JSON.stringify({goalId:values.previousGoal.id,expected:values.previousGoal.version,amount:values.amount,date:values.date,notes:values.notes})}),onSuccess:async(_,values)=>{await client.invalidateQueries({queryKey:["goals"]});const updatedGoal=client.getQueryData<Goal[]>(["goals"])?.find(item=>item.id===values.previousGoal.id);setEditingContribution(null);setEditError("");if(updatedGoal)onContributionUpdated(values.previousGoal,updatedGoal);},onError:(error:Error)=>setEditError(error.message)});
 function updateContribution(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(contributionUpdate.isPending||!editingContribution)return;const form=new FormData(event.currentTarget);contributionUpdate.mutate({contribution:editingContribution,previousGoal:goal,amount:String(form.get("amount")??""),date:String(form.get("date")??""),notes:String(form.get("notes")??"")});}
 return <>
  <article className="panel flex h-full min-w-0 flex-col gap-3 p-4">
   <header className="record-line items-start">
    <div className="min-w-0"><h2 className="break-words">{goal.name}</h2><p className="mt-1 text-sm text-muted-foreground">{goal.due_date?`Target ${goal.due_date}`:"No target date"}</p></div>
    <RecordActions name={goal.name} actions={[{label:"Edit goal",onSelect:()=>onEdit(goal)},{label:"Delete goal",destructive:true,onSelect:()=>onDelete(goal)}]}/>
   </header>
   <div><p className="metric !mt-0">{formatMoney(goal.allocated)}</p><p className="mt-1 text-sm text-muted-foreground">of {formatMoney(goal.target)} target</p></div>
   <div role="progressbar" aria-label={`${goal.name} allocation`} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={Math.min(goal.target,goal.allocated)} aria-valuetext={`${formatMoney(goal.allocated)} allocated toward ${formatMoney(goal.target)}; ${Math.round(goal.allocated/goal.target*100)} percent`} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${Math.min(100,goal.allocated/goal.target*100)}%`}}/></div>
   {goal.notes&&<p className="text-sm text-muted-foreground">{goal.notes}</p>}
   <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
    <Button className="min-h-11 w-full justify-center px-2 text-center text-sm" onClick={()=>onAllocate(goal)}>Add allocation</Button>
    <Button type="button" variant="outline" className="min-h-11 w-full justify-center px-2 text-center text-sm" onClick={()=>setHistoryOpen(true)}>Contribution history ({goal.contributions.length})</Button>
   </div>
  </article>
  <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
   <DialogContent className="max-w-xl">
    <DialogHeader>
     <DialogTitle>Contribution history</DialogTitle>
     <DialogDescription>{goal.contributions.length} {goal.contributions.length===1?"contribution":"contributions"} for {goal.name}. Allocations do not change account balances.</DialogDescription>
    </DialogHeader>
    {goal.contributions.length?<div className="max-h-[60dvh] overflow-y-auto"><ul className="record-list divide-y rounded-lg border">{goal.contributions.map(contribution=><li key={contribution.id} className="flex flex-wrap items-start justify-between gap-3 py-3 !pl-3 !pr-1"><div className="min-w-0 flex-1"><p className="font-medium">{contribution.notes||"Goal allocation"}</p><p className="mt-1 text-sm text-muted-foreground">{contribution.posted_date}</p></div><div className="flex shrink-0 items-center gap-0"><strong className="mr-2 tabular-nums">{formatMoney(contribution.amount)}</strong><Button type="button" variant="ghost" size="icon" className="!w-11 min-h-11 min-w-0 text-muted-foreground" aria-label={`Edit contribution ${formatMoney(contribution.amount)} on ${contribution.posted_date}`} disabled={contributionDeletion.isPending||contributionUpdate.isPending} onClick={()=>{setHistoryOpen(false);setEditError("");setEditingContribution(contribution);}}><Pencil size={17} aria-hidden="true"/></Button><Button type="button" variant="ghost" size="icon" className="!w-11 min-h-11 min-w-0 text-destructive" aria-label={`Delete contribution ${formatMoney(contribution.amount)} on ${contribution.posted_date}`} disabled={contributionDeletion.isPending||contributionUpdate.isPending} onClick={()=>{setDeleteError("");setDeletingContribution(contribution);}}><Trash2 size={17} aria-hidden="true"/></Button></div></li>)}</ul></div>:<p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">No contributions recorded for this goal yet.</p>}
    <Button type="button" className="w-full" onClick={()=>{setHistoryOpen(false);onAllocate(goal);}}>Add contribution</Button>
   </DialogContent>
  </Dialog>
  <Dialog open={Boolean(editingContribution)} onOpenChange={open=>{if(!open&&!contributionUpdate.isPending){setEditingContribution(null);setEditError("");}}}>
   <DialogContent onEscapeKeyDown={event=>{if(contributionUpdate.isPending)event.preventDefault();}} onPointerDownOutside={event=>{if(contributionUpdate.isPending)event.preventDefault();}}>
    <DialogHeader>
     <DialogTitle>Edit contribution</DialogTitle>
     <DialogDescription>Update this goal allocation. Account balances do not change.</DialogDescription>
    </DialogHeader>
    {editingContribution&&<form key={editingContribution.id} onSubmit={updateContribution} aria-busy={contributionUpdate.isPending}>
     <fieldset disabled={contributionUpdate.isPending} className="grid gap-3">
      <label>Contribution · PHP<input className="field" name="amount" inputMode="decimal" required defaultValue={decimalMoney(editingContribution.amount)} aria-invalid={Boolean(editError)} aria-describedby={editError?"contribution-edit-error":undefined}/></label>
      <label>Date<input className="field" type="date" name="date" required max={new Date().toISOString().slice(0,10)} defaultValue={editingContribution.posted_date}/></label>
      <label>Notes<input className="field" name="notes" maxLength={240} defaultValue={editingContribution.notes}/></label>
     </fieldset>
     {editError&&<p id="contribution-edit-error" role="alert" className="mt-3 text-destructive">{editError}</p>}
     <div className="dialog-actions"><Button type="button" variant="outline" disabled={contributionUpdate.isPending} onClick={()=>setEditingContribution(null)}>Cancel</Button><Button disabled={contributionUpdate.isPending} aria-busy={contributionUpdate.isPending}>{contributionUpdate.isPending?"Saving…":"Save contribution"}</Button></div>
    </form>}
   </DialogContent>
  </Dialog>
  <AlertDialog open={Boolean(deletingContribution)} onOpenChange={open=>{if(!open&&!contributionDeletion.isPending){setDeletingContribution(null);setDeleteError("");}}}>
   <AlertDialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={event=>{if(contributionDeletion.isPending)event.preventDefault();}} onPointerDownOutside={event=>{if(contributionDeletion.isPending)event.preventDefault();}}>
    <AlertDialogHeader>
     <AlertDialogTitle>Delete this contribution?</AlertDialogTitle>
     <AlertDialogDescription>This removes {formatMoney(deletingContribution?.amount??0)} from {goal.name}’s allocated total. Account balances do not change. This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    {deleteError&&<p role="alert" className="text-destructive">{deleteError}</p>}
    <AlertDialogFooter className="dialog-actions">
     <Button type="button" data-dialog-cancel variant="outline" disabled={contributionDeletion.isPending} onClick={()=>setDeletingContribution(null)}>Cancel</Button>
     <Button type="button" variant="destructive" disabled={contributionDeletion.isPending||!deletingContribution} aria-busy={contributionDeletion.isPending} onClick={()=>{if(deletingContribution)contributionDeletion.mutate(deletingContribution);}}>{contributionDeletion.isPending?"Deleting…":"Delete contribution"}</Button>
    </AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </>;
}
