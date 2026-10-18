import {test,expect} from "@playwright/test";

test("shared statement IDs, explicit approval, locked account history and all-month reset",async({page})=>{
 let approved=false;
 const requests:string[]=[];
 const card={id:1,name:"Shared credit card",type:"credit_card",opening_date:"2025-01-01",credit_limit:100000,issuer:"UnionBank",last4:"1234"};
 const issue=(id:number,date:string)=>({id,card_id:1,card_name:card.name,last4:card.last4,currency:"PHP",filename:`issue-${id}.csv`,statement_date:date,due_date:"2026-06-01",original_balance:1000,minimum_due:100,applied:0,remaining:1000,status:"not_tracked",reviewStatus:"Reconciled",review_note:"",superseded_by:null,supersedes_id:null,tracking_confirmed:0,metadata:{title:`Issue ${id}`,issuer:"UnionBank",statementMonth:date.slice(0,7),newCharges:1000,creditLimit:100000},rawMetadata:{},reconciliation:{},warnings:[]});
 const issues=[issue(2,"2026-05-01"),issue(1,"2026-04-01")];
 const source={rowNumber:14,saleDate:"2026-04-02",postDate:"2026-04-02",merchantRaw:"Reviewed merchant",amountSigned:1000,typeRaw:"charge",categoryRaw:"",transactionNotesRaw:"",candidateType:"charge"};
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5);requests.push(request.url());
  if(request.method()==="POST"&&path==="credit-card-statements/2"){
   expect(request.postDataJSON()).toMatchObject({action:"review-line",lineId:21,decision:"import",classification:"expense"});approved=true;await route.fulfill({json:{ok:true}});return;
  }
  let json:unknown=[];
  if(path==="auth/me")json={user:{id:1,username:"Fixture"}};
  else if(path==="preferences")json={shortcuts:1,default_transaction_currency:"PHP"};
  else if(path==="accounts")json=[{...card,balance:approved?-1000:0}];
  else if(path==="accounts/1")json={account:{...card,balance:approved?-1000:0},history:{items:[],total:0,page:1,pageSize:25}};
  else if(path==="transactions")json={items:approved?[{id:101,version:"v",kind:"expense",posted_date:source.postDate,amount:1000,account_id:1,merchant:source.merchantRaw,description:"",notes:"",account_name:card.name,original_currency:"PHP",original_amount:1000,included_fee:0,source:"import",balance_impacts:[]}]:[],total:approved?1:0,pageSize:20};
  else if(path==="credit-card-statements"||path==="credit-card-dashboard"){
   const items=issues.filter(s=>!url.searchParams.get("month")||s.statement_date.startsWith(url.searchParams.get("month")!));
   json={items,total:items.length,page:1,pageSize:25,availableMonths:["2026-05","2026-04"],selectedMonth:null,allCards:[card],issuers:["UnionBank"],activity:{items:[],total:0,page:1,pageSize:25,categories:[]}};
  }else if(path==="credit-card-statements/2")json={...issues[0],lines:[{id:21,source,type_override:null,category_override:null,notes_override:null,evidence_payment_id:null,review:{version:"a".repeat(64),readOnly:false,foreign:false,preHistory:false,candidates:[],decision:approved?{action:"import",valid:true,transactionId:101,resolvedTransactionId:101,reason:""}:null}}],total:1,page:1,pageSize:50,payments:[],history:issues,sources:[]};
  await route.fulfill({json});
 });
 await page.setViewportSize({width:320,height:740});await page.goto("/statements");
 await expect(page.getByRole("heading",{name:"Statements",exact:true})).toBeVisible();await expect(page.getByRole("combobox",{name:"Issue month",exact:true})).toHaveValue("");
 await expect(page.getByRole("button",{name:"View statement #1",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"View statement #2",exact:true})).toBeVisible();
 await page.getByRole("combobox",{name:"Issue month",exact:true}).selectOption("2026-04");await expect(page.getByRole("button",{name:"View statement #2",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Clear all filters",exact:true}).click();await expect(page.getByRole("button",{name:"View statement #2",exact:true})).toBeVisible();await expect(page).not.toHaveURL(/month=/);
 await page.getByRole("button",{name:"View statement #2",exact:true}).focus();await page.keyboard.press("Enter");
 const detail=page.getByRole("region",{name:"Credit card statement detail",exact:true});await expect(detail).toBeFocused();
 await detail.getByText("Ledger review · row 14",{exact:true}).click();await expect(detail.getByText(/Unreviewed · reference-only/)).toBeVisible();
 await detail.getByRole("combobox",{name:"Review action",exact:true}).selectOption("import");await detail.getByRole("button",{name:"Confirm ledger review",exact:true}).click();await expect(detail.getByRole("link",{name:"Ledger transaction #101",exact:true})).toBeVisible();
 await detail.getByRole("link",{name:`Open account ${card.name}`,exact:true}).click();await expect(page.getByLabel("Current recorded ledger balance",{exact:true})).toContainText("₱10.00");
 await expect(page.getByRole("heading",{name:"Transactions",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:/View Reviewed merchant/}).first()).toBeVisible();
 await page.getByRole("tab",{name:"Transactions",exact:true}).focus();await page.keyboard.press("ArrowRight");await expect(page.getByRole("tab",{name:"Statements",exact:true})).toHaveAttribute("data-state","active");
 await page.getByRole("button",{name:"View statement #2",exact:true}).click();await detail.getByText("Ledger review · row 14",{exact:true}).click();await expect(detail.getByRole("link",{name:"Ledger transaction #101",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"All statements for this card",exact:true})).toHaveAttribute("href","/statements?cards=1");
 await page.getByRole("link",{name:"All statements for this card",exact:true}).click();await expect(page).toHaveURL(/statements\?cards=1/);
 expect(requests.filter(r=>new URL(r).pathname==="/api/transactions").every(r=>new URL(r).searchParams.get("account")==="1")).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("statement recovery and payment controls pass keyboard, contrast, target and 200% zoom audits",async({page})=>{
 const card={id:1,name:"Very long credit card account name that must wrap without hiding ₱1,234,567.89",type:"credit_card",opening_date:"2026-04-01",credit_limit:100000,issuer:"UnionBank",last4:"1234"};
 const statement={id:2,card_id:1,card_name:card.name,last4:"1234",currency:"PHP",filename:"very-long-issued-statement-filename-that-must-wrap-2026-04.csv",statement_date:"2026-05-01",due_date:"2026-05-20",original_balance:123456789,minimum_due:100000,applied:0,remaining:123456789,status:"not_tracked",reviewStatus:"Reconciled",review_note:"",superseded_by:null,supersedes_id:null,tracking_confirmed:0,file_hash:"a".repeat(64),created_at:"2026-05-01",metadata:{title:"Audit statement",issuer:"UnionBank",statementMonth:"2026-05",newCharges:1000,creditLimit:100000,notes:""},rawMetadata:{},reconciliation:{},warnings:[]};
 const writes:unknown[]=[];
 await page.route("**/api/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.slice(5);
  if(request.method()==="POST"){writes.push(request.postDataJSON());await route.fulfill({json:{ok:true}});return;}
  let json:unknown=[];
  if(path==="auth/me")json={user:{id:1,username:"Audit"}};else if(path==="preferences")json={shortcuts:1,default_transaction_currency:"PHP"};
  else if(path==="credit-card-dashboard")json={items:[statement],total:1,page:1,pageSize:25,availableMonths:["2026-05"],selectedMonth:null,allCards:[card],issuers:["UnionBank"],activity:{items:[],total:0,page:1,pageSize:25,categories:[]}};
  else if(path==="credit-card-statements/2")json={...statement,historyExtension:{openingDate:"2026-04-01",proposedDate:"2026-03-07",affectedRows:2,sourceDates:["2026-03-07"],allowed:true,conflict:"",version:"b".repeat(64)},lines:[],total:0,page:1,pageSize:50,history:[statement],sources:[{id:3,name:"Funding bank"}],payments:[{id:7,version:"c".repeat(64),transaction_id:null,payment_date:"2026-05-15",amount:1000,currency:"PHP",source_account_id:3,source_name_snapshot:"Funding bank",reference:"Receipt",notes:"",allocated:0,applied_here:0,candidates:[{id:44,posted_date:"2026-05-22",description:"Seven-day transfer",version:"d".repeat(64)}]}]};
  await route.fulfill({json});
 });
 for(const viewport of [{width:320,height:740},{width:640,height:900}]){
  await page.setViewportSize(viewport);await page.goto("/statements?document=2");
  const detail=page.getByRole("region",{name:"Credit card statement detail",exact:true});await expect(detail).toBeVisible();
  const recovery=detail.getByRole("region",{name:"Issued-source history recovery",exact:true});await expect(recovery).toContainText("Source dates, opening balance and ledger balances remain unchanged");
  const confirm=recovery.getByRole("button",{name:"Confirm issued-source history extension",exact:true});await expect(confirm).toBeDisabled();
  await recovery.getByRole("checkbox").focus();await page.keyboard.press("Space");await expect(confirm).toBeEnabled();
  await detail.getByRole("button",{name:"Link existing transfer #7",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(detail.getByRole("status").filter({hasText:"1 compatible transfers within seven days"})).toBeVisible();
  await detail.getByRole("combobox",{name:"Exact payment transfer within seven days",exact:true}).selectOption("44");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const issues=await detail.evaluate(root=>{
   const rgb=(v:string)=>{const p=v.match(/[\d.]+/g)?.map(Number)??[];return[p[0]??0,p[1]??0,p[2]??0,p[3]??1];},blend=(a:number[],b:number[])=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1);
   const bg=(e:Element)=>{const c:Element[]=[];for(let x:Element|null=e;x;x=x.parentElement)c.unshift(x);return c.reduce((v,x)=>blend(rgb(getComputedStyle(x).backgroundColor),v),[255,255,255,1]);};
   const lum=(c:number[])=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),ratio=(a:number[],b:number[])=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   const out:string[]=[];for(const e of [root,...root.querySelectorAll<HTMLElement>("*")]){if(!e.getClientRects().length||e.closest(":disabled"))continue;const st=getComputedStyle(e),b=bg(e);
    if([...e.childNodes].some(n=>n.nodeType===3&&n.textContent?.trim())&&ratio(blend(rgb(st.color),b),b)<4.5)out.push("contrast:"+e.textContent?.trim().slice(0,40));
    if(e.matches("button,select,input:not([type=checkbox]),a[href]")){const r=e.getBoundingClientRect();if(r.width<24||r.height<24)out.push("target:"+e.textContent);}
    if(e.matches("input,select,textarea")&&!(e as HTMLInputElement).labels?.length&&!e.getAttribute("aria-label"))out.push("unlabelled:"+e.tagName);}
   return out;
  });
  expect(issues).toEqual([]);
 }
 await page.getByRole("button",{name:"Confirm existing transfer link",exact:true}).click();
 expect(writes).toContainEqual({action:"link-payment",paymentId:7,transactionId:44,transactionVersion:"d".repeat(64),version:"c".repeat(64)});
});
