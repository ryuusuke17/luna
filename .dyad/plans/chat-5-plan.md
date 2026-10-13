---
title: "Luna — Practical Architecture & Incremental Build Blueprint"
summary: "Self-hosted personal finance app using the existing React/TypeScript frontend, a small Node.js API, and SQLite. PHP-only accounting first; reviewed JSON statement imports and advanced analytics second; family sharing and PDF parsing deferred."
status: "accepted"
chatId: "5"
createdAt: "2026-10-13T09:58:03.858Z"
updatedAt: "2026-10-13T10:02:31.839Z"
---

# Luna — Technical Blueprint

## Overview

### 1. Project Feasibility

**Practical.** One application server, one SQLite database, a few authenticated users. No microservices, queues, bank integrations, external analytics, or AI required.

**Confirmed requirements:** rented-server self-hosting; willingness to maintain patches/backups; desktop/mobile access; PHP only initially; statement JSON prepared manually against Luna’s documented schema. Managed cloud remains acceptable, but is not the chosen deployment.

**Assumptions:** manual accounts, no automatic bank feeds; internet available when editing; one owner initially; Asia/Manila reporting dates; assets manually valued; no investment trading/tax accounting. Confirm VPS provider and domain before deployment, not before architecture approval.

Existing project: React, TypeScript, Vite, React Router, Tailwind, shadcn/ui, TanStack Query, Zod, Recharts, next-themes. No financial implementation or backend exists yet.

The hard parts are accounting semantics, import matching, reconciliation, and recoverable operations—not dashboard charts.

## UI/UX Design

### 2. Requirements Analysis

**Essential:** authenticated access; assets/liabilities; reliable ledger; income/expenses/refunds/transfers; credit purchases/repayments; adjustments; searchable history; budgets; overview; dedicated basic analytics; export/backup/recovery.

**Missing considerations resolved by these defaults:**
- Posted date drives reports; purchase date remains optional context. Future-dated ordinary transactions are rejected; future events use recurring schedules later.
- Balances mean recorded balances, not live bank balances. Display reconciliation dates and incomplete-history warnings.
- Credit card statement balance differs from current outstanding balance. Display both, labeled with dates.
- Opening balances establish a starting position, never income. Earlier history cannot be reconstructed from an opening balance.
- Loan principal is a transfer; interest/fees are expenses. A mixed repayment creates linked principal and interest transactions atomically.
- Refunds reduce spending on their posted date. Refunds exceeding purchases can produce negative category spending; do not hide it.
- Closing an account archives it; does not remove its remaining balance from net worth. Prevent deletion while financial history references it.
- Asset revaluations and balance corrections change net worth, not income/expenses; show them separately.
- Cash-flow reporting and expense recognition differ for credit cards; see calculation definitions below.
- Installments, pending authorizations, securities lots, amortization schedules, and split-category purchases are deferred. If needed initially, enter installment postings individually.

**Visual direction:** calm off-white surfaces, deep teal primary, indigo secondary, restrained coral warnings; slate text, rounded cards, strong numeric hierarchy. Dark mode uses navy surfaces and contrast-tested accents. Centralized CSS color tokens; no gradients. Use existing fonts/system fonts, tabular numbers, accessible labels. Charts provide useful visuals; a small Luna brand illustration belongs on login/empty states, not third-party photography around sensitive data.

**Navigation:** Overview, Accounts, Transactions, Analytics, Budgets; Imports appears in Phase 2. Desktop sidebar; mobile compact navigation plus menu. Settings contains export, security, account/category management.

**Primary flows:**
1. Create account: choose type, opening date/balance, PHP; explain asset versus liability.
2. Add transaction: type first, account/category/date/amount; transfer and repayment show two accounts and one amount. Mobile uses a full-height sheet, desktop a dialog.
3. Overview: assets, liabilities, net worth, income, expenses, income less spending, cash flow, card debt, remaining budget; recent activity and basic monthly chart.
4. Accounts: grouped assets/liabilities; account detail shows history, balances, and reconciliation status.
5. Analytics: accessible charts plus equivalent summary tables. Phase 1 monthly selection; Phase 2 full filtering/drill-down/export.
6. Import: drop JSON, validate, explicitly select/confirm card, review/edit rows, resolve matches/payments, confirm, reconcile.

Use skeletons, explicit empty/error states, keyboard navigation, visible focus, high contrast, generous touch targets. Never communicate income/expense solely by color. Purposeful loading transitions only; respect reduced motion. Warn before losing unsaved edits. Never fabricate sample financial data in a real account.

## Considerations

### 3. Stack Comparison

| Criterion | A: VPS + Node.js + SQLite | B: Static React + Supabase | C: VPS + Node.js + PostgreSQL |
|---|---|---|---|
| Development complexity | Moderate; API/auth/ops required | Lower auth setup; SQL/RLS still require care | Moderate-high; same API plus DB service |
| Typical ongoing cost | About $7–20/month including backup allowance | $0 on eligible free tiers; roughly $25–40+/month after paid upgrade | About $12–30/month for sensible VPS/backup sizing |
| Free-tier limits | SQLite has none; VPS trials are not durable free hosting | Database/storage/auth/egress quotas, inactivity policy, limited free recovery; verify current terms | PostgreSQL has none; host trials vary |
| Database performance | Excellent at this scale; one writer, many readers | Excellent; network round trips | Excellent; more concurrent writers |
| Security | You own patching, API authorization, backups | Provider operates DB/auth; you own correct RLS and frontend security | You own application, server, DB administration |
| Authentication | Owner password, server sessions; established password hashing | Managed Supabase Auth | Same as SQLite option |
| Deployment | One server, persistent local disk, TLS proxy | Static frontend plus managed project | App plus database deployment |
| Backup/recovery | Consistent SQLite backup plus encrypted off-site copies | Independent export needed; paid recovery options vary | Logical dumps plus optional WAL recovery |
| Multi-device | Yes; browsers use the API, not the database file | Yes | Yes |
| Family access | Small-scale roles practical | Auth/RLS helpful | Roles practical |
| Maintenance | OS/Node updates, monitoring, restores | Lowest infrastructure work; policies/migrations still yours | Highest of these options |
| Scalability | Enough for personal/family use; one server | Strong if eventually needed | Strong, unnecessary now |
| Lock-in | Low; standard SQL/data exports; SQL dialect migration work remains | Moderate around Auth/RLS/storage; PostgreSQL data portable | Low |

**SQLite works online across devices.** The server alone opens the database. Desktop/phone send authenticated HTTPS requests to that server. Never synchronize the live database through Dropbox or mount it on shared/network storage. Multi-device access does not imply needing PostgreSQL.

**Alternative deliberately rejected:** browser-only SQLite/IndexedDB. Cheap and private locally, but reliable multi-device sync, conflict handling, device loss, and family permissions would add more complexity than a small server. Managed SQLite providers add another service without meaningful benefit here.

### 4. Recommended Stack

**Primary: existing React frontend + Node.js LTS/Fastify + SQLite, deployed as one application on a VPS.**

| Technology | Reason |
|---|---|
| React + TypeScript + Vite | Already installed; retain working foundation. No SEO/server-rendering requirement to justify migration. |
| React Router | Existing routing; keep definitions in `src/App.tsx`. |
| Tailwind + customized shadcn/ui | Existing accessible primitives; no new UI framework. Do not edit shared `src/components/ui/*`. |
| TanStack Query | Existing server-state fetching/invalidation. No additional global state library. |
| Zod + React Hook Form | Existing form validation; reuse schema validation server-side at trust boundaries. |
| Recharts | Already installed; responsive charts and theme tokens; tables supply accessible alternatives. |
| Node.js supported LTS + Fastify | Small same-origin JSON API, documented lifecycle, request limits and plugin ecosystem. No separate serverless layer. |
| `better-sqlite3` | Mature SQLite access; explicit prepared SQL and transactions. Short synchronous operations fit this workload. |
| Maintained Argon2id implementation | Established password hashing; do not write cryptography. Benchmark parameters on the selected VPS. |
| Caddy | TLS termination and reverse proxy; serves HTTPS with straightforward configuration. |
| Native Node services | Crypto, file handling, logging, SQLite backup scheduling integration; no queue/cache service. |
| JSON parsing | Native JSON plus strict schema. No PDF libraries initially. |
| File storage | Persistent SQLite directory; no original statement storage and no Supabase Storage. |
| VPS | Reputable provider, approximately 1–2 GB RAM, persistent local SSD; choose 2 GB for comfortable operation. |

Use Fastify’s maintained cookie/rate-limit/static integrations where needed rather than implementing these primitives from scratch. Add only dependencies actually needed at each phase. Choose a supported Node LTS compatible with the installed Vite version.

**Why not Supabase now?** Your chosen self-hosting model favors keeping data and operations together. At this scale, managed PostgreSQL offers little database benefit and creates a second operator/service. If server upkeep becomes undesirable, Supabase becomes the better operational choice—not a worse technology.

**Why not PostgreSQL on the VPS?** More service management, backups, and configuration without a current concurrency need. Migrate only for measured lock contention, multiple application instances, or materially broader sharing.

**Cost caveat:** self-hosting is not intrinsically more secure or cheaper after maintenance time. This recommendation depends on your explicit willingness to operate it.

## Technical Approach

### 5. System Architecture

**One origin:** browser connects over HTTPS to Caddy; `/api/*` reaches Fastify; the same application deployment serves Vite’s compiled static files. SQLite resides outside the web root on a persistent volume.

**Request flow:** authenticate session → validate input → authorize owner/account access → apply parameterized SQL in a database transaction → return result → invalidate relevant frontend queries.

**Authoritative calculations live on the server.** Browser formats values and renders charts; it does not determine final balances or decide whether a transaction is valid.

**Money:** integer centavos in SQLite `INTEGER`; decimal strings such as `"1250.50"` at input/import boundaries; exact string-to-integer conversion. No `parseFloat(amount) * 100`. Reject excess decimals, negative unsigned inputs, unsafe integers, and overflow. PHP only; retain account currency fields for future migration, but disallow foreign currencies/transfers now.

**Dates:** financial posting dates are validated `YYYY-MM-DD` calendar dates. Audit timestamps use UTC. Monthly reporting uses Asia/Manila calendar boundaries, not accidental browser timezone conversions.

**Signed account entries:** positive increases an account’s contribution to net worth; negative decreases it. Asset opening balances are usually positive; debt balances negative. UI accepts/display debt owed as positive and converts internally.

Examples:
- PHP 100 cash expense: cash entry −10,000 centavos; spending +10,000.
- PHP 100 card purchase: card entry −10,000; spending +10,000.
- PHP 100 card repayment: bank −10,000, card +10,000; spending/income zero.
- PHP 100 refund: original payment account +10,000; spending −10,000.
- Loan proceeds: cash positive, liability negative; income zero.
- Principal repayment: cash negative, liability positive; expense zero. Interest is a linked expense.

This is a **small account-entry ledger**, not a full accounting general ledger. Transfers must have exactly two distinct account entries summing to zero; individual income/expense entries need not sum to zero.

**Consistent reporting definitions:**
- Balance on date = sum of valid posted entries through that date, including opening/adjustment entries.
- Assets = sum of positive account balances; liabilities = absolute sum of negative account balances; net worth = assets − liabilities. Thus an overpaid card is a credit asset, not negative debt. Negative balances on nominal asset accounts are highlighted as overdrafts.
- Income = income transactions only. Expenses = purchases/expenses/fees/interest minus refunds.
- Income less spending = income − expenses, with purchases recognized when posted regardless of repayment date.
- **Actual net cash flow** = transaction-driven change across accounts designated liquid cash/bank/wallet. Exclude opening/valuation/adjustment entries; transfers within that liquid group cancel. Credit repayment reduces cash flow; card purchases do not until paid; loan proceeds increase cash flow but never income. Explain financing differences beside this KPI.
- Budget actuals use the expense definition, not cash flow. Total remaining category budget is the sum of category limits minus their actuals; show unbudgeted spending separately.
- Transfers, repayments, openings, and adjustments never inflate income/expenses. Statement balances are reconciliation references, not extra ledger entries.
- Charts are rebuilt from ledger dates, not from repeatedly captured mutable totals. No analytics pipeline or daily snapshot job initially.

Queries return data coverage/reconciliation status. Historical charts stop at known coverage; unknown earlier data is not represented as zero.

### 6. Database Design

Use parameterized SQL, versioned SQL migrations, foreign keys enabled, WAL mode, busy timeout, conservative durability settings, and short writes. No ORM initially.

| Table | Main fields / purpose |
|---|---|
| `users` | ID, unique login, Argon2id password hash, timezone, created timestamp. One owner initially; no public registration. |
| `sessions` | Hash of random session token, user ID, expiry, creation timestamp. Raw token exists only in the protected cookie. |
| `accounts` | ID, owner ID, name, type, PHP currency, liquid-cash flag, opening date, archived timestamp. Types include cash, bank, wallet, credit card, loan, other asset/liability. No writable cached balance. |
| `categories` | ID, owner ID, name, income/expense kind, archived timestamp. Preserve referenced historical categories. |
| `transactions` | ID, owner ID, kind, posted date, optional purchase date, positive `amount_minor`, account/counteraccount references where applicable, category, merchant, description, optional notes, origin, correction/void metadata, idempotency key, timestamps. |
| `account_entries` | Transaction ID, account ID, signed `delta_minor`. Source of balances; created only through ledger operations. |
| `credit_cards` | Account ID, optional issuer/last four, optional limit, cycle/due-day metadata. Never full card numbers, CVV, or passwords. |
| `statement_imports` | ID, owner/card IDs, version, stable statement ID, period, optional opening/closing statement balances, file/content fingerprint, status, counts, reconciliation outcome. No source document. |
| `statement_import_rows` | Import/row/source IDs, normalized minimum matching/review metadata, decision, linked transaction. No raw JSON blobs. Retain only needed financial provenance. |
| `budgets` | Owner, category, calendar month, limit in centavos. Unique owner/category/month; no rollover initially. |
| `audit_events` | Owner, action, entity ID, essential change metadata, UTC timestamp. Financial correction trail; never passwords/tokens/source files. |
| `recurring_rules` — Phase 2 | Owner, account/category, kind, amount, frequency, next date, enabled. Generate reviewable reminders/drafts first. |
| `account_members` — Phase 3 | Unique account/user, role. Introduce only with actual family sharing. |

**Relationships:** user owns accounts/categories/transactions; transaction owns entries; entry references an account; card metadata extends an account; statement has rows that can link to existing or imported transactions; category receives monthly budgets.

**Constraints/invariants:**
- Foreign keys and ownership checks prevent cross-user references. Authorization is enforced server-side on every route, not inferred from the UI.
- Amounts are positive integer centavos for ordinary transactions; entry deltas are signed integers. Zero opening balances need no entry.
- Transaction type defines required entry count/signs/category. For transfers, same currency, distinct accounts, equal/opposite entries. Test these rules centrally.
- Unique request idempotency keys prevent retry/double-click duplicate writes.
- Stable source transaction IDs are unique per owner/card when provided; never impose uniqueness on date/merchant/amount alone.
- Stable statement identity unique per owner/card. File fingerprint catches exact repeat uploads, not all semantic duplicates.
- Opening entries unique per account; all migrations and financial writes transactional.
- Posted edits replace/void the previous transaction and create its corrected version atomically with audit history. No silent direct edits of entry deltas.
- Referenced accounts/categories cannot be hard-deleted. Owner-wide export/deletion is a separate explicit operation.

Balance starts with an opening ledger entry. A manually entered target balance produces an explicit adjustment delta, reason, and timestamp. It never rewrites the opening balance to hide history.

### 7. Credit Card Import Architecture

**Committed scope: JSON first; no automatic statement extraction.** You prepare structured JSON. Luna validates fields, identifies proposed transaction types, suggests categories, and reconciles balances. This removes layout/OCR variability, but manually prepared JSON can still contain omissions, swapped dates, duplicated rows, or wrong signs.

#### Proposed JSON v1 sample

This is a data contract example, not application code. Account references use user-defined stable keys; imports require explicit account confirmation.

```json
{
  "schema_version": 1,
  "statement_id": "my-card-2026-06",
  "account_key": "my-credit-card",
  "currency": "PHP",
  "issuer": "My Bank",
  "period": {
    "start": "2026-06-01",
    "end": "2026-06-30"
  },
  "opening_balance": "5000.00",
  "closing_balance": "3765.00",
  "due_date": "2026-07-20",
  "transactions": [
    {
      "source_id": "my-card-tx-001",
      "posted_date": "2026-06-03",
      "transaction_date": "2026-06-02",
      "type": "purchase",
      "merchant": "Grocery Store",
      "description": "Groceries",
      "amount": "1250.00",
      "category_hint": "Groceries"
    },
    {
      "source_id": "my-card-tx-002",
      "posted_date": "2026-06-10",
      "type": "refund",
      "merchant": "Grocery Store",
      "description": "Returned item",
      "amount": "500.00",
      "related_source_id": "my-card-tx-001"
    },
    {
      "source_id": "my-card-tx-003",
      "posted_date": "2026-06-15",
      "type": "payment",
      "description": "Card repayment",
      "amount": "2000.00",
      "counter_account_key": "my-bank-account"
    },
    {
      "source_id": "my-card-tx-004",
      "posted_date": "2026-06-20",
      "type": "fee",
      "description": "Card fee",
      "amount": "15.00"
    }
  ]
}
```

Opening/closing amounts above mean **positive debt owed**: 5,000 + 1,250 − 500 − 2,000 + 15 = 3,765. Credit balances use explicitly documented negative debt values. Transaction amounts remain positive; `type` determines their effect. Opening/closing statement balances never automatically become account opening/adjustment transactions.

Supported initial row types: `purchase`, `refund`, `payment`, `fee`, `interest`. Unknown types are rejected. `source_id` must remain stable for the same transaction across overlapping statements; when no reliable ID exists, omit it rather than inventing a misleading one. Category hints suggest, never create categories silently.

#### Processing flow

1. Browser accepts a bounded JSON file, initially at most 2 MB/5,000 rows. Parse in memory; reject invalid UTF-8/JSON/schema, excessive lengths, invalid dates/currency/amounts, unsupported versions. Never execute uploaded content.
2. Confirm selected card and account key; never route imports using issuer/name alone.
3. Normalize dates/descriptions/amounts without destroying original merchant meaning. Client and server both validate; server is authoritative.
4. Suggest categories through existing exact/normalized merchant matches, then optional user-created rules. No AI required.
5. Identify exact file/statement repeats, known source IDs, and candidate matches by account/date/amount/type/normalized merchant. Identical legitimate purchases can exist: uncertain matches require review, not automatic deletion.
6. Review rows: new, matched existing, possible duplicate, invalid, unresolved payment. Correct data/category/account inline; show statement math and warning counts.
7. Payments match existing repayment transfers where possible. Otherwise require a real funding account. If a bank-side payment was entered earlier, link/correct that record—never create another transfer. Ambiguous matches block or require explicit resolution.
8. Commit selected resolved rows in one SQLite transaction; recheck duplicates and account access at commit. Save import provenance and audit event. Retry returns the same result through idempotency.
9. Reconcile closing debt with ledger balance on the statement end date, excluding later transactions. Show differences and coverage gaps; never force an automatic adjustment. An explicit skipped/unresolved row marks the import partial.
10. Clear file/draft references after completion/cancel/logout. No original upload on disk, logs, telemetry, browser storage, or backup. Server may receive normalized rows in memory; only approved provenance/financial records persist.

Statements starting before the account opening date require a coverage decision; do not post older rows atop a later opening balance. Reconcile the cutoff or adjust the opening setup explicitly first.

#### Password-protected PDF path — deferred

If justified later, use `pdfjs-dist` with its browser worker for supported encrypted/text-based PDFs. Prompt locally for the password, pass it to PDF.js, retry invalid passwords, extract text/layout coordinates in memory, then discard document/worker/password references. Do not transmit or persist the password. JavaScript cannot guarantee cryptographic erasure from browser memory; state that limitation honestly.

Select a bank/version-specific parser against redacted test fixtures; normalize into the same JSON schema/review flow. PDF.js extracts text/positions, not trustworthy financial rows. Reject unsupported encryption, missing text, unfamiliar layouts, and uncertain totals instead of guessing.

| Approach | Reliability / cost / limitations |
|---|---|
| Manually prepared JSON | Most predictable schema; low cost/privacy exposure. Source completeness and human preparation errors remain. |
| Local PDF text extraction | No third-party disclosure; good for text PDFs. Columns, fonts, dates, line wrapping, passwords and issuer changes complicate extraction. |
| Bank-specific parsers | Best control for known samples; still require ongoing fixtures and maintenance. Never assume universal layout. |
| Local OCR, such as Tesseract | Scans possible; heavy downloads/CPU, poor mobile speed, decimal/sign recognition errors. Not a dependable unattended importer. |
| External OCR/AI | May handle layout variation; paid service and sensitive-data disclosure, retention/jurisdiction questions, hallucinated/omitted rows. Explicit consent, redaction, deterministic validation and review required. |

No parser or AI eliminates human review and reconciliation. JSON solves transport/schema consistency—not source-document accuracy.

### 8. Security Strategy

- **Private deployment:** preferably restrict app access through a private mesh VPN such as Tailscale, subject to its current personal-plan terms. Only authorized desktop/mobile devices reach the app. No public registration. VPN access complements, not replaces, application authentication.
- If internet-public access is needed, retain HTTPS, login throttling, generic auth errors, strict authorization, security headers and monitoring; add MFA before broader access. Do not expose a demo mode with real data.
- Bootstrap the owner through a server-side setup command. No seeded/default passwords. Maintain an operator-only recovery command with session invalidation and an audit event.
- Argon2id hashing with benchmarked memory/time settings; login concurrency/rate limits prevent exhausting a small VPS. Unique salts supplied by the library.
- Random high-entropy session tokens; hashed at rest; Secure, HttpOnly, SameSite cookies; inactivity/absolute expiry, logout revocation and rotation on login/password change. No auth tokens in localStorage.
- Same-origin API; reject unexpected request origins; CSRF token for mutation requests; restrict content types. No wildcard credentialed CORS.
- Prepared SQL only; strict request schemas; account ownership checks; limits on pagination, search, request size and import rows.
- No raw HTML from notes/merchants. Content Security Policy, anti-framing and appropriate MIME/referrer headers. Avoid third-party scripts and remotely loaded assets.
- Least-privilege service user, owner-only database permissions, SSH keys, host firewall, restricted SSH, supported OS/Node, dependency security updates. SQLite has no network listener; restrict every other exposed service.
- HTTPS protects transit. SQLite itself is **not encrypted**. Verify VPS volume-encryption guarantees; consider encrypted volume storage if provider protection is insufficient. Host administrators can still access a running app’s plaintext data. Do not claim end-to-end/zero-knowledge security.
- Backups must be encrypted before leaving the host. Backup keys are separate from the backup destination; retain a tested recovery copy safely offline.
- Application logs contain operational IDs/error codes, never financial descriptions, statements, credentials or session tokens. Keep access/security logs bounded.
- Sensitive API responses use `Cache-Control: no-store`; do not persist React Query caches. Clear in-memory state on logout. Financial browser offline storage is deferred.
- Export includes versioned JSON with integer amounts and schema metadata; optional CSV later protects against spreadsheet formula injection. Export is not a substitute for a consistent database backup.
- Account-wide deletion requires reauthentication and confirmation. Disclose that prior encrypted backups retain data until their retention expires; do not promise immediate deletion from historical backups.

**Backups/recovery:** nightly consistent SQLite online backups, not arbitrary copies of a live main file. Run integrity checks on the backup; encrypt and send to an independent off-site destination. Initial retention: 7 daily, 4 weekly, 3 monthly. Back up before migrations and before high-risk upgrades. Restore to a separate instance monthly; verify login, counts, balances and import links. Initial target: RPO at most 24 hours after successful nightly backup; RTO roughly 1–4 hours, contingent on tested procedures. Monitor backup failure and disk capacity.

### 9. MVP Feature List

**Phase 1 — daily-use foundation**
- Owner login/logout; protected navigation.
- PHP assets/liabilities, credit card/loan metadata, opening balances, explicit adjustments, account archive.
- Income, expense, refund, transfers, card purchases and repayments; principal/interest entered as distinct linked records.
- Transaction history, edit/void with audit trail, basic search/date/account/category filters.
- Categories and monthly category budgets.
- Overview KPIs; dedicated basic analytics with monthly income/expense, category breakdown, cash flow and historical net worth.
- Simple manual reconciliation/coverage markers; useful empty/error states.
- Responsive light/dark UI.
- Versioned data export, backup/restore procedure, security hardening.

**Phase 2 — automation & analytics**
- Reviewed JSON statement import, provenance, duplicate detection, payment matching, reconciliation.
- Merchant/category rules; recurring reminders/drafts.
- 3/6/12-month/custom filters, account/category/type filters, comparisons when enough history exists.
- Merchant/account/source breakdowns, card spending/repayment trends, budget history, account balances over time.
- Chart/metric drill-down; CSV export of filtered data. YoY requires genuine prior-year coverage.

**Phase 3 — usage-justified additions**
- Separate family users, private/shared accounts, explicit roles.
- Optional PDF parsers for specific issuers; scans only if essential.
- PDF reports, simple forecasts, optional multi-currency with dated rates.
- Installable PWA shell; offline financial edits only if their sync/security complexity is justified.

JSON imports are important but depend on the ledger. Do not ship a visually polished importer before transfers and reconciliation are correct. Recurring transactions initially create drafts; avoid silently booking transactions that may never occur.

### 10. Development Roadmap

#### Implementation Steps

1. **Accounting contract first.** Document signs, dates, coverage, JSON v1 and KPI formulas. Create centavo conversion/validation and small runnable invariant tests before dashboard work.
2. **Backend foundation.** Add Node/Fastify entry, SQLite connection, migration runner and first migration. Establish authentication, owner bootstrap, sessions, request validation and authorization.
3. **Ledger operations.** Implement atomic creation/correction/void, opening entries, adjustments and transfer/repayment invariants. Validate safe integers and retry idempotency. Test before UI integration.
4. **Visible daily workflows.** Replace `src/pages/Index.tsx`; add login/accounts/transactions pages and customized forms. Register every route in `src/App.tsx`.
5. **Budgets and basic analytics.** Implement authoritative SQL queries, coverage labels, monthly charts and mobile/theme behavior. Verify reports against ledger fixtures.
6. **Deployment gate.** Build frontend/backend, provision persistent VPS storage, configure Caddy/private access, backups and restore drill. Perform dependency/security checks before entering real finances.
7. **JSON import vertical slice.** Start with one documented schema and an adversarial fixture set. Build preview, matching, correction, atomic commit and reconciliation. No PDF/OCR dependencies.
8. **Advanced analytics.** Add requested ranges/filter combinations, drill-down, comparisons and CSV; index measured queries only.
9. **Recurring drafts and category rules.** Add only after manual usage identifies worthwhile automation.
10. **Reassess sharing/PDF/PWA.** Actual usage determines whether Phase 3 exists.

Each step produces a usable/testable increment. No simultaneous frontend/backend redesign and no scaffold for speculative infrastructure.

#### Code Changes

Keep application source under `src/`; keep route definitions in `src/App.tsx`. Do not edit existing shadcn primitive files.

| Paths | Planned changes |
|---|---|
| `src/App.tsx` | Theme/auth composition, protected routes, public login; routes for all implemented pages. |
| `src/pages/Index.tsx` | Real Luna overview; mount new summary/chart/recent-activity components. |
| `src/pages/Login.tsx`, `Accounts.tsx`, `Transactions.tsx`, `Analytics.tsx`, `Budgets.tsx`, `Settings.tsx` | Phase 1 workflows. |
| `src/pages/Imports.tsx` | Phase 2 review/import workflow. |
| `src/components/AppLayout.tsx`, `TransactionForm.tsx`, `AccountForm.tsx`, `FinanceChart.tsx` | Shared layout/forms/accessibility; add only components reused or meaningfully complex. |
| `src/globals.css`, `tailwind.config.ts`, `index.html` | Luna color/theme tokens, typography and title; avoid unrelated styling changes. |
| `src/lib/api.ts`, `src/lib/money.ts`, `src/lib/finance-schema.ts` | Same-origin API helper, exact money handling, schemas shared with server. Never import server/database secrets into frontend. |
| `src/server/index.ts`, `db.ts`, `auth.ts`, `ledger.ts`, `reports.ts` | Small Fastify server, SQLite/migrations, sessions, ledger and report queries. Split further only when complexity warrants it. |
| `src/server/migrations/*.sql` | Versioned schema/index evolution. |
| `src/server/imports.ts`, `src/lib/statement-schema.ts` | Phase 2 import validation/matching/commit, JSON v1 contract. |
| `src/server/backup.ts`, `src/server/setup-owner.ts` | Consistent backup and operator setup/recovery utilities. |
| `src/server/*.test.ts`, `src/lib/*.test.ts` | Native Node test runner/assert tests, especially ledger/import/amount handling. |
| `package.json`, backend TypeScript configuration, `vite.config.ts` | Minimal backend dependencies/scripts; development API proxy; separate backend build. |
| `README.md`, operator documentation, `Caddyfile`, service configuration | Deployment, backup/restore, patching and configuration; runtime data excluded from Git. |

Preserve existing `src/pages/NotFound.tsx`; place routes before the catch-all. Existing `vercel.json` is not the production deployment mechanism for the SQLite backend.

#### Testing Strategy

Use Node’s built-in test runner and assertions for nontrivial financial logic; temporary real SQLite databases for integration tests. No new unit-test framework initially.

**Required invariant fixtures:**
- Expense/income/refund correct signs and category totals.
- Card purchase counts once; repayment changes cash and debt, not spending.
- Asset transfer preserves net worth; loan proceeds/principal preserve net worth; interest reduces it.
- Openings/adjustments do not appear as income/expenses.
- Corrections/voids retain audit trail and leave expected balances.
- Duplicate request/import retries produce no extra records.
- Same-date/same-merchant/same-amount legitimate purchases survive review.
- Existing bank-side repayment matches rather than double-posts.
- Mid-import failure rolls back all selected writes.
- Statement reconciliation excludes transactions after statement end.
- Exact decimal parsing, boundary amounts, invalid dates, month/leap-year boundaries and incomplete coverage.
- Unauthorized/cross-owner requests fail even with guessed IDs; CSRF/session expiry/logout/rate limits behave correctly.
- Export totals match ledger; backup restore reproduces totals and provenance.

Manual acceptance: phone/tablet/desktop, keyboard/screen-reader basics, both themes, large import previews, slow network/retry, empty/loading/error states. Type-check, lint, production build and core integration suite gate deployments. Add a small browser smoke-test tool only if repeated regressions justify another dependency.

**Deployment workflow:** local development with synthetic data → versioned commit/tests/build → encrypted pre-migration backup → deploy to persistent VPS → migration → restart → smoke test. Do not ship financial production data to preview environments. Application rollback must account for schema compatibility; irreversible migrations need a tested restore strategy. One service/process manager plus Caddy is enough; no Docker requirement, Kubernetes, Redis, or CI platform needed initially.

### 11. Estimated Costs

Planning estimates in USD, not live vendor quotes; taxes, regional availability and plan changes apply.

| Item | Estimate |
|---|---|
| VPS with 1–2 GB RAM | $5–12/month; budgeting for 2 GB is safer |
| Encrypted off-site backups | $1–5/month at personal-app data volumes |
| Provider snapshots, optional | $1–3/month; not a replacement for off-site backups |
| Domain, optional with suitable private setup | $10–25/year |
| TLS certificate | $0 using automated issuance |
| Private mesh access | Potentially $0 within eligible personal-plan limits; verify terms |
| Core libraries | $0 license cost with normal open-source compliance |
| External OCR/AI | $0; not used |
| Typical operating total | Approximately $7–20/month; extras may bring it to $20–30 |

Development effort, including basic security/testing/deployment: Phase 1 roughly **70–120 hours**; Phase 2 roughly **45–90 hours**; Phase 3 estimated only after scope validation. At $30–80/hour, Phase 1 is approximately **$2,100–9,600**, Phase 2 **$1,350–7,200**. DIY labor reduces cash cost, not required effort. AI tool subscriptions/usage are separate and do not replace financial verification.

Ongoing maintenance: budget 1–3 operator hours/month plus occasional recovery/upgrades. Supabase may initially cost $0, but a paid baseline commonly starts around $25/month before extras; verify current quotas, backup/retention and inactivity terms rather than assuming permanent free operation.

### 12. Risks & Trade-offs

| Risk | Mitigation |
|---|---|
| JSON is structurally valid but financially wrong | Review, row totals, statement reconciliation, stable source IDs and coverage labels. |
| False duplicate detection | Exact stable IDs where trustworthy; uncertain matches require decisions; preserve legitimate repeated purchases. |
| Credit card payment appears in two sources | Match/link to one repayment transaction; never import two independent expense records. |
| Old statement overlaps later opening balance | Explicit cutoff reconciliation; block incompatible history until resolved. |
| Self-hosting becomes a burden | Document operations, automate backups; switch to managed infrastructure if duties are neglected. |
| Server loss/ransomware | Independently encrypted off-site backups and proven restore procedure. |
| SQLite write contention | Short transactions, WAL, bounded imports, one app instance; PostgreSQL only after measured need. |
| Misleading analytics | Published definitions; separate cash flow from spending; warn about missing history and skipped rows. |
| Same-device compromise | VPN/HTTPS cannot protect an already compromised device; OS/browser updates, screen lock, short sessions. |
| Family permissions prove complex | Delay feature; later define shared-data/report visibility before adding members. |
| PDF support overruns scope | JSON first; support only named issuer/layout versions with fixtures. |
| Financial edits destroy evidence | Atomic replacement/void plus limited audit trail; no direct balance overwrites. |

No promise of flawless categorization, universal statement parsing, bank-grade operational security, or automatic recovery without tested backups.

### 13. Future Improvements

Add only for demonstrated need:
- **Family sharing:** owner/editor/viewer roles; shared account transactions/categories/report visibility need explicit rules. No household hierarchy initially.
- **MFA:** prioritize if access becomes public or more users join.
- **PWA:** useful for installation and quick launch; initially cache static shell only, never API responses. Offline edits require a separate conflict/retry/security design.
- **PDF support:** one issuer at a time; redacted fixtures; reuse JSON review/reconciliation pipeline.
- **Forecasting:** transparent projections from recurring drafts, not opaque AI predictions.
- **Multi-currency:** exact minor units per currency, dated rates and valuation provenance; no automatic mixed-currency net worth until specified.
- **PostgreSQL/Supabase migration:** justified by operational preference or measurable concurrency/sharing limits, not user-count speculation.
- **PDF reports, investment lots, advanced debt schedules:** postpone until they solve an observed problem.

**Approval boundary:** architecture/plan review only. No application code or file changes until explicitly approved. Approve Phase 1 first; revisit later phases after daily use.