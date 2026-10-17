import { z } from "zod";
import { db } from "./db.ts";
import "./credit-card-statements.ts";
import { balanceFor } from "./ledger.ts";
import { isCalendarDate } from "../../src/lib/finance.ts";
import { debtAccount, type Account, type AccountDetail, type AccountDisplay, type AccountSnapshot } from "../../src/lib/accounts.ts";

const priority = { issued: 4, bank: 3, archive: 2, historical: 1 };
const order = (a: AccountSnapshot, b: AccountSnapshot) => (b.date ?? "").localeCompare(a.date ?? "") || priority[b.source] - priority[a.source] || b.sourceId - a.sourceId;
export function selectAccountDisplay(history: AccountSnapshot[]): AccountDisplay {
  const active = history.filter(s => s.eligible).sort(order), date = active[0]?.date ?? null;
  const latest = active.filter(s => s.date === date);
  const currencies = [...new Set(latest.map(s => s.currency))].sort();
  const snapshots = currencies.map(currency => latest.find(s => s.currency === currency)!);
  const unknown = active.some(s => s.date === null);
  const usable = date !== null && !unknown && snapshots.length > 0 && snapshots.every(s => s.amount !== null && Number.isSafeInteger(s.amount));
  return { count: history.length, date, source: usable ? "statement" : "ledger", snapshots: usable ? snapshots : [], reason: usable ? null : !history.length ? "Ledger balance · No statements uploaded" : unknown ? "Ledger fallback · Statement date unknown; latest balance cannot be established" : "Ledger fallback · Latest statement closing balance not provided" };
}

// Select compact metadata only. Source files, raw summaries and transaction JSON stay in their existing detail APIs.
export function accountHistory(owner: number, accountId: number): AccountSnapshot[] {
  const account = db.prepare("SELECT type FROM accounts WHERE owner_id=? AND id=?").get(owner, accountId) as {type:string} | undefined;
  if (!account) return [];
  const debt = debtAccount(account.type);
  const rows = db.prepare(`
    SELECT 'issued' source,id sourceId,filename,statement_date date,currency,original_balance amount,
      'debt-positive' semantics,CASE WHEN superseded_by IS NULL THEN 'Validated issue' ELSE 'Superseded' END status,
      superseded_by IS NULL eligible,due_date dueDate,minimum_due minimumDue
      FROM cc_statements WHERE owner_id=? AND card_id=?
    UNION ALL
    SELECT 'bank',s.id,s.filename,COALESCE(json_extract(s.summary_json,'$.statementDate'),s.period_end),s.currency,
      CASE WHEN s.status='failed' THEN NULL ELSE COALESCE(json_extract(s.summary_json,'$.outstandingBalance'),(SELECT r.closing_balance FROM reconciliations r WHERE r.owner_id=s.owner_id AND r.statement_id=s.id AND r.state='finalized' ORDER BY r.id DESC LIMIT 1)) END,
      ?,s.status,1,json_extract(s.summary_json,'$.dueDate'),json_extract(s.summary_json,'$.minimumDue')
      FROM statements s WHERE s.owner_id=? AND s.account_id=?
    UNION ALL
    SELECT 'archive',id,filename,json_extract(summary_json,'$.statementDate'),'PHP',json_extract(summary_json,'$.outstandingBalance'),
      ?, 'Legacy reference',1,json_extract(summary_json,'$.dueDate'),json_extract(summary_json,'$.minimumDue')
      FROM statement_archives WHERE owner_id=? AND account_id=?
    UNION ALL
    SELECT 'historical',id,statement_id,period_end,'PHP',closing_balance,'debt-positive',
      CASE WHEN reconciliation_stale=1 THEN 'Historical · coverage changed' ELSE 'Historical import' END,1,NULL,NULL
      FROM statement_imports WHERE owner_id=? AND account_id=?
  `).all(owner,accountId,debt?"debt-positive":"asset-positive",owner,accountId,debt?"debt-positive":"asset-positive",owner,accountId,owner,accountId) as (Omit<AccountSnapshot,"id"|"download"|"view"> & {eligible:number})[];
  return rows.map(row => {
    const source=row.source, id=row.sourceId;
    const download=source==="historical"?null:`/api/${source==="issued"?"credit-card-statements":source==="bank"?"statements":"statement-archives"}/${id}/download`;
    const view=source==="issued"?`/statements?document=${id}`:source==="archive"?`/import-export?tab=history&archive=${id}&account=${accountId}`:source==="historical"?`/transactions?legacy=json&importId=${id}&account=${accountId}`:`/import-export?tab=history&batch=${id}&account=${accountId}`;
    return {...row,id:`${source}:${id}`,eligible:Boolean(row.eligible),date:row.date&&isCalendarDate(row.date)?row.date:null,amount:Number.isSafeInteger(row.amount)?row.amount:null,download,view};
  }).sort(order);
}
const date = z.string().refine(isCalendarDate,"Choose a valid calendar date");
const filterSchema = z.object({
  tab:z.enum(["statements","activity"]).optional(), month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(m=>isCalendarDate(`${m}-01`)).optional(),
  start:date.optional(),end:date.optional(),search:z.string().max(100).optional(),page:z.string().regex(/^[1-9]\d{0,5}$/).optional(),
}).strict().refine(f=>!f.month||!f.start&&!f.end,"Month and date range are mutually exclusive").refine(f=>!f.start||!f.end||f.start<=f.end,"Start date must precede end date");
export const parseAccountFilters = (input:unknown) => filterSchema.parse(input);
export function accountDetails(owner:number, id:number, input:unknown): AccountDetail | null {
  if (!Number.isSafeInteger(id)||id<1) throw Error("Invalid account ID");
  const f=parseAccountFilters(input);
  const record=db.prepare("SELECT * FROM accounts WHERE owner_id=? AND id=?").get(owner,id) as Omit<Account,"balance"> | undefined;
  if (!record) return null;
  const history=accountHistory(owner,id),display=selectAccountDisplay(history);
  let month=f.month??null,start=f.start??null,end=f.end??null;
  if(f.tab==="activity"&&!month&&!start&&!end) month=(db.prepare("SELECT substr(MAX(t.posted_date),1,7) month FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND e.account_id=? AND t.voided_at IS NULL").get(owner,id) as {month:string|null}).month;
  if(month){start=`${month}-01`;const next=new Date(`${start}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(0);end=next.toISOString().slice(0,10);}
  const before=start?new Date(`${start}T00:00:00Z`):null;if(before)before.setUTCDate(before.getUTCDate()-1);
  const totals=db.prepare(`SELECT COALESCE(SUM(MAX(e.delta,0)),0) inflows,COALESCE(SUM(MAX(-e.delta,0)),0) outflows FROM account_entries e JOIN transactions t ON t.id=e.transaction_id WHERE t.owner_id=? AND e.account_id=? AND t.voided_at IS NULL AND (? IS NULL OR t.posted_date>=?) AND (? IS NULL OR t.posted_date<=?)`).get(owner,id,start,start,end,end) as {inflows:number;outflows:number};
  const filtered=history.filter(s=>(!start||s.date!==null&&s.date>=start)&&(!end||s.date!==null&&s.date<=end)&&(!f.search||`${s.filename} ${s.source} ${s.status}`.toLowerCase().includes(f.search.toLowerCase())));
  const page=Number(f.page??1),pageSize=25;
  return {account:{...record,balance:balanceFor(owner,id),display},history:{items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize},period:{month,start,end,opening:before?balanceFor(owner,id,before.toISOString().slice(0,10)):0,closing:balanceFor(owner,id,end??undefined),...totals}};
}
