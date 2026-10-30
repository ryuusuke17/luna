import type {ReactNode} from "react";
import {useId} from "react";
import DialogContent from "@/components/WorkspaceDialogContent";
import TransactionTypeIcon from "@/components/TransactionTypeIcon";
import {Dialog,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {formatMoney} from "@/lib/finance";

export type TransactionDetailField={label:string;value:ReactNode;className?:string};

type Props={
 open:boolean;
 onOpenChange:(open:boolean)=>void;
 title:ReactNode;
 amount:number;
 currency?:string;
 type:string;
 typeLabel:string;
 amountBreakdown?:ReactNode;
 details:TransactionDetailField[];
 supplemental?:ReactNode;
 actions?:ReactNode;
};

export default function TransactionDetailsDialog({open,onOpenChange,title,amount,currency="PHP",type,typeLabel,amountBreakdown,details,supplemental,actions}:Props){
 const breakdownId=useId(),detailsId=useId();
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="transaction-details-dialog">
   <DialogHeader><DialogTitle className="text-xl leading-snug">{title}</DialogTitle><DialogDescription className="sr-only">Amount, breakdown and record details.</DialogDescription></DialogHeader>
   <div className="space-y-5">
    <section aria-label="Transaction amount" className="rounded-lg border bg-secondary p-4 sm:p-5">
     <p className="text-3xl font-semibold tabular-nums">{formatMoney(amount,currency)}</p>
     <p className="mt-3 flex items-center gap-2 text-sm font-medium"><TransactionTypeIcon type={type}/>{typeLabel}</p>
    </section>
    {amountBreakdown&&<section aria-labelledby={breakdownId}>
     <h3 id={breakdownId} className="mb-3 text-base font-semibold">Amount breakdown</h3>
     {amountBreakdown}
    </section>}
    <section aria-labelledby={detailsId}>
     <h3 id={detailsId} className="mb-3 text-base font-semibold">Transaction details</h3>
     <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 sm:p-5 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:font-medium">
      {details.map(field=><div key={field.label} className={field.className}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
     </dl>
    </section>
    {supplemental}
    {actions&&<div className="dialog-actions">{actions}</div>}
   </div>
  </DialogContent>
 </Dialog>;
}
