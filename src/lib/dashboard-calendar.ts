export function localDateKey(date = new Date()): string {
 return `${String(date.getFullYear()).padStart(4,"0")}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

export function calendarMonthBounds(month: string) {
 const first = new Date(`${month}-01T12:00:00`);
 const last = new Date(first.getFullYear(),first.getMonth()+1,0,12);
 return {start:localDateKey(first),end:localDateKey(last),days:last.getDate(),offset:first.getDay()};
}

export function groupCalendarEvents<
 B extends {due_date:string},
 S extends {due_date:string;superseded_by:number|null},
 G extends {due_date:string|null}
>(bills: readonly B[], statements: readonly S[], goals: readonly G[]) {
 const dates: Record<string,{bills:B[];statements:S[];goals:G[]}> = Object.create(null);
 const at = (date:string) => dates[date] ??= {bills:[],statements:[],goals:[]};
 for (const bill of bills) at(bill.due_date).bills.push(bill);
 for (const statement of statements) if (statement.superseded_by === null) at(statement.due_date).statements.push(statement);
 for (const goal of goals) if (goal.due_date) at(goal.due_date).goals.push(goal);
 return dates;
}

type StatementPage<T> = {items:T[];total:number;page:number;pageSize:number};

export async function collectStatementPages<T extends {id:number}>(fetchPage:(page:number)=>Promise<StatementPage<T>>): Promise<T[]> {
 const items:T[] = [], ids = new Set<number>();
 let total:number|undefined, pageSize:number|undefined;
 for (let page=1; ; page++) {
  const result = await fetchPage(page);
  if (!result || !Array.isArray(result.items) || result.page !== page || !Number.isSafeInteger(result.total) || result.total < 0 || !Number.isSafeInteger(result.pageSize) || result.pageSize <= 0) {
   throw new Error("Statement dues pagination is invalid. Retry statement dues.");
  }
  total ??= result.total;
  pageSize ??= result.pageSize;
  if (result.total !== total || result.pageSize !== pageSize || result.items.length !== Math.min(pageSize,Math.max(0,total-(page-1)*pageSize))) {
   throw new Error("Statement dues changed or are incomplete. Retry statement dues.");
  }
  for (const item of result.items) {
   if (!item || !Number.isSafeInteger(item.id) || ids.has(item.id)) throw new Error("Statement dues contain invalid or repeated records. Retry statement dues.");
   ids.add(item.id);
   items.push(item);
  }
  if (items.length === total) return items;
 }
}
