import {useRef,type ComponentProps} from "react";
import {AlertDialogContent} from "@/components/ui/alert-dialog";
import {cn} from "@/lib/utils";

export default function WorkspaceAlertDialogContent({children,className,...props}:ComponentProps<typeof AlertDialogContent>){
 const content=useRef<HTMLDivElement>(null);
 return <AlertDialogContent {...props} ref={content} className={cn("workspace-dialog",className)} onFocusCapture={event=>{props.onFocusCapture?.(event);const bounds=event.currentTarget.getBoundingClientRect(),target=event.target.getBoundingClientRect();if(target.top<bounds.top||target.bottom>bounds.bottom)event.target.scrollIntoView({block:"nearest"});}} onOpenAutoFocus={event=>{props.onOpenAutoFocus?.(event);if(!event.defaultPrevented){event.preventDefault();(content.current?.querySelector<HTMLElement>('[data-dialog-cancel]:not(:disabled)')??content.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]'))?.focus();}}}><div className="dialog-scroll space-y-3">{children}</div></AlertDialogContent>;
}
