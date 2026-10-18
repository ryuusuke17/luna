import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WorkspaceDialogContent from "@/components/WorkspaceDialogContent";
import { Button } from "@/components/WorkspaceButton";
import { api } from "@/lib/api";
import { accountLabels, editableAccountRecord, type Account, type AccountType } from "@/lib/accounts";
import { cardNetworks, cardProducts, ewalletProviders, type CardType } from "@/lib/card-directory";

const directoryType: Partial<Record<AccountType, CardType>> = { credit_card: "credit", bank: "debit" };
export default function AccountDialog({ account, onClose }: { account?: Account; onClose: () => void }) {
  const client = useQueryClient(), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [type, setType] = useState<AccountType>(account?.type ?? "credit_card");
  const directory = directoryType[type] ? cardProducts[directoryType[type]!] : [];
  const issuers = type === "wallet" ? ewalletProviders : [...new Set(directory.map(p => p.issuer))];
  const initialIssuer = account?.issuer ?? "";
  const [issuer, setIssuer] = useState(initialIssuer && !issuers.includes(initialIssuer) ? "Other" : initialIssuer);
  const [customIssuer, setCustomIssuer] = useState(initialIssuer), [product, setProduct] = useState(account?.product ?? ""), [network, setNetwork] = useState(account?.network ?? "");
  const products = directory.filter(p => p.issuer === issuer), isCard = type === "credit_card" || type === "bank";
  function changeType(value: AccountType) { setType(value); setIssuer(""); setCustomIssuer(""); setProduct(""); setNetwork(""); }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget), provider = issuer === "Other" ? customIssuer.trim() : issuer;
    pending.current = true; setBusy(true); setError("");
    const name = String(form.get("name") ?? "").trim() || ([provider, isCard ? product : ""].filter(Boolean).join(" ") || accountLabels[type]).slice(0, 80);
    const body = { name, issuer: provider || null, product: isCard ? product || null : account?.product ?? null, network: isCard ? network || null : account?.network ?? null, last4: isCard ? form.get("last4") || null : account?.last4 ?? null, creditLimit: form.get("creditLimit") || undefined, liquid: form.get("liquid") === "on" };
    try {
      await api(account ? `accounts/${account.id}` : "accounts", { method: account ? "PATCH" : "POST", body: JSON.stringify(account ? { ...body, expected: JSON.stringify(editableAccountRecord(account)) } : { ...body, issuer: provider || undefined, product: product || undefined, network: network || undefined, type, openingDate: new Date().toISOString().slice(0, 10), openingBalance: "0" }) });
      await client.invalidateQueries(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save account"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><WorkspaceDialogContent onEscapeKeyDown={e => { if (pending.current) e.preventDefault(); }} onPointerDownOutside={e => { if (pending.current) e.preventDefault(); }}>
    <DialogHeader><DialogTitle>{account ? "Edit account details" : "New account"}</DialogTitle><DialogDescription>Account identity only. Existing transactions and opening balances remain unchanged.</DialogDescription></DialogHeader>
    <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={save} aria-busy={busy} aria-describedby={error ? "account-error" : undefined}>
      <fieldset disabled={busy} className="contents">
        <label className="min-w-0">Account / card type<select className="field" value={type} disabled={Boolean(account)} onChange={e => changeType(e.target.value as AccountType)}>{Object.entries(accountLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{account && <span className="mt-1 block text-xs text-muted-foreground">Account type cannot be changed.</span>}</label>
        {(isCard || type === "wallet") && <>
          <label className="min-w-0">{type === "wallet" ? "Wallet provider" : "Issuer / bank"}<select className="field" value={issuer} onChange={e => { setIssuer(e.target.value); setProduct(""); setNetwork(""); }}><option value="">Select provider</option>{issuers.map(i => <option key={i}>{i}</option>)}<option value="Other">Other provider</option></select></label>
          {issuer === "Other" && <label className="min-w-0">Provider name<input className="field" required maxLength={80} value={customIssuer} onChange={e => setCustomIssuer(e.target.value)}/></label>}
          {isCard && <><label className="min-w-0">Card / product<select className="field" value={product} onChange={e => { setProduct(e.target.value); const found=products.find(p=>p.product===e.target.value); setNetwork(found && found.network!=="Varies / not specified" ? found.network : ""); }}><option value="">Select product (optional)</option>{product&&!products.some(p=>p.product===product)&&<option>{product}</option>}{products.map((p,i)=><option key={`${p.product}-${i}`} value={p.product}>{p.product}</option>)}</select></label>
            <label className="min-w-0">Card network<select className="field" value={network} onChange={e=>setNetwork(e.target.value)}><option value="">Select network</option>{network&&!cardNetworks.includes(network)&&<option>{network}</option>}{cardNetworks.map(n=><option key={n}>{n}</option>)}</select></label>
            <label className="min-w-0">Last 4 digits (optional)<input className="field" name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={account?.last4 ?? ""}/></label></>}
        </>}
        {type==="credit_card"&&<label className="min-w-0">Credit limit · PHP<input className="field" name="creditLimit" type="number" inputMode="decimal" required min="0.01" step="0.01" defaultValue={account?.credit_limit ? account.credit_limit/100 : ""}/></label>}
        <label className="min-w-0 sm:col-span-2">Account name (optional)<input className="field" name="name" maxLength={80} defaultValue={account?.name} placeholder="Auto-generated from provider and product" aria-describedby="account-name-hint"/><span id="account-name-hint" className="mt-1 block text-xs text-muted-foreground">Leave blank to use the provider and product, or account type.</span></label>
        {["cash","bank","wallet"].includes(type)?<label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input className="size-5" name="liquid" type="checkbox" defaultChecked={Boolean(account?.liquid)}/>Liquid cash/bank/wallet for cash-flow reports</label>:<input type="hidden" name="liquid" value={account?.liquid ? "on" : ""}/>}
      </fieldset>
      {error&&<p id="account-error" role="alert" className="break-words text-destructive sm:col-span-2">{error}</p>}
      <p role="status" className={busy ? "sm:col-span-2" : "sr-only"}>{busy ? "Saving…" : ""}</p>
      <div className="dialog-actions sm:col-span-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} aria-busy={busy}>{busy ? "Saving…" : account ? "Save changes" : "Save account"}</Button></div>
    </form>
  </WorkspaceDialogContent></Dialog>;
}
