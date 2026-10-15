import {test,expect,type Page} from "@playwright/test";
import {reviewDialog,reviewFocusLoop} from "./fixtures/accessibility";

async function workspace(page:Page){
 const month=new Date().toISOString().slice(0,7),date=month+"-15";
 const accounts=[{id:1,name:"Daily bank",type:"bank",balance:150000,opening_date:"2025-01-01",liquid:1},{id:2,name:"Everyday card",type:"credit_card",balance:-20000,opening_date:"2025-01-01",credit_limit:300000}];
 const transaction={id:1,version:"transaction-version",posted_date:date,kind:"expense",description:"Weekly groceries",merchant:"Neighbourhood market",amount:10000,original_currency:"PHP",original_amount:10000,exchange_rate:1,included_fee:0,account_id:1,account_name:"Daily bank",category_name:"Food",category_id:1,notes:"",source:"manual",bill_linked:false,balance_impacts:[{id:1,name:"Daily bank",change:10000}]};
 const writes:{method:string;path:string;body:Record<string,unknown>}[]=[],errors:string[]=[];
 let fail=false;
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5);
  if(request.method()!=="GET"){
   writes.push({method:request.method(),path,body:request.postDataJSON()});
   if(fail){await route.fulfill({status:400,json:{message:"Fixture save failed; retry"}});return;}
   await route.fulfill({json:{id:1}});return;
  }
  let result:unknown=[];
  if(path==="auth/me")result={user:{id:1,username:"Layout fixture"}};
  else if(path==="preferences")result={shortcuts:1,default_transaction_currency:"PHP"};
  else if(path==="accounts")result=accounts;
  else if(path==="categories")result=[{id:1,name:"Food",kind:"expense"}];
  else if(path==="transactions")result=url.searchParams.has("page")?{items:[transaction],total:1,pageSize:20}:[transaction];
  else if(path==="budgets")result=[{id:1,name:"Food plan",month,category_id:1,amount:25000,actual:10000,category_name:"Food",kind:"expense"}];
  else if(path==="bills")result=[{id:1,name:"Phone plan",amount:15000,due_date:month+"-28",account_id:1,account_name:"Daily bank",category_id:1,category_name:"Food",cadence:"monthly",notes:"",transaction_id:null,payment_kind:"expense"}];
  else if(path==="goals")result=[{id:1,version:"goal-version",name:"Emergency fund",target:500000,allocated:150000,due_date:null,notes:"Three months of essentials",contributions:[{id:1,amount:150000,posted_date:date,notes:"First allocation"}]}];
  else if(path==="statement-archives")result={items:[],total:0,page:1,pageSize:20,issuers:[]};
  else if(path==="search")result=[{type:"account",id:1,label:"Daily bank",detail:"Bank account"}];
  else if(path==="reports")result={month,assets:150000,liabilities:20000,netWorth:130000,income:200000,expenses:10000,cashFlow:{amount:190000},categories:[{name:"Food",amount:10000}],merchants:[{name:"Neighbourhood market",amount:10000}],daily:[],comparison:[],coverage:[]};
  else if(path==="accounts/1/deletion-preview")result={account:{id:1,name:"Daily bank"},version:"preview-version",counts:{transactions:1,ledger_entries:1,statements:0},surviving:[]};
  await route.fulfill({json:result});
 });
 return {writes,errors,failSaves:()=>{fail=true;}};
}

async function noOverflow(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test("contextual actions stay unique across client navigation; drafts survive save errors",async({page})=>{
 const state=await workspace(page);await page.goto("/budgets");
 for(const [path,label,title] of [["/budgets","Create category budget","Create category budget"],["/bills","Add bill reminder","Add bill reminder"],["/goals","Create goal","Create goal"]]){
  await page.locator('nav[aria-label="Workspace"]').getByRole("link",{name:path.slice(1,2).toUpperCase()+path.slice(2),exact:true}).click();
  const trigger=page.getByRole("button",{name:label,exact:true});await expect(trigger).toHaveCount(1);await trigger.click();
  const dialog=page.getByRole("dialog");await expect(dialog).toHaveAccessibleName(title);await reviewDialog(dialog);
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 }
 await page.getByRole("link",{name:"Accounts",exact:true}).click();await page.getByRole("button",{name:"Add account",exact:true}).click();
 await expect(page.getByRole("heading",{name:"New account",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Close account form",exact:true}).click();
 await page.getByRole("link",{name:"Goals",exact:true}).click();await page.getByRole("button",{name:"Create goal",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByLabel("Goal name").fill("Retained draft");await dialog.getByLabel("Target · PHP").fill("5000");
 state.failSaves();await dialog.getByRole("button",{name:"Save goal",exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText("Luna could not save goals. Check the entered values and selections, then try again.");await expect(dialog.getByLabel("Goal name")).toHaveValue("Retained draft");
 await dialog.getByRole("button",{name:"Cancel",exact:true}).click();expect(state.writes).toHaveLength(1);expect(state.writes[0].body.name).toBe("Retained draft");expect(state.errors).toEqual([]);
});

test("record menus preserve keyboard focus, safe confirmations and payment actions",async({page})=>{
 const state=await workspace(page);await page.goto("/goals");
 const trigger=page.getByRole("button",{name:"More actions for Emergency fund",exact:true});await trigger.focus();await page.keyboard.press("Enter");
 await page.getByRole("menuitem",{name:"Edit goal",exact:true}).focus();await page.keyboard.press("Enter");
 const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Goal name")).toHaveValue("Emergency fund");await reviewFocusLoop(page,dialog);await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
 await trigger.click();await page.getByRole("menuitem",{name:"Delete goal",exact:true}).click();
 const confirmation=page.getByRole("alertdialog");await expect(confirmation.getByRole("button",{name:"Cancel deletion"})).toBeFocused();await reviewDialog(confirmation);await reviewFocusLoop(page,confirmation);await page.keyboard.press("Escape");
 expect(state.writes).toHaveLength(0);
 await page.goto("/bills");await page.getByRole("button",{name:"More actions for Phone plan"}).click();await page.getByRole("menuitem",{name:"Record payment",exact:true}).click();
 await expect(dialog).toHaveAccessibleName("Record full payment");await expect(dialog.getByText("Record payment. No money is sent.")).toBeVisible();await dialog.getByRole("button",{name:"Cancel",exact:true}).click();expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
});

test("mobile search, slash shortcut and drawer transaction shortcut retain focus",async({page})=>{
 const state=await workspace(page);await page.setViewportSize({width:390,height:844});await page.goto("/accounts");
 const trigger=page.getByRole("button",{name:"Search workspace",exact:true});await trigger.click();
 const search=page.getByRole("dialog",{name:"Search workspace"}),input=search.getByRole("combobox");await expect(input).toBeFocused();await input.fill("bank");
 await expect(search.getByRole("option",{name:/Daily bank/})).toBeVisible();await reviewFocusLoop(page,search);await page.keyboard.press("Escape");await expect(search).not.toBeVisible();await expect(trigger).toBeFocused();
 await page.keyboard.press("/");await expect(input).toBeFocused();await input.fill("bank");await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
 await expect(page).toHaveURL(/accounts\?id=1/);await expect(page.getByRole("region",{name:"Daily bank account details"})).toBeFocused();
 await page.getByRole("button",{name:"Open navigation"}).click();await page.getByRole("dialog",{name:"Luna navigation"}).getByRole("button",{name:"Add transaction",exact:true}).click();
 const transaction=page.getByRole("dialog");await expect(transaction.getByLabel("Full amount · PHP")).toBeVisible();await reviewFocusLoop(page,transaction);await page.keyboard.press("Escape");expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
});

test("compact desktop, tablet and mobile layouts retain records and dialog controls",async({page},testInfo)=>{
 test.setTimeout(120000);const state=await workspace(page);
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});
  for(const [path,heading] of [["/","Overview"],["/accounts","Accounts"],["/budgets","Budgets"],["/bills","Bills"],["/goals","Goals"],["/transactions","Transactions"],["/statements","Statements"],["/import-export","Import & Export"]]){
   await page.goto(path);await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
   await expect(page.getByRole("status").filter({hasText:/^Loading/})).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await noOverflow(page);
   if(path==="/transactions"){
    await expect(page.getByRole("button",{name:"View Neighbourhood market on "+new Date().toISOString().slice(0,7)+"-15",exact:true})).toHaveCount(1);
    await expect(page.getByRole("table",{name:"Posted transactions"})).toHaveCount(width===1440?1:0);
   }
   await page.screenshot({path:testInfo.outputPath(heading.replaceAll(" ","-")+"-"+width+".png"),fullPage:true});
  }
  await page.goto("/transactions");const trigger=page.getByRole("button",{name:"Add transaction",exact:true}).last();await trigger.click();const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Full amount · PHP")).toBeVisible();await reviewDialog(dialog);await reviewFocusLoop(page,dialog);await noOverflow(page);await page.screenshot({path:testInfo.outputPath("transaction-dialog-"+width+".png")});await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
  await page.goto("/goals");await page.getByRole("button",{name:"More actions for Emergency fund"}).click();await page.getByRole("menuitem",{name:"Delete goal",exact:true}).click();const confirmation=page.getByRole("alertdialog");await reviewDialog(confirmation);await page.screenshot({path:testInfo.outputPath("goal-confirmation-"+width+".png")});await page.keyboard.press("Escape");
 }
 expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
});
