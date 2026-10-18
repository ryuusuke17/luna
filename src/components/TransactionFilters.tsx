import {useId, useState} from "react";
import {CalendarDays, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal} from "lucide-react";
import {Button} from "@/components/WorkspaceButton";
import DialogContent from "@/components/WorkspaceDialogContent";
import {Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {TRANSACTION_TYPES, transactionTypeLabel} from "@/lib/transactions";
import {adjacentTransactionMonth, applyTransactionDate, applyTransactionFilters, transactionDateFilter, transactionDateLabel, transactionFilterCount, type TransactionDateFilter} from "@/lib/transaction-filters";

type Choice = {id: number; name: string};
type Props = {
  lockedAccountId?: number;
  params: URLSearchParams;
  accounts: Choice[];
  categories: Choice[];
  onChange: (params: URLSearchParams, replace?: boolean) => void;
};

export default function TransactionFilters({params, accounts, categories, onChange, lockedAccountId}: Props) {
  const dateTitle = useId();
  const [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState<TransactionDateFilter>(() => transactionDateFilter(params));
  const [dateError, setDateError] = useState("");
  const [advancedDraft, setAdvancedDraft] = useState<URLSearchParams | null>(null);
  const count = transactionFilterCount(params), dateLabel = transactionDateLabel(params);
  const previousMonth = adjacentTransactionMonth(params, -1), nextMonth = adjacentTransactionMonth(params, 1);

  function changeAdvanced(key: string, value: string) {
    setAdvancedDraft(current => {
      const next = new URLSearchParams(current!);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  return <section className="panel mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap" aria-label="Transaction filters">
    <Popover open={dateOpen} onOpenChange={open => {
      if (open) {
        setDateDraft(transactionDateFilter(params));
        setDateError("");
      }
      setDateOpen(open);
    }}>
      <div role="group" aria-label="Date navigation" className="col-span-2 flex min-w-0 rounded-full border border-input bg-background sm:col-span-1 sm:max-w-sm">
        <Button type="button" variant="ghost" size="icon" className="h-auto shrink-0 rounded-r-none" aria-label="Previous month" disabled={!previousMonth} onClick={() => previousMonth && onChange(applyTransactionDate(params, {mode: "month", month: previousMonth, start: "", end: ""}))}>
          <ChevronLeft aria-hidden="true"/>
        </Button>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-auto min-w-0 flex-1 gap-2 whitespace-normal rounded-none px-2 text-center" aria-label={`Date filter: ${dateLabel}`}>
            <CalendarDays className="size-4 shrink-0" aria-hidden="true"/>
            <span className="min-w-0">{dateLabel}</span>
          </Button>
        </PopoverTrigger>
        <Button type="button" variant="ghost" size="icon" className="h-auto shrink-0 rounded-l-none" aria-label="Next month" disabled={!nextMonth} onClick={() => nextMonth && onChange(applyTransactionDate(params, {mode: "month", month: nextMonth, start: "", end: ""}))}>
          <ChevronRight aria-hidden="true"/>
        </Button>
      </div>
      <PopoverContent align="start" collisionPadding={16} className="max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-5 shadow-none" aria-labelledby={dateTitle}>
        <form noValidate onSubmit={event => {
          event.preventDefault();
          try {
            onChange(applyTransactionDate(params, dateDraft));
            setDateOpen(false);
          } catch (error) {
            setDateError(error instanceof Error ? error.message : "Check the selected dates.");
          }
        }}>
          <h2 id={dateTitle} className="text-lg font-semibold">Date filter</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Filter by posted date.</p>
          <label className="block">Date mode
            <select className="field" value={dateDraft.mode} onChange={event => {
              setDateDraft({...dateDraft, mode: event.target.value as TransactionDateFilter["mode"]});
              setDateError("");
            }}>
              <option value="month">Month</option>
              <option value="range">Custom range</option>
              <option value="all">All time</option>
            </select>
          </label>
          {dateDraft.mode === "month" && <label className="mt-4 block">Month
            <input className="field" type="month" value={dateDraft.month} onChange={event => setDateDraft({...dateDraft, month: event.target.value})}/>
          </label>}
          {dateDraft.mode === "range" && <div className="mt-4 grid gap-3">
            <label>Start date<input className="field" type="date" value={dateDraft.start} onChange={event => setDateDraft({...dateDraft, start: event.target.value})}/></label>
            <label>End date<input className="field" type="date" value={dateDraft.end} onChange={event => setDateDraft({...dateDraft, end: event.target.value})}/></label>
            <p className="text-sm text-muted-foreground">Either date can be left empty.</p>
          </div>}
          {dateDraft.mode === "all" && <p className="mt-4 text-sm text-muted-foreground">Include every posted date.</p>}
          {dateError && <p role="alert" className="mt-3 text-sm text-destructive">{dateError}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDateOpen(false)}>Cancel</Button>
            <Button type="submit">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>

    <label className="min-w-0 sm:min-w-48 sm:flex-1">
      <span className="sr-only">Search description, merchant or reference</span>
      <input className="field min-h-12" type="search" placeholder="Search transactions..." maxLength={100} value={params.get("search") || ""} onChange={event => {
        const next = new URLSearchParams(params);
        if (event.target.value) next.set("search", event.target.value);
        else next.delete("search");
        onChange(applyTransactionFilters(params, next), true);
      }}/>
    </label>

    <Dialog open={advancedDraft !== null} onOpenChange={open => setAdvancedDraft(open ? new URLSearchParams(params) : null)}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" aria-label={count ? `Filter, ${count} active ${count === 1 ? "filter" : "filters"}` : "Filter"}>
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true"/>
          Filter
          {count > 0 && <span aria-hidden="true" className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">{count}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(34rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Filter transactions</DialogTitle>
          <DialogDescription>Changes apply together. Clear all resets dates, search, and upload restrictions; account pages keep their account scope.</DialogDescription>
        </DialogHeader>
        {advancedDraft && <form className="min-w-0" onSubmit={event => {
          event.preventDefault();
          onChange(applyTransactionFilters(params, advancedDraft));
          setAdvancedDraft(null);
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Account<span className="relative mt-1.5 block"><select className="field mt-0 appearance-none pr-12" disabled={Boolean(lockedAccountId)} value={String(lockedAccountId??advancedDraft.get("account")??"")} onChange={event => changeAdvanced("account", event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select><ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"/></span></label>
            <label>Type<span className="relative mt-1.5 block"><select className="field mt-0 appearance-none pr-12" value={advancedDraft.get("kind") || ""} onChange={event => changeAdvanced("kind", event.target.value)}>
              <option value="">All types</option>
              {TRANSACTION_TYPES.map(kind => <option key={kind} value={kind}>{transactionTypeLabel(kind)}</option>)}
            </select><ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"/></span></label>
            <label>Category<span className="relative mt-1.5 block"><select className="field mt-0 appearance-none pr-12" value={advancedDraft.get("category") || ""} onChange={event => changeAdvanced("category", event.target.value)}>
              <option value="">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select><ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"/></span></label>
            <label>Source<span className="relative mt-1.5 block"><select className="field mt-0 appearance-none pr-12" value={advancedDraft.get("source") || ""} onChange={event => changeAdvanced("source", event.target.value)}>
              <option value="">All sources</option>
              <option value="manual">Manual</option>
              <option value="import">Import</option>
            </select><ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"/></span></label>
            <label>Sort<span className="relative mt-1.5 block"><select className="field mt-0 appearance-none pr-12" value={advancedDraft.get("sort") || "newest"} onChange={event => changeAdvanced("sort", event.target.value === "newest" ? "" : event.target.value)}>
              <option value="newest">Newest date</option>
              <option value="oldest">Oldest date</option>
              <option value="highest">Highest amount</option>
              <option value="lowest">Lowest amount</option>
            </select><ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"/></span></label>
          </div>
          {(advancedDraft.get("batch") || advancedDraft.get("legacy")) && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <p className="min-w-0 flex-1 break-words">Upload restriction: {advancedDraft.get("legacy") ? `${advancedDraft.get("legacy")?.toUpperCase()} #${advancedDraft.get("importId")}` : `#${advancedDraft.get("batch")}`}</p>
            <Button type="button" variant="outline" onClick={() => {
              const next = new URLSearchParams(advancedDraft);
              for (const key of ["batch", "legacy", "importId"]) next.delete(key);
              setAdvancedDraft(next);
            }}>Remove upload filter</Button>
          </div>}
          {(advancedDraft.get("account") || "") !== (params.get("account") || "") && (params.get("batch") || params.get("legacy")) && <p className="mt-3 text-sm text-muted-foreground">Changing the account clears the upload restriction when applied.</p>}
          {advancedDraft.toString() === "period=all" && <p role="status" className="mt-4 text-sm text-muted-foreground">All time, no search, no additional filters.</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="mr-auto" onClick={() => setAdvancedDraft(new URLSearchParams(lockedAccountId?{account:String(lockedAccountId)}:{}))}>Clear all</Button>
            <Button type="button" variant="outline" onClick={() => setAdvancedDraft(null)}>Cancel</Button>
            <Button type="submit">Apply</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </section>;
}
