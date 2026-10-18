import {test,expect} from "@playwright/test";
import {reviewDialog,reviewFocusLoop} from "./fixtures/accessibility";
import {importWorkspace} from "./fixtures/transaction-imports";
import {readFile} from "node:fs/promises";
import {parseCreditCardStatementCsv} from "../src/lib/credit-card-csv";

test("old upload URLs redirect into Import & Export; Transactions keeps only ledger scope (mocked API)",async({page})=>{
 await importWorkspace(page,true);await page.setViewportSize({width:320,height:700});
 for(const path of ["/imports?statement=1&account=1&upload=1","/statements?statement=1&account=1","/transactions?batch=1&account=1&upload=1"]){
  await page.goto(path);await expect(page).toHaveURL(/\/import-export\?/);await expect(page).toHaveURL(/batch=1/);await expect(page).toHaveURL(/tab=history/);await expect(page).toHaveURL(/account=1/);await expect(page).not.toHaveURL(/upload=/);await expect(page.getByRole("heading",{name:"Import & Export",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"mixed.csv",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/reconcil|allocat|Approve/})).toHaveCount(0);
 }
 await page.goto("/transactions?batch=1&account=1");await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();await page.getByRole("combobox",{name:"Account",exact:true}).selectOption("2");await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();await expect(page).toHaveURL(/\/transactions\?account=2&period=all$/);
 await expect(page.getByRole("link",{name:"Imports",exact:true})).toHaveCount(0);await expect(page.getByRole("link",{name:"Bank Statements",exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:/sample statements/})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("sole statement uploader preserves legacy account context without retired dialogs (mocked API)",async({page})=>{
 const fixture=await importWorkspace(page,true);const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.setViewportSize({width:320,height:800});
 await page.goto("/accounts/2");await page.getByRole("link",{name:"Import statements",exact:true}).focus();await page.keyboard.press("Enter");await expect(page.getByRole("combobox",{name:"Exact credit card",exact:true})).toHaveValue("2");
 for(const path of ["/imports","/imports?account=2&upload=1","/transactions?account=2&upload=1","/import-export?account=2&upload=1"]){
  await page.goto(path);await expect(page).toHaveURL(/\/import-export(?:\?|$)/);
  const importer=page.getByRole("region",{name:"Import Credit Card Statement",exact:true});await expect(importer).toHaveCount(1);await expect(importer).toBeVisible();
  if(path.includes("account=2")){await expect(page).toHaveURL(/account=2/);await expect(importer.getByRole("combobox",{name:"Exact credit card",exact:true})).toHaveValue("2");}
  await expect(page.getByRole("heading",{name:"Import transactions",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Import transactions",exact:true})).toHaveCount(0);await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(importer).toContainText("No ledger transactions, account balances or payment postings change.");
  const template=importer.getByRole("link",{name:"Download Statement CSV Template",exact:true});await template.focus();await page.keyboard.press("Tab");await expect(importer.getByRole("link",{name:"Download earlier UnionBank sample",exact:true})).toBeFocused();
  await page.getByRole("tab",{name:"Export",exact:true}).click();await expect(page.getByRole("button",{name:"Export all transactions",exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"Import history",exact:true}).click();await expect(page.getByRole("region",{name:"Transaction imports",exact:true})).toBeVisible();
 }
 await page.goto("/transactions?account=1&upload=1");await expect(page.getByRole("region",{name:"Import Credit Card Statement",exact:true})).toBeVisible();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page).toHaveURL(/account=1&tab=import$/);
 expect(fixture.requests.filter(request=>request.method!=="GET")).toEqual([]);expect(errors).toEqual([]);
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


test("remaining statement importer previews, cancels, confirms, handles errors and duplicates without ledger writes (mocked API)",async({page})=>{
 const fixture=await importWorkspace(page);const csv=await readFile(new URL("../public/credit_card_statement_import_template.csv",import.meta.url),"utf8"),preview=parseCreditCardStatementCsv(csv,{currency:"PHP"});
 let fail=true,saved=false,confirmations=0;
 await page.route("**/api/credit-card-statements",async route=>{
  if(route.request().method()!=="POST"){await route.fallback();return;}
  const body=route.request().postDataJSON();expect(body.cardId).toBe(2);expect(body.currency).toBe("PHP");
  if(fail){fail=false;await route.fulfill({status:400,json:{message:"Choose a valid statement CSV and try again."}});return;}
  if(body.confirm){confirmations++;saved=true;await route.fulfill({json:{duplicate:false,existingId:7}});return;}
  await route.fulfill({json:saved?{duplicate:true,existingId:7}:{duplicate:false,preview}});
 });
 await page.goto("/import-export?account=2&upload=1");const importer=page.getByRole("region",{name:"Import Credit Card Statement",exact:true});
 await importer.getByRole("combobox",{name:"Statement currency",exact:true}).selectOption("PHP");await importer.getByLabel("Statement CSV",{exact:true}).setInputFiles({name:"statement.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 const parse=importer.getByRole("button",{name:"Parse and preview statement",exact:true});await parse.click();await expect(importer.getByRole("alert")).toHaveText("Choose a valid statement CSV and try again.");await expect(parse).toBeEnabled();
 await parse.click();await expect(importer.getByRole("heading",{name:/Review September 2026.*3 lines/})).toBeVisible();expect(confirmations).toBe(0);
 await importer.getByRole("button",{name:"Cancel preview",exact:true}).click();await expect(importer.getByRole("region",{name:"Statement import preview",exact:true})).toHaveCount(0);expect(confirmations).toBe(0);
 await parse.click();await importer.getByRole("button",{name:"Confirm statement import",exact:true}).focus();await page.keyboard.press("Enter");await expect(importer.getByRole("status")).toContainText("Statement imported.");expect(confirmations).toBe(1);
 await importer.getByRole("button",{name:"Import another statement",exact:true}).click();await parse.click();await expect(importer.getByRole("status")).toContainText("Already imported.");await expect(importer.getByRole("link",{name:"View statement 7",exact:true})).toHaveAttribute("href","/statements?document=7");expect(confirmations).toBe(1);
 expect(fixture.requests.filter(request=>request.method!=="GET")).toEqual([]);
});
