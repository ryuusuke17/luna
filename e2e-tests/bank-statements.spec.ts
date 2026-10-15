import {test,expect} from "@playwright/test";
import {importWorkspace} from "./fixtures/transaction-imports";
import {reviewDialog} from "./fixtures/accessibility";

for(const width of [1440,390])test("transaction-first import, exceptions and original links at "+width+"px (mocked API)",async({page},testInfo)=>{
 const fixture=await importWorkspace(page);await page.setViewportSize({width,height:900});await page.goto("/import-export");
 await page.getByRole("button",{name:"Import transactions",exact:true}).focus();await page.keyboard.press("Enter");
 const dialog=page.getByRole("dialog",{name:"Import transactions"});await expect(dialog).toBeVisible();
 await dialog.getByLabel("Account or credit card").selectOption("1");
 await dialog.getByLabel("Transaction or statement CSV").setInputFiles({name:"mixed.csv",mimeType:"text/csv",buffer:Buffer.from("fixture")});
 await reviewDialog(dialog);await dialog.getByRole("button",{name:"Import transactions",exact:true}).click();
 await expect(page).toHaveURL(/import-export\?tab=history&batch=1&account=1/);await expect(page.getByRole("status").filter({hasText:"1 imported"})).toBeVisible();
 await page.getByRole("button",{name:"Resolve uncertain rows"}).click();await page.getByRole("button",{name:"Resolve row 2",exact:true}).click();
 const form=page.getByRole("form",{name:"Resolve row 2"});await form.getByLabel("Posted date").fill("2025-04-11");await form.getByRole("combobox",{name:"Type",exact:true}).selectOption("expense");
 fixture.failNextSave();await form.getByRole("button",{name:"Add transaction",exact:true}).click();await expect(page.getByRole("alert")).toContainText("could not save transaction imports");
 await expect(form.getByRole("button",{name:"Add transaction",exact:true})).toBeEnabled();
 await page.screenshot({path:testInfo.outputPath("transactions-"+width+"-exception.png"),fullPage:true});
 await form.getByRole("button",{name:"Add transaction",exact:true}).focus();await page.keyboard.press("Enter");
 await expect(page.getByRole("status").filter({hasText:"2 imported"})).toBeVisible();await expect(page.locator("#import-result")).toBeFocused();
 await expect(page.getByRole("link",{name:"Download original",exact:true}).first()).toHaveAttribute("href","/api/statements/1/download");
 await page.getByRole("link",{name:"View transactions",exact:true}).first().click();await expect(page).toHaveURL(/\/transactions\?batch=1&account=1/);
 await expect(width===1440?page.getByRole("cell",{name:"Uncategorized",exact:true}):page.getByRole("list",{name:"Posted transactions"}).getByText("Uncategorized",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Import transactions",exact:true})).toHaveCount(0);await expect(page.getByRole("region",{name:"Transaction imports",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();await page.getByRole("button",{name:"Clear all",exact:true}).click();await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();await expect(page).toHaveURL(/\/transactions\?period=all$/);
 await page.getByRole("button",{name:"Filter",exact:true}).click();await page.getByRole("combobox",{name:"Category",exact:true}).selectOption("uncategorized");await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();await expect.poll(()=>fixture.requests.filter(request=>request.path==="transactions").length).toBeGreaterThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(fixture.requests.some(request=>request.path==="statements/1"&&request.body?.action==="resolve")).toBe(true);
});
