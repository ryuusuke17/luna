import {test,expect,type Page} from "@playwright/test";

// UI contract coverage uses disposable in-memory API responses; SQLite mutations have node:test coverage.
async function workspace(page:Page){
 let next=10;const prefs={shortcuts:1,bill_alerts:1,budget_alerts:1,goal_alerts:1,default_transaction_currency:"PHP"};
 const accounts=[{id:1,name:"Daily bank",type:"bank",balance:100000,opening_date:"2025-01-01",liquid:1}];
 const categories=[{id:1,name:"Food",kind:"expense"},{id:2,name:"Other",kind:"expense"}];
 const transactions:any[]=[],budgets:any[]=[{id:1,name:"Food plan",category_id:1,month:"2025-01",amount:10000,actual:0,category_name:"Food",kind:"expense"}],goals:any[]=[{version:"goal-version",id:1,owner_id:1,name:"Buffer",target:10000,allocated:500,due_date:null,notes:"",created_at:"2025-01-01",contributions:[{id:1,amount:500,posted_date:"2025-01-01",notes:""}]}];
 const requests:{method:string;path:string;body:any}[]=[];
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method(),body=request.postDataJSON();requests.push({method,path,body});
  let result:any={};
  if(path==="auth/me")result={user:{id:1,username:"UI fixture"}};
  else if(path==="preferences"){if(method==="POST")Object.assign(prefs,body);result=prefs;}
  else if(path==="accounts")result=accounts;
  else if(path==="categories")result=categories;
  else if(path==="transactions"&&method==="POST"||/^transactions\/\d+$/.test(path)&&method==="PATCH"){
   const id=next++,record={id,version:`version-${id}`,kind:body.kind,posted_date:body.date,amount:body.originalAmount*(body.originalCurrency==="USD"?Number(body.exchangeRate):1),account_id:body.accountId,counter_account_id:body.counterAccountId??null,category_id:body.categoryId??null,description:body.description,merchant:body.merchant,notes:body.notes,original_currency:body.originalCurrency,original_amount:body.originalAmount,exchange_rate:body.exchangeRate,included_fee:body.includedFee,account_name:"Daily bank",category_name:"Food",counter_account_name:null,bill_linked:false,balance_impacts:[{id:1,name:"Daily bank",change:body.originalAmount*58}]};
   if(method==="PATCH"){const prior=transactions.findIndex(t=>t.id===Number(path.split("/")[1]));transactions.splice(prior,1);}transactions.push(record);result={id};
  }else if(/^transactions\/\d+$/.test(path)&&method==="DELETE"){transactions.splice(transactions.findIndex(t=>t.id===Number(path.split("/")[1])),1);result={ok:true};}
  else if(path==="transactions"){const items=url.searchParams.has("id")?transactions.filter(t=>t.id===Number(url.searchParams.get("id"))):transactions;result=url.searchParams.has("page")?{items,total:items.length,pageSize:50}:items;}
  else if(path==="budgets")result=budgets;
  else if(/^budgets\/\d+$/.test(path)){const index=budgets.findIndex(b=>b.id===Number(path.split("/")[1]));if(method==="PATCH"){Object.assign(budgets[index],{name:body.name,category_id:body.categoryId,category_name:categories.find(c=>c.id===body.categoryId)?.name,month:body.month,amount:Number(body.amount)*100});result={id:budgets[index].id};}else{budgets.splice(index,1);result={ok:true};}}
  else if(path==="goals")result=goals;
  else if(/^goals\/\d+$/.test(path)&&method==="DELETE"){goals.splice(0);result={ok:true};}
  else if(path==="accounts/1/deletion-preview")result={account:{id:1,name:"Daily bank"},version:"account-preview",counts:{transactions:2,ledger_entries:3,bills:1,payments:1,statement_rows:1,csv_rows:1,statements:1,csv_batches:1},surviving:[{id:2,name:"Savings",before:10000,change:-500,after:9500}]};
  else if(path==="accounts/1"&&method==="DELETE"){accounts.splice(0);result={ok:true};}
  else if(["merchant-rules","providers","bills","import-history"].includes(path)||path==="search")result=[];
  await route.fulfill({json:result});
 });return{requests,prefs,transactions,budgets,goals};
}

test("currency preference, fee draft, transaction correction and void",async({page})=>{
 const state=await workspace(page);await page.goto("/settings");await page.getByRole("tab",{name:"preferences",exact:true}).click();await page.getByLabel("Default transaction currency").selectOption("USD");await expect(page.getByRole("status").filter({hasText:"Changes saved."})).toBeVisible();await page.getByLabel("Enable N and / keyboard shortcuts").click();await expect(page.getByLabel("Enable N and / keyboard shortcuts")).not.toBeChecked();await expect(page.getByLabel("Default transaction currency")).toHaveValue("USD");
 await page.goto("/transactions");await page.getByRole("button",{name:"Add transaction",exact:true}).last().click();const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Transaction currency")).toHaveValue("USD");await dialog.getByLabel("Full amount · USD").fill("105");await dialog.getByLabel("Manual rate").fill("58");await dialog.getByRole("combobox",{name:"Account",exact:true}).selectOption("1");await dialog.getByRole("combobox",{name:"Category",exact:true}).selectOption("1");await dialog.getByRole("textbox",{name:"Description",exact:true}).fill("Fee purchase");const checkbox=dialog.getByLabel("Amount includes additional fees");await checkbox.focus();await page.keyboard.press("Space");await dialog.getByLabel("Included fee · USD").fill("5");await checkbox.uncheck();await checkbox.check();await expect(dialog.getByLabel("Included fee · USD")).toHaveValue("5");await dialog.getByRole("button",{name:"Save transaction"}).click();await expect(dialog).not.toBeVisible();expect(state.transactions[0].included_fee).toBe(500);expect(state.transactions[0].amount).toBe(609000);
 await page.getByRole("button",{name:/View Fee purchase/}).click();await expect(page.getByRole("dialog").getByText("1 USD = 58 PHP")).toBeVisible();await page.getByRole("button",{name:"Edit transaction",exact:true}).click();await expect(dialog.getByLabel("Full amount · USD")).toHaveValue("105.00");await dialog.getByLabel("Full amount · USD").fill("110");await dialog.getByRole("button",{name:"Save transaction"}).click();await expect(dialog).not.toBeVisible();expect(state.requests.find(r=>r.method==="PATCH"&&r.path.startsWith("transactions/"))?.body.version).toBe("version-10");await page.getByRole("button",{name:/View Fee purchase/}).click();await page.getByRole("button",{name:"Delete transaction",exact:true}).click();const confirmation=page.getByRole("alertdialog");await expect(confirmation.getByText(/Ledger and audit history remain retained/)).toBeVisible();await confirmation.getByRole("button",{name:"Delete transaction",exact:true}).click();await expect(page.getByText("No posted records yet.",{exact:false})).toBeVisible();
});

test("budget edit retains ID; budget and goal deletion confirmations",async({page})=>{
 const state=await workspace(page);await page.goto("/budgets");await page.getByLabel("Selected month",{exact:true}).fill("2025-01");await page.getByRole("button",{name:"Edit Food plan budget"}).click();await page.getByLabel("Budget name").fill("Moved plan");await page.getByRole("dialog").getByRole("combobox",{name:"Category",exact:true}).selectOption("2");await page.getByRole("button",{name:"Save category budget"}).click();await expect(page.getByRole("dialog")).not.toBeVisible();expect(state.budgets[0].id).toBe(1);await page.getByRole("button",{name:"Delete budget Moved plan"}).click();await expect(page.getByRole("alertdialog").getByText(/Transactions and account balances remain unchanged/)).toBeVisible();await page.getByRole("button",{name:"Delete budget permanently"}).click();await expect(page.getByText("No expense budgets in 2025-01.")).toBeVisible();
 await page.goto("/goals");await page.getByRole("button",{name:"Delete goal Buffer"}).click();await expect(page.getByRole("alertdialog").getByText(/1 contributions totaling/)).toBeVisible();await expect(page.getByRole("alertdialog").getByText(/Account funds do not change/)).toBeVisible();await page.getByRole("button",{name:"Delete goal and allocations permanently"}).click();await expect(page.getByText("No goals yet. Create a target to begin.")).toBeVisible();expect(state.goals).toHaveLength(0);
});

test("narrow-screen account deletion requires exact name and preview; cancel does not delete",async({page})=>{
 const state=await workspace(page);await page.setViewportSize({width:320,height:740});await page.goto("/accounts");await page.getByRole("button",{name:"Delete account Daily bank"}).click();const dialog=page.getByRole("alertdialog");await expect(dialog.getByText(/Importing those files again can recreate/)).toBeVisible();await expect(dialog.getByText(/Savings:/)).toBeVisible();const final=dialog.getByRole("button",{name:"Delete account and history permanently"});await expect(final).toBeDisabled();await dialog.getByLabel("Type account name to confirm").fill("wrong");await expect(final).toBeDisabled();await dialog.getByRole("button",{name:"Cancel deletion"}).click();expect(state.requests.filter(r=>r.method==="DELETE")).toHaveLength(0);await page.getByRole("button",{name:"Delete account Daily bank"}).click();await dialog.getByLabel("Type account name to confirm").fill("Daily bank");await expect(final).toBeEnabled();await final.click();await expect(dialog).not.toBeVisible();expect(state.requests.find(r=>r.method==="DELETE")?.body).toEqual({version:"account-preview",confirmation:"Daily bank"});await expect(page.getByRole("heading",{name:"Daily bank",exact:true})).toHaveCount(0);
});


test("financial dialogs: accessible semantics, contrast, keyboard focus and error recovery",async({page})=>{
 const {reviewDialog,reviewFocusLoop}=await import("./fixtures/accessibility");
 await workspace(page);await page.goto("/transactions");
 const trigger=page.getByRole("button",{name:"Add transaction",exact:true}).last();await trigger.focus();await page.keyboard.press("Enter");
 const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Full amount · PHP")).toBeVisible();
 await reviewDialog(dialog);await reviewFocusLoop(page,dialog);
 await dialog.getByLabel("Full amount · PHP").fill("105");await dialog.getByRole("combobox",{name:"Account",exact:true}).selectOption("1");await dialog.getByRole("combobox",{name:"Category",exact:true}).selectOption("1");
 await dialog.getByLabel("Amount includes additional fees").focus();await page.keyboard.press("Space");await dialog.getByLabel("Included fee · PHP").fill("106");
 await dialog.getByRole("button",{name:"Save transaction"}).focus();await page.keyboard.press("Enter");
 await expect(dialog.getByRole("alert")).toHaveText("Included fee must be greater than zero and no more than the full amount.");
 await expect(dialog.getByLabel("Included fee · PHP")).toHaveAttribute("aria-describedby","transaction-error");await expect(dialog.getByLabel("Full amount · PHP")).toHaveValue("105");
 await reviewDialog(dialog);await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 for(const [path,action] of [["/budgets","Delete budget Food plan"],["/goals","Delete goal Buffer"],["/accounts","Delete account Daily bank"]]){
  await page.goto(path);if(path==="/budgets")await page.getByLabel("Selected month",{exact:true}).fill("2025-01");
  await page.getByRole("button",{name:action,exact:true}).focus();await page.keyboard.press("Space");const confirmation=page.getByRole("alertdialog");await expect(confirmation.getByRole("button",{name:"Cancel deletion"})).toBeVisible();if(path==="/accounts")await expect(confirmation.getByLabel("Type account name to confirm")).toBeVisible();
  await reviewDialog(confirmation);await reviewFocusLoop(page,confirmation);await page.keyboard.press("Escape");await expect(confirmation).not.toBeVisible();await expect(page.locator("#main")).toBeFocused();
 }
});

test("200 percent zoom-equivalent reflow and long names keep forms usable",async({page})=>{
 const {reviewDialog,reviewFocusLoop}=await import("./fixtures/accessibility");
 // Browser zoom halves the CSS viewport. Test 1280x800 at 200%, plus 320px reflow.
 await workspace(page);
 for(const size of [{width:640,height:400},{width:320,height:400}]){
  await page.setViewportSize(size);await page.goto("/transactions");await page.getByRole("button",{name:"Add transaction",exact:true}).last().click();const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Full amount · PHP")).toBeVisible();
  await dialog.getByLabel("Transaction currency").selectOption("USD");await dialog.getByLabel("Amount includes additional fees").check();await dialog.getByRole("textbox",{name:"Description",exact:true}).fill("Long financial description ".repeat(8));await reviewDialog(dialog);await reviewFocusLoop(page,dialog);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press("Escape");
  await page.goto("/accounts");await page.getByRole("button",{name:"Delete account Daily bank"}).click();const confirmation=page.getByRole("alertdialog");await expect(confirmation.getByLabel("Type account name to confirm")).toBeVisible();await reviewDialog(confirmation);await reviewFocusLoop(page,confirmation);await page.keyboard.press("Escape");
 }
});

test.describe("emulated touch",()=>{
 test.use({hasTouch:true,viewport:{width:320,height:740}});
 test("tap fee controls and cancel account deletion safely",async({page})=>{
  const state=await workspace(page);await page.goto("/transactions");await page.getByRole("button",{name:"Add transaction",exact:true}).last().tap();const dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Full amount · PHP")).toBeVisible();await dialog.getByLabel("Amount includes additional fees").tap();await expect(dialog.getByLabel("Included fee · PHP")).toBeVisible();await dialog.getByRole("button",{name:"Cancel",exact:true}).tap();await expect(dialog).not.toBeVisible();
  await page.goto("/accounts");await page.getByRole("button",{name:"Delete account Daily bank"}).tap();const confirmation=page.getByRole("alertdialog");await expect(confirmation.getByLabel("Type account name to confirm")).toBeVisible();await confirmation.getByRole("button",{name:"Cancel deletion"}).tap();await expect(confirmation).not.toBeVisible();expect(state.requests.filter(r=>r.method==="DELETE")).toHaveLength(0);
 });
});
