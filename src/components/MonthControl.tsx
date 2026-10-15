import {useId,useRef,useState} from "react";
import {Button} from "@/components/WorkspaceButton";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {CalendarDays,ChevronLeft,ChevronRight} from "lucide-react";
import {isCalendarDate} from "@/lib/finance";
import {adjacentTransactionMonth,transactionDateLabel} from "@/lib/transaction-filters";

export default function MonthControl({month,onChange}:{month:string;onChange:(month:string)=>void}){
 const id=useId(),input=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(month),[error,setError]=useState("");
 const params=new URLSearchParams({month}),label=transactionDateLabel(params);
 const previous=adjacentTransactionMonth(params,-1),next=adjacentTransactionMonth(params,1);
 function changeOpen(value:boolean){
  setDraft(month);
  setError("");
  setOpen(value);
 }

 return <Popover open={open} onOpenChange={changeOpen}>
  <div role="group" aria-label="Month navigation" className="flex min-w-0 max-w-full rounded-full border border-input bg-background text-foreground sm:max-w-sm">
   <Button type="button" variant="ghost" size="icon" className="relative h-auto min-h-11 min-w-11 shrink-0 rounded-r-none focus-visible:z-10" aria-label="Previous month" disabled={!previous} onClick={()=>previous&&onChange(previous)}>
    <ChevronLeft aria-hidden="true"/>
   </Button>
   <PopoverTrigger asChild>
    <Button type="button" variant="ghost" className="relative h-auto min-h-11 min-w-11 flex-1 gap-2 whitespace-normal rounded-none px-2 text-center focus-visible:z-10" aria-label={`Selected month: ${label}`}>
     <CalendarDays className="size-4 shrink-0" aria-hidden="true"/>
     <span className="min-w-0 break-words">{label}</span>
    </Button>
   </PopoverTrigger>
   <Button type="button" variant="ghost" size="icon" className="relative h-auto min-h-11 min-w-11 shrink-0 rounded-l-none focus-visible:z-10" aria-label="Next month" disabled={!next} onClick={()=>next&&onChange(next)}>
    <ChevronRight aria-hidden="true"/>
   </Button>
  </div>
  <PopoverContent align="start" collisionPadding={16} className="max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-5 shadow-none" aria-labelledby={`${id}-title`}>
   <form noValidate onSubmit={event=>{
    event.preventDefault();
    if(!isCalendarDate(`${draft}-01`)){
     setError("Choose a valid month from 0100-01 to 9999-12.");
     input.current?.focus();
     return;
    }
    onChange(draft);
    changeOpen(false);
   }}>
    <h2 id={`${id}-title`} className="text-lg font-semibold">Choose month</h2>
    <label htmlFor={`${id}-month`} className="mt-4 block">Month</label>
    <input ref={input} id={`${id}-month`} className="field min-h-11 max-w-full" type="month" min="0100-01" max="9999-12" required placeholder="YYYY-MM" value={draft} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error?` ${id}-error`:""}`} onChange={event=>{
     setDraft(event.target.value);
     setError("");
    }}/>
    <p id={`${id}-hint`} className="mt-2 text-sm text-muted-foreground">Select a month, or enter YYYY-MM.</p>
    {error&&<p id={`${id}-error`} role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
     <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={()=>changeOpen(false)}>Cancel</Button>
     <Button type="submit" className="min-h-11 min-w-11">Apply</Button>
    </div>
   </form>
  </PopoverContent>
 </Popover>;
}
