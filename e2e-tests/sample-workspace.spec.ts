import {test,expect} from "@playwright/test";
import {importWorkspace} from "./fixtures/transaction-imports";

test("legacy entry points retain transaction links, no reset or statement allocation controls (mocked API)",async({page})=>{
 await importWorkspace(page,true);await page.goto("/imports?legacy=csv&importId=7&account=1");
 await expect(page).toHaveURL(/\/import-export\?legacy=csv&importId=7&account=1/);
 await expect(page.getByRole("heading",{name:"Import & Export",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:/Replace history|Allocate|Reverse allocation/})).toHaveCount(0);
 await expect(page.getByLabel("Reconciliation",{exact:true})).toHaveCount(0);
 await page.goto("/transactions?legacy=csv&importId=7&account=1");await expect(page.getByRole("heading",{name:"Transactions",exact:true})).toBeVisible();
 await page.getByRole("button",{name:/^Filter(?:,|$)/}).click();await page.getByRole("button",{name:"Clear all",exact:true}).click();await page.getByRole("dialog",{name:"Filter transactions"}).getByRole("button",{name:"Apply",exact:true}).click();await expect(page).toHaveURL(/\/transactions\?period=all$/);
});
