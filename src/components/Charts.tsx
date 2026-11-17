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
                      className="bg-emerald-500 hover:brightness-110 transition-opacity"
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

// ============================================================================
// Black-Gold 2x2 Dashboard Visual Analytics Cards
// ============================================================================

const SANKEY_IN_COLORS = ["#10b981", "#f59e0b", "#eab308", "#14b8a6", "#84cc16", "#64748b"];
const DONUT_COLORS = ["#f43f5e", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#eab308", "#3b82f6", "#64748b"];

function formatCompactAxis(centavos: number): string {
  const pesos = centavos / 100;
  const abs = Math.abs(pesos);
  const sign = pesos < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}₱${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}₱${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₱${Math.round(abs)}`;
}

export interface CashflowSankeyProps {
  salesCategories: CategoryBreakdownItem[];
  totalSales: number;
  totalExpenses: number;
  totalLdAmount: number;
  totalCommissions: number;
  totalSalaries: number;
  netProfit: number;
}

export function CashflowSankeyCard({
  salesCategories,
  totalSales,
  totalExpenses,
  totalLdAmount,
  totalCommissions,
  totalSalaries,
  netProfit,
}: CashflowSankeyProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const totalOutflows = totalExpenses + totalLdAmount + totalCommissions + totalSalaries;

  const leftItems = (() => {
    if (salesCategories.length <= 5) return salesCategories;
    const top = salesCategories.slice(0, 4);
    const rest = salesCategories.slice(4);
    const restAmt = rest.reduce((s, r) => s + r.amount, 0);
    const restCount = rest.reduce((s, r) => s + r.count, 0);
    return [
      ...top,
      {
        category: "Other Sales",
        amount: restAmt,
        count: restCount,
        percentage: totalSales > 0 ? (restAmt / totalSales) * 100 : 0,
      },
    ];
  })();

  const rightRaw = [
    { key: "expenses", label: "Operating Expenses", amount: totalExpenses, color: "#f43f5e" },
    { key: "salaries", label: "Salaries Paid", amount: totalSalaries, color: "#8b5cf6" },
    { key: "ld", label: "LD Commissions", amount: totalLdAmount, color: "#f59e0b" },
    { key: "commissions", label: "Commissions", amount: totalCommissions, color: "#06b6d4" },
    ...(netProfit > 0 ? [{ key: "surplus", label: "Net Profit", amount: netProfit, color: "#10b981" }] : []),
  ].filter((x) => x.amount > 0);

  if (totalSales === 0 && totalOutflows === 0) {
    return (
      <section className="rounded-2xl border border-amber-500/20 bg-[#0b0d13] p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Cashflow</h3>
          <span className="text-xs font-medium text-slate-500">Revenue &rarr; Outflows</span>
        </div>
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          No cashflow recorded in this date range.
        </div>
      </section>
    );
  }

  const svgW = 540;
  const svgH = 246;
  const topPad = 18;
  const usableH = 200;
  const scaleBase = Math.max(totalSales, totalOutflows, 1);

  // Build left blocks
  const leftGap = leftItems.length > 1 ? 8 : 0;
  const leftTotalAvail = usableH - leftGap * Math.max(0, leftItems.length - 1);
  let curLeftY = topPad;
  let curCenterInY = topPad;
  const centerHeight = Math.max(24, (totalSales / scaleBase) * usableH);

  const leftNodes = leftItems.map((item, idx) => {
    const share = totalSales > 0 ? item.amount / totalSales : 0;
    const h = Math.max(10, share * leftTotalAvail);
    const centerSliceH = Math.max(4, share * centerHeight);
    const node = {
      key: `in-${item.category}`,
      label: item.category,
      amount: item.amount,
      pct: item.percentage,
      color: SANKEY_IN_COLORS[idx % SANKEY_IN_COLORS.length],
      y1: curLeftY,
      h,
      cy1: curCenterInY,
      ch: centerSliceH,
    };
    curLeftY += h + leftGap;
    curCenterInY += centerSliceH;
    return node;
  });

  // Build right blocks
  const rightSum = Math.max(rightRaw.reduce((s, r) => s + r.amount, 0), 1);
  const rightGap = rightRaw.length > 1 ? 8 : 0;
  const rightTotalAvail = usableH - rightGap * Math.max(0, rightRaw.length - 1);
  let curRightY = topPad;
  let curCenterOutY = topPad;
  const centerOutHeight = Math.max(24, (Math.min(totalSales, rightSum) / scaleBase) * usableH);

  const rightNodes = rightRaw.map((item) => {
    const share = item.amount / rightSum;
    const h = Math.max(12, share * rightTotalAvail);
    const sliceH = Math.max(4, share * centerOutHeight);
    const node = {
      key: `out-${item.key}`,
      label: item.label,
      amount: item.amount,
      pct: share * 100,
      color: item.color,
      y1: curRightY,
      h,
      cy1: curCenterOutY,
      ch: sliceH,
    };
    curRightY += h + rightGap;
    curCenterOutY += sliceH;
    return node;
  });

  const activeInfo =
    leftNodes.find((n) => n.key === hoveredKey) || rightNodes.find((n) => n.key === hoveredKey);

  return (
    <section className="rounded-2xl border border-amber-500/20 bg-[#0b0d13] p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <h3 className="text-sm font-semibold text-slate-100">Cashflow</h3>
        </div>
        {activeInfo ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 tabular">
            {activeInfo.label}: {formatMoney(activeInfo.amount)} ({activeInfo.pct.toFixed(1)}%)
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400 tabular">
            Gross Sales {formatMoney(totalSales)}
          </span>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-[240px] w-full min-w-[440px] select-none">
          <defs>
            <linearGradient id="sankey-center-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {/* Left -> Center Ribbons */}
          {leftNodes.map((n) => {
            const x1 = 128;
            const x2 = 258;
            const mx = (x1 + x2) / 2;
            const d = `M ${x1} ${n.y1} C ${mx} ${n.y1}, ${mx} ${n.cy1}, ${x2} ${n.cy1} L ${x2} ${n.cy1 + n.ch} C ${mx} ${n.cy1 + n.ch}, ${mx} ${n.y1 + n.h}, ${x1} ${n.y1 + n.h} Z`;
            const isDim = hoveredKey && hoveredKey !== n.key;
            return (
              <g
                key={n.key}
                onMouseEnter={() => setHoveredKey(n.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className="cursor-pointer"
              >
                <path
                  d={d}
                  fill={n.color}
                  fillOpacity={isDim ? 0.14 : 0.34}
                  className="transition-opacity duration-150"
                />
                <rect x={122} y={n.y1} width={7} height={n.h} rx={2.5} fill={n.color} />
                <text
                  x={114}
                  y={n.y1 + n.h / 2 - 2}
                  textAnchor="end"
                  className="fill-slate-200 text-[10.5px] font-semibold"
                >
                  {n.label.length > 15 ? `${n.label.slice(0, 14)}…` : n.label}
                </text>
                <text
                  x={114}
                  y={n.y1 + n.h / 2 + 10}
                  textAnchor="end"
                  className="fill-slate-400 text-[9.5px] font-medium tabular"
                >
                  {formatMoney(n.amount)}
                </text>
              </g>
            );
          })}

          {/* Center Gross Sales Bar */}
          {totalSales > 0 && (
            <g>
              <rect
                x={258}
                y={topPad}
                width={10}
                height={centerHeight}
                rx={3}
                fill="url(#sankey-center-grad)"
              />
              <text
                x={263}
                y={topPad + centerHeight + 14}
                textAnchor="middle"
                className="fill-amber-300 text-[10px] font-bold"
              >
                Gross Sales
              </text>
              <text
                x={263}
                y={topPad + centerHeight + 25}
                textAnchor="middle"
                className="fill-slate-300 text-[9.5px] font-semibold tabular"
              >
                {formatMoney(totalSales)}
              </text>
            </g>
          )}

          {/* Center -> Right Ribbons */}
          {rightNodes.map((n) => {
            const x1 = 268;
            const x2 = 402;
            const mx = (x1 + x2) / 2;
            const d = `M ${x1} ${n.cy1} C ${mx} ${n.cy1}, ${mx} ${n.y1}, ${x2} ${n.y1} L ${x2} ${n.y1 + n.h} C ${mx} ${n.y1 + n.h}, ${mx} ${n.cy1 + n.ch}, ${x1} ${n.cy1 + n.ch} Z`;
            const isDim = hoveredKey && hoveredKey !== n.key;
            return (
              <g
                key={n.key}
                onMouseEnter={() => setHoveredKey(n.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className="cursor-pointer"
              >
                <path
                  d={d}
                  fill={n.color}
                  fillOpacity={isDim ? 0.14 : 0.34}
                  className="transition-opacity duration-150"
                />
                <rect x={402} y={n.y1} width={7} height={n.h} rx={2.5} fill={n.color} />
                <text
                  x={416}
                  y={n.y1 + n.h / 2 - 2}
                  textAnchor="start"
                  className="fill-slate-200 text-[10.5px] font-semibold"
                >
                  {n.label}
                </text>
                <text
                  x={416}
                  y={n.y1 + n.h / 2 + 10}
                  textAnchor="start"
                  className="fill-slate-400 text-[9.5px] font-medium tabular"
                >
                  {formatMoney(n.amount)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {netProfit < 0 && (
        <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 tabular">
          Net Deficit in period: {formatMoney(netProfit)} (Outflows exceeded sales)
        </div>
      )}
    </section>
  );
}

export interface NetProfitTrendProps {
  data: DailyDataPoint[];
  netProfit: number;
  profitMargin: number;
  rangeLabel: string;
}

export function NetProfitTrendCard({
  data,
  netProfit,
  profitMargin,
  rangeLabel,
}: NetProfitTrendProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const cumulative = (() => {
    let running = 0;
    return data.map((d) => {
      running += d.net;
      return { date: d.date, displayDate: d.displayDate, value: running, dayNet: d.net };
    });
  })();

  const points =
    cumulative.length === 1
      ? [
          { ...cumulative[0], label: cumulative[0].displayDate },
          { ...cumulative[0], label: cumulative[0].displayDate },
        ]
      : cumulative.map((p) => ({ ...p, label: p.displayDate }));

  const w = 460;
  const h = 152;
  const padX = 10;
  const padTop = 14;
  const padBottom = 14;
  const vals = points.map((p) => p.value);
  const minVal = vals.length ? Math.min(...vals, 0) : 0;
  const maxVal = vals.length ? Math.max(...vals, 0) : 1;
  const span = Math.max(maxVal - minVal, 1);

  const coords = points.map((p, idx) => {
    const x =
      points.length > 1 ? padX + (idx / (points.length - 1)) * (w - padX * 2) : w / 2;
    const y = padTop + (1 - (p.value - minVal) / span) * (h - padTop - padBottom);
    return { x, y, ...p };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(h - padBottom).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(h - padBottom).toFixed(1)} Z`
      : "";

  const isPositive = netProfit >= 0;
  const strokeColor = isPositive ? "#10b981" : "#f43f5e";
  const activePoint = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : null;

  return (
    <section className="flex flex-col justify-between rounded-2xl border border-amber-500/20 bg-[#0b0d13] p-5 shadow-lg">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isPositive ? "bg-emerald-400" : "bg-rose-400"}`} />
            <h3 className="text-sm font-semibold text-slate-100">Net Profit</h3>
          </div>
          <span className="text-[11px] font-medium text-slate-500">{rangeLabel}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <p className="tabular text-3xl font-black tracking-tight text-white">
            {netProfit < 0 ? "-" : ""}
            {formatMoney(Math.abs(netProfit))}
          </p>
          <span
            className={`text-xs font-bold tabular ${
              isPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {profitMargin >= 0 ? `▲ +${profitMargin.toFixed(1)}%` : `▼ ${profitMargin.toFixed(1)}%`} margin
          </span>
        </div>

        {activePoint ? (
          <p className="mt-1 text-xs font-medium text-amber-300 tabular">
            {activePoint.displayDate}: Cumulative {activePoint.value >= 0 ? "+" : ""}
            {formatMoney(activePoint.value)} (Day: {activePoint.dayNet >= 0 ? "+" : ""}
            {formatMoney(activePoint.dayNet)})
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Cumulative net cashflow across selected days</p>
        )}
      </div>

      {cumulative.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          No daily transactions to plot.
        </div>
      ) : (
        <div className="mt-3">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full overflow-visible select-none">
            <defs>
              <linearGradient id="net-profit-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Zero baseline */}
            {minVal < 0 && maxVal > 0 && (
              <line
                x1={padX}
                x2={w - padX}
                y1={padTop + (1 - (0 - minVal) / span) * (h - padTop - padBottom)}
                y2={padTop + (1 - (0 - minVal) / span) * (h - padTop - padBottom)}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}

            {areaPath && <path d={areaPath} fill="url(#net-profit-area)" />}
            <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {coords.map((c, idx) => (
              <g
                key={`${c.date}-${idx}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <rect
                  x={c.x - Math.max(8, (w - padX * 2) / Math.max(coords.length * 2, 2))}
                  y={0}
                  width={Math.max(16, (w - padX * 2) / Math.max(coords.length, 1))}
                  height={h}
                  fill="transparent"
                  className="cursor-pointer"
                />
                {hoverIdx === idx && (
                  <>
                    <line x1={c.x} x2={c.x} y1={padTop} y2={h - padBottom} stroke="#475569" strokeWidth={1} />
                    <circle cx={c.x} cy={c.y} r={4} fill={strokeColor} stroke="#0b0d13" strokeWidth={2} />
                  </>
                )}
              </g>
            ))}
          </svg>
          <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>{cumulative[0]?.displayDate}</span>
            <span>{cumulative[cumulative.length - 1]?.displayDate}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export interface SalesVsOutflowsProps {
  data: DailyDataPoint[];
  totalSales: number;
  totalOutflows: number;
  rangeLabel: string;
}

export function SalesVsOutflowsCard({
  data,
  totalSales,
  totalOutflows,
  rangeLabel,
}: SalesVsOutflowsProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const cumulative = (() => {
    let runSales = 0;
    let runOut = 0;
    return data.map((d) => {
      runSales += d.sales;
      runOut += d.outflows;
      return {
        date: d.date,
        displayDate: d.displayDate,
        cumSales: runSales,
        cumOut: runOut,
      };
    });
  })();

  const points =
    cumulative.length === 1 ? [cumulative[0], cumulative[0]] : cumulative;

  const w = 460;
  const h = 165;
  const padL = 8;
  const padR = 46;
  const padTop = 12;
  const padBot = 12;
  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.cumSales, p.cumOut)),
    100,
  );

  const coords = points.map((p, idx) => {
    const x =
      points.length > 1 ? padL + (idx / (points.length - 1)) * (w - padL - padR) : (w - padR) / 2;
    const ys = padTop + (1 - p.cumSales / maxVal) * (h - padTop - padBot);
    const yo = padTop + (1 - p.cumOut / maxVal) * (h - padTop - padBot);
    return { x, ys, yo, ...p };
  });

  const salesPath = coords
    .map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.ys.toFixed(1)}`)
    .join(" ");
  const outPath = coords
    .map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.yo.toFixed(1)}`)
    .join(" ");

  const active = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : null;
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="flex flex-col justify-between rounded-2xl border border-amber-500/20 bg-[#0b0d13] p-5 shadow-lg">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">Sales vs. Outflows Pacing</h3>
          </div>
          <span className="text-[11px] font-medium text-slate-500">{rangeLabel}</span>
        </div>

        {/* Side-by-side summary callouts matching screenshot */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="border-l-2 border-amber-400 pl-3">
            <p className="text-xs font-medium text-slate-400">Gross Sales</p>
            <p className="tabular mt-0.5 text-lg font-extrabold text-amber-300">
              {formatMoney(active ? active.cumSales : totalSales)}
            </p>
          </div>
          <div className="border-l-2 border-rose-500 pl-3">
            <p className="text-xs font-medium text-slate-400">Total Outflows</p>
            <p className="tabular mt-0.5 text-lg font-extrabold text-rose-400">
              {formatMoney(active ? active.cumOut : totalOutflows)}
            </p>
          </div>
        </div>
      </div>

      {cumulative.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-sm text-slate-500">
          No cumulative sales or outflow activity in this date range.
        </div>
      ) : (
        <div className="mt-3">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full overflow-visible select-none">
            {gridSteps.map((ratio) => {
              const y = padTop + (1 - ratio) * (h - padTop - padBot);
              return (
                <g key={ratio}>
                  <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#1e293b" strokeWidth={1} />
                  <text
                    x={w - padR + 6}
                    y={y + 3}
                    textAnchor="start"
                    className="fill-slate-500 text-[9.5px] font-medium tabular"
                  >
                    {formatCompactAxis(Math.round(maxVal * ratio))}
                  </text>
                </g>
              );
            })}

            <path d={outPath} fill="none" stroke="#f43f5e" strokeWidth={1.8} strokeLinejoin="round" />
            <path d={salesPath} fill="none" stroke="#f59e0b" strokeWidth={2.2} strokeLinejoin="round" />

            {coords.map((c, idx) => (
              <g
                key={`${c.date}-${idx}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <rect
                  x={c.x - Math.max(8, (w - padL - padR) / Math.max(coords.length * 2, 2))}
                  y={0}
                  width={Math.max(16, (w - padL - padR) / Math.max(coords.length, 1))}
                  height={h}
                  fill="transparent"
                  className="cursor-pointer"
                />
                {hoverIdx === idx && (
                  <>
                    <line x1={c.x} x2={c.x} y1={padTop} y2={h - padBot} stroke="#475569" strokeWidth={1} />
                    <circle cx={c.x} cy={c.ys} r={4} fill="#f59e0b" stroke="#0b0d13" strokeWidth={2} />
                    <circle cx={c.x} cy={c.yo} r={4} fill="#f43f5e" stroke="#0b0d13" strokeWidth={2} />
                  </>
                )}
              </g>
            ))}
          </svg>
          <div className="mt-1 flex items-center justify-between pr-10 text-[11px] font-medium text-slate-500">
            <span>{cumulative[0]?.displayDate}</span>
            {active ? (
              <span className="font-semibold text-amber-300">{active.displayDate}</span>
            ) : (
              cumulative.length > 2 && <span>{cumulative[Math.floor(cumulative.length / 2)]?.displayDate}</span>
            )}
            <span>{cumulative[cumulative.length - 1]?.displayDate}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export interface OutflowRowItem {
  category: string;
  amount: number;
  percentage: number;
}

export interface OutflowsDonutProps {
  items: OutflowRowItem[];
  totalOutflows: number;
}

export function OutflowsDonutCard({ items, totalOutflows }: OutflowsDonutProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const size = 176;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const circumference = 2 * Math.PI * r;

  let offsetAcc = 0;
  const slices = items.map((item, idx) => {
    const frac = totalOutflows > 0 ? item.amount / totalOutflows : 0;
    const rawLen = frac * circumference;
    const gap = items.length > 1 ? Math.min(3, rawLen * 0.25) : 0;
    const dashLen = Math.max(0, rawLen - gap);
    const slice = {
      ...item,
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
      dashArray: `${dashLen} ${circumference - dashLen}`,
      dashOffset: -offsetAcc,
    };
    offsetAcc += rawLen;
    return slice;
  });

  const activeSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <section className="flex flex-col justify-between rounded-2xl border border-amber-500/20 bg-[#0b0d13] p-5 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <h3 className="text-sm font-semibold text-slate-100">Outflows</h3>
        </div>
        <span className="text-[11px] font-medium text-slate-500">
          {items.length} {items.length === 1 ? "category" : "categories"}
        </span>
      </div>

      {/* Donut Ring */}
      <div className="relative my-3 flex items-center justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1e293b"
            strokeWidth={9}
          />
          {totalOutflows > 0 &&
            slices.map((s, idx) => (
              <circle
                key={s.category}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hoveredIdx === idx ? 12 : 9}
                strokeDasharray={s.dashArray}
                strokeDashoffset={s.dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer transition-opacity duration-150"
                opacity={hoveredIdx !== null && hoveredIdx !== idx ? 0.35 : 1}
              />
            ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <span className="text-[11px] font-medium text-slate-400 truncate max-w-[118px]">
            {activeSlice ? activeSlice.category : "Total Outflows"}
          </span>
          <span className="tabular mt-0.5 text-lg font-black text-white">
            {formatMoney(activeSlice ? activeSlice.amount : totalOutflows)}
          </span>
          {activeSlice && (
            <span className="text-[10px] font-bold text-amber-300 tabular">
              {activeSlice.percentage.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Category Table matching screenshot: CATEGORIES · N | VALUE | WEIGHT */}
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
          No operating expenses or staff payouts recorded in this period.
        </p>
      ) : (
        <div className="mt-1 max-h-44 overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr_auto_54px] items-center gap-2 border-b border-slate-800 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Categories · {items.length}</span>
            <span className="text-right">Value</span>
            <span className="text-right">Weight</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {slices.map((s, idx) => (
              <div
                key={s.category}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="grid grid-cols-[1fr_auto_54px] items-center gap-2 py-2 text-xs hover:bg-white/5 rounded px-1 transition-colors duration-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate font-medium text-slate-200">{s.category}</span>
                </div>
                <span className="tabular font-semibold text-slate-100">{formatMoney(s.amount)}</span>
                <span className="tabular text-right font-medium text-slate-400">
                  {s.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
