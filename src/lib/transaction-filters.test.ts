import test from "node:test";
import assert from "node:assert/strict";
import {adjacentTransactionMonth, applyTransactionDate, applyTransactionFilters, currentMonth, normalizeTransactionFilters, transactionDateFilter, transactionDateLabel, transactionFilterCount} from "./transaction-filters.ts";

const params = (value = "") => new URLSearchParams(value);

test("month navigation crosses years and never replaces ranges, All time, or invalid months", () => {
  assert.equal(adjacentTransactionMonth(params("month=2026-01"), -1), "2025-12");
  assert.equal(adjacentTransactionMonth(params("month=2026-12"), 1), "2027-01");
  assert.equal(adjacentTransactionMonth(params("month=2024-02"), 1), "2024-03");
  for (const query of ["period=all", "start=2026-04-01", "month=2026-04&end=2026-04-30", "month=bad", "month=2026-13", ""]) {
    for (const direction of [-1, 1] as const) assert.equal(adjacentTransactionMonth(params(query), direction), null);
  }
  assert.equal(adjacentTransactionMonth(params("month=9999-12"), 1), null);
  const original = params("month=2026-11&account=4&batch=6&search=shop&page=2");
  const next = applyTransactionDate(original, {mode: "month", month: adjacentTransactionMonth(original, -1)!, start: "", end: ""});
  assert.equal(next.get("month"), "2026-10");
  for (const key of ["account", "batch", "search"]) assert.equal(next.get(key), original.get(key));
  assert.equal(next.has("page"), false);
  assert.equal(original.get("month"), "2026-11");
});

test("fresh views use local calendar months, including year boundaries", () => {
  for (const [date, month] of [[new Date(2026, 0, 1), "2026-01"], [new Date(2026, 11, 31), "2026-12"], [new Date(2027, 0, 1), "2027-01"]] as const) {
    assert.equal(currentMonth(date), month);
    assert.equal(normalizeTransactionFilters(params(), date).get("month"), month);
  }
});

test("contextual and All time URLs never acquire a default month", () => {
  for (const query of ["period=all", "account=4", "batch=6&account=4", "legacy=csv&importId=3", "id=42", "kind=installment", "search=merchant", "page=2"]) {
    const normalized = normalizeTransactionFilters(params(query));
    assert.equal(normalized.get("month"), null);
    assert.equal(normalized.get("period"), "all");
    for (const [key, value] of params(query)) assert.equal(normalized.get(key), value);
  }
});

test("explicit ranges supersede months without mutating the original URL", () => {
  const original = params("month=2026-10&start=2024-02-29&end=2024-03-01&period=all&account=4");
  const normalized = normalizeTransactionFilters(original);
  assert.equal(normalized.get("month"), null);
  assert.equal(normalized.get("period"), null);
  assert.equal(normalized.get("start"), "2024-02-29");
  assert.equal(normalized.get("account"), "4");
  assert.equal(original.get("month"), "2026-10");
});

test("date modes remove conflicting dates and preserve account/upload context", () => {
  const original = params("account=4&batch=6&start=2024-01-01&end=2024-12-31&search=shop&page=3&id=42");
  const month = applyTransactionDate(original, {mode: "month", month: "2026-01", start: "", end: ""});
  assert.equal(month.get("month"), "2026-01");
  for (const key of ["start", "end", "page", "id", "period"]) assert.equal(month.get(key), null);
  for (const key of ["account", "batch", "search"]) assert.equal(month.get(key), original.get(key));
  const range = applyTransactionDate(month, {mode: "range", month: "2026-01", start: "2024-02-29", end: "2024-03-01"});
  assert.equal(range.get("month"), null);
  assert.equal(range.get("start"), "2024-02-29");
  const all = applyTransactionDate(range, {mode: "all", month: "", start: "", end: ""});
  assert.equal(all.get("period"), "all");
  for (const key of ["month", "start", "end"]) assert.equal(all.get(key), null);
});

test("ranges allow either boundary and reject missing, impossible, or reversed dates", () => {
  for (const [start, end] of [["2024-02-29", ""], ["", "2024-02-29"], ["2024-02-29", "2024-02-29"]]) {
    const next = applyTransactionDate(params(), {mode: "range", month: "", start, end});
    assert.equal(next.get("month"), null);
    assert.equal(next.get("start") || "", start);
    assert.equal(next.get("end") || "", end);
  }
  for (const [start, end] of [["", ""], ["2026-02-29", ""], ["2026-04-31", ""], ["2026-2-01", ""], ["2026-03-02", "2026-03-01"]]) {
    assert.throws(() => applyTransactionDate(params(), {mode: "range", month: "", start, end}));
  }
  for (const month of ["", "2026-00", "2026-13", "2026-2", "bad"]) {
    assert.throws(() => applyTransactionDate(params(), {mode: "month", month, start: "", end: ""}));
  }
});

test("advanced drafts apply atomically, reset pages, and only clear uploads for changed accounts", () => {
  const original = params("month=2026-10&account=4&batch=6&search=shop&page=3&id=42");
  const draft = new URLSearchParams(original);
  draft.set("kind", "installment");
  draft.set("category", "uncategorized");
  const applied = applyTransactionFilters(original, draft);
  assert.equal(applied.get("batch"), "6");
  assert.equal(applied.get("month"), "2026-10");
  assert.equal(applied.get("kind"), "installment");
  assert.equal(applied.get("category"), "uncategorized");
  assert.equal(applied.get("page"), null);
  assert.equal(applied.get("id"), null);
  assert.equal(original.get("kind"), null);
  for (const upload of ["batch=6", "legacy=csv&importId=3", "legacy=json&importId=3"]) {
    const current = params(`account=4&${upload}`), changed = new URLSearchParams(current);
    changed.set("account", "5");
    const next = applyTransactionFilters(current, changed);
    for (const key of ["batch", "legacy", "importId"]) assert.equal(next.get(key), null);
  }
  assert.equal(applyTransactionFilters(original, params("period=all")).toString(), "period=all");
  assert.equal(applyTransactionFilters(params("search=shop"), params()).toString(), "period=all");
});

test("filter counts exclude date/search/default sorting and count an upload once", () => {
  assert.equal(transactionFilterCount(params("month=2026-10&search=shop&sort=newest")), 0);
  assert.equal(transactionFilterCount(params("account=4&kind=installment&category=uncategorized&source=import&sort=oldest&batch=6")), 6);
  assert.equal(transactionFilterCount(params("legacy=csv&importId=3")), 1);
});

test("date labels remain readable for month, closed/open ranges, and malformed links", () => {
  assert.equal(transactionDateLabel(params("month=2026-01")), "January 2026");
  assert.equal(transactionDateLabel(params("period=all")), "All time");
  assert.match(transactionDateLabel(params("start=2026-04-01&end=2026-04-30")), /Apr.*2026.*Apr.*2026/);
  assert.match(transactionDateLabel(params("start=2026-04-01")), /^From /);
  assert.match(transactionDateLabel(params("end=2026-04-30")), /^Through /);
  assert.equal(transactionDateLabel(params("month=bad")), "Invalid month");
  assert.equal(transactionDateLabel(params("start=2026-02-29")), "Invalid date range");
  assert.equal(transactionDateFilter(params("period=all"), new Date(2026, 9, 15)).month, "2026-10");
});
