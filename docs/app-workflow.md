# Luna App Workflow

Luna is a private, self-hosted finance tracker. Currency is Philippine pesos (PHP); the interface is English. It records financial activity, never executes payments or synchronizes banks.

## Main User Journey

### 1. Setup and Sign In

Create the owner account, then authenticate. Production owner setup requires `LUNA_SETUP_TOKEN`. The protected workspace uses cookie sessions and CSRF-protected writes.

Sources: [Login](../src/pages/Login.tsx), [route guard](../src/components/Protected.tsx), [authentication](../server/lib/auth.ts), [request protections](../server/lib/request.ts).

### 2. Create Accounts

Supported types: cash, bank/debit, e-wallet, credit card, loan, asset, liability. A Philippine issuer/product directory assists selection.

- New accounts start at zero through the current UI; no opening-balance input is displayed.
- Credit cards require a positive credit limit.
- Account edits change metadata, not ledger balances.
- Account details show recent recorded activity.

Sources: [Accounts](../src/pages/Accounts.tsx), [card directory](../src/lib/card-directory.ts), [accounts API](../server/routes/api/accounts.ts).

### 3. Record Transactions

The shared transaction dialog supports expense, income, refund and transfer. It is available throughout the workspace; `N` opens it when shortcuts are enabled. `/transactions?new=1` also opens it.

The ledger page provides month/type/category/account/text filters, sorting, pagination, transaction details and complete CSV export.

Writes validate dates, amounts, account ownership and category compatibility. Transfers require distinct owned accounts. Idempotency keys protect retries. Voiding preserves the original transaction and audit history while removing its balance effect.

Sources: [transaction dialog](../src/components/TransactionDialog.tsx), [Transactions](../src/pages/Transactions.tsx), [transactions API](../server/routes/api/transactions.ts), [ledger](../server/lib/ledger.ts).

### 4. Import Existing Records

#### CSV

1. Select an owned import account and a CSV file.
2. Preview parsed rows without writing records.
3. Resolve categories and explicit transfer destinations.
4. Review possible duplicates and select rows.
5. Commit the selected rows atomically.

Category precedence: explicit selection, valid category hint, then enabled literal merchant rules ordered by priority and ID. Known source rows are skipped; possible content duplicates require acknowledgement. CSV does not perform statement reconciliation.

#### JSON Statements

1. Select the credit card and a schema-v1 statement.
2. Map categories and explicit funding accounts for payment rows.
3. Validate statement totals and opening-balance coverage.
4. Import all statement rows atomically.
5. Display the recorded closing-balance discrepancy, if any; never silently adjust it.

Payment rows become transfers. JSON row exclusions cannot bypass reconciliation. Both formats enforce a maximum of 2 MB and 5,000 rows. Raw source files are not retained.

Sources: [Imports](../src/pages/Imports.tsx), [CSV UI](../src/components/CsvImport.tsx), [CSV processing](../server/lib/csv-imports.ts), [JSON processing](../server/lib/imports.ts).

### 5. Plan

- **Budgets:** monthly category expense limits or income targets. Actuals derive from posted transactions; refunds reduce spending.
- **Bills:** independent reminders. Recording a full payment creates an expense; recording credit repayment creates a transfer from an explicit cash/bank/wallet account. No money is sent. Repeated confirmation cannot create another linked payment. Cadence is a reminder preference, not automatic recurrence.
- **Goals:** targets, allocations and contribution history only. Contributions do not change account balances or net worth. Allocations may exceed the target; progress visuals cap at 100%.

Sources: [Budgets](../src/pages/Budgets.tsx), [Bills](../src/pages/Bills.tsx), [Goals](../src/pages/Goals.tsx), [planning logic](../server/lib/planning.ts).

### 6. Review and Manage

Dashboard and Analytics summarize recorded activity. Global search finds owned transactions, accounts and bills; `/` focuses search when shortcuts are enabled.

Settings provides categories, merchant rules, provider directory records, shortcut/in-app alert preferences and workspace exports. Providers are directory records, not integrations.

Sources: [shared layout and search](../src/components/AppLayout.tsx), [Dashboard](../src/pages/Index.tsx), [Analytics](../src/pages/Analytics.tsx), [Settings](../src/pages/Settings.tsx), [reports API](../server/routes/api/reports.ts).

## Accounting Model

The ledger is the source of truth. Account balances sum non-voided account-entry deltas, not editable balance metadata.

- Expenses reduce balances; income and refunds increase them.
- Transfers post a negative source delta and positive destination delta.
- Liability openings use a negative balance.
- Refunds reduce spending.
- Transfers, openings and adjustments are excluded from income/spending totals.
- Net worth uses current recorded balances; selected-month reports use posted dates.
- Missing recorded history is unknown, not proof of zero activity.

Source: [ledger](../server/lib/ledger.ts).

## Technical Flow

React/TypeScript and React Query call the same-origin Nitro API. SQLite persists records. Mutations validate ownership and inputs, write atomically and invalidate relevant cached queries.

- Routes: [src/App.tsx](../src/App.tsx).
- API client: [src/lib/api.ts](../src/lib/api.ts).
- Backend routes: [server/routes/api](../server/routes/api/).
- Database schema and additive migrations: [server/lib/db.ts](../server/lib/db.ts).
- Reference prototypes: [ui](../ui/); these are not production functionality.

## Storage and Export Boundaries

SQLite and exported downloads are not encrypted by Luna. Production requires persistent protected storage, HTTPS and consistent backups. The backup script uses SQLite backup tooling and checks the resulting database integrity.

CSV export includes all owned non-voided transactions, beyond the default array API's 500-row limit. Text cells receive formula-prefix protection. JSON export includes planning and preferences, but is **not an automatic restore format**.

Sources: [export API](../server/routes/api/export.get.ts), [backup script](../scripts/backup.mjs), [operational guidance](../README.md).

## Explicit Limits

Unavailable: bank synchronization, executed payments, PDF/XLSX parsing, receipts, external notification delivery, automatic recurrence generation, partial bill payments, budget rollover, currency conversion, MFA, public registration and automatic recovery/restore.

## Verification

Analysis date: 2026-10-14. Source baseline: `6d4d7bf`.

- `npm test`: 27 tests passed, zero failures.
- `npx --no-install tsc -p tsconfig.app.json --noEmit`: passed.
- Browser workflows and production build were not exercised during this analysis.
- No application source changes were made during the analysis.
