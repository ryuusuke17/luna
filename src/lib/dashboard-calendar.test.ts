import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calendarMonthBounds,collectStatementPages,groupCalendarEvents,localDateKey} from "./dashboard-calendar.ts";

test("calendar token contrast meets text and non-text thresholds", () => {
 const css=readFileSync(new URL("../globals.css",import.meta.url),"utf8").split(".dashboard-calendar {")[1].split("}")[0];
 const luminance=(token:string)=>{
  const hex=css.match(new RegExp(`--calendar-${token}: #([0-9a-f]{6});`))?.[1];
  assert.ok(hex,`Missing calendar token: ${token}`);
  return [0,2,4].reduce((sum,offset,index)=>{
   const channel=parseInt(hex.slice(offset,offset+2),16)/255;
   return sum+(channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4)*[0.2126,0.7152,0.0722][index];
  },0);
 };
 const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
 assert.ok(contrast("today","on-today")>=4.5,"Today text contrast");
 for(const token of ["bills","statements","goals","selection","focus"]) assert.ok(contrast(token,"marker-surface")>=3,`${token} contrast against calendar surface / marker halo`);
 assert.ok(contrast("today","marker-surface")>=3,"Marker halo against Today");
});

test("local dates ignore UTC offsets; midnight advances to the next local date", () => {
 const previous = process.env.TZ;
 try {
  process.env.TZ = "Asia/Manila";
  assert.equal(localDateKey(new Date("2026-01-31T16:01:00Z")),"2026-02-01");
  process.env.TZ = "America/Los_Angeles";
  assert.equal(localDateKey(new Date("2026-02-01T00:01:00Z")),"2026-01-31");
  assert.equal(localDateKey(new Date(2026,0,31,23,59,59)),"2026-01-31");
  assert.equal(localDateKey(new Date(2026,0,32,0,0,0)),"2026-02-01");
 } finally {
  if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
 }
});

test("month bounds handle leap years, short months, year edges", () => {
 assert.deepEqual(calendarMonthBounds("2024-02"),{start:"2024-02-01",end:"2024-02-29",days:29,offset:4});
 assert.equal(calendarMonthBounds("2025-02").end,"2025-02-28");
 assert.equal(calendarMonthBounds("2026-04").days,30);
 assert.equal(calendarMonthBounds("2026-12").end,"2026-12-31");
 assert.equal(calendarMonthBounds("2027-01").start,"2027-01-01");
 assert.equal(calendarMonthBounds("0100-01").end,"0100-01-31");
});

test("overlapping categories preserve paid, unknown, achieved records; statements use due dates", () => {
 const due_date = "2026-02-01";
 const bills = [{id:1,due_date,transaction_id:9},{id:2,due_date,transaction_id:null}];
 const statements = [
  {id:3,due_date,statement_date:"2026-01-15",status:"not_tracked",superseded_by:null},
  {id:4,due_date,statement_date:"2026-01-10",status:"paid",superseded_by:null},
  {id:5,due_date,statement_date:"2026-01-10",status:"paid",superseded_by:4}
 ];
 const goals = [{id:6,due_date,allocated:100,target:100},{id:7,due_date:null,allocated:0,target:100},{id:8,due_date:"2026-02-28",allocated:0,target:100}];
 const grouped = groupCalendarEvents(bills,statements,goals);
 assert.deepEqual(grouped[due_date].bills,bills);
 assert.deepEqual(grouped[due_date].statements,statements.slice(0,2));
 assert.deepEqual(grouped[due_date].goals,[goals[0]]);
 assert.deepEqual(grouped["2026-02-28"].goals,[goals[2]]);
 assert.equal(grouped["2026-01-15"],undefined);
 assert.deepEqual(Object.keys(grouped),[due_date,"2026-02-28"]);
});

test("statement collector fetches every page, including more than 25 records", async () => {
 const records = Array.from({length:61},(_,i)=>({id:i+1})), calls:number[] = [];
 const result = await collectStatementPages(async page => {
  calls.push(page);
  return {page,pageSize:25,total:records.length,items:records.slice((page-1)*25,page*25)};
 });
 assert.deepEqual(calls,[1,2,3]);
 assert.deepEqual(result,records);
 assert.deepEqual(await collectStatementPages(async page=>({page,pageSize:25,total:0,items:[]})),[]);
 const exactCalls:number[] = [];
 await collectStatementPages(async page=>{exactCalls.push(page);return {page,pageSize:25,total:50,items:Array.from({length:25},(_,i)=>({id:(page-1)*25+i}))};});
 assert.deepEqual(exactCalls,[1,2]);
});

test("incomplete, repeated, changed, invalid, failed pages never resolve as complete", async () => {
 await assert.rejects(collectStatementPages(async page=>({page,pageSize:25,total:26,items:page===1?Array.from({length:25},(_,id)=>({id})):[]})),/incomplete/);
 await assert.rejects(collectStatementPages(async page=>({page,pageSize:1,total:2,items:[{id:1}]})),/repeated/);
 await assert.rejects(collectStatementPages(async page=>({page,pageSize:1,total:page===1?2:3,items:[{id:page}]})),/changed/);
 await assert.rejects(collectStatementPages(async ()=>({page:1,pageSize:0,total:1,items:[]})),/invalid/);
 await assert.rejects(collectStatementPages(async page=>{if(page===2)throw Error("offline");return {page,pageSize:1,total:2,items:[{id:1}]};}),/offline/);
});
