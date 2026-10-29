import {isCalendarDate} from "./finance.ts";

const activityKeys = ["lineSearch", "lineAmount", "lineCurrency", "lineType", "lineSort", "linePage", "lineStart", "lineEnd"];

export type TransactionDateFilter = {
  mode: "statement" | "statement-month" | "month" | "range" | "all";
  issuedStatement?: string;
  month: string;
  start: string;
  end: string;
};

export function currentMonth(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function normalizeTransactionFilters(input: URLSearchParams, now = new Date()): URLSearchParams {
  const params = new URLSearchParams(input);
  if (params.has("issuedStatement") || params.get("dateMode") === "statement") {
    params.set("dateMode", "statement");
    for (const key of ["month", "start", "end", "period", "batch", "legacy", "importId", "search", "kind", "source", "sort"]) params.delete(key);
    return params;
  }
  if (params.get("dateMode") === "statement-month") {
    if (!params.get("month")) params.set("month", currentMonth(now));
    for (const key of ["issuedStatement", "start", "end", "period", "batch", "legacy", "importId", "search", "kind", "source", "sort", "page", "id"]) params.delete(key);
    return params;
  }
  for (const key of activityKeys) params.delete(key);
  if (!params.has("month") && !params.has("start") && !params.has("end") && params.get("period") !== "all") {
    params.set("month", currentMonth(now));
    params.set("dateMode", "calendar");
  }
  if (params.get("start") || params.get("end")) {
    params.delete("month");
    params.delete("period");
  } else if (params.get("month")) {
    params.delete("period");
  } else if (params.get("period") === "all") {
    params.delete("month");
  } else {
    params.set("month", currentMonth(now));
    params.delete("period");
  }
  return params;
}

export function transactionDateFilter(params: URLSearchParams, now = new Date()): TransactionDateFilter {
  const start = params.get("start") || "", end = params.get("end") || "";
  const mode = params.has("issuedStatement") || params.get("dateMode") === "statement" ? "statement" : params.get("dateMode") === "statement-month" ? "statement-month" : start || end ? "range" : params.get("period") === "all" ? "all" : "month";
  return {
    mode,
    issuedStatement: params.get("issuedStatement") || "",
    month: params.get("month") || currentMonth(now),
    start,
    end,
  };
}

export function adjacentTransactionMonth(params: URLSearchParams, direction: -1 | 1): string | null {
  const date = transactionDateFilter(params);
  if (!params.get("month") || !["month", "statement-month"].includes(date.mode) || !isCalendarDate(`${date.month}-01`)) return null;
  const shifted = new Date(`${date.month}-01T00:00:00`);
  shifted.setMonth(shifted.getMonth() + direction);
  const month = currentMonth(shifted);
  return isCalendarDate(`${month}-01`) ? month : null;
}

export function transactionDateLabel(params: URLSearchParams): string {
  const date = transactionDateFilter(params);
  if (date.mode === "statement") return date.issuedStatement ? `Statement #${date.issuedStatement}` : "Choose statement";
  if (date.mode === "all") return "All time";
  if (date.mode === "statement-month") {
    if (!isCalendarDate(`${date.month}-01`)) return "Invalid statement month";
    return `Statements · ${new Intl.DateTimeFormat("en-PH", {month: "long", year: "numeric"}).format(new Date(`${date.month}-01T00:00:00`))}`;
  }
  if (date.mode === "month") {
    if (!isCalendarDate(`${date.month}-01`)) return "Invalid month";
    return new Intl.DateTimeFormat("en-PH", {month: "long", year: "numeric"}).format(new Date(`${date.month}-01T00:00:00`));
  }
  if ([date.start, date.end].some(value => value && !isCalendarDate(value))) return "Invalid date range";
  const format = (value: string) => new Intl.DateTimeFormat("en-PH", {month: "short", day: "numeric", year: "numeric"}).format(new Date(`${value}T00:00:00`));
  if (!date.start) return `Through ${format(date.end)}`;
  if (!date.end) return `From ${format(date.start)}`;
  return `${format(date.start)} - ${format(date.end)}`;
}

export function applyTransactionFilters(current: URLSearchParams, draft: URLSearchParams, now = new Date()): URLSearchParams {
  const next = new URLSearchParams(draft);
  next.delete("page");
  next.delete("id");
  next.delete("linePage");
  const statementModes = (mode: TransactionDateFilter["mode"]) => mode === "statement" || mode === "statement-month";
  const wasStatement = statementModes(transactionDateFilter(current).mode);
  if (wasStatement !== statementModes(transactionDateFilter(next).mode)) next.delete("category");
  if ((current.get("account") || "") !== (next.get("account") || "")) {
    for (const key of ["batch", "legacy", "importId", "issuedStatement"]) next.delete(key);
    if (wasStatement) { for (const key of [...activityKeys, "category"]) next.delete(key); }
    if (statementModes(transactionDateFilter(next).mode)) { next.delete("dateMode"); next.delete("issuedStatement"); next.delete("month"); next.set("period", "all"); }
  }
  return normalizeTransactionFilters(next, now);
}

export function applyTransactionDate(current: URLSearchParams, date: TransactionDateFilter): URLSearchParams {
  if (date.mode === "statement" && (!/^[1-9]\d*$/.test(date.issuedStatement || "") || !Number.isSafeInteger(Number(date.issuedStatement)))) throw Error("Choose a valid statement.");
  if ((date.mode === "month" || date.mode === "statement-month") && !isCalendarDate(`${date.month}-01`)) throw Error(date.mode === "statement-month" ? "Choose a valid statement month." : "Choose a valid month.");
  if (date.mode === "range") {
    if (!date.start && !date.end) throw Error("Choose a start date, an end date, or both.");
    if ([date.start, date.end].some(value => value && !isCalendarDate(value))) throw Error("Enter valid calendar dates.");
    if (date.start && date.end && date.start > date.end) throw Error("End date must be on or after start date.");
  }
  const next = new URLSearchParams(current);
  for (const key of ["month", "start", "end", "period", "dateMode", "issuedStatement"]) next.delete(key);
  if (date.mode === "statement") {
    next.set("dateMode", "statement");
    next.set("issuedStatement", date.issuedStatement!);
    for (const key of ["batch", "legacy", "importId"]) next.delete(key);
  } else if (date.mode === "statement-month") {
    next.set("dateMode", "statement-month");
    next.set("month", date.month);
    for (const key of ["issuedStatement", "batch", "legacy", "importId"]) next.delete(key);
  } else if (date.mode === "month") { next.set("month", date.month); next.set("dateMode", "calendar"); }
  else if (date.mode === "range") {
    if (date.start) next.set("start", date.start);
    if (date.end) next.set("end", date.end);
  } else next.set("period", "all");
  return applyTransactionFilters(current, next);
}

export function transactionFilterCount(params: URLSearchParams): number {
  return ["account", "kind", "category", "source"].filter(key => params.get(key)).length
    + Number(Boolean(params.get("sort") && params.get("sort") !== "newest"))
    + Number(Boolean(params.get("batch") || params.get("legacy")));
}
