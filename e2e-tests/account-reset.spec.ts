import {test,expect} from "@playwright/test";

test("Accounts omits the reset card and still supports adding accounts",async({page})=>{
 const writes:string[]=[];
 await page.route("**/api/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.slice(5);
  if(request.method()!=="GET")writes.push(path);
  const result=path==="auth/me"?{user:{id:1,username:"Account fixture"}}:path==="preferences"?{shortcuts:1}:path==="accounts"?[{id:1,name:"Daily bank",type:"bank",balance:1000,opening_date:"2026-01-01",liquid:1}]:[];
  await route.fulfill({json:result});
 });
 await page.setViewportSize({width:320,height:740});await page.goto("/accounts");
 await expect(page.getByRole("heading",{name:"Accounts",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Start with fresh accounts",exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Remove all accounts and statements",exact:true})).toHaveCount(0);
 await expect(page.getByRole("link",{name:"View account details for Daily bank"})).toBeVisible();
 await page.getByRole("button",{name:"Add account",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"New account"})).toBeVisible();
 expect(writes).toEqual([]);
});
