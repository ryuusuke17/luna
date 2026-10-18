import {db} from "./db.ts";

export function historyConflict(owner:number,a:{id:number;archived_at:string|null}){
 if(a.archived_at)return "Account unavailable; archived accounts cannot extend history.";
 if(db.prepare("SELECT 1 FROM transactions t JOIN account_entries e ON e.transaction_id=t.id WHERE t.owner_id=? AND e.account_id=? AND t.kind='opening' AND t.voided_at IS NULL").get(owner,a.id))return "Active opening-balance transaction prevents history extension. Review the opening balance in account history; it will not be moved or adjusted.";
 if(db.prepare("SELECT 1 FROM reconciliations WHERE owner_id=? AND account_id=? AND state='finalized'").get(owner,a.id))return "Finalized reconciliation prevents history extension. Review and reopen the reconciliation before changing account history.";
 return "";
}
