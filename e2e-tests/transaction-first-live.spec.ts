import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

test("authenticated import, repayment, reports, exceptions, downloads and redirects (isolated real API)",async({page,baseURL},testInfo)=>{
 test.skip(!process.env.LUNA_E2E_ISOLATED_URL,"Requires an explicitly designated disposable server");
 expect(baseURL).toBe(process.env.LUNA_E2E_ISOLATED_URL);
 test.setTimeout(60000);
 const request=page.request,password="fixture-password-only-2026",username="import_fixture";
 const setup=await request.post("/api/auth/setup",{data:{username,password,setupToken:"isolated-fixture-setup"}});
 if(!setup.ok())expect(await setup.text()).toContain("Owner");
 expect((await request.post("/api/auth/login",{data:{username,password}})).ok()).toBe(true);
 const cookies=await page.context().cookies(),csrf=cookies.find(cookie=>cookie.name==="luna_csrf")!.value,headers={"x-luna-csrf":csrf,origin:baseURL!};
 async function post(path:string,data:unknown){const result=await request.post("/api/"+path,{headers,data});expect(result.ok(),await result.text()).toBe(true);const value=await result.json();if(path==="statements"&&value.preview){const confirmed=await request.post("/api/"+path,{headers,data:{...(data as Record<string,unknown>),confirmation:value.version}});expect(confirmed.ok(),await confirmed.text()).toBe(true);return confirmed.json();}return value;}
 const stamp=Date.now(),bank=(await post("accounts",{name:"Fixture bank "+stamp,type:"bank",openingDate:"2025-01-01",openingBalance:"0",liquid:true})).id;
 const card=(await post("accounts",{name:"Fixture card "+stamp,type:"credit_card",creditLimit:"50000",openingDate:"2025-01-01",openingBalance:"0"})).id;
 const categories=await (await request.get("/api/categories")).json();
 const baseline=await (await request.get("/api/reports?month=2025-04")).json();
 const cardCsv="Issuer,Fixture\nOutstanding balance,9999\nSale date,Post date,Merchant,Amount,Type,Category,Transaction notes\n,2025-04-10,Purchase,100,Expense,,\n,2025-04-11,Installment,120,Installments,,INSTALMENT 1 OF 12\n,2025-04-12,PAYMENT RECEIVED - THANK YOU,-30,,,\n,2025-04-13,Merchant credit,-3,,,\n,bad,Invalid date,1,,,\n";
 const payload={accountId:card,filename:"card-fixture-"+stamp+".csv",mime:"text/csv",base64:Buffer.from(cardCsv).toString("base64")};
 const imported=await post("statements",payload);expect(imported.imported).toBe(2);expect(imported.needsAttention).toBe(3);
 const repeat=await post("statements",payload);expect(repeat.duplicate).toBe(true);expect(repeat.imported).toBe(2);
 const bankCsv="date,description,merchant,type,amount,category,source_id,destination\n2025-04-12,Card repayment,Bank,transfer,30,,repayment-"+stamp+",Fixture card "+stamp+"\n";
 const bankImport=await post("statements",{accountId:bank,filename:"bank-fixture.csv",mime:"text/csv",base64:Buffer.from(bankCsv).toString("base64")});expect(bankImport.imported).toBe(1);
 let detail=await (await request.get("/api/statements/"+imported.id)).json();const bankDetail=await (await request.get("/api/statements/"+bankImport.id)).json();
 const decisions=[{entryId:detail.entries[2].id,action:"link",transactionId:bankDetail.entries[0].transactionId},{entryId:detail.entries[3].id,action:"import",reviewedKind:"refund",categoryId:null},{entryId:detail.entries[4].id,action:"skip",reason:"Unusable source date"}];
 const resolved=await post("statements/"+imported.id,{action:"resolve",version:detail.version,decisions});expect(resolved.needsAttention).toBe(0);expect(resolved.linked).toBe(1);
 const retry=await post("statements/"+imported.id,{action:"resolve",version:detail.version,decisions});expect(retry.duplicate).toBe(true);
 const accounts=await (await request.get("/api/accounts")).json();expect(accounts.find((item:{id:number;balance:number})=>item.id===bank).balance).toBe(-3000);expect(accounts.find((item:{id:number;balance:number})=>item.id===card).balance).toBe(-18700);
 const report=await (await request.get("/api/reports?month=2025-04")).json();expect(report.expenses-baseline.expenses).toBe(21700);expect(report.income-baseline.income).toBe(0);const uncategorizedAmount=(value:typeof report)=>value.categories.find((item:{name:string;amount:number})=>item.name==="Uncategorized")?.amount??0;expect(uncategorizedAmount(report)-uncategorizedAmount(baseline)).toBe(21700);
 const filtered=await (await request.get("/api/transactions?page=1&batch="+imported.id+"&account="+card)).json();expect(filtered.total).toBe(4);expect(filtered.items.filter((item:{kind:string})=>item.kind==="transfer")).toHaveLength(1);
 const uncategorized=await (await request.get("/api/transactions?page=1&category=uncategorized&account="+card)).json();expect(uncategorized.total).toBe(3);expect(uncategorized.items.every((item:{category_id:number|null})=>item.category_id===null)).toBe(true);
 expect(await (await request.get("/api/statements/"+imported.id+"/download")).text()).toBe(cardCsv);
 const exported=await (await request.get("/api/export?format=csv")).text();expect(exported).toContain("Installment");expect(exported).toContain("120.00");
 expect(await (await request.get("/api/categories")).json()).toEqual(categories);
 expect((await request.post("/api/statements",{data:payload})).status()).toBe(403);
 expect((await request.post("/api/statements",{headers,data:{...payload,accountId:99999999}})).status()).toBe(400);
 expect((await request.post("/api/statements/"+imported.id,{headers,data:{action:"reconcile"}})).status()).toBe(410);
 expect((await request.post("/api/statements/"+imported.id+"/payments",{headers,data:{}})).status()).toBe(410);
 const anonymous=await page.context().browser()!.newContext({baseURL});expect((await anonymous.request.get("/api/statements/"+imported.id+"/download")).status()).toBe(401);await anonymous.close();
 const pendingCsv="date,description,merchant,type,amount,category,source_id,destination\nbad,Fix this row,Cafe,expense,2,,,\nbad,Fix later row,Cafe,expense,5,,,\n";
 const pending=await post("statements",{accountId:bank,filename:"needs-attention.csv",mime:"text/csv",base64:Buffer.from(pendingCsv).toString("base64")});
 await page.setViewportSize({width:1440,height:1000});await page.goto("/imports?statement="+pending.id);await expect(page).toHaveURL(new RegExp("/import-export\\?batch="+pending.id));
 await page.getByRole("button",{name:"Resolve uncertain rows"}).click();await page.getByRole("button",{name:"Resolve row 1",exact:true}).click();
 const form=page.getByRole("form",{name:"Resolve row 1"});await form.getByLabel("Posted date").fill("2025-04-14");await form.getByRole("combobox",{name:"Type",exact:true}).selectOption("expense");
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath("authenticated-desktop.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath("authenticated-mobile.png"),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await form.getByRole("button",{name:"Add transaction",exact:true}).focus();await page.keyboard.press("Enter");await expect(page.getByRole("status").filter({hasText:"1 imported"})).toBeVisible();
 await expect(page.locator("#import-result")).toBeFocused();detail=await (await request.get("/api/statements/"+pending.id)).json();expect(detail.entries[0].action).toBe("import");
 const downloadPromise=page.waitForEvent("download");await page.getByRole("link",{name:"Download original",exact:true}).first().click();expect((await downloadPromise).suggestedFilename()).toContain("csv");
 await page.getByRole("button",{name:"Resolve row 2",exact:true}).click();const next=page.getByRole("form",{name:"Resolve row 2"});await next.getByLabel("Posted date").fill("2025-04-15");
 await next.getByRole("button",{name:"Save fields / refresh matches",exact:true}).click();await expect(next).not.toBeVisible();detail=await (await request.get("/api/statements/"+pending.id)).json();expect(detail.entries[1].action).toBeNull();expect(detail.entries[1].row.amount).toBe(500);
 const continuation=page.getByRole("button",{name:"Continue import",exact:true});await expect(continuation).toBeEnabled();await continuation.focus();await page.keyboard.press("Enter");await expect(page.getByRole("status").filter({hasText:"2 imported"})).toBeVisible();
 detail=await (await request.get("/api/statements/"+pending.id)).json();expect(detail.entries[1].action).toBe("import");

 await page.goto("/statements?statement="+imported.id);await expect(page).toHaveURL(new RegExp("/import-export\\?batch="+imported.id));
 const overlap=await post("statements",{accountId:bank,filename:"overlap.csv",mime:"text/csv",base64:Buffer.from("date,description,merchant,type,amount,category,source_id,destination\n2025-04-15,Fix later row,Cafe,expense,5,,,\n").toString("base64")});expect(overlap.needsAttention).toBe(1);
 await page.goto("/import-export?tab=history&batch="+overlap.id);await page.getByRole("button",{name:"Resolve uncertain rows"}).click();await page.getByRole("button",{name:"Resolve row 1",exact:true}).click();const linkForm=page.getByRole("form",{name:"Resolve row 1"});
 await linkForm.getByRole("combobox",{name:"Possible existing transaction",exact:true}).selectOption(String(detail.entries[1].transactionId));await linkForm.getByRole("button",{name:"Link existing transaction",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"1 already imported"})).toBeVisible();
 expect((await (await request.get("/api/accounts")).json()).find((item:{id:number;balance:number})=>item.id===bank).balance).toBe(-3700);
 await page.goto("/transactions?account="+bank);await page.getByRole("button",{name:"Add transaction",exact:true}).last().click();
 const manual=page.getByRole("dialog",{name:"Add transaction",exact:true}),description="Optional category "+stamp;
 await manual.getByLabel("Full amount · PHP").fill("4");await manual.getByRole("combobox",{name:"Account",exact:true}).selectOption(String(bank));await manual.getByRole("textbox",{name:"Description",exact:true}).fill(description);
 await manual.getByRole("tab",{name:"Category",exact:true}).click();await expect(manual.getByRole("combobox",{name:"Category - optional",exact:true})).toHaveValue("");await manual.getByRole("button",{name:"Save transaction"}).click();await expect(manual).not.toBeVisible();
 async function manualRecord(){const response=await request.get("/api/transactions?page=1&account="+bank+"&search="+encodeURIComponent(description));return (await response.json()).items[0];}
 await expect.poll(async()=>(await manualRecord())?.category_id).toBeNull();
 const expenseCategory=categories.find((category:{id:number;kind:string})=>category.kind==="expense");expect(expenseCategory).toBeDefined();
 for(const category of [String(expenseCategory.id),""]){
  await page.getByRole("button",{name:new RegExp("^View "+description+" on ")}).click();await page.getByRole("button",{name:"Edit transaction",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"Edit transaction",exact:true});await editor.getByRole("tab",{name:"Category",exact:true}).click();await editor.getByRole("combobox",{name:"Category - optional",exact:true}).selectOption(category);await editor.getByRole("button",{name:"Save transaction"}).click();await expect(editor).not.toBeVisible();
  await expect.poll(async()=>(await manualRecord())?.category_id).toBe(category?Number(category):null);
 }
 await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("combobox",{name:"Category",exact:true}).selectOption("uncategorized");await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();await expect(page.getByRole("list",{name:"Posted transactions"}).getByRole("listitem").filter({hasText:description})).toBeVisible();

 const importedInstallments=await (await request.get("/api/transactions?page=1&account="+card+"&kind=installment")).json();
 expect(importedInstallments.total).toBe(1);expect(importedInstallments.items[0].merchant).toBe("Installment");expect(importedInstallments.items[0].description).toBe("");expect(importedInstallments.items[0].kind).toBe("expense");
 const beforeInstallment=await (await request.get("/api/reports?month=2025-04")).json();
 await page.goto("/transactions?account="+bank);await page.getByRole("button",{name:"Add transaction",exact:true}).last().click();
 const installmentDialog=page.getByRole("dialog",{name:"Add transaction",exact:true});
 const typeOptions=installmentDialog.getByRole("combobox",{name:"Type",exact:true});await expect(typeOptions.locator("option")).toHaveText(["Expense","Installments","Income","Refund","Transfer"]);
 await typeOptions.selectOption("installment");await installmentDialog.getByLabel("Posted date").fill("2025-04-16");await installmentDialog.getByLabel("Full amount · PHP").fill("14.35");await installmentDialog.getByRole("combobox",{name:"Account",exact:true}).selectOption(String(bank));
 const installmentMerchant="Fixture Electronics, Quezon City "+stamp;
 await installmentDialog.getByRole("textbox",{name:"Merchant",exact:true}).fill(installmentMerchant);await installmentDialog.getByRole("textbox",{name:"Description",exact:true}).fill("(2/12) Monthly laptop payment");
 await installmentDialog.getByRole("tab",{name:"Type",exact:true}).focus();await page.keyboard.press("ArrowRight");await expect(installmentDialog.getByRole("tab",{name:"Category",exact:true})).toHaveAttribute("aria-selected","true");
 await installmentDialog.getByRole("combobox",{name:"Category - optional",exact:true}).selectOption(String(expenseCategory.id));
 for(const [device,viewport] of [["desktop",{width:1440,height:1000}],["tablet",{width:834,height:1112}],["mobile",{width:390,height:844}]] as const){await page.setViewportSize(viewport);await page.screenshot({path:testInfo.outputPath(`category-form-${device}.png`),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await installmentDialog.getByRole("tab",{name:"Type",exact:true}).click();await expect(installmentDialog.getByRole("combobox",{name:"Type",exact:true})).toHaveValue("installment");
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:testInfo.outputPath("type-category-form-desktop.png"),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath("type-category-form-mobile.png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await installmentDialog.getByRole("button",{name:"Save transaction"}).click();await expect(installmentDialog).not.toBeVisible();
 await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("combobox",{name:"Type",exact:true}).selectOption("installment");await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 const installmentRow=page.getByRole("row").filter({hasText:installmentMerchant});await expect(installmentRow).toBeVisible();await expect(installmentRow).toContainText("Installments");
 await expect(page.getByRole("columnheader",{name:"Merchant",exact:true})).toBeVisible();await expect(page.getByRole("columnheader",{name:"Type",exact:true})).toHaveCount(1);await expect(page.getByRole("columnheader",{name:"Category",exact:true})).toHaveCount(0);await expect(page.getByRole("columnheader",{name:"Type / category",exact:true})).toHaveCount(0);await expect(installmentRow.getByRole("cell").nth(2)).toContainText(expenseCategory.name);
 const afterInstallment=await (await request.get("/api/reports?month=2025-04")).json();expect(afterInstallment.expenses-beforeInstallment.expenses).toBe(1435);expect(afterInstallment.income).toBe(beforeInstallment.income);
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:testInfo.outputPath("transaction-types-desktop.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath("transaction-types-mobile.png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const installmentItem=page.getByRole("list",{name:"Posted transactions"}).getByRole("listitem").filter({hasText:installmentMerchant});await expect(installmentItem).toContainText("Installments");await expect(installmentItem).toContainText(expenseCategory.name);
 await installmentItem.getByRole("button",{name:/^View /}).click();const installmentDetail=page.getByRole("dialog");await expect(installmentDetail.getByText(installmentMerchant,{exact:true}).first()).toBeVisible();await installmentDetail.getByRole("button",{name:"Edit transaction",exact:true}).click();
 const installmentEditor=page.getByRole("dialog",{name:"Edit transaction",exact:true});await expect(installmentEditor.getByRole("combobox",{name:"Type",exact:true})).toHaveValue("installment");await installmentEditor.getByRole("tab",{name:"Category",exact:true}).click();await expect(installmentEditor.getByRole("combobox",{name:"Category - optional",exact:true})).toHaveValue(String(expenseCategory.id));await installmentEditor.getByRole("combobox",{name:"Category - optional",exact:true}).selectOption("");await installmentEditor.getByRole("tab",{name:"Type",exact:true}).click();await installmentEditor.getByRole("combobox",{name:"Type",exact:true}).selectOption("expense");await installmentEditor.getByRole("button",{name:"Save transaction"}).click();await expect(installmentEditor).not.toBeVisible();
 await expect(installmentItem).not.toBeVisible();
 await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();const filters=page.getByRole("dialog",{name:"Filter transactions"});await filters.getByRole("combobox",{name:"Type",exact:true}).selectOption("expense");await filters.getByRole("button",{name:"Apply",exact:true}).click();await expect(page).toHaveURL(/kind=expense/);await expect(installmentItem).toContainText("Expense");
 expect((await (await request.get("/api/reports?month=2025-04")).json()).expenses).toBe(afterInstallment.expenses);
 const editedRecord=(await (await request.get("/api/transactions?page=1&account="+bank+"&search="+encodeURIComponent(installmentMerchant))).json()).items[0];expect(editedRecord.is_installment).toBe(0);expect(editedRecord.category_id).toBeNull();
 await page.goto("/import-export?account="+card);const importer=page.getByRole("region",{name:"Import Credit Card Statement",exact:true});
 const downloading=page.waitForEvent("download");await importer.getByRole("link",{name:"Download Statement CSV Template",exact:true}).click();const download=await downloading,template=await readFile((await download.path())!,"utf8");expect(template).toContain("Sale date,Post date,Merchant,Amount,Category,Transaction notes,Transaction type");
 const templateCard=(await post("accounts",{name:"Template card "+stamp,type:"credit_card",creditLimit:"50000",openingDate:"2025-01-01",openingBalance:"0"})).id;
 const templateImport=await post("statements",{accountId:templateCard,filename:"downloaded-template.csv",mime:"text/csv",base64:Buffer.from(template).toString("base64")});expect(templateImport.imported).toBe(2);expect(templateImport.needsAttention).toBe(1);
 const templateRows=await (await request.get("/api/transactions?page=1&account="+templateCard)).json();expect(templateRows.items.find((item:{merchant:string})=>item.merchant.includes("(01/12)")).is_installment).toBe(1);expect(templateRows.items.every((item:{category_id:number|null})=>item.category_id===null)).toBe(true);

});


test("historical card extension and formatting preview preserve source dates and post once (isolated real API)",async({page,baseURL})=>{
 test.skip(!process.env.LUNA_E2E_ISOLATED_URL,"Requires an explicitly designated disposable server");expect(baseURL).toBe(process.env.LUNA_E2E_ISOLATED_URL);
 const request=page.request,username="import_fixture",password="fixture-password-only-2026";
 await request.post("/api/auth/setup",{data:{username,password,setupToken:"isolated-fixture-setup"}});expect((await request.post("/api/auth/login",{data:{username,password}})).ok()).toBe(true);
 const csrf=(await page.context().cookies()).find(cookie=>cookie.name==="luna_csrf")!.value,headers={"x-luna-csrf":csrf,origin:baseURL!};
 async function post(path:string,data:unknown){const response=await request.post("/api/"+path,{headers,data});expect(response.ok(),await response.text()).toBe(true);return response.json();}
 const today=new Date().toISOString().slice(0,10),stamp=Date.now(),card=(await post("accounts",{name:"Historical fixture "+stamp,type:"credit_card",creditLimit:"50000",openingDate:today,openingBalance:"0"})).id;
 const text='\uFEFF Sale   date , Posting   date , Merchant , Amount , Type , Category , Transaction notes ,\r\n,2025-04-10,"Shop, City",12.34,Expense,,,\r\n',payload={accountId:card,filename:"historical-fixture.csv",mime:"text/csv",base64:Buffer.from(text).toString("base64")};
 const preview=await post("statements",payload);expect(preview.preview).toBe(true);expect(preview.changes).toContain("Trimmed/collapsed header whitespace");
 const uploads=await (await request.get("/api/statements")).json();expect(uploads.some((s:{account_id:number})=>s.account_id===card)).toBe(false);
 const imported=await post("statements",{...payload,confirmation:preview.version});expect(imported.imported).toBe(0);
 let detail=await (await request.get("/api/statements/"+imported.id)).json();expect(detail.entries[0].row.date).toBe("2025-04-10");expect(detail.entries[0].blockers[0].code).toBe("before_history");
 const version=detail.version,entryId=detail.entries[0].id;
 await page.setViewportSize({width:320,height:800});await page.goto("/import-export?tab=history&batch="+imported.id+"&account="+card);
 const opener=page.getByRole("button",{name:"Extend account history",exact:true});await opener.focus();await page.keyboard.press("Enter");const dialog=page.getByRole("dialog",{name:"Extend account history?"});await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();
 expect((await (await request.get("/api/accounts")).json()).find((a:{id:number})=>a.id===card).opening_date).toBe(today);
 await opener.click();await dialog.getByRole("button",{name:"Confirm history extension",exact:true}).click();await expect(page.locator("#import-result")).toContainText("History extended. Continue import to add eligible transactions.");
 let current=(await (await request.get("/api/accounts")).json()).find((a:{id:number})=>a.id===card);expect(current.balance).toBe(0);expect(current.opening_date).toBe("2025-04-10");
 const stale=await request.post("/api/statements/"+imported.id,{headers,data:{action:"extend-history",version}});expect(stale.status()).toBe(400);expect(await stale.text()).toContain("Reload");
 await page.getByRole("button",{name:"Continue import",exact:true}).click();await expect(page.locator("#import-result")).toContainText("1 imported");
 detail=await (await request.get("/api/statements/"+imported.id)).json();expect(detail.entries[0].id).toBe(entryId);expect(detail.entries[0].row.date).toBe("2025-04-10");expect(detail.entries[0].action).toBe("import");
 await post("statements/"+imported.id,{action:"continue",version:detail.version});expect((await post("statements",{...payload,confirmation:(await post("statements",{...payload,preview:true})).version})).duplicate).toBe(true);
 current=(await (await request.get("/api/accounts")).json()).find((a:{id:number})=>a.id===card);expect(current.balance).toBe(-1234);expect(await (await request.get("/api/statements/"+imported.id+"/download")).text()).toBe(text);
 const ledger=await (await request.get("/api/transactions?account="+card+"&period=all")).json();expect(ledger.total).toBe(1);expect(ledger.items[0].posted_date).toBe("2025-04-10");expect(ledger.items[0].amount).toBe(1234);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
