import {useEffect,useId,useRef,useState} from "react";
import {Link,useLocation,useSearchParams} from "react-router-dom";
import {useInfiniteQuery,useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import CreditCardActivity from "@/components/CreditCardActivity";
import CreditCardStatementDetail from "@/components/CreditCardStatementDetail";
import CreditCardStatements from "@/components/CreditCardStatements";
import LegacyStatementArchives from "@/components/LegacyStatementArchives";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {api} from "@/lib/api";
import {cardLabel,statusLabel,type StatementDashboard} from "@/lib/credit-card-statements";
import {statementMonthLabel,type CreditDashboard} from "@/lib/credit-card-dashboard";

const statementCriteriaKeys=["year","month","issuer","cards","status","search","dueStart","dueEnd","sort"];
const statementFilterKeys=["issuedStatement",...statementCriteriaKeys];
const activityScopeKeys=["activityCard","activityMonth","activityStatement"];
const activityLineKeys=["lineAmount","lineCurrency","lineType","category","start","end","lineSort"];
const choiceSentinel="__load_older__";

type StatementFiltersProps={params:URLSearchParams;dashboard?:CreditDashboard;issues:StatementDashboard["items"];hasMore:boolean;loadingMore:boolean;onLoadMore:()=>void;onApply:(draft:URLSearchParams)=>void};

function StatementFilterBar({params,dashboard,issues,hasMore,loadingMore,onLoadMore,onApply}:StatementFiltersProps){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(()=>new URLSearchParams(params)),descId=useId();
 const parameterText=params.toString();
 useEffect(()=>{if(!open)setDraft(new URLSearchParams(parameterText));},[parameterText,open]);
 const activeCount=statementFilterKeys.filter(key=>params.has(key)&&!(key==="sort"&&params.get(key)==="newest")).length;
 const setDraftValue=(key:string,value:string)=>setDraft(current=>{
  const next=new URLSearchParams(current);
  if(key==="issuedStatement"&&value){for(const criterion of statementCriteriaKeys)next.delete(criterion);}
  else if(statementCriteriaKeys.includes(key))next.delete("issuedStatement");
  if(value)next.set(key,value);else next.delete(key);
  return next;
 });
 const resetDraft=()=>{const next=new URLSearchParams(draft);for(const key of [...statementFilterKeys,"page"])next.delete(key);setDraft(next);};
 const selected=draft.get("issuedStatement")??"",known=issues.some(issue=>String(issue.id)===selected);
 return <section className="rounded-xl border bg-card p-3 shadow-sm" aria-label="Statement filters">
  <div className="flex min-w-0 flex-wrap items-end gap-2.5">
   <label className="min-w-48 flex-[1_1_24rem]"><span className="sr-only">Search statement metadata</span><input className="field" aria-label="Search statement metadata" type="search" maxLength={200} placeholder="Search statements by account, title, or filename" value={draft.get("search")??""} onChange={event=>setDraftValue("search",event.target.value)}/></label>
   <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)setDraft(new URLSearchParams(params));}}>
    <PopoverTrigger asChild><Button variant="outline" aria-label="More statement filters">Filters{activeCount?` · ${activeCount}`:""}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(48rem,calc(100vw-2rem))] p-3 sm:p-4" aria-label="Statement catalog filters" aria-describedby={descId}>
     <p id={descId} className="sr-only">Filter statements by issue date, issuer, card, payment status and due date.</p>
     <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="min-w-0 sm:col-span-2 lg:col-span-3">Statement<select className="field" aria-label="Statement" value={selected} onChange={event=>{if(event.target.value===choiceSentinel){onLoadMore();return;}setDraftValue("issuedStatement",event.target.value);}}><option value="">All statements</option>{selected&&!known&&<option value={selected}>Loading selected statement (#{selected})</option>}{issues.map(issue=><option key={issue.id} value={issue.id}>{issue.card_name} · {issue.statement_date} · {issue.currency} · {issue.filename} (#{issue.id})</option>)}{hasMore&&<option value={choiceSentinel}>{loadingMore?"Loading older statements…":"Load older statements…"}</option>}</select></label>
      <label>Issue month<select className="field" value={draft.get("month")??""} onChange={event=>setDraftValue("month",event.target.value)}><option value="">All months</option>{draft.get("month")&&!dashboard?.availableMonths.includes(draft.get("month")!)&&<option value={draft.get("month")!}>{statementMonthLabel(draft.get("month")!)}</option>}{dashboard?.availableMonths.map(month=><option key={month} value={month}>{statementMonthLabel(month)}</option>)}</select></label>
      <label>Issue year<select className="field" value={draft.get("year")??""} onChange={event=>setDraftValue("year",event.target.value)}><option value="">All years</option>{[...new Set(dashboard?.availableMonths.map(month=>month.slice(0,4)))].map(year=><option key={year} value={year}>{year}</option>)}</select></label>
      <label>Issuer<select className="field" value={draft.get("issuer")??""} onChange={event=>setDraftValue("issuer",event.target.value)}><option value="">All issuers</option>{draft.get("issuer")&&!dashboard?.issuers.includes(draft.get("issuer")!)&&<option>{draft.get("issuer")}</option>}{dashboard?.issuers.map(issuer=><option key={issuer}>{issuer}</option>)}</select></label>
      <label className="min-w-0">Card<select className="field" value={draft.get("cards")??""} onChange={event=>setDraftValue("cards",event.target.value)}><option value="">All cards</option>{draft.get("cards")?.includes(",")&&<option value={draft.get("cards")!}>Multiple selected cards</option>}{dashboard?.allCards.map(card=><option key={card.id} value={card.id}>{cardLabel(card)} · #{card.id}</option>)}</select></label>
      <label>Payment status<select className="field" value={draft.get("status")??""} onChange={event=>setDraftValue("status",event.target.value)}><option value="">All tracker states</option>{["not_tracked","unpaid","partial","paid","past_due_unverified","credit_balance"].map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <label>Due date from<input className="field" type="date" value={draft.get("dueStart")??""} onChange={event=>setDraftValue("dueStart",event.target.value)}/></label>
      <label>Due date to<input className="field" type="date" value={draft.get("dueEnd")??""} onChange={event=>setDraftValue("dueEnd",event.target.value)}/></label>
      <label>Sort statements<select className="field" value={draft.get("sort")??"newest"} onChange={event=>setDraftValue("sort",event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="balance">Balance · highest first</option></select></label>
     </div>
     <div className="mt-3 flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={resetDraft}>Reset</Button><Button type="button" onClick={()=>{onApply(draft);setOpen(false);}}>Apply</Button></div>
    </PopoverContent>
   </Popover>
  </div>
 </section>;
}

export default function Statements(){
 const [params,setParams]=useSearchParams(),document=params.get("document"),trigger=useRef<HTMLElement|null>(null);
 const location=useLocation(),activityTab=useRef<HTMLButtonElement>(null);
 const tab=params.get("tab")==="statements"?"statements":"transactions";
 const focusTransactions=Boolean(location.state?.focusStatementTransactions);
 useEffect(()=>{if(tab==="transactions"&&focusTransactions)activityTab.current?.focus();},[tab,location.key,focusTransactions]);
 const statementQueryParams=new URLSearchParams();
 for(const key of [...statementFilterKeys,"page"])if(params.has(key))statementQueryParams.set(key,params.get(key)!);
 const activityQueryParams=new URLSearchParams();
 for(const [urlKey,apiKey] of [["activityCard","cards"],["activityMonth","month"],["activityStatement","issuedStatement"],["lineSearch","lineSearch"],["lineAmount","lineAmount"],["lineCurrency","lineCurrency"],["lineType","lineType"],["category","category"],["start","start"],["end","end"],["lineSort","lineSort"],["linePage","linePage"]])if(params.has(urlKey))activityQueryParams.set(apiKey,params.get(urlKey)!);
 const statementData=useQuery({queryKey:["credit-card-statements","statements-view",statementQueryParams.toString()],queryFn:()=>api<CreditDashboard>(`credit-card-dashboard?${statementQueryParams}`),enabled:tab==="statements"});
 const activityData=useQuery({queryKey:["credit-card-statements","activity-view",activityQueryParams.toString()],queryFn:()=>api<CreditDashboard>(`credit-card-dashboard?${activityQueryParams}`),enabled:tab==="transactions"});
 const choices=useInfiniteQuery({queryKey:["credit-card-statements","issue-choices"],initialPageParam:1,queryFn:({pageParam})=>{const query=new URLSearchParams({page:String(pageParam)});return api<StatementDashboard>(`credit-card-statements?${query}`);},getNextPageParam:last=>last.page*last.pageSize<last.total?last.page+1:undefined});
 const issues=choices.data?.pages.flatMap(page=>page.items)??[];
 const selectedStatement=params.get("issuedStatement")??"",selectedActivityStatement=params.get("activityStatement")??"";
 const hasMissingSelection=[selectedStatement,selectedActivityStatement].some(id=>id&&!issues.some(issue=>String(issue.id)===id));
 const {hasNextPage,isFetching,isFetchNextPageError,fetchNextPage}=choices;
 useEffect(()=>{if(hasMissingSelection&&hasNextPage&&!isFetching&&!isFetchNextPageError)void fetchNextPage();},[hasMissingSelection,hasNextPage,isFetching,isFetchNextPageError,fetchNextPage]);
 const catalog=tab==="statements"?statementData.data??activityData.data:activityData.data??statementData.data;
 function filter(key:string,value:string){
  const next=new URLSearchParams(params);
  if(statementFilterKeys.includes(key)&&key!=="page")next.delete("page");
  if((activityScopeKeys.includes(key)||activityLineKeys.includes(key)||key==="lineSearch")&&key!=="linePage")next.delete("linePage");
  if(key==="issuedStatement"&&value){for(const criterion of statementCriteriaKeys)next.delete(criterion);}
  else if(statementCriteriaKeys.includes(key))next.delete("issuedStatement");
  if(key==="activityStatement"&&value){next.delete("activityCard");next.delete("activityMonth");}
  else if(key==="activityCard"||key==="activityMonth")next.delete("activityStatement");
  if(value)next.set(key,value);else next.delete(key);
  setParams(next,{replace:key==="lineSearch"||key==="linePage"||key==="page"});
 }
 function applyStatementFilters(draft:URLSearchParams){
  const next=new URLSearchParams(params);
  for(const key of [...statementFilterKeys,"page"])next.delete(key);
  for(const key of statementFilterKeys)if(draft.has(key))next.set(key,draft.get(key)!);
  setParams(next);
 }
 function applyActivityFilters(draft:URLSearchParams){
  const next=new URLSearchParams(params);
  for(const key of [...activityLineKeys,"linePage"])next.delete(key);
  for(const key of activityLineKeys)if(draft.has(key))next.set(key,draft.get(key)!);
  setParams(next);
 }
 function changeTab(value:string){const next=new URLSearchParams(params);if(value==="transactions")next.delete("tab");else next.set("tab",value);setParams(next,{replace:true});}
 function view(id:number){
  const next=new URLSearchParams(params);
  for(const key of [...activityScopeKeys,...activityLineKeys,"lineSearch","linePage","tab","document","archive"])next.delete(key);
  next.set("activityStatement",String(id));
  setParams(next,{state:{focusStatementTransactions:true}});
 }
 function open(id:number){trigger.current=window.document.activeElement as HTMLElement;const next=new URLSearchParams(params);next.set("document",String(id));setParams(next);}
 function close(){const next=new URLSearchParams(params);next.delete("document");setParams(next);requestAnimationFrame(()=>trigger.current?.focus());}
 const globalFilters={cards:catalog?.allCards??[],months:catalog?.availableMonths??[],statements:issues,hasMoreStatements:choices.hasNextPage??false,loadingMoreStatements:choices.isFetchingNextPage,onLoadMoreStatements:()=>{void choices.fetchNextPage();}};
 return <>
  <header className="page-heading"><div><h1>Statements</h1><p className="mt-2 text-muted-foreground">Credit-card statements and statement transactions.</p></div><Link className="quiet inline-flex min-h-11 items-center underline" to="/import-export?tab=import">Go to Import</Link></header>
  <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
   <TabsList aria-label="Statement views"><TabsTrigger ref={activityTab} value="transactions">Statement transactions</TabsTrigger><TabsTrigger value="statements">Statements</TabsTrigger></TabsList>
   <TabsContent value="transactions" className="space-y-4">
    {activityData.isPending&&<p role="status">Loading statement transactions…</p>}
    {activityData.error&&<div className="panel" role="alert"><p>{activityData.error.message}</p><Button variant="outline" onClick={()=>activityData.refetch()}>Retry statement transactions</Button></div>}
    {!activityData.error&&<CreditCardActivity activity={activityData.data?.activity} params={params} onFilter={filter} onOpen={open} globalFilters={globalFilters} onApplyFilters={applyActivityFilters}/>}
   </TabsContent>
   <TabsContent value="statements" className="space-y-4">
    <StatementFilterBar params={params} dashboard={catalog} issues={issues} hasMore={choices.hasNextPage??false} loadingMore={choices.isFetchingNextPage} onLoadMore={()=>{void choices.fetchNextPage();}} onApply={applyStatementFilters}/>
    {statementData.isPending&&<p role="status">Loading statements…</p>}
    {statementData.error&&<div className="panel" role="alert"><p>{statementData.error.message}</p><Button variant="outline" onClick={()=>statementData.refetch()}>Retry statements</Button></div>}
    {statementData.data&&<CreditCardStatements data={statementData.data} onView={view} onPage={page=>filter("page",String(page))} denseRows/>}
   </TabsContent>
  </Tabs>
  {document&&<CreditCardStatementDetail key={document} id={document} onClose={close}/>}
  <Link className="mt-6 inline-flex min-h-11 items-center underline" to="/import-export?tab=history">Reference uploads and Import history</Link>
  {params.has("archive")&&<LegacyStatementArchives initialId={Number(params.get("archive"))}/>}
 </>;
}
