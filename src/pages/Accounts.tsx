import PaymentMethods from "@/components/PaymentMethods";
import AccountCard from "@/components/AccountCard";
import AccountDialog from "@/components/AccountDialog";
import AccountDeletionDialog from "@/components/AccountDeletionDialog";
import { usePageAction } from "@/components/PageAction";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Wallet, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/finance";
import type { Account } from "@/lib/accounts";

export default function Accounts() {
  const navigate=useNavigate(),[editing,setEditing]=useState<Account|null|undefined>(undefined),[deleting,setDeleting]=useState<number|null>(null);
  const query=useQuery({queryKey:["accounts"],queryFn:()=>api<Account[]>("accounts")}),items=query.data??[];
  usePageAction("Add account",()=>setEditing(null));
  return <><header className="page-heading"><div><h1>Accounts</h1><p className="mt-3 text-sm text-muted-foreground">Statement snapshots on cards. Recorded ledger balances in your bigger picture.</p></div></header>
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><article data-dark className="dark-band rounded-lg p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-white/80">Recorded assets</p><Wallet size={20} aria-hidden/></div><p className="metric">{query.isPending||query.error?"—":formatMoney(items.reduce((n,a)=>n+Math.max(0,a.balance),0))}</p><p className="mt-3 text-xs text-white/80">Positive recorded account balances · ledger only</p></article><article className="panel"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Recorded debt</p><ArrowUpRight size={20} aria-hidden/></div><p className="metric">{query.isPending||query.error?"—":formatMoney(items.reduce((n,a)=>n+Math.max(0,-a.balance),0))}</p><p className="mt-3 text-xs text-muted-foreground">Negative recorded account balances · ledger only</p></article></div>
    {query.isPending?<p role="status">Loading accounts…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:<div className="space-y-5">{[["Cash, bank and wallet",["cash","bank","wallet"]],["Credit cards",["credit_card"]],["Other accounts",["loan","asset","liability"]]].map(([label,types])=><section key={String(label)}><h2 className="mb-3">{String(label)}</h2>{items.some(a=>(types as string[]).includes(a.type))?<ul className="luna-account-grid">{items.filter(a=>(types as string[]).includes(a.type)).map(account=><AccountCard key={account.id} account={account} busy={false} onView={()=>navigate(`/accounts/${account.id}`)} onEdit={()=>setEditing(account)} onDelete={()=>setDeleting(account.id)}/>)}</ul>:<p className="text-muted-foreground">No accounts in this group.</p>}</section>)}</div>}
    <PaymentMethods accounts={items}/>
    {editing!==undefined&&<AccountDialog key={editing?.id??"new"} account={editing??undefined} onClose={()=>setEditing(undefined)}/>}
    {deleting!==null&&<AccountDeletionDialog id={deleting} onClose={()=>{setDeleting(null);document.getElementById("main")?.focus();}}/>}
  </>;
}
