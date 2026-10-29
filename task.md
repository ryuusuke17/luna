# Compact Luna: Consistent Layouts and Clear Actions

Date: October 15, 2026.
Status: Implemented and verified. Existing financial workflows, live data, and private originals stay unchanged.

## Execution Checklist
- Done: continued the existing compact controls, typography, spacing, and dialog wrappers; no backend, financial-behavior, dependency, or prototype changes.
- Done: contextual header actions, a quiet transaction shortcut, accessible mobile search, destination-focus preservation, and drawer-to-transaction focus handoff.
- Done: account/planning record menus, compact account/bill lists, native payment-method disclosure, two-column mobile planning totals, and responsive transaction table/list views with identical records and actions.
- Done: shared confirmation layouts, Cancel-first focus, native date/month focus outlines, bounded inner scrolling, and visible wrapped keyboard focus at narrow/zoom-equivalent sizes.
- Done: all 106 Node checks, frontend typecheck, final production build, and whitespace checks. Windows sandbox readlink EPERM required an approved build retry with isolated storage.
- Done: scoped lint comparison across 22 changed/continued files finds no added diagnostics relative to HEAD; six existing errors and two existing warnings remain. The pre-existing hook warning's embedded source line number was normalized before comparison.
- Done: desktop/tablet/mobile screenshots inspected, including 1440/768/390 px and narrow 320 px. Existing 640x400 and 320x400 reflow, keyboard focus containment, and emulated touch checks pass. Evidence: test-results/compact-verified/ and test-results/compact-live-verified/.
- Done: updated PROJECT_GUIDE.md and the active-workspace override in DESIGN.md. The design detector reports only incumbent-font and marketing-reference token advisories; no font substitution or unrelated redesign is warranted.
- Done: final combined browser suite: 24 passed, 0 failed, 0 skipped (21 mocked UI checks and 3 authenticated real-API checks against disposable in-memory SQLite/private test storage). Includes the previously failing account-deletion focus/reflow and goal-confirmation layouts. Evidence: test-results/compact-browser-complete.log and test-results/compact-complete/.
- Done: stopped only the disposable fixture server on port 32101. The existing user preview remains running; no live database or private original was used for test uploads, resets, or deletions.

## Not Checked
- Physical devices and full screen-reader conformance. Automated browser, viewport, contrast, and keyboard checks do not establish those.
- No deployment, live-data import/reset/deletion, dependency change, commit, or prototype edit. The existing user preview at port 8080 still responds successfully.

---

# Transactions Filter Revamp

Date: October 15, 2026.
Status: Implemented and verified. Financial records and private originals unchanged; user dev server remains running.

## Current Execution

- Done: compact Date selector, visible Search, and Filter dialog; existing transaction table and entry/edit/void actions retained.
- Done: browser-local default month on fresh unfiltered visits, explicit Month/Custom range/All time, posted-date validation, cancellable date/advanced drafts, grouped Apply, staged Clear all, and active-filter count.
- Done: URL normalization, explicit-range precedence, period=all, pagination reset, account/upload/record link compatibility, and context-preserving date/search changes. No server/API/schema/dependency changes.
- Done: all 105 Node checks (8 new filter tests), frontend typecheck, scoped lint, and whitespace checks. New browser coverage includes four mocked UI checks and an authenticated isolated posted-date/no-financial-effects check.
- Done: combined focused browser run: 15 passed (12 mocked UI checks; 3 authenticated isolated real-API checks). One unrelated existing account-deletion focus-loop check failed at a narrow, zoom-equivalent viewport (e2e-tests/financial-record-management.spec.ts:77). Two other unrelated financial-dialog/budget checks were excluded; this was not a full browser-suite pass.
- Done: desktop/tablet/mobile toolbar, date chooser, and advanced dialog screenshots inspected at 1440, 768, and 390 pixels. Focus restoration, keyboard containment, dismissal, and no horizontal page overflow checked. Captures: test-results/transaction-filter-revamp/transaction-filters-toolba-0c9d3-blet-and-mobile-mocked-API-/.
- Done: production build, including all 105 Node tests, passed with isolated database/private-file paths. Windows sandbox readlink EPERM required an approved build retry; existing dependency-age/deprecation and bundle-size warnings remain.
- Done: read-only SQLite integrity check returned ok; all 18 financial/provenance table hashes and all 7 original-file hashes still match the earlier paired snapshot. Audit additions since that snapshot are one standalone statement upload and one statement link; no claim that the entire database matches the older snapshot.
- Done: stopped only disposable fixture server 32101. User server 8080 responds successfully. No backend/schema/dependency changes, live test imports, financial resets, commits, or deployment.
- Not checked: physical devices and full screen-reader conformance. Browser viewport/keyboard checks do not establish those; the unrelated account-deletion focus failure remains outside this filter change.

## Month Navigation Follow-Up

- Done: Previous month and Next month arrows immediately apply adjacent months, including year changes. Clicking the date label still opens the chooser; custom ranges/All time keep arrows disabled.
- Done: search/account/upload context and browser history retained; pagination resets. Nine focused unit tests, five mocked browser checks, frontend typecheck, scoped lint, and whitespace checks passed. Desktop/tablet/mobile toolbar screenshots inspected at 1440, 768, and 390 pixels under test-results/month-navigation/.
- Done: only an isolated temporary server/fixtures used; disposable server stopped, user server left running. No backend, database, dependency, or financial-data changes. Full suite/production build not repeated for this follow-up.

## Pagination Follow-Up

- Done: paginated transaction reads now return at most 20 rows. Existing Previous/Next controls handle the remaining records; unpaged compatibility reads and exports are unchanged.
- Done: authenticated isolated API/browser regression passed with 41 transactions across pages of 20, 20, and 1; all IDs distinct, Previous/Next controls verified. Scoped test lint and whitespace checks passed. No live financial writes; disposable server stopped, user server left running.

## Statements Upload Dialog Follow-Up

- Done: Statements-only header action is Add statement; the existing CSV upload, optional account/card link, and template download now live in its popup. The inline upload card is removed; transaction entry elsewhere is unchanged.
- Done: Cancel/Escape/Close preserve page context and restore focus. Reopening resets drafts, errors retain the file for retry, uploads cannot be dismissed while busy, and success focuses the stored statement.
- Done: two focused browser checks passed: one mocked responsive/keyboard/error check and one authenticated isolated real-API check covering uploads, originals, account linking, and unchanged financial reports/exports/imports. Desktop/tablet/mobile screenshots inspected at 1440, 768, and 390 pixels; no horizontal page overflow.
- Done: frontend typecheck, scoped lint, whitespace checks, and production build including the Node suite passed. Build used isolated data paths and an approved retry for the Windows filesystem-link restriction; existing build warnings remain.
- Done: PROJECT_GUIDE.md updated. Disposable fixture server stopped; user server 8080 remains available. No backend/schema/dependency changes or live financial writes.

## Acceptance

- Date selector first, Search second, Filter third. Advanced controls stay hidden until opened.
- Current month uses local calendar time. Ranges may be open-ended; invalid/reversed dates cannot apply. Legacy ranges override months.
- Draft edits and Clear all do not affect results until Apply. Cancel/Escape/dismiss discard drafts and restore focus.
- Filter count excludes dates/search/default sorting; upload restrictions count once. Account changes clear upload restrictions only when applied.
- Fresh visits use the current month; existing filtered/context URLs retain their date scope. All time, filters, search, and navigation remain stable; filter changes reset pagination.
- Keep existing visual language and all financial/import/archive behavior. No live test imports or data reset.

---

# Import & Export and Standalone Statements

Date: October 15, 2026.
Status: Implemented and verified. User dev server running; existing financial data and private originals preserved.

## Execution

- Done: stopped the owned dev server for a consistent snapshot; verified SQLite integrity, 19 table hashes, and all 7 private files. Recovery snapshot: backups/page-separation-20261015-c9a7f46e-9a24-4d7d-a369-b77b63e0169f.
- Done: Import & Export owns transaction uploads, exception resolution, import history/originals, and existing CSV/JSON exports. Transactions retains only ledger filters/details and Add/Edit/Delete. Settings and account deletion now link to the export page instead of mounting export controls.
- Done: standalone Statements upload/list/detail, optional reference-account link, raw fields/warnings, original downloads, filters/pagination, separate storage/table/API, ownership/CSRF checks, file integrity, atomic rollback, and duplicate/stale-link protection.
- Done: desktop/mobile navigation, account shortcuts, old upload/legacy redirects, transaction-source links, Help, and PROJECT_GUIDE.md. Existing imports remain import history; the standalone archive starts empty.
- Done: 97 Node regression checks; frontend and focused backend typechecks; production build (approved Windows filesystem-permission retry). New archive modules/pages pass scoped lint; two pre-existing explicit-any findings remain in the older request-auth helpers. No dependency added.
- Done: read-only comparison before startup confirms all 19 existing financial/provenance table hashes and all 7 private-original hashes exactly match the paired snapshot. No live test uploads or reset.
- Done: final combined browser run passes all 9 checks: 7 mocked UI checks and 2 authenticated isolated real-API checks. Desktop/tablet/mobile screenshots inspected; keyboard navigation, exception resolution, downloads, old links, Add/Edit, and archive isolation covered. No live test imports.
- Done: user dev server restored on port 8080. Transactions, Import & Export, Statements, and the auth API return HTTP 200. Post-startup read-only comparison confirms SQLite integrity, all 19 existing financial/provenance table hashes, and all 7 original files match the recovery snapshot; the new archive table exists and remains empty.
- Not Checked: physical-device behavior and full screen-reader conformance. The unrelated Goals deletion-dialog overflow remains outside this change.

## Agreed Scope

- Give transaction data transfers a dedicated Import & Export page.
- Keep Transactions focused on posted transactions, filters, Add, Edit, and Delete.
- Add a separate Statements page that stores credit-card statement documents and their contents without posting anything.
- An optional account/card association on a stored statement is reference information only.
- Preserve the current visual design, existing financial data, Type/Category separation, optional categories, and manual installment overrides.

## 1. Page Responsibilities

| Page | URL | Owns | Financial effect |
| --- | --- | --- | --- |
| Transactions | /transactions | Posted ledger records, filters, transaction details, Add/Edit/Delete | Existing ledger behavior only |
| Import & Export | /import-export | Transaction CSV import, import results/history, Needs attention, original import downloads, CSV/JSON exports | Explicit transaction imports can post eligible rows |
| Statements | /statements | Archive-only CSV upload, statement list/detail, summary, source rows, original download, optional account/card link | None |

Important: the same CSV uploaded through Import & Export can create transactions. Uploaded through Statements, it only stores a statement. There is no automatic handoff between these workflows.

### Transactions

- Remove Import transactions, Export all transactions, Needs attention, and the Import history panel from this page.
- Keep existing ledger filters, separate Type/Category columns, Add/Edit dialogs, and transaction correction/void behavior.
- Keep account/upload filters so View transactions links from import history still show the correct posted records.
- Keep read-only import provenance inside transaction details. Its source link opens the selected upload on Import & Export, not an inline importer.
- Do not load import-history or exception-management data merely to render the Transactions page.

### Import & Export

- Add this page to desktop and mobile navigation, using existing components and styling.
- Provide Import, Export, and Import history tabs. Needs attention is a filter within import history, not a ledger state.
- Move the current CSV importer and exception/history interface here; do not build another posting pipeline.
- Require an owned account/card for transaction imports; account-detail shortcuts preselect it on this page.
- Preserve both supported transaction CSV layouts, source identity/duplicate protection, exact amounts, repayments, optional categories, automatic installments, and explicit Type overrides.
- Show imported / need attention / already imported counts here. Offer View transactions with the account/upload filter rather than forcing navigation away from unresolved rows.
- Move the existing transaction CSV and workspace JSON export controls here, including the duplicate controls currently in Settings > Privacy. Privacy retains its privacy information and a navigation link.
- Preserve current export formats and scope: CSV is all owned posted transactions; workspace JSON remains schema_version 3. These are not automatic restore files and do not contain private originals or the new standalone statement archive. State this beside the controls; do not silently change the export contract.
- Keep statement-document upload/download on Statements, as the requested archive-only exception. This page can link to Statements but must not choose an import destination automatically from file contents.

### Statements

- Use a new archive-only screen; do not mount the retired BankStatements or Imports pages, which still contain historical posting/review controls.
- Label the action Upload statement and show: Stored for reference only. Transactions and account balances will not change.
- Support one full-statement CSV per upload. No PDF, Excel extraction, or legacy transaction JSON upload on this page.
- List issuer, statement title/month, statement date, due date, linked account/card or Unlinked, outstanding balance, original filename, and upload date.
- Provide issuer/account/date filtering, bounded pagination, and a detail view containing all supplied summary fields, notes, source rows, and Download original CSV.
- Permit choosing or changing an optional owned account/card association. Preserve a display-name snapshot if the account is later unavailable.
- An account-detail link may open its Statements list. This association must not change the account's balance, credit limit, issuer, opening date, due date, payment instruments, or reporting totals.
- Do not offer Post transactions, Continue import, reconciliation, statement-payment allocation, repayment creation, or balancing adjustments here.
- Do not create category records, run merchant rules, or require funding accounts. Type and Category remain source text, including blank values; installment markers and notes remain statement content.

## 2. Statement File Contract

Accept the supplied metadata labels:

Issuer; Statement month/title; Statement date; Due date; Credit limit; Previous balance; New charges; Payments/credits; Outstanding balance; Minimum due; Statement notes.

The table uses this exact header order:

```csv
Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes
```

- Reuse the existing pure CSV tokenizer, full-statement parser, date parsing, and exact-money helpers where their contract fits. Do not reuse the transaction-upload service.
- Accept quoted month-name dates and merchants containing commas. Quotation marks used as CSV delimiters do not become merchant text; escaped literal quotes remain literal source content.
- Accept surplus empty trailing cells in the supplied sample. Never silently drop a nonempty unexpected cell.
- Preserve original CSV bytes, raw metadata, raw rows, optional blank Type/Category/notes, and signed amounts. Normalize monetary values into exact integer minor units for display/calculation, never binary floating-point totals.
- Reject unreadable, oversized, malformed CSV and unsupported layouts. Retain malformed source field values with visible warnings instead of coercing them into valid dates, zero amounts, or financial records.
- Statement/due dates are document dates; future due dates are allowed. Do not apply ledger posting-date restrictions to archival metadata.
- Declared summary totals remain authoritative source metadata. A mismatch against the included rows is informational, not an approval gate, and never produces an adjustment.
- The supplied five rows total PHP 6,961.83 while New charges declares PHP 15,051.42. Save both as supplied; do not invent missing purchases. Its balance equation does reconcile: 11,117.89 + 15,051.42 - 11,200.00 = 14,969.31.

## 3. Hard Separation of Storage and APIs

### Existing transaction imports: retain compatibility

- POST /api/statements currently calls importTransactions and can immediately post ledger transactions. Keep that API and its detail/download/action endpoints compatible for the relocated transaction importer.
- Keep existing statements, statement_entries, statement_decisions, source identities, reconciliation evidence, repayment allocations, and transaction links intact. They remain import provenance, not the new standalone archive.
- Do not turn /api/statements into an archive-only endpoint and do not add a request flag that silently switches its accounting effect.

### New standalone archive

- Add a separate statement_archives table. A single archive record can hold validated summary JSON, raw summary JSON, parsed/raw row JSON, and warnings within the existing upload/row limits; a second financial-entry system is unnecessary.
- Include owner ID, optional account ID, account display-name snapshot, filename, private file key, source SHA-256, parser version, size, upload timestamp, and a stale-edit/version token for account relinking.
- Use an account reference with ON DELETE SET NULL. Existing account deletion remains governed by its existing financial/provenance safeguards; a standalone archive alone must neither delete the document nor introduce a financial lock.
- Use a separate private archive-only subdirectory under the configured private statement root. Keep randomized server-generated keys, ownership checks, safe filenames, and production private-storage requirements.
- Idempotency is separate from transaction imports: identical bytes for the same owner return the same archived document. A different selected account must not silently reassign it; relinking is explicit. Different files for the same issuer/month are not silently merged or overwritten.
- Complete the private-file write and database save safely before reporting success. Failed commits leave no dangling document reference; cleanup touches only newly created unreferenced staging files. Existing originals are never overwritten.
- Audit archive upload and account-link changes, without creating financial audit actions or ledger writes.

Planned endpoints:

| Endpoint | Purpose |
| --- | --- |
| GET /api/statement-archives | Owner-scoped, paginated archive list and filters |
| POST /api/statement-archives | Validate and store an archive-only CSV |
| GET /api/statement-archives/:id | Summary, source rows, warnings, optional account reference |
| PATCH /api/statement-archives/:id | Explicit version-checked account association or unlink |
| GET /api/statement-archives/:id/download | Authenticated original CSV download |

Every mutation retains authentication, ownership, CSRF/origin checks, strict input validation, upload limits, and stale-edit protection. Downloads use private/no-store and nosniff headers. The archive service must not import or call the ledger, importTransactions, autoImportStatement, resolution, reconciliation, or payment-allocation services.

## 4. Existing Links and Data

- /imports redirects to /import-export, preserving account, selected upload, and compatible legacy import identifiers; convert the old statement query parameter to batch.
- Plain /statements opens the new standalone archive. Old /statements?statement=ID or /statements?batch=ID links still open the historical transaction import on /import-export. Never interpret a legacy import ID as an archive ID.
- /transactions?upload=1&account=ID opens Import & Export with that account selected.
- /transactions?batch=ID&account=ID remains a valid filtered ledger view. Do not redirect these read-only links away from Transactions.
- Update account shortcuts, transaction-source links, navigation, and Help text. Retain legacy API read/download compatibility.
- Existing imported statements remain import history. Do not move them to the new archive, copy them automatically, detach their provenance, or post previously pending rows.
- Keep standalone archives and their private originals out of legacy import removal and sample-reset cleanup. Do not run a workspace/sample reset as part of this work.

## 5. Implementation Sequence

1. Create and verify a recoverable database plus full private-files snapshot before schema changes. The existing backup script covers SQLite only, so pair it with a private-files copy and integrity/hash manifest. Quiesce writes while capturing the pair. Preserve the current dirty worktree and user CSV reference files.
2. Create Import & Export, move existing importer/history/exception/export controls there, and clean Transactions. Keep the ledger and import/export behavior unchanged during this first step.
3. Add the separate archive table, private storage path, archive-only service, and authenticated endpoints. Prove no financial side effects using isolated database/private-file fixtures before connecting the UI.
4. Build Statements using existing visual patterns, with archive upload, list/detail, original download, and optional account association. Add desktop/mobile navigation and account-detail links.
5. Add the compatibility redirects, update existing browser checks for their new page ownership, and document the new routes, storage boundaries, and backup/export limitations in PROJECT_GUIDE.md.
6. Run isolated server tests, frontend/backend typechecks, browser checks, and the production build. Inspect desktop/tablet/mobile screenshots and keyboard behavior. Report unrelated pre-existing failures separately.

Likely implementation touchpoints:

- src/App.tsx, src/components/AppLayout.tsx, src/pages/Transactions.tsx, src/pages/Accounts.tsx, src/pages/Settings.tsx, src/pages/Help.tsx.
- New src/pages/ImportExport.tsx and src/pages/Statements.tsx; reuse src/components/TransactionImports.tsx, src/components/ExportButton.tsx, and the transaction-only upload dialog.
- New server/lib/statement-archives.ts and server/routes/api/statement-archives routes; additive server/lib/db.ts schema changes. Keep server/lib/statements.ts on its existing transaction-import contract.
- Reuse server/lib/statement-csv.ts only for side-effect-free parsing; any extension must preserve its transaction-import behavior and tests.
- Isolated server and browser fixtures, package.json test registration if a new test file is added, task.md, and PROJECT_GUIDE.md. No new runtime dependency is planned.

## 6. Acceptance Checks

- Transactions has no upload, export, import-history, or exception-resolution controls. Existing Add/Edit, Type/Category tabs, filtering, balances, and correction/void actions still work.
- Import & Export retains both CSV layouts, account preselection, duplicate handling, repayments, optional categories, exception recovery, original downloads, and the existing CSV/JSON output contracts.
- Import history can open its posted rows in a filtered Transactions view; uncertain rows remain managed on Import & Export.
- Upload the supplied UnionBank statement on Statements. Confirm all metadata, five merchants/rows, exact amounts, notes, optional blanks, and original CSV bytes round-trip correctly.
- Before/after archive upload, duplicate retry, viewing, download, linking, and unlinking: transaction IDs/counts/versions, account_entries, account balances/metadata, budgets, income/spending/refund reports, categories, bills, repayments, import provenance, and existing private originals remain unchanged. Only archive records/files and archive audit events may change.
- Linking to an account that already has matching transactions does not match, modify, duplicate, or lock those transactions. Changing the link also has no financial effect.
- Same-file archive retry returns the existing archive; uploading that file independently through the transaction importer still follows that importer's normal duplicate/posting rules.
- Unauthorized reads/uploads/downloads/relinks, malformed files/fields, nonempty extra cells, invalid account IDs, stale relinks, missing private storage, failed file writes/commits, and retry recovery fail safely.
- In isolated fixtures, permitted account deletion leaves its standalone archives/originals intact and unlinked. Legacy provenance protections and sample-reset exclusions remain effective.
- Verify old-link routing, exact download contents, empty/error states, keyboard focus, tabs, and responsive layouts. Clearly distinguish mocked browser tests from authenticated real-API checks; never use the live financial database for test imports.

## Not Included

- No statement-to-ledger automation, reconciliation, balance adjustments, future-installment generation, or payment allocation from the archive.
- No PDF/Excel extraction, bulk ZIP export, workspace restore, new JSON-import format, archive row editor, or automatic conversion of old imports into standalone statements.
- No unrelated redesign, financial migration/reset, dependency expansion, commit, or deployment as part of this planning request.

---

# Previous Delivery: Transaction-First Imports

## October 15 Follow-Up: Separate Type and Category
- Done: separate Type and Category columns/details; independent classification tabs in Add/Edit retain draft values and existing styling. Compatible purchase/refund categories survive type changes; income-group changes and transfers clear incompatible categories.
- Done: accept Sale date, Post date, Merchant, Amount, Type, Category, Transaction notes and update the downloadable template. Preserve old layouts, quoted merchants, exact amounts, optional categories, automatic installments and explicit type overrides. Empty trailing CSV cells remain accepted; nonempty unknown cells remain unresolved.
- Validation: all 86 Node tests, frontend/focused backend typechecks and production build pass. Four relevant browser tests pass: two mocked responsive imports, one authenticated isolated real-API import/form/download test and one mocked currency/edit/delete test. The authenticated test also passes its final rerun with Category-tab screenshots.
- Validation: Type and Category screenshots inspected on desktop/mobile; Category also inspected at tablet width. Keyboard tab navigation and draft retention pass. No live financial data changed; user dev server retained.
- Not Checked: the broader financial-dialog accessibility test stops at horizontal overflow in the unrelated Goals deletion confirmation, after the transaction dialog checks pass. Physical-device and screen-reader conformance remain unverified.

## October 15 Follow-Up: Automatic Installments
- Done: merchant markers such as (04/12) default imported expenses to Installments across both CSV layouts and the CSV compatibility API. Manual type changes remain authoritative before and after posting; refunds, income, transfers and private originals stay unchanged.
- Validation: reproduced missing CSV detection with three failing regression checks, then fixed import-only inference. All 84 Node tests and frontend/focused backend typechecks pass. Tests use isolated data; no live financial imports or browser checks run for this follow-up.

## October 15 Follow-Up: Types and Merchants
- Done: capitalized transaction labels; selectable Installments in creation, editing, filters and exception correction. Only billed spending counts; no future schedule is generated. Existing transfers/refunds are not reclassified automatically.
- Done: Merchant is the primary transaction column; description remains separate. Full-statement source descriptions populate merchant on new imports; source-backed legacy display and CSV exports are corrected without rewriting financial history. Original files and raw rows remain unchanged.
- Validation: 81 Node tests pass; frontend and focused backend typechecks pass. Three browser tests pass: two mocked responsive import checks and one authenticated isolated test covering installment creation, filtering, correction, merchant fields and exact spending totals.
- Desktop 1440px and mobile 390px screenshots visually inspected. No page overflow; transaction table retains accessible horizontal scrolling on mobile. Production build passes after approved Windows permission retry. Design detector reports no findings. Existing lint debt remains; new helpers and changed frontend files add no lint findings.

Updated: October 15, 2026. Implementation and isolated validation; no live-workspace migration or deployment.

## Done
- Transactions owns CSV import, account/card selection, upload/account filters, Needs attention, compact history, originals, and Show all transactions. Existing design retained.
- Both existing CSV layouts post clear rows through the canonical ledger. Invalid/ambiguous rows remain unposted; installments post billed amounts only.
- Categories accept unset values during import, manual creation, and correction. Reports, filters, and exports include uncategorized rows; no forced category creation. Explicit invalid category IDs remain rejected.
- Stable source identities link only when financial details agree. Other possible duplicates require explicit resolution; same-file and matching resolution retries remain idempotent.
- Repayments remain one funding-account-to-card transfer. Both source orders, wrong funding, refunds, report totals, and opposite-side linking have isolated coverage.
- Audited exception correction, save-fields/refresh, linking, separate import, skip, stale checks, atomic rollback, and explicit Continue import reuse retained originals/provenance.
- Old Imports/Bank Statements URLs redirect into Transactions. Active verification/allocation controls, warnings, and JSON-import interface are retired; legacy APIs and historical reads remain.
- One-time retirement verifies a recoverable SQLite/private-original snapshot before audited reopening. Existing financial identities/entries/allocations remain intact; old pending uploads do not auto-post.
- PROJECT_GUIDE.md documents architecture, current workflow, dependencies, endpoints, migration/recovery, and verification boundaries. No dependencies added.

## Validation Results
- Node suite: 77 passed, 0 failed. Temporary SQLite/original fixtures cover mixed/invalid uploads, duplicate and repayment rules, optional categories, stale/unauthorized edits, failed commits/recovery, snapshot preservation, and missing-original abort.
- Frontend typecheck and focused backend typecheck: passed.
- Production build: passed. Nitro required an approved outside-sandbox retry after Windows readlink EPERM; build/test environment points only at temporary paths. Existing bundle-size, outdated browser-data, and plugin deprecation warnings remain.
- Focused import browsers: 3 passed. Mocked desktop/mobile tests verify upload, errors/retry, keyboard resolution, filters and original-file links. Separate authenticated browser test verifies real session/CSRF, SQLite posting, exact report deltas, repayments, byte-identical original download, exports, field correction/continuation/linking, blank-category creation/assignment/clearing, and redirects.
- Full browser suite: 10 passed, 2 failed. Both failures are in the unchanged account-deletion dialog: horizontal overflow and focus-loop containment at narrow/zoom-equivalent sizes. These are not import-flow passes and were not hidden or weakened.
- Desktop 1440px and mobile 390px authenticated screenshots visually inspected. Mobile history readability fixed; final confirmation captures inspected. Keyboard import/resolution and account-context Escape/opener behavior pass. No horizontal page overflow in the import checks.
- New implementation/test files pass focused lint. Repository-wide lint remains 95 errors / 10 warnings; comparing each currently failing/warning file with HEAD finds no added diagnostics. Existing explicit-any, UI-primitive and configuration debt remains.
- Design detector on changed transaction/import UI: no findings. git diff --check: passed.

## Not Checked
- Real-owner database migration or live financial import: intentionally not run. First upgraded startup performs the guarded snapshot/retirement; previously pending uploads require explicit Continue import.
- Physical devices, screen-reader conformance, and authenticated production deployment are not covered by emulated browser checks.
- Unrelated account-deletion accessibility failures remain for a separate change.

## Evidence and Recovery
- Authenticated captures: test-results/transaction-first-live-aut-15496-edirects-isolated-real-API-/authenticated-desktop.png and authenticated-mobile.png. These use fictional temporary data.
- Browser logs: temporary luna-transaction-first-browser-final.log and luna-transaction-first-focused-final.log. Build log: temporary luna-transaction-first-build-final.log. Full lint diagnostics: temporary luna-transaction-first-lint.json.
- Migration snapshots: migration-backups/transaction-first-<UUID>/ beside the configured database. Preserve luna.sqlite, private-statements/, and manifest.json together; stop application processes before any restore.
- Existing user changes preserved: DESIGN-revolut.md deletion, DESIGN.md, supplied statement files, and prior PROJECT_GUIDE.md content outside this workflow update. No sample reset, live import, commit, or branch creation.

# Per-Statement Filtering and Transactions Separation

Date: October 19, 2026.
Status: Complete. Source activity stays read-only; ledger behavior unchanged.

## Done
- Exact owner/card-scoped statement queries include every imported source line; explicit correction-chain links show only active ledger transactions without duplicate rows.
- Account details and Statements reuse statement activity in Per statement mode; account details also filters statement source lines by issue month while preserving calendar month as posted-date ledger history. Main Transactions is limited at the query level to manually entered records with no credit-card account relationship; calendar/custom/all-time ledger controls remain available.
- Independent Statements selector scopes cards and activity together, supports older choices, and preserves separate source-detail state. URL transitions retain activity filters and reset pages without stale issue rows.
- Account 4 / statement #2: Account details and Statements retain the same 20 source lines, including August purchases, September installments, and the PHP -11,000.00 credit. Main Transactions strips statement-mode URLs and remains scoped to manual non-card ledger records.
- Read-only before/after SHA-256 checks match all 10 financial/source tables, including ledger entries, statement original bytes, decisions, annotations, and payment evidence. No live imports, posting, relinking, migrations, payment changes, commits, branches, or prototype edits.

## Verification
- Full `npm.cmd test`: 153 passed. App TypeScript check and production build: passed. `git diff --check`: passed.
- Playwright: the earlier mocked filter/navigation/loading/error/keyboard/responsive checks and disposable real-API integration passed. The updated focused browser run passes four checks covering main Transactions separation and the Accounts/Statements activity paths; API tests verify that card and imported rows are excluded before totals and pagination.
- Earlier responsive screenshots apply to the card account and Statements views. The main Transactions regression check verifies that legacy statement URLs are removed and the page requests the manual non-card scope.
- Full lint: 117 existing errors and 12 warnings remain. ESLint comparison against HEAD across all 17 changed TypeScript files finds zero introduced diagnostics; see `test-results/per-statement-lint-delta.json`.
- Logs: `test-results/per-statement-node-final.log`, `test-results/per-statement-types-final.log`, `test-results/per-statement-build-final.log`, `test-results/per-statement-lint-final.log`, `test-results/per-statement-browser.log`, and `test-results/per-statement-isolated.log`. Data evidence: `test-results/per-statement-live-before.json` and `test-results/per-statement-live-after.json`.

## Not Checked
- Physical-device and full screen-reader conformance; browser viewport and keyboard checks are emulated. No production deployment or live financial writes performed.

# Statements Page Tabs and Independent Filters

Date: October 20, 2026.

## Done
- Split the global Statements route into URL-backed Statement transactions (default) and Statements tabs. Imported activity and issued-statement metadata now use separate URL keys and separate server queries, so each tab keeps its own filters and pagination.
- Added independent activity card, issue-month, exact-statement, and line filters. Added a compact Apply/Reset popover for statement metadata and a dense month-grouped statement list, without changing the Accounts page's compact statement rows.
- Updated the account's “All statements for this card” link and statement detail navigation to open the intended tab and preserve the statement scope.

## Verification
- Frontend TypeScript check, focused credit-card dashboard tests (2 passed), focused ESLint (0 errors; one existing AccountDetails hook warning), Playwright spec discovery, and `git diff --check`: passed. Impeccable detector on the changed UI files: no findings.
- Authenticated browser flow was not run because `LUNA_E2E_ISOLATED_URL` is unset. The live dev workspace was left untouched; no transaction or statement data was written or moved.

# Statement List Navigation on Statements and Credit-Card Accounts

Date: October 20, 2026.

## Done
- Removed tracker-status text and tracker-evidence labels from every shared issued-statement list layout. Statement metadata, grouping, and list pagination are unchanged.
- Renamed the list action to `onView`. Both pages now open Statement transactions scoped to the clicked statement; account navigation carries only `activityStatement`, while the Statements page clears previous activity filters and retains inactive list filters.
- Added navigation-state focus handling for the active transactions tab, preserved browser Back context, and retained independent detail entry through account activity's `Open statement` link.
- Updated existing navigation/detail tests and added a mocked account #4 fixture with two statements in the same month and 27 source lines to cover exact membership, pagination, out-of-month sale dates, refresh, Back, older statement choices, keyboard activation, and mobile taps.

## Verification
- Seven focused Playwright regressions passed across the final runs: five new navigation/detail checks, the independent activity-selector regression, and the shared approval/account-history regression. All browser API responses were mocked, including approval in the shared regression; no live financial data was changed.
- Visually inspected desktop (1440 px) and mobile (390 px) captures of both statement-list layouts; labels are absent, controls remain aligned, and the browser checks found no document overflow.
- Frontend TypeScript check and the full unit-test step of `npm.cmd run build` passed. The sandboxed build reached Nitro dependency tracing and hit a filesystem-link permission error; the standalone production build succeeded when rerun with the required filesystem access.
- Focused ESLint: zero errors and one existing AccountDetails hook-dependency warning. Impeccable detector: no findings. The optional disposable-server import test was updated; it was not executed against the live workspace.

# BDO Product Dropdown Labels

Date: October 20, 2026.

- Removed the leading BDO name from product option labels in the shared account dialog, including existing/custom selected products. Underlying option values and saved product identities remain unchanged.
- Verified the live account editor shows Visa Debit and Mastercard Debit, with Mastercard Debit still selected. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bdo-product-labels.png.
- Focused ESLint, git diff whitespace check, and Impeccable detector passed (no findings). Frontend TypeScript check is blocked by the existing unrelated Goals.tsx:92 onPointerDownOutside prop error.

# Optional Account Name Saves

Date: October 20, 2026.

- Create and edit APIs now accept omitted, empty, and whitespace-only account names and generate the default name through the same helper as the form. Provider prefixes are included once, so blank BDO names become BDO Mastercard Debit. Explicit-name validation, account concurrency checks, and financial entries are preserved.
- Added real authenticated in-memory API regressions for blank/whitespace/omitted names, default type names, invalid/custom names, stale saves, and unchanged transactions/balances. Added a mocked browser edit regression; Playwright discovers it and the existing creation regression.
- npm test: 159 passed. Focused component/helper/new-test ESLint, Impeccable detector, and whitespace checks passed. App TypeScript check still reports the unrelated existing Goals.tsx:92 onPointerDownOutside prop error.
- Live UI: cleared the selected BDO account name and clicked Save changes; the editor closed successfully and the account now displays BDO Mastercard Debit. This was the requested account-name setting save. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/blank-account-name-saved.png.
- Follow-up from the reopened-editor screenshot: accounts with an automatically generated name now show an actually empty account-name input when edited again; custom account names remain in the field. Saved BDO account still displays as BDO Mastercard Debit. Reopened the live editor and verified the name input is blank, then saved it blank successfully. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/optional-account-name-field.png.
- Follow-up focused ESLint, git diff whitespace check, and Impeccable detector passed (no findings). The new mocked browser regression asserts the generated-name field is empty; it was not run in this follow-up.

# Bill Summary Rows

Date: October 20, 2026.

- Bill rows now show a bill-type icon, concise name/account/category summary, and a larger amount. Removed the per-row status and reminder-preference text, and replaced the overflow menu with separate icon-only view, edit, and payment buttons.
- Visually checked the live `/bills` page: electricity uses a lightning icon, mobile uses Wi-Fi, rent uses a home icon, amounts stand out, and each row has individual icon actions. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bills-summary.png.
- Focused ESLint, git diff whitespace check, and Impeccable detector passed with no findings. No automated tests run in this pass.

# Bill Name Type Size

Date: October 20, 2026.

- Increased bill names from `text-sm` to `text-base` so they stand out more clearly from account and category details.
- Verified the live `/bills` page after refresh. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bills-larger-title.png.
- Focused ESLint and `git diff --check` passed. Impeccable detector was unavailable in this shell (`impeccable.cmd` was not found). No automated tests run in this pass.

# Capitalized Bill Cadence Options

Date: October 20, 2026.

- Capitalized the cadence option labels in the bill reminder editor while retaining lowercase submitted values (`once`, `monthly`, `quarterly`, `yearly`).
- Verified the live edit dialog displays Once, Monthly, Quarterly, and Yearly, with Monthly still selected. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bill-cadence-capitalized.png.
- Focused ESLint and `git diff --check` passed. No automated tests run for this label-only change.

# Bill Details Dialog Layout

Date: October 20, 2026.

- Widened the bill details dialog and reorganized its content into a prominent amount panel, a labeled details grid, and a distinct action footer. The grid shows due date, account, reminder preference, category, and notes.
- Verified the refreshed live dialog visually and through its accessibility tree. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bill-details-dialog.png.
- Focused ESLint and `git diff --check` passed. No automated tests run for this layout adjustment.

# Bills Mark-as-Paid Controls

Date: October 20, 2026.

- Removed the row-level edit icon. Unpaid reminders now show a text Mark as paid button that opens the existing full-payment ledger form; its title and submit action use the same wording. Paid reminders show a green check and Paid status.
- Verified the live Upcoming and Paid tabs and opened then closed the payment form without submitting. Screenshots: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bills-mark-as-paid.png and C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bills-paid-status.png.
- Focused ESLint and `git diff --check` passed. No automated tests run for this UI change.

# Tighter Bill Row Text Spacing

Date: October 20, 2026.

- Reduced the gap between bill names and account/category details by removing the fixed title height and tightening line height and metadata margin.
- Verified the live Bills list, including the apartment rent row. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bills-tight-text-spacing.png.
- Focused ESLint and `git diff --check` passed.

# Bill Payment Account Selection

Date: October 20, 2026.

- Removed Account from the add/edit reminder form. Unpaid reminders can now be saved without an assigned account; Mark as paid requires the account used for the posted ledger expense. Credit repayments ask for both the card and funding account.
- Added a migration that makes legacy bill accounts nullable while preserving existing reminder rows and bill-payment foreign keys. The chosen payment account is stored with the reminder after payment.
- Verified both dialogs in the live app without submitting a payment. Screenshots: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bill-reminder-no-account.png and C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/bill-payment-account-choice.png.
- `npm test`: 161 passed. Focused ESLint with the repo's pre-existing explicit-any rule suppressed, TypeScript `--noEmit`, and `git diff --check` passed.

# Transaction Source in Details

Date: October 20, 2026.

- Removed the Source column from the desktop transactions table and source labels from compact rows. The View dialog now includes the transaction source alongside account and category details.
- Verified the table headers no longer include Source and the selected transaction dialog shows Source: manual. Screenshots: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/transactions-without-source-column.png and C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/transaction-source-in-dialog.png.
- Focused ESLint, TypeScript `--noEmit`, and `git diff --check` passed.

# Statement Type Column Padding

Date: October 20, 2026.

- Increased horizontal padding on the Type icon column in the statement-transactions table from 12px to 20px per side.
- Verified the live Statements page visually. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/statement-type-column-padding.png.
- `git diff --check` passed.

# Statement Sale Date Column Padding

Date: October 20, 2026.

- Reduced horizontal padding on the Sale date column from 16px to 12px per side, leaving the Type column spacing unchanged.
- Verified the live Statements page. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/statement-sale-date-padding.png.
- `git diff --check` passed.

# Three-Column Budget Cards

Date: October 20, 2026.

- Budget cards now use two columns at small-screen widths and three columns from the desktop `lg` breakpoint.
- Verified the live Budgets page at desktop width. Screenshot: C:/Users/Mikey/.codex/visualizations/2026/10/20/01a15985-8084-7aa3-a33a-e8dc35b133f7/budgets-three-column-desktop.png.
- Focused ESLint and `git diff --check` passed.
