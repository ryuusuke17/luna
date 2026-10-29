import test,{after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {fork,type ChildProcess} from "node:child_process";
import {createJiti} from "jiti";
import type {CreditDashboard} from "../../src/lib/credit-card-dashboard.ts";

const directory=mkdtempSync(join(tmpdir(),"luna-issued-api-"));
process.env.LUNA_DB_PATH=join(directory,"isolated.sqlite");
process.env.LUNA_STATEMENTS_PATH=join(directory,"originals");
process.env.LUNA_SETUP_TOKEN=randomUUID();
const load=createJiti(import.meta.url),{H3}=await load.import<any>("nitro/h3"),app=new H3();
for(const [path,file] of [
 ["/api/auth/:action","auth/[action].ts"],["/api/accounts","accounts.ts"],["/api/accounts/:id","accounts/[id].get.ts"],
 ["/api/credit-card-statements","credit-card-statements.ts"],["/api/credit-card-statements/:id","credit-card-statements/[id].ts"],
 ["/api/credit-card-statements/:id/download","credit-card-statements/[id]/download.get.ts"],
 ["/api/credit-card-dashboard","credit-card-dashboard.get.ts"],["/api/transactions","transactions.ts"],["/api/search","search.get.ts"],
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
  const manualBank=await json('transactions',{kind:'expense',date:'2026-04-20',amount:1234,accountId:bank,merchant:'Manual bank fixture',idempotencyKey:randomUUID()});
  const manualCard=await json('transactions',{kind:'expense',date:'2026-04-21',amount:2345,accountId:card,merchant:'Manual card fixture',idempotencyKey:randomUUID()});
  assert.equal((await json(`transactions?account=${card}&source=manual&page=1`)).items.some((item:any)=>item.id===manualCard.id),true);
  const importedBank=await json('transactions',{kind:'expense',date:'2026-04-22',amount:3456,accountId:bank,merchant:'Imported bank fixture',idempotencyKey:randomUUID()});
  const batch=Number(db.prepare('INSERT INTO csv_import_batches(owner_id,account_id,file_hash,row_count) VALUES(?,?,?,1)').run(1,bank,randomUUID()).lastInsertRowid);
  db.prepare('INSERT INTO csv_import_rows(owner_id,account_id,batch_id,row_key,source_id,transaction_id) VALUES(?,?,?,?,?,?)').run(1,bank,batch,'fixture-row','fixture-source',importedBank.id);
  const main=await json('transactions?scope=manual-non-card&page=1');
  assert.deepEqual(main.items.map((item:any)=>item.id),[manualBank.id]);assert.equal(main.total,1);
  assert.equal((await json('transactions?scope=manual-non-card&month=2026-04&search=Manual%20bank&page=1')).total,1);
  assert.equal((await json('transactions?scope=manual-non-card&source=import&page=1')).total,0);
  const searchResults=await json('search?q=fixture');assert.ok(searchResults.some((item:any)=>item.type==='transaction'&&item.id===manualBank.id));assert.ok(!searchResults.some((item:any)=>item.type==='transaction'&&[manualCard.id,importedBank.id,current.id].includes(item.id)));
  assert.ok((await json('search?q=Historical')).some((item:any)=>item.type==='account'&&item.id===card));
  for(const term of ['Corrected','Imported'])assert.ok(!(await json(`search?q=${term}`)).some((item:any)=>item.type==='transaction'&&[current.id,importedBank.id].includes(item.id)));
  assert.equal((await json(`credit-card-dashboard?issuedStatement=${sid}`)).activity.total,13);
 const exported=await json('export');assert.equal(exported.credit_card_line_decisions[0].transaction_id,original);assert.equal(exported.credit_card_line_decisions[0].resolved_transaction_id,current.id);assert.equal(exported.transactions.find((t:any)=>t.id===current.id).issued[0].line_id,line.id);
 await json(`credit-card-statements/${sid}`,{action:'payment',data:{cardId:card,currency:'PHP',date:'2026-04-15',amount:'10.00',sourceAccountId:bank,reference:'Receipt',notes:'',requestKey:randomUUID()}});
 const transfer=await json('transactions',{kind:'transfer',date:'2026-04-22',amount:1000,accountId:bank,counterAccountId:card,idempotencyKey:randomUUID()});
 detail=await json(`credit-card-statements/${sid}`);const p=detail.payments[0];assert.equal(p.candidates[0].id,transfer.id);
 const before=await json('accounts');await json(`credit-card-statements/${sid}`,{action:'link-payment',paymentId:p.id,transactionId:transfer.id,transactionVersion:p.candidates[0].version,version:p.version});
 assert.deepEqual(await json('accounts'),before);assert.equal((await json(`transactions?page=1&account=${bank}`)).items[0].id,transfer.id);
  assert.deepEqual((await json('transactions?scope=manual-non-card&page=1')).items.map((item:any)=>item.id),[manualBank.id]);
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


test("exact issued-statement membership ignores posting month, deduplicates corrections and validates owner/scope",async()=>{
 const card=(await json('accounts',{name:'Issue membership card',type:'credit_card',openingDate:'2025-01-01',openingBalance:'0',creditLimit:'50000'})).id;
 const other=(await json('accounts',{name:'Other issue card',type:'credit_card',openingDate:'2025-01-01',openingBalance:'0',creditLimit:'50000'})).id;
 const bank=(await json('accounts',{name:'Not a card',type:'bank',openingDate:'2025-01-01',openingBalance:'0'})).id;
 const issue=(await json('credit-card-statements',{filename:'membership.csv',base64:Buffer.from(sample).toString('base64'),cardId:card,currency:'PHP',confirm:true,acknowledge:true,reviewNote:'Independent membership fixture'})).existingId;
 const second=(await json('credit-card-statements',{filename:'other-card.csv',base64:Buffer.from(sample).toString('base64'),cardId:other,currency:'PHP',confirm:true,acknowledge:true,reviewNote:'Independent card issue'})).existingId;
 // Disposable test database only: keep immutable sample bytes; vary issue dates to isolate membership from posting dates.
 db.prepare("UPDATE cc_statements SET statement_date='2026-08-15' WHERE id IN (?,?)").run(issue,second);
 let detail=await json('credit-card-statements/'+issue),line=detail.lines.find((l:any)=>l.source.amountSigned>0);
 await json('credit-card-statements/'+issue,{action:'review-line',lineId:line.id,decision:'import',classification:'expense',reason:'',version:line.review.version,requestKey:randomUUID()});
 let current=(await json('transactions?issuedStatement='+issue))[0];
 const corrected=await json('transactions/'+current.id,{kind:'expense',date:'2026-07-25',amount:current.amount,accountId:card,merchant:'July linked purchase',notes:'',idempotencyKey:randomUUID(),version:current.version},'PATCH');
 current=(await json('transactions?id='+corrected.id))[0];
 await json('transactions',{kind:'expense',date:'2026-08-15',amount:500,accountId:card,merchant:'Unlinked August purchase',idempotencyKey:randomUUID()});
 // Two source rows can reference one ledger record. EXISTS must not duplicate result/count.
 const duplicate=detail.lines.find((l:any)=>l.id!==line.id);
 db.prepare("INSERT INTO cc_line_decisions(line_id,transaction_id,action,classification,reason,actor_id,request_key,request_json,version) SELECT ?,transaction_id,'link',classification,'fixture',actor_id,?,'{}',version FROM cc_line_decisions WHERE line_id=?").run(duplicate.id,randomUUID(),line.id);
 const before=await json('export');
 const sourceBefore=db.prepare('SELECT id,file_hash,source_bytes FROM cc_statements ORDER BY id').all();
 const activity=await json('credit-card-dashboard?issuedStatement='+issue+'&cards='+card) as CreditDashboard;
 assert.equal(activity.total,1);assert.equal(activity.items[0].id,issue);assert.equal(activity.activity.total,13);
 assert.deepEqual(activity.activity.items.map(item=>item.id).sort((first,second)=>first-second),detail.lines.map((item:{id:number})=>item.id).sort((first:number,second:number)=>first-second));
 assert.equal(activity.activity.items.find(item=>item.id===line.id).ledgerTransactionId,current.id);
 assert.equal(activity.activity.items.find(item=>item.id===duplicate.id).ledgerTransactionId,current.id);
 assert.equal(new Set(activity.activity.items.map(item=>item.id)).size,13);
 assert.ok(activity.activity.items.some(item=>item.ledgerTransactionId===null&&item.amount<0));
 assert.equal((await json('credit-card-dashboard?issuedStatement='+second)).activity.total,13);
 for(const id of ['', '0','-1','1.5','bad','9007199254740992','999999999'])assert.equal((await request('credit-card-dashboard?issuedStatement='+id)).status,400);
 for(const wrong of [other,bank])assert.equal((await request('credit-card-dashboard?issuedStatement='+issue+'&cards='+wrong)).status,400);
 assert.equal((await request('credit-card-dashboard?issuedStatement='+issue,undefined,'GET',false)).status,401);
 const selected=await json('transactions?issuedStatement='+issue+'&dateMode=statement&account='+card+'&page=1');
 assert.equal(selected.total,1);assert.deepEqual(selected.items.map((t:any)=>t.id),[current.id]);assert.equal(selected.items[0].posted_date,'2026-07-25');
 assert.equal((await json('transactions?issuedStatement='+second+'&page=1')).total,0);
 assert.equal((await json('transactions?issuedStatement='+issue+'&search=July&source=import&sort=oldest&page=1')).total,1);
 assert.equal((await json('transactions?issuedStatement='+issue+'&search=August&page=1')).total,0);
 assert.equal((await json('transactions?issuedStatement='+issue+'&source=manual&page=1')).total,0);
 assert.equal((await json('transactions?month=2026-08&dateMode=calendar&account='+card+'&page=1')).total,1);
 for(const id of ['0','-1','1.5','bad','9007199254740992'])assert.equal((await request('transactions?issuedStatement='+id)).status,400);
 for(const conflict of ['month=2026-08','start=2026-07-01','end=2026-09-01','period=all','batch=1','legacy=csv','importId=1','dateMode=calendar'])assert.equal((await request('transactions?issuedStatement='+issue+'&'+conflict)).status,400);
 assert.equal((await request('transactions?dateMode=statement')).status,400);
 assert.equal((await request('transactions?issuedStatement=999999999')).status,404);
 assert.equal((await request('transactions?issuedStatement='+issue+'&account='+other)).status,400);
 assert.equal((await request('transactions?issuedStatement='+issue+'&account='+bank)).status,400);
 assert.equal((await request('transactions?issuedStatement='+issue,undefined,'GET',false)).status,401);
 const after=await json('export');delete before.exported_at;delete after.exported_at;assert.deepEqual(after,before);
 assert.deepEqual(db.prepare('SELECT id,file_hash,source_bytes FROM cc_statements ORDER BY id').all(),sourceBefore);
 const owner=db.prepare("SELECT owner_id FROM cc_statements WHERE id=?").get(second).owner_id;
 const foreign=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run('foreign-'+randomUUID(),'unusable-test-hash').lastInsertRowid);
 db.prepare('UPDATE cc_statements SET owner_id=? WHERE id=?').run(foreign,second);
 assert.equal((await request('transactions?issuedStatement='+second)).status,404);
 assert.equal((await request('credit-card-dashboard?issuedStatement='+second)).status,400);
 assert.equal((await json('credit-card-statements?cards='+other)).items.length,0);
 db.prepare('UPDATE cc_statements SET owner_id=? WHERE id=?').run(owner,second);
 db.prepare("UPDATE accounts SET type='bank' WHERE id=?").run(other);
 assert.equal((await request('transactions?issuedStatement='+second)).status,404);
 assert.equal((await request('credit-card-dashboard?issuedStatement='+second)).status,400);
 db.prepare("UPDATE accounts SET type='credit_card' WHERE id=?").run(other);
 db.prepare("UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE id=?").run(current.id);
 assert.equal((await json('transactions?issuedStatement='+issue+'&page=1')).total,0);
 const voided=await json('credit-card-dashboard?issuedStatement='+issue) as CreditDashboard;
 assert.equal(voided.activity.total,13);assert.ok(voided.activity.items.every(item=>item.ledgerTransactionId===null));
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
});
