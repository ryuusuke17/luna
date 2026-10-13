# Luna UI contract

## Context and goals
Luna must show owned, persisted finance records using `ui/DESIGN.md` foundations; prototype data must never ship. Reference inventory (83 links, 34 cards, 12 buttons, 9 lists, 3 navigation regions, 1 input) must not become a density quota.

## Foundations
Components must use semantic Tailwind colors. Canvas/background must pair with foreground; card/popover must pair with their foreground; primary/sidebar must pair with cream foreground. BasisGrotesque must fall back to system sans until licensed files are supplied. Typography must use the 11.76–22.11px scale; base must be 14/21px. Spacing must use 2,4,6,8,10,12,16,20px; larger spacing must use multiples of 4px. Controls/panels must use 3.5/8px radius; pills must be badges only. Shadows/motion must use named tokens. Reduced motion must remove nonessential transitions.

Semantic extensions: muted foreground (dark neutral), border (mid neutral), focus/success (green), warning (dark ochre), error (dark red) must pass 4.5:1 text against raised/muted cream; boundaries must pass 3:1. Charts must use chart tokens. Focus on dark navigation must use cream. Teams should prefer shared tokens over local exceptions.

## Component states
| Component | Default / hover / focus-visible / active / disabled | Loading / error / empty |
|---|---|---|
| Button/link | Semantic action or quiet variant; hover must change surface/underline; focus must outline 3px with 3px offset; active must shift 1px; disabled buttons must reject pointer/keyboard activation. Links must use Enter; buttons must use Enter/Space. | Pending actions must disable repeats and expose aria-busy; failures must announce an alert, retain values. Empty actions must explain prerequisites and link setup. |
| Field | Visible label must contain/control input; native selection/keyboard must remain; hover must retain boundary; focus must outline; active must preserve cursor; disabled must explain why. | Invalid fields must expose aria-invalid and aria-describedby; error must remain visible; async failures must retain values. |
| Tabs/filter | Radix tabs must announce selection, support arrow/Home/End; native selects must retain keyboard behavior. Hover/focus/active must match controls; disabled must reject selection. | Loading must announce status; errors must not look like no matching records; empty filtered results must identify filtering. |
| Dialog/Sheet | Named title/description must exist; focus must enter/trap/return; Escape must dismiss when no write is pending. Hover/active apply to child actions; disabled parent state is not applicable. | Pending writes must block dismissal and repeats; failure must retain form; prerequisites must link setup. |
| Card/list/table | Parent hover/focus/active/disabled are not applicable unless interactive. Names must wrap; money must remain readable. Rows must expose details. | Loading/status, failed/alert, empty and filtered-empty must differ. Tables must scroll only inside labeled keyboard-focusable regions. |
| Chart/progress/calendar | Charts' interaction-only states are not applicable. Progress must expose actual/target through aria-valuetext; over-target visual width must cap at 100%. Calendar date buttons must announce full date/count, support pointer/Enter/Space/touch; selection must announce pressed state. | Chart tables must provide identical values; no recorded history must not claim complete zero activity; failure/loading must be separate. |

At <=850px, Sheet must replace sidebar. At <=560px, forms/actions/cards must stack. Every control must have >=24px target; primary controls should use 44px. No interaction must depend on hover. Long content must wrap or open full details; overflow must stay within its component.

## Accessibility acceptance
Pass/fail: text contrast >=4.5:1; meaningful boundaries >=3:1; focus visible under sticky header. Tab must reach every action. Closed drawer must have no tabbable content; open drawer must trap focus, Escape must restore opener. Search must support arrow navigation, Enter, Escape; counts must announce. Dialog errors must announce and link affected fields. At 320px, 200% zoom, reduced motion, all actions must remain reachable. Shortcut-disable must persist; typing/modifiers/open overlays must not trigger shortcuts.

## Content and tone
Actions must say “Record payment”, “Import selected rows”, “Export all transactions”. Payment form must say “Record payment. No money is sent.” Cadence must say “reminder preference”; allocations must say “No account balance changes.” Currency/language must remain PHP/English. Privacy must disclose server storage and unencrypted SQLite.

## Prohibited implementations / migration
Raw component colors, hidden focus, inert enabled actions, sample totals, forecasts, fake refreshed balances, silent adjustments/mapping-history rewrites must not ship. Existing URLs/auth/account directory/JSON reconciliation must remain functional. JSON must import all rows. CSV v1 must not claim statement reconciliation. PDF/XLSX, receipts, executed payments, bank sync, external alerts, automatic recurrence, rollover, conversion must remain unavailable with explanations.

## QA checklist
- [ ] Token pairings, contrast, shared states verified.
- [ ] Keyboard, drawer/dialog focus return, search selection verified.
- [ ] Mobile/320px/zoom/reduced motion verified.
- [ ] Loading/errors/empty/long names/overflow verified.
- [ ] Persisted reload, owner isolation, retries, accounting boundaries verified.
- [ ] All-row JSON, reviewed CSV duplicates, complete exact export verified.
- [ ] Node tests, TypeScript, production build pass; unverified checks reported.

Automated token calculation (rounded conservative HSL values, cream canvas): foreground >=8.03:1; muted >=6.35:1; success >=6.26:1; warning >=5.99:1; error >=7.77:1; focus >=4.65:1; border >=3.35:1. Exact supplied foundation values replace rounded values in globals; rendered combinations must still receive manual checks.
