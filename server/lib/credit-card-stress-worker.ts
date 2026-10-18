import {db} from "./db.ts";
import {initializeCreditCardSchema,importCreditCardStatement} from "./credit-card-statements.ts";
import {reviewCreditCardLine} from "./credit-card-ledger.ts";

process.on("message",(message:{action:string;input:unknown;statementId:number})=>{
 try{
  const result=message.action==="import"?importCreditCardStatement(1,message.input):message.action==="initialize"?initializeCreditCardSchema():reviewCreditCardLine(1,message.statementId,message.input);
  process.send?.({ok:true,result});
 }catch(error){process.send?.({ok:false,error:(error as Error).message});}
});
process.on("disconnect",()=>{db.close();process.exit(0);});
process.send?.({ready:true});
