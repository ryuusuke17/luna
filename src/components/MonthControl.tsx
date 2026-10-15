import {useState} from "react";
import {Button} from "@/components/WorkspaceButton";
import {Calendar,ChevronLeft,ChevronRight} from "lucide-react";

export default function MonthControl({month,onChange,defaultOpen=true}:{month:string;onChange:(month:string)=>void;defaultOpen?:boolean}){
 const [open,setOpen]=useState(defaultOpen);
 function move(delta:number){
  const date=new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth()+delta);
  onChange(date.toISOString().slice(0,7));
 }
 const formatted=new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
 return <div className="inline-flex min-w-0 items-center gap-1 rounded-full border bg-card p-1">
  <Button
   variant="ghost"
   size="icon"
   className="size-11 min-h-11 shrink-0 rounded-full"
   aria-label={open?"Hide date filter":"Show date filter"}
   aria-expanded={open}
   onClick={()=>setOpen(o=>!o)}
  >
   <Calendar size={18} aria-hidden/>
  </Button>
  {open?(
   <>
    <Button variant="ghost" size="icon" className="size-11 min-h-11 shrink-0 rounded-full" aria-label="Previous month" onClick={()=>move(-1)}>
     <ChevronLeft size={18} aria-hidden/>
    </Button>
    <label className="min-w-0">
     <span className="sr-only">Selected month</span>
     <input className="min-h-11 min-w-0 max-w-full bg-transparent px-1 text-sm font-medium" type="month" value={month} onChange={e=>{if(e.target.value)onChange(e.target.value);}}/>
    </label>
    <Button variant="ghost" size="icon" className="size-11 min-h-11 shrink-0 rounded-full" aria-label="Next month" onClick={()=>move(1)}>
     <ChevronRight size={18} aria-hidden/>
    </Button>
   </>
  ):(
   <button
    type="button"
    className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-foreground hover:underline"
    onClick={()=>setOpen(true)}
    aria-label={`Current month: ${formatted}. Click to change.`}
   >
    {formatted}
   </button>
  )}
 </div>;
}
