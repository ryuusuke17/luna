import test,{after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {fork,type ChildProcess} from "node:child_process";
import {createJiti} from "jiti";

const directory=mkdtempSync(join(tmpdir(),"luna-issued-api-"));
process.env.LUNA_DB_PATH=join(directory,"isolated.sqlite");
process.env.LUNA_STATEMENTS_PATH=join(directory,"originals");
process.env.LUNA_SETUP_TOKEN=randomUUID();
const load=createJiti(import.meta.url),{H3}=await load.import<any>("nitro/h3"),app=new H3();
for(const [path,file] of [
 ["/api/auth/:action","auth/[action].ts"],["/api/accounts","accounts.ts"],["/api/accounts/:id","accounts/[id].get.ts"],
 ["/api/credit-card-statements","credit-card-statements.ts"],["/api/credit-card-statements/:id","credit-card-statements/[id].ts"],
 ["/api/credit-card-statements/:id/download","credit-card-statements/[id]/download.get.ts"],
 ["/api/credit-card-dashboard","credit-card-dashboard.get.ts"],["/api/transactions","transactions.ts"],
 ["/api/transactions/:id","transactions/[id].patch.ts"],["/api/export","export.get.ts"]]){
 app.all(path,(await load.import<any>(`../routes/api/${file}`)).default);
}
const {db}=await load.import<any>("./db.ts"),children:ChildProcess[]=[];
after(async()=>{await Promise.all(children.map(child=>new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',()=>resolve());child.kill();})));db.close();rmSync(directory,{recursive:true,force:true});});
const sample=readFileSync(new URL("../../public/unionbank_april_2026_statement_sample.csv",import.meta.url),"utf8");
let cookie="",csrf="";
async function request(path:string,data?:unknown,method=data===undefined?"GET":"POST",authenticated=true){
 const headers:Record<string,string>={origin:"http://isolated.test",host:"isolated.test","content-type":"application/json"};
 if(authenticated){headers.cookie=cookie;headers['x-luna-csrf']=csrf;}
 return app.fetch(new Request(`http://isolated.test/api/${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data)})) as Promise<Response>;
}
async function json(path:string,data?:unknown,method?:string){const response=await request(path,data,method),text=await response.text();assert.equal(response.status,200,text);return JSON.parse(text);}

test("real authenticated API handlers: recover history, approve once, correct twice, search/export provenance and link seven-day payment",async()=>{
 await json('auth/setup',{username:'isolated',password:'fixture-password-only-2026',setupToken:process.env.LUNA_SETUP_TOKEN});
 const login=await request('auth/login',{username:'isolated',password:'fixture-password-only-2026'});assert.equal(login.status,200);
 const cookies=login.headers.getSetCookie().map(s=>s.split(';')[0]);cookie=cookies.join('; ');csrf=cookies.find(s=>s.startsWith('luna_csrf='))!.slice(10);
 const card=(await json('accounts',{name:'Historical card',type:'credit_card',openingDate:'2026-04-01',openingBalance:'0',creditLimit:'50000'})).id;
 const bank=(await json('accounts',{name:'Funding bank',type:'bank',openingDate:'2025-01-01',openingBalance:'0'})).id;
 const payload={filename:'immutable-issued.csv',base64:Buffer.from(sample).toString('base64'),cardId:card,currency:'PHP',confirm:true};
 const sid=(await json('credit-card-statements',payload)).existingId;
 assert.equal((await request('credit-card-statements',payload,'POST',false)).status,401);
 assert.equal((await request(`credit-card-statements/${sid}`,undefined,'GET',false)).status,401);
 let detail=await json(`credit-card-statements/${sid}`);
 const line=detail.lines.find((l:any)=>l.review.preHistory&&l.source.amountSigned>0);
 const command=()=>({action:'review-line',lineId:line.id,decision:'import',classification:'expense',reason:'',version:detail.lines.find((l:any)=>l.id===line.id).review.version,requestKey:randomUUID()});
 assert.equal((await request(`credit-card-statements/${sid}`,command())).status,400);
 const source=Buffer.from(await (await request(`credit-card-statements/${sid}/download`)).arrayBuffer());
 await json(`credit-card-statements/${sid}`,{action:'extend-history',version:detail.historyExtension.version});
 assert.equal((await json('accounts')).find((a:any)=>a.id===card).balance,0);
 detail=await json(`credit-card-statements/${sid}`);const approval=command();
 await Promise.all(Array.from({length:8},()=>json(`credit-card-statements/${sid}`,approval)));
 let records=await json(`transactions?page=1&account=${card}&source=import`);assert.equal(records.total,1);
 const original=records.items[0].id;let current=records.items[0];
 for(let i=0;i<2;i++){
  const corrected=await json(`transactions/${current.id}`,{kind:'expense',date:line.source.postDate,amount:line.source.amountSigned,accountId:card,merchant:'Corrected merchant',notes:'Corrected notes',idempotencyKey:randomUUID(),version:current.version},'PATCH');
  current=(await json(`transactions?id=${corrected.id}`))[0];
 }
 assert.equal(current.source,'import');assert.equal(current.issued[0].original_transaction_id,original);assert.equal(current.issued[0].resolved_transaction_id,current.id);
 records=await json(`transactions?page=1&account=${card}&source=import&search=immutable-issued.csv`);assert.equal(records.total,1);
 assert.equal((await json(`transactions?page=1&account=${card}&source=manual`)).total,0);
 const exported=await json('export');assert.equal(exported.credit_card_line_decisions[0].transaction_id,original);assert.equal(exported.credit_card_line_decisions[0].resolved_transaction_id,current.id);assert.equal(exported.transactions.find((t:any)=>t.id===current.id).issued[0].line_id,line.id);
 await json(`credit-card-statements/${sid}`,{action:'payment',data:{cardId:card,currency:'PHP',date:'2026-04-15',amount:'10.00',sourceAccountId:bank,reference:'Receipt',notes:'',requestKey:randomUUID()}});
 const transfer=await json('transactions',{kind:'transfer',date:'2026-04-22',amount:1000,accountId:bank,counterAccountId:card,idempotencyKey:randomUUID()});
 detail=await json(`credit-card-statements/${sid}`);const p=detail.payments[0];assert.equal(p.candidates[0].id,transfer.id);
 const before=await json('accounts');await json(`credit-card-statements/${sid}`,{action:'link-payment',paymentId:p.id,transactionId:transfer.id,transactionVersion:p.candidates[0].version,version:p.version});
 assert.deepEqual(await json('accounts'),before);assert.equal((await json(`transactions?page=1&account=${bank}`)).items[0].id,transfer.id);
 assert.deepEqual(Buffer.from(await (await request(`credit-card-statements/${sid}/download`)).arrayBuffer()),source);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
});

async function worker(){
 const child=fork(new URL('./credit-card-stress-worker.ts',import.meta.url),[],{env:{...process.env,LUNA_DB_PATH:process.env.LUNA_DB_PATH},execArgv:['--experimental-strip-types'],stdio:['ignore','ignore','pipe','ipc']});children.push(child);
 await new Promise<void>((resolve,reject)=>{child.once('message',()=>resolve());child.once('error',reject);child.once('exit',code=>reject(Error('Worker exited '+code)));});return child;
}
function dispatch(child:ChildProcess,message:unknown){return new Promise<any>((resolve,reject)=>{child.once('message',resolve);child.send(message,(error)=>{if(error)reject(error);});});}

test("four processes: repeated schema initialization, semantic import race and idempotent approval race",{timeout:60000},async()=>{
 const card=(await json('accounts',{name:'Concurrent card',type:'credit_card',openingDate:'2025-01-01',openingBalance:'0',creditLimit:'50000'})).id;
 // Start each connection before contention; race actual operations behind SQLite write locks.
 const workers=[];for(let i=0;i<4;i++)workers.push(await worker());
 for(let round=0;round<5;round++)for(const result of await Promise.all(workers.map(w=>dispatch(w,{action:'initialize'}))))assert.equal(result.ok,true,result.error);
 const results=await Promise.all(workers.map((w,i)=>dispatch(w,{action:'import',input:{filename:`race-${i}.csv`,base64:Buffer.from((i%2?'\uFEFF':'')+sample.replace(/\r?\n/g,i<2?'\n':'\r\n')).toString('base64'),cardId:card,currency:'PHP',confirm:true,acknowledge:true,reviewNote:'Independent disposable race'}})));
 for(const result of results)assert.equal(result.ok,true,result.error);
 const ids=results.map(r=>r.result.existingId);assert.equal(new Set(ids).size,1);const sid=ids[0],detail=await json(`credit-card-statements/${sid}`),line=detail.lines[0];
 const input={action:'review-line',lineId:line.id,decision:'import',classification:'expense',reason:'',version:line.review.version,requestKey:randomUUID()};
 const approvals=await Promise.all(workers.map(w=>dispatch(w,{action:'review',statementId:sid,input})));
 for(const result of approvals)assert.equal(result.ok,true,result.error);
 assert.equal((await json(`transactions?page=1&account=${card}`)).total,1);
 assert.equal((await json(`credit-card-dashboard?cards=${card}`)).total,1);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
});
