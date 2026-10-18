import type { ReactNode, Ref } from "react";
import { CalendarDays, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AccountIdentity } from "@/components/AccountCard";
import { accountLabels, utilization, type Account } from "@/lib/accounts";
import { formatMoney } from "@/lib/finance";

const sourceLabels={issued:"Issued credit-card statement",bank:"Bank-statement upload",archive:"Legacy reference archive",historical:"Historical statement import"};

export default function AccountOverview({ account, headingRef, children }: { account: Account; headingRef: Ref<HTMLHeadingElement>; children: ReactNode }) {
  const credit=account.type==="credit_card",usage=credit?utilization(account):null;
  const snapshots=credit&&account.display?.source==="statement"?account.display.snapshots.filter(s=>s.amount!==null):[];
  const percent=usage?Math.min(100,Math.max(0,usage.percent)):0;
  return <header className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" aria-label={`${account.name} account details`}>
    <Card className="flex min-w-0 flex-col gap-4 p-4 shadow-none sm:p-5">
      <div className="flex items-center justify-between gap-3"><AccountIdentity account={account}/><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{accountLabels[account.type]}</span></div>
      <div className="min-w-0 space-y-1"><h1 ref={headingRef} tabIndex={-1} className="break-words !text-2xl">{account.name}</h1>{(account.issuer||account.product)&&<p className="break-words text-sm text-muted-foreground">{[account.issuer,account.product].filter(Boolean).join(" · ")}</p>}</div>
      {account.last4&&["credit_card","bank"].includes(account.type)&&<p className="font-mono text-sm tracking-wider" aria-label={`Card ending in ${account.last4}`}>{credit?"•••• •••• ••••":"••••"} {account.last4}</p>}
      <dl className="grid min-w-0 grid-cols-2 gap-3 border-t pt-4 text-sm">
        {account.network&&<div className="min-w-0"><dt className="text-xs text-muted-foreground">Network</dt><dd className="mt-1 break-words font-medium">{account.network}</dd></div>}
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Source uploads</dt><dd className="mt-1 font-medium tabular-nums">{account.display?.count??0}</dd></div>
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t pt-4">{children}</div>
    </Card>
    {credit&&<section className="grid min-w-0 gap-3 sm:auto-rows-fr sm:grid-cols-2" aria-label="Account balance summaries">
      {snapshots.length?snapshots.map(s=><Card key={s.id} className="min-w-0 p-4 shadow-none sm:p-5" aria-label={`Latest ${s.currency} statement`}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Statement balance</h2><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{s.currency}</span></div>
        <p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(s.amount!,s.currency)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{s.semantics==="debt-positive"?(s.amount!<0?"Credit balance":"Closing debt balance"):"Closing account balance"}</p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><FileText className="size-4 shrink-0" aria-hidden/>{s.date??"Statement date unknown"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sourceLabels[s.source]}</p>
        <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 border-t pt-3">
          <div className="min-w-0"><dt className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3 shrink-0" aria-hidden/>Due date</dt><dd className="mt-1 break-words text-sm font-medium">{s.dueDate??"Not provided"}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Minimum due</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{s.minimumDue===null?"Not provided":formatMoney(s.minimumDue,s.currency)}</dd></div>
        </dl>
      </Card>):<Card className="min-w-0 space-y-2 p-4 shadow-none sm:p-5" aria-label="Statement balance unavailable"><h2 className="text-sm font-medium">Statement balance</h2><p className="text-xl font-semibold">Not provided</p><p className="text-xs text-muted-foreground">{!account.display?.count?"Upload a statement to see its balance and payment details.":account.display.reason??"No usable statement balance."}</p><dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm"><div><dt className="text-xs text-muted-foreground">Due date</dt><dd className="mt-1">Not provided</dd></div><div><dt className="text-xs text-muted-foreground">Minimum due</dt><dd className="mt-1">Not provided</dd></div></dl></Card>}
      <Card className="min-w-0 space-y-3 p-4 shadow-none sm:p-5" aria-label="Credit utilization">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-sm font-medium">Credit utilization</h2><p className="text-sm"><span className="text-muted-foreground">Credit limit · PHP </span><span className="font-semibold tabular-nums">{account.credit_limit?formatMoney(account.credit_limit):"Not provided"}</span></p></div>
        {usage?<><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-2xl font-semibold tabular-nums">{Math.round(usage.percent)}%</p><p className="text-xs text-muted-foreground">{usage.source}</p></div><div className="h-3 overflow-hidden rounded-full border border-muted-foreground bg-muted forced-colors:border-[CanvasText]" role="meter" aria-label="Credit limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${Math.round(usage.percent)}% utilized · ${usage.source} · Not live available credit`}><div className="h-full rounded-full bg-foreground forced-colors:bg-[Highlight] forced-colors:[forced-color-adjust:none]" style={{width:`${percent}%`}}/></div>{usage.percent>100&&<p className="text-sm font-medium">Over the recorded credit limit</p>}</>:<p className="text-sm text-muted-foreground">Unavailable · requires a credit limit and compatible PHP balance.</p>}
        <p className="text-xs text-muted-foreground">Recorded balance only. Not live available credit.</p>
      </Card>
    </section>}
  </header>;
}
