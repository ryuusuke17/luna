export const MAX_MINOR = Number.MAX_SAFE_INTEGER;

export function parseMoney(value: string): number {
  const input = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) throw new Error("Enter a non-negative amount with up to two decimals");
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt(MAX_MINOR)) throw new Error("Amount is too large");
  return Number(minor);
}

export function formatMoney(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Invalid amount");
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(minor / 100);
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function netWorth(assets: number, liabilities: number): number {
  if (![assets, liabilities].every(Number.isSafeInteger) || assets < 0 || liabilities < 0) throw new Error("Invalid balance");
  return assets - liabilities;
}
