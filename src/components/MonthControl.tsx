import {useState,useRef,useEffect} from "react";
import {Button} from "@/components/WorkspaceButton";
import {Calendar,ChevronLeft,ChevronRight} from "lucide-react";

export default function MonthControl({month,onChange}:{month:string;onChange:(month:string)=>void}){
 const [open,setOpen]=useState(false),dateInput=useRef<HTMLInputElement>(null);
 function move(delta:number){
  const date=new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth()+delta);
  onChange(date.toISOString().slice(0,7));
 }
 const formatted=new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
 useEffect(()=>{
  if(open&&dateInput.current){
   dateInput.current.focus();
   try{dateInput.current.showPicker?.();}catch{}
  }
 },[open]);

 return <div className="inline-flex min-w-0 items-center gap-1 rounded-full border bg-card p-1">
  <Button
   variant="ghost"
   size="icon"
   className="size-11 min-h-11 shrink-0 rounded-full"
   aria-label="Previous month"
   onClick={()=>move(-1)}
  >
   <ChevronLeft size={18} aria-hidden/>
  </Button>

  {!open?(
   <button
    type="button"
    className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-foreground hover:underline"
    onClick={()=>setOpen(true)}
    aria-label={`Selected month: ${formatted}. Click to choose month.`}
    aria-expanded={false}
   >
    <Calendar size={16} className="text-muted-foreground" aria-hidden/>
    <span>{formatted}</span>
   </button>
  ):(
   <label className="inline-flex min-w-0 items-center gap-1.5 px-2">
    <Calendar size={16} className="text-muted-foreground shrink-0" aria-hidden/>
    <span className="sr-only">Selected month</span>
    <input
     ref={dateInput}
     className="min-h-11 min-w-0 max-w-full bg-transparent text-sm font-medium focus:outline-none"
     type="month"
     value={month}
     onBlur={()=>setOpen(false)}
     onChange={e=>{
      if(e.target.value){
       onChange(e.target.value);
       setOpen(false);
      }
     }}
    />
   </label>
  )}

  <Button
   variant="ghost"
   size="icon"
   className="size-11 min-h-11 shrink-0 rounded-full"
   aria-label="Next month"
   onClick={()=>move(1)}
  >
   <ChevronRight size={18} aria-hidden/>
  </Button>
 </div>;
}
