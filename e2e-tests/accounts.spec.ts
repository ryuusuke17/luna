import {test,expect,type Page} from "@playwright/test";
import {reviewDialog,reviewFocusLoop} from "./fixtures/accessibility";

async function workspace(page:Page,overrides:Record<string,unknown>={}){
 const record={id:1,owner_id:1,name:"Daily bank",type:"bank",liquid:1,opening_date:"2025-01-01",archived_at:null,last4:"4321",credit_limit:null,reconciled_through:null,issuer:"BPI",product:null,network:"Visa",reconciliation_stale:0,...overrides};
 const snapshot={id:"archive:8",source:"archive",sourceId:8,filename:"April statement.csv",date:"2026-04-30",currency:"PHP",amount:123400,semantics:"asset-positive",status:"Legacy reference",eligible:true,dueDate:null,minimumDue:null,download:"/api/statement-archives/8/download",view:""};
 const writes:{path:string;method:string;body:Record<string,unknown>}[]=[],errors:string[]=[];
 let fail=false;
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method();
  if(method!=="GET"){
   const body=request.postDataJSON();writes.push({path,method,body});
   if(fail){await route.fulfill({status:409,json:{message:"This account changed. Reload and review before saving."}});return;}
   if(method==="PATCH"){expect(body.expected).toBe(JSON.stringify(record));Object.assign(record,{name:body.name});}
   await route.fulfill({json:{id:1}});return;
  }
  const display={count:1,date:snapshot.date,source:"statement",snapshots:[snapshot],reason:null},account={...record,balance:95000,display};
  let result:unknown=[];
  if(path==="auth/me")result={user:{id:1,username:"Account fixture"}};
  else if(path==="preferences")result={shortcuts:1};
  else if(path==="accounts")result=[account];
  else if(path==="accounts/1"){
   const q=url.searchParams,activity=q.get("tab")==="activity",month=q.get("month")??(activity&&!q.has("start")&&!q.has("end")?"2026-04":null);
   result={account,history:{items:q.get("search")?[].filter(Boolean):[snapshot],total:q.get("search")?0:1,page:1,pageSize:25},period:{month,start:q.get("start")??(month?`${month}-01`:null),end:q.get("end")??(month?`${month}-30`:null),opening:100000,closing:95000,inflows:10000,outflows:15000}};
  }else if(path==="transactions")result={items:url.searchParams.get("search")==="missing"?[]:[{id:4,posted_date:"2026-04-02",merchant:"Grocer",description:"Food",kind:"expense",amount:15000,account_id:1,counter_account_id:null,balance_impacts:[{id:1,change:15000}]}],total:url.searchParams.get("search")==="missing"?0:1,page:1,pageSize:20};
  else if(path==="statement-archives")result={items:[snapshot],total:1,pageSize:25};
  else if(path==="statement-archives/8")result={id:8,filename:snapshot.filename,summary:{statementDate:snapshot.date,outstandingBalance:snapshot.amount},rows:[],rawSummary:[],warnings:[]};
  await route.fulfill({json:result});
 });
 return {writes,errors,failSaves:()=>{fail=true;}};
}

test("account dialogs preserve type-aware fields, focus, conflicts and concurrency shape",async({page})=>{
 const state=await workspace(page);await page.setViewportSize({width:320,height:740});await page.goto("/accounts");
 const add=page.getByRole("button",{name:"Add account",exact:true});await add.click();const dialog=page.getByRole("dialog",{name:"New account"});await reviewDialog(dialog);await reviewFocusLoop(page,dialog);
 await dialog.getByLabel("Account / card type").selectOption("wallet");await expect(dialog.getByLabel("Wallet provider")).toBeVisible();await expect(dialog.getByLabel("Card network")).toHaveCount(0);await expect(dialog.getByLabel("Card / product")).toHaveCount(0);
 await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(add).toBeFocused();
 await add.click();await dialog.getByLabel("Account / card type").selectOption("cash");await dialog.getByLabel("Account name").fill("Travel cash");await dialog.getByRole("button",{name:"Save account",exact:true}).click();await expect(dialog).not.toBeVisible();expect(state.writes[0].body).toMatchObject({name:"Travel cash",type:"cash",openingBalance:"0"});
 await page.getByRole("link",{name:"View account details for Daily bank"}).click();const editButton=page.getByRole("button",{name:"Edit details",exact:true});await editButton.click();const edit=page.getByRole("dialog",{name:"Edit account details"});
 await expect(page).toHaveURL(/\/accounts\/1(?:\?|$)/);await expect(edit.getByLabel("Account / card type")).toBeDisabled();await expect(edit.getByLabel("Account name")).toHaveValue("Daily bank");await expect(edit.getByLabel("Last 4 digits (optional)")).toHaveValue("4321");
 await edit.getByLabel("Account name").fill("Renamed bank");await edit.getByRole("button",{name:"Save changes"}).click();await expect(edit).not.toBeVisible();await expect(page.getByRole("heading",{name:"Renamed bank",exact:true})).toBeVisible();
 await editButton.click();state.failSaves();await edit.getByLabel("Account name").fill("Retained draft");await edit.getByRole("button",{name:"Save changes"}).click();await expect(edit.getByRole("alert")).toBeVisible();await expect(edit.getByLabel("Account name")).toHaveValue("Retained draft");await page.keyboard.press("Escape");await expect(editButton).toBeFocused();
 expect(state.writes).toHaveLength(3);expect(state.writes[1].body.expected).not.toContain('"display"');expect(state.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("credit cards keep transparent logos, twelve masked digits and network inside the footer",async({page})=>{
 const state=await workspace(page);
 await page.route("**/api/accounts",route=>route.fulfill({json:[{id:1,name:"BDO ShopMore Mastercard",type:"credit_card",issuer:"BDO",product:"ShopMore Mastercard ".repeat(8),network:"Mastercard",last4:"4321",balance:-95000,credit_limit:10000000,opening_date:"2025-01-01"}]}));
 for(const width of [320,640,1200]){
  await page.setViewportSize({width,height:800});await page.goto("/accounts");
  const card=page.locator(".luna-account-card"),link=card.getByRole("link"),network=card.getByRole("img",{name:"Mastercard",exact:true});
  await expect(card.getByRole("button")).toHaveCount(0);await expect(card.getByText(/Ledger balance · No statements uploaded/)).toHaveCount(0);
  await expect(card.getByRole("meter")).toHaveAttribute("aria-valuenow","0.95");
  await expect(card.getByText("1% utilization",{exact:true})).toBeVisible();
  await expect(link).toHaveCSS("min-height","0px");await expect(card.locator("h3")).toHaveCSS("margin-top","4px");
  await expect(card.locator(".luna-account-number")).toHaveText("•••• •••• ••••4321");
  await expect(link).toHaveCSS("text-decoration-line","none");await link.hover();await expect(link).toHaveCSS("text-decoration-line","none");await link.focus();
  await expect(link).toBeFocused();expect(await link.evaluate(el=>getComputedStyle(el,"::after").outlineStyle)).toBe("solid");
  const svg=await network.getAttribute("src");expect(decodeURIComponent(svg!.split(",")[1])).not.toContain('<rect width="120" height="80"');
  await expect(network.locator("..")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(card.locator("img").first().locator("..")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  const bounds=(await card.boundingBox())!,mark=(await network.boundingBox())!;
  expect(mark.x+mark.width).toBeLessThanOrEqual(bounds.x+bounds.width);expect(mark.y+mark.height).toBeLessThanOrEqual(bounds.y+bounds.height);expect(mark.y).toBeGreaterThan(bounds.y+bounds.height/2);
  expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(state.errors).toEqual([]);
});

test("utilization meters clamp over-limit and credit balances; other accounts have no bar",async({page})=>{
 await workspace(page);
 const base={type:"credit_card",opening_date:"2025-01-01",credit_limit:100000,balance:-125000};
 await page.route("**/api/accounts",route=>route.fulfill({json:[
  {...base,id:1,name:"Over limit"},
  {...base,id:2,name:"Credit balance",balance:10000},
  {...base,id:3,name:"Unknown limit",credit_limit:null},
  {...base,id:4,name:"Daily bank",type:"bank"},
 ]}));
 await page.goto("/accounts");
 const card=(name:string)=>page.locator(".luna-account-card").filter({has:page.getByRole("link",{name:`View account details for ${name}`,exact:true})});
 await expect(card("Over limit").getByRole("meter")).toHaveAttribute("aria-valuenow","100");
 await expect(card("Over limit").getByRole("meter")).toHaveAttribute("aria-valuetext",/125% utilization/);
 await expect(card("Credit balance").getByRole("meter")).toHaveAttribute("aria-valuenow","0");
 await expect(card("Unknown limit").getByRole("meter")).toHaveCount(0);
 await expect(card("Unknown limit").getByText("Utilization unavailable",{exact:true})).toBeVisible();
 await expect(card("Daily bank").getByRole("meter")).toHaveCount(0);
 await expect(card("Daily bank").getByText(/utilization/i)).toHaveCount(0);
 await expect(page.getByText("Ledger balance · No statements uploaded",{exact:true})).toHaveCount(0);
});

test("account creation defaults date and optional name with concise ShopMore product",async({page})=>{
 const state=await workspace(page);await page.goto("/accounts");
 await page.getByRole("button",{name:"Add account",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"New account"});
 await expect(dialog.getByLabel("Opening date")).toHaveCount(0);
 await expect(dialog.getByLabel("Account name")).not.toHaveAttribute("required", "");
 await dialog.getByLabel("Issuer / bank").selectOption("BDO");
 await dialog.getByLabel("Card / product").selectOption({label:"ShopMore Mastercard"});
 await expect(dialog.getByLabel("Card network")).toHaveValue("Mastercard");
 await dialog.getByLabel("Credit limit · PHP").fill("10000");
 await dialog.getByRole("button",{name:"Save account",exact:true}).click();
 await expect(dialog).not.toBeVisible();
 expect(state.writes[0].body).toMatchObject({name:"BDO ShopMore Mastercard",product:"ShopMore Mastercard",openingBalance:"0"});
 expect(state.writes[0].body.openingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 await page.getByRole("button",{name:"Add account",exact:true}).click();
 await dialog.getByLabel("Account / card type").selectOption("cash");
 await dialog.getByRole("button",{name:"Save account",exact:true}).click();
 await expect(dialog).not.toBeVisible();
 expect(state.writes[1].body.name).toBe("Cash");
 expect(state.errors).toEqual([]);
});

test("blank and whitespace account names save when editing BDO settings",async({page})=>{
 const state=await workspace(page,{name:"BDO Mastercard Debit",issuer:"BDO",product:"BDO Mastercard Debit",network:"Mastercard"});
 await page.goto("/accounts/1");
 for(const blank of ["","   "]){
  await page.getByRole("button",{name:"Edit details",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Edit account details"}),name=dialog.getByLabel("Account name (optional)");
  await expect(name).not.toHaveAttribute("required","");
  await expect(name).toHaveValue("");
  await expect(dialog.getByLabel("Card / product").locator("option:checked")).toHaveText("Mastercard Debit");
  await name.fill(blank);
  await dialog.getByRole("button",{name:"Save changes",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading",{name:"BDO Mastercard Debit",exact:true})).toBeVisible();
 }
 expect(state.writes).toHaveLength(2);
 for(const write of state.writes)expect(write.body).toMatchObject({name:"BDO Mastercard Debit",product:"BDO Mastercard Debit",network:"Mastercard",last4:"4321"});
 expect(state.errors).toEqual([]);
});

test("account history defaults to ledger, locks filters, and keeps non-credit billing hidden",async({page})=>{
 const state=await workspace(page),requests:string[]=[];
 page.on("request",r=>{if(new URL(r.url()).pathname==="/api/transactions")requests.push(r.url());});
 await page.setViewportSize({width:320,height:740});await page.goto("/accounts");
 await expect(page.getByText("Current balance",{exact:true})).toBeVisible();
 await page.getByRole("link",{name:"View account details for Daily bank"}).click();
 await expect(page.getByRole("heading",{name:"Transactions",exact:true})).toBeVisible();
 await expect(page.getByRole("tab",{name:"Statements",exact:true})).toHaveCount(0);
 await expect(page.getByText("Statement balance",{exact:true})).toHaveCount(0);
 await expect(page.getByRole("link",{name:"Import history",exact:true})).toHaveAttribute("href","/import-export?account=1&tab=history");
 await page.getByRole("button",{name:/^Filter,/}).click();const filter=page.getByRole("dialog",{name:"Filter transactions"});
 await expect(filter.getByRole("combobox",{name:"Account",exact:true})).toBeDisabled();await filter.getByRole("button",{name:"Clear all",exact:true}).click();await filter.getByRole("button",{name:"Apply",exact:true}).click();
 await expect(page).toHaveURL(/account=1/);await expect(page.getByRole("button",{name:/^Date filter:/})).toHaveText("All time");
 expect(requests.every(url=>new URL(url).searchParams.get("account")==="1")).toBe(true);
 for(const width of [320,640,1200]){await page.setViewportSize({width,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test("account overview separates statement currencies, due details and ledger; meter stays bounded",async({page})=>{
 const state=await workspace(page);
 const snapshot={id:"issued:1",source:"issued",sourceId:1,filename:"April statement.csv",date:"2026-04-30",currency:"PHP",amount:125000,semantics:"debt-positive",status:"issued",eligible:true,dueDate:"2026-05-20",minimumDue:5000,download:null,view:""};
 const account={id:1,name:"BDO ShopMore Mastercard ".repeat(3),type:"credit_card",issuer:"BDO",product:"ShopMore Mastercard",network:"Mastercard",last4:"4321",balance:-90000,credit_limit:100000,opening_date:"2025-01-01",display:{source:"statement",count:2,date:snapshot.date,snapshots:[snapshot,{...snapshot,id:"issued:2",sourceId:2,currency:"USD",amount:2500,minimumDue:null,dueDate:null}],reason:null}};
 await page.route("**/api/accounts/1",route=>route.fulfill({json:{account,history:{items:[],total:0,page:1,pageSize:25}}}));
 await page.goto("/accounts/1");
 const header=page.locator("header[aria-label$='account details']"),php=header.getByLabel("Latest PHP statement",{exact:true}),usd=header.getByLabel("Latest USD statement",{exact:true});
 await expect(php).toContainText("₱1,250.00");await expect(php).toContainText("2026-05-20");await expect(php).toContainText("₱50.00");
 await expect(usd).toContainText(/25\.00/);await expect(usd.getByText("Not provided",{exact:true})).toHaveCount(2);
 await expect(header.getByLabel("Ledger reference",{exact:true})).toHaveCount(0);
 await expect(header.getByRole("meter")).toHaveAttribute("aria-valuenow","90");await expect(header.getByRole("meter")).toHaveAttribute("aria-valuetext",/90% utilized/);
 await expect(header.getByLabel("Current recorded ledger balance",{exact:true})).toHaveCount(0);
 for(const width of [320,640,1200]){
  await page.setViewportSize({width,height:800});await expect(php).toBeVisible();
  const balance=(await php.boundingBox())!,usage=(await header.getByLabel("Credit utilization",{exact:true}).boundingBox())!;
  if(width>=640){expect(Math.abs(balance.y-usage.y)).toBeLessThan(1);expect(Math.abs(balance.height-usage.height)).toBeLessThan(1);expect(usage.x).toBeGreaterThanOrEqual(balance.x+balance.width);}
  else expect(usage.y).toBeGreaterThanOrEqual(balance.y+balance.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await header.getByRole("link",{name:"Import statements",exact:true}).focus();await expect(header.getByRole("link",{name:"Import statements",exact:true})).toBeFocused();
 expect(state.errors).toEqual([]);expect(state.writes).toEqual([]);
});

test("missing statements never relabel ledger balances as statement values",async({page})=>{
 const state=await workspace(page);
 const account={id:1,name:"No statement",type:"credit_card",balance:10000,credit_limit:100000,opening_date:"2025-01-01",display:{source:"ledger",count:0,date:null,snapshots:[],reason:"No statements uploaded"}};
 await page.route("**/api/accounts/1",route=>route.fulfill({json:{account,history:{items:[],total:0,page:1,pageSize:25}}}));
 await page.goto("/accounts/1");
 const header=page.locator("header[aria-label$='account details']"),summary=header.getByLabel("Statement balance unavailable",{exact:true});
 await expect(summary.getByText("Not provided",{exact:true})).toHaveCount(3);await expect(summary).not.toContainText("₱100.00");
 await expect(header.getByLabel("Ledger reference",{exact:true})).toHaveCount(0);await expect(header.getByRole("meter")).toHaveAttribute("aria-valuenow","0");
 await expect(header.getByLabel("Credit utilization",{exact:true})).toContainText("Ledger · PHP");
 expect(state.errors).toEqual([]);
});


test("non-card accounts retain transfers without upload shortcuts; archived cards stay restricted",async({page})=>{
 const state=await workspace(page);let type="bank",archived=false;
 await page.route("**/api/accounts/1",route=>route.fulfill({json:{account:{id:1,name:"Shortcut fixture",type,balance:0,credit_limit:type==="credit_card"?100000:null,opening_date:"2025-01-01",archived_at:archived?"2026-01-01":null},history:{items:[],total:0,page:1,pageSize:25}}}));
 for(type of ["bank","cash","wallet"]){
  await page.goto("/accounts/1");await expect(page.getByRole("button",{name:"Transfer money",exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Import transactions",exact:true})).toHaveCount(0);await expect(page.getByRole("link",{name:"Import statements",exact:true})).toHaveCount(0);await expect(page.getByRole("link",{name:"Import history",exact:true})).toBeVisible();
 }
 type="credit_card";archived=true;await page.goto("/accounts/1");await expect(page.getByRole("heading",{name:"Shortcut fixture",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Import statements",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Add transaction for this account",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Transfer money",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Edit details",exact:true})).toBeDisabled();await expect(page.getByRole("link",{name:"Import history",exact:true})).toBeVisible();
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
