export const MAX_MINOR = Number.MAX_SAFE_INTEGER;
export const supportedCurrencies: string[] = (Intl as unknown as {supportedValuesOf:(key:string)=>string[]}).supportedValuesOf("currency");
export function currencyDigits(currency = "PHP"): number {
  if (!supportedCurrencies.includes(currency)) throw Error("Choose a supported currency.");
  return new Intl.NumberFormat("en", {style:"currency",currency}).resolvedOptions().maximumFractionDigits;
}
export function parseMoney(value: string, currency = "PHP"): number {
  const digits=currencyDigits(currency), match=/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length??0)>digits) throw Error(`Enter zero or a positive amount in ${currency}, with no more than ${digits} decimal places. Do not include commas or currency symbols.`);
  const minor=BigInt(match[1])*10n**BigInt(digits)+BigInt((match[2]??"").padEnd(digits,"0")||"0");
  if(minor>BigInt(MAX_MINOR))throw Error("This amount exceeds Luna’s supported limit. Enter a smaller amount.");
  return Number(minor);
}
export function decimalAmount(minor:number,currency="PHP"):string {
  if(!Number.isSafeInteger(minor))throw Error("Invalid amount");
  const digits=currencyDigits(currency),scale=10n**BigInt(digits),n=BigInt(Math.abs(minor));
  return `${minor<0?"-":""}${n/scale}${digits?"."+String(n%scale).padStart(digits,"0"):""}`;
}
export function validatedRate(value:unknown,currency:string):string {
  currencyDigits(currency);
  if(typeof value!=="string"||value.length>40||! /^(0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)||BigInt(value.replace(".",""))===0n)throw Error("Enter a positive manual exchange rate, using up to 18 decimal places.");
  const canonical=value.includes(".")?value.replace(/0+$/,"").replace(/\.$/,""):value;
  if(currency==="PHP"&&canonical!=="1")throw Error("PHP must use exchange rate 1.");
  return canonical;
}
export function convertToPHP(original:number,currency:string,rate:string):number {
  const canonical=validatedRate(rate,currency);
  if(!Number.isSafeInteger(original)||original<=0)throw Error("Amount must be positive");
  const [whole,fraction=""]=canonical.split("."),numerator=BigInt(original)*BigInt(whole+fraction)*100n,denominator=10n**BigInt(currencyDigits(currency)+fraction.length);
  // Decimal integer arithmetic; positive ties round half-up to the nearest PHP centavo.
  const result=(numerator+denominator/2n)/denominator;
  if(result<=0n||result>BigInt(MAX_MINOR))throw Error("This converted amount is outside Luna’s supported limit. Check the amount and rate.");
  return Number(result);
}
export function formatMoney(minor: number,currency="PHP"): string {
  if (!Number.isSafeInteger(minor)) throw Error("Invalid amount");
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(minor / 10**currencyDigits(currency));
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function netWorth(assets: number, liabilities: number): number {
  if (![assets, liabilities].every(Number.isSafeInteger) || assets < 0 || liabilities < 0) throw Error("Invalid balance");
  return assets - liabilities;
}
