// Dev-only, isolated browser console: await import('/scripts/design-smoke.js'); await runLunaDesignSmoke();
// Simulated UI QA only. All API calls are intercepted; financial writes are refused.
if (!['127.0.0.1','localhost'].includes(location.hostname)) throw Error('Run against the local development server only');
const month=new Date().toISOString().slice(0,7),date=`${month}-10`;
const accounts=[{id:1,name:'UI TEST · Everyday account',type:'bank',balance:123456789012,opening_date:'2026-01-01',liquid:1},{id:2,name:'UI TEST · Credit card',type:'credit_card',balance:-2500000,credit_limit:10000000,opening_date:'2026-01-01'}];
const categories=[{id:1,name:'UI TEST · Everyday spending',kind:'expense'},{id:2,name:'UI TEST · Income',kind:'income'}];
const transactions=[{id:1,posted_date:date,description:'UI TEST · Sample purchase',merchant:'Simulated merchant',kind:'expense',amount:250000,account_name:accounts[0].name,category_name:categories[0].name,notes:'Simulated UI data only'}];
const fixtures={
 'auth/me':{user:{username:'UI TEST ONLY'}},
 preferences:{shortcuts:1,bill_alerts:1,budget_alerts:1,goal_alerts:1},accounts,categories,
 reports:{month,assets:123456789012,liabilities:2500000,netWorth:123454289012,income:5000000,expenses:250000,cashFlow:{amount:4750000},daily:[{name:date,amount:250000}],categories:[{name:categories[0].name,amount:250000}],merchants:[{name:'Simulated merchant',amount:250000}],comparison:[{name:month,income:5000000,expenses:250000}],coverage:[{account:accounts[0].name,openingDate:'2026-01-01'}]},
 budgets:[{id:1,month,name:'UI TEST · Everyday budget',category_id:1,category_name:categories[0].name,kind:'expense',amount:500000,actual:250000}],
 bills:[{id:1,name:'UI TEST · Reminder',due_date:date,amount:100000,transaction_id:null,cadence:'monthly',category_id:1,category_name:categories[0].name,payments:[]}],
 goals:[{id:1,name:'UI TEST · Savings',target:1000000,allocated:250000,due_date:null,notes:'Simulated UI data only',contributions:[]}],
 'merchant-rules':[],providers:[],'import-history':[],'bill-payments':[],'goal-contributions':[],
 search:[{type:'account',id:1,label:accounts[0].name,detail:'Simulated account'}]
};
if (!window.lunaDesignFixtures) {
 const originalFetch=window.fetch.bind(window);
 window.fetch=async(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);
  if((options.method??(input instanceof Request?input.method:'GET')).toUpperCase()!=='GET')throw Error('UI TEST: real API writes blocked');
  const key=url.pathname.slice(5);
  const data=key==='transactions'?(url.searchParams.has('page')?{items:transactions,total:1,pageSize:50}:transactions):fixtures[key];
  if(data===undefined)throw Error(`UI TEST: missing fixture for ${key}`);
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 window.lunaDesignFixtures=true;
 const banner=document.createElement('div');banner.textContent='SIMULATED UI QA · NO REAL DATA';banner.style.cssText='position:fixed;bottom:0;right:0;z-index:100000;background:#fff4ce;color:#412d00;padding:4px 8px;font:11px system-ui;pointer-events:none';document.body.append(banner);
}
const wait=async(check,label)=>{const start=performance.now();while(!check()){if(performance.now()-start>10000)throw Error(`Timed out: ${label}`);await new Promise(r=>setTimeout(r,30));}};
const go=async(path,heading)=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));await wait(()=>document.querySelector('main h1')?.textContent===heading,heading);await wait(()=>!document.querySelector('[role="status"]')?.textContent?.startsWith('Loading'),'data');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
window.runLunaDesignSmoke=async()=>{
 const results=[];
 for(const [path,heading] of [['/','Overview'],['/accounts','Accounts'],['/transactions','Transactions'],['/budgets','Budgets'],['/bills','Bills'],['/goals','Goals'],['/imports','Imports'],['/settings','Settings'],['/analytics','Analytics'],['/help','Help & support']]){
  await go(path,heading);
  const width=document.documentElement.clientWidth,overflow=document.documentElement.scrollWidth>width+1;
  if(overflow)throw Error(`${path}: page overflows ${width}px (${document.documentElement.scrollWidth}px)`);
  if(document.querySelector('vite-error-overlay'))throw Error(`${path}: Vite error`);
  results.push(`${heading}: no page overflow at ${innerWidth}px`);
 }
 await go('/','Overview');
 const opener=[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Add transaction'));
 if(!opener)throw Error('Missing transaction action');opener.focus();opener.click();
 await wait(()=>document.querySelector('[role="dialog"] input'),'transaction dialog');
 if(!document.querySelector('[role="dialog"]').contains(document.activeElement))throw Error('Dialog did not receive focus');
 if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Dialog causes page overflow');
 const close=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Close');
 if(!close)throw Error('Missing dialog close');close.click();await wait(()=>!document.querySelector('[role="dialog"]'),'dialog close');
 await wait(()=>document.activeElement===opener,'dialog focus return');
 await document.fonts.ready;
 if(!document.fonts.check('16px Inter'))throw Error('Inter unavailable');
 const logo=document.querySelector('img[alt="Luna"]');if(!logo?.complete||!logo.naturalWidth)throw Error('Logo unavailable');
 return {width:innerWidth,results,dialog:'open/close/focus return passed',font:'Inter loaded',logo:'supplied artwork loaded',mode:'simulated UI only; writes blocked'};
};
