import {test,expect} from "@playwright/test";
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
