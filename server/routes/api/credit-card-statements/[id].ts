import {defineHandler} from "nitro";
import {createError,getQuery,getRouterParam} from "nitro/h3";
import {requireUser,requireMutation,readLimitedJson} from "../../../lib/request";
import {creditCardStatementDetail,mutateCreditCardStatement} from "../../../lib/credit-card-statements";
import {creditCardLedgerReview,reviewCreditCardLine,linkCreditCardPayment,creditCardPaymentVersion,creditCardPaymentCandidates,issuedHistoryExtension,extendIssuedHistory} from "../../../lib/credit-card-ledger";
export default defineHandler(async event=>{
 const user=requireUser(event),id=Number(getRouterParam(event,"id"));
 try{
  if(!Number.isSafeInteger(id)||id<=0)throw Error("Statement unavailable");
  if(event.req.method==="GET"){const detail=creditCardStatementDetail(user.id,id,getQuery(event));return {...detail,historyExtension:issuedHistoryExtension(user.id,id),lines:detail.lines.map(l=>({...l,review:creditCardLedgerReview(user.id,id,l.id)})),payments:detail.payments.map(p=>({...p,version:creditCardPaymentVersion(user.id,p.id),candidates:creditCardPaymentCandidates(user.id,id,p.id)}))};}
  if(event.req.method!=="POST")throw createError({statusCode:405,statusMessage:"Method not allowed"});
  requireMutation(event);const input=await readLimitedJson(event,20000) as {action?:string};
  if(input?.action==="extend-history")return extendIssuedHistory(user.id,id,input);
  if(input?.action==="review-line")return reviewCreditCardLine(user.id,id,input);
  if(input?.action==="link-payment")return linkCreditCardPayment(user.id,id,input);
  return mutateCreditCardStatement(user.id,id,input);
 }catch(error){if((error as {statusCode?:number}).statusCode)throw error;throw createError({statusCode:400,statusMessage:error instanceof Error&&!("code" in error)?error.message:"Statement update failed"});}
});
