import { Link } from "react-router-dom";
import { Banknote, CreditCard, Landmark, Wallet, HandCoins, Boxes, Scale } from "lucide-react";
import RecordActions from "@/components/RecordActions";
import { formatMoney } from "@/lib/finance";
import { accountLabels, balanceCaption, utilization, type Account } from "@/lib/accounts";
import { issuerLogo, networkLogo } from "@/lib/account-logos";
import "./AccountCard.css";
export type { Account } from "@/lib/accounts";

const icons = {cash:Banknote,bank:Landmark,wallet:Wallet,credit_card:CreditCard,loan:HandCoins,asset:Boxes,liability:Scale};
export function AccountIdentity({account}:{account:Account}) {
  const logo=issuerLogo(account.issuer),Icon=icons[account.type];
  return logo?<span className="inline-flex h-11 w-24 shrink-0 items-center justify-center rounded-lg bg-background p-2"><img src={logo} alt="" className="max-h-full max-w-full object-contain"/></span>:<Icon className="size-8 shrink-0" aria-hidden/>;
}
export default function AccountCard({ account, busy, onView, onEdit, onDelete }: {
  account: Account; busy: boolean; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const isCard=account.type==="credit_card"||account.type==="bank",network=isCard?networkLogo(account.network):null,usage=utilization(account);
  return <li className="luna-account-card" data-dark>
    <span className="luna-account-watermark" aria-hidden>LUNA</span>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><AccountIdentity account={account}/><h3 className="mt-3"><Link className="luna-account-title" to={`/accounts/${account.id}`} aria-label={`View account details for ${account.name}`}>{account.name}</Link></h3><p className="mt-1 break-words text-xs">{[accountLabels[account.type],account.issuer,account.product].filter(Boolean).join(" · ")}</p></div>
      <div className="relative z-20 flex shrink-0 flex-col items-end gap-2">
        <RecordActions name={account.name} actions={[{label:"View account details",onSelect:onView},{label:"Edit details",disabled:busy,onSelect:onEdit},{label:"Delete account",disabled:busy,destructive:true,onSelect:onDelete}]}/>
        {isCard&&account.network&&(network?<span className="flex h-10 w-16 items-center justify-center rounded-lg bg-background p-2"><img src={network} alt={account.network} className="max-h-full max-w-full object-contain"/></span>:<span className="max-w-20 break-words text-sm">{account.network}</span>)}
      </div>
    </div>
    {isCard&&account.last4&&<p className="luna-account-number" aria-label={`Card ending in ${account.last4}`}>•••• {account.last4}</p>}
    <div className="mt-auto min-w-0"><p className="text-xs">{balanceCaption(account.display)}</p>
      {account.display?.source==="statement"?account.display.snapshots.map(s=><div key={s.id}><p className="luna-account-balance mt-1">{formatMoney(s.amount!,s.currency)}</p><p className="text-xs">{s.semantics==="debt-positive"?(s.amount!<0?"Statement credit balance":"Statement debt balance"):"Statement closing balance"}</p></div>):<><p className="luna-account-balance mt-1">{formatMoney(account.balance)}</p><p className="mt-1 text-xs">{account.display?.reason??"Ledger balance · No statements uploaded"}</p></>}
    </div>
    {account.type==="credit_card"&&Boolean(account.credit_limit)&&<div className="text-xs"><p>Limit {formatMoney(account.credit_limit!)} · PHP</p><p className="mt-1">{usage?`${Math.round(usage.percent)}% utilization · ${usage.source}`:"Utilization not provided · No compatible PHP snapshot"}</p><p className="mt-1">Not live available credit</p></div>}
  </li>;
}
