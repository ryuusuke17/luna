import {forwardRef} from "react";
import {Button as BaseButton,type ButtonProps} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export const Button=forwardRef<HTMLButtonElement,ButtonProps>(({className,...props},ref)=><BaseButton ref={ref} {...props} className={cn("workspace-button rounded-full px-4 text-sm font-semibold shadow-none active:opacity-80",props.size==="icon"&&"workspace-icon p-0",className)}/>);
Button.displayName="WorkspaceButton";
