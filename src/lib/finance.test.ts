import assert from "node:assert/strict";
import test from "node:test";
import {transactionType,transactionTypeLabel,transactionText} from "./transactions.ts";

test("transaction labels and installment classification preserve accounting types and explicit overrides",()=>{
 assert.equal(transactionTypeLabel("expense"),"Expense");assert.equal(transactionTypeLabel("installment"),"Installments");
 for(const description of ["(15/24) SILICON VALLEY-SM FAIR","Instalment Principal (02/03) [8152612]"])assert.equal(transactionType({kind:"expense",description}),"installment");
 assert.equal(transactionType({kind:"expense",notes:"INSTALMENT 6 OF 24"}),"installment");
 for(const merchant of ["(04/12) Shop","Shop (04/12)","Shop (04/12) branch"])assert.equal(transactionType({kind:"expense",merchant}),"installment");
 assert.equal(transactionType({kind:"expense",merchant:"Shop (04/12)",is_installment:0}),"expense");
 assert.equal(transactionType({kind:"expense",is_installment:1}),"installment");
 assert.equal(transactionType({kind:"expense",description:"(15/24) Shop",is_installment:0}),"expense");
 for(const description of ["(00/24) Shop","(25/24) Shop","Installment processing fee","Shop 03/24"])assert.equal(transactionType({kind:"expense",description}),"expense");
 for(const kind of ["transfer","refund","income"])assert.equal(transactionType({kind,description:"(15/24) Shop",is_installment:1}),kind);
});

test("only proven full-statement merchant fields are projected; manual descriptions and source data stay intact",()=>{
 const raw={postDate:"Apr 7, 2026",description:"UNIQLO SM FAIRVIEW, QUEZON CITY"};
 assert.deepEqual(transactionText({description:raw.description,merchant:""},[raw]),{description:"",merchant:raw.description});
 assert.deepEqual(transactionText({description:"My purchase",merchant:"Store"},[raw]),{description:"My purchase",merchant:"Store"});
 assert.deepEqual(transactionText({description:raw.description},[]),{description:raw.description,merchant:""});
 assert.deepEqual(transactionText({description:"My correction"},[raw]),{description:"My correction",merchant:""});
 assert.equal(raw.description,"UNIQLO SM FAIRVIEW, QUEZON CITY");
});
import {parseMoney,convertToPHP,validatedRate,decimalAmount,currencyDigits} from "./finance.ts";
test("currency precision and decimal half-up conversion",()=>{
 assert.equal(convertToPHP(parseMoney("10","USD"),"USD","58"),58000);
 assert.equal(currencyDigits("JPY"),0);assert.equal(parseMoney("105","JPY"),105);assert.throws(()=>parseMoney("1.1","JPY"));
 assert.equal(convertToPHP(1,"JPY","0.005"),1);assert.equal(convertToPHP(1,"USD","0.5"),1);assert.throws(()=>convertToPHP(1,"USD","0.49"));
 assert.equal(decimalAmount(Number.MAX_SAFE_INTEGER),"90071992547409.91");assert.equal(decimalAmount(1,"JPY"),"1");
 assert.equal(validatedRate("58.000","USD"),"58");assert.equal(validatedRate("1.0","PHP"),"1");assert.throws(()=>validatedRate("2","PHP"));
 for(const rate of ["0","-1","NaN","Infinity","1e2","0.0000000000000000001",1])assert.throws(()=>validatedRate(rate,"USD"));
 assert.throws(()=>parseMoney("1","ZZZ"));assert.throws(()=>convertToPHP(Number.MAX_SAFE_INTEGER,"USD","2"));assert.throws(()=>parseMoney("1.001","USD"));
});
