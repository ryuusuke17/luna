import {test,expect} from "@playwright/test";

test("legacy reference archives remain in account-filtered Import history without ledger writes",async({page})=>{
 const writes:string[]=[];
 await page.route("**/api/**",async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5);
  if(req.method()!=="GET")writes.push(path);
  let json:unknown=[];
  if(path==="auth/me")json={user:{id:1,username:"Archive fixture"}};
  else if(path==="preferences")json={shortcuts:1};
  else if(path==="accounts")json=[{id:1,name:"Daily bank",type:"bank"}];
  else if(path==="statement-archives"){
   expect(url.searchParams.get("account")).toBe("1");
   json={items:[{id:8,filename:"Retained statement.csv",created_at:"2026-04-30"}],total:1,pageSize:25};
  }else if(path==="statement-archives/8")json={id:8,filename:"Retained statement.csv",summary:{statementDate:"2026-04-30",outstandingBalance:123400},rows:[{merchant:"Original merchant"}],rawSummary:[],warnings:[]};
  await route.fulfill({json});
 });
 await page.setViewportSize({width:320,height:740});await page.goto("/import-export?tab=history&account=1");
 await page.getByText("Legacy reference archives",{exact:true}).click();
 await expect(page.getByRole("link",{name:"Download original 8",exact:true})).toHaveAttribute("href","/api/statement-archives/8/download");
 await page.getByRole("button",{name:"Inspect legacy archive 8",exact:true}).click();
 await expect(page.getByRole("region",{name:"Legacy source data",exact:true})).toContainText("Original merchant");
 await page.goto("/import-export?tab=history&account=1&archive=8");
 await expect(page.getByRole("region",{name:"Legacy source data",exact:true})).toContainText("123400");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(writes).toEqual([]);
});
