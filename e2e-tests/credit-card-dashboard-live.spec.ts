import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

test("issued-statement importer to dashboard: full fixture, no ledger changes, responsive evidence",async({page,baseURL},testInfo)=>{
 test.skip(!process.env.LUNA_E2E_ISOLATED_URL,"Requires an explicitly designated disposable server; never run against a production workspace");
 expect(baseURL).toBe(process.env.LUNA_E2E_ISOLATED_URL);test.setTimeout(60000);
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
 await page.goto("/statements");const latest=await get("credit-card-dashboard");
 expect(latest.selectedMonth).toBeNull();await expect(page.getByRole("combobox",{name:"Issue month",exact:true})).toHaveValue("");
 await page.goto(`/statements?month=2026-04&issuer=UnionBank&cards=${card.id}`);
 const table=page.getByRole("region",{name:"Unified statement transactions",exact:true});await expect(table.getByRole("row")).toHaveCount(14);await expect(table).toContainText("2026-03-07");await expect(table).toContainText("April 2026");await expect(table).toContainText("Unknown");
 await page.getByLabel("Merchant / notes",{exact:true}).fill("UNIQLO");await expect(table.getByRole("row")).toHaveCount(2);
 await page.getByLabel("Merchant / notes",{exact:true}).fill("");await expect(table.getByRole("row")).toHaveCount(14);
 await page.getByRole("combobox",{name:"Line type",exact:true}).selectOption("credit");await expect(table.getByRole("row")).toHaveCount(2);await expect(table).toContainText("BDO BILLS PAYMENT -CASH");await expect(table).toContainText("In-cycle evidence; included in source balance");await page.getByRole("combobox",{name:"Line type",exact:true}).selectOption("");
 for(const [device,viewport] of [["desktop",{width:1440,height:1000}],["tablet",{width:834,height:1112}],["mobile",{width:390,height:844}],["narrow",{width:320,height:740}]] as const){await page.setViewportSize(viewport);await expect(table.getByRole("row")).toHaveCount(14);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath(`dashboard-${device}.png`),fullPage:true});}
 await page.getByRole("combobox",{name:"Issue month",exact:true}).selectOption("");await expect(page).not.toHaveURL(/month=/);
 await page.getByRole("button",{name:`View statement #${id}`,exact:true}).click();const detail=page.getByRole("region",{name:"Credit card statement detail",exact:true});await expect(detail).toBeVisible();await expect(detail).toBeFocused();await expect(detail.getByRole("link",{name:"Download immutable original CSV",exact:true})).toBeVisible();await expect(detail.getByRole("region",{name:"Imported statement lines",exact:true}).getByRole("row")).toHaveCount(14);
 expect(await (await request.get(`/api/credit-card-statements/${id}/download`)).body()).toEqual(fixture);
 await detail.getByRole("button",{name:"Close statement",exact:true}).click();await expect(page.getByRole("button",{name:`View statement #${id}`,exact:true})).toBeFocused();
 await page.getByRole("button",{name:"Clear all filters",exact:true}).click();await expect(page.getByRole("combobox",{name:"Issuer",exact:true})).toHaveValue("");await expect(page.getByRole("combobox",{name:"Card",exact:true})).toHaveValue("");
 const missing=await get(`credit-card-dashboard?month=2026-04&cards=${second.id}`);expect(missing.metrics).toEqual([]);expect(missing.cards[0].selectedMonth).toBeNull();
 expect((await request.post("/api/credit-card-statements",{data:{}})).status()).toBe(403);
 const anonymous=await page.context().browser()!.newContext({baseURL});expect((await anonymous.request.get("/api/credit-card-dashboard")).status()).toBe(401);expect((await anonymous.request.get(`/api/credit-card-statements/${id}/download`)).status()).toBe(401);await anonymous.close();
 expect((await get("accounts")).map(({display,...record}:Record<string,unknown>)=>record)).toEqual(baseline.accounts.map(({display,...record}:Record<string,unknown>)=>record));expect(await get("transactions?page=1&period=all")).toEqual(baseline.transactions);
});
