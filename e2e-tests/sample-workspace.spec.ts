import {test,expect} from '@playwright/test';

test('backed-up sample reset requires explicit confirmation; Statements filters sources without import controls',async({page})=>{
 let reset=false,posts=0;const csvRows=[{id:1,statement_id:1,filename:'UnionBank - 2026-05.csv',account_name:'UnionBank Card',provider:'UnionBank',kind:'transfer',reconciliation:'matched',action:'import',payment_source:'Cash on Hand',transaction_id:10,currency:'PHP',raw:{description:'BDO BILLS PAYMENT -CASH',amount:'-15000.00'},row:{date:'2026-04-21',postDate:'2026-04-21',description:'BDO BILLS PAYMENT -CASH',amount:1500000,direction:1,sourceAmount:-1500000}},{id:2,statement_id:1,filename:'UnionBank - 2026-05.csv',account_name:'UnionBank Card',provider:'UnionBank',kind:'expense',reconciliation:'needs review',action:null,payment_source:null,transaction_id:null,currency:'PHP',raw:{description:'Instalment Interest (00/12)'},row:{date:'2026-05-07',postDate:'2026-05-07',description:'Instalment Interest (00/12)',amount:37395,direction:-1,sourceAmount:37395}}];
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5);let result:any=[];
  if(path==='auth/me')result={user:{id:1,username:'Sample fixture'}};
  else if(path==='preferences')result={shortcuts:1};
  else if(path==='accounts')result=[{id:1,name:'UnionBank Card',type:'credit_card',archived_at:null},{id:2,name:'Cash on Hand',type:'cash',archived_at:null},{id:3,name:'BDO Mastercard Debit account',type:'bank',archived_at:null}];
  else if(path==='categories')result=[{id:1,name:'Food',kind:'expense'}];
  else if(path==='sample-workspace'){
   if(request.method()==='POST'){const body=request.postDataJSON();expect(body.confirmation).toBe('RESET MY WORKSPACE');expect(body.version).toBe('before-reset');expect(body.cardId).toBe(1);expect(body.cashId).toBe(2);expect(body.bankId).toBe(3);posts++;reset=true;result={statements:5,rows:90,imported:68,pending:20,income:19000000,backupKey:'11111111-1111-1111-1111-111111111111.json'};}
   else result={version:reset?'after-reset':'before-reset',transactions:reset?76:10,statements:reset?5:2,legacyImports:0,paymentRecords:0};
  }else if(path==='statements')result=reset?[{id:1,filename:'UnionBank - 2026-05.csv',account_name:'UnionBank Card',status:'partially_imported',rows:19,imported:12,matched:0,needs_review:5}]:[];
  else if(path==='statement-items'){
   let items=csvRows;if(url.searchParams.get('month'))items=items.filter(i=>i.row.date.startsWith(url.searchParams.get('month')!));if(url.searchParams.get('kind'))items=items.filter(i=>i.kind===url.searchParams.get('kind'));if(url.searchParams.get('search'))items=items.filter(i=>i.row.description.includes(url.searchParams.get('search')!));if(url.searchParams.get('reconciliation'))items=items.filter(i=>i.reconciliation===url.searchParams.get('reconciliation'));
   result={items,providers:['UnionBank'],accounts:[{id:1,name:'UnionBank Card',provider:'UnionBank'}]};
  }
  await route.fulfill({json:result});
 });
 await page.setViewportSize({width:320,height:700});await page.goto('/imports');await page.getByRole('button',{name:'Replace history with five sample statements'}).click();const dialog=page.getByRole('dialog',{name:"Replace this workspace's financial history?"});await expect(dialog.getByRole('button',{name:'Cancel reset'})).toBeFocused();await expect(dialog.getByText(/private backup must succeed first/)).toBeVisible();const confirm=dialog.getByRole('button',{name:'Back up and replace history'});await expect(confirm).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(posts).toBe(0);
 await page.getByRole('button',{name:'Replace history with five sample statements'}).click();await dialog.getByLabel('UnionBank credit account').selectOption('1');await dialog.getByLabel('Cash income / payment account').selectOption('2');await dialog.getByLabel('EasyCash receiving bank account').selectOption('3');await dialog.getByLabel('Type RESET MY WORKSPACE to confirm').fill('RESET MY WORKSPACE');await expect(confirm).toBeEnabled();await confirm.focus();await page.keyboard.press('Enter');await expect(dialog).not.toBeVisible();await expect(page.getByRole('status').filter({hasText:'Samples loaded: 5 statements · 90 original rows'})).toBeVisible();await expect(page.getByRole('link',{name:'Download pre-reset backup'})).toHaveAttribute('href','/api/sample-workspace/11111111-1111-1111-1111-111111111111.json');expect(posts).toBe(1);
 await page.goto('/statements');await expect(page.getByRole('button',{name:'Import statement',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Open Import'})).toBeVisible();await page.getByLabel('Posting month').fill('2026-04');await page.getByLabel('Bank / provider').selectOption('UnionBank');await page.getByRole('combobox',{name:'Statement account',exact:true}).selectOption('1');await page.getByLabel('Statement type').selectOption('transfer');await page.getByRole('combobox',{name:'Reconciliation',exact:true}).selectOption('matched');await page.getByLabel('Search statement activity').fill('BDO');const table=page.getByRole('table');await expect(table.getByRole('row')).toHaveCount(2);await expect(table.getByRole('cell',{name:'Cash on Hand',exact:true})).toBeVisible();await expect(table.getByRole('cell',{name:'2026-04-21',exact:true})).toBeVisible();await page.getByLabel('Bank / provider').selectOption('');await expect(page.getByRole('combobox',{name:'Statement account',exact:true})).toHaveValue('');await page.getByRole('button',{name:'Clear statement filters'}).click();await expect(table.getByRole('row')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('statement payment allocation and reversal leave original balance untouched',async({page})=>{
 let applied=0,reversed=false;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.slice(5);let result:any=[];
  if(path==='auth/me')result={user:{id:1,username:'Payments fixture'}};
  else if(path==='preferences')result={shortcuts:1};
  else if(path==='accounts')result=[{id:1,name:'Card',type:'credit_card'},{id:2,name:'Cash',type:'cash'}];
  else if(path==='statements')result=[{id:1,filename:'may.csv',account_name:'Card',status:'imported',rows:0,imported:0,matched:0,needs_review:0}];
  else if(path==='statement-items')result={items:[],providers:[],accounts:[]};
  else if(path==='statements/1')result={id:1,filename:'may.csv',account_id:1,account_name:'Card',account_type:'credit_card',status:'imported',summary:{outstandingBalance:100000},entries:[],version:'v1',discrepancies:[]};
  else if(path==='statements/1/payments'){
   if(request.method()==='POST'){const b=request.postDataJSON();if(b.action==='reverse'){expect(b.reason).toBe('Wrong period');applied=0;reversed=true;}else{expect(b.transactionId).toBe(10);expect(b.amount).toBe(25000);applied=25000;}result={ok:true};}
   else result={original:100000,applied,remaining:100000-applied,available:[{id:10,amount:50000,available:50000-applied,posted_date:'2026-06-01',source_name:'Cash',description:'Pay card'}],allocations:applied||reversed?[{id:1,amount:25000,posted_date:'2026-06-01',source_name:'Cash',reversed_at:reversed?'2026-06-02':null,voided_at:null,reverse_reason:reversed?'Wrong period':null}]:[]};
  }
  await route.fulfill({json:result});
 });
 await page.goto('/statements?statement=1');const region=page.getByRole('region',{name:'Statement payments',exact:true});await region.getByLabel('Recorded card payment').selectOption('10');await region.getByLabel('Allocation amount · PHP').fill('250');await region.getByRole('button',{name:'Apply payment'}).click();await expect(region.getByText(/Original balance:.*1,000.*Applied payments:.*250.*Remaining:.*750/)).toBeVisible();await region.getByLabel('Reversal reason for allocation 1').fill('Wrong period');await region.getByRole('button',{name:'Reverse allocation 1'}).click();await expect(region.getByText(/Original balance:.*1,000.*Applied payments:.*0.*Remaining:.*1,000/)).toBeVisible();await expect(region.getByText('Wrong period',{exact:true})).toBeVisible();
});
