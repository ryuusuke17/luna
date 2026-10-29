import {ArrowDownLeft,ArrowLeftRight,ArrowUpRight,CalendarClock,SlidersHorizontal,Undo2,Wallet} from "lucide-react";
import {transactionTypeLabel} from "@/lib/transactions";

export default function TransactionTypeIcon({type,decorative=false}:{type:string;decorative?:boolean}){
 const Icon=({income:ArrowDownLeft,expense:ArrowUpRight,installment:CalendarClock,transfer:ArrowLeftRight,refund:Undo2,opening:Wallet,adjustment:SlidersHorizontal}[type]??SlidersHorizontal);
 const color=({income:"text-[hsl(var(--success))]",expense:"text-destructive",installment:"text-[hsl(var(--warning))]",transfer:"text-[hsl(var(--chart-4))]",refund:"text-[hsl(var(--chart-2))]",opening:"text-[hsl(var(--chart-1))]",adjustment:"text-muted-foreground"}[type]??"text-muted-foreground");
 return <span className={`inline-flex shrink-0 items-center ${color}`} title={transactionTypeLabel(type)} aria-hidden={decorative||undefined}><Icon size={18} aria-hidden/>{!decorative&&<span className="sr-only">{transactionTypeLabel(type)}</span>}</span>;
}
