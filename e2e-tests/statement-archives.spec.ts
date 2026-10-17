import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {importWorkspace} from "./fixtures/transaction-imports";

test("Statements header opens a cancellable, responsive upload dialog only on Statements (mocked API)",async({page},testInfo)=>{
 const state=await importWorkspace(page);let uploads=0;
 await page.route(/\/api\/statement-archives(?:\?|$)/,async route=>{
  if(route.request().method()==="POST"){uploads++;await route.fulfill({status:400,json:{message:"Choose a valid full-statement CSV."}});}
  else await route.fulfill({json:{items:[],total:0,page:1,pageSize:25,issuers:[]}});
 });
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto("/statements?account=1");
  const trigger=page.getByRole("banner").getByRole("button",{name:"Add statement",exact:true});
  await expect(trigger).toBeVisible();await expect(page.getByLabel("Statement CSV",{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`statement-page-${width}.png`),fullPage:true});
  await trigger.focus();await page.keyboard.press("Enter");
  const dialog=page.getByRole("dialog",{name:"Add statement",exact:true});
  await expect(dialog.getByLabel("Statement CSV",{exact:true})).toBeVisible();
  await expect(dialog.getByRole("combobox",{name:"Link account or card - optional",exact:true})).toHaveValue("1");
  await expect(dialog.getByRole("button",{name:"Upload statement",exact:true})).toBeDisabled();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`statement-upload-${width}.png`),fullPage:true});
  for(let index=0;index<8;index++){await page.keyboard.press("Tab");expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
  await trigger.click();await dialog.getByRole("combobox",{name:"Link account or card - optional",exact:true}).selectOption("2");
  await dialog.getByLabel("Statement CSV",{exact:true}).setInputFiles({name:"invalid.pdf",mimeType:"application/pdf",buffer:Buffer.from("fixture")});
  await dialog.getByRole("button",{name:"Upload statement",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("nonempty UTF-8 CSV");expect(uploads).toBe(0);
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/statements\?account=1$/);
  await trigger.click();await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("combobox",{name:"Link account or card - optional",exact:true})).toHaveValue("1");
  expect(await dialog.getByLabel("Statement CSV",{exact:true}).evaluate(element=>(element as HTMLInputElement).files?.length)).toBe(0);
  await dialog.getByRole("button",{name:"Close",exact:true}).click();await expect(trigger).toBeFocused();
 }
 await page.getByRole("banner").getByRole("button",{name:"Add statement",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Add statement",exact:true});
 await dialog.getByLabel("Statement CSV",{exact:true}).setInputFiles({name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from("fixture")});
 await dialog.getByRole("button",{name:"Upload statement",exact:true}).click();await expect(dialog.getByRole("alert")).toBeVisible();
 expect(uploads).toBe(1);expect(await dialog.getByLabel("Statement CSV",{exact:true}).evaluate(element=>(element as HTMLInputElement).files?.length)).toBe(1);
 await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
 await page.goto("/transactions");await page.getByRole("banner").getByRole("button",{name:"Add transaction",exact:true}).click();
 await expect(page.getByRole("dialog").getByRole("heading",{name:"Add transaction",exact:true})).toBeVisible();
 expect(state.requests.every(request=>request.method==="GET")).toBe(true);
});

test("standalone Statements, Import & Export and clean ledger (authenticated isolated real API)",async({page,baseURL},testInfo)=>{
 test.skip(!process.env.LUNA_E2E_ISOLATED_URL,"Requires an explicitly designated disposable server");
 expect(baseURL).toBe(process.env.LUNA_E2E_ISOLATED_URL);test.setTimeout(90000);
 const request=page.request,username="import_fixture",password="fixture-password-only-2026";
 const setup=await request.post("/api/auth/setup",{data:{username,password,setupToken:"isolated-fixture-setup"}});if(!setup.ok())expect(await setup.text()).toContain("Owner");
 expect((await request.post("/api/auth/login",{data:{username,password}})).ok()).toBe(true);
 const csrf=(await page.context().cookies()).find(cookie=>cookie.name==="luna_csrf")!.value,headers={"x-luna-csrf":csrf,origin:baseURL!};
 async function post(path:string,data:unknown){const result=await request.post("/api/"+path,{headers,data});expect(result.ok(),await result.text()).toBe(true);return result.json();}
 const stamp=Date.now(),account=await post("accounts",{name:"Statement reference "+stamp,type:"credit_card",creditLimit:"50000",openingDate:"2025-01-01",openingBalance:"0"});
 const before=await(await request.get("/api/export")).json(),beforeReports=await(await request.get("/api/reports?month=2026-04")).json(),beforeImports=await(await request.get("/api/statements")).json();
 delete before.exported_at;
 await page.setViewportSize({width:1440,height:1000});await page.goto("/statements");
 await expect(page.getByRole("heading",{name:"Statements",exact:true})).toBeVisible();
 await expect(page.getByText("Transactions and account balances will not change.",{exact:false})).toBeVisible();
 await expect(page.getByLabel("Statement CSV",{exact:true})).toHaveCount(0);
 await page.getByRole("banner").getByRole("button",{name:"Add statement",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"Add statement",exact:true})).toBeVisible();
 const templateDownload=page.waitForEvent("download");await page.getByRole("button",{name:"Download statement template",exact:true}).click();const sample=(await readFile((await(await templateDownload).path())!,"utf8")).replace("Statement notes,\r\n","Statement notes,Archive test "+stamp+"\r\n");
 expect(sample).toContain("Issuer,UnionBank");expect(sample).toContain("Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes");
 const filename="archive-fixture-"+stamp+".csv";
 await page.getByLabel("Statement CSV",{exact:true}).setInputFiles({name:filename,mimeType:"text/csv",buffer:Buffer.from(sample)});
 await page.getByRole("button",{name:"Upload statement",exact:true}).focus();await page.keyboard.press("Enter");
 await expect(page.getByRole("status").filter({hasText:"Statement stored."})).toBeVisible();await expect(page).toHaveURL(/statements\?document=\d+/);
 const id=new URL(page.url()).searchParams.get("document")!,detail=page.getByRole("region",{name:"Statement detail",exact:true});
 await expect(detail).toBeFocused();await expect(detail.getByRole("heading",{name:"Statement rows (5)",exact:true})).toBeVisible();
 await expect(detail.getByRole("cell",{name:"UNIQLO SM FAIRVIEW, QUEZON CITY",exact:true})).toBeVisible();await expect(detail.getByRole("combobox",{name:"Reference account",exact:true})).toHaveValue("");
 const saved=await(await request.get("/api/statement-archives/"+id)).json();expect(saved.row_count).toBe(5);expect(saved.rows.reduce((sum:number,row:{amount:number})=>sum+row.amount,0)).toBe(696183);expect(saved.summary.newCharges).toBe(1505142);expect(saved.summary.outstandingBalance).toBe(1496931);
 await detail.getByText("Reference notes (",{exact:false}).click();await expect(detail.getByText(/row charges PHP 6961.83/)).toBeVisible();
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("statements-"+width+".png"),fullPage:true});
 }
 const sourceRows=detail.getByRole("region",{name:"Statement rows",exact:true});await sourceRows.focus();await page.keyboard.press("ArrowRight");await expect.poll(()=>sourceRows.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
 const originalDownload=page.waitForEvent("download");await detail.getByRole("link",{name:"Download original CSV",exact:true}).click();const original=await originalDownload;expect(original.suggestedFilename()).toBe(filename);expect(await readFile((await original.path())!,"utf8")).toBe(sample);
 const originalResponse=await request.get("/api/statement-archives/"+id+"/download");expect(originalResponse.headers()["cache-control"]).toContain("no-store");expect(originalResponse.headers()["x-content-type-options"]).toBe("nosniff");
 expect((await request.patch("/api/statement-archives/"+id,{data:{accountId:account.id,version:saved.version}})).status()).toBe(403);
 await detail.getByRole("combobox",{name:"Reference account",exact:true}).selectOption(String(account.id));await detail.getByRole("button",{name:"Save account link",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"account link saved"})).toBeVisible();
 const linked=await(await request.get("/api/statement-archives/"+id)).json();expect(linked.account_id).toBe(account.id);expect(linked.version).not.toBe(saved.version);
 const stale=await request.patch("/api/statement-archives/"+id,{headers,data:{accountId:null,version:saved.version}});expect(stale.ok()).toBe(false);
 const repeated=await post("statement-archives",{filename:"renamed.csv",mime:"text/csv",base64:Buffer.from(sample).toString("base64"),accountId:null});expect(repeated.id).toBe(Number(id));expect(repeated.duplicate).toBe(true);expect(repeated.accountMismatch).toBe(true);expect(repeated.account_id).toBe(account.id);
 await detail.getByRole("link",{name:"View account details",exact:true}).click();await expect(page.getByRole("heading",{name:"Statement reference "+stamp,exact:true})).toBeVisible();
 await page.getByRole("tab",{name:"Statements",exact:true}).click();await expect(page).toHaveURL(new RegExp("accounts/"+account.id));await page.goBack();
 await page.getByRole("button",{name:"View statement "+id,exact:true}).click();await expect(detail).toBeFocused();
 await detail.getByRole("combobox",{name:"Reference account",exact:true}).selectOption("");await detail.getByRole("button",{name:"Save account link",exact:true}).click();await expect.poll(async()=> (await(await request.get("/api/statement-archives/"+id)).json()).account_id).toBeNull();
 await page.getByRole("combobox",{name:"Linked account",exact:true}).selectOption("unlinked");await expect(page.getByRole("button",{name:"View statement "+id,exact:true})).toBeVisible();
 await page.getByRole("combobox",{name:"Issuer",exact:true}).selectOption("UnionBank");await page.getByLabel("Statement date from",{exact:true}).fill("2026-04-01");await page.getByLabel("Statement date to",{exact:true}).fill("2026-04-30");await expect(page.getByRole("button",{name:"View statement "+id,exact:true})).toBeVisible();
 expect((await request.post("/api/statement-archives",{headers,data:{filename:"bad.csv",mime:"text/csv",base64:Buffer.from("not a statement").toString("base64")}})).ok()).toBe(false);
 expect((await request.post("/api/statement-archives",{headers,data:"x".repeat(2_670_001)})).status()).toBe(413);
 const anonymous=await page.context().browser()!.newContext({baseURL});expect((await anonymous.request.get("/api/statement-archives/"+id)).status()).toBe(401);expect((await anonymous.request.get("/api/statement-archives/"+id+"/download")).status()).toBe(401);await anonymous.close();
 const after=await(await request.get("/api/export",{maxRetries:1})).json();delete after.exported_at;expect(after).toEqual(before);expect(await(await request.get("/api/reports?month=2026-04")).json()).toEqual(beforeReports);expect(await(await request.get("/api/statements")).json()).toEqual(beforeImports);
 const apiPaths:string[]=[];page.on("request",req=>{if(req.url().includes("/api/"))apiPaths.push(new URL(req.url()).pathname);});
 await page.goto("/transactions");await expect(page.getByRole("heading",{name:"Transactions",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Import transactions",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Export all transactions",exact:true})).toHaveCount(0);await expect(page.getByRole("region",{name:"Transaction imports",exact:true})).toHaveCount(0);
 expect(apiPaths.filter(path=>/\/api\/(statements|import-history|statement-archives)/.test(path))).toEqual([]);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:testInfo.outputPath("clean-transactions-"+width+".png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.getByRole("button",{name:"Open navigation",exact:true}).click();await page.getByRole("dialog").getByRole("link",{name:"Import & Export",exact:true}).click();await expect(page.getByRole("heading",{name:"Import & Export",exact:true})).toBeVisible();
 await page.getByRole("tab",{name:"Import",exact:true}).focus();await page.keyboard.press("ArrowRight");await expect(page.getByRole("tab",{name:"Export",exact:true})).toHaveAttribute("data-state","active");
 await expect(page.getByText("Neither includes private originals",{exact:false})).toBeVisible();
 for(const format of ["Export all transactions","Export workspace records"]){const downloading=page.waitForEvent("download");await page.getByRole("button",{name:format,exact:true}).click();expect((await downloading).suggestedFilename()).toMatch(/\.(csv|json)$/);}
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:testInfo.outputPath("import-export-"+width+".png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto("/settings");await page.getByRole("tab",{name:"privacy",exact:true}).click();await expect(page.getByRole("button",{name:/^Export /})).toHaveCount(0);await page.getByRole("link",{name:"Open Import & Export",exact:true}).click();await expect(page).toHaveURL(/import-export\?tab=export/);
});
