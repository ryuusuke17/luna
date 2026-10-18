import { Link } from "react-router-dom";
import { Banknote, CreditCard, Landmark, Wallet, HandCoins, Boxes, Scale } from "lucide-react";
import { formatMoney } from "@/lib/finance";
import { accountLabels, balanceCaption, type Account } from "@/lib/accounts";
import { issuerLogo, networkLogo } from "@/lib/account-logos";
import "./AccountCard.css";
export type { Account } from "@/lib/accounts";

const icons = {cash:Banknote,bank:Landmark,wallet:Wallet,credit_card:CreditCard,loan:HandCoins,asset:Boxes,liability:Scale};
export function AccountIdentity({account}:{account:Account}) {
  const logo=issuerLogo(account.issuer),Icon=icons[account.type];
  return logo?<span className="inline-flex h-11 w-24 shrink-0 items-center justify-start"><img src={logo} alt="" className="max-h-full max-w-full object-contain"/></span>:<Icon className="size-8 shrink-0" aria-hidden/>;
}
export default function AccountCard({ account }: { account: Account }) {
  const isCard=account.type==="credit_card"||account.type==="bank",network=isCard?networkLogo(account.network):null;
  return <li className="luna-account-card" data-dark>
    <span className="luna-account-watermark" aria-hidden>LUNA</span>
    <div className="min-w-0"><AccountIdentity account={account}/><h3 className="mt-3"><Link className="luna-account-title" to={`/accounts/${account.id}`} aria-label={`View account details for ${account.name}`}>{account.name}</Link></h3><p className="mt-1 break-words text-xs">{[accountLabels[account.type],account.issuer,account.product].filter(Boolean).join(" · ")}</p></div>
    {isCard&&account.last4&&<p className="luna-account-number flex flex-wrap gap-x-2" aria-label={`Card ending in ${account.last4}`}><span aria-hidden>{account.type==="credit_card"?"•••• •••• ••••":"••••"}</span><span aria-hidden>{account.last4}</span></p>}
    <div className="mt-auto flex min-w-0 flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-40"><p className="text-xs">{balanceCaption(account.display)}</p>
        {account.display?.source==="statement"?account.display.snapshots.map(s=><div key={s.id}><p className="luna-account-balance mt-1">{formatMoney(s.amount!,s.currency)}</p><p className="text-xs">{s.semantics==="debt-positive"?(s.amount!<0?"Statement credit balance":"Statement debt balance"):"Statement closing balance"}</p></div>):<><p className="luna-account-balance mt-1">{formatMoney(account.balance)}</p><p className="mt-1 text-xs">{account.display?.reason??"Ledger balance · No statements uploaded"}</p></>}
      </div>
      {isCard&&account.network&&<span className="ml-auto flex h-10 max-w-full shrink-0 items-end justify-end">{network?<img src={network} alt={account.network} className="max-h-full w-16 object-contain object-right-bottom"/>:<span className="max-w-24 break-words text-right text-sm">{account.network}</span>}</span>}
    </div>
  </li>;
}
