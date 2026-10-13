# Luna: detailed personal-finance UI skeleton

Open `detailed.html` in a modern browser. No installation or build step is needed.

This is a navigable, independently authored, TimelyBills-inspired prototype,
not a downloaded copy of its source or a production finance application.
The previous `index.html` remains a separate, simpler prototype.

**Use fictional data only. Changes disappear when the page reloads.**

## Files

| File | Purpose |
| --- | --- |
| `detailed.html` | Shared shell, navigation, search, native dialog, toast |
| `detailed.css` | Light/blue design tokens, charts, cards, tables, responsive layouts |
| `detailed.js` | Nine screens, invented records, calculations, demo interactions, self-check |
| `evidence/` | Desktop, tablet, phone, and additional-state screenshots; verification report |

All icons and chart geometry are local. No third-party scripts, remote fonts,
bank requests, or user statement files are loaded by the skeleton.

## Screen Map

Routes are hash links inside the same HTML file.

| Route | Detailed layout |
| --- | --- |
| `#dashboard` | Month picker; spending, income, remaining budget, bills-due summaries; daily spending graph; recent activity; category/merchant breakdown; six-month cash flow; bill calendar; account summary |
| `#budget` | Expense/income views; planned/actual/remaining/usage summaries; category budget cards; utilization bars; rollover indicator; create/edit forms; empty state |
| `#bills` | Upcoming/Overdue/Recurring/Paid views; dated bill groups; due-date badges; payment-record dialog; monthly commitments; reminder link |
| `#goals` | Allocated/target/active/achieved summaries; Active/Achieved views; target dates; progress bars/rings; creation; contributions; detail dialog |
| `#transactions` | All/Expenses/Income/Transfers views; month picker; description search; category/account/status filters; date/amount sorting; transaction table; details; creation; CSV export |
| `#accounts` | Cash/bank and credit groups; assets/debt/net-position summaries; selectable accounts; balance/limit/details; recent account activity; create/edit manual accounts |
| `#settings` | Profile, currency/language, categories, mappings, reminders, providers, data/privacy sections |
| `#import` | Spreadsheet/PDF modes; local file-metadata selection; instructions; CSV template; fictional review table; duplicate/category warnings; disabled import confirmation; history empty state |
| `#help` | Getting started; prototype boundaries; expandable FAQs; keyboard shortcuts; screen coverage |

The shared shell includes route highlighting, a search-results panel, a
profile shortcut, quick entry, and a mobile navigation drawer.

## Settings Sections

| Section | Implemented surface |
| --- | --- |
| Profile | Editable demo display name; personal workspace label; disabled email field |
| Currency & language | Fixed PHP and English controls; local date formatting; light appearance |
| Categories | Category list, type badges, create-category dialog, duplicate-name validation |
| Category mapping | Merchant phrase/category rule list and create-rule dialog; rules are drafts only |
| Notifications | Bill reminders, budget alerts, and goal-milestone switches; no permissions requested |
| Service providers | Provider labels, service categories, create-provider dialog |
| Data & privacy | Session-only warning, demo export, storage/backup implementation boundaries |

## Form Fields

All entry forms use a native dialog, labeled controls, validation, Cancel,
Escape dismissal, and an explicit "Save to demo" action.

| Form | Fields |
| --- | --- |
| Transaction | Expense/income/transfer; amount; local date/time; category; merchant/source; description; source account; transfer destination; budget label; Cleared/Pending status; notes; disabled receipt slot |
| Budget | Name; expense/income type; category; monthly limit; visual rollover preference |
| Bill | Name; amount; due date; One time/Weekly/Monthly/Yearly repeat; category; account; notes |
| Payment record | Full bill amount; payment date; cash/bank source account; notes; explicit no-money-sent warning |
| Savings goal | Name; goal type; target; already saved; target date; planning account |
| Contribution | Amount; date; notes; retained in the goal detail view |
| Manual account | Unique nickname; institution label; account type; manual balance; optional credit limit |
| Category | Unique category name |
| Mapping rule | Merchant phrase; assigned category |
| Service provider | Provider name; service category |

Transfers require two distinct existing accounts and are excluded from
income/expense totals. Negative transaction amounts and blank required text
are rejected. Account renaming updates demo record labels.

## Data and Behavior

- Sample date: October 14, 2026. Initial selected month: October 2026.
- Initial monthly expenses: PHP 18,450; income: PHP 45,000; transfers: PHP 5,000.
- Charts and totals use the invented ledger, not the CSV or PDFs in the parent folder.
- Changing months updates applicable totals, graphs, filters, and calendar cells.
- Global search covers transactions, bills, and accounts. Results clear conflicting filters or select the matching bill status.
- Goal contributions update allocation progress only. Account balances remain manual.
- Bill payment records demonstrate full payment only. They never send money or schedule a payment.
- Budget utilization is based on category and transaction type; the transaction's budget dropdown is a draft association field.
- Export includes the full demo ledger, including historical months, not just the current filtered view.
- CSV text cells neutralize spreadsheet-formula prefixes and escape quotes.

## Import Boundary

File selection reads **name and size only**, never file contents.
Spreadsheet mode accepts CSV/XLSX; statement mode accepts PDF; maximum 10 MB.
Changing modes or choosing an invalid file clears the earlier selection.

"View demo review screen" shows invented rows regardless of file selection.
Its checkboxes, account selector, possible-duplicate badge, and missing-category
badge illustrate the future review flow. They do not import anything.
"Confirm import" remains disabled.

No parser, OCR, AI extraction, actual duplicate detection, file upload,
import history, or statement mutation is connected.

## Responsive and Keyboard Behavior

- Wide screens: fixed-width left navigation, sticky top bar, multi-column content.
- At 850 px and below: off-canvas navigation, stacked primary content, grouped settings buttons.
- At 560 px and below: compact cards, stacked forms, wrapping actions, scrollable transaction tables.
- The closed drawer is hidden from assistive technology and excluded from keyboard focus.
- Opening the drawer focuses its close control, traps Tab inside, and makes background content inert.
- Escape closes the drawer and restores focus to its opener.
- Native dialogs protect focus. Buttons and links have visible keyboard outlines.
- `N`: add transaction. `/`: focus search. `Escape`: close overlays.
- Shortcuts do not intercept typing or modifier-key combinations.
- Reduced-motion preferences disable transitions.

## Validation

From the project folder:

```powershell
node --check ui/detailed.js
node ui/detailed.js
```

The runnable self-check verifies monthly totals, transfers, month boundaries,
year rollover, filters, import metadata limits, HTML escaping, CSV safety,
and rendering of all nine screens.

Opening `detailed.html?selfcheck#dashboard` also runs the self-check in-browser.

`evidence/verification.json` records browser-tested workflows and the final
desktop/tablet/phone screen checks. Screenshots are viewport captures, not a
claim that every below-the-fold state appears in one image.

## Intentionally Unconnected

Persistence, backups, authentication, bank synchronization, real imports,
receipt processing, notification delivery, automatic recurrence generation,
partial payments, currency conversion, multilingual content, and multi-user
sharing are not implemented. Rollover and mapping rules are visual/draft
preferences, not active accounting engines.

Build durable storage and recoverable backups before using any real records.
The skeleton is intentionally local and is not published or deployed.
