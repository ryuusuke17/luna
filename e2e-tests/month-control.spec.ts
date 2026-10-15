import {test,expect,type Page} from "@playwright/test";
import {importWorkspace} from "./fixtures/transaction-imports";

const paths=["/","/budgets","/analytics","/bills"];
const trigger=(page:Page)=>page.getByRole("button",{name:/^Selected month:/});
const chooser=(page:Page)=>page.getByRole("dialog",{name:"Choose month",exact:true});

async function workspace(page:Page){
 await page.clock.setFixedTime(new Date("2027-01-01T00:30:00Z"));
 await importWorkspace(page);
 const base={account_id:1,category_id:1,account_name:"Daily bank",category_name:"Food",notes:"",payment_kind:"expense",payment_voided:null,payment_date:"",transaction_id:null,cadence:"once"};
 const bills=[
  {...base,id:1,name:"December upcoming",amount:1000,due_date:"2026-12-31"},
  {...base,id:2,name:"December overdue",amount:2000,due_date:"2026-12-01"},
  {...base,id:3,name:"December recurring",amount:3000,due_date:"2026-12-10",cadence:"monthly"},
  {...base,id:4,name:"December paid",amount:4000,due_date:"2026-12-05",transaction_id:40,payment_date:"2027-01-01"},
  {...base,id:5,name:"January paid",amount:5000,due_date:"2027-01-05",transaction_id:50,payment_date:"2026-12-30"},
  {...base,id:6,name:"January upcoming",amount:6000,due_date:"2027-01-10"},
 ];
 const reportMonths:string[]=[];
 await page.route(/\/api\/bills(?:\?|$)/,route=>route.fulfill({json:bills}));
 await page.route(/\/api\/budgets(?:\?|$)/,route=>route.fulfill({json:[]}));
 await page.route(/\/api\/categories(?:\?|$)/,route=>route.fulfill({json:[{id:1,name:"Food",kind:"expense"}]}));
 await page.route(/\/api\/transactions(?:\?|$)/,route=>route.fulfill({json:[]}));
 await page.route(/\/api\/reports(?:\?|$)/,route=>{
  const month=new URL(route.request().url()).searchParams.get("month")!;
  reportMonths.push(month);
  return route.fulfill({json:{month,assets:0,liabilities:0,netWorth:0,income:0,expenses:0,cashFlow:{amount:0},categories:[],merchants:[],daily:[],comparison:[],coverage:[]}});
 });
 return {bills,reportMonths};
}

async function applyMonth(page:Page,month:string){
 await trigger(page).click();
 await chooser(page).getByLabel("Month",{exact:true}).fill(month);
 await chooser(page).getByRole("button",{name:"Apply",exact:true}).click();
}

test.use({timezoneId:"America/Los_Angeles"});

for(const path of paths){
 test(`${path} uses local months, cancellable drafts, keyboard navigation and calendar boundaries`,async({page})=>{
  await workspace(page);await page.goto(path);
  const selected=trigger(page),previous=page.getByRole("button",{name:"Previous month",exact:true}),next=page.getByRole("button",{name:"Next month",exact:true});
  await expect(selected).toHaveText("December 2026");
  await next.focus();await page.keyboard.press("Enter");
  await expect(selected).toHaveText("January 2027");
  await previous.focus();await page.keyboard.press("Space");
  await expect(selected).toHaveText("December 2026");
  for(const dismiss of ["Cancel","Escape","outside"]){
   await selected.focus();await page.keyboard.press("Enter");
   await expect(chooser(page).getByRole("combobox")).toHaveCount(0);
   await chooser(page).getByLabel("Month",{exact:true}).fill("2026-04");
   if(dismiss==="Cancel")await chooser(page).getByRole("button",{name:"Cancel",exact:true}).click();
   else if(dismiss==="Escape")await page.keyboard.press("Escape");
   else await page.locator("main h1").click();
   await expect(chooser(page)).toHaveCount(0);
   await expect(selected).toHaveText("December 2026");
   if(dismiss!=="outside")await expect(selected).toBeFocused();
  }
  await selected.click();
  const input=chooser(page).getByLabel("Month",{exact:true});
  await expect(input).toHaveValue("2026-12");
  await input.focus();
  // Native month inputs can expose multiple keyboard-editable segments.
  for(let step=0;step<6;step++){
   await page.keyboard.press("Tab");
   if(await chooser(page).getByRole("button",{name:"Cancel",exact:true}).evaluate(element=>element===document.activeElement))break;
  }
  await expect(chooser(page).getByRole("button",{name:"Cancel",exact:true})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(chooser(page).getByRole("button",{name:"Apply",exact:true})).toBeFocused();
  expect(await chooser(page).getByRole("button",{name:"Apply",exact:true}).evaluate(element=>{
   const style=getComputedStyle(element);return style.outlineStyle!=="none"&&parseFloat(style.outlineWidth)>=2;
  })).toBe(true);
  await input.fill("");await chooser(page).getByRole("button",{name:"Apply",exact:true}).click();
  await expect(input).toHaveAttribute("aria-invalid","true");
  const error=chooser(page).getByRole("alert");
  await expect(error).toContainText("Choose a valid month");
  expect((await input.getAttribute("aria-describedby"))?.split(" ")).toContain(await error.getAttribute("id"));
  await expect(selected).toHaveText("December 2026");
  // Exercise the same validation path used by browsers with a text fallback.
  await input.evaluate(element=>element.setAttribute("type","text"));
  await input.fill("2026-13");await chooser(page).getByRole("button",{name:"Apply",exact:true}).click();
  await expect(input).toHaveAttribute("aria-invalid","true");
  await expect(selected).toHaveText("December 2026");
  await input.fill("0100-01");await chooser(page).getByRole("button",{name:"Apply",exact:true}).click();
  await expect(previous).toBeDisabled();await expect(next).toBeEnabled();
  await applyMonth(page,"9999-12");await expect(next).toBeDisabled();await expect(previous).toBeEnabled();
  expect(new URL(page.url()).search).toBe("");
 });
}

test("Bills scopes totals and every tab by due month; out-of-month IDs remain available",async({page})=>{
 const state=await workspace(page);await page.goto("/bills");
 const summary=page.getByRole("region",{name:"Bills due in December 2026"});
 await expect(summary.locator("article").nth(0)).toContainText("₱60.00");
 await expect(summary.locator("article").nth(1).locator(".metric")).toHaveText("3");
 await expect(summary.locator("article").nth(2).locator(".metric")).toHaveText("1");
 for(const [tab,names] of [["upcoming",[]],["overdue",["December upcoming","December overdue","December recurring"]],["recurring",["December recurring"]],["paid",["December paid"]]] as const){
  await page.getByRole("tab",{name:tab,exact:true}).click();
  const panel=page.getByRole("tabpanel");
  await expect(panel.getByRole("button",{name:/^View details for/})).toHaveCount(names.length);
  for(const name of names)await expect(panel.getByRole("button",{name:`View details for ${name}`,exact:true})).toBeVisible();
  if(!names.length)await expect(panel.getByRole("status")).toHaveText(`No ${tab} reminders in December 2026.`);
 }
 await page.getByRole("button",{name:"Next month",exact:true}).click();
 await expect(page.getByRole("tabpanel").getByRole("button",{name:"View details for January paid",exact:true})).toBeVisible();
 await page.getByRole("tab",{name:"upcoming",exact:true}).click();
 await expect(page.getByRole("tabpanel").getByRole("button",{name:"View details for January upcoming",exact:true})).toBeVisible();
 await applyMonth(page,"2026-11");
 await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText("No upcoming reminders in November 2026.");
 await page.goto("/bills?id=6");
 await expect(page.getByRole("dialog",{name:"January upcoming",exact:true})).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(page.getByText("Record deleted or unavailable",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Previous month",exact:true}).click();
 expect(new URL(page.url()).searchParams.get("id")).toBe("6");
 await expect(page.getByText("Record deleted or unavailable",{exact:true})).toHaveCount(0);
 await page.goto("/bills?id=999");await expect(page.getByText("Record deleted or unavailable",{exact:true})).toBeVisible();
 state.bills.splice(0);await page.goto("/bills");
 await expect(page.getByText("No bill reminders yet. Add a planning record to begin.",{exact:true})).toBeVisible();
});

test("Dashboard day resets, budgets follow selection, page months remain independent",async({page})=>{
 const state=await workspace(page);await page.goto("/");
 await page.getByRole("button",{name:/10.*2026, 1 bill reminders$/}).click();
 await expect(page.getByRole("heading",{name:"12/10/2026",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Next month",exact:true}).click();
 await expect(page.getByText("Select a day.",{exact:true})).toBeVisible();
 await expect.poll(()=>state.reportMonths[state.reportMonths.length-1]).toBe("2027-01");
 await page.getByRole("link",{name:"Budgets",exact:true}).click();
 await expect(trigger(page)).toHaveText("December 2026");
 await applyMonth(page,"2027-02");await page.getByRole("button",{name:"Create category budget",exact:true}).click();
 await expect(page.getByLabel("Budget month",{exact:true})).toHaveValue("2027-02");
});

test.describe("small-screen touch and zoom-equivalent reflow",()=>{
 test.use({hasTouch:true});
 test("all four controls retain touch targets, wrapping, viewport-contained scrollable choosers",async({page})=>{
  await workspace(page);
  for(const size of [{width:320,height:740},{width:640,height:400},{width:320,height:300}]){
   await page.setViewportSize(size);
   for(const path of paths){
    await page.goto(path);
    const group=page.getByRole("group",{name:"Month navigation"});
    for(const button of await group.getByRole("button").all()){
     const box=await button.boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await trigger(page).tap();
    await expect(chooser(page)).toBeVisible();
    await chooser(page).evaluate(async root=>{await Promise.all(root.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    const bounds=await chooser(page).boundingBox();expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(size.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(size.height+1);
    await chooser(page).getByLabel("Month",{exact:true}).fill("2027-09");
    await chooser(page).getByRole("button",{name:"Apply",exact:true}).tap();
    await expect(trigger(page)).toHaveText("September 2027");
    await page.getByRole("button",{name:"Next month",exact:true}).tap();
    await expect(trigger(page)).toHaveText("October 2027");
   }
  }
 });
});
