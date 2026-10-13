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
Raw source files are not retained. Maximum 2 MB, 5,000 rows. Mappings apply to new previews only, never historical records. Explicit category wins, then valid case-insensitive category hint, then enabled trimmed literal merchant rules ordered by ascending priority/ID. User regex is not supported.

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
