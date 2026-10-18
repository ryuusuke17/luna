import type { Ref } from "react";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AccountIdentity } from "@/components/AccountCard";
import { accountLabels, utilization, type Account } from "@/lib/accounts";
import { formatMoney } from "@/lib/finance";

const sourceLabels={issued:"Issued credit-card statement",bank:"Bank-statement upload",archive:"Legacy reference archive",historical:"Historical statement import"};

export default function AccountOverview({ account, headingRef }: { account: Account; headingRef: Ref<HTMLHeadingElement> }) {
  const credit=account.type==="credit_card",usage=credit?utilization(account):null;
  const snapshots=credit&&account.display?.source==="statement"?account.display.snapshots.filter(s=>s.amount!==null):[];
  const percent=usage?Math.min(100,Math.max(0,usage.percent)):0;

  function renderStatementCard(s: typeof snapshots[number]) {
    return (
      <Card key={s.id} className="flex min-w-0 flex-col justify-between p-4 shadow-none sm:p-5" aria-label={`Latest ${s.currency} statement`}>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Statement balance</h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{s.currency}</span>
          </div>
          <p className="mt-2 break-words text-3xl font-bold tracking-tight tabular-nums">{formatMoney(s.amount!,s.currency)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.semantics==="debt-positive"?(s.amount!<0?"Credit balance":"Closing debt balance"):"Closing account balance"}</p>
          <p className="text-xs text-muted-foreground">{sourceLabels[s.source]}</p>
        </div>
        <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 border-t pt-3 text-xs">
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-muted-foreground"><CalendarDays className="size-3 shrink-0" aria-hidden/>Due date</dt>
            <dd className="mt-1 break-words text-sm font-semibold">{s.dueDate??"Not provided"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Minimum due</dt>
            <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{s.minimumDue===null?"Not provided":formatMoney(s.minimumDue,s.currency)}</dd>
          </div>
        </dl>
      </Card>
    );
  }

  return <div className={`grid min-w-0 gap-4 ${credit ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : "max-w-xl"}`}>
    <Card className="flex min-w-0 flex-col gap-4 p-4 shadow-none sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <AccountIdentity account={account}/>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{accountLabels[account.type]}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <h1 ref={headingRef} tabIndex={-1} className="break-words !text-2xl font-bold tracking-tight">{account.name}</h1>
        {(account.issuer||account.product)&&<p className="break-words text-xs text-muted-foreground">{[account.issuer,account.product].filter(Boolean).join(" · ")}</p>}
      </div>
      {account.last4&&["credit_card","bank"].includes(account.type)&&<p className="font-mono text-xs tracking-wider text-muted-foreground" aria-label={`Card ending in ${account.last4}`}>{credit?"•••• •••• ••••":"••••"} {account.last4}</p>}
      <dl className="grid min-w-0 grid-cols-2 gap-3 border-t pt-3 text-xs">
        {account.network&&<div className="min-w-0"><dt className="text-muted-foreground">Network</dt><dd className="mt-1 break-words font-medium">{account.network}</dd></div>}
        <div className="min-w-0"><dt className="text-muted-foreground">Source uploads</dt><dd className="mt-1 font-medium tabular-nums">{account.display?.count??0}</dd></div>
      </dl>
    </Card>

    {credit&&<section className="grid min-w-0 gap-4 sm:auto-rows-fr sm:grid-cols-2" aria-label="Account balance summaries">
      {snapshots.length>0 ? (
        renderStatementCard(snapshots[0])
      ) : (
        <Card className="flex min-w-0 flex-col justify-between p-4 shadow-none sm:p-5" aria-label="Statement balance unavailable">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Statement balance</h2>
            <p className="mt-2 text-2xl font-semibold">Not provided</p>
            <p className="mt-1 text-xs text-muted-foreground">{!account.display?.count?"Upload a statement to see its balance and payment details.":account.display.reason??"No usable statement balance."}</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <div><dt className="text-muted-foreground">Due date</dt><dd className="mt-1 font-medium">Not provided</dd></div>
            <div><dt className="text-muted-foreground">Minimum due</dt><dd className="mt-1 font-medium">Not provided</dd></div>
          </dl>
        </Card>
      )}

      <Card className="flex min-w-0 flex-col justify-between p-4 shadow-none sm:p-5" aria-label="Credit utilization">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Credit utilization</h2>
            <p className="text-xs text-muted-foreground">Limit: <span className="font-semibold text-foreground tabular-nums">{account.credit_limit?formatMoney(account.credit_limit):"Not provided"}</span></p>
          </div>
          {usage?<div className="mt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-3xl font-bold tracking-tight tabular-nums">{Math.round(usage.percent)}%</p>
              <p className="text-xs text-muted-foreground">{usage.source}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full border border-muted bg-muted" role="meter" aria-label="Credit limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${Math.round(usage.percent)}% utilized · ${usage.source} · Not live available credit`}>
              <div className={`h-full rounded-full transition-all duration-300 ${percent>90?"bg-destructive":percent>70?"bg-amber-500":"bg-primary"}`} style={{width:`${percent}%`}}/>
            </div>
            {usage.percent>100&&<p className="mt-1 text-xs font-medium text-destructive">Over recorded credit limit</p>}
          </div>:<p className="mt-2 text-xs text-muted-foreground">Unavailable · requires a credit limit and compatible PHP balance.</p>}
        </div>
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Recorded balance only. Not live available credit.</p>
      </Card>

      {snapshots.slice(1).map(s => renderStatementCard(s))}
    </section>}
  </div>;
}
