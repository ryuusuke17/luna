import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {Area,AreaChart,Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {currentMonth} from "@/lib/transaction-filters";
import {ArrowDownLeft,ArrowUpRight,ArrowRight,Wallet,Receipt,PiggyBank,Landmark,CreditCard,Banknote,HandCoins,CircleDollarSign,ChevronDown} from "lucide-react";
import {Button} from "@/components/WorkspaceButton";
import MonthControl from "@/components/MonthControl";
import {api} from "@/lib/api";
import {formatMoney} from "@/lib/finance";
import {transactionType,transactionTypeLabel} from "@/lib/transactions";
import {calendarMonthBounds,collectStatementPages,groupCalendarEvents,localDateKey} from "@/lib/dashboard-calendar";
import {statusLabel,type CardStatement,type StatementDashboard} from "@/lib/credit-card-statements";
type Report={pendingStatementRows?:number;cashFlowBreakdown?:{classification:string;amount:number}[];month:string;assets:number;liabilities:number;netWorth:number;income:number;expenses:number;cashFlow:{amount:number};categories:{name:string;amount:number}[];merchants:{name:string;amount:number}[];daily:{name:string;amount:number}[];comparison:{name:string;income:number;expenses:number}[];coverage:{account:string;openingDate:string;reconciliationStale:boolean}[]};
type Bill={id:number;name:string;due_date:string;amount:number;transaction_id:number|null};
type Goal={id:number;name:string;allocated:number;target:number;due_date:string|null};

function accountIcon(type:string){
 switch(type){
  case "bank": return Landmark;
  case "credit_card": return CreditCard;
  case "cash": return Banknote;
  case "wallet": return Wallet;
  case "loan": return HandCoins;
  default: return CircleDollarSign;
 }
}

export default function Index(){
 const [month,setMonth]=useState(currentMonth),[breakdown,setBreakdown]=useState("category"),[day,setDay]=useState<string|null>(null);
 const [today,setToday]=useState(()=>localDateKey());
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  function updateToday(){
   const now=new Date();
   setToday(localDateKey(now));
   clearTimeout(timer);
   timer=setTimeout(updateToday,new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime()-now.getTime()+50);
  }
  updateToday();
  window.addEventListener("focus",updateToday);
  document.addEventListener("visibilitychange",updateToday);
  return ()=>{clearTimeout(timer);window.removeEventListener("focus",updateToday);document.removeEventListener("visibilitychange",updateToday);};
 },[]);
 const report=useQuery({queryKey:["reports",month],queryFn:()=>api<Report>(`reports?month=${month}`)}),transactions=useQuery({queryKey:["transactions","dashboard",month],queryFn:()=>api<{id:number;posted_date:string;description:string;merchant?:string;is_installment?:number|null;kind:string;amount:number;account_name:string}[]>(`transactions?month=${month}`)}),budgets=useQuery({queryKey:["budgets"],queryFn:()=>api<{month:string;kind:string;amount:number;actual:number}[]>("budgets")}),bills=useQuery({queryKey:["bills"],queryFn:()=>api<Bill[]>("bills")}),accounts=useQuery({queryKey:["accounts"],queryFn:()=>api<{id:number;name:string;balance:number;type:string}[]>("accounts")}),prefs=useQuery({queryKey:["preferences"],queryFn:()=>api<{bill_alerts:number;budget_alerts:number;goal_alerts:number}>("preferences")}),goals=useQuery({queryKey:["goals"],queryFn:()=>api<Goal[]>("goals")});
 const {start:dueStart,end:dueEnd,days,offset}=calendarMonthBounds(month);
 const statements=useQuery({queryKey:["credit-card-statements","calendar",month],queryFn:({signal})=>collectStatementPages<CardStatement>(page=>api<StatementDashboard>(`credit-card-statements?${new URLSearchParams({dueStart,dueEnd,page:String(page)})}`,{signal}))});
 const calendar=groupCalendarEvents(bills.data??[],statements.data??[],goals.data??[]),selected=day?calendar[day]:undefined;
 const sources=[{label:"Bills",key:"bills",query:bills,count:selected?.bills.length??0},{label:"Statement dues",key:"statements",query:statements,count:selected?.statements.length??0},{label:"Goals",key:"goals",query:goals,count:selected?.goals.length??0}];
 const calendarComplete=sources.every(s=>s.query.isSuccess&&!s.query.isFetching),selectedCount=sources.reduce((n,s)=>n+s.count,0);
 const r=report.data,expenseBudgets=budgets.data?.filter(b=>b.month===month&&b.kind==="expense"),commitments=bills.data?.filter(b=>b.due_date.startsWith(month)&&!b.transaction_id),breakdownRows=breakdown==="category"?r?.categories:r?.merchants;
 const alerts=[...(prefs.data?.bill_alerts?bills.data?.filter(b=>!b.transaction_id&&b.due_date<new Date().toISOString().slice(0,10)).map(b=>({label:`Overdue: ${b.name}`,to:`/bills?id=${b.id}`}))??[]:[]),...(prefs.data?.budget_alerts&&expenseBudgets?.some(b=>b.actual>b.amount)?[{label:"An expense budget is over its limit",to:"/budgets"}]:[]),...(prefs.data?.goal_alerts?goals.data?.filter(g=>g.allocated>=g.target).map(g=>({label:`Achieved: ${g.name}`,to:"/goals"}))??[]:[])];
 const metrics=[{label:"Spending",value:r?.expenses,Icon:ArrowUpRight},{label:"Income",value:r?.income,Icon:ArrowDownLeft},{label:"Budget planned",value:budgets.error?undefined:expenseBudgets?.reduce((n,b)=>n+b.amount,0),Icon:PiggyBank},{label:"Unpaid bills",value:bills.error?undefined:commitments?.reduce((n,b)=>n+b.amount,0),Icon:Receipt}];
 return <>
  <header className="page-heading"><div><h1>Overview</h1></div><div className="flex flex-wrap gap-2"><MonthControl month={month} onChange={v=>{setMonth(v);setDay(null);}}/></div></header>
  {report.error&&<p role="alert" className="mb-4 text-destructive">{report.error.message}</p>}
  {Boolean(r?.pendingStatementRows)&&<p role="status" className="panel mb-4">{r?.pendingStatementRows} import rows need attention. Unresolved rows are not included in balances or spending. <Link className="underline" to="/transactions">Resolve in Transactions</Link></p>}
  <section data-dark className="dark-band overview-band" aria-label="Current recorded net worth">
   <div className="flex flex-wrap items-start justify-between gap-6"><div className="min-w-0"><p className="text-sm text-white/70">Total net worth <span className="ml-2 rounded-full border border-white/25 px-2 py-1 text-xs">PHP</span></p><p className="overview-amount my-5">{r?formatMoney(r.netWorth):"—"}</p><p className="max-w-md text-xs leading-relaxed text-white/65">Current recorded balances. Not a live bank balance.</p></div><span className="hidden size-12 place-items-center rounded-full border border-white/25 sm:grid"><Wallet size={22} strokeWidth={1.5} aria-hidden/></span></div>

  </section>
  {alerts.length>0&&<section className="panel mb-6" aria-label="In-app alerts"><h2>On your radar</h2><ul className="mt-2">{alerts.slice(0,8).map((a,i)=><li key={i}><Link className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4" to={a.to}>{a.label}<ArrowUpRight size={16} aria-hidden/></Link></li>)}</ul></section>}
  <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Selected month summary">{metrics.map(({label,value,Icon})=><article className="panel" key={label}><div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p><Icon size={18} strokeWidth={1.7} className="shrink-0 text-muted-foreground" aria-hidden/></div><p className="metric">{typeof value==="number"?formatMoney(value):"—"}</p></article>)}</section>
  <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
   <section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2>Recent activity</h2><Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold" to="/transactions">View all<ArrowRight size={16} aria-hidden/></Link></div>{transactions.isPending?<p role="status">Loading activity…</p>:transactions.error?<p role="alert" className="text-destructive">{transactions.error.message}</p>:transactions.data?.length?<ul className="mt-2 divide-y">{transactions.data.slice(0,5).map(t=><li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><div className="flex min-w-0 items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary"><Receipt size={16} aria-hidden/></span><div className="min-w-0"><Link className="inline-flex min-h-9 items-center text-sm font-semibold underline-offset-4 hover:underline" to={`/transactions?id=${t.id}`}>{t.merchant||t.description||transactionTypeLabel(transactionType(t))}</Link><p className="text-xs text-muted-foreground">{t.posted_date} · {t.account_name}</p></div></div><strong className="text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</strong></li>)}</ul>:<p className="my-8 text-sm text-muted-foreground">No posted activity this month. <Link className="underline" to="/accounts">Set up an account</Link> to begin.</p>}</section>
   <section className="panel dashboard-calendar" aria-labelledby="dashboard-calendar-title">
    <p className="eyebrow mb-2">What's ahead</p><h2 id="dashboard-calendar-title">Calendar</h2>
    <p className="mt-2 text-sm text-muted-foreground">Select a date to see bills, statement dues, goal targets.</p>
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Calendar legend">
     <li className="flex items-center gap-2"><span className="calendar-today-key" aria-hidden/>Today</li>
     {sources.map(source=><li key={source.key} className="flex items-center gap-2"><span className={`calendar-marker calendar-marker-${source.key}`} aria-hidden/>{source.label}</li>)}
    </ul>
    <div className="mt-3 space-y-2 text-xs">
     {sources.map(({key,label,query})=><div key={key}>
      {query.isFetching||query.isPending?<p role="status">{query.data?`Updating ${label}…`:`Loading ${label}…`}</p>:null}
      {query.error&&<div role="alert" className="calendar-error"><p>{label} unavailable: {query.error.message}{query.data?" Showing previously loaded records.":""}</p><Button variant="outline" className="mt-2 min-h-11 max-w-full whitespace-normal" disabled={query.isFetching} aria-busy={query.isFetching} onClick={()=>query.refetch()}>Retry {label}</Button></div>}
     </div>)}
    </div>
    <div className="mt-5 grid grid-cols-7 gap-x-1 gap-y-2 p-1" role="group" aria-label={`${new Date(`${month}-01T12:00:00`).toLocaleDateString("en-PH",{month:"long",year:"numeric"})} dates`}>
     {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><span key={d} className="py-2 text-center text-xs text-muted-foreground" aria-hidden>{d}</span>)}
     {Array.from({length:offset},(_,i)=><span key={`blank-${i}`} aria-hidden/>)}
     {Array.from({length:days},(_,i)=>{
      const date=`${month}-${String(i+1).padStart(2,"0")}`,events=calendar[date];
      const counts=[events?.bills.length??0,events?.statements.length??0,events?.goals.length??0];
      const label=sources.map((source,index)=>`${source.label}: ${counts[index]}${source.query.error?", unavailable; count may be incomplete":source.query.isFetching||source.query.isPending?", loading; count may be incomplete":""}`).join("; ");
      return <button type="button" key={date} data-has-events={counts.some(count=>count>0)?"true":undefined} aria-current={date===today?"date":undefined} aria-pressed={day===date} aria-label={`${new Date(`${date}T12:00:00`).toLocaleDateString("en-PH",{dateStyle:"full"})}${date===today?", Today":""}; ${label}; ${day===date?"selected":"not selected"}`} className="calendar-day relative grid h-12 w-full min-w-0 place-items-center rounded-md border border-transparent p-0 text-center text-sm" onClick={()=>setDay(date)}>
       <span>{i+1}</span><span className="absolute inset-x-0 bottom-1 flex h-2 items-center justify-center gap-0.5" aria-hidden>{sources.map((source,index)=>counts[index]>0?<span key={source.key} className={`calendar-marker calendar-marker-${source.key}`}/>:null)}</span>
      </button>;
     })}
    </div>
    <p className="sr-only" role="status" aria-atomic="true">{day?`${new Date(`${day}T12:00:00`).toLocaleDateString("en-PH",{dateStyle:"full"})}. ${sources.map(s=>`${s.label}: ${s.count}${s.query.error?", unavailable":s.query.isFetching||s.query.isPending?", loading":""}`).join(". ")}.`:"Select a date."}</p>
    <div className="mt-4 min-w-0 border-t pt-4 text-sm">
     {day?<>
      <h3 className="text-sm font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString("en-PH",{dateStyle:"full"})}</h3>
      {calendarComplete&&selectedCount===0?<p className="mt-2 text-muted-foreground">No events on this date</p>:<div className="mt-3 space-y-4">
       <section aria-labelledby="calendar-bills"><h4 id="calendar-bills" className="font-semibold">Bills</h4>
        {selected?.bills.length?<ul className="mt-1 divide-y">{selected.bills.map(b=><li key={b.id} className="min-w-0 py-2"><Link className="inline-flex min-h-11 max-w-full items-center font-medium underline underline-offset-4" to={`/bills?id=${b.id}`}>{b.name}</Link><p className="tabular-nums">{formatMoney(b.amount)} · {b.transaction_id?"Paid":"Unpaid"}</p></li>)}</ul>:<p className="mt-1 text-xs text-muted-foreground">{bills.error?"Bills unavailable; retry above.":bills.isFetching||bills.isPending?"Loading Bills…":"No bills on this date."}</p>}
       </section>
       <section aria-labelledby="calendar-statements"><h4 id="calendar-statements" className="font-semibold">Statement dues</h4>
        {selected?.statements.length?<ul className="mt-1 divide-y">{selected.statements.map(s=><li key={s.id} className="min-w-0 py-2"><Link className="inline-flex min-h-11 max-w-full items-center font-medium underline underline-offset-4" to={`/statements?document=${s.id}`}>{s.card_name} · Statement #{s.id}</Link><p className="tabular-nums">Original balance {formatMoney(s.original_balance,s.currency)} · Minimum due {formatMoney(s.minimum_due,s.currency)}</p><p>{statusLabel(s.status)}</p><p className="text-xs text-muted-foreground">{s.tracking_confirmed?"User-confirmed tracking":"Payment coverage unknown / partial evidence"}</p></li>)}</ul>:<p className="mt-1 text-xs text-muted-foreground">{statements.error?"Statement dues unavailable; retry above.":statements.isFetching||statements.isPending?"Loading Statement dues…":"No statement dues on this date."}</p>}
       </section>
       <section aria-labelledby="calendar-goals"><h4 id="calendar-goals" className="font-semibold">Goals</h4>
        {selected?.goals.length?<ul className="mt-1 divide-y">{selected.goals.map(g=><li key={g.id} className="min-w-0 py-2"><Link className="inline-flex min-h-11 max-w-full items-center font-medium underline underline-offset-4" to="/goals">{g.name}</Link><p className="tabular-nums">{formatMoney(g.allocated)} of {formatMoney(g.target)} target · {g.allocated>=g.target?"Achieved":"Active"}</p></li>)}</ul>:<p className="mt-1 text-xs text-muted-foreground">{goals.error?"Goals unavailable; retry above.":goals.isFetching||goals.isPending?"Loading Goals…":"No goals on this date."}</p>}
       </section>
      </div>}
     </>:<p className="text-muted-foreground">Select a date.</p>}
    </div>
   </section>
   <section className="panel"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow mb-2">Where it goes</p><h2>Spending breakdown</h2></div><label className="relative inline-flex items-center"><span className="sr-only">Breakdown grouping</span><select className="min-h-11 max-w-full appearance-none rounded-full border bg-card pl-4 pr-9 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring" value={breakdown} onChange={e=>setBreakdown(e.target.value)}><option value="category">Category</option><option value="merchant">Merchant</option></select><ChevronDown size={16} className="pointer-events-none absolute right-3 text-muted-foreground" aria-hidden/></label></div>{report.isPending?<p role="status">Loading breakdown…</p>:report.error?<p role="alert">Breakdown unavailable.</p>:breakdownRows?.length?<ul className="mt-5 divide-y">{breakdownRows.map((row,i)=><li key={row.name} className="flex flex-wrap items-center justify-between gap-3 py-4"><span className="flex items-center gap-3 text-sm"><span className="size-2 shrink-0 rounded-full" style={{backgroundColor:`hsl(var(--chart-${i%5+1}))`}} aria-hidden/>{row.name}</span><strong className="text-sm font-semibold tabular-nums">{formatMoney(row.amount)}</strong></li>)}</ul>:<p className="my-10 text-sm text-muted-foreground">No recorded spending breakdown.</p>}</section>
   <section className="panel"><p className="eyebrow mb-2">The everyday</p><h2>Daily spending</h2><p className="mt-2 text-sm text-muted-foreground">Purchases less refunds. Unrecorded dates are not inferred.</p>{report.isPending?<p role="status" className="mt-5">Loading daily spending…</p>:report.error?<p role="alert">Unable to load chart.</p>:r?.daily.length?<><div className="mt-6 h-64 text-xs" aria-hidden><ResponsiveContainer><AreaChart data={r.daily} margin={{left:0,right:12,top:10,bottom:0}}><CartesianGrid stroke="hsl(var(--border))" vertical={false}/><XAxis dataKey="name" tickFormatter={v=>String(v).slice(8)} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} tickMargin={12}/><YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={v=>`₱${Number(v)/100}`} axisLine={false} tickLine={false} width={65}/><Tooltip formatter={v=>formatMoney(Number(v))}/><Area type="monotone" dataKey="amount" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="hsl(var(--chart-1))" fillOpacity={.07}/></AreaChart></ResponsiveContainer></div><details className="mt-3 border-t"><summary className="min-h-11 py-3 text-sm font-semibold">View daily spending table</summary><div className="table-scroll" role="region" aria-label="Daily spending table" tabIndex={0}><table><caption className="sr-only">Daily spending</caption><thead><tr><th scope="col">Date</th><th scope="col">Spending</th></tr></thead><tbody>{r.daily.map(d=><tr key={d.name}><th scope="row">{d.name}</th><td className="amount">{formatMoney(d.amount)}</td></tr>)}</tbody></table></div></details></>:<p className="my-10 text-sm text-muted-foreground">No recorded spending in this period.</p>}</section>
   <section className="panel"><h2>Six-month comparison</h2><p className="mt-2 text-sm text-muted-foreground">Only months with recorded income/spending shown. Missing history is unknown.</p>{report.isPending?<p role="status">Loading comparison…</p>:report.error?<p role="alert">Comparison unavailable.</p>:r?.comparison.length?<><div className="mt-4 h-64 text-xs" aria-hidden><ResponsiveContainer><BarChart data={r.comparison}><CartesianGrid stroke="hsl(var(--border))" vertical={false}/><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false}/><YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={v=>`₱${Number(v)/100}`} axisLine={false} tickLine={false} width={65}/><Tooltip formatter={v=>formatMoney(Number(v))}/><Bar dataKey="income" fill="hsl(var(--chart-2))" radius={[4,4,0,0]}/><Bar dataKey="expenses" fill="hsl(var(--chart-3))" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div><div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[hsl(var(--chart-2))]"/>Income</span><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[hsl(var(--chart-3))]"/>Spending</span></div><details className="mt-3 border-t"><summary className="min-h-11 py-3 text-sm font-semibold">View comparison table</summary><div className="table-scroll" role="region" aria-label="Six-month comparison table" tabIndex={0}><table><thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th></tr></thead><tbody>{r.comparison.map(d=><tr key={d.name}><th scope="row">{d.name}</th><td className="amount">{formatMoney(d.income)}</td><td className="amount">{formatMoney(d.expenses)}</td></tr>)}</tbody></table></div></details></>:<p className="my-10 text-sm text-muted-foreground">No recorded comparison data.</p>}</section>
   <section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Your accounts</h2><p className="text-xs text-muted-foreground">{r?formatMoney(r.netWorth):"—"} recorded net worth</p></div><Link className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline" to="/accounts">Manage<ArrowRight size={14} aria-hidden/></Link></div>{accounts.isPending?<p role="status" className="mt-3 text-xs">Loading accounts…</p>:accounts.error?<p role="alert" className="mt-3 text-xs text-destructive">{accounts.error.message}</p>:accounts.data?.length?<ul className="mt-3 divide-y">{accounts.data.map(a=>{const Icon=accountIcon(a.type);return <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="flex min-w-0 items-center gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground"><Icon size={15} aria-hidden/></span><Link className="truncate font-medium underline-offset-4 hover:underline" to={`/accounts?id=${a.id}`}>{a.name}</Link></div><strong className="shrink-0 text-xs font-semibold tabular-nums">{formatMoney(a.balance)}</strong></li>;})}</ul>:<p className="my-4 text-xs text-muted-foreground">No accounts yet.</p>}{r?.coverage.length?<details className="mt-3 border-t pt-2"><summary className="cursor-pointer py-1 text-xs text-muted-foreground">History coverage</summary><ul className="mt-1 text-xs text-muted-foreground">{r.coverage.map(c=><li key={c.account}>{c.account}: since {c.openingDate}</li>)}</ul></details>:null}</section>
  </div>

  {r?.cashFlowBreakdown?.length?<section className="panel mt-6" aria-label="Cash flow classifications"><h2>Cash flow · {month}</h2><p className="mt-2 text-sm text-muted-foreground">Liquid account movements. Card repayments and loan proceeds are not spending or earned income.</p><ul className="mt-3">{r.cashFlowBreakdown.map(c=><li key={c.classification} className="flex flex-wrap justify-between gap-3 py-2">{c.classification}<strong>{formatMoney(c.amount)}</strong></li>)}</ul></section>:null}
  {budgets.error&&<p role="alert" className="mt-4 text-destructive">Budget summary: {budgets.error.message}</p>}{prefs.error||goals.error?<p role="alert" className="mt-4 text-destructive">Alert preferences/goals unavailable: {(prefs.error??goals.error)?.message}</p>:null}
 </>;
}
