import {atomic,db} from "./db.ts";
import {parseMoney} from "../../src/lib/finance.ts";
export function mutateBudget(owner:number,id:number|undefined,body:any,remove=false){return atomic(()=>{
 const prior=id===undefined?undefined:db.prepare("SELECT * FROM budgets WHERE owner_id=? AND id=?").get(owner,id) as any;
 if(id!==undefined&&!prior)throw Error("This budget is unavailable. Reload Budgets.");
 if(prior&&(typeof body?.expected!=="string"||JSON.stringify({id:prior.id,month:prior.month,name:prior.name,category_id:prior.category_id,amount:prior.amount})!==body.expected))throw Error("This budget changed. Reload and review before saving or deleting.");
 if(remove){db.prepare("DELETE FROM budgets WHERE owner_id=? AND id=?").run(owner,id);db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,'budget.delete',?)").run(owner,id);return{ok:true};}
 if(!body||!Number.isSafeInteger(body.categoryId)||typeof body.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)||typeof body.amount!=="string"||body.amount.length>30||typeof(body.name??"")!=="string"||(body.name??"").length>80)throw Error("Invalid budget");
 if(!db.prepare("SELECT 1 FROM categories WHERE owner_id=? AND id=? AND archived_at IS NULL").get(owner,body.categoryId))throw Error("Invalid budget category");
 if(db.prepare("SELECT 1 FROM budgets WHERE owner_id=? AND category_id=? AND month=? AND id<>?").get(owner,body.categoryId,body.month,id??0))throw Error("This category already has a budget for that month. Choose another category or month; neither record was changed.");
 const amount=parseMoney(body.amount);if(amount<=0)throw Error("Planned amount must be positive");
 let record=id;if(record===undefined)record=Number(db.prepare("INSERT INTO budgets(owner_id,category_id,month,amount,name) VALUES(?,?,?,?,?)").run(owner,body.categoryId,body.month,amount,(body.name??"").trim()).lastInsertRowid);
 else db.prepare("UPDATE budgets SET category_id=?,month=?,amount=?,name=? WHERE owner_id=? AND id=?").run(body.categoryId,body.month,amount,(body.name??"").trim(),owner,record);
 db.prepare("INSERT INTO audit_events(owner_id,action,entity_id) VALUES(?,'budget.save',?)").run(owner,record);return{id:record};
});}
