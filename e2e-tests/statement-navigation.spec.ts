import {test,expect,type Page} from "@playwright/test";

const accountPath="/accounts/4?account=4&dateMode=statement-month&month=2026-08&tab=statements";
const activityRegion=(page:Page)=>page.getByRole("region",{name:"Unified statement transactions",exact:true});
const transactionsTab=(page:Page)=>page.getByRole("tab",{name:"Statement transactions",exact:true});

async function statementWorkspace(page:Page){
 const card={id:4,name:"UnionBank Rewards Visa Platinum",type:"credit_card",issuer:"UnionBank",last4:"9015",network:"Visa",balance:-1342759,credit_limit:10000000,opening_date:"2025-01-01",archived_at:null};
 const issues=[{id:102,statement_date:"2026-08-24"},{id:101,statement_date:"2026-08-07"},{id:100,statement_date:"2026-07-07"}].map(issue=>({...issue,card_id:4,card_name:card.name,last4:card.last4,currency:"PHP",filename:`fixture-${issue.id}.csv`,due_date:"2026-09-24",original_balance:1342759,minimum_due:126246,applied:0,remaining:1342759,status:"past_due_unverified",reviewStatus:"Reconciled",review_note:"",superseded_by:null,supersedes_id:null,tracking_confirmed:0,metadata:{title:`Statement ${issue.id}`,issuer:card.issuer,statementMonth:issue.statement_date.slice(0,7),newCharges:1342759,creditLimit:card.credit_limit,notes:""},rawMetadata:{},reconciliation:{},warnings:[]}));
 const lines=issues.flatMap(issue=>Array.from({length:issue.id===102?27:1},(_,index)=>({id:issue.id*100+index,statement_id:issue.id,row_index:index+1,card_id:4,card_name:card.name,issuer:card.issuer,last4:card.last4,currency:"PHP",statement_month:issue.statement_date.slice(0,7),amount:1000+index,display_type:"charge",display_category:"Shopping",ledgerTransactionId:null,source:{rowNumber:index+14,saleDate:"2026-07-25",postDate:"2026-07-26",merchantRaw:`Statement ${issue.id} merchant ${index+1}`,amountSigned:1000+index,typeRaw:"charge",categoryRaw:"Shopping",transactionNotesRaw:"Source activity",candidateType:"charge"}})));
 const requests:{path:string;method:string;query:URLSearchParams}[]=[],errors:string[]=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),query=url.searchParams;
  requests.push({path,method:request.method(),query:new URLSearchParams(query)});
  let json:unknown=[];
  if(path==="auth/me")json={user:{id:1,username:"Statement fixture"}};
  else if(path==="preferences")json={shortcuts:1,default_transaction_currency:"PHP"};
  else if(path==="accounts")json=[card];
  else if(path==="accounts/4")json={account:card,history:{items:[],total:0,page:1,pageSize:25}};
  else if(path==="transactions")json={items:[],total:0,pageSize:20};
  else if(path==="credit-card-statements"||path==="credit-card-dashboard"){
   const selected=issues.filter(issue=>(!query.has("issuedStatement")||String(issue.id)===query.get("issuedStatement"))&&(!query.has("month")||issue.statement_date.startsWith(query.get("month")!))&&(!query.has("cards")||query.get("cards")==="4"));
   const filtered=lines.filter(line=>selected.some(issue=>issue.id===line.statement_id)&&(!query.has("lineSearch")||line.source.merchantRaw.includes(query.get("lineSearch")!))&&(!query.has("lineAmount")||line.amount===Number(query.get("lineAmount")))&&(!query.has("lineCurrency")||line.currency===query.get("lineCurrency"))&&(!query.has("lineType")||line.display_type===query.get("lineType"))&&(!query.has("category")||line.display_category===query.get("category"))&&(!query.has("start")||line.source.postDate>=query.get("start")!)&&(!query.has("end")||line.source.postDate<=query.get("end")!));
   const pageNumber=Number(query.get("page")||1),pageSize=path==="credit-card-statements"?2:25,linePage=Number(query.get("linePage")||1);
   json={items:selected.slice((pageNumber-1)*pageSize,pageNumber*pageSize),total:selected.length,page:pageNumber,pageSize,metrics:[],cards:[],allCards:[card],issuers:[card.issuer],availableMonths:["2026-08","2026-07"],activity:{items:filtered.slice((linePage-1)*25,linePage*25),total:filtered.length,page:linePage,pageSize:25,categories:["Shopping"]}};
  }else if(/^credit-card-statements\/\d+$/.test(path)){
   const issue=issues.find(issue=>issue.id===Number(path.split("/")[1]));
   json={...issue,lines:[],total:0,page:1,pageSize:50,payments:[],history:issues,sources:[]};
  }
  await route.fulfill({json});
 });
 return {requests,errors};
}

for(const device of ["desktop","mobile"] as const){
 test.describe(device,()=>{
  test.use({viewport:device==="desktop"?{width:1440,height:1000}:{width:390,height:844},hasTouch:device==="mobile"});

  test("statement list View clears conflicting activity filters and preserves list context",async({page},testInfo)=>{
   const state=await statementWorkspace(page);
   const origin="/statements?tab=statements&month=2026-08&cards=4&search=fixture&page=1&activityCard=5&activityMonth=2025-01&activityStatement=101&lineSearch=missing&lineAmount=999&lineCurrency=USD&lineType=credit&category=Other&start=2027-01-01&end=2027-01-31&lineSort=merchant&linePage=8";
   await page.goto(origin);
   const list=page.getByRole("region",{name:"Issued statements",exact:true});
   await expect(list.locator("article")).toHaveCount(2);
   await expect(list).not.toContainText("Past due by date / payment verification needed");
   await expect(list).not.toContainText("Tracker evidence only");
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:testInfo.outputPath("statement-list.png"),fullPage:true});
   const view=list.getByRole("button",{name:"View statement #102",exact:true});
   if(device==="mobile")await view.tap();else{await view.focus();await page.keyboard.press("Enter");}
   await expect(transactionsTab(page)).toHaveAttribute("data-state","active");
   await expect(transactionsTab(page)).toBeFocused();
   const query=new URL(page.url()).searchParams;
   expect([...query.entries()]).toEqual([["month","2026-08"],["cards","4"],["search","fixture"],["page","1"],["activityStatement","102"]]);
   await expect(page.getByRole("combobox",{name:"Statement",exact:true})).toHaveValue("102");
   await expect(page.getByLabel("Merchant / notes",{exact:true})).toHaveValue("");
   await expect(activityRegion(page).locator("tbody tr")).toHaveCount(25);
   await expect(activityRegion(page)).not.toContainText("Statement 101 merchant");
   await expect(activityRegion(page)).toContainText("Statement 102 merchant 1");
   await expect(activityRegion(page)).toContainText("2026-07-25");
   await expect(page.getByRole("navigation",{name:"Activity pagination"})).toContainText("Page 1 of 2 · 27 lines");
   await expect(page.getByRole("region",{name:"Credit card statement detail",exact:true})).toHaveCount(0);
   const request=state.requests.filter(request=>request.path==="credit-card-dashboard").at(-1)!;
   expect([...request.query.entries()]).toEqual([["issuedStatement","102"]]);
   await page.screenshot({path:testInfo.outputPath("statement-transactions.png"),fullPage:true});
   await page.getByRole("button",{name:"Next activity",exact:true}).click();
   await expect(activityRegion(page).locator("tbody tr")).toHaveCount(2);
   await expect(activityRegion(page)).toContainText("Statement 102 merchant 27");
   await page.reload();
   await expect(page.getByRole("combobox",{name:"Statement",exact:true})).toHaveValue("102");
   await expect(activityRegion(page).locator("tbody tr")).toHaveCount(2);
   await page.goBack();
   expect(new URL(page.url()).pathname+new URL(page.url()).search).toBe(origin);
   await expect(list.locator("article")).toHaveCount(2);
   expect(state.errors).toEqual([]);
   expect(state.requests.every(request=>request.method==="GET")).toBe(true);
  });

  test("credit-card account statement View opens exact statement transactions and Back restores account",async({page},testInfo)=>{
   const state=await statementWorkspace(page);
   await page.goto(accountPath);
   const list=page.getByRole("region",{name:"Issued statements",exact:true});
   await expect(list.locator("article")).toHaveCount(2);
   await expect(list).not.toContainText("Past due by date / payment verification needed");
   await expect(list).not.toContainText("Tracker evidence only");
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:testInfo.outputPath("account-statements.png"),fullPage:true});
   const view=list.getByRole("button",{name:"View statement #102",exact:true});
   if(device==="mobile")await view.tap();else await view.click();
   await expect(page).toHaveURL(/\/statements\?activityStatement=102$/);
   await expect(transactionsTab(page)).toBeFocused();
   await expect(activityRegion(page).locator("tbody tr")).toHaveCount(25);
   await expect(activityRegion(page)).not.toContainText("Statement 101 merchant");
   await page.goBack();
   expect(new URL(page.url()).pathname+new URL(page.url()).search).toBe(accountPath);
   await expect(page.getByRole("tab",{name:"Statements",exact:true})).toHaveAttribute("data-state","active");
   await page.getByRole("button",{name:"Next statements",exact:true}).click();
   await expect(list.locator("article")).toHaveCount(1);
   await list.getByRole("button",{name:"View statement #100",exact:true}).click();
   await expect(page).toHaveURL(/\/statements\?activityStatement=100$/);
   await expect(page.getByRole("combobox",{name:"Statement",exact:true})).toHaveValue("100");
   await expect(activityRegion(page).locator("tbody tr")).toHaveCount(1);
   await expect(activityRegion(page)).toContainText("Statement 100 merchant 1");
   await page.goBack();
   await expect(page).toHaveURL(/tab=statements&statementPage=2$/);
   await expect(list.locator("article")).toHaveCount(1);
   expect(state.errors).toEqual([]);
   expect(state.requests.every(request=>request.method==="GET")).toBe(true);
  });
 });
}

test("Open statement from account activity still opens statement details",async({page})=>{
 const state=await statementWorkspace(page);
 await page.goto("/accounts/4?account=4&dateMode=statement&issuedStatement=102");
 await activityRegion(page).getByRole("button",{name:"View details for Statement 102 merchant 1",exact:true}).click();
 const dialog=page.getByRole("dialog");
 await dialog.getByRole("link",{name:"Open statement",exact:true}).click();
 await expect(page).toHaveURL(/\/statements\?activityStatement=102&document=102$/);
 const detail=page.getByRole("region",{name:"Credit card statement detail",exact:true});
 await expect(detail).toBeVisible();
 await expect(detail.getByRole("link",{name:"Download immutable original CSV",exact:true})).toBeVisible();
 await detail.getByRole("button",{name:"Close statement",exact:true}).click();
 await expect(detail).toHaveCount(0);
 await expect(page.getByRole("combobox",{name:"Statement",exact:true})).toHaveValue("102");
 expect(state.errors).toEqual([]);
});
