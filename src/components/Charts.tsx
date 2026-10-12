import { useState } from "react";
import { formatMoney } from "../lib/money";

export interface DailyDataPoint {
  date: string;
  displayDate: string;
  sales: number;
  outflows: number;
  net: number;
}

interface CashFlowChartProps {
  data: DailyDataPoint[];
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No transaction activity in this date range.
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.sales, d.outflows)), 100);
  const chartHeight = 220;
  const barWidth = Math.max(8, Math.min(32, Math.floor(580 / (data.length * 2.5))));

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-brand-500 shadow-sm" />
            <span className="text-slate-600 dark:text-slate-300">Gross Sales</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-rose-500 shadow-sm" />
            <span className="text-slate-600 dark:text-slate-300">Outflows (Expenses + Payouts)</span>
          </div>
        </div>
        <span className="text-slate-400">Max day: {formatMoney(maxVal)}</span>
      </div>

      <div className="relative h-[240px] overflow-x-auto pb-6 pt-2">
        <div className="flex h-[200px] items-end gap-3 px-2" style={{ minWidth: `${data.length * 48}px` }}>
          {data.map((item, idx) => {
            const salesHeight = Math.max(4, Math.round((item.sales / maxVal) * chartHeight * 0.85));
            const outflowsHeight = Math.max(4, Math.round((item.outflows / maxVal) * chartHeight * 0.85));
            const isHovered = hoveredIndex === idx;

            return (
              <div
                key={item.date}
                className="group relative flex flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute -top-28 z-30 w-44 -translate-y-2 rounded-xl border border-slate-700/50 bg-slate-900/95 p-2.5 text-xs text-white shadow-xl backdrop-blur-md transition">
                    <p className="font-bold text-slate-200">{item.displayDate}</p>
                    <div className="mt-1.5 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-brand-300">Sales:</span>
                        <span className="font-semibold">{formatMoney(item.sales)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-300">Outflows:</span>
                        <span className="font-semibold">{formatMoney(item.outflows)}</span>
                      </div>
                      <div className="border-t border-slate-700/80 pt-1 flex justify-between font-bold">
                        <span className={item.net >= 0 ? "text-emerald-400" : "text-rose-400"}>Net:</span>
                        <span className={item.net >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {item.net >= 0 ? "+" : ""}
                          {formatMoney(item.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bars group */}
                <div className="flex items-end gap-1">
                  {/* Sales bar */}
                  <div
                    style={{ height: `${salesHeight}px`, width: `${barWidth}px` }}
                    className="rounded-t-md bg-gradient-to-t from-brand-500 to-brand-400 transition-all duration-200 group-hover:brightness-110"
                  />
                  {/* Outflows bar */}
                  <div
                    style={{ height: `${outflowsHeight}px`, width: `${barWidth}px` }}
                    className="rounded-t-md bg-gradient-to-t from-rose-600 to-rose-400 transition-all duration-200 group-hover:brightness-110"
                  />
                </div>

                {/* X axis date label */}
                <span className="mt-2 text-[11px] font-medium text-slate-400 truncate max-w-[50px]">
                  {item.displayDate.split(",")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

interface CategoryBreakdownProps {
  title: string;
  items: CategoryBreakdownItem[];
  colorScheme?: "brand" | "rose" | "indigo";
}

const COLOR_MAP = {
  brand: [
    "bg-amber-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-amber-600",
    "bg-amber-700",
    "bg-yellow-600",
  ],
  rose: [
    "bg-rose-500",
    "bg-pink-500",
    "bg-red-500",
    "bg-rose-600",
    "bg-fuchsia-600",
    "bg-red-600",
  ],
  indigo: [
    "bg-indigo-500",
    "bg-blue-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-cyan-500",
    "bg-teal-500",
  ],
};

export function CategoryBreakdown({ title, items, colorScheme = "brand" }: CategoryBreakdownProps) {
  const colors = COLOR_MAP[colorScheme];

  if (items.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="mt-8 text-center text-sm text-slate-400">No records in this range.</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        <span className="text-xs font-semibold text-slate-400">{items.length} categories</span>
      </div>

      {/* Stacked percentage bar */}
      <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {items.map((item, idx) => (
          <div
            key={item.category}
            style={{ width: `${Math.max(2, item.percentage)}%` }}
            title={`${item.category}: ${item.percentage.toFixed(1)}%`}
            className={`${colors[idx % colors.length]} transition-all`}
          />
        ))}
      </div>

      {/* Category listing with amounts and percentages */}
      <div className="mt-5 space-y-3">
        {items.slice(0, 6).map((item, idx) => (
          <div key={item.category} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2.5 truncate">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors[idx % colors.length]}`} />
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{item.category}</span>
              <span className="text-xs text-slate-400">({item.count})</span>
            </div>
            <div className="flex items-center gap-3 tabular">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(item.amount)}</span>
              <span className="w-12 text-right text-xs font-semibold text-slate-400">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
