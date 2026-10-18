# Luna

Private self-hosted finance workspace: React/TypeScript, React Router, Tailwind, Radix/shadcn, React Query, Recharts, Nitro, SQLite. PHP minor-unit ledger; no new external services.

## Working capabilities
Dashboard/month reports, account directory/create/edit, ledger filters/sort/pagination/details, complete CSV/JSON export, named income/expense budgets, persisted bill reminders/full-payment records, allocation-only goals/history, merchant rules/providers, shortcut/in-app alert preferences, global owned search, mobile navigation, Help, owner setup/sign-in.

Existing URLs remain. `/transactions?new=1` opens the shared transaction dialog. N opens entry; / focuses search; Settings can disable shortcuts. Shortcuts ignore typing/modifiers/open overlays.

`ui/` contains supplied reference files only; prototype JavaScript/CSS and sample accounting are not loaded. `ui/DESIGN.md` is the style source; `docs/luna-ui.md` defines component states and acceptance checks. BasisGrotesque falls back to system sans; licensed fonts must be supplied before bundling.

## Accounting boundaries
Balances are derived from ledger entries, not account metadata or live banking. Refunds reduce spending. Transfers/openings/adjustments are not income or spending. Reports include recorded history only; unrecorded periods are unknown, not zero. Net worth reflects current recorded balances; selected-month report measures reflect posted dates.

Bills are independent planning records. “Record payment. No money is sent.” Full payment creates one atomic expense; credit repayment creates a transfer from an explicit cash/bank/wallet account. Retry cannot create a second linked payment. Voided linked payments remain visible for investigation; a bill cannot silently post another payment. Partial payment and recurrence generation are unavailable; cadence is a reminder preference.

Goals record allocations/contributions only. No account balance/net worth changes. Real allocations can exceed target; progress visuals cap at 100%.

## Imports
Legacy CSV/JSON imports do not retain raw source files. Full-statement uploads retain private originals. Maximum 2 MB, 5,000 rows. Mappings apply to new previews only, never historical records. Explicit category wins, then valid case-insensitive category hint, then enabled trimmed literal merchant rules ordered by ascending priority/ID. User regex is not supported.

### JSON statements v1
Existing statement contract remains: `schema_version`, `statement_id`, `account_key`, `currency: PHP`, `period`, `opening_balance`, `closing_balance`, `transactions`. Types: purchase, refund, payment, fee, interest. Amounts are decimal strings. Opening coverage must agree with the ledger; row totals must equal statement closing balance. All rows are imported atomically; exclusions cannot bypass reconciliation. Payment rows require explicit funding. Actual closing difference is reported, never silently adjusted. Templates are labeled examples, not live records.

### CSV v1
Template headers:

```csv
date,description,merchant,type,amount,category,source_id,destination
```

Required headers: date, description, merchant, type, amount. Remaining headers optional. Date must be valid ISO `YYYY-MM-DD`, not future-dated/before account opening. Type must be expense, income, refund or transfer. Amount must be a positive exact decimal with up to two places, without thousands separators/signs/exponents. BOM, CRLF/LF, quoted fields, embedded commas/newlines and escaped double quotes are supported. Duplicate/unknown headers, malformed quotes and inconsistent columns fail.

Select an owned import account. Select distinct owned transfer destination explicitly; destination column is a hint only. Preview writes nothing. Select rows, map categories/funding, acknowledge possible content duplicates, then commit. Any invalid selected row rolls back the entire batch. Stable account/source IDs or file-hash/row identities prevent retry duplicates. Exact known source rows are skipped for CSV; JSON exact cross-format sources fail rather than selectively exclude reconciled rows. Possible CSV content duplicates in JSON require explicit whole-statement acknowledgement. CSV does not perform statement reconciliation. Legacy JSON imports may lack history row counts.

Exports include every owned non-voided ledger record, beyond the default latest-500 array API. CSV uses exact decimal strings, quote escaping and formula-prefix neutralization for text. Export columns include account/category/destination names. Workspace JSON export includes planning and preferences; it is not an automatic restore format.

## Storage, migration and security
Use a persistent `LUNA_DB_PATH` outside the web root. Production bootstrap requires `LUNA_SETUP_TOKEN`; owner setup remains protected. Sessions/CSRF, ownership validation, atomic writes and audit records remain in place. Protect setup tokens and operator access; HTTPS/same-origin hosting is required for production.

SQLite is not encrypted by Luna. Restrict host/volume/database/backup permissions. Do not place the database on shared-sync/network storage or expose it as a static file. Encrypt off-site backups; keep keys separate. Export downloads are also unencrypted.

Before deployment/migration, take a consistent SQLite backup, including safe WAL handling through SQLite backup tooling. Verify `PRAGMA integrity_check`; restore an isolated copy, sign in and compare account totals. Never test restore/migrations against live records. New planning/import tables and metadata columns are additive; existing ledger rows are not replaced. Migration tests use an old-schema temporary fixture plus verified backup, never the real database.

Scripts: development `dev`, regression `test`, production `build` (tests then Vite/Nitro), deployed Nitro `start`. Tests run existing ledger/JSON checks plus planning, CSV/export and migration assertions on isolated databases. Dependencies remain unchanged.

## Explicit limits
Unavailable: PDF/XLSX parsing, receipts, executed payments, bank synchronization, external notification delivery, automatic recurrence, partial payments, rollover, currency conversion, MFA, public registration, automated recovery/restore. PHP/English fixed. Providers are directory records, not integrations. Alerts are in-app only.

Security and accessibility must be independently reviewed before public deployment. Automated Node/TypeScript/build results do not replace manual keyboard, mobile, zoom, contrast and assistive-technology checks.

## Private Bank Statements

`/statements` is separate from `/transactions` and legacy `/imports`. Reuses the canonical ledger, auth/CSRF and PHP minor units. New additive tables: statements, statement_entries, statement_decisions, reconciliations. Startup migration remains idempotent column/table detection, without numbered migration versions.

Production requires `LUNA_STATEMENTS_PATH` on the confirmed persistent private volume, outside web/static/source roots, alongside persistent `LUNA_DB_PATH`. Private directories use 0700, opaque CSV files 0600. Windows deployments must enforce equivalent host ACLs. Do not deploy this SQLite/filesystem architecture to ephemeral serverless storage. Existing `vercel.json` SPA rewrites are not a production backend deployment configuration; self-host the built Nitro Node server behind HTTPS.

New API: GET/POST `/api/statements`; GET/POST `/api/statements/:id` (commit, preview, reconcile, reopen, reprocess, remove); GET `/api/statements/:id/download`. All require authenticated ownership; mutations require CSRF. Upload body reads are bounded. Downloads are private, no-store, attachment-only. Original filenames never determine storage paths.

Supported: UTF-8 PHP CSV only, 2 MB / 5,000 transactions. Full-layout credit-card statements use `luna-full-statement-v1`; legacy flat statements retain `luna-csv-v1`. Existing flat headers and validation apply; legacy statement CSV additionally supports type `payment` for an incoming credit-card transfer with explicit owned cash/bank/wallet funding. No arbitrary institution layouts, XLSX, PDF, OCR, pending rows, automatic external-ID links, aggregation matches or malware scanner. Source IDs are treated as review evidence, not proof. Strong/ambiguous same-account signed PHP/date/text matches require explicit linking or a separate-import reason. File retries and reviewed row commits are idempotent; immediate SQLite transactions serialize competing approvals. Overlapping identical source rows may link the same transaction only when their normalized provenance is compatible.

**Approve row** submits one eligible pending row; **Approve all eligible (N)** submits only eligible pending rows. Each nonempty submitted subset commits atomically. Conflicts stay pending; all rows must be imported, explicitly linked or excluded with a reason before separate reconciliation. Partial progress persists as `partially_imported`; any saved decision protects removal/reprocessing. Complete-batch callers remain supported. Exact payload retries validate saved decisions and live ledger evidence; conflicting replays fail. Stale evidence rolls back the entire new subset, preserves earlier decisions. Immutable raw rows survive category/notes corrections. Reprocessing is limited to uncommitted files. Failed parser states retain the private original. Cancellation leaves staged archives. Archive Remove requires confirmation and a current version; only failed, needs-attention or ready-for-review uploads without decisions/reconciliation can be removed. Removal permanently deletes the original private CSV, staged rows and archive record; preserves canonical transactions and a removal audit event. Partially approved/approved/reconciled statements remain protected. Deleted unapproved files can be uploaded again. SQLite errors restore an unlinked original, but process interruption across SQLite/filesystem operations is not crash-atomic. Malformed file structure fails; invalid individual rows require exclusions or corrected upload.

Reconciliation uses confirmed ISO posting-date periods, ledger opening balance, represented cleared movements and official closing balance. Assets positive; liabilities debt-positive. Every canonical movement in the period must be represented; zero discrepancy alone is insufficient. Prior history and linked reconciled transactions cannot be edited/voided or backfilled until an audited reopen with reason. Category/notes changes currently also require reopen for finalized history. Transactions linked to an archive protect dependent account purges. CSV/JSON legacy imports remain accessible; their source checks now include archived statement decisions.

Backups must include a consistent SQLite backup and every referenced private CSV. Quiesce uploads/approval, use SQLite backup API, copy the private directory with permissions, encrypt off-site copies. Restore both into an isolated deployment; run integrity/foreign-key checks, authenticate, download an original, compare ledger totals and reconciliation history. The migration fixture checks SQLite backup restoration only; deployment-specific joint archive restoration and malware scanning remain operator acceptance requirements. Upload exceptions remove newly written files; process crashes can leave orphan files. Inspect file keys against statements before removing orphans; never delete referenced files. Files are not encrypted by the app.

Node regression checks cover private staging, ownership, unsupported formats, malformed dates, retries, overlapping source links, repeated equal purchases, atomic rollback, reconciliation mismatch/periods/locks/reopen and card payments. Playwright statement flow uses disposable API responses for mobile/keyboard review and reconciliation; it is UI contract coverage, not authenticated HTTP integration or a complete WCAG audit.

### Full credit-card statement CSV

Primary format matches `UnionBank - 2026-09-2.csv`: summary rows followed by `Sale date,Post date,Merchant,Amount,Category,Transaction notes,Transaction type`. Both transaction imports and issued credit-card statements accept this layout. Sale date may be blank; Post date is required. Explicit `Expense`, `Installments`, and `Card repayment received` map independently from Category and Transaction notes. Signed billed amounts remain unchanged; foreign amounts mentioned in Merchant do not replace billed amounts. Both download paths use `/credit_card_statement_import_template.csv`. Earlier layouts below remain accepted. Exact attachment regression fixture is server-only, not publicly downloadable.

Bank Statements and Imports share **Import statement**. On Bank Statements it precedes **Open transactions**. Account selection and file selection write nothing. **Upload and review** archives/stages only; explicit per-row approval creates canonical transactions. Idle Escape/Cancel restores focus; busy uploads prevent dismissal. Upload errors retain the account/file for retry. Exact repeated files reopen the existing archive without ledger writes. Legacy CSV/JSON tabs retain their original contracts.

Summary rows precede the transaction header. Supported labels: Issuer, Statement month/title (also Statement month or Statement title), Statement date, Due date (also Payment due date), Credit limit, Previous balance, New charges, Payments/credits (also Payments and credits), Outstanding balance, Minimum due (also Minimum amount due), Statement notes. Missing optional fields display **Not provided**; numeric/date labels with empty values must be omitted. Issuer/title/notes may be empty. Issuer is optional immutable metadata; it never renames the chosen account. Unknown nonempty fields are rejected or retained with a visible invalid-row warning, never silently dropped. Leading/trailing blank columns and blank separator rows are supported.


default template example:

```csv
Issuer,UnionBank
Statement month/title,September 2026
Statement date,"Sep 21, 2026"
Due date,"Oct 12, 2026"
Credit limit,50000.00
Previous balance,4028.06
New charges,7323.10
Payments/credits,4100.00
Outstanding balance,7251.16
Minimum due,500.00
Statement notes,Historical snapshot

Sale date,Post date,Description,Amount,Category,Transaction notes
"Aug 23, 2026","Aug 24, 2026",Example purchase,7323.10,,INSTALMENT 6 OF 24
"Sep 10, 2026","Sep 10, 2026",PAYMENT RECEIVED - THANK YOU,-4100.00,,
```

Transaction headers require Sale date, Post date (also Posting date), Description, Amount (also Amount (PHP)); optional Category and Transaction notes (also Notes). The downloaded transaction template has exactly six fields. Historical five-column layouts remain valid. Extra trailing empty fields are accepted and retained; nonempty extra fields create row errors retaining their original values. Sale date may be empty; post date must be valid, within account history, not future-dated. Due date may be future. Dates accept ISO or explicit English month names such as September 21, 2026; comma-containing dates must be CSV-quoted. Amounts accept exact PHP decimals, at most two places; quoted thousands separators and an optional PHP prefix are supported. Zero amounts, exponents, ambiguous dates and unsupported precision fail row validation.

Positive amounts are purchases/expenses; negative exact PAYMENT RECEIVED - THANK YOU is an incoming payment transfer requiring explicit owned cash/bank/wallet funding. Other negatives require explicit payment/refund classification before import or linking. Refunds reduce spending; transfers never count as spending. Reviewed classification lives in statement_decisions.reviewed_kind, not mutated source JSON. Both dates, original signed amount, notes and raw summary cells remain historical provenance. Installment notes remain text only; no future installments generated.

Statement credit limits are snapshots; live account limits remain unchanged. Previous/outstanding snapshots prefill official reconciliation balances; period boundaries remain explicit, not inferred from title or earliest posting. Summary identity and signed row totals must agree before reconciliation; discrepancies remain inspectable and do not prevent staging or reviewed approval. No balancing entries or silent account metadata updates. Legacy archives have nullable summary_json/raw_summary_json; repeated startup preserves old provenance and new snapshots.

Regression coverage: synthetic 17-row fixture reproduces supplied totals (PHP 4,028.06 previous; 7,323.10 charges; 4,100.00 credits; 7,251.16 outstanding), not a transcription of image rows. Isolated Node checks cover parsing, exact accounting, notes, reviewed refunds, funding ownership, rollback, immutable snapshots, duplicates, mismatch blocking and migration reruns. Popup Playwright checks cover keyboard/focus, contrast, 320px/short-viewport reflow, 200%-equivalent viewport, retry, busy guard, complete summary, snapshot prefill and Imports routing. Manual touch/screen-reader/device checks remain required.

### Selective review defaults and verification

Category names resolve against active categories for the authenticated owner and transaction kind, case-insensitively after trimming. Unknown nonblank names, wrong-kind names and ambiguous matches remain conflicts until explicitly mapped. Transfers carry no category. Blank categorizable rows use **Other · default**; staging/detail reads create nothing. Approval creates/reuses the correct owned/kind Other transactionally. Existing owner/name uniqueness may require a case/whitespace spelling of Other when another kind or archived category reserves the exact name; normalized matching still requires a single active owned/kind result. Legacy standalone CSV/JSON category contracts are unchanged.

Optional upload `fundingAccountId` is saved as nullable `statements.funding_account_id`; historical snapshots read null. Only distinct active owned cash/bank/wallet funding is accepted for credit cards. Review default overrides saved default; row `destinationId` overrides review default. No inferred funding. Every approval revalidates ownership, type, date/history constraints. Summary discrepancies block reconciliation only. Repeated same-file signatures and possible ledger matches require explicit link/exclusion or separate-import reason.

The semantic review table exposes caption/column/row headers, signed PHP amounts, counts/totals, labelled source expansion and read-only resolved transaction links. Narrow screens use a focusable local scroll region; the page itself must not overflow. Native controls retain keyboard behavior; approval focus returns to the stable review heading. Errors/refresh preserve unresolved edits; progress/results use live regions. Manual assistive-technology, touch, actual zoom and full WCAG verification remain required.

Verification for selective review: 58 Node checks passed on isolated SQLite/private files; project TypeScript and production build passed. All four mocked browser contracts passed: selective row/bulk approval, funding override, retry/edit retention, busy guard, keyboard/focus/local scrolling at 320px; upload/link/reconciliation/reopen; popup/Imports; removal cancellation/retry/busy guard/protected history/focus restoration. Removal's blank page came from a mock row missing required direction; the fixture now matches the API. Its retry assertion includes the archive trigger hidden from assistive technology while the modal is open. Authenticated HTTP auth/CSRF/ownership behavior was not browser-tested; mocked contracts are not authenticated integration tests. Exact new six-column fixture is covered; the 17-row fixture remains synthetic, not an asserted transcription of unavailable source rows.
