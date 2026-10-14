import assert from "node:assert/strict";
import test from "node:test";
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
