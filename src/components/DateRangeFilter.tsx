import { ALL_DATES, describeRange, isAllDates, thisMonthFilter, thisWeekFilter, thisYearFilter, todayFilter } from "../lib/dates";
import type { DateFilter } from "../types/models";
import { DateInput } from "./DateInput";

interface DateRangeFilterProps {
  idPrefix: string;
  value: DateFilter;
  onChange: (f: DateFilter) => void;
}

const same = (a: DateFilter, b: DateFilter) => a.from === b.from && a.to === b.to;

export function DateRangeFilter({ idPrefix, value, onChange }: DateRangeFilterProps) {
  const presets: { id: string; label: string; make: () => DateFilter }[] = [
    { id: "today", label: "Today", make: todayFilter },
    { id: "week", label: "This week", make: thisWeekFilter },
    { id: "month", label: "This month", make: thisMonthFilter },
    { id: "year", label: "This year", make: thisYearFilter },
    { id: "all", label: "All dates", make: () => ALL_DATES },
  ];

  const invalid = !!(value.from && value.to && value.from > value.to);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <DateInput
        compact
        id={`${idPrefix}-filter-from`}
        label="From"
        value={value.from ?? ""}
        onChange={(v) => onChange({ ...value, from: v || null })}
      />
      <DateInput
        compact
        id={`${idPrefix}-filter-to`}
        label="To"
        value={value.to ?? ""}
        onChange={(v) => onChange({ ...value, to: v || null })}
      />
      <div className="flex flex-wrap rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
        {presets.map((p) => {
          const active = p.id === "all" ? isAllDates(value) : same(value, p.make());
          return (
            <button
              key={p.id}
              id={`${idPrefix}-filter-${p.id}`}
              type="button"
              onClick={() => onChange(p.make())}
              className={`h-8 rounded-lg px-3 text-sm font-semibold transition ${
                active
                  ? "bg-white text-brand-600 shadow-sm dark:bg-slate-800 dark:text-brand-300"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <p className={`pb-2 text-sm ${invalid ? "font-semibold text-rose-600" : "text-slate-500"}`}>
        {invalid ? "From must be on or before To." : `Showing: ${describeRange(value)}`}
      </p>
    </div>
  );
}
