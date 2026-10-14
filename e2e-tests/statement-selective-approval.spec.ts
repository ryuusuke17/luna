import {test,expect} from "@playwright/test";

test("row then eligible bulk approval retains conflicts, funding overrides, edits and focus at 320px",async({page})=>{
 const saved=new Map<number,any>();let posts=0,fail=true,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 const entries=[
 {id:1,index:0,raw:{description:"Long source "+"x".repeat(300),notes:"Original\nnotes"},row:{date:"2025-01-05",description:"Purchase",kind:"expense",amount:1000,direction:-1,sourceAmount:1000,notes:"Original\nnotes"},category:{label:"Other",defaultOther:true},blockers:[],eligible:true,candidates:[]},
 {id:2,index:1,raw:{categoryHint:"Travel"},row:{date:"2025-01-06",description:"Unknown",kind:"expense",amount:2000,direction:-1,sourceAmount:2000},category:{label:"Travel",defaultOther:false,error:"Unknown category: Travel"},blockers:[{code:"category",message:"Unknown category: Travel"}],eligible:false,candidates:[]},
 {id:3,index:2,raw:{amount:"-5"},row:{date:"2025-01-07",description:"PAYMENT RECEIVED - THANK YOU",kind:"transfer",amount:500,direction:1,sourceAmount:-500},category:{label:"No category · transfer",defaultOther:false},blockers:[{code:"funding",message:"Payment funding required"}],eligible:false,candidates:[]}
 ];
 await page.route("**/api/**",async route=>{const request=route.request(),path=new URL(request.url()).pathname.slice(5);let result:any=[];
 if(path==="auth/me")result={user:{id:1,username:"Selective fixture"}};
 else if(path==="preferences")result={shortcuts:1};
 else if(path==="accounts")result=[{id:1,name:"Card",type:"credit_card"},{id:2,name:"Bank",type:"bank"},{id:3,name:"Wallet",type:"wallet"}];
 else if(path==="categories")result=[{id:1,name:"Food",kind:"expense"}];
 else if(path==="statements")result=[{id:1,filename:"selective.csv",account_name:"Card",status:saved.size===3?"imported":saved.size?"partially_imported":"ready_for_review",rows:3,imported:saved.size,matched:0,needs_review:3-saved.size}];
 else if(path==="statements/1"){
  if(request.method()==="POST"){
   const body=request.postDataJSON();posts++;expect(body.action).toBe("commit");
   if(fail){fail=false;await route.fulfill({status:400,json:{statusMessage:"Statement or matches changed. Reload and review before approving."}});return;}
   if(posts===3)await gate;
   body.decisions.forEach((d:any)=>{expect(saved.has(d.entryId)).toBe(false);saved.set(d.entryId,d);});result={imported:body.decisions.length,matched:0,excluded:0,remaining:3-saved.size,conflicts:saved.size===3?0:2};
  }else result={id:1,filename:"selective.csv",account_id:1,account_name:"Card",account_type:"credit_card",status:saved.size===3?"imported":saved.size?"partially_imported":"ready_for_review",version:`v${saved.size}`,entries:entries.map(e=>({...e,...(saved.has(e.id)?{action:"import",transactionId:10+e.id,categoryId:saved.get(e.id).categoryId,destinationId:saved.get(e.id).destinationId}:{})})),discrepancies:[],funding_account_id:null};
 }
 await route.fulfill({json:result});});
 await page.setViewportSize({width:320,height:500});await page.goto("/imports?statement=1");
 const table=page.getByRole("region",{name:"Statement transaction table · horizontally scrollable"}),heading=page.getByRole("heading",{name:"Transaction review",exact:true});
 await expect(page.getByRole("button",{name:"Approve all eligible (1)"})).toBeEnabled();await expect(page.getByRole("button",{name:"Approve row 2",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"Resolve row 2",exact:true}).focus();await page.keyboard.press("Space");await page.getByRole("textbox",{name:"Reason for row 2",exact:true}).fill("Retain pending edit");
 await page.getByRole("button",{name:"Approve row 1",exact:true}).focus();await page.keyboard.press("Enter");await expect(page.getByRole("alert").filter({hasText:"Evidence refreshed"})).toBeVisible();await expect(page.getByRole("textbox",{name:"Reason for row 2",exact:true})).toHaveValue("Retain pending edit");
 await page.getByRole("button",{name:"Approve row 1",exact:true}).click();await expect(heading).toBeFocused();expect(saved.size).toBe(1);await expect(page.getByRole("button",{name:"Remove selective.csv",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Approve all eligible (0)"})).toBeDisabled();
 await page.getByLabel("Category for row 2",{exact:true}).selectOption("1");await page.getByLabel("Payment funding account · review default",{exact:true}).selectOption("2");await page.getByRole("button",{name:"Notes and source for row 3",exact:true}).click();await page.getByLabel("Payment funding account for row 3",{exact:true}).selectOption("3");
 await page.getByRole("button",{name:"Approve all eligible (2)"}).focus();await page.keyboard.press("Enter");await expect(page.getByRole("button",{name:"Approving…"})).toBeDisabled();expect(posts).toBe(3);release();await expect(heading).toBeFocused();await expect(page.getByRole("link",{name:"Transaction #13",exact:true})).toBeVisible();expect(saved.get(3).destinationId).toBe(3);expect(saved.get(2).reason).toBe("Retain pending edit");expect(saved.size).toBe(3);
 await table.focus();await expect(table).toBeFocused();expect(await table.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Notes and source for row 1",exact:true}).click();await expect(page.getByText("Notes: Original\nnotes",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Finalize reconciliation"})).toBeVisible();expect(posts).toBe(3);
});
