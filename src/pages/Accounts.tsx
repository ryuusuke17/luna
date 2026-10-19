import AccountCard from "@/components/AccountCard";
import AccountDialog from "@/components/AccountDialog";
import { usePageAction } from "@/components/PageAction";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Wallet, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/finance";
import { accountSummary, type Account } from "@/lib/accounts";

export default function Accounts() {
  const [adding,setAdding]=useState(false);
  const query=useQuery({queryKey:["accounts"],queryFn:()=>api<Account[]>("accounts")}),items=query.data??[];
  const summary=accountSummary(items);
  usePageAction("Add account",()=>setAdding(true));
  return <><header className="page-heading"><div><h1>Accounts</h1><p className="mt-3 text-sm text-muted-foreground">Current recorded balances. Credit-card statement snapshots remain separate.</p></div></header>
    <article className="panel mb-4" aria-label="Recorded credit-card debt"><h2 className="text-sm">Recorded credit-card debt</h2><p className="metric">{query.isPending||query.error?"—":formatMoney(items.filter(a=>a.type==="credit_card").reduce((sum,a)=>sum+Math.max(0,-a.balance),0))}</p><p className="text-sm text-muted-foreground">Credit balances are shown on individual cards.</p></article>
    <div className="mb-5 grid gap-4 sm:grid-cols-2">
      <article data-dark className="dark-band min-w-0 rounded-lg p-4" aria-label="Cash + Digital Wallet"><div className="flex items-center justify-between gap-3"><h2 className="text-sm text-white/80">Cash + Digital Wallet</h2><Wallet size={20} className="shrink-0" aria-hidden/></div><p className="metric [overflow-wrap:anywhere]">{query.isPending||query.error?"—":formatMoney(summary.cashWallet)}</p><p className="mt-3 text-xs text-white/80">Cash and digital wallets · Excludes bank accounts</p></article>
      <article className="panel min-w-0" aria-label="Statement Balance"><div className="flex items-center justify-between gap-3"><h2 className="text-sm text-muted-foreground">Statement Balance</h2><ArrowUpRight size={20} className="shrink-0" aria-hidden/></div>{query.isPending||query.error?<p className="metric">—</p>:summary.statementBalances.length?<ul className="space-y-2">{summary.statementBalances.map(([currency,amount])=><li key={currency} className="metric [overflow-wrap:anywhere]">{formatMoney(amount,currency)} <span className="text-sm">{currency}</span></li>)}</ul>:<p className="metric">Not provided</p>}<p className="mt-3 text-xs text-muted-foreground">Latest credit-card statements · separate totals per currency · negative amounts represent credit · not live debt</p>{!query.isPending&&!query.error&&summary.missingStatements>0&&<p className="mt-2 text-xs text-muted-foreground">{summary.missingStatements} {summary.missingStatements===1?"card has":"cards have"} no usable statement balance; excluded. No statement fallback.</p>}</article>
    </div>
    {query.isPending?<p role="status">Loading accounts…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:<div className="space-y-5">{[["Cash, bank and wallet",["cash","bank","wallet"]],["Credit cards",["credit_card"]],["Other accounts",["loan","asset","liability"]]].map(([label,types])=><section key={String(label)}><h2 className="mb-3">{String(label)}</h2>{items.some(a=>(types as string[]).includes(a.type))?<ul className="luna-account-grid">{items.filter(a=>(types as string[]).includes(a.type)).map(account=><AccountCard key={account.id} account={account}/>)}</ul>:<p className="text-muted-foreground">No accounts in this group.</p>}</section>)}</div>}
    {adding&&<AccountDialog onClose={()=>setAdding(false)}/>}
  </>;
}
