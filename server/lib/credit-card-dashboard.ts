import {z} from "zod";
import {db} from "./db.ts";
import {creditCardStatementScope,listCreditCardStatements} from "./credit-card-statements.ts";
import {signedStatementAmount} from "../../src/lib/credit-card-csv.ts";
import {isCalendarDate} from "../../src/lib/finance.ts";

const date=z.string().refine(isCalendarDate,"Choose a valid calendar date");
const activityFilters=z.object({lineAmount:z.string().max(40).optional(),lineCurrency:z.string().regex(/^[A-Z]{3}$/).optional(),lineSearch:z.string().max(200).optional(),lineType:z.enum(["charge","payment","credit","installment","other"]).optional(),category:z.string().max(100).optional(),start:date.optional(),end:date.optional(),lineSort:z.enum(["source","sale","post","amount","merchant"]).optional(),linePage:z.string().regex(/^[1-9]\d{0,5}$/).optional()});
export function creditCardActivity(owner:number,input:unknown={}){
 const {lineAmount,lineCurrency,lineSearch,lineType,category,start,end,lineSort,linePage,...scope}=activityFilters.passthrough().parse(input);
 if(start&&end&&start>end)throw Error("Post date start must precede end");
 const {final,finalArgs}=creditCardStatementScope(owner,scope),where=["1=1"],args:(string|number)[]=[...finalArgs];
 if(lineAmount!==undefined){if(!lineCurrency)throw Error("Choose currency for exact amount search");where.push("l.amount=? AND s.currency=?");args.push(signedStatementAmount(lineAmount,lineCurrency),lineCurrency);}
 const type="COALESCE(NULLIF(n.type_override,''),NULLIF(json_extract(l.source_json,'$.typeRaw'),''),CASE WHEN l.amount<0 THEN 'payment / credit' WHEN json_extract(l.source_json,'$.candidateType')='installment candidate' THEN 'installment' ELSE 'charge' END)";
 const categoryValue="COALESCE(NULLIF(n.category_override,''),json_extract(l.source_json,'$.categoryRaw'))";
 if(lineSearch){where.push("(instr(lower(json_extract(l.source_json,'$.merchantRaw')),lower(?))>0 OR instr(lower(COALESCE(NULLIF(n.notes_override,''),json_extract(l.source_json,'$.transactionNotesRaw'))),lower(?))>0)");args.push(lineSearch,lineSearch);}
 if(category){where.push(`${categoryValue}=?`);args.push(category);}
 if(start){where.push("l.post_date>=?");args.push(start);}if(end){where.push("l.post_date<=?");args.push(end);}
 const predicates={charge:`l.amount>=0 AND lower(${type}) IN ('charge','expense')`,payment:`l.amount<0 AND (lower(${type}) LIKE '%payment%' OR lower(${type}) LIKE '%repayment%')`,credit:"l.amount<0",installment:`lower(${type}) LIKE '%instal%'`,other:`l.amount>=0 AND lower(${type}) NOT IN ('charge','expense') AND lower(${type}) NOT LIKE '%instal%'`};
 if(lineType)where.push(`(${predicates[lineType]})`);
 const joins=`FROM (${final}) s JOIN cc_statement_lines l ON l.statement_id=s.id LEFT JOIN cc_line_annotations n ON n.line_id=l.id LEFT JOIN cc_payment_evidence e ON e.line_id=l.id LEFT JOIN cc_payments p ON p.id=e.payment_id AND p.owner_id=s.owner_id AND p.card_id=s.card_id AND p.currency=s.currency`;
 const condition=where.join(" AND ");
 const total=(db.prepare(`SELECT COUNT(*) total ${joins} WHERE ${condition}`).get(...args) as {total:number}).total;
 const page=Number(linePage??1),pageSize=25,order=({source:"s.statement_date DESC,s.id DESC,l.row_index",sale:"json_extract(l.source_json,'$.saleDate'),l.id",post:"l.post_date,l.id",amount:"l.amount DESC,l.id",merchant:"json_extract(l.source_json,'$.merchantRaw'),l.id"})[lineSort??"source"];
 const items=db.prepare(`SELECT l.id,l.statement_id,l.row_index,l.amount,s.currency,s.card_id,s.card_name,s.last4,COALESCE(NULLIF(s.issuer,''),json_extract(s.metadata_json,'$.issuer')) issuer,substr(s.statement_date,1,7) statement_month,l.source_json,n.type_override,n.category_override,n.notes_override,${type} display_type,${categoryValue} display_category,p.id payment_id,p.source_name_snapshot funding_source ${joins} WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize).map(row=>{const {source_json,...safe}=row as Record<string,unknown>;return{...safe,source:JSON.parse(String(source_json))};});
 const categories=(db.prepare(`SELECT DISTINCT ${categoryValue} category ${joins} WHERE ${categoryValue}<>'' ORDER BY category`).all(...finalArgs) as {category:string}[]).map(r=>r.category);
 return{items,total,page,pageSize,categories};
}
export function creditCardDashboard(owner:number,input:unknown={}){
 const parsed=activityFilters.passthrough().parse(input),{lineAmount,lineCurrency,lineSearch,lineType,category,start,end,lineSort,linePage,...scope}=parsed;
 // Read only owner-scoped metadata/counts. Never expose original bytes or source descriptions in diagnostics.
 const months=(db.prepare("SELECT DISTINCT substr(statement_date,1,7) month FROM cc_statements WHERE owner_id=? AND superseded_by IS NULL ORDER BY month DESC").all(owner) as {month:string}[]).map(r=>r.month);
 const selectedMonth=typeof scope.month==="string"?scope.month:null;
 const dashboard=listCreditCardStatements(owner,scope),activity=creditCardActivity(owner,{...scope,lineAmount,lineCurrency,lineSearch,lineType,category,start,end,lineSort,linePage});
 const diagnostics={
  issued:(db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN superseded_by IS NULL THEN 1 ELSE 0 END) active FROM cc_statements WHERE owner_id=?").get(owner) as {total:number;active:number|null}),
  lines:(db.prepare("SELECT COUNT(*) total FROM cc_statement_lines l JOIN cc_statements s ON s.id=l.statement_id WHERE s.owner_id=?").get(owner) as {total:number}).total,
  legacyArchives:(db.prepare("SELECT COUNT(*) total FROM statement_archives WHERE owner_id=?").get(owner) as {total:number}).total,
  ledgerImports:(db.prepare("SELECT COUNT(*) total FROM statements WHERE owner_id=?").get(owner) as {total:number}).total,
  issues:db.prepare("SELECT s.id,s.card_id,s.statement_date,s.currency,s.superseded_by,(SELECT COUNT(*) FROM cc_statement_lines l WHERE l.statement_id=s.id) line_count FROM cc_statements s WHERE s.owner_id=? ORDER BY s.statement_date DESC,s.id DESC LIMIT 100").all(owner),
  ambiguousCards:dashboard.allCards.filter(c=>!c.last4&&dashboard.allCards.some(other=>other.id!==c.id&&(other.issuer??"").toLowerCase()===(c.issuer??"").toLowerCase())).map(c=>c.id)
 };
 return{...dashboard,selectedMonth,availableMonths:months,activity,diagnostics};
}
