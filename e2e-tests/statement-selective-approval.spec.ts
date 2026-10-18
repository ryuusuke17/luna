import {test,expect} from "@playwright/test";
import {reviewDialog,reviewFocusLoop} from "./fixtures/accessibility";
import {importWorkspace} from "./fixtures/transaction-imports";

test("old upload URLs redirect into Import & Export; Transactions keeps only ledger scope (mocked API)",async({page})=>{
 await importWorkspace(page,true);await page.setViewportSize({width:320,height:700});
 for(const path of ["/imports?statement=1","/statements?statement=1"]){
  await page.goto(path);await expect(page).toHaveURL(/\/import-export\?batch=1&tab=history/);await expect(page.getByRole("heading",{name:"Import & Export",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"mixed.csv",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/reconcil|allocat|Approve/})).toHaveCount(0);
 }
 await page.goto("/transactions?batch=1&account=1");await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();await page.getByRole("combobox",{name:"Account",exact:true}).selectOption("2");await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();await expect(page).toHaveURL(/\/transactions\?account=2&period=all$/);
 await expect(page.getByRole("link",{name:"Imports",exact:true})).toHaveCount(0);await expect(page.getByRole("link",{name:"Bank Statements",exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:/sample statements/})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("account-context import preselects the account; escape returns focus (mocked API)",async({page})=>{
 await importWorkspace(page);await page.goto("/transactions?account=1&upload=1");const dialog=page.getByRole("dialog",{name:"Import transactions"});await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel("Account or credit card")).toHaveValue("1");await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();
 await page.getByRole("button",{name:"Import transactions",exact:true}).click();await expect(dialog.getByLabel("Account or credit card")).toHaveValue("1");
});


for(const legacy of [false,true])test("historical card import requires explicit confirmation then continuation ("+(legacy?"existing":"new")+", mocked API)",async({page})=>{
 await importWorkspace(page,true);let extended=false,posted=false;const actions:string[]=[];
 await page.route("**/api/statements/1",async route=>{
  const request=route.request();if(request.method()==="POST"){
   const body=request.postDataJSON();actions.push(body.action);
   if(body.action==="extend-history"){expect(body.version).toBe("before");extended=true;await route.fulfill({json:{ok:true,message:"History extended. Continue import to add eligible transactions."}});return;}
   if(body.action==="continue"){expect(extended).toBe(true);posted=true;await route.fulfill({json:{id:1,accountId:2,imported:2,linked:0,needsAttention:1,skipped:0}});return;}
  }
  const row={date:"2025-04-10",description:"Historical purchase",merchant:"Shop",kind:"expense",amount:1234,direction:-1};
  await route.fulfill({json:{id:1,account_id:2,account_name:"Everyday card",account_type:"credit_card",filename:"historical-"+"long-".repeat(16)+".csv",status:"partially_imported",version:extended?"after":"before",discrepancies:[],historyExtension:extended?null:{openingDate:"2026-10-18",proposedDate:"2025-04-10",affectedRows:1,sourceDates:["2025-04-10"],allowed:true,conflict:""},entries:[{id:10,index:0,action:"import",transactionId:100,row:{...row,date:"2026-10-18"},raw:{},blockers:[],candidates:[],warnings:""},{id:11,index:1,action:posted?"import":null,transactionId:posted?101:null,row,raw:{date:row.date,description:row.description,amount:"12.34"},blockers:extended?[]:[{code:"before_history",message:"Before account history: source posting date 2025-04-10; account opens 2026-10-18."}],candidates:[],warnings:legacy?"Posting date must be within account history and not in the future":""},{id:12,index:2,action:null,row:null,raw:{date:"2025-02-30",description:"Invalid date",amount:"1"},blockers:[{code:"invalid_date",message:"Invalid calendar date: 2025-02-30"}],candidates:[],warnings:"Invalid calendar date: 2025-02-30"}]}});
 });
 await page.setViewportSize({width:320,height:800});await page.goto("/import-export?tab=history&batch=1&account=2");
 const opener=page.getByRole("button",{name:"Extend account history",exact:true});await expect(page.getByRole("region",{name:"Before account history",exact:true})).toContainText("1 affected rows");
 await opener.focus();await page.keyboard.press("Enter");const dialog=page.getByRole("dialog",{name:"Extend account history?",exact:true});await expect(dialog).toContainText("No transactions are posted");await reviewDialog(dialog);await reviewFocusLoop(page,dialog);
 await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();expect(actions).toEqual([]);
 await page.keyboard.press("Enter");await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(dialog).not.toBeVisible();expect(actions).toEqual([]);
 await opener.click();await dialog.getByRole("button",{name:"Confirm history extension",exact:true}).focus();await page.keyboard.press("Enter");await expect(dialog).not.toBeVisible();await expect(page.locator("#import-result")).toContainText("History extended. Continue import to add eligible transactions.");expect(posted).toBe(false);
 await page.getByRole("button",{name:"Resolve uncertain rows",exact:true}).click();await expect(page.getByText("Invalid calendar date: 2025-02-30",{exact:true}).first()).toBeVisible();await expect(page.getByRole("button",{name:"Resolve row 1",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Continue import",exact:true}).focus();await page.keyboard.press("Enter");await expect(page.locator("#import-result")).toContainText("2 imported");expect(actions).toEqual(["extend-history","continue"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("formatting changes require a preview confirmation; cancel saves nothing (mocked API)",async({page})=>{
 await importWorkspace(page);let previews=0,confirmed=0;
 await page.route("**/api/statements",async route=>{
  if(route.request().method()!=="POST"){await route.fallback();return;}
  const body=route.request().postDataJSON();if(!body.confirmation){previews++;await route.fulfill({json:{preview:true,version:"format-v1",changes:["Removed UTF-8 BOM","Trimmed/collapsed header whitespace","Ignored empty trailing CSV cells; nonempty columns remain validated"],rows:[{index:0,row:{date:"2025-04-10",description:"Shop, City",merchant:"",amount:1234,kind:"refund",direction:1},warning:""}]}});return;}
  expect(body.confirmation).toBe("format-v1");confirmed++;await route.fulfill({json:{id:1,accountId:1,imported:1,linked:0,needsAttention:0,skipped:0,duplicate:false}});
 });
 await page.setViewportSize({width:320,height:800});await page.goto("/import-export");
 const dialog=page.getByRole("dialog",{name:"Import transactions",exact:true});
 async function preview(){await page.getByRole("button",{name:"Import transactions",exact:true}).click();await dialog.getByLabel("Account or credit card").selectOption("1");await dialog.getByLabel("Transaction or statement CSV").setInputFiles({name:"formatting.csv",mimeType:"text/csv",buffer:Buffer.from("\uFEFF date ,description,merchant,type,amount,\n2025-04-10,Shop,City,refund,12.34,\n")});await dialog.getByRole("button",{name:"Import transactions",exact:true}).click();await expect(dialog.getByRole("heading",{name:"Review formatting changes"})).toBeFocused();}
 await preview();await expect(dialog).toContainText("2025-04-10");await expect(dialog).toContainText("Shop, City");await expect(dialog).toContainText("12.34");await reviewDialog(dialog);await reviewFocusLoop(page,dialog);await page.keyboard.press("Escape");expect(confirmed).toBe(0);
 await preview();await dialog.getByRole("button",{name:"Confirm formatting and import",exact:true}).focus();await page.keyboard.press("Enter");await expect(dialog).not.toBeVisible();expect(previews).toBe(2);expect(confirmed).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test("uploaded statement removal confirms, cancels safely and protects imported rows (mocked API)",async({page})=>{
 await importWorkspace(page,true);let removed=false,removals=0,protectedUpload=false;
 const filename="unapproved-"+"long-".repeat(20)+".csv";
 await page.route("**/api/statements",async route=>{
  await route.fulfill({json:removed?[]:[{id:1,account_id:1,account_name:"Daily bank",filename,created_at:"2025-04-12",rows:1,imported:protectedUpload?1:0,matched:0,needs_review:protectedUpload?0:1,status:protectedUpload?"imported":"needs_attention",error:""}]});
 });
 await page.route("**/api/statements/1",async route=>{
  if(route.request().method()==="POST"){expect(route.request().postDataJSON()).toEqual({action:"remove",version:"remove-v1"});removals++;removed=true;await route.fulfill({json:{ok:true}});return;}
  await route.fulfill({json:{id:1,account_id:1,account_name:"Daily bank",account_type:"bank",filename,status:protectedUpload?"imported":"needs_attention",version:"remove-v1",discrepancies:[],reconciliation:null,entries:[{id:1,index:0,action:protectedUpload?"import":null,row:null,raw:{},blockers:[],candidates:[],warnings:"Invalid calendar date"}]}});
 });
 await page.setViewportSize({width:320,height:800});await page.goto("/import-export?tab=history&batch=1&account=1");
 const opener=page.getByRole("button",{name:"Remove "+filename,exact:true}),dialog=page.getByRole("dialog",{name:"Remove uploaded statement?",exact:true});
 await opener.focus();await page.keyboard.press("Enter");await expect(dialog.getByRole("button",{name:"Remove statement permanently"})).toBeEnabled();await reviewDialog(dialog);await reviewFocusLoop(page,dialog);
 await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();expect(removals).toBe(0);
 protectedUpload=true;await opener.click();await expect(dialog.getByRole("alert")).toContainText("Only unapproved uploads can be removed");await expect(dialog.getByRole("button",{name:"Remove statement permanently"})).toBeDisabled();await dialog.getByRole("button",{name:"Cancel",exact:true}).click();expect(removals).toBe(0);
 protectedUpload=false;await opener.click();await expect(dialog.getByRole("button",{name:"Remove statement permanently"})).toBeEnabled();await dialog.getByRole("button",{name:"Remove statement permanently"}).focus();await page.keyboard.press("Enter");
 await expect(dialog).not.toBeVisible();await expect(page).toHaveURL(/tab=history&account=1$/);await expect(page.locator("#import-result")).toHaveText("Uploaded statement removed. Ledger transactions unchanged.");await expect(page.locator("#import-result")).toBeFocused();await expect(opener).toHaveCount(0);expect(removals).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
