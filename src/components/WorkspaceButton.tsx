import {forwardRef} from "react";
import {Button as BaseButton,type ButtonProps} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export const Button=forwardRef<HTMLButtonElement,ButtonProps>(({className,...props},ref)=><BaseButton ref={ref} {...props} className={cn("min-h-12 rounded-full px-5 text-sm font-semibold shadow-none active:opacity-80",props.size==="icon"&&"size-12 p-0",className)}/>);
Button.displayName="WorkspaceButton";
