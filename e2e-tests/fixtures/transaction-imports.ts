import {expect,type Page} from "@playwright/test";

export async function importWorkspace(page:Page,existing=false){
 let uploaded=existing,resolved=false,version=1,fail=false;
 const requests:{path:string;method:string;body:Record<string,unknown>|null}[]=[];
 const accounts=[{id:1,name:"Daily bank",type:"bank",balance:-1000,opening_date:"2025-01-01"},{id:2,name:"Everyday card",type:"credit_card",balance:0,opening_date:"2025-01-01"}];
 const clear={id:1,index:0,action:"import",transactionId:11,categoryId:null,raw:{date:"2025-04-10",description:"Lunch",amount:"10"},row:{date:"2025-04-10",description:"Lunch",merchant:"Cafe",kind:"expense",amount:1000,direction:-1},category:{label:"Uncategorized"},blockers:[],candidates:[],warnings:""};
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method(),body=request.postDataJSON();requests.push({path,method,body});let result:unknown=[];
  if(path==="auth/me")result={user:{id:1,username:"Fixture owner"}};
  else if(path==="accounts")result=accounts;
  else if(path==="categories")result=[];
  else if(path==="preferences")result={shortcuts:1,default_transaction_currency:"PHP"};
  else if(path==="statements"){
   if(method==="POST"){expect(body.accountId).toBe(1);uploaded=true;result={id:1,accountId:1,imported:1,linked:0,needsAttention:1,skipped:0,duplicate:false};}
   else result=uploaded?[{id:1,account_id:1,account_name:"Daily bank",filename:"mixed.csv",created_at:"2025-04-12",rows:2,imported:resolved?2:1,matched:0,needs_review:resolved?0:1,status:"partially_imported",error:""}]:[];
  }else if(path==="statements/1"){
   if(method==="POST"){
    if(fail){fail=false;await route.fulfill({status:400,json:{message:"Fixture save failed; retry"}});return;}
    if(body.action==="resolve"){expect(body.decisions[0].categoryId).toBeNull();resolved=true;version++;}
    result={id:1,accountId:1,imported:resolved?2:1,linked:0,needsAttention:resolved?0:1,skipped:0};
   }else result={id:1,account_id:1,account_name:"Daily bank",account_type:"bank",filename:"mixed.csv",status:"partially_imported",error:"",version:String(version),discrepancies:[],entries:[clear,{id:2,index:1,action:resolved?"import":null,transactionId:resolved?12:null,categoryId:null,raw:{date:"bad",description:"Second purchase",amount:"5"},row:resolved?{date:"2025-04-11",description:"Second purchase",merchant:"",kind:"expense",amount:500,direction:-1}:null,category:{label:"Uncategorized"},blockers:resolved?[]:[{code:"invalid",message:"Invalid posting date"}],candidates:[],warnings:"Invalid posting date"}]};
  }else if(path==="statements/1/download"){await route.fulfill({body:"private original fixture",contentType:"text/csv",headers:{"content-disposition":'attachment; filename="mixed.csv"'}});return;}
  else if(path==="transactions"){
   const items=uploaded?[{id:11,description:"Lunch",merchant:"Cafe",posted_date:"2025-04-10",kind:"expense",category_name:null,account_id:1,account_name:"Daily bank",amount:1000,source:"import",balance_impacts:[],version:"1"}]:[];
   result={items,total:items.length,pageSize:50};
  }
  await route.fulfill({json:result});
 });
 return{requests,failNextSave:()=>{fail=true;}};
}
