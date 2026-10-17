import {test,expect} from "@playwright/test";
import {reviewDialog,reviewFocusLoop} from "./fixtures/accessibility";

test("account reset needs explicit confirmation; cancel preserves data; success clears accounts",async({page})=>{
 let removed=false;const writes:unknown[]=[];
 await page.route("**/api/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.slice(5);
  if(path==="accounts/reset"&&request.method()==="POST"){
   writes.push(request.postDataJSON());removed=true;await route.fulfill({json:{ok:true}});return;
  }
  const result=path==="auth/me"?{user:{id:1,username:"Reset fixture"}}:path==="preferences"?{shortcuts:1}:path==="accounts/reset"?{version:"a".repeat(64),counts:{accounts:1,statements:2,transactions:3}}:path==="accounts"&&!removed?[{id:1,name:"Old bank",type:"bank",balance:1000,opening_date:"2026-01-01",liquid:1}]:[];
  await route.fulfill({json:result});
 });
 await page.setViewportSize({width:320,height:740});await page.goto("/accounts");
 const trigger=page.getByRole("button",{name:"Remove all accounts and statements",exact:true});await trigger.click();
 const dialog=page.getByRole("alertdialog"),remove=dialog.getByRole("button",{name:"Remove all accounts permanently"});
 await expect(remove).toBeDisabled();await reviewDialog(dialog);await reviewFocusLoop(page,dialog);
 await dialog.getByRole("button",{name:"Cancel deletion"}).click();await expect(trigger).toBeFocused();expect(writes).toEqual([]);
 await trigger.click();await dialog.getByLabel("Type DELETE ALL ACCOUNTS to confirm").fill("DELETE ALL ACCOUNTS");await expect(remove).toBeEnabled();await remove.click();
 await expect(dialog).not.toBeVisible();await expect(page.getByRole("link",{name:"View account details for Old bank"})).toHaveCount(0);
 await expect(trigger).toBeDisabled();expect(writes).toEqual([{version:"a".repeat(64),confirmation:"DELETE ALL ACCOUNTS"}]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Add account",exact:true}).click();await expect(page.getByRole("dialog",{name:"New account"})).toBeVisible();
});
