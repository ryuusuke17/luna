import {useRef} from "react";
import {MoreHorizontal} from "lucide-react";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/WorkspaceButton";

type Action={label:string;onSelect:()=>void;destructive?:boolean;disabled?:boolean};
export default function RecordActions({name,actions}:{name:string;actions:Action[]}){
 const trigger=useRef<HTMLButtonElement>(null),selected=useRef<(()=>void)|null>(null);
 return <DropdownMenu><DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" size="icon" aria-label={`More actions for ${name}`}><MoreHorizontal size={20} aria-hidden/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]" onCloseAutoFocus={event=>{if(selected.current){event.preventDefault();trigger.current?.focus();const action=selected.current;selected.current=null;action();}}}>{actions.map(action=><DropdownMenuItem key={action.label} disabled={action.disabled} className={`min-h-11 cursor-pointer ${action.destructive?"text-destructive focus:text-destructive":""}`} onSelect={()=>{selected.current=action.onSelect;}}>{action.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
