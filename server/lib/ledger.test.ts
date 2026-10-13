import assert from "node:assert/strict";
import test from "node:test";
import { isCalendarDate, netWorth, parseMoney } from "../../src/lib/finance";

test("money parsing uses exact centavos and rejects ambiguous precision",()=>{
 assert.equal(parseMoney("1250.5"),125050);
 assert.equal(parseMoney("0.01"),1);
 assert.throws(()=>parseMoney("1.005"));
 assert.throws(()=>parseMoney("-2"));
});
test("calendar validation rejects normalized invalid dates",()=>{
 assert.equal(isCalendarDate("2024-02-29"),true);
 assert.equal(isCalendarDate("2025-02-29"),false);
 assert.equal(isCalendarDate("2025-13-01"),false);
});
test("net worth remains assets less liabilities",()=>{
 assert.equal(netWorth(250000,40000),210000);
 assert.throws(()=>netWorth(-1,0));
});
