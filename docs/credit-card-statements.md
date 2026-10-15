# Credit-card statements

## Delivered

- Import & Export → Import Credit Card Statement. Select exact existing card, currency, CSV; preview totals; acknowledge differences with explanation; confirm.
- `/statements`: Credit Card Dashboard; readable month navigation; newest persisted active issue month by default; compact issuer/card/status/search filters; collapsed imported-month/year/due-date filters. Explicit empty months remain selected. Issuer changes clear stale card selections; clear-all restores newest month. Existing multiple-card URLs remain supported.
- Currency-separated month KPIs; one tile per real active card; all same-month active issues shown, not only the latest. Original balance/minimum/due date/source limit/payment progress remain distinct. Missing statements stay unknown.
- Primary unified per-source-line table: issue-month scope, sale/post dates, merchant, issuer/card identity, signed amount, source/suggested/annotation type, category, reviewed payment source, notes, source action. Merchant/type/category/post-date filters, sorting, server pagination and counts. General Transactions stay separate.
- Secondary paginated archive; detail; latest 100 issues per card. Owner-scoped coverage diagnostics show persisted issue/line counts, issue IDs/card IDs/dates/currency/version state, separate legacy counts and ambiguous incomplete card identifiers. No automatic merge.
- Detail: paginated/searchable/sortable imported lines; category/type/notes overlays; private source download; statement-only payments; partial allocations; same-day confirmation; reviewed exact-amount evidence matches within seven days; payment corrections after removing allocations/evidence.
- Exact SHA-256 repeats link to existing issues. Same-date corrections require explicit supersede/additional-issue review. Superseded records remain accessible; allocated statements cannot be replaced.
- Source parser: `src/lib/credit-card-csv.ts`. Domain/schema: `server/lib/credit-card-statements.ts`. Read-only dashboard query: `server/lib/credit-card-dashboard.ts`, `server/routes/api/credit-card-dashboard.get.ts`. Authenticated mutation/detail APIs: `server/routes/api/credit-card-statements*`. UI: `src/pages/Statements.tsx`, `src/components/CreditCardActivity.tsx`, `src/components/CreditCardStatement*.tsx`. Existing ledger `StatementActivity.tsx` remains separate.

## Schema / infrastructure

Existing SQLite; no provider, dependency or environment changes. Additive idempotent schema initialization in statement service:

- `cc_statements`: issue metadata, currency, raw metadata, reconciliation, review, versions, private original BLOB/hash/parser version. Each row is its import batch.
- `cc_statement_lines`: immutable normalized/raw source, physical CSV record index.
- `cc_line_annotations`: separately audited overlays.
- `cc_payments`, `cc_allocations`, `cc_payment_evidence`: standalone tracker; shared account identities only.

Original bytes and all imported lines commit in one database transaction. No separate object-storage failure window. Operators must keep the existing SQLite file, WAL, backups private and persistent; never expose the database directory as static hosting. No new public file URLs. Downloads require authentication, owner lookup and SHA-256 verification; responses use `private, no-store`.

Legacy `statement_archives`, existing ledger-import tables remain unchanged. Legacy files remain available under Statements → Legacy reference archives; excluded from validated KPIs. No automatic migration: old files lack reviewed card/currency/required-field guarantees. Re-import via the dedicated importer when reviewed tracking is wanted. Card accounts retained by this domain cannot be physically deleted while referenced; archive them instead.

## Isolation audit / verification

`server/lib/credit-card-statements.test.ts` added to the existing test script. Covers provided 13-line sample, 1,505,142 positive minor units, −1,120,000 negative minor units, 1,496,931 closing balance; parser overflow/errors; issue-month filters; duplicates; two cards; currency grouping; owner rejection; annotations; 300,000 allocation leaving 1,196,931; later evidence; revisions; atomic rollback; split/same-day payments.

Tests snapshot `accounts`, `transactions`, `account_entries` and existing import/payment provenance before statement flows; require byte/row equality afterward. Source audit rejects statement service writes to general ledger/shared accounts. Domain imports no ledger/payment posting service. Editing/deleting an unrelated ledger transaction must leave statement bytes unchanged.

`server/lib/credit-card-dashboard.test.ts` registered in the existing test script: in-memory full fixture, preview nonpersistence, newest issue-month default, March-sale/April-issue grouping, unknown missing coverage, 26-line pagination/sorting, composed filters, annotations, allocations, superseded exclusion, cross-owner isolation, unchanged ledger/archives. `e2e-tests/credit-card-dashboard-live.spec.ts` exercises the real Import page through explicit confirmation, then dashboard/source/filters/empty-month/auth checks; captures pre-import and post-import responsive screenshots. It skips unless `LUNA_E2E_ISOLATED_URL` explicitly names a disposable server matching Playwright `baseURL`. No production seeding.

Tests, TypeScript, production build, browser/accessibility checks **not executed in this environment**; no passing result claimed. No execution/browser/SQL-query tool was available. Actual persisted owner counts and apparent UnionBank duplicates remain unverified. Runtime owner-scoped diagnostics make those counts inspectable without exposing merchant details or original bytes. Acceptance remains open pending real test execution and review.

## Correction diagnosis

Static evidence: old `src/pages/Statements.tsx` queried `credit-card-statements` with optional URL month/year, never initialized newest imported month, required a manually selected month for card coverage, rendered a large always-open form and only one-row-per-statement archive. Its line-item query existed only inside per-statement detail. Therefore primary cross-card activity did not exist; coverage remained unselected by default. Persisted-data absence versus stale filtering cannot be distinguished without live owner-scoped counts. A parser/sample file does not prove import. Legacy `statement_archives` and ledger `statements` remain separate from validated `cc_statements`; no conversion proposed. Correction adds no schema migration.

Screenshot evidence: none captured. The opt-in browser test will generate current pre-import/post-import screenshots; these are not historical before-correction screenshots. Manual 200% zoom, contrast, pointer/touch and screen-reader review remain required.

## Deliberate limits

- Two-decimal currencies only; explicit selection. No issuer-based PHP inference, currency conversion or mixed-currency totals.
- Actual cutoff/billing period remain Unknown; no inferred schedules.
- Card history limited to latest 100 issues; all issued statements remain reachable through server-paginated dashboard.
- Dashboard payment lists load only the selected card; line queries paginate server-side.
- Original source downloads remain byte-exact; spreadsheet users must treat their original CSV as untrusted. No generated statement export added.
- Charts, estimated schedules, predictive missing-statement detection, reminders and exports deferred (optional phase).
- No portfolio current-debt estimate. No reconciliation/posting into the Transactions ledger. Existing transaction-import tool remains separately labeled; statement-domain importer never calls it.

## QA

- [ ] Execute existing tests including new statement suite; TypeScript checks; production build.
- [ ] Import sample: 13 lines, zero differences, April issue month, original 14,969.31 PHP.
- [ ] Allocate post-issue 3,000.00 PHP: remaining 11,969.31; source unchanged; ledger unchanged.
- [ ] Re-import: Already imported. Corrected issue: explicit reviewed replacement.
- [ ] Other owner cannot access source, detail, annotations or payments.
- [ ] Keyboard-only navigation; visible focus; detail close restores trigger; native controls operate with touch; loading/errors announced.
- [ ] Verify 320px/200% layout; contained horizontal table scrolling; no lost labels/content; contrast meets WCAG 2.2 AA.
- [ ] Private persistent SQLite backups include originals; workspace JSON exports do not constitute statement backups.
