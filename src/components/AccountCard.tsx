import RecordActions from "@/components/RecordActions";
import { formatMoney } from "@/lib/finance";
import "./AccountCard.css";

export type Account = { id: number; name: string; type: string; balance: number; opening_date: string; reconciliation_stale?: number; issuer?: string; product?: string; network?: string; liquid?: number; last4?: string; credit_limit?: number | null };

const labels: Record<string, string> = { credit_card: "Credit card", bank: "Debit card / bank", wallet: "E-wallet", cash: "Cash", loan: "Loan", asset: "Other asset", liability: "Other liability" };

export default function AccountCard({ account, busy, onView, onEdit, onDelete }: {
  account: Account;
  busy: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCard = account.type === "credit_card" || account.type === "bank";
  return <li className="luna-account-card" data-dark>
    <span className="luna-account-watermark" aria-hidden="true">LUNA</span>
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3><button className="luna-account-title" aria-label={`View account details for ${account.name}`} onClick={onView}>{account.name}<span className="mt-1 block text-xs font-normal">{account.issuer || labels[account.type]}</span></button></h3>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {account.network && <span className="luna-account-network max-w-24 break-words text-right text-sm font-bold italic">{account.network}</span>}
        <RecordActions name={account.name} actions={[
          { label: "View account details", onSelect: onView },
          { label: "Edit details", disabled: busy, onSelect: onEdit },
          { label: "Delete account", destructive: true, onSelect: onDelete },
        ]} />
      </div>
    </div>
    <div className="relative flex flex-wrap items-center gap-3">
      {isCard && <span className="luna-account-chip" aria-hidden="true"><span /></span>}
      {isCard && <p className="luna-account-number" aria-label={account.last4 ? `Card ending in ${account.last4}` : "Card number not recorded"}>
        <span aria-hidden="true">•••• •••• •••• {account.last4 || "••••"}</span>
      </p>}
    </div>
    <p className="relative text-xs">{[labels[account.type], account.product].filter(Boolean).join(" · ")}</p>
    <div className="relative mt-auto flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs">{account.balance < 0 ? "Recorded debt" : "Recorded balance"}</p>
        <p className="luna-account-balance mt-1">{formatMoney(account.balance)}</p>
      </div>
      <p className="text-xs">Recorded since<br /><span className="tabular-nums">{account.opening_date}</span></p>
    </div>
    {account.type === "credit_card" && Boolean(account.credit_limit) && <div className="relative">
      <p className="text-xs">Credit utilization: {Math.round(Math.max(0, -account.balance) / account.credit_limit! * 100)}% · limit {formatMoney(account.credit_limit!)}</p>
      <div className="luna-account-utilization mt-2 h-1 overflow-hidden rounded-full" role="progressbar" aria-label={account.name + " credit utilization"} aria-valuemin={0} aria-valuemax={account.credit_limit!} aria-valuenow={Math.min(account.credit_limit!, Math.max(0, -account.balance))} aria-valuetext={formatMoney(Math.max(0, -account.balance)) + " owed of " + formatMoney(account.credit_limit!) + " limit"}>
        <div className="h-full rounded-full" style={{ width: Math.min(100, Math.max(0, -account.balance) / account.credit_limit! * 100) + "%" }} />
      </div>
    </div>}
  </li>;
}
