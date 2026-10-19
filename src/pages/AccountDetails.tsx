import {useEffect,useRef,useState} from "react";
import {Link,useNavigate,useParams,useSearchParams} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {ArrowLeftRight,Upload,History,Pencil,Trash2} from "lucide-react";
import {Button} from "@/components/WorkspaceButton";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import AccountDialog from "@/components/AccountDialog";
import AccountDeletionDialog from "@/components/AccountDeletionDialog";
import AccountOverview from "@/components/AccountOverview";
import TransactionHistory from "@/components/TransactionHistory";
import TransactionDialog from "@/components/TransactionDialog";
import CreditCardStatements from "@/components/CreditCardStatements";
import CreditCardStatementDetail from "@/components/CreditCardStatementDetail";
import {api} from "@/lib/api";
import type {AccountDetail} from "@/lib/accounts";
import {applyTransactionDate} from "@/lib/transaction-filters";
import type {StatementDashboard} from "@/lib/credit-card-statements";

export default function AccountDetails(){
 const {id=""}=useParams(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[entry,setEntry]=useState<"expense"|"transfer"|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLElement|null>(null);
 const detail=useQuery({queryKey:["account-detail",id],queryFn:()=>api<AccountDetail>(`accounts/${encodeURIComponent(id)}`)}),account=detail.data?.account;
 const credit=account?.type==="credit_card",tab=credit&&params.get("tab")==="statements"?"statements":"transactions";
 const statementPage=params.get("statementPage")??"1";
 const statements=useQuery({queryKey:["credit-card-statements","account",id,statementPage],queryFn:()=>api<StatementDashboard>(`credit-card-statements?cards=${encodeURIComponent(id)}&page=${statementPage}`),enabled:Boolean(credit&&tab==="statements")});
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[id,Boolean(account)]);
 useEffect(()=>{const source=params.get("source"),sourceId=params.get("sourceId");if(source&&sourceId&&source!=="issued"&&!["manual","import"].includes(source))navigate(`/import-export?tab=history&account=${id}&${source==="archive"?"archive":"batch"}=${sourceId}`,{replace:true});},[params,id,navigate]);
 const legacyMonth = credit && params.has("month") && !params.has("dateMode") && !["issuedStatement","start","end","period","batch","legacy","importId"].some(key=>params.has(key)) ? params.get("month") : null;
 const legacyStatements=useQuery({queryKey:["legacy-issued-statement",id,legacyMonth],queryFn:()=>api<StatementDashboard>(`credit-card-statements?${new URLSearchParams({cards:id,month:legacyMonth!})}`),enabled:Boolean(legacyMonth)});
 const legacyIssues=legacyStatements.data?.cards.find(card=>card.id===Number(id))?.selectedIssues??[];
 useEffect(()=>{
  if(legacyMonth && legacyStatements.isSuccess && legacyIssues.length===1){
   setParams(applyTransactionDate(params,{mode:"statement",issuedStatement:String(legacyIssues[0].id),month:"",start:"",end:""}),{replace:true});
  }
 },[legacyMonth,legacyStatements.isSuccess,legacyStatements.data,params,setParams]);
 const transactionParams=new URLSearchParams(params);for(const key of ["tab","document","sourceId","statementPage"])transactionParams.delete(key);
 if(!["manual","import"].includes(transactionParams.get("source")??""))transactionParams.delete("source");
 const blockedMessage=legacyMonth ? legacyStatements.isPending ? "Resolving issued statement…" : legacyStatements.isError ? "Statements unavailable. Retry before choosing an issue." : legacyIssues.length===1 ? "Resolving issued statement…" : legacyIssues.length ? "Multiple statements issued in this month. Choose a statement explicitly." : "No statement issued in this month for this account. Choose another statement or Calendar month." : "";
 if(legacyMonth){for(const key of ["month","start","end","period"])transactionParams.delete(key);transactionParams.set("dateMode","statement");}
 function historyParams(next:URLSearchParams,options?:{replace?:boolean}){const merged=new URLSearchParams(next);for(const key of ["tab","document","sourceId","statementPage",...params.get("source")==="issued"?["source"]:[]])if(params.has(key))merged.set(key,params.get(key)!);setParams(merged,options);}
 function change(key:string,value:string){const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);setParams(next);}
 function open(statementId:number){opener.current=document.activeElement as HTMLElement;change("document",String(statementId));}
 const documentId=params.get("document")||(params.get("source")==="issued"?params.get("sourceId"):null);
 const transactions=<section className="min-w-0 space-y-4" aria-label="Account transactions"><h2>Transactions</h2><p className="text-sm text-muted-foreground">All recorded activity, including unbilled purchases and both transfer directions. Payment tracker evidence is not a ledger payment.</p><TransactionHistory key={id} accountId={Number(id)} params={transactionParams} onParamsChange={historyParams} blockedMessage={blockedMessage}/>{legacyMonth&&legacyStatements.isError&&<Button variant="outline" onClick={()=>legacyStatements.refetch()}>Retry statements</Button>}</section>;
 return <div className="min-w-0 space-y-5">
  {detail.isPending?<>
   <Link className="inline-flex min-h-11 items-center underline" to="/accounts">Back to accounts</Link>
   <p role="status">Loading account…</p>
  </>:detail.error?<>
   <Link className="inline-flex min-h-11 items-center underline" to="/accounts">Back to accounts</Link>
   <section role="alert" className="panel"><h1>Account unavailable</h1><p>{detail.error.message}</p><Button variant="outline" onClick={()=>detail.refetch()}>Retry account</Button></section>
  </>:account&&<>
   <header className="min-w-0 space-y-4" aria-label={`${account.name} account details`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
     <Link className="inline-flex min-h-11 items-center underline" to="/accounts">Back to accounts</Link>
     <div className="flex flex-wrap items-center gap-2">
      {!account.archived_at&&<>{["cash","wallet","bank"].includes(account.type)&&<Button variant="outline" size="sm" title="Transfer money" aria-label="Transfer money" onClick={()=>setEntry("transfer")}><ArrowLeftRight className="size-4 mr-1.5" aria-hidden="true"/>Transfer money</Button>}{credit&&<Button variant="outline" size="sm" asChild title="Import statements"><Link aria-label="Import statements" to={`/import-export?account=${id}&tab=import`}><Upload className="size-4 mr-1.5" aria-hidden="true"/>Import statements</Link></Button>}</>}
      <Button variant="outline" size="icon" asChild title="Import history"><Link aria-label="Import history" to={`/import-export?account=${id}&tab=history`}><History className="size-4" aria-hidden="true"/></Link></Button>
      <Button variant="outline" size="icon" disabled={Boolean(account.archived_at)} title="Edit details" aria-label="Edit details" onClick={()=>setEditing(true)}><Pencil className="size-4" aria-hidden="true"/></Button>
      <Button variant="outline" size="icon" className="border text-muted-foreground hover:border-destructive hover:text-destructive" title="Delete account" aria-label="Delete account" onClick={()=>setDeleting(true)}><Trash2 className="size-4" aria-hidden="true"/></Button>
     </div>
    </div>
    <AccountOverview account={account} headingRef={heading}/>
   </header>
   {credit?<Tabs value={tab} onValueChange={value=>change("tab",value==="transactions"?"":value)}><TabsList aria-label="Account views"><TabsTrigger value="transactions">Transactions</TabsTrigger><TabsTrigger value="statements">Statements</TabsTrigger></TabsList><TabsContent value="transactions">{transactions}</TabsContent><TabsContent value="statements" className="space-y-4"><Link className="inline-flex min-h-11 items-center underline" to={`/statements?cards=${id}`}>All statements for this card</Link>{statements.isPending?<p role="status">Loading statements…</p>:statements.error?<div role="alert"><p>{statements.error.message}</p><Button onClick={()=>statements.refetch()}>Retry statements</Button></div>:statements.data&&<CreditCardStatements data={statements.data} onOpen={open} onPage={page=>change("statementPage",String(page))}/>}</TabsContent></Tabs>:transactions}
   {credit&&documentId&&<CreditCardStatementDetail key={documentId} id={documentId} onClose={()=>{const next=new URLSearchParams(params);for(const key of ["document","source","sourceId"])next.delete(key);setParams(next);requestAnimationFrame(()=>opener.current?.focus());}}/>}
   <TransactionDialog open={Boolean(entry)} defaultAccountId={account.id} defaultKind={entry??"expense"} onOpenChange={open=>{if(!open)setEntry(null);}}/>
   {editing&&<AccountDialog account={account} onClose={()=>setEditing(false)}/>}{deleting&&<AccountDeletionDialog id={account.id} onClose={()=>setDeleting(false)} onDeleted={()=>navigate("/accounts",{replace:true})}/>}
  </>}
 </div>;
}
