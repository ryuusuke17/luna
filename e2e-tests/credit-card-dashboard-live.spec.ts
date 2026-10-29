import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

test("issued-statement importer to dashboard: full fixture, no ledger changes, responsive evidence",async({page,baseURL},testInfo)=>{
 test.skip(!process.env.LUNA_E2E_ISOLATED_URL,"Requires an explicitly designated disposable server; never run against a production workspace");
 expect(baseURL).toBe(process.env.LUNA_E2E_ISOLATED_URL);test.setTimeout(90000);
 const request=page.request,credentials={username:"import_fixture",password:"fixture-password-only-2026"};
 const setup=await request.post("/api/auth/setup",{data:{...credentials,setupToken:"isolated-fixture-setup"}});
 if(!setup.ok())expect(await setup.text()).toContain("Owner");
 expect((await request.post("/api/auth/login",{data:credentials})).ok()).toBe(true);
 const csrf=(await page.context().cookies()).find(c=>c.name==="luna_csrf")!.value,headers={"x-luna-csrf":csrf,origin:baseURL!};
 async function get(path:string){const response=await request.get(`/api/${path}`);expect(response.ok(),await response.text()).toBe(true);return response.json();}
 async function post(path:string,data:unknown){const response=await request.post(`/api/${path}`,{headers,data});expect(response.ok(),await response.text()).toBe(true);return response.json();}
 const stamp=Date.now(),card=await post("accounts",{name:`Statement fixture ${stamp}`,type:"credit_card",openingDate:"2026-01-01",openingBalance:"0",creditLimit:"164500.00",issuer:"UnionBank",last4:"4321"});
 const second=await post("accounts",{name:`Missing fixture ${stamp}`,type:"credit_card",openingDate:"2026-01-01",openingBalance:"0",creditLimit:"50000.00",issuer:"UnionBank",last4:"8765"});
 const baseline={accounts:await get("accounts"),transactions:await get("transactions?page=1&period=all")};
 const initial=await get("credit-card-dashboard");
 await page.setViewportSize({width:1440,height:1000});await page.goto("/statements");
 await expect(page.getByRole("heading",{name:"Statements",exact:true})).toBeVisible();
 if(!initial.diagnostics.issued.active)await expect(page.getByText(/No issued statements match this selection/)).toBeVisible();
 for(const [device,viewport] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]] as const){await page.setViewportSize(viewport);await page.screenshot({path:testInfo.outputPath(`pre-import-${device}.png`),fullPage:true});}
 await page.goto("/import-export?tab=import");const importer=page.getByRole("region",{name:"Import Credit Card Statement",exact:true});
 await importer.getByLabel("Exact credit card").selectOption(String(card.id));await importer.getByLabel("Statement currency").selectOption("PHP");
 const fixture=await readFile(new URL("../public/unionbank_april_2026_statement_sample.csv",import.meta.url));
 await importer.getByLabel("Statement CSV",{exact:true}).setInputFiles({name:"unionbank_april_2026_statement_sample.csv",mimeType:"text/csv",buffer:fixture});
 await importer.getByRole("button",{name:"Parse and preview statement",exact:true}).click();await expect(importer.getByRole("heading",{name:/Review April 2026.*13 lines/})).toBeVisible();
 expect((await get("credit-card-dashboard")).diagnostics.issued.total).toBe(initial.diagnostics.issued.total);
 if(await importer.getByLabel("Review explanation",{exact:true}).isVisible()){await importer.getByRole("checkbox",{name:"I reviewed the balance, issuer and destination warnings."}).check();await importer.getByLabel("Review explanation",{exact:true}).fill("Explicit independent fixture import to a new disposable test card");}
 await importer.getByRole("button",{name:"Confirm statement import",exact:true}).click();
 await expect(importer.getByRole("status")).toContainText("Statement imported.");
 const imported=await get(`credit-card-dashboard?month=2026-04&cards=${card.id}`),id=imported.items[0].id;
 expect(imported.activity.total).toBe(13);expect(imported.metrics[0].originalBalance).toBe(1496931);expect(imported.metrics[0].remaining).toBe(1496931);expect(imported.metrics[0].applied).toBe(0);
 const exact=await get(`credit-card-dashboard?issuedStatement=${id}&cards=${card.id}`);
 expect(exact.activity.items.map((line:{id:number})=>line.id)).toEqual(imported.activity.items.map((line:{id:number})=>line.id));
 expect(exact.activity.items.every((line:{ledgerTransactionId:number|null})=>line.ledgerTransactionId===null)).toBe(true);
 expect((await get(`transactions?issuedStatement=${id}&page=1`)).total).toBe(0);
  expect((await get(`transactions?scope=manual-non-card&account=${card.id}&page=1`)).total).toBe(0);
  await page.goto(`/transactions?account=${card.id}&dateMode=statement&issuedStatement=${id}`);
  await expect(page.getByRole("region",{name:"Unified statement transactions",exact:true})).toHaveCount(0);
  await expect(page).not.toHaveURL(/issuedStatement/);
 let membership:string[]=[];
  for(const path of [`/accounts/${card.id}?account=${card.id}&dateMode=statement&issuedStatement=${id}`,`/statements?activityStatement=${id}`]){
  await page.goto(path);const source=page.getByRole("region",{name:"Unified statement transactions",exact:true});
  await expect(source.locator("tbody tr")).toHaveCount(13);await expect(source.getByText("Source only",{exact:true})).toHaveCount(13);
  const merchants=await source.locator("tbody tr td:nth-child(3)").allTextContents();if(membership.length)expect(merchants).toEqual(membership);else membership=merchants;
 }
  await page.goto("/statements");const latest=await get("credit-card-dashboard");
  expect(latest.selectedMonth).toBeNull();await expect(page.getByRole("tab",{name:"Statement transactions",exact:true})).toHaveAttribute("data-state","active");
  await page.goto(`/statements?tab=statements`);
  await page.getByRole("button",{name:/More statement filters/}).click();
  const statementFilters=page.getByRole("dialog");
  await statementFilters.getByRole("combobox",{name:"Issue month",exact:true}).selectOption("2026-04");
  await statementFilters.getByRole("combobox",{name:"Issuer",exact:true}).selectOption("UnionBank");
  await statementFilters.getByRole("combobox",{name:"Card",exact:true}).selectOption(String(card.id));
  await statementFilters.getByRole("button",{name:"Apply",exact:true}).click();
  const issued=page.getByRole("region",{name:"Issued statements",exact:true});
  await expect(issued.locator("article")).toHaveCount(1);await expect(issued).toContainText("April 2026");
  await expect(page).toHaveURL(/tab=statements/);
  await page.goto(`/statements?month=2026-04&issuer=UnionBank&cards=${card.id}&activityMonth=2026-04&activityCard=${card.id}&activityStatement=${id}`);
 const table=page.getByRole("region",{name:"Unified statement transactions",exact:true});await expect(table.getByRole("row")).toHaveCount(14);await expect(table).toContainText("2026-03-07");await expect(table).toContainText("April 2026");await expect(table).toContainText("Unknown");
 await page.getByLabel("Merchant / notes",{exact:true}).fill("UNIQLO");await expect(table.getByRole("row")).toHaveCount(2);
 await page.getByLabel("Merchant / notes",{exact:true}).fill("");await expect(table.getByRole("row")).toHaveCount(14);
  await page.getByRole("button",{name:"More activity filters",exact:true}).click();
  const activityFilters=page.getByRole("dialog");
  await activityFilters.getByRole("combobox",{name:"Line type",exact:true}).selectOption("credit");
  await activityFilters.getByRole("button",{name:"Apply",exact:true}).click();
  await expect(table.getByRole("row")).toHaveCount(2);await expect(table).toContainText("BDO BILLS PAYMENT -CASH");await expect(table).toContainText("In-cycle evidence; included in source balance");
  await page.getByRole("tab",{name:"Statements",exact:true}).click();
  await expect(page.getByRole("region",{name:"Issued statements",exact:true}).locator("article")).toHaveCount(1);
  await page.getByRole("tab",{name:"Statement transactions",exact:true}).click();
  await page.getByRole("button",{name:/More activity filters/}).click();const clearActivity=page.getByRole("dialog");await clearActivity.getByRole("button",{name:"Reset",exact:true}).click();await expect(table.getByRole("row")).toHaveCount(14);
 for(const [device,viewport] of [["desktop",{width:1440,height:1000}],["tablet",{width:834,height:1112}],["mobile",{width:390,height:844}],["narrow",{width:320,height:740}]] as const){await page.setViewportSize(viewport);await expect(table.getByRole("row")).toHaveCount(14);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath(`dashboard-${device}.png`),fullPage:true});}
  await page.getByRole("combobox",{name:"Issue month",exact:true}).selectOption("");await expect(page).not.toHaveURL(/activityMonth=/);
  await page.getByRole("tab",{name:"Statements",exact:true}).click();
  await expect(page.getByRole("region",{name:"Issued statements",exact:true}).locator("article")).toHaveCount(1);
  await page.getByRole("button",{name:/More statement filters/}).click();
  const statementReset=page.getByRole("dialog");await statementReset.getByRole("button",{name:"Reset",exact:true}).click();await statementReset.getByRole("button",{name:"Apply",exact:true}).click();
  await page.goto(`/statements?tab=statements&issuedStatement=${id}`);
  await page.getByRole("button",{name:`View statement #${id}`,exact:true}).click();
  await expect(page.getByRole("tab",{name:"Statement transactions",exact:true})).toBeFocused();
  await expect(page.getByRole("combobox",{name:"Statement",exact:true})).toHaveValue(String(id));
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(page.getByRole("region",{name:"Credit card statement detail",exact:true})).toHaveCount(0);
  await page.goto(`/accounts/${card.id}?account=${card.id}&dateMode=statement&issuedStatement=${id}`);
  await page.getByRole("button",{name:/^View details for /}).first().click();
  await page.getByRole("dialog").getByRole("link",{name:"Open statement",exact:true}).click();
  const detail=page.getByRole("region",{name:"Credit card statement detail",exact:true});await expect(detail).toBeVisible();await expect(detail).toBeFocused();await expect(detail.getByRole("link",{name:"Download immutable original CSV",exact:true})).toBeVisible();await expect(detail.getByRole("region",{name:"Imported statement lines",exact:true}).getByRole("row")).toHaveCount(14);
 expect(await (await request.get(`/api/credit-card-statements/${id}/download`)).body()).toEqual(fixture);
  await detail.getByRole("button",{name:"Close statement",exact:true}).click();await expect(detail).toHaveCount(0);
  await expect(page.getByRole("tab",{name:"Statement transactions",exact:true})).toHaveAttribute("data-state","active");
 const missing=await get(`credit-card-dashboard?month=2026-04&cards=${second.id}`);expect(missing.metrics).toEqual([]);expect(missing.cards[0].selectedMonth).toBeNull();
 expect((await request.post("/api/credit-card-statements",{data:{}})).status()).toBe(403);
 const anonymous=await page.context().browser()!.newContext({baseURL});expect((await anonymous.request.get("/api/credit-card-dashboard")).status()).toBe(401);expect((await anonymous.request.get(`/api/credit-card-statements/${id}/download`)).status()).toBe(401);await anonymous.close();
 expect((await get("accounts")).map(({display,...record}:Record<string,unknown>)=>record)).toEqual(baseline.accounts.map(({display,...record}:Record<string,unknown>)=>record));expect(await get("transactions?page=1&period=all")).toEqual(baseline.transactions);
});
