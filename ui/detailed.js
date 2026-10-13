"use strict";

// ponytail: fictional, session-only records; add persistent storage only after backup and privacy requirements are settled.
const demoToday = "2026-10-14";
const demo = {
  transactions: [
    { id:"tx1", date:"2026-10-13", name:"Weekly groceries", merchant:"Fresh Market", category:"Food", type:"expense", account:"Main bank", amount:2150, status:"Cleared", note:"Weekly essentials" },
    { id:"tx2", date:"2026-10-12", name:"Coffee and lunch", merchant:"Corner Cafe", category:"Dining", type:"expense", account:"Wallet", amount:480, status:"Cleared", note:"" },
    { id:"tx3", date:"2026-10-10", name:"Monthly salary", merchant:"Demo employer", category:"Income", type:"income", account:"Main bank", amount:45000, status:"Cleared", note:"Sample payday" },
    { id:"tx4", date:"2026-10-09", name:"Electricity", merchant:"Power provider", category:"Bills & utilities", type:"expense", account:"Main bank", amount:3400, status:"Cleared", note:"Monthly electricity" },
    { id:"tx5", date:"2026-10-08", name:"Credit card payment", merchant:"Internal transfer", category:"Transfer", type:"transfer", account:"Main bank", destination:"Everyday credit", amount:5000, status:"Cleared", note:"Transfer, not a new expense" },
    { id:"tx6", date:"2026-10-07", name:"Phone subscription", merchant:"Mobile provider", category:"Subscriptions", type:"expense", account:"Everyday credit", amount:1200, status:"Pending", note:"Monthly phone plan" },
    { id:"tx7", date:"2026-10-05", name:"Commute", merchant:"City transport", category:"Transport", type:"expense", account:"Wallet", amount:650, status:"Cleared", note:"Weekly transport" },
    { id:"tx8", date:"2026-10-03", name:"House rent", merchant:"Demo landlord", category:"Home", type:"expense", account:"Main bank", amount:10000, status:"Cleared", note:"October rent" },
    { id:"tx9", date:"2026-10-02", name:"Weekend groceries", merchant:"Fresh Market", category:"Food", type:"expense", account:"Main bank", amount:570, status:"Cleared", note:"" },
    { id:"tx10", date:"2026-09-28", name:"Groceries", merchant:"Fresh Market", category:"Food", type:"expense", account:"Main bank", amount:1980, status:"Cleared", note:"September sample" },
    { id:"tx11", date:"2026-09-10", name:"Monthly salary", merchant:"Demo employer", category:"Income", type:"income", account:"Main bank", amount:45000, status:"Cleared", note:"September sample" },
    { id:"tx12", date:"2026-08-10", name:"Monthly salary", merchant:"Demo employer", category:"Income", type:"income", account:"Main bank", amount:45000, status:"Cleared", note:"August sample" },
    { id:"tx13", date:"2026-08-04", name:"Rent and utilities", merchant:"Home services", category:"Home", type:"expense", account:"Main bank", amount:14350, status:"Cleared", note:"August sample" },
    { id:"tx14", date:"2026-07-10", name:"Monthly salary", merchant:"Demo employer", category:"Income", type:"income", account:"Main bank", amount:43000, status:"Cleared", note:"July sample" },
    { id:"tx15", date:"2026-07-04", name:"Rent and utilities", merchant:"Home services", category:"Home", type:"expense", account:"Main bank", amount:12600, status:"Cleared", note:"July sample" }
  ],
  budgets: [
    { id:"budget1", name:"Monthly essentials", category:"Home", limit:15000, type:"expense", rollover:false },
    { id:"budget2", name:"Food & groceries", category:"Food", limit:8000, type:"expense", rollover:false },
    { id:"budget3", name:"Transport", category:"Transport", limit:3000, type:"expense", rollover:false },
    { id:"budget4", name:"Dining & coffee", category:"Dining", limit:2000, type:"expense", rollover:true },
    { id:"budget5", name:"Income target", category:"Income", limit:50000, type:"income", rollover:false }
  ],
  bills: [
    { id:"bill1", name:"Home internet", category:"Bills & utilities", due:"2026-10-18", amount:1699, account:"Main bank", cadence:"Monthly", status:"upcoming" },
    { id:"bill2", name:"House rent", category:"Home", due:"2026-10-20", amount:12000, account:"Main bank", cadence:"Monthly", status:"upcoming" },
    { id:"bill3", name:"Credit card", category:"Credit payment", due:"2026-10-25", amount:4500, account:"Everyday credit", cadence:"Monthly", status:"upcoming" },
    { id:"bill4", name:"Water service", category:"Bills & utilities", due:"2026-10-08", amount:620, account:"Main bank", cadence:"Monthly", status:"overdue" },
    { id:"bill5", name:"Phone plan", category:"Subscriptions", due:"2026-10-07", amount:1200, account:"Everyday credit", cadence:"Monthly", status:"paid" },
    { id:"bill6", name:"Annual membership", category:"Personal", due:"2026-11-06", amount:1800, account:"Main bank", cadence:"Yearly", status:"upcoming" }
  ],
  goals: [
    { id:"goal1", name:"Emergency fund", target:100000, saved:45000, due:"2027-06-30", account:"Savings", category:"Safety net" },
    { id:"goal2", name:"A well-earned trip", target:40000, saved:12000, due:"2027-03-31", account:"Savings", category:"Travel" },
    { id:"goal3", name:"New desk setup", target:15000, saved:15000, due:"2026-09-30", account:"Savings", category:"Personal" }
  ],
  accounts: [
    { id:"account1", name:"Main bank", type:"Bank account", institution:"Demo bank", balance:72000, group:"cash", lastUpdated:"2026-10-14" },
    { id:"account2", name:"Wallet", type:"Cash", institution:"Personal wallet", balance:3500, group:"cash", lastUpdated:"2026-10-14" },
    { id:"account3", name:"Savings", type:"Savings account", institution:"Demo bank", balance:19500, group:"cash", lastUpdated:"2026-10-12" },
    { id:"account4", name:"Everyday credit", type:"Credit card", institution:"Demo card issuer", balance:-12300, group:"credit", limit:60000, lastUpdated:"2026-10-13" }
  ],
  categories:["Food","Dining","Home","Bills & utilities","Transport","Subscriptions","Health","Personal","Income","Transfer"],
  rules:[{ phrase:"Fresh Market", category:"Food" },{ phrase:"Mobile provider", category:"Subscriptions" }],
  providers:[{ name:"Power provider", category:"Electricity" },{ name:"Mobile provider", category:"Phone" },{ name:"Home internet", category:"Internet" }]
};
const state = { ...structuredClone(demo), month:"2026-10", route:"dashboard", breakdown:"category", budgetType:"expense", billFilter:"upcoming", goalFilter:"active", txType:"all", txQuery:"", txCategory:"all", txAccount:"all", txStatus:"all", txSort:"newest", account:"account1", settings:"profile", importMode:"spreadsheet", reminder:true, budgetAlert:true, goalAlert:false, file:null, selectedDay:null };
const routeNames = { dashboard:"Dashboard", budget:"Budget", bills:"My bills", goals:"Goals", transactions:"Transactions", accounts:"Accounts", settings:"Settings", import:"Import transactions", help:"Help & support" };
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
const cash = value => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(value);
const shortDate = value => new Intl.DateTimeFormat("en",{month:"short",day:"numeric"}).format(new Date(`${value}T12:00:00`));
const monthDate = key => new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1);
const monthLabel = key => new Intl.DateTimeFormat("en",{month:"long",year:"numeric"}).format(monthDate(key));
const monthKey = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}`;
const sum = entries => entries.reduce((total,item)=>total+Math.round(item.amount*100),0)/100;
const monthTransactions = () => state.transactions.filter(item=>item.date.slice(0,7)===state.month);
const expenseTransactions = () => monthTransactions().filter(item=>item.type==="expense");
const totalType = type => sum(monthTransactions().filter(item=>item.type===type));
const progress = (value,max,tone="",label="Amount progress") => `<div class="progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuetext="${cash(value)} of ${cash(max)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(max,value)}"><span class="${tone}" style="width:${Math.min(100,Math.max(0,value/Math.max(1,max)*100))}%"></span></div>`;
const badge = (text,tone="") => `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
const stat = (label,value,note="",tone="") => `<article class="stat"><div class="stat-label">${label}</div><div class="stat-value ${tone}">${value}</div><div class="stat-note">${note}</div></article>`;
const monthControl = () => `<div class="month-control"><button data-action="month" data-step="-1" aria-label="Previous month">&lsaquo;</button><span>${monthLabel(state.month)}</span><button data-action="month" data-step="1" aria-label="Next month">&rsaquo;</button></div>`;
const pageHead = (title,subtitle,actions="") => `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
const cardHead = (title,subtitle="",action="") => `<div class="card-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:""}</div>${action}</div>`;
const empty = (title,text,action="") => `<div class="empty"><strong>${title}</strong><p>${text}</p>${action}</div>`;
const tabs = (items,current,action) => `<div class="tabs" role="group" aria-label="${action.replaceAll("-"," ")}">${items.map(([value,label])=>`<button class="tab" aria-pressed="${current===value}" data-action="${action}" data-value="${value}">${label}</button>`).join("")}</div>`;
const transactionRow = item => `<div class="row"><div class="row-title"><span class="tile ${item.type==="income"?"mint":item.type==="transfer"?"cream":""}">${escapeHtml(item.category.slice(0,2).toUpperCase())}</span><div><strong>${escapeHtml(item.name)}</strong><small>${shortDate(item.date)} / ${escapeHtml(item.category)}</small></div></div><button class="link amount ${item.type==="income"?"green":""}" data-action="transaction-detail" data-id="${item.id}">${item.type==="income"?"+":item.type==="expense"?"-":""}${cash(item.amount)}</button></div>`;
const groupTotals = key => expenseTransactions().reduce((groups,item)=>{groups[item[key]]=(groups[item[key]]||0)+item.amount;return groups;},Object.create(null));

function trendChart() {
  const date=monthDate(state.month);
  const days=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  const daily=Array.from({length:days},()=>0);
  expenseTransactions().forEach(item=>{daily[Number(item.date.slice(-2))-1]+=item.amount;});
  const max=Math.max(1,...daily);
  const points=daily.map((value,index)=>`${15+index/(days-1)*605},${185-value/max*160}`).join(" ");
  const ticks=[1,Math.ceil(days/4),Math.ceil(days/2),Math.ceil(days*3/4),days];
  return `<div class="chart"><svg viewBox="0 0 635 200" role="img" aria-label="Daily expense chart. ${cash(totalType("expense"))} recorded this month."><defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3976e8" stop-opacity=".18"/><stop offset="1" stop-color="#3976e8" stop-opacity=".015"/></linearGradient></defs><path d="M15 25H620M15 65H620M15 105H620M15 145H620M15 185H620" stroke="#edf1f7" fill="none"/><polygon points="15,185 ${points} 620,185" fill="url(#trend-fill)"/><polyline points="${points}" fill="none" stroke="#3976e8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg></div><div class="chart-labels">${ticks.map(day=>`<span>${shortDate(`${state.month}-${String(day).padStart(2,"0")}`)}</span>`).join("")}</div>`;
}
function breakdownChart() {
  const groups=Object.entries(groupTotals(state.breakdown)).sort((first,second)=>second[1]-first[1]);
  const total=totalType("expense")||1;
  return `${tabs([["category","By category"],["merchant","By merchant"]],state.breakdown,"breakdown")}${groups.length?groups.map(([label,value],index)=>`<div><div class="progress-head"><span>${escapeHtml(label)}</span><strong>${cash(value)} <span class="muted">${Math.round(value/total*100)}%</span></strong></div>${progress(value,total,index%2?"green":"",label)}</div>`).join(""):empty("No spending data","Record an expense to see your spending breakdown.")}`;
}
function cashflowChart() {
  const months=Array.from({length:6},(_,index)=>{const date=monthDate(state.month);date.setMonth(date.getMonth()-5+index);const entries=state.transactions.filter(item=>item.date.slice(0,7)===monthKey(date));return {label:new Intl.DateTimeFormat("en",{month:"short"}).format(date),income:sum(entries.filter(item=>item.type==="income")),expense:sum(entries.filter(item=>item.type==="expense"))};});
  const max=Math.max(1,...months.flatMap(item=>[item.income,item.expense]));
  return `<div class="chart-legend"><span><i class="dot income"></i>Income</span><span><i class="dot"></i>Expenses</span></div><div class="bar-chart" role="img" aria-label="Income and expenses for the last six months">${months.map(item=>`<div class="bar-group"><div class="bar-pair"><span class="bar income" title="Income: ${cash(item.income)}" style="height:${Math.max(1,item.income/max*100)}%"></span><span class="bar" title="Expenses: ${cash(item.expense)}" style="height:${Math.max(1,item.expense/max*100)}%"></span></div><span>${item.label}</span></div>`).join("")}</div><p class="small muted">Demo months without entries are shown as zero.</p>`;
}
function calendar() {
  const date=monthDate(state.month),days=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  const bills=state.bills.filter(item=>item.due.slice(0,7)===state.month&&item.status!=="paid");
  const cells=Array.from({length:date.getDay()},()=>`<span class="day blank"></span>`);
  for(let day=1;day<=days;day++) { const key=`${state.month}-${String(day).padStart(2,"0")}`,events=bills.filter(item=>item.due===key);cells.push(`<button class="day ${key===demoToday?"today":""} ${events.length?"event":""}" data-action="calendar-day" data-value="${key}" aria-label="${shortDate(key)}${events.length?`, ${events.length} bills`:""}">${day}</button>`); }
  const selected=state.selectedDay?bills.filter(item=>item.due===state.selectedDay):bills.slice(0,3);
  return `<div class="calendar">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(label=>`<span class="day-label">${label}</span>`).join("")}${cells.join("")}</div>${selected.length?selected.map(item=>`<div class="row"><span class="small"><strong>${shortDate(item.due)}</strong> / ${escapeHtml(item.name)}</span><strong class="amount">${cash(item.amount)}</strong></div>`).join(""):`<p class="small muted">${state.selectedDay?`No bills on ${shortDate(state.selectedDay)}.`:"No upcoming bills in this month."}</p>`}`;
}
function dashboardView() {
  const expenses=totalType("expense"),income=totalType("income"),budget=state.budgets.filter(item=>item.type==="expense").reduce((total,item)=>total+item.limit,0);
  const bills=state.bills.filter(item=>item.status==="upcoming"&&item.due.slice(0,7)===state.month);
  const latest=monthTransactions().slice().sort((first,second)=>second.date.localeCompare(first.date)).slice(0,5);
  const assets=state.accounts.filter(item=>item.group==="cash").reduce((total,item)=>total+item.balance,0),credit=state.accounts.filter(item=>item.group==="credit").reduce((total,item)=>total+item.balance,0);
  return `${pageHead("Your money, at a glance","Keep today clear. Make room for tomorrow.",`${monthControl()}<button class="quiet" data-action="new-transaction">+ Add expense</button>`)}<div class="stats">${stat("MONTHLY SPENDING",cash(expenses),`${expenseTransactions().length} expense entries`)}${stat("MONTHLY INCOME",cash(income),"Recorded income","green")}${stat("BUDGET REMAINING",cash(Math.max(0,budget-expenses)),`${cash(budget)} planned`)}${stat("BILLS DUE",cash(sum(bills)),`${bills.length} upcoming reminders`,"amber")}</div><div class="dashboard-grid"><article class="card">${cardHead(`Spending in ${monthLabel(state.month).split(" ")[0]}`,"Daily expenses, not account transfers",badge("Actual spending","blue"))}<div class="metric">${cash(expenses)} <small>Projected: ${cash(expenses*2)}</small></div>${trendChart()}<p class="small muted">Projection is illustrative, not a financial forecast.</p></article><article class="card">${cardHead("Recent transactions","Latest activity in your ledger",`<a class="link" href="#transactions">View all</a>`)}${latest.length?latest.map(transactionRow).join(""):empty("No recent activity","Try a month with demo entries, or add a demo transaction.")}</article><article class="card">${cardHead("Spending analysis","See what makes up this month")}${breakdownChart()}</article><article class="card">${cardHead("Cash flow trend","Last six months")}${cashflowChart()}</article><article class="card">${cardHead("Planner","Select a date to see its bills",`<a class="link" href="#bills">All bills</a>`)}${calendar()}</article><article class="card">${cardHead("Accounts","Manually tracked demo balances",`<a class="link" href="#accounts">Manage</a>`)}${state.accounts.map(item=>`<div class="row"><div class="row-title"><span class="tile ${item.group==="credit"?"cream":"mint"}">${item.group==="credit"?"CC":"BK"}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.type)}</small></div></div><strong class="amount">${cash(item.balance)}</strong></div>`).join("")}<div class="row"><strong class="small">Net position</strong><strong class="amount green">${cash(assets+credit)}</strong></div></article></div>`;
}

function budgetView() {
  const budgets=state.budgets.filter(item=>item.type===state.budgetType);
  const used=totalType(state.budgetType),planned=budgets.reduce((total,item)=>total+item.limit,0);
  const cards=budgets.map(item=>{const spent=sum(monthTransactions().filter(entry=>entry.type===state.budgetType&&entry.category===item.category));const ratio=Math.round(spent/item.limit*100),tone=ratio>=90?"amber":ratio<60?"green":"";return `<article class="card"><div class="card-head"><div><span class="tile">${escapeHtml(item.category.slice(0,2).toUpperCase())}</span></div><button class="link" data-action="edit-budget" data-id="${item.id}">Edit budget</button></div><h2>${escapeHtml(item.name)}</h2><p class="small muted">${escapeHtml(item.category)} / monthly ${state.budgetType==="income"?"target":"limit"}</p><div class="metric">${cash(spent)} <small>/ ${cash(item.limit)}</small></div><div class="progress-head"><span>${ratio}% ${state.budgetType==="income"?"achieved":"used"}</span>${badge(ratio>=100?"Limit reached":ratio>=90?"Nearly full":"On track",tone)}</div>${progress(spent,item.limit,tone,item.name)}<div class="progress-note"><span>${cash(Math.max(0,item.limit-spent))} remaining</span><span>${item.rollover?"Rollover on":"Resets monthly"}</span></div></article>`;}).join("");
  return `${pageHead("Make a plan for the month","Simple category budgets. Clear spending limits.",`${monthControl()}<button class="primary" data-action="new-budget">+ Create budget</button>`,"Budget")}${tabs([["expense","Expenses"],["income","Income"]],state.budgetType,"budget-type")}<div class="stats">${stat("TOTAL PLANNED",cash(planned),`${budgets.length} category budgets`)}${stat("ACTUAL THIS MONTH",cash(used),"Includes uncategorized budgets")}${stat("REMAINING",cash(Math.max(0,planned-used)),"Planning summary only","green")}${stat("PLAN USED",`${planned?Math.round(used/planned*100):0}%`,monthLabel(state.month))}</div><div class="grid-two">${cards||`<article class="card wide">${empty("No budgets in this view","Create a category budget to track progress.",`<button class="primary" data-action="new-budget">Create budget</button>`)}</article>`}</div><div class="callout">A budget is a plan, not an account balance. Transactions keep their own categories and dates.</div>`;
}
function billView() {
  const items=state.bills.filter(item=>state.billFilter==="recurring"?item.cadence!=="One time":item.status===state.billFilter).sort((first,second)=>first.due.localeCompare(second.due));
  const monthBills=state.bills.filter(item=>item.due.slice(0,7)===state.month);
  const upcoming=monthBills.filter(item=>item.status==="upcoming"),paid=monthBills.filter(item=>item.status==="paid");
  const groups=items.reduce((map,item)=>{const key=item.due.slice(0,7);(map[key]??=[]).push(item);return map;},{});
  const rows=Object.entries(groups).map(([key,entries])=>`<div><h3 class="muted" style="margin:20px 0 4px">${monthLabel(key)}</h3>${entries.map(item=>{const days=Math.round((new Date(`${item.due}T12:00:00`)-new Date(`${demoToday}T12:00:00`))/86400000);return `<div class="bill-row"><div class="date-tile"><strong>${Number(item.due.slice(-2))}</strong><small>${shortDate(item.due).split(" ")[0]}</small></div><div><h3>${escapeHtml(item.name)}</h3><span class="small muted">${escapeHtml(item.cadence)} / ${escapeHtml(item.account)}</span><div>${badge(item.status==="paid"?"Paid":days<0?`${Math.abs(days)} days late`:`Due in ${days} days`,item.status==="paid"?"green":days<0?"red":"amber")}</div></div><span class="amount">${cash(item.amount)}</span><button class="quiet" data-action="${item.status==="paid"?"bill-detail":"mark-paid"}" data-id="${item.id}">${item.status==="paid"?"Details":"Record payment"}</button></div>`;}).join("")}</div>`).join("");
  return `${pageHead("One less thing to remember","Plan payments without connecting a bank account.",`<button class="primary" data-action="new-bill">+ Add bill</button>`,"My bills")}<div class="toolbar">${tabs([["upcoming","Upcoming"],["overdue","Overdue"],["recurring","Recurring"],["paid","Paid"]],state.billFilter,"bill-filter")}<span class="spacer"></span>${monthControl()}</div><div class="layout-aside"><article class="card">${cardHead(routeNames.bills,"Dates grouped by month",badge(`${items.length} items`))}${rows||empty("Nothing here right now","Choose another status or add a new reminder.",`<button class="primary" data-action="new-bill">Add bill</button>`)}</article><aside class="stack"><article class="card">${cardHead("Monthly commitments",monthLabel(state.month))}<div class="metric">${cash(sum(monthBills))}</div><div class="row"><span class="small">Still due</span><strong>${cash(sum(upcoming))}</strong></div><div class="row"><span class="small">Recorded paid</span><strong class="green">${cash(sum(paid))}</strong></div><div class="row"><span class="small">Recurring reminders</span><strong>${monthBills.filter(item=>item.cadence!=="One time").length}</strong></div></article><article class="card"><h2>Reminder preferences</h2><p class="small muted">Default lead time: 3 days before a due date.</p><a class="link" href="#settings" data-settings-link="notifications">Manage reminders</a><div class="callout warning">Reminders never schedule or execute payments. Recording payment only updates this demo.</div></article></aside></div>`;
}
function goalsView() {
  const items=state.goals.filter(item=>(item.saved>=item.target)===(state.goalFilter==="achieved"));
  const saved=state.goals.reduce((total,item)=>total+item.saved,0),target=state.goals.reduce((total,item)=>total+item.target,0);
  return `${pageHead("Save toward something meaningful","Turn a future plan into a visible target.",`<button class="primary" data-action="new-goal">+ New goal</button>`,"Goals")}<div class="stats">${stat("TOTAL ALLOCATED",cash(saved),"Tracked contributions, not bank transfers")}${stat("TOTAL TARGET",cash(target),`${state.goals.length} savings goals`)}${stat("ACTIVE GOALS",String(state.goals.filter(item=>item.saved<item.target).length),"In progress")}${stat("ACHIEVED",String(state.goals.filter(item=>item.saved>=item.target).length),"Targets reached","green")}</div>${tabs([["active","Active"],["achieved","Achieved"]],state.goalFilter,"goal-filter")}<div class="grid-two">${items.map(item=>{const percent=Math.min(100,Math.round(item.saved/item.target*100));return `<article class="card goal-card"><div>${badge(item.saved>=item.target?"Achieved":item.category,item.saved>=item.target?"green":"blue")}<h2 style="margin:12px 0 5px">${escapeHtml(item.name)}</h2><p class="small muted">Target ${shortDate(item.due)}, ${item.due.slice(0,4)} / ${escapeHtml(item.account)}</p><div class="metric">${cash(item.saved)} <small>of ${cash(item.target)}</small></div><div class="progress-head"><span>${cash(Math.max(0,item.target-item.saved))} to go</span><span>${percent}%</span></div>${progress(item.saved,item.target,item.saved>=item.target?"green":"",item.name)}<div class="toolbar" style="margin:15px 0 0">${item.saved<item.target?`<button class="quiet" data-action="goal-funds" data-id="${item.id}">+ Add contribution</button>`:""}<button class="link" data-action="goal-detail" data-id="${item.id}">View details</button></div></div><div class="goal-ring" style="--percent:${percent}%"><strong>${percent}%</strong></div></article>`;}).join("")||`<article class="card wide">${empty("No goals in this view","Your active and achieved goals appear here.",`<button class="primary" data-action="new-goal">Create a goal</button>`)}</article>`}</div>`;
}
function filteredTransactions() {
  const query=state.txQuery.trim().toLowerCase();
  const items=monthTransactions().filter(item=>(state.txType==="all"||item.type===state.txType)&&(state.txCategory==="all"||item.category===state.txCategory)&&(state.txAccount==="all"||item.account===state.txAccount)&&(state.txStatus==="all"||item.status===state.txStatus)&&(!query||`${item.name} ${item.merchant} ${item.note}`.toLowerCase().includes(query)));
  return items.sort((first,second)=>state.txSort==="amount"?second.amount-first.amount:state.txSort==="oldest"?first.date.localeCompare(second.date):second.date.localeCompare(first.date));
}
function transactionTable() {
  const items=filteredTransactions();
  return items.length?`<div class="table-wrap"><table class="transaction-table"><caption class="sr-only">Transactions in ${monthLabel(state.month)}</caption><thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th>Account</th><th>Status</th><th class="right">Amount</th></tr></thead><tbody>${items.map(item=>`<tr><td>${shortDate(item.date)}</td><td><button class="link" data-action="transaction-detail" data-id="${item.id}">${escapeHtml(item.name)}</button><div class="muted" style="margin-top:3px;font-size:9px">${escapeHtml(item.merchant)}</div></td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.account)}</td><td>${badge(item.status,item.status==="Cleared"?"green":"amber")}</td><td class="right amount ${item.type==="income"?"green":""}">${item.type==="income"?"+":item.type==="expense"?"-":""}${cash(item.amount)}</td></tr>`).join("")}</tbody></table></div><div class="progress-note" style="margin-top:14px"><span>${items.length} transactions shown</span><span>Transfers are excluded from income and expense totals.</span></div>`:empty("No matching transactions","Try another month or clear a filter.",`<button class="quiet" data-action="clear-filters">Clear filters</button>`);
}
function transactionView() {
  const categoryOptions=state.categories.map(item=>`<option ${item===state.txCategory?"selected":""}>${escapeHtml(item)}</option>`).join("");
  const accountOptions=state.accounts.map(item=>`<option ${item.name===state.txAccount?"selected":""}>${escapeHtml(item.name)}</option>`).join("");
  return `${pageHead("Your activity, in detail","Every entry has a date, category, account, and status.",`<button class="quiet" data-action="export">Export CSV</button><button class="primary" data-action="new-transaction">+ Add transaction</button>`,"Transactions")}<div class="toolbar">${tabs([["all","All"],["expense","Expenses"],["income","Income"],["transfer","Transfers"]],state.txType,"transaction-type")}<span class="spacer"></span>${monthControl()}</div><article class="card"><div class="toolbar"><input class="input" id="transaction-search" type="search" placeholder="Search this month" value="${escapeHtml(state.txQuery)}" aria-label="Search transactions"><select class="input" data-filter="txCategory" aria-label="Filter by category"><option value="all">All categories</option>${categoryOptions}</select><select class="input" data-filter="txAccount" aria-label="Filter by account"><option value="all">All accounts</option>${accountOptions}</select><select class="input" data-filter="txStatus" aria-label="Filter by status"><option value="all">All statuses</option><option ${state.txStatus==="Cleared"?"selected":""}>Cleared</option><option ${state.txStatus==="Pending"?"selected":""}>Pending</option></select><span class="spacer"></span><select class="input" data-filter="txSort" aria-label="Sort transactions"><option value="newest" ${state.txSort==="newest"?"selected":""}>Newest first</option><option value="oldest" ${state.txSort==="oldest"?"selected":""}>Oldest first</option><option value="amount" ${state.txSort==="amount"?"selected":""}>Largest amount</option></select></div><div id="transaction-results">${transactionTable()}</div></article>`;
}
function accountView() {
  const assets=state.accounts.filter(item=>item.group==="cash"),credit=state.accounts.filter(item=>item.group==="credit");
  const assetsTotal=assets.reduce((total,item)=>total+item.balance,0),creditTotal=credit.reduce((total,item)=>total+item.balance,0);
  const selected=state.accounts.find(item=>item.id===state.account)||state.accounts[0];
  const accountCard=item=>`<button class="account-card" data-action="account" data-id="${item.id}" aria-pressed="${item.id===selected.id}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.institution)} / ${escapeHtml(item.type)}</small><span class="metric">${cash(item.balance)}</span></button>`;
  const activity=state.transactions.filter(item=>item.account===selected.name||item.destination===selected.name).slice(0,5);
  return `${pageHead("Keep your accounts in view","Manual balances. No linked bank credentials.",`<button class="quiet" data-action="refresh-accounts">Refresh</button><button class="primary" data-action="new-account">+ Add account</button>`,"Accounts")}<div class="stats">${stat("CASH & BANK",cash(assetsTotal),`${assets.length} accounts`)}${stat("CREDIT BALANCES",cash(Math.abs(creditTotal)),`${credit.length} cards`)}${stat("NET POSITION",cash(assetsTotal+creditTotal),"Assets minus credit balances","green")}${stat("TOTAL ACCOUNTS",String(state.accounts.length),"All manual accounts")}</div><div class="account-layout"><div class="stack"><article class="card">${cardHead("Cash & bank","Spending accounts, wallets, and savings")}<div class="grid-two">${assets.map(accountCard).join("")}</div></article><article class="card">${cardHead("Credit","Card balances and available credit")}<div class="grid-two">${credit.map(accountCard).join("")||empty("No credit accounts","Add a card to track its balance and limit.")}</div></article></div><aside class="card">${cardHead("Account details",escapeHtml(selected.institution),badge(selected.group==="credit"?"Credit":"Cash & bank","blue"))}<h2>${escapeHtml(selected.name)}</h2><div class="metric">${cash(selected.balance)}</div><div class="row"><span class="small">Type</span><strong class="small">${escapeHtml(selected.type)}</strong></div>${selected.limit?`<div class="row"><span class="small">Credit limit</span><strong class="small">${cash(selected.limit)}</strong></div>${progress(Math.abs(selected.balance),selected.limit,"amber")}<p class="small muted">${cash(selected.limit-Math.abs(selected.balance))} available</p>`:""}<div class="row"><span class="small">Last updated</span><strong class="small">${shortDate(selected.lastUpdated)}</strong></div><button class="quiet" data-action="edit-account" data-id="${selected.id}" style="margin:10px 0 20px">Edit details</button><h2>Recent activity</h2>${activity.map(transactionRow).join("")||empty("No activity","Transactions assigned to this account appear here.")}</aside></div>`;
}

function settingsContent() {
  const switchControl=(key,label,value)=>`<button class="switch" role="switch" aria-label="${label}" aria-checked="${value}" data-action="switch" data-key="${key}"></button>`;
  const setting=(title,description,control)=>`<div class="setting-row"><span><strong>${title}</strong><small>${description}</small></span>${control}</div>`;
  if(state.settings==="profile") return `<h2>Profile</h2><p class="small muted">A name and label for your personal workspace.</p>${setting("Display name","Used only in this demo session",`<input class="input" id="display-name" aria-label="Display name" maxlength="60" value="${escapeHtml(state.displayName||"Local workspace")}">`)}${setting("Workspace type","Single-person money tracking",badge("Personal","blue"))}${setting("Email","No sign-in service is connected",`<input class="input" type="email" placeholder="Not required" aria-label="Profile email" disabled>`)}<button class="primary" data-action="save-profile" style="margin-top:18px">Save profile</button>`;
  if(state.settings==="preferences") return `<h2>Currency & language</h2><p class="small muted">Display preferences for the personal-use version.</p>${setting("Base currency","All fictional amounts in this skeleton are PHP",`<select class="input" aria-label="Base currency" disabled><option>PHP / Philippine peso</option></select>`)}${setting("Language","English interface",`<select class="input" aria-label="Language" disabled><option>English</option></select>`)}${setting("Date format","Dates stay local calendar dates",badge("Oct 14, 2026"))}${setting("Appearance","Reference-inspired light layout",badge("Light"))}<div class="callout">Currency conversion and multilingual text are not implemented. Historical amounts should never silently change when a display setting changes.</div>`;
  if(state.settings==="categories") return `<div class="card-head"><div><h2>Categories</h2><p>Consistent labels make reports useful.</p></div><button class="quiet" data-action="new-category">+ Add category</button></div>${state.categories.map((item,index)=>`<div class="row"><div class="row-title"><span class="tile">${String(index+1).padStart(2,"0")}</span><strong>${escapeHtml(item)}</strong></div>${badge(item==="Income"?"Income":item==="Transfer"?"Transfer":"Expense")}</div>`).join("")}`;
  if(state.settings==="rules") return `<div class="card-head"><div><h2>Category mapping</h2><p>Merchant matching for a future import workflow.</p></div><button class="quiet" data-action="new-rule">+ Add rule</button></div><div class="callout">Rules are visible demo configuration. They are not applied to files or historical transactions.</div><table><thead><tr><th>Merchant contains</th><th>Assign category</th><th>Status</th></tr></thead><tbody>${state.rules.map(item=>`<tr><td>${escapeHtml(item.phrase)}</td><td>${escapeHtml(item.category)}</td><td>${badge("Draft","blue")}</td></tr>`).join("")}</tbody></table>`;
  if(state.settings==="notifications") return `<h2>Notifications</h2><p class="small muted">Choose reminder preferences. No browser permissions are requested.</p>${setting("Bill due reminders","Three days before the due date",switchControl("reminder","Bill due reminders",state.reminder))}${setting("Budget alerts","When a category reaches 90% of its plan",switchControl("budgetAlert","Budget alerts",state.budgetAlert))}${setting("Goal milestones","At 25%, 50%, 75%, and completion",switchControl("goalAlert","Goal milestones",state.goalAlert))}<div class="callout">These switches demonstrate settings only. Notifications will need a separate, explicitly authorized implementation.</div>`;
  if(state.settings==="providers") return `<div class="card-head"><div><h2>Service providers</h2><p>Saved merchant labels for bills and quick entry.</p></div><button class="quiet" data-action="new-provider">+ Add provider</button></div>${state.providers.map(item=>`<div class="row"><span><strong class="small">${escapeHtml(item.name)}</strong><small class="muted" style="display:block">${escapeHtml(item.category)}</small></span>${badge("Manual")}</div>`).join("")}`;
  return `<h2>Data & privacy</h2><p class="small muted">This prototype is not a financial records system.</p><div class="callout warning">Entries live in memory and disappear when you reload. No database, bank sync, encryption, cloud upload, or backup service is connected.</div>${setting("Export demo transactions","Download a CSV of fictional entries",`<button class="quiet" data-action="export">Export CSV</button>`)}${setting("Local-first storage","Future implementation decision",badge("Not connected","amber"))}${setting("Automatic backups","Required before real use",badge("Not connected","amber"))}${setting("Import source statements","Never modified by this skeleton",badge("Read-only by design","green"))}`;
}
function settingsView() {
  const sections=[["profile","Profile"],["preferences","Currency & language"],["categories","Categories"],["rules","Category mapping"],["notifications","Notifications"],["providers","Service providers"],["data","Data & privacy"]];
  return `${pageHead("A workspace that fits you","Personal preferences, categories, and data controls.","","Settings")}<div class="settings-layout"><div class="settings-tabs" role="group" aria-label="Settings sections">${sections.map(([key,label])=>`<button class="quiet" aria-pressed="${state.settings===key}" data-action="settings" data-value="${key}">${label}</button>`).join("")}</div><article class="card">${settingsContent()}</article></div>`;
}
function importPreview() {
  return `<article class="card" style="margin-top:16px">${cardHead("Review import","Fictional preview rows / no file parsed",badge("DEMO PREVIEW","amber"))}<div class="toolbar"><select class="input" aria-label="Import destination account">${state.accounts.map(item=>`<option>${escapeHtml(item.name)}</option>`).join("")}</select><span class="spacer"></span>${badge("3 rows / 1 possible duplicate")}</div><div class="table-wrap"><table><thead><tr><th>Include</th><th>Date</th><th>Description</th><th>Category</th><th class="right">Amount</th><th>Review</th></tr></thead><tbody><tr><td><input type="checkbox" checked aria-label="Include demo grocery row"></td><td>Oct 13</td><td>Fresh Market</td><td>Food</td><td class="right">${cash(2150)}</td><td>${badge("Possible duplicate","amber")}</td></tr><tr><td><input type="checkbox" checked aria-label="Include demo transport row"></td><td>Oct 12</td><td>City transport</td><td>Transport</td><td class="right">${cash(150)}</td><td>${badge("Ready","green")}</td></tr><tr><td><input type="checkbox" aria-label="Include demo unassigned row"></td><td>Oct 11</td><td>Unknown merchant</td><td>Unassigned</td><td class="right">${cash(325)}</td><td>${badge("Needs category","red")}</td></tr></tbody></table></div><div class="callout warning">No uploaded file has been read. These rows only illustrate a review screen. Confirm import stays disabled until parsing and duplicate detection are implemented.</div><div class="toolbar"><button class="quiet" data-action="close-preview">Close preview</button><span class="spacer"></span><button class="primary" disabled>Confirm import</button></div></article>`;
}
function importView() {
  const pdf=state.importMode==="pdf";
  return `${pageHead("Bring your history with you","Review every import before it enters your ledger.","","Import transactions")}${tabs([["spreadsheet","Excel / CSV"],["pdf","PDF statement"]],state.importMode,"import-mode")}<div class="layout-aside"><article class="card">${cardHead(pdf?"Statement extraction":"Spreadsheet import",pdf?"Future PDF extraction and review flow":"Use a bank export or a spreadsheet template")}<div class="callout ${pdf?"warning":""}">${pdf?"PDF extraction is not connected. No statement will be uploaded to an AI service.":"The file picker shows its name only. No file content is read or sent anywhere."}</div><ol class="import-steps"><li><span>1</span>${pdf?"Select your statement PDF.":"Prepare dates, descriptions, categories, and amounts."}</li><li><span>2</span>Review detected rows and possible duplicates.</li><li><span>3</span>Choose an account and confirm selected entries.</li></ol><label class="drop-zone" id="drop-zone"><strong>${pdf?"Choose a PDF statement":"Choose an Excel or CSV file"}</strong><span class="small muted">${pdf?".pdf":".xlsx or .csv"} / up to 10 MB</span><input id="import-file" type="file" accept="${pdf?".pdf":".csv,.xlsx"}" aria-label="Select ${pdf?"PDF statement":"spreadsheet"}"></label><p class="small muted" aria-live="polite">${state.file?`${escapeHtml(state.file.name)} / ${Math.ceil(state.file.size/1024)} KB selected`:"No file selected."}</p><div class="toolbar"><button class="quiet" data-action="template" ${pdf?"disabled":""}>Download CSV template</button><span class="spacer"></span><button class="quiet" data-action="clear-file">Clear file</button><button class="primary" data-action="demo-preview">View demo review screen</button></div></article><aside class="stack"><article class="card"><h2>Import checklist</h2><details open><summary>Check dates and signs</summary><p>Identify the transaction date. Keep expense, income, and transfer amounts distinct.</p></details><details><summary>Watch for duplicates</summary><p>Compare dates, descriptions, account, and amount before committing rows.</p></details><details><summary>Keep the original statement</summary><p>Never change source documents during import. Save a backup before a large batch.</p></details><details><summary>Protect sensitive details</summary><p>Do not include full card numbers, passwords, or account credentials.</p></details></article><article class="card"><h2>Import history</h2><p class="small muted">Completed and failed imports will appear here.</p>${empty("No imports yet","This is the UI for a future import history.")}</article></aside></div>${state.preview?importPreview():""}`;
}
function helpView() {
  const faqs=[["How do I record an expense?","Choose Add transaction, select Expense, enter an amount and date, then pick a category and account."],["What is a transfer?","A transfer moves money between your own accounts. It is not new income or spending."],["Do recurring bills pay themselves?","No. Recurring bills are reminders. Record payment updates demo status only."],["Are account balances calculated automatically?","Not in this skeleton. Account balances are manually entered fictional values, independent of the transaction list."],["Is my data saved?","No. Demo changes live in memory and reset on reload. Do not use this skeleton as a real records system."],["Can I import a bank statement?","The upload and review layouts are present, but file parsing and importing are intentionally disabled."]];
  return `${pageHead("A little guidance goes a long way","Start small. Keep records consistent. Back up before changes.","","Help & support")}<div class="grid-two"><article class="card"><h2>Getting started</h2><ol class="import-steps"><li><span>1</span>Add or select a manual account.</li><li><span>2</span>Record an expense and assign a category.</li><li><span>3</span>Set a category budget and a bill reminder.</li><li><span>4</span>Check the dashboard for the selected month.</li></ol><button class="primary" data-action="new-transaction">Try a demo transaction</button></article><article class="card"><h2>Prototype boundaries</h2><p class="small muted">Luna uses its own markup and visual assets. The reference site informed its information hierarchy, not its source code.</p><div class="callout warning">No persistence, bank connections, AI processing, payments, or external notifications. Real statement files remain untouched.</div><a class="link" href="#settings" data-settings-link="data">Review data & privacy</a></article><article class="card wide"><h2>Frequently asked questions</h2>${faqs.map(([title,text])=>`<details><summary>${title}</summary><p>${text}</p></details>`).join("")}</article><article class="card"><h2>Keyboard shortcuts</h2><div class="row"><span class="small">New transaction</span><kbd>N</kbd></div><div class="row"><span class="small">Search workspace</span><kbd>/</kbd></div><div class="row"><span class="small">Close dialog or menu</span><kbd>Esc</kbd></div></article><article class="card"><h2>Screen coverage</h2><p class="small muted">Dashboard / Budget / Bills / Goals / Transactions / Accounts / Settings / Import / Help</p><p class="small muted">Desktop, tablet, and phone layouts share one navigable prototype.</p></article></div>`;
}
const views={dashboard:dashboardView,budget:budgetView,bills:billView,goals:goalsView,transactions:transactionView,accounts:accountView,settings:settingsView,import:importView,help:helpView};

function formField(label,name,type="text",options={}) {
  const attributes=`${options.optional?"":"required"} ${options.maxLength?`maxlength="${options.maxLength}"`:"maxlength=100"} ${options.min!==undefined?`min="${options.min}"`:""} ${options.step?`step="${options.step}"`:""}`;
  if(type==="select") return `<label class="field ${options.full?"full":""}">${label}<select name="${name}" ${options.optional?"":"required"}>${options.values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}</select></label>`;
  if(type==="textarea") return `<label class="field full">${label}<textarea name="${name}" maxlength="500" placeholder="Optional"></textarea></label>`;
  if(type==="checkbox") return `<label class="field full"><span><input type="checkbox" name="${name}" style="width:auto;min-height:0"> ${label}</span></label>`;
  return `<label class="field ${options.full?"full":""}" ${options.id?`id="${options.id}"`:""}>${label}<input name="${name}" type="${type}" ${attributes}></label>`;
}
function formConfig(kind) {
  const accounts=state.accounts.map(item=>item.name),categories=state.categories;
  const configurations={
    transaction:{title:"Add transaction",description:"Fictional demo entry. Nothing is saved after reload.",fields:`${formField("Type","type","select",{values:["expense","income","transfer"]})}${formField("Amount (PHP)","amount","number",{min:0.01,step:0.01})}${formField("Date & time","date","datetime-local")}${formField("Category","category","select",{values:categories})}${formField("Merchant or source","merchant")}${formField("Description","name")}${formField("Account / from","account","select",{values:accounts})}${formField("Transfer to","destination","select",{values:accounts,optional:true})}${formField("Budget","budget","select",{values:["No budget",...state.budgets.map(item=>item.name)],optional:true})}${formField("Status","status","select",{values:["Cleared","Pending"]})}${formField("Notes","note","textarea")}<label class="field full">Receipt photos (UI only)<input type="file" accept="image/jpeg" multiple disabled><small class="muted">JPEG attachment slot. No images are read, uploaded, or stored.</small></label>`},
    budget:{title:"Create budget",description:"Monthly category planning for this demo session.",fields:`${formField("Budget name","name")}${formField("Type","type","select",{values:["expense","income"]})}${formField("Category","category","select",{values:categories})}${formField("Monthly limit (PHP)","limit","number",{min:1,step:0.01})}${formField("Carry unused balance forward (visual preference)","rollover","checkbox")}`},
    bill:{title:"Add bill reminder",description:"No payment is made or scheduled.",fields:`${formField("Bill name","name")}${formField("Amount due (PHP)","amount","number",{min:0.01,step:0.01})}${formField("Due date","due","date")}${formField("Repeat","cadence","select",{values:["One time","Weekly","Monthly","Yearly"]})}${formField("Category","category","select",{values:categories})}${formField("Account","account","select",{values:accounts})}${formField("Reminder notes","note","textarea")}`},
    goal:{title:"Create savings goal",description:"Track allocations only. No money is transferred.",fields:`${formField("Goal name","name")}${formField("Goal type","category","select",{values:["Safety net","Travel","Personal","Home"]})}${formField("Target (PHP)","target","number",{min:1,step:0.01})}${formField("Already saved (PHP)","saved","number",{min:0,step:0.01,optional:true})}${formField("Target date","due","date")}${formField("Planning account","account","select",{values:accounts})}`},
    funds:{title:"Add contribution",description:"Updates goal progress only, not an account balance.",fields:`${formField("Contribution (PHP)","amount","number",{min:0.01,step:0.01})}${formField("Date","date","date")}${formField("Notes","note","textarea")}`},
    account:{title:"Add manual account",description:"Use a nickname. Never enter account credentials.",fields:`${formField("Account nickname","name")}${formField("Institution","institution")}${formField("Type","type","select",{values:["Bank account","Cash","Savings account","Credit card"]})}${formField("Manual balance (PHP)","balance","number",{step:0.01})}${formField("Credit limit (optional)","limit","number",{min:0,step:0.01,optional:true})}`},
    category:{title:"Add category",description:"Create a consistent report label.",fields:formField("Category name","name")},
    rule:{title:"Add category mapping",description:"A draft matching rule. No file processing is connected.",fields:`${formField("Merchant contains","phrase")}${formField("Assign category","category","select",{values:categories})}`},
    provider:{title:"Add service provider",description:"A saved label for a merchant or billing company.",fields:`${formField("Provider name","name")}${formField("Service category","category")}`}
  };
  return configurations[kind];
}

function csvCell(value) {
  const safe=typeof value==="string"&&/^[\s]*[=+@-]/.test(value)?`'${value}`:String(value??"");
  return `"${safe.replaceAll('"','""')}"`;
}
function ledgerCsv() {
  return [["Date","Description","Merchant","Type","Category","Account","Amount","Status","Notes"],...state.transactions.map(item=>[item.date,item.name,item.merchant,item.type,item.category,item.account,item.amount,item.status,item.note])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
function resetTransactionFilters() {
  Object.assign(state,{txType:"all",txQuery:"",txCategory:"all",txAccount:"all",txStatus:"all",txSort:"newest"});
}
function acceptsImportFile(file,mode) {
  return Boolean(file&&(mode==="pdf"?/\.pdf$/i:/\.(csv|xlsx)$/i).test(file.name)&&Number.isFinite(file.size)&&file.size>=0&&file.size<=10*1024*1024);
}
function selfCheck() {
  const assert=(condition,message)=>{if(!condition)throw new Error(`Self-check failed: ${message}`);};
  assert(totalType("expense")===18450,"monthly expense total excludes transfers");
  assert(totalType("income")===45000,"monthly income total");
  assert(totalType("transfer")===5000,"transfer total");
  assert(monthTransactions().length===9,"month boundary filtering");
  assert(monthKey(new Date(2026,12,1))==="2027-01","year rollover");
  assert(escapeHtml('<img src=x onerror="x">').includes("&lt;img"),"HTML escaping");
  assert(csvCell("=HYPERLINK(1)").startsWith('"\''),"spreadsheet formula neutralization");
  assert(acceptsImportFile({name:"DEMO.CSV",size:10},"spreadsheet"),"spreadsheet extension validation");
  assert(!acceptsImportFile({name:"demo.pdf",size:10},"spreadsheet"),"PDF rejected in spreadsheet mode");
  assert(!acceptsImportFile({name:"demo.xlsx",size:10},"pdf"),"spreadsheet rejected in PDF mode");
  assert(!acceptsImportFile({name:"demo.pdf",size:10485761},"pdf"),"file size boundary");
  const previous=state.txType;
  state.txType="transfer";
  assert(filteredTransactions().length===1,"transaction type filtering");
  state.txType=previous;
  Object.entries(views).forEach(([name,view])=>{const output=view();assert(output.includes("<h1>"),`${name} page heading`);assert(!/undefined|NaN/.test(output),`${name} invalid display values`);});
  return "Self-check passed: totals, date boundaries, filters, import validation, escaping, CSV safety, and all nine screens.";
}

if(typeof document==="undefined") {
  console.log(selfCheck());
} else {
  const main=document.getElementById("main"),dialog=document.getElementById("dialog"),dialogForm=document.getElementById("dialog-form"),sidebar=document.getElementById("sidebar"),navMedia=matchMedia("(max-width:850px)");
  let toastTimer;
  function toast(message) {
    const node=document.getElementById("toast");node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.hidden=true;},3200);
  }
  function closeMenu(restoreFocus=true) {
    const wasOpen=document.body.classList.contains("nav-open");
    document.body.classList.remove("nav-open");document.querySelector(".menu-scrim").hidden=true;
    document.querySelector(".menu-toggle").setAttribute("aria-expanded","false");
    sidebar.inert=navMedia.matches;sidebar.setAttribute("aria-hidden",String(navMedia.matches));
    main.inert=false;document.querySelector(".topbar").inert=false;
    if(wasOpen&&restoreFocus&&navMedia.matches)document.querySelector(".menu-toggle").focus();
  }
  function openMenu() {
    document.body.classList.add("nav-open");document.querySelector(".menu-scrim").hidden=false;
    document.querySelector(".menu-toggle").setAttribute("aria-expanded","true");
    sidebar.inert=false;sidebar.setAttribute("aria-hidden","false");
    main.inert=navMedia.matches;document.querySelector(".topbar").inert=navMedia.matches;
    document.querySelector(".menu-close").focus();
  }
  function render() {
    const active=main.contains(document.activeElement)?document.activeElement.closest("[data-action]"):null;
    main.innerHTML=views[state.route]();
    document.title=`Luna | ${routeNames[state.route]}`;
    document.querySelectorAll("[data-route]").forEach(link=>{if(link.dataset.route===state.route)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");});
    document.querySelector(".profile-mini strong").textContent=state.displayName||"Local workspace";
    if(active)Array.from(main.querySelectorAll("[data-action]")).find(element=>element.dataset.action===active.dataset.action&&element.dataset.value===active.dataset.value&&element.dataset.id===active.dataset.id&&element.dataset.key===active.dataset.key)?.focus({preventScroll:true});
  }
  function navigate() {
    const route=location.hash.slice(1);state.route=Object.hasOwn(views,route)?route:"dashboard";closeMenu(false);render();document.getElementById("search-results").hidden=true;
  }
  function openForm(kind,preset={},id="") {
    const config=formConfig(kind);if(!config)return;
    document.getElementById("dialog-title").textContent=id&&kind!=="funds"?config.title.replace("Add","Edit").replace("Create","Edit"):config.title;
    document.getElementById("dialog-description").textContent=config.description;
    document.getElementById("dialog-fields").innerHTML=config.fields;
    dialogForm.dataset.kind=kind;dialogForm.dataset.id=id;dialogForm.querySelector("button[type=submit]").hidden=false;
    for(const [name,value] of Object.entries(preset)) { const control=dialogForm.elements.namedItem(name);if(!control)continue;if(control.type==="checkbox")control.checked=Boolean(value);else control.value=value??""; }
    if(kind==="transaction") { dialogForm.elements.date.value=preset.date||`${demoToday}T12:00`;updateTransactionForm(); }
    if(kind==="funds")dialogForm.elements.date.value=demoToday;
    dialog.showModal();
  }
  function updateTransactionForm() {
    if(dialogForm.dataset.kind!=="transaction")return;
    const transfer=dialogForm.elements.type.value==="transfer";
    dialogForm.elements.destination.closest("label").hidden=!transfer;
    dialogForm.elements.destination.required=transfer;
    dialogForm.elements.destination.disabled=!transfer;
    dialogForm.elements.budget.disabled=transfer;
    if(transfer)dialogForm.elements.category.value="Transfer";
    else if(dialogForm.elements.category.value==="Transfer")dialogForm.elements.category.value=dialogForm.elements.type.value==="income"?"Income":"Food";
  }
  function details(title,description,rows,note="") {
    document.getElementById("dialog-title").textContent=title;
    document.getElementById("dialog-description").textContent=description;
    document.getElementById("dialog-fields").innerHTML=`<div class="full" style="grid-column:1/-1">${rows.map(([label,value])=>`<div class="row"><span class="small muted">${label}</span><strong class="small">${escapeHtml(value)}</strong></div>`).join("")}${note?`<div class="callout">${escapeHtml(note)}</div>`:""}</div>`;
    dialogForm.dataset.kind="detail";dialogForm.querySelector("button[type=submit]").hidden=true;dialog.showModal();
  }
  function paymentForm(id) {
    const bill=state.bills.find(item=>item.id===id);if(!bill||bill.status==="paid")return;
    document.getElementById("dialog-title").textContent="Record a bill payment";
    document.getElementById("dialog-description").textContent="Demo record only. No money is sent or payment scheduled.";
    document.getElementById("dialog-fields").innerHTML=`<div class="callout full" style="grid-column:1/-1;margin:0">${escapeHtml(bill.name)} / ${cash(bill.amount)}</div>${formField("Payment amount (PHP)","amount","number",{min:0.01,step:0.01})}${formField("Payment date","date","date")}${formField("Paid from","account","select",{values:state.accounts.filter(item=>item.group==="cash").map(item=>item.name)})}${formField("Payment note","note","textarea")}`;
    dialogForm.dataset.kind="payment";dialogForm.dataset.id=id;dialogForm.elements.amount.value=bill.amount;dialogForm.elements.date.value=demoToday;dialogForm.querySelector("button[type=submit]").hidden=false;dialog.showModal();
  }
  function download(contents,name) { const url=URL.createObjectURL(new Blob([contents],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function saveForm(event) {
    event.preventDefault();if(!dialogForm.reportValidity())return;
    for(const control of dialogForm.querySelectorAll('input[type="text"][required]')){
      if(!control.value.trim()){control.setCustomValidity("Enter a value, not just spaces.");control.reportValidity();control.setCustomValidity("");return;}
    }
    const data=Object.fromEntries(new FormData(dialogForm)),kind=dialogForm.dataset.kind,id=dialogForm.dataset.id;
    for(const key of ["name","institution","merchant","phrase"])if(typeof data[key]==="string")data[key]=data[key].trim();
    const amounts={transaction:"amount",budget:"limit",bill:"amount",goal:"target",funds:"amount",payment:"amount"};
    const numberKey=amounts[kind];if(numberKey&&(!Number.isFinite(Number(data[numberKey]))||Number(data[numberKey])<=0||Number(data[numberKey])>1e12)){toast("Enter a valid positive amount below one trillion.");return;}
    if(kind==="transaction") {
      if(!["expense","income","transfer"].includes(data.type)||!state.accounts.some(item=>item.name===data.account)||!state.categories.includes(data.category)){toast("Choose a valid type, category, and account.");return;}
      if(data.type==="transfer"&&(!state.accounts.some(item=>item.name===data.destination)||data.destination===data.account)){toast("A transfer needs two different valid accounts.");return;}
      if(data.type==="transfer")data.category="Transfer";
      state.transactions.unshift({...data,id:crypto.randomUUID(),date:data.date.slice(0,10),time:data.date.slice(11),amount:Number(data.amount)});state.month=data.date.slice(0,7);resetTransactionFilters();
    } else if(kind==="budget") {
      const value={...data,id:id||crypto.randomUUID(),limit:Number(data.limit),rollover:Boolean(data.rollover)};
      if(id)Object.assign(state.budgets.find(item=>item.id===id),value);else state.budgets.push(value);
    } else if(kind==="bill") {
      state.bills.push({...data,id:crypto.randomUUID(),amount:Number(data.amount),status:data.due<demoToday?"overdue":"upcoming"});
    } else if(kind==="goal") {
      const saved=Number(data.saved||0);if(!Number.isFinite(saved)||saved<0){toast("Saved amount cannot be negative.");return;}
      state.goals.push({...data,id:crypto.randomUUID(),target:Number(data.target),saved});
    } else if(kind==="funds") {
      const goal=state.goals.find(item=>item.id===id);if(goal){goal.saved=Math.round((goal.saved+Number(data.amount))*100)/100;(goal.contributions??=[]).push({amount:Number(data.amount),date:data.date,note:data.note});}
    } else if(kind==="account") {
      if(!Number.isFinite(Number(data.balance))||!Number.isFinite(Number(data.limit||0))||Number(data.limit||0)<0){toast("Enter valid account amounts.");return;}
      if(state.accounts.some(item=>item.id!==id&&item.name.toLowerCase()===data.name.trim().toLowerCase())){toast("Use a unique account nickname.");return;}
      const value={...data,name:data.name.trim(),id:id||crypto.randomUUID(),balance:Number(data.balance),limit:Number(data.limit||0),group:data.type==="Credit card"?"credit":"cash",lastUpdated:demoToday};
      if(id){const existing=state.accounts.find(item=>item.id===id),oldName=existing.name;Object.assign(existing,value);state.transactions.forEach(item=>{if(item.account===oldName)item.account=value.name;if(item.destination===oldName)item.destination=value.name;});state.bills.forEach(item=>{if(item.account===oldName)item.account=value.name;});state.goals.forEach(item=>{if(item.account===oldName)item.account=value.name;});if(state.txAccount===oldName)state.txAccount=value.name;}else state.accounts.push(value);
      state.account=value.id;
    } else if(kind==="category") {
      const name=data.name.trim();if(!name||state.categories.some(item=>item.toLowerCase()===name.toLowerCase())){toast("Use a new category name.");return;}state.categories.push(name);
    } else if(kind==="rule") { state.rules.push({phrase:data.phrase.trim(),category:data.category});
    } else if(kind==="provider") { state.providers.push({name:data.name.trim(),category:data.category.trim()});
    } else if(kind==="payment") {
      const bill=state.bills.find(item=>item.id===id);if(!bill||bill.status==="paid")return;
      // ponytail: full demo payments only; add installments with persistent payment history.
      if(Math.round(Number(data.amount)*100)!==Math.round(bill.amount*100)){toast(`Record the full amount of ${cash(bill.amount)}. Partial payments are not implemented.`);return;}
      if(!state.accounts.some(item=>item.name===data.account&&item.group==="cash")){toast("Choose a valid payment account.");return;}
      const credit=bill.category==="Credit payment";bill.status="paid";
      state.transactions.unshift({id:crypto.randomUUID(),name:bill.name,merchant:bill.name,date:data.date,amount:Number(data.amount),type:credit?"transfer":"expense",category:credit?"Transfer":bill.category,account:data.account,destination:credit?bill.account:undefined,status:"Cleared",note:data.note||"Demo bill payment"});
    } else return;
    dialog.close();render();main.focus({preventScroll:true});toast("Saved to this demo session. Reloading resets it.");
  }
  function globalSearch(query) {
    const panel=document.getElementById("search-results"),text=query.trim().toLowerCase();
    if(!text){panel.hidden=true;return;}
    const matches=[...state.transactions.filter(item=>`${item.name} ${item.merchant} ${item.category}`.toLowerCase().includes(text)).map(item=>({label:item.name,detail:`Transaction / ${shortDate(item.date)} / ${cash(item.amount)}`,route:"transactions",id:item.id})),...state.bills.filter(item=>item.name.toLowerCase().includes(text)).map(item=>({label:item.name,detail:`Bill / ${shortDate(item.due)}`,route:"bills",id:item.id})),...state.accounts.filter(item=>`${item.name} ${item.institution}`.toLowerCase().includes(text)).map(item=>({label:item.name,detail:`Account / ${item.type}`,route:"accounts",id:item.id}))].slice(0,8);
    panel.innerHTML=matches.length?matches.map(item=>`<button class="search-result" data-action="search-result" data-route="${item.route}" data-id="${item.id}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></button>`).join(""):`<div class="search-result muted">No matches. Try another description.</div>`;panel.hidden=false;
  }
  function fileSelection(file) {
    state.preview=false;
    if(file&&!acceptsImportFile(file,state.importMode)){state.file=null;render();toast(`Select ${state.importMode==="pdf"?"a PDF":"a CSV or XLSX"} file up to 10 MB.`);document.getElementById("import-file").focus();return;}
    state.file=file?{name:file.name,size:file.size}:null;state.preview=false;render();
  }
  document.addEventListener("click",event=>{
    if(event.target.closest(".skip-link")){event.preventDefault();main.focus();return;}
    const target=event.target.closest("[data-action]");
    if(!target){if(!event.target.closest(".topbar"))document.getElementById("search-results").hidden=true;return;}
    const action=target.dataset.action,value=target.dataset.value,id=target.dataset.id;
    if(action==="menu"){openMenu();return;}
    if(action==="close-menu"){closeMenu();return;}
    if(action==="close-dialog"){dialog.close();return;}
    const newForms={"new-transaction":"transaction","new-budget":"budget","new-bill":"bill","new-goal":"goal","new-account":"account","new-category":"category","new-rule":"rule","new-provider":"provider"};
    if(newForms[action]){openForm(newForms[action]);return;}
    if(action==="edit-budget"){openForm("budget",state.budgets.find(item=>item.id===id),id);return;}
    if(action==="edit-account"){openForm("account",state.accounts.find(item=>item.id===id),id);return;}
    if(action==="goal-funds"){openForm("funds",{},id);return;}
    if(action==="mark-paid"){paymentForm(id);return;}
    if(action==="month"){const date=monthDate(state.month);date.setMonth(date.getMonth()+Number(target.dataset.step));state.month=monthKey(date);state.selectedDay=null;render();return;}
    const setters={breakdown:"breakdown","budget-type":"budgetType","bill-filter":"billFilter","goal-filter":"goalFilter","transaction-type":"txType",settings:"settings","import-mode":"importMode"};
    if(setters[action]){state[setters[action]]=value;if(action==="import-mode"){state.preview=false;state.file=null;}render();return;}
    if(action==="calendar-day"){state.selectedDay=state.selectedDay===value?null:value;render();return;}
    if(action==="account"){state.account=id;render();return;}
    if(action==="transaction-detail"){const item=state.transactions.find(entry=>entry.id===id);if(item)details(item.name,"Transaction details",[["Amount",cash(item.amount)],["Date",`${item.date}${item.time?` ${item.time}`:""}`],["Type",item.type],["Merchant",item.merchant],["Category",item.category],["Account",item.account],...(item.destination?[["Transfer to",item.destination]]:[]),["Status",item.status]],item.note);return;}
    if(action==="bill-detail"){const item=state.bills.find(entry=>entry.id===id);if(item)details(item.name,"Bill details",[["Amount",cash(item.amount)],["Due",item.due],["Schedule",item.cadence],["Account",item.account],["Status",item.status]]);return;}
    if(action==="goal-detail"){const item=state.goals.find(entry=>entry.id===id);if(item)details(item.name,"Goal details",[["Saved",cash(item.saved)],["Target",cash(item.target)],["Target date",item.due],["Planning account",item.account],...(item.contributions||[]).map(entry=>[`${entry.date} contribution`,`${cash(entry.amount)}${entry.note?` / ${entry.note}`:""}`])],"Contributions track allocation only; they do not move account funds.");return;}
    if(action==="clear-filters"){resetTransactionFilters();render();return;}
    if(action==="export"){download(ledgerCsv(),"luna-demo-transactions.csv");toast("Demo transaction CSV downloaded.");return;}
    if(action==="template"){download("Date,Description,Merchant,Type,Category,Account,Amount,Status,Notes\r\n2026-10-14,Example entry,Example merchant,expense,Food,Main bank,100,Cleared,Sample only","luna-import-template.csv");return;}
    if(action==="refresh-accounts"){toast("Manual demo accounts: no bank connection to refresh.");return;}
    if(action==="switch"){state[target.dataset.key]=!state[target.dataset.key];render();return;}
    if(action==="save-profile"){const value=document.getElementById("display-name").value.trim();if(!value){toast("Enter a profile name.");return;}state.displayName=value;render();toast("Demo profile label updated.");return;}
    if(action==="demo-preview"){state.preview=true;render();document.querySelector("#main>.card:last-child")?.scrollIntoView({block:"nearest"});return;}
    if(action==="close-preview"){state.preview=false;render();return;}
    if(action==="clear-file"){state.file=null;state.preview=false;render();return;}
    if(action==="search-result"){
      if(target.dataset.route==="accounts")state.account=id;
      if(target.dataset.route==="transactions"){const item=state.transactions.find(entry=>entry.id===id);if(item){resetTransactionFilters();state.month=item.date.slice(0,7);state.txQuery=item.name;}}
      if(target.dataset.route==="bills"){const item=state.bills.find(entry=>entry.id===id);if(item)state.billFilter=item.status;}
      location.hash=target.dataset.route;navigate();main.focus({preventScroll:true});return;
    }
  });
  document.addEventListener("click",event=>{const link=event.target.closest("[data-settings-link]");if(link)state.settings=link.dataset.settingsLink;});
  document.addEventListener("input",event=>{if(event.target.id==="global-search")globalSearch(event.target.value);if(event.target.id==="transaction-search"){state.txQuery=event.target.value;document.getElementById("transaction-results").innerHTML=transactionTable();}});
  document.addEventListener("change",event=>{if(event.target.dataset.filter){state[event.target.dataset.filter]=event.target.value;document.getElementById("transaction-results").innerHTML=transactionTable();}if(event.target.id==="import-file")fileSelection(event.target.files[0]);if(event.target.form===dialogForm&&event.target.name==="type")updateTransactionForm();});
  document.addEventListener("dragover",event=>{const zone=event.target.closest("#drop-zone");if(zone){event.preventDefault();zone.classList.add("dragover");}});
  document.addEventListener("dragleave",event=>event.target.closest("#drop-zone")?.classList.remove("dragover"));
  document.addEventListener("drop",event=>{const zone=event.target.closest("#drop-zone");if(zone){event.preventDefault();fileSelection(event.dataTransfer.files[0]);}});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){closeMenu();document.getElementById("search-results").hidden=true;}
    if(document.body.classList.contains("nav-open")){
      if(event.key==="Tab"){
        const controls=Array.from(sidebar.querySelectorAll("a[href],button:not(:disabled)")).filter(control=>control.getClientRects().length),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
      return;
    }
    if(dialog.open||event.ctrlKey||event.metaKey||event.altKey||event.target.matches("input,textarea,select")||event.target.isContentEditable)return;
    if(event.key.toLowerCase()==="n"){event.preventDefault();openForm("transaction");}
    if(event.key==="/"){event.preventDefault();document.getElementById("global-search").focus();}
  });
  dialogForm.addEventListener("submit",saveForm);
  window.addEventListener("hashchange",()=>{navigate();main.focus({preventScroll:true});window.scrollTo(0,0);});
  navMedia.addEventListener("change",()=>closeMenu(false));
  navigate();
  if(new URLSearchParams(location.search).has("selfcheck")){const result=selfCheck();document.body.dataset.selfcheck="passed";console.info(result);}
}
