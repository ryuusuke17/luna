# Luna Project Guide

Updated: October 15, 2026 (Asia/Shanghai). Source baseline: `0f5cd21` plus existing working-tree changes.

This current-source map supports focused, behavior-preserving changes. It describes implemented code, not assumptions from older documentation or prototypes. Refresh the relevant sections after changing routes, contracts, storage, or accounting.

## 1. Project Identity and Scope

Luna is a private, self-hosted personal-finance workspace for accounts, transactions, budgets, bill reminders, goal allocations, and imported statements. It records financial activity; it does not connect to banks or execute payments.

Two distinct applications coexist:

| Area | Role | Persistence |
| --- | --- | --- |
| `src/` and `server/` | Actual React application and same-origin Nitro API | SQLite plus private statement originals |
| `ui/detailed.html`, `ui/detailed.css`, `ui/detailed.js` | Independent, hash-routed reference prototype | Fictional in-memory state, reset on reload |

The prototype is not imported by React. Editing `ui/detailed.js` does not change the Vite workspace.

Analysis covers routing, frontend requests, domain logic, schema, private storage, contracts, and tests. The active app now separates the ledger, transaction data transfers, and reference-only statements. The October 15 compact-workspace continuation refines this React app, not the standalone prototype; the current checks are recorded in task.md.

Transaction import posting remains unchanged, but its interface moves to Import & Export. Standalone Statements uses its own additive table and private subdirectory. Validation uses disposable databases/private files; no test uploads or resets run against live records. The implementation snapshot and exact validation results are in task.md. Dependencies remain unchanged.

## 2. Repository Map

```text
luna/
  index.html                         Vite HTML entry and root element
  package.json                       Dependencies and runnable scripts
  pnpm-lock.yaml                     Dependency lockfile
  pnpm-workspace.yaml                Package build-permission configuration
  vite.config.ts                     React/SWC, Dyad tagging, Nitro, @ alias
  nitro.config.ts                     Server source directory
  tailwind.config.ts                 Theme mapping, scales, breakpoints
  postcss.config.js                   Tailwind/PostCSS processing
  tsconfig*.json                     TypeScript project settings
  eslint.config.js                   Existing lint rules
  components.json                    shadcn generator settings
  vercel.json                        Existing SPA rewrite configuration
  AI_RULES.md                        Repository implementation conventions
  DESIGN.md                          Current working-tree design reference
  README.md                          Product, imports, security, operations
  PROJECT_GUIDE.md                    This architecture/change map
  src/
    main.tsx                         Bootstrap; imports globals.css
    App.tsx                          Providers and all React Router routes
    globals.css                      Active tokens and global styles
    App.css                          Unreferenced starter stylesheet
    pages/                           Route-level screens
    components/                      Shared finance/workspace components
      ui/                            Existing Radix/shadcn primitives
    lib/                             API, money, CSV, messages, directory helpers
    hooks/                           Mobile and toast helpers
    utils/toast.ts                   Toast convenience functions
    data/                            Bundled Philippine card-directory Markdown
  server/
    routes/api/                      Nitro filesystem API routes
    lib/                             Domain services, schema, Node tests
  scripts/                           Owner setup/reset, backup, UI smoke tool
  e2e-tests/                         Mocked UI contracts and isolated authenticated browser tests
    fixtures/accessibility.ts        Dialog, contrast, focus, target checks
  docs/
    app-workflow.md                  Earlier workflow/analysis document
    luna-ui.md                       Earlier UI/accessibility contract
  public/                            Logo, local Inter font/license, public assets
  ui/                                Standalone prototype and notes
  Sample Statement Import/           Full-statement template and supplied CSVs
    UnionBank Statements/            40 supplied statement CSVs
  data/                              Ignored SQLite and private originals
  .output/                           Generated Nitro production output
  node_modules/                      Installed dependencies
  .dyad/ and .claude/                 Tooling state, not app entry points
```

`data/`, backups, environment files, `.output/`, dependencies, and browser-test results are ignored by Git. Anything placed in `public/` is a public asset; private financial files must never go there.

The supplied CSV directory is not automatically imported on startup. Explicit sample reset uses a separate bundled fixture, `server/lib/sample-statements.ts`.

## 3. Stack and Runtime

| Layer | Implementation | Change boundary |
| --- | --- | --- |
| Browser | React 19, TypeScript, React Router 6 | Keep routes in `src/App.tsx` |
| Server-state cache | TanStack React Query 5 | Align query keys and mutation invalidation |
| UI | Tailwind 3, Radix/shadcn, Lucide, Recharts | Reuse primitives and workspace wrappers |
| Build | Vite 8, React SWC, Dyad component tagger | Preserve plugin order |
| API | Pinned Nitro `3.0.260903-beta` | Handlers under `server/routes/api/` |
| Database | `better-sqlite3` | Synchronous queries, foreign keys, WAL, atomic writes |
| Authentication | Argon2id and opaque cookie sessions | Server-owned credentials and CSRF checks |
| Validation | Domain validation; Zod upload envelope | Validate server-side, not only in forms |
| Tests | Node built-in runner and Playwright | Existing suites; no new framework needed |

These versions describe the manifest, not an upgrade recommendation. Installed Node is `v24.19.0`; the manifest does not declare an engine range. Tests require `--experimental-strip-types`; SQLite and Argon2 have native dependencies.

- Vite binds to `::` on port `8080`, not a loopback-only configuration.
- `@/` resolves to `src/`. Backend code uses relative imports for shared pure money/CSV helpers.
- `nitro()` is the last Vite plugin, after Dyad tagging and React; changing order can break Vite module requests through SPA fallback.
- `nitro.config.ts` fixes `serverDir: "./server"`.
- `defineHandler` comes from `nitro`; request/response helpers come from `nitro/h3`.
- `tsconfig.app.json` covers `src/` with strictness disabled. `tsconfig.node.json` covers `vite.config.ts`, not the whole backend. Frontend type checking is not full backend type checking.
- `vercel.json` is an SPA rewrite, not proof of a persistent Nitro/SQLite deployment.

## 4. Frontend Routes and Components

`main.tsx` mounts `App` and loads `globals.css`. `App.tsx` installs QueryClient, tooltip/toast providers, and BrowserRouter. Workspace routes share `Protected` and `AppLayout`; `/login` and wildcard NotFound sit outside that protected layout.

| URL | Page in `src/pages/` | Responsibility |
| --- | --- | --- |
| `/` | `Index.tsx` | Selected-month dashboard, reports, activity, planning, accounts |
| `/accounts` | `Accounts.tsx` | Account metadata/history, card directory, instruments, deletion preview |
| `/transactions` | `Transactions.tsx` | Posted ledger, filters, optional categories, Add/Edit/Delete, read-only import provenance |
| `/import-export` | `ImportExport.tsx` | Transaction CSV upload, exceptions, import history/originals, existing CSV/JSON exports |
| `/analytics` | `Analytics.tsx` | Monthly reports/charts and supporting data tables |
| `/budgets` | `Budgets.tsx` | Category income/expense budgets, actuals, edit/delete |
| `/bills` | `Bills.tsx` | Reminders, full expense/credit-repayment recording |
| `/goals` | `Goals.tsx` | Targets, contribution history, allocation progress, deletion |
| `/imports` | Redirect in `App.tsx` | Import & Export; preserves account/upload/legacy identifiers |
| `/statements` | `Statements.tsx` | Archive-only full-statement CSV upload/list/detail/originals and optional account link |
| `/settings` | `Settings.tsx` | Profile/preferences, categories/rules/providers, privacy/export link, sign-out |
| `/help` | `Help.tsx` | Guidance and product boundaries |
| `/login` | `Login.tsx` | Owner setup and sign-in |
| Unmatched | `NotFound.tsx` | Not-found fallback |

Preserve URL behavior:

- `/transactions?new=1` opens the shared entry dialog; closing it removes the flag.
- Search navigates to transactions/accounts/bills with `?id=...` selections.
- `/transactions` has a compact Date selector, Search, and Filter toolbar. Only a fresh URL without filters defaults to the browser-local current month. Date choices are Month, Custom range (either boundary optional), and All time; dates use posted_date, and explicit start/end supersede a legacy month parameter. Date and advanced-filter drafts apply only on Apply; Cancel, Escape, or dismissal discards them. Search stays immediate and accepts up to 100 characters.
- In Month mode, Previous month and Next month arrows immediately change the month, including across year boundaries, while retaining search/account/upload filters and resetting pagination. Clicking the date label opens the existing chooser. Arrows are disabled for custom ranges, All time, or invalid months rather than silently replacing that date scope.
- `/transactions?batch=...&account=...` scopes the manually entered, non-credit-card ledger. The query excludes imported transactions and any transaction whose account or transfer counter-account is a credit card; this applies before pagination and totals. Existing account/upload/record links without dates retain All time. The frontend-only `period=all` marker preserves that choice without reaching the transaction API. Filter contains Account, Type (including Installments), Category (including Uncategorized), Source, Sort, and any upload restriction. Its count excludes dates/search/default sorting and counts an upload once. Clear all stages All time, empty search, no advanced/upload filters, and newest sorting until Apply. Account changes clear incompatible upload/legacy filters; date/search changes retain them. Applied filter changes reset pagination; URL state survives refresh and navigation. Transactions does not request import history/exceptions.
- Account details link to `/import-export?account=...&upload=1` and `/statements?account=...`. Existing `/transactions?upload=1&account=...` shortcuts redirect to Import & Export with the account selected.
- `/imports?statement=...`, `/statements?statement=...`, and `/statements?batch=...` open the historical upload on `/import-export?batch=...&tab=history`. Legacy CSV/JSON IDs remain available; old duplicate notices are discarded.
- Navigation includes Statements and Import & Export on desktop/mobile. Retired Imports/BankStatements page files remain unrouted; never remount their posting/reconciliation controls. New archive detail uses `/statements?document=...`, not legacy `statement`/`batch` identifiers.

| Shared component in `src/components/` | Purpose |
| --- | --- |
| `AppLayout.tsx` | Navigation/mobile Sheet, header/search, shortcuts, transaction dialog, sign-out |
| `Protected.tsx` | Session check, connection retry, login redirect |
| `TransactionDialog.tsx` | Create/correct entries, currency/rate/fee, category/funding/payment method |
| `WorkspaceButton.tsx`, `WorkspaceDialogContent.tsx`, `WorkspaceAlertDialogContent.tsx` | Compact controls, bounded inner dialog scrolling, visible keyboard focus, safe confirmation focus |
| `PageAction.tsx` | Registers one route-scoped header action; callbacks stay current without resetting unrelated state |
| `RecordActions.tsx` | Accessible per-record menus; closes and restores trigger focus before opening an editor or confirmation |
| `MonthControl.tsx` | Month selection |
| `CsvImport.tsx`, `JsonTemplate.tsx` | Unrouted legacy interfaces; compatible API formats remain |
| `StatementImportDialog.tsx` | Transaction-only import dialog in Import & Export; account/card and optional repayment funding |
| `TransactionImports.tsx` | Import history, originals, pending exceptions, correction/link/import/skip/continue |
| `StatementReviewTable.tsx` | Legacy unrouted review UI |
| `StatementActivity.tsx` | Legacy unrouted source UI; read API remains |
| `StatementPayments.tsx` | Retired unrouted allocation UI; existing allocations remain historical |
| `RemoveStatementDialog.tsx` | Confirmation/retry for unapproved uploads only |
| `AccountDeletionDialog.tsx` | Dependency/other-account preview and exact-name confirmation |
| `PaymentMethods.tsx` | Account-backed debit/credit instruments |
| `SampleWorkspaceReset.tsx` | Unrouted administrative reset interface; never use for import/UI validation |
| `ExportButton.tsx`, `LunaLogo.tsx` | Complete downloads and public logo |

`made-with-dyad.tsx` and `src/App.css` have no static importers in the inspected source graph. They are not current customization points; this observation is not a cleanup request.

## 5. State and Request Flow

There is no dedicated Redux/Zustand store. React state manages forms, selections, filters, dialogs, and busy/error messages. URL parameters retain deep-linked selections. React Query owns cached server data; the server remains the source of truth.

Query-key families include `accounts`, `categories`, `transactions`, `reports`, `budgets`, `bills`, `goals`, `preferences`, `profile`, `search`, `statements`, `statement`, `statement-items`, `payment-methods`, and `import-history`. Month/account/filter/selected-ID parameters extend those keys.

Normal write sequence:

1. A page/dialog builds a validated draft and guards repeat submission.
2. `src/lib/api.ts` sends a same-origin `/api/...` request with session cookies. Mutations attach `x-luna-csrf` from the CSRF cookie.
3. A Nitro handler checks authentication, mutation protection, and request validity.
4. A domain library validates ownership and performs an atomic ledger/database operation.
5. The client invalidates affected queries, refreshes recorded data, and reports success or actionable failure.

Many finance mutations invalidate all queries because one transaction affects multiple screens. Some settings/instrument/upload operations invalidate specific families. Any narrower invalidation must account for balances, reports, planning totals, archive activity, and payment allocations.

`ApiError` retains the HTTP status. `src/lib/messages.ts` translates server/network errors and suppresses technical details. An unreadable response after a write is an uncertain result: inspect records before retrying. Preserve request keys across retries rather than creating a second independent write.

### Per-Statement Source Activity

- Account details and Statements can read `credit-card-dashboard` in exact statement mode and render shared `CreditCardActivity`; account details also supports issue-month mode, which combines source lines from all active statements issued that month. Calendar month/range views continue to filter posted ledger records. One activity result represents one imported source line, including prior-month purchases, installments, and credits. The main Transactions route is limited to manually entered non-card ledger records and does not offer statement modes.
- `credit-card-statements` and `credit-card-dashboard` accept optional `issuedStatement`: a positive safe-integer ID scoped to the owner, an active credit-card statement, and any selected cards. Missing, foreign, superseded, or incompatible selections fail explicitly; never substitute another issue. `transactions?issuedStatement=<id>` remains ledger-only for compatibility.
- `ActivityLine.ledgerTransactionId` is nullable. Only explicit owner-scoped decisions resolving through the correction-chain projection to an active transaction produce a Linked ledger indicator; multiple links never multiply source rows. Dates, merchants, and amounts do not infer links.
- Account-detail source-date restrictions use `lineStart`/`lineEnd`, translated to dashboard `start`/`end`. Issue changes retain applicable activity filters, reset pagination, and clear calendar/upload and ledger-only restrictions. Account/domain changes clear incompatible filters; locked account scope and legacy unique-month resolution remain intact.
- Statements has a separate Statement selector with All statements default and paged metadata-scoped choices. Selecting an exact issue clears metadata restrictions/pages and scopes cards plus activity; changing metadata clears the exact issue. Opening/closing source details uses independent `document` state. Labels distinguish issues by date, currency, filename, and ID.
- Keep activity controls mounted during loading/errors to preserve typing focus. New query keys must not display the previous issue's rows while switching. Filtering is read-only: no posting, matching, relinking, imports, migrations, payments, ledger balance changes, or source-file edits.

## 6. Backend Map and API Contracts

All paths below start with `/api/`. Operations describe the primary client contract; method-specific Nitro filenames enforce their suffixes.

| Endpoint family | Primary operations | Domain owner |
| --- | --- | --- |
| `auth/me`, `auth/setup`, `auth/login`, `auth/logout` | GET session; POST setup/login/logout | `auth.ts`, `request.ts` |
| `accounts`, `accounts/:id`, `accounts/:id/deletion-preview` | GET/POST list/create; PATCH metadata; DELETE purge; GET preview | Accounts handlers, `ledger.ts`, `account-deletion.ts` |
| `payment-methods` | GET/POST instruments | Handler; instruments reference bank/card accounts |
| `transactions`, `transactions/:id` | GET filters/details; POST entry; PATCH correction; DELETE void | `ledger.ts` |
| `reports`, `search`, `statement-items` | Read reports, owned search, source-row activity | Report/search handlers, `statement-items.ts` |
| `budgets`, `budgets/:id` | GET/POST; PATCH/DELETE with expected prior state | `budgets.ts` |
| `bills`, `bill-payments` | GET/POST reminders; POST full-payment record | `planning.ts` |
| `goals`, `goals/:id`, `goal-contributions` | GET/POST goals; DELETE; POST contribution | `planning.ts` |
| `categories`, `merchant-rules`, `providers`, `preferences` | GET/POST configuration/directories | Handlers, `planning.ts` |
| `csv-imports` | POST preview/commit | `csv-imports.ts` |
| `imports`, `import-history` | POST legacy JSON preview/import; GET history | `imports.ts`, history handler |
| `statements`, `statements/:id` | GET history/detail; POST upload and immediate eligible posting; POST resolution/continuation | `statements.ts` |
| `statements/:id/download` | GET owned original private CSV | `statements.ts` |
| `statement-archives`, `statement-archives/:id`, `statement-archives/:id/download` | GET list/detail/original; POST archive-only upload; PATCH explicit version-checked account link | `statement-archives.ts` |
| `statements/:id/payments` | Historical GET preserved; mutation returns 410 Gone | `payments.ts` |
| `sample-workspace`, `sample-workspace/:key` | GET preview; POST confirmed reset; GET owned backup | `sample-workspace.ts` |
| `export?format=json` / `export?format=csv` | GET complete owned export | Export handler, `csv-imports.ts` |

Account create/PATCH accepts an omitted, empty, or whitespace-only name. The shared `defaultAccountName` helper in `src/lib/accounts.ts` generates a name from the supplied provider/product, includes the provider once, and falls back to the account-type label (80-character limit). The form uses the same rule. Explicit names remain validated; PATCH retains its existing concurrency and identity-only protections.

Statement detail POST actions: `resolve` (or compatible `commit` alias), `continue`, `reprocess`, `remove`. Resolution requires version evidence and row decisions; an `edit` decision persists audited normalized corrections without posting, then refreshes matches. `preview`, `reconcile`, and `reopen` return 410 Gone. Upload POST returns `id`, `accountId`, `duplicate`, `status`, `error`, `imported`, `linked`, `skipped`, and `needsAttention`; counts describe the retained upload, including safe retries.

Transaction GET accepts `batch=<upload ID>`, `category=uncategorized`, and legacy `legacy=csv|json&importId=<ID>` scopes. Uncategorized means a null category on expense/income/refund, not a synthetic category record.

The plain transaction array read is capped at 500 by default; paginated reads return at most 20 transactions per page. Transactions uses Previous/Next controls for additional pages. Exports read the full owned non-voided dataset, not a filtered table or 500-row response. Only Import & Export mounts the export controls.

### Domain Modules in `server/lib/`

- `db.ts`: opens storage, defines schema/additive startup migrations, provides `atomic()`.
- `ledger.ts`: validates/posts entries, computes balances, versions/corrects/voids transactions, preserves historical evidence without verification locks.
- `auth.ts`, `request.ts`: owner bootstrap, password hashing, session/CSRF/origin checks.
- `imports.ts`: legacy schema-v1 credit-card statements and all-row import.
- `csv-imports.ts`: legacy flat CSV mappings, previews, duplicate/source identity, commit, export rows.
- `statement-csv.ts`: supported full-statement labels/table, date/money normalization, summary discrepancies.
- `statements.ts`: transaction imports, private originals, automatic eligible posting, conservative duplicates, audited exceptions/continuation. Low-level legacy reconciliation helpers are not active actions.
- `statement-archives.ts`: independent reference-only storage, source metadata/rows, integrity-checked originals, owner/hash idempotency, versioned optional account links; no posting-service imports.
- `transaction-first-migration.ts`: one-time verified snapshot, audited retirement of finalized locks; no posting or ledger rewrite.
- `statement-items.ts`: institution/source activity filtering independent of manual ledger rows.
- `payments.ts`: legacy allocation reads and internal compatibility; new public allocation actions are retired.
- `planning.ts`, `budgets.ts`: bills/payments, goal allocations, preferences, rules/providers, budget identity/concurrency.
- `account-deletion.ts`: dependency-aware purge preview and surviving-account impacts.
- `sample-workspace.ts`, `sample-statements.ts`: explicit backed-up reset and bundled fixtures, not startup seeding.

## 7. Persistence Model

`server/lib/db.ts` opens `LUNA_DB_PATH`, default `./data/luna.sqlite`; tests support `:memory:`. It enables foreign keys, WAL, and a 5,000 ms busy timeout.

Schema creation and additive migrations are module-import side effects. Do not import this module merely to inspect live storage: it can change schema/data. There is no separate ORM or standalone migration runner.

| Group | Tables | Relationship |
| --- | --- | --- |
| Identity | `users`, `sessions` | Credentials and hashed session/CSRF tokens |
| Canonical finance | `accounts`, `categories`, `transactions`, `account_entries` | Transactions own signed account deltas; categories classify activity |
| Reference statements | `statement_archives` | Owner-scoped metadata/raw rows/original key, optional account reference, revision; no transaction foreign keys |
| Planning | `budgets`, `bills`, `bill_payments`, `goals`, `goal_contributions` | Budgets reference categories; bill payments reference transactions; goals are allocations |
| Configuration | `merchant_rules`, `service_providers`, `workspace_preferences`, `payment_methods` | Owned mappings/directories/preferences and account-backed instruments |
| Legacy provenance | `statement_imports`, `statement_import_rows`, `csv_import_batches`, `csv_import_rows` | Source/batch identity links to canonical transactions |
| Statement evidence | `statements`, `statement_entries`, `statement_decisions`, `reconciliations` | Originals and raw/normalized rows remain separate from ledger approval |
| Application history | `statement_payment_allocations`, `workspace_resets`, `audit_events` | Allocation/reversal, reset backups/results, financial audit history |

Most records have `owner_id`; children without it are scoped through owned parents. An ID alone is never authorization.

Statements also require private filesystem originals. Production requires `LUNA_STATEMENTS_PATH`; local default is `./data/private-statements`. Keep it outside `public/`, `.output/public/`, and `src/`. Files use generated CSV keys, hashes, owner-checked downloads, and restrictive modes.

SQLite/private files are not encrypted by Luna. Database transactions cannot make filesystem changes crash-atomic. Backups and restore verification must cover both layers.

## 8. Accounting Rules to Preserve

1. Canonical PHP amounts are safe integer minor units. `src/lib/finance.ts` parses/converts with exact decimal/BigInt arithmetic; do not substitute floating-point rounding.
2. `transactions` records an event; `account_entries` stores its signed balance effects. `balanceFor()` sums owned entries for non-voided transactions.
3. Income/refund increases an account; expense decreases it. Transfer entries are equal negative source and positive destination deltas.
4. Card/loan/liability opening debt is a negative ledger balance. Reports derive asset/debt magnitudes and net worth from current recorded balances.
5. Transfers/openings/adjustments are not income/spending. Refunds reduce spending. Cash flow sums movements in accounts marked liquid.
6. Month reports use posting dates; net worth uses current balances. Missing history does not prove zero financial activity.
7. Original foreign amounts/currency, manual rates, and included fees accompany PHP amounts. Conversion uses positive half-up rounding. Included fees are part of the original total, not an additional charge. No live rate service exists.
8. Dates are validated calendar strings. Many defaults/future-date guards use UTC `toISOString()` dates; local-time conversion is a cross-cutting policy change.
9. Creation uses owner-scoped idempotency keys. Corrections require current version evidence, void the prior transaction, and link a replacement through `replaces_id`.
10. Ordinary deletion is voiding, not erasure. Corrections update import/statement links and invalidate coverage. Correction/void can reverse allocations; the current void path removes its bill-payment link.
11. Retired verification evidence does not block corrections, voids, or backfills. Totals/balances from source statements are reference metadata, never posting gates or automatic adjustments.
12. Categories are optional for expense/income/refund across import, manual creation, and correction; explicit foreign/archived/wrong-kind category IDs are rejected. Null categories still affect balances, income/spending/refunds, reports, filters, and exports.
13. Repayments are one cash/bank/wallet-to-card transfer. Importing both sides must link the existing transfer rather than add another movement; ambiguous source rows stay unposted.
14. Bills record a full expense or explicitly funded card-repayment transfer, never send money. Cadence is a reminder preference, not recurrence generation. Goal contributions affect allocations only, not balances/net worth.

Account purge, unapproved-upload removal, and sample reset are explicit destructive exceptions with separate safeguards. Never silently substitute them for ordinary edit/void behavior.

## 9. Import, Evidence, and Export Workflows

### A. Transaction-First CSV Import

1. Import & Export owns Import transactions. Select an owned account/card; account-context links preselect it. Categories can remain blank.
2. POST /api/statements bounds input to UTF-8 CSV, 2 MB, 5,000 rows, validates ownership, stores/hash-checks a private original, then stages immutable raw and normalized rows.
3. Reuse the flat PHP CSV layout or recognized full credit-card statement layout. No PDF, XLSX, image extraction, or arbitrary bank formats.
4. Post the clear subset atomically through the existing ledger. Exact source identities with agreeing signed amount, date, type/account, and known transfer endpoints can link automatically. Similar amount/text/date alone is not proof.
5. Repeated signatures, conflicting sources, invalid financial fields, ambiguous credits, or missing transfer accounts remain unresolved, outside balances and reports. Unrecognized category text is retained in original details and imports as uncategorized; it does not force mapping or category creation.
6. Upload stays on Import & Export, opens the selected history entry, and announces counts. History retains account, filename, outcomes, originals, and exception actions. View transactions explicitly opens the account/upload-filtered ledger with no implicit month restriction; Filter, Clear all, Apply removes those restrictions.
7. Needs attention resolves only exceptions: repair fields, classify refund/payment, select funding/destination, link an existing record, confirm a separate transaction, or skip with a reason. Save fields / refresh matches audits normalized corrections without posting; raw source and source identity remain immutable.
8. Valid installments import the billed amount only. Notes remain attached; no future installment schedule or balancing adjustment is generated. Summary discrepancies are reference information, never approval gates. Transactions offers separate Type and Category columns/details, plus independent Type/Category tabs in Add/Edit. Tab switches retain the draft values; categories remain optional and never change the accounting type. Capitalized labels and a selectable Installments type are available during creation, editing, filtering and exception correction. Installments remain expense ledger entries, with a nullable is_installment classification; reports, budgets and balances keep counting the billed expense. Existing numbered installment expenses are recognized without rewriting records; transfers and refunds never change type automatically. Explicit reclassification overrides text detection.
9. A failed eligible-subset transaction rolls back its writes; upload/original survives. Continue import explicitly retries eligible pending rows. Same-file reuploads return existing outcomes without automatically posting old pending rows. Changed/stale resolution payloads are rejected; matching retries do not post twice.
10. A repayment posts exactly one source-account debit and card credit. Opposite-side imports become possible links; never count repayment as income/spending. Missing funding and ambiguous credits stay outside the ledger until resolved.

Flat headers: date, description, merchant, type, amount; optional category, source_id, destination. Positive exact PHP amounts and valid ISO posting dates are mandatory. Type payment denotes an incoming card repayment. Transfer denotes an outgoing transfer; an exact unique owned destination-account name can resolve its hint. Ambiguous/missing names require selection.

The downloadable statement template uses Sale date, Post date, Merchant, Amount, Type, Category, Transaction notes. Type and Category are independent optional fields; Type is case-insensitive and accepts Expense, Installments, Income, Refund, Transfer and Payment. Explicit Income/Refund/Payment describes an incoming amount; expenses/installments require positive billed amounts. Unknown types and negative expenses remain unposted. The Type column identifies parser version luna-full-statement-v2; older layouts without Type retain v1 support. The legacy Description header remains an alias for Merchant; new full-statement transactions store that text in merchant, keeping description separate. Legacy source-backed records receive the same read/export presentation without changing stored financial records or immutable sources. Flat CSV keeps its separate description and merchant fields and accepts type installment. Merchant names support the full 240-character source limit. With Type blank, positive amounts default to billed expenses, the PAYMENT RECEIVED - THANK YOU credit defaults to a repayment, and other negative amounts need payment/refund classification. Optional metadata can be malformed without blocking valid table rows; raw metadata is preserved.

During import, numbered merchant markers such as `(04/12)` default expense rows to Installments, even when the flat CSV type is `expense`. An explicit Type in the new statement template, or a manual type change in exception correction or transaction editing, takes precedence and survives retries. Refunds, income and transfers retain their financial types; originals remain unchanged.

### B. Legacy APIs and Provenance

The old CSV preview/commit and JSON schema-v1 APIs remain compatible; their interfaces are no longer linked from active screens. Existing import IDs and source identities remain reserved through corrections/voids. Earlier CSV/JSON imports retain read history/transaction links; those paths did not store downloadable originals.

JSON v1 retains its existing fields, row types and opening/closing checks; this change does not expand that format. Categories are optional, but explicit category/funding mappings still require owned valid IDs. Legacy CSV retains preview/commit behavior and optional category hints/rules. New transaction uploads use the private transaction-first statements endpoint. Reference-only documents exclusively use statement-archives.

### C. One-Time Verification Retirement

On startup, transaction-first-v1 runs only once. Existing disk-backed workspaces first receive a recoverable SQLite VACUUM INTO snapshot, integrity validation, private-original copy, byte-completeness checks for every retained original, and a manifest under the database directory's migration-backups/transaction-first-<UUID>/ directory. Missing/incomplete originals abort retirement. The snapshot directory must be outside the originals directory.

Only then does one SQLite transaction audit each finalized reconciliation's full previous evidence/snapshot location, mark it reopened, normalize reconciled upload statuses, clear obsolete coverage markers, and record app_migrations. Transactions, IDs, account entries, raw/normalized rows, originals, decisions, and historical repayment allocations remain unchanged. No pending upload posts during migration. Owners explicitly choose Continue import afterward.

For recovery, stop all application processes, restore the snapshot SQLite database and matching private-statements files together to configured persistent paths, verify integrity/bytes on an isolated copy, then restart. Do not restore only one layer or copy over a running WAL database. Existing backup scripts remain separate; migration backups contain financial data and must stay private.

### D. Exports, Backups, and Sample Reset

- CSV exports all owned non-voided transactions with exact decimals and formula-prefix protection for text. Expanded export columns differ from legacy import headers; this is not a round-trip restore contract.
- JSON workspace export uses `schema_version: 3`, distinct from legacy statement schema v1. Finance/planning/configuration snapshots are not a complete automatic database/private-file restore format.
- `scripts/backup.mjs` uses SQLite backup API and verifies database integrity. It does not itself archive every original statement file.
- Reset requires `RESET MY WORKSPACE`, current preview evidence, and a request key. A verified private backup includes original bytes before affected financial history is replaced with bundled examples. Never reset real records to test a layout.

### E. Standalone Statement Archive

Statements is a document archive, never a transaction import destination. It accepts the supplied full-statement CSV: summary labels (Issuer, Statement month/title, dates, limit, balances, charges, credits, minimum due, notes) followed by Sale date, Post date, Merchant, Amount, Type, Category, Transaction notes. Quoted commas and extra empty trailing cells are accepted. Nonempty unexpected columns, malformed CSV, non-UTF-8, unsafe filenames, and files over 2 MB/5,000 rows fail safely.

The Statements page header uses Add statement instead of Add transaction. It opens the existing CSV upload, optional account link, and template download inside a dialog (`upload=1`), not an inline card. Cancel/Escape/Close discards the file/account draft and returns focus to the header; active list/detail filters are retained. Closing is blocked during upload; failures keep the form/file for retry, while success closes the dialog and opens the stored statement. Other pages and the sidebar retain transaction entry actions.

Source summary, all raw fields, signed exact amounts, and original bytes remain available. Invalid individual dates/amounts are retained with reference warnings, not posted or silently coerced. Declared totals need not equal the included rows. The supplied five-row example totals PHP 6,961.83 while declaring PHP 15,051.42 in new charges; both remain intact. No categories, future installments, balancing entries, repayments, reminders, or account limits are created/updated.

`statement_archives` stores owner, optional account ID/name snapshot, file hash/key, parsed/raw summary, source rows/warnings, and revision. Account links use `ON DELETE SET NULL`; permitted account deletion preserves the document and its snapshot name. Legacy financial provenance still has its existing deletion protections. Changes to the account reference require a current version and are audited, without matching transactions. The new archive starts empty; old imports remain in Import & Export and are never copied automatically.

Originals live under `LUNA_STATEMENTS_PATH/archive-only/` with randomized CSV keys, restricted filesystem permissions and owner-authenticated integrity-checked downloads (`private, no-store`, `nosniff`). Failed save/audit transactions remove only the newly created file. Same owner/bytes returns the existing document; another selected account does not silently relink it. Different owner/bytes or different contents remain separate. Failed/missing originals require recovery of verified bytes, not silent replacement.

List filters: `account=<ID>|unlinked`, exact `issuer`, `start`/`end` statement dates, and page (25 results). Detail uses `document` in the page URL. Archives remain out of legacy reset/removal cleanup and CSV/schema-v3 JSON exports. Existing export formats are unchanged and are not automatic restore files. For real recovery, back up/restore SQLite and the complete private-files tree together; `scripts/backup.mjs` alone is database-only.

Before this additive schema change, the dev server was stopped and a verified paired snapshot captured at `backups/page-separation-20261015-c9a7f46e-9a24-4d7d-a369-b77b63e0169f/`. Its manifest records 19 existing financial/provenance table hashes and all 7 original-file hashes. Never restore over a running application.

## 10. Authentication and Operational Safety

The application is designed for one private owner, though records are owner-scoped and tests reject cross-owner access. It is not public multi-tenant registration.

- Owner setup restricts usernames and requires 12-200 character passwords. Production requires `LUNA_SETUP_TOKEN` and refuses setup when an owner exists.
- Argon2id hashes passwords. Session/CSRF secrets are random; stored values are hashes.
- Sessions last seven days with a 30-minute inactivity check. Session cookie is HttpOnly; production uses Secure and strict SameSite cookies.
- Mutations check CSRF; production also compares Origin/Host. UI protection never replaces server session/ownership checks.
- Login throttling is per-process/in-memory, not distributed.
- Administrative setup/reset scripts prompt for credentials. Password reset revokes all sessions. These are not analysis commands.

| Variable | Purpose |
| --- | --- |
| `LUNA_DB_PATH` | Persistent SQLite path; tests use isolated files or `:memory:` |
| `LUNA_STATEMENTS_PATH` | Persistent private transaction originals, archive-only originals and reset backups |
| `LUNA_SETUP_TOKEN` | Production owner-bootstrap secret |
| `NODE_ENV` | Production cookie/origin/bootstrap behavior |
| `DYAD_TEST_BASE_URL` | Playwright target; default `http://localhost:32100` |
| `LUNA_E2E_ISOLATED_URL` | Explicit disposable server URL required for authenticated import browser tests |
| `DYAD_TEST_SLOW_MO` | Optional browser-test action delay |
| `DYAD_PREVIEW_CDP_ENDPOINT` | Dyad preview mode changes screenshot/trace settings |

Real deployment requires persistent private storage and HTTPS. Verify joint SQLite/file restore on isolated copies. Static hosting, existing build output, or past successful builds do not establish current deployment safety.

## 11. Styling, Accessibility, and Documentation Drift

Active styling is `src/globals.css`, `tailwind.config.ts`, component classes, and workspace wrappers. Current code bundles local Inter, light/white surfaces, black navigation/actions, cobalt accents, rounded panels/pill controls, visible focus, reduced-motion handling. The sidebar switches at the Tailwind lg breakpoint (1024 px); small-screen search and field stacking use 560 px. The active workspace overrides are documented after the marketing reference in DESIGN.md.

### Compact Workspace Contract

- Header actions are contextual: Add transaction on Overview/Transactions, Add statement on Statements, Add account on Accounts, Create category budget on Budgets, Add bill reminder on Bills, and Create goal on Goals. Accounts changes to Close account form while its inline form is open. Other routes retain their own content actions. A quiet sidebar shortcut and the guarded N shortcut still open transaction entry.
- Mobile workspace search is a named dialog, opened by its labeled button or /. Arrow keys and Enter select results. Escape restores the opener; selecting a result preserves the destination's focus instead. The navigation Sheet does not reclaim focus when it opens transaction entry.
- Account and bill rows stack naturally. Account, budget, goal, and bill menus retain existing detail/edit/delete/payment behavior. Account details and bill details remain directly reachable from record names. Payment-method creation uses a native disclosure, retaining backing-account validation and safety copy.
- The Transactions table appears when its workspace container is at least 960 px wide; otherwise a semantic list presents the same posted rows, amounts, categories, types, account/source metadata, and detail actions. Filters, paging, payloads, exports, provenance, and accounting are unchanged.
- Body text is 14 px, field text 16 px, headings 28/20/18 px, panels generally 16 px padding. Desktop controls are at least 40 px; coarse pointers/small screens and dialog controls retain at least 44 px targets. Mobile budget/goal totals use two columns.
- Dialogs scroll within a viewport-bounded inner region. Focused controls scroll into view even when Radix wraps the Tab cycle; native date/month segments retain a visible focus outline. Footer controls wrap in normal document flow, not over focused fields. Confirmations default to Cancel; existing exact-name/version/busy/deletion safeguards remain intact.
- No backend, schema, dependency, live-data, private-original, or prototype change belongs to this compact-layout continuation. Shared primitives stay untouched.

`AI_RULES.md` requires TypeScript, centralized routes, existing pages/components folders, Tailwind, and reuse of installed shadcn/Radix. It discourages editing primitives; use application wrappers where possible.

| Reference | Discrepancy | Safe interpretation |
| --- | --- | --- |
| `README.md`, `docs/luna-ui.md`, `ui/DESIGN.md` | Older BasisGrotesque/cream/green/small-radius contract conflicts with active Inter/tokens | Preserve appearance unless redesign requested; choose an approved design authority first |
| `DESIGN.md` | Preserves a Revolut-derived marketing reference followed by the active Luna workspace overrides | The workspace override and current code govern app refinements; marketing tokens are not automatically implemented |
| `docs/app-workflow.md`, earlier README limits | Say conversion is unavailable | Current dialog/money/ledger implements manual foreign-to-PHP conversion, not live rates |
| README bill-payment boundary | Describes retaining voided bill-payment links | Current void path deletes that link; agree on policy before changing lifecycle |
| `docs/app-workflow.md` verification | Older baseline `6d4d7bf`, 27 passing tests | Historical evidence, not current-run results |
| `components.json` | CSS path is `src/index.css` | Runtime loads `src/globals.css`; reconcile before generators |
| `ui/README.md` | References old `index.html`/evidence absent from this `ui/` directory | Do not promise those artifacts or apply old verification to this checkout |

Conflicts are documented, not repaired. Existing working-tree changes remain preserved: deleted `DESIGN-revolut.md`, untracked `DESIGN.md`, untracked `Sample Statement Import/`.

For UI changes, retain labeled fields, dialog descriptions/opener focus, keyboard/Escape behavior, disabled/busy/error states, mobile overflow containment, chart alternatives, and non-payment wording. Automated accessibility checks supplement device/assistive-technology review.

## 12. Commands and Verification Coverage

Run from the repository root. Windows uses `npm.cmd` to avoid PowerShell script-policy ambiguity.

| Command | Behavior |
| --- | --- |
| `npm.cmd run dev` | Vite/Nitro server, configured port 8080 |
| `npm.cmd run test` | Thirteen explicitly listed Node test files, TypeScript stripping |
| `npm.cmd run lint` | Existing ESLint configuration |
| `npm.cmd run build` | Node tests, then Vite/Nitro production build |
| `npm.cmd run build:dev` | Development-mode build; bypasses tests |
| `npm.cmd run preview` | Vite preview; not a substitute for verified Nitro production deployment |
| `npm.cmd run start` | `.output/server/index.mjs` |
| `.\node_modules\.bin\tsc.cmd -p tsconfig.app.json --noEmit` | Frontend type check, not full backend coverage |
| `.\node_modules\.bin\playwright.cmd test --config=playwright-dyad.config.ts` | Browser contracts against an already-running server |

Playwright has no `webServer`; Dyad normally starts the target. For a separately started server, set `DYAD_TEST_BASE_URL` to its actual URL. Tests use installed Chrome and serial execution. Do not accidentally target real-owner destructive workflows.

### Existing Test Map

`e2e-tests/compact-workspace.spec.ts` covers contextual header actions, client navigation, retained error drafts, record-menu focus handoff, safe confirmations, mobile search/drawer shortcuts, responsive records, and screenshot fixtures at 1440/768/390/320 px. Existing financial-dialog checks additionally exercise 640x400 and 320x400 reflow. Run only against explicitly disposable storage; current results and remaining limitations are in task.md.

The Node suite includes focused transaction-first import and snapshot/recovery regression coverage. Current executed results are recorded in task.md, not inferred from this inventory.

| File | Focus |
| --- | --- |
| `server/lib/ledger.test.ts` | Signed balance effects, precision, transfers, ownership, retries, corrections, currency metadata |
| `server/lib/imports.test.ts` | JSON totals/dates, payments, rollback, opening coverage |
| `server/lib/csv-imports.test.ts` | Parser, mappings, duplicates/source identity, rollback, full export |
| `server/lib/planning.test.ts` | Bill payment/repayment, goal boundaries, preferences/directories |
| `server/lib/migrations.test.ts` | Data preservation, backup integrity, legacy snapshots, repeated migrations |
| `server/lib/record-management.test.ts` | Budget identity/stale checks, correction/void, account purge dependencies |
| `server/lib/statements.test.ts` | Archive/formats/ownership, atomic decisions/replays, legacy reconciliation evidence, summary/removal |
| `server/lib/transaction-first.test.ts` | Mixed automatic posting, optional categories, proven/possible duplicates, both repayment sides, corrections, rollback/recovery, verified migration |
| `server/lib/statement-archives.test.ts` | Exact supplied layout/originals, all financial-table isolation, duplicates/ownership/stale links, file/DB failures/recovery, account deletion and reset preservation |
| `server/lib/workspace-architecture.test.ts` | Reset, source filters, bounded allocations, linked bank/card payment, selective approval |
| `src/lib/finance.test.ts` | Currency precision and exact half-up conversion |
| `src/lib/transaction-filters.test.ts` | Local months, explicit ranges, validation, URL compatibility, context preservation, counts, and staged application |
| `src/lib/messages.test.ts` | Actionable errors, hidden technical details, uncertain responses, downloads |

Database tests set `:memory:` or temporary files before importing `db.ts`; archive tests use temporary directories. Preserve isolation.

Playwright covers consolidated imports, exception recovery, downloads, account preselection, redirects, optional-category/manual-entry and existing financial dialogs. The import-specific mock specs verify original-file links, not real downloads. Most specs intercept APIs. `transaction-first-live.spec.ts` separately exercises real session/CSRF, SQLite posting, reports, exports, originals, exception UI, and redirects. `statement-archives.spec.ts` adds authenticated archive/no-financial-effects/download/link/export checks and desktop/tablet/mobile captures. `transaction-filters.spec.ts` adds four mocked checks for local-month boundaries, draft cancellation/dismissal, grouped filters, history/context/pagination, keyboard access, and responsive toolbar/date/dialog captures, plus an authenticated isolated check for posted-date versus sale-date filtering, installment/uncategorized combinations, and unchanged exports/reports. Real-API checks skip unless `LUNA_E2E_ISOLATED_URL` exactly matches the configured baseURL; never enable it against real financial data.

`scripts/design-smoke.js` is a local-browser-only simulated UI tool with intercepted requests, not a Node script or production API test. Prototype `selfCheck()` is separate from React/backend verification.

Current validation results and remaining gaps are in task.md. Browser screenshots or emulated viewports do not prove physical-device or complete assistive-technology conformance. No deployment, live test import, sample reset, or financial-record rewrite is part of this change. Normal startup applies the additive archive table only; existing records/private originals are compared to the verified snapshot.

## 13. Change Compass

| Change | Start here | Checks |
| --- | --- | --- |
| Dashboard order/cards | `src/pages/Index.tsx`, `src/components/MonthControl.tsx`; reports only for data changes | Month totals, chart alternatives, mobile order/overflow |
| Navigation/search/shortcuts | `AppLayout.tsx`, `src/App.tsx`, search/preferences handlers | Deep links, typing/modifier guards, Sheet focus |
| Transactions/money | `TransactionDialog.tsx`, transaction handlers, `ledger.ts`, `finance.ts` | Precision, ownership, retries, correction chains, reports |
| Accounts/instruments | `Accounts.tsx`, `PaymentMethods.tsx`, matching handlers | Backing ownership, credit limits, no duplicate balances |
| Deletion/removal | Confirmation dialogs, `account-deletion.ts`, `ledger.ts`, `statements.ts` | Preview/version/name guards, rollback, survivor effects, provenance |
| Import/exception workflow | `ImportExport.tsx`, `TransactionImports.tsx`, `StatementImportDialog.tsx`, `statements.ts`, parsers | Limits, immutable provenance, source identity, funding/classification, atomic subsets, recovery |
| Standalone statement archive | `Statements.tsx`, `statement-archives.ts`, new routes/table | No financial side effects; raw values, ownership, originals, optional account reference, version/rollback/retry |
| Historical reconciliation/allocations | `transaction-first-migration.ts`, retained database evidence, legacy reads | Verified database/private-file snapshot; no new verification or allocation actions |
| Budgets/bills/goals | Matching page, `budgets.ts`/`planning.ts` | Category/month identity, idempotency, allocation-only goals |
| Global visual changes | `src/globals.css`, `tailwind.config.ts`, workspace wrappers | Approved design authority, contrast/focus, fonts, responsive screenshots |
| Error wording | `src/lib/messages.ts`, `src/lib/api.ts`, target form | Retained values, concrete recovery, uncertain writes, message tests |
| Export/backup | Export handler, `csv-imports.ts`, `csv.ts`, `backup.mjs` | All rows, formula safety, decimals, restore boundary |
| Prototype-only changes | `ui/detailed.*` | Demo scope; no expectation of runtime changes |

Short component filenames in this compass refer to `src/components/`; pages to `src/pages/`; backend domain modules to `server/lib/`. See the full maps above before editing.

### Safe Change Checklist

1. Identify the actual route/component/domain owner; distinguish runtime, prototype, immutable source evidence, and canonical ledger.
2. Read current working-tree state and applicable instructions. Preserve unrelated user changes/private data.
3. Define acceptance criteria, invariants, and smallest write scope. Resolve design/behavior conflicts before broad changes.
4. Keep pure money/parsing shared; keep database/filesystem/credentials/server packages out of browser imports.
5. Preserve payloads, source IDs, owner scoping, version/idempotency evidence, and audit/rollback unless explicitly revising their contract.
6. Update dependent query invalidation and deep-link/state handling. Enabled controls/hrefs alone do not prove behavior.
7. Use focused isolated regression checks, then type/build checks. UI changes require keyboard and desktop/tablet/mobile verification, including empty/error/busy/narrow states.
8. Storage/parser/migration/deletion changes require failure/restore checks on disposable copies. Before authorized real-data operations, back up SQLite and referenced originals.
9. Report exactly what passed/failed/was not checked. Update this guide and conflicting contracts only within approved scope.

### Reading Order and Critical Anchors

Start with `AI_RULES.md`, `src/App.tsx`, the shared shell/client, target page/component, API handler, domain library, schema, and relevant tests. Money/import/migration/deletion work must also read shared finance and ledger logic.

Verified source anchors at this baseline:

- `src/App.tsx:21`: route registry/provider composition.
- `src/components/AppLayout.tsx:13`: shell, shared search/dialog, shortcuts.
- `src/lib/api.ts:10`: request transport/CSRF/error boundary.
- `src/lib/finance.ts:7`: exact amount parser; `src/lib/finance.ts:26`: PHP conversion.
- `server/lib/db.ts:5`: opening storage and startup side effects.
- `server/lib/ledger.ts:5`: posting; `server/lib/ledger.ts:34`: balances; `server/lib/ledger.ts:74`: correction.
- `server/lib/statements.ts`: upload/staging, detail/version evidence, automatic posting, audited resolution.
- `server/lib/transaction-first-migration.ts`: snapshot verification and one-time audited retirement; `server/lib/transaction-first.test.ts`: isolated safety checks.
- `server/lib/payments.ts:10`: allocation; `server/lib/sample-workspace.ts:22`: destructive reset.

Line numbers are navigation aids for this baseline, not permanent identifiers. Confirm them after edits.
