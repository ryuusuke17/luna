import {test,expect,type Page} from "@playwright/test";
import {reviewDialog,reviewFocusLoop} from "./fixtures/accessibility";

async function workspace(page:Page){
 const record={id:1,owner_id:1,name:"Daily bank",type:"bank",liquid:1,opening_date:"2025-01-01",archived_at:null,last4:"4321",credit_limit:null,reconciled_through:null,issuer:"BPI",product:null,network:"Visa",reconciliation_stale:0};
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
 await expect(page).toHaveURL(/\/accounts\/1$/);await expect(edit.getByLabel("Account / card type")).toBeDisabled();await expect(edit.getByLabel("Account name")).toHaveValue("Daily bank");await expect(edit.getByLabel("Last 4 digits (optional)")).toHaveValue("4321");
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
  await expect(card.getByRole("button")).toHaveCount(0);await expect(card.getByText(/Limit|utilization/i)).toHaveCount(0);
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

test("native account navigation, scoped URL filters, source restoration and ledger totals",async({page})=>{
 const state=await workspace(page);await page.setViewportSize({width:320,height:740});await page.goto("/accounts");
 await expect(page.getByText("Balance · Apr 2026",{exact:true})).toBeVisible();const link=page.getByRole("link",{name:"View account details for Daily bank"});await expect(link).toHaveAttribute("href","/accounts/1");await link.focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/\/accounts\/1$/);
 await page.getByLabel("Month",{exact:true}).fill("2026-04");await page.getByRole("button",{name:"View April statement.csv",exact:true}).click();await expect(page.getByRole("region",{name:"Legacy statement source"})).toContainText("123400");await page.getByRole("button",{name:"Close source details"}).click();await expect(page.getByRole("button",{name:"View April statement.csv",exact:true})).toBeFocused();await expect(page.getByLabel("Month",{exact:true})).toHaveValue("2026-04");
 const tabs=page.getByRole("tab",{name:"Statements",exact:true});await tabs.focus();await page.keyboard.press("ArrowRight");await expect(page.getByRole("tab",{name:"Balance/activity"})).toHaveAttribute("aria-selected","true");await expect(page).toHaveURL(/tab=activity&month=2026-04/);
 const closing=page.getByText("Closing ledger balance",{exact:true}).locator("..").getByRole("definition");await expect(closing).toHaveText("₱950.00");await page.getByLabel("Search activity",{exact:true}).fill("missing");await expect(page.getByText("No activity matches this period and search.")).toBeVisible();await expect(closing).toHaveText("₱950.00");await expect(page).toHaveURL(/search=missing/);
 await page.getByLabel("Date from",{exact:true}).fill("2026-03-01");await expect(page.getByLabel("Month",{exact:true})).toHaveValue("");await expect(page).toHaveURL(/start=2026-03-01/);await page.reload();await expect(page.getByLabel("Date from",{exact:true})).toHaveValue("2026-03-01");await page.getByRole("button",{name:"Clear filters",exact:true}).first().click();await expect(page).toHaveURL(/\/accounts\/1\?tab=activity&month=2026-04$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
 await page.goto("/accounts?id=1");await expect(page).toHaveURL(/\/accounts\/1$/);await expect(page.getByRole("heading",{name:"Daily bank",exact:true})).toBeVisible();
});
