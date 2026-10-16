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
  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-amber-500 shadow-sm" />
            <span className="text-slate-600 dark:text-slate-300">Gross Sales</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-rose-500 shadow-sm" />
            <span className="text-slate-600 dark:text-slate-300">Outflows (Expenses + Payouts)</span>
          </div>
        </div>

        {/* Live Hover Inspector or Peak Single Day */}
        {hoveredItem ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs animate-fade-in">
            <span className="font-bold text-amber-400">{hoveredItem.displayDate}:</span>
            <span className="text-slate-300">Sales <strong className="text-amber-300">{formatMoney(hoveredItem.sales)}</strong></span>
            <span className="text-slate-300">Outflows <strong className="text-rose-400">{formatMoney(hoveredItem.outflows)}</strong></span>
            <span className="font-bold">
              Net{" "}
              <strong className={hoveredItem.net >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {hoveredItem.net >= 0 ? "+" : ""}
                {formatMoney(hoveredItem.net)}
              </strong>
            </span>
          </div>
        ) : (
          <span className="text-slate-400">Peak day: {formatMoney(maxVal)}</span>
        )}
      </div>

      <div className="relative h-[250px] overflow-x-auto overflow-y-hidden pb-6 pt-3">
        <div
          className="flex h-[200px] items-end gap-3 px-2"
          style={{ minWidth: data.length > 8 ? `${data.length * 52}px` : "100%" }}
        >
          {data.map((item, idx) => {
            const salesHeight = Math.max(4, Math.round((item.sales / maxVal) * chartHeight * 0.85));
            const outflowsHeight = Math.max(4, Math.round((item.outflows / maxVal) * chartHeight * 0.85));
            const highestBar = Math.max(salesHeight, outflowsHeight);
            const isHovered = hoveredIndex === idx;

            // Horizontal alignment clamp so popups at edges don't clip horizontally
            const horizontalClass =
              idx === 0
                ? "left-0"
                : idx >= data.length - 2
                ? "right-0"
                : "left-1/2 -translate-x-1/2";

            return (
              <div
                key={item.date}
                className="group relative flex flex-1 h-full flex-col items-center justify-end min-w-[36px]"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Tooltip positioned safely inside chart bounds */}
                {isHovered && (
                  <div
                    className={`pointer-events-none absolute z-30 w-48 max-w-[200px] rounded-xl border border-amber-500/50 bg-slate-950/95 p-2.5 text-xs text-white shadow-2xl backdrop-blur-md transition-all duration-150 animate-pop-in ${horizontalClass}`}
                    style={{
                      top: highestBar > 100 ? "4px" : undefined,
                      bottom: highestBar <= 100 ? `${highestBar + 28}px` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
                      <p className="font-bold text-amber-300">{item.displayDate}</p>
                      <span className="text-[10px] text-slate-400">Day #{idx + 1}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-amber-200">Total Sales:</span>
                        <span className="font-semibold text-white">{formatMoney(item.sales)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-300">Outflows:</span>
                        <span className="font-semibold text-rose-200">{formatMoney(item.outflows)}</span>
                      </div>
                      <div className="border-t border-slate-800 pt-1 flex justify-between font-bold">
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
                    className="rounded-t-md bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400 transition-all duration-200 group-hover:brightness-110"
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
    <div className="card card-hover p-6">
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

export interface StaffRankItem {
  name: string;
  position: string | null;
  ldAmount: number;
  ldQuantity: number;
  commissionAmount: number;
  salaryAmount: number;
  totalPayout: number;
}

interface StaffRankChartProps {
  items: StaffRankItem[];
}

export function StaffRankChart({ items }: StaffRankChartProps) {
  const activeItems = items.filter((i) => i.totalPayout > 0).sort((a, b) => b.totalPayout - a.totalPayout);

  if (activeItems.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
          Staff Earnings & Payout Ranking
        </h3>
        <p className="mt-8 text-center text-sm text-slate-400">
          No staff earnings or commission recorded in this period.
        </p>
      </div>
    );
  }

  const maxPayout = Math.max(...activeItems.map((i) => i.totalPayout), 1);
  const totalPayoutAll = activeItems.reduce((acc, i) => acc + i.totalPayout, 0);

  return (
    <div className="card card-hover p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Staff Earnings & Payout Ranking
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              Highest to Lowest
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Total staff payouts: {formatMoney(totalPayoutAll)}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600 dark:text-slate-300">LD Comm</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <span className="text-slate-600 dark:text-slate-300">Commission</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-300">Salary</span>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {activeItems.map((item, idx) => {
          const rank = idx + 1;
          const barPercent = Math.max(3, (item.totalPayout / maxPayout) * 100);
          const percentOfTotal = totalPayoutAll > 0 ? (item.totalPayout / totalPayoutAll) * 100 : 0;

          const ldPercent = item.totalPayout > 0 ? (item.ldAmount / item.totalPayout) * 100 : 0;
          const commPercent = item.totalPayout > 0 ? (item.commissionAmount / item.totalPayout) * 100 : 0;
          const salaryPercent = item.totalPayout > 0 ? (item.salaryAmount / item.totalPayout) * 100 : 0;

          const medal =
            rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

          return (
            <div key={item.name} className="group relative">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold ${
                      rank === 1
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 ring-1 ring-amber-400"
                        : rank === 2
                        ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                        : rank === 3
                        ? "bg-amber-800/20 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
                    }`}
                  >
                    {medal}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{item.name}</span>
                    {item.position && (
                      <span className="ml-2 text-xs text-slate-400 font-normal">
                        ({item.position})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 tabular">
                  <span className="font-extrabold text-slate-900 dark:text-slate-100">
                    {formatMoney(item.totalPayout)}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 w-12 text-right">
                    {percentOfTotal.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Stacked Ranked Bar */}
              <div className="relative flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                <div
                  style={{ width: `${barPercent}%` }}
                  className="flex h-full overflow-hidden rounded-full transition-all duration-300"
                >
                  {ldPercent > 0 && (
                    <div
                      style={{ width: `${ldPercent}%` }}
                      title={`LD Commission: ${formatMoney(item.ldAmount)} (${item.ldQuantity} drinks)`}
                      className="bg-amber-500 hover:brightness-110 transition"
                    />
                  )}
                  {commPercent > 0 && (
                    <div
                      style={{ width: `${commPercent}%` }}
                      title={`Commission: ${formatMoney(item.commissionAmount)}`}
                      className="bg-indigo-500 hover:brightness-110 transition"
                    />
                  )}
                  {salaryPercent > 0 && (
                    <div
                      style={{ width: `${salaryPercent}%` }}
                      title={`Salary: ${formatMoney(item.salaryAmount)}`}
                      className="bg-emerald-500 hover:brightness-110 transition"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
