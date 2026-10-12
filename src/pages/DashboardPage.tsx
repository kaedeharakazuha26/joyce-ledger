import logoImg from "../assets/logo.webp";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CashFlowChart,
  CategoryBreakdown,
  StaffRankChart,
  type CategoryBreakdownItem,
  type DailyDataPoint,
} from "../components/Charts";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/AppLayout";
import { useBranch } from "../context/BranchContext";
import { employeesApi, recordApi } from "../lib/api";
import { describeRange, formatDisplayDate, todayFilter } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { Commission, DateFilter, Employee, Expense, LdCommission, Salary, Sale } from "../types/models";

interface StaffSummary {
  name: string;
  position: string | null;
  ldQuantity: number;
  ldAmount: number;
  commissionAmount: number;
  salaryAmount: number;
  totalPayout: number;
}

export function DashboardPage() {
  const { currentBranchId, currentBranch } = useBranch();
  const [filter, setFilter] = useState<DateFilter>(todayFilter);
  const [loading, setLoading] = useState(true);

  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ldCommissions, setLdCommissions] = useState<LdCommission[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e, ld, c, sal, emp] = await Promise.all([
        recordApi<Sale, unknown>("sales").list(filter, currentBranchId),
        recordApi<Expense, unknown>("expenses").list(filter, currentBranchId),
        recordApi<LdCommission, unknown>("ld_commissions").list(filter, currentBranchId),
        recordApi<Commission, unknown>("commissions").list(filter, currentBranchId),
        recordApi<Salary, unknown>("salaries").list(filter, currentBranchId),
        employeesApi.list(currentBranchId),
      ]);
      setSales(s);
      setExpenses(e);
      setLdCommissions(ld);
      setCommissions(c);
      setSalaries(sal);
      setEmployees(emp);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  }, [filter, currentBranchId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggregate Totals
  const totalSales = useMemo(() => sales.reduce((acc, r) => acc + r.amount, 0), [sales]);
  const totalExpenses = useMemo(() => expenses.reduce((acc, r) => acc + r.amount, 0), [expenses]);
  const totalLdAmount = useMemo(() => ldCommissions.reduce((acc, r) => acc + r.amount, 0), [ldCommissions]);
  const totalLdQuantity = useMemo(() => ldCommissions.reduce((acc, r) => acc + r.quantity, 0), [ldCommissions]);
  const totalCommissions = useMemo(() => commissions.reduce((acc, r) => acc + r.amount, 0), [commissions]);
  const totalSalaries = useMemo(() => salaries.reduce((acc, r) => acc + r.amount, 0), [salaries]);

  const totalStaffPayouts = totalLdAmount + totalCommissions + totalSalaries;
  const totalOutflows = totalExpenses + totalStaffPayouts;
  const netProfit = totalSales - totalOutflows;
  const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  // Daily Chart Aggregation
  const dailyData: DailyDataPoint[] = useMemo(() => {
    const map = new Map<string, { sales: number; outflows: number }>();

    sales.forEach((s) => {
      const cur = map.get(s.date) || { sales: 0, outflows: 0 };
      cur.sales += s.amount;
      map.set(s.date, cur);
    });

    expenses.forEach((e) => {
      const cur = map.get(e.date) || { sales: 0, outflows: 0 };
      cur.outflows += e.amount;
      map.set(e.date, cur);
    });

    ldCommissions.forEach((ld) => {
      const cur = map.get(ld.date) || { sales: 0, outflows: 0 };
      cur.outflows += ld.amount;
      map.set(ld.date, cur);
    });

    commissions.forEach((c) => {
      const cur = map.get(c.date) || { sales: 0, outflows: 0 };
      cur.outflows += c.amount;
      map.set(c.date, cur);
    });

    salaries.forEach((sal) => {
      const cur = map.get(sal.date) || { sales: 0, outflows: 0 };
      cur.outflows += sal.amount;
      map.set(sal.date, cur);
    });

    const sortedDates = Array.from(map.keys()).sort();
    return sortedDates.map((date) => {
      const d = map.get(date)!;
      return {
        date,
        displayDate: formatDisplayDate(date),
        sales: d.sales,
        outflows: d.outflows,
        net: d.sales - d.outflows,
      };
    });
  }, [sales, expenses, ldCommissions, commissions, salaries]);

  // Sales Categories Breakdown
  const salesCategories: CategoryBreakdownItem[] = useMemo(() => {
    if (totalSales === 0) return [];
    const catMap = new Map<string, { amount: number; count: number }>();
    sales.forEach((s) => {
      const cur = catMap.get(s.category) || { amount: 0, count: 0 };
      cur.amount += s.amount;
      cur.count += 1;
      catMap.set(s.category, cur);
    });
    return Array.from(catMap.entries())
      .map(([category, val]) => ({
        category,
        amount: val.amount,
        count: val.count,
        percentage: (val.amount / totalSales) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [sales, totalSales]);

  // Expenses Categories Breakdown
  const expensesCategories: CategoryBreakdownItem[] = useMemo(() => {
    if (totalExpenses === 0) return [];
    const catMap = new Map<string, { amount: number; count: number }>();
    expenses.forEach((e) => {
      const cur = catMap.get(e.category) || { amount: 0, count: 0 };
      cur.amount += e.amount;
      cur.count += 1;
      catMap.set(e.category, cur);
    });
    return Array.from(catMap.entries())
      .map(([category, val]) => ({
        category,
        amount: val.amount,
        count: val.count,
        percentage: (val.amount / totalExpenses) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, totalExpenses]);

  // Staff Payout Breakdown
  const staffSummaries: StaffSummary[] = useMemo(() => {
    const summaryMap = new Map<string, StaffSummary>();

    // Seed with all registered employees
    employees.forEach((emp) => {
      summaryMap.set(emp.name.toLowerCase(), {
        name: emp.name,
        position: emp.position,
        ldQuantity: 0,
        ldAmount: 0,
        commissionAmount: 0,
        salaryAmount: 0,
        totalPayout: 0,
      });
    });

    // Accumulate LD commissions
    ldCommissions.forEach((ld) => {
      const key = ld.name.toLowerCase();
      const cur = summaryMap.get(key) || {
        name: ld.name,
        position: null,
        ldQuantity: 0,
        ldAmount: 0,
        commissionAmount: 0,
        salaryAmount: 0,
        totalPayout: 0,
      };
      cur.ldQuantity += ld.quantity;
      cur.ldAmount += ld.amount;
      cur.totalPayout += ld.amount;
      summaryMap.set(key, cur);
    });

    // Accumulate Regular Commissions
    commissions.forEach((c) => {
      const key = c.name.toLowerCase();
      const cur = summaryMap.get(key) || {
        name: c.name,
        position: null,
        ldQuantity: 0,
        ldAmount: 0,
        commissionAmount: 0,
        salaryAmount: 0,
        totalPayout: 0,
      };
      cur.commissionAmount += c.amount;
      cur.totalPayout += c.amount;
      summaryMap.set(key, cur);
    });

    // Accumulate Salaries
    salaries.forEach((sal) => {
      const key = sal.name.toLowerCase();
      const cur = summaryMap.get(key) || {
        name: sal.name,
        position: null,
        ldQuantity: 0,
        ldAmount: 0,
        commissionAmount: 0,
        salaryAmount: 0,
        totalPayout: 0,
      };
      cur.salaryAmount += sal.amount;
      cur.totalPayout += sal.amount;
      summaryMap.set(key, cur);
    });

    return Array.from(summaryMap.values())
      .filter((s) => s.totalPayout > 0 || s.position !== null)
      .sort((a, b) => b.totalPayout - a.totalPayout);
  }, [employees, ldCommissions, commissions, salaries]);

  // Print modal selection state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<"all" | "staff" | "cashflow" | "financial">("all");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);

  const handleExecutePrint = () => {
    setPrintModalOpen(false);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <>
      <div className="dashboard-screen-content space-y-6">
        <PageHeader
          title="Dashboard & Reports"
          description="Comprehensive restobar financial overview, visual reports, and staff earnings."
          actions={
            <div className="flex items-center gap-3">
              {loading && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
                  <span className="h-2 w-2 animate-ping rounded-full bg-amber-500" />
                  Updating…
                </span>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPrintModalOpen(true)}
                title="Choose and print specific financial reports"
              >
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Report
              </button>
            </div>
          }
        />

        {/* Restobar Brand Hero Banner */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-950/30 via-slate-900/90 to-slate-950 p-5 shadow-xl shadow-amber-500/5 animate-fade-in-up">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/40 via-yellow-400/40 to-amber-600/40 blur-sm animate-pulse-glow" />
              <img
                src={logoImg}
                alt="Joyce Restobar Crest"
                className="relative h-14 w-14 rounded-xl object-contain bg-black/90 p-0.5 ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/30 transition-transform duration-300 hover:scale-105"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-400">
                  Joyce Restobar
                </span>
                <span className="badge-gold">
                  {currentBranch?.name || "Main Branch"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Live Offline Ledger · Filtered: <span className="font-semibold text-slate-200">{describeRange(filter)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">Active View</span>
              <p className="text-sm font-bold text-white flex items-center gap-1.5 justify-end">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {currentBranch?.name || "Main Branch"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="card card-hover mb-6 p-5">
        <DateRangeFilter idPrefix="dashboard" value={filter} onChange={setFilter} />
      </div>

      {/* Executive Financial Stat Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Profit Card */}
        <div className={`card card-hover relative col-span-1 overflow-hidden p-6 sm:col-span-2 lg:col-span-2 ${
          netProfit >= 0
            ? "border-emerald-300/80 bg-gradient-to-br from-emerald-500/10 via-white to-white dark:border-emerald-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900"
            : "border-rose-300/80 bg-gradient-to-br from-rose-500/10 via-white to-white dark:border-rose-800 dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Net Profit / Cash Balance ({describeRange(filter)})
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                netProfit >= 0
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {profitMargin >= 0 ? `+${profitMargin.toFixed(1)}%` : `${profitMargin.toFixed(1)}%`} margin
            </span>
          </div>
          <p
            className={`tabular mt-3 text-3xl font-black tracking-tight sm:text-4xl ${
              netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {netProfit >= 0 ? "+" : ""}
            {formatMoney(netProfit)}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Total Sales ({formatMoney(totalSales)}) minus Operating Expenses & Staff Payouts ({formatMoney(totalOutflows)})
          </p>
        </div>

        {/* Gross Sales */}
        <div className="card card-hover p-6 border-amber-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Sales</span>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              {sales.length} bills
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-amber-600 dark:text-amber-300">
            {formatMoney(totalSales)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Total revenue generated</p>
        </div>

        {/* Total Expenses */}
        <div className="card card-hover p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Operating Expenses</span>
            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
              {expenses.length} costs
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {formatMoney(totalExpenses)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Supplies, utilities & gas</p>
        </div>

        {/* LD Commissions */}
        <div className="card card-hover p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">LD Commissions</span>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {totalLdQuantity} drinks
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            {formatMoney(totalLdAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-400">{ldCommissions.length} transactions</p>
        </div>

        {/* Regular Commissions */}
        <div className="card card-hover p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Commissions</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {commissions.length} entries
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            {formatMoney(totalCommissions)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Bottles & tables</p>
        </div>

        {/* Salaries Paid */}
        <div className="card card-hover p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Salaries Paid</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {salaries.length} payrolls
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            {formatMoney(totalSalaries)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Base salary payouts</p>
        </div>

        {/* Staff Payouts Combined */}
        <div className="card card-hover p-6 border-indigo-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Staff Payouts</span>
            <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Combined
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {formatMoney(totalStaffPayouts)}
          </p>
          <p className="mt-1 text-xs text-slate-400">LD + Commissions + Salaries</p>
        </div>
      </div>

      {/* Cash Flow Timeline Chart */}
      <div className="card mb-6 p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Daily Financial Flow (Sales vs Outflows)
          </h2>
          <span className="text-xs text-slate-400">Hover over bars for daily totals</span>
        </div>
        <CashFlowChart data={dailyData} />
      </div>

      {/* Category Breakdowns Grid */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoryBreakdown
          title="Sales by Category"
          items={salesCategories}
          colorScheme="brand"
        />
        <CategoryBreakdown
          title="Expenses by Category"
          items={expensesCategories}
          colorScheme="rose"
        />
      </div>

      {/* Staff Earnings & Payout Ranking Graph */}
      <div className="mb-6">
        <StaffRankChart items={staffSummaries} />
      </div>

      {/* Staff Payout Summary Table */}
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Staff Earnings & Payout Summary
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Performance and earnings per employee in the selected period ({describeRange(filter)})
          </p>
        </div>

        {staffSummaries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No employee records or commissions in this date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60">
                  <th className="border-b border-slate-200 px-5 py-3 text-left font-bold text-slate-500 uppercase tracking-wider text-xs dark:border-slate-800">
                    Employee
                  </th>
                  <th className="border-b border-slate-200 px-5 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-xs dark:border-slate-800">
                    LD Drinks
                  </th>
                  <th className="border-b border-slate-200 px-5 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-xs dark:border-slate-800">
                    LD Commission
                  </th>
                  <th className="border-b border-slate-200 px-5 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-xs dark:border-slate-800">
                    Commission
                  </th>
                  <th className="border-b border-slate-200 px-5 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-xs dark:border-slate-800">
                    Salary
                  </th>
                  <th className="border-b border-slate-200 px-5 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-xs dark:border-slate-800">
                    Total Payout
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffSummaries.map((s) => (
                  <tr key={s.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="border-b border-slate-100 px-5 py-3 dark:border-slate-800/60">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{s.name}</p>
                      {s.position && <p className="text-xs text-slate-400">{s.position}</p>}
                    </td>
                    <td className="tabular border-b border-slate-100 px-5 py-3 text-right font-medium dark:border-slate-800/60">
                      {s.ldQuantity > 0 ? `${s.ldQuantity} drinks` : "—"}
                    </td>
                    <td className="tabular border-b border-slate-100 px-5 py-3 text-right text-slate-700 dark:text-slate-300 dark:border-slate-800/60">
                      {formatMoney(s.ldAmount)}
                    </td>
                    <td className="tabular border-b border-slate-100 px-5 py-3 text-right text-slate-700 dark:text-slate-300 dark:border-slate-800/60">
                      {formatMoney(s.commissionAmount)}
                    </td>
                    <td className="tabular border-b border-slate-100 px-5 py-3 text-right text-slate-700 dark:text-slate-300 dark:border-slate-800/60">
                      {formatMoney(s.salaryAmount)}
                    </td>
                    <td className="tabular border-b border-slate-100 px-5 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 dark:border-slate-800/60">
                      {formatMoney(s.totalPayout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>

    {/* Print Selection Modal */}
    <Modal
      open={printModalOpen}
      onClose={() => setPrintModalOpen(false)}
      title="Select Report to Print"
    >
      <div className="space-y-4">
        {/* Scope info banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900/60 p-3.5 border border-slate-700/60 text-xs">
          <div>
            <span className="text-slate-400">Branch: </span>
            <span className="font-bold text-amber-400">{currentBranch?.name || "All Branches"}</span>
          </div>
          <div>
            <span className="text-slate-400">Reporting Range: </span>
            <span className="font-bold text-slate-200">{describeRange(filter)}</span>
          </div>
        </div>

        {/* Report Cards */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Select Statement or Schedule:
          </label>

          {/* Option 1: All in One */}
          <button
            type="button"
            onClick={() => setSelectedReportType("all")}
            className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-start gap-3.5 ${
              selectedReportType === "all"
                ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 shadow-md shadow-amber-500/10"
                : "border-slate-700/60 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40"
            }`}
          >
            <span className="text-2xl mt-0.5">📑</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Comprehensive Audit Dossier (All-in-One)</h4>
                {selectedReportType === "all" && (
                  <span className="text-xs font-bold text-amber-400">Selected</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete multi-section audit packet: Executive financial summary, staff earnings ranking, daily cash flows, and category breakdown.
              </p>
            </div>
          </button>

          {/* Option 2: Staff Ranking */}
          <button
            type="button"
            onClick={() => setSelectedReportType("staff")}
            className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-start gap-3.5 ${
              selectedReportType === "staff"
                ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 shadow-md shadow-amber-500/10"
                : "border-slate-700/60 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40"
            }`}
          >
            <span className="text-2xl mt-0.5">👥</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Staff Earnings & Payout Ranking</h4>
                {selectedReportType === "staff" && (
                  <span className="text-xs font-bold text-amber-400">Selected</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Official payroll ledger: Staff ranks, LD drink counts, LD commissions, sales commissions, base salaries, and individual payouts.
              </p>
            </div>
          </button>

          {/* Option 3: Daily Financial Flows */}
          <button
            type="button"
            onClick={() => setSelectedReportType("cashflow")}
            className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-start gap-3.5 ${
              selectedReportType === "cashflow"
                ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 shadow-md shadow-amber-500/10"
                : "border-slate-700/60 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40"
            }`}
          >
            <span className="text-2xl mt-0.5">📊</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Daily Financial Flows Statement</h4>
                {selectedReportType === "cashflow" && (
                  <span className="text-xs font-bold text-amber-400">Selected</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Day-by-day cash intake and outflow ledger: Daily sales revenues, operating outflows, net profits, and performance margins.
              </p>
            </div>
          </button>

          {/* Option 4: Executive Financial Statement */}
          <button
            type="button"
            onClick={() => setSelectedReportType("financial")}
            className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-start gap-3.5 ${
              selectedReportType === "financial"
                ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 shadow-md shadow-amber-500/10"
                : "border-slate-700/60 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40"
            }`}
          >
            <span className="text-2xl mt-0.5">💼</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Executive Financial & Category Statement</h4>
                {selectedReportType === "financial" && (
                  <span className="text-xs font-bold text-amber-400">Selected</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                High-level income summary: Gross sales, operating outflows, net profit, margin %, and itemized category distribution.
              </p>
            </div>
          </button>
        </div>

        {/* Customization toggles */}
        <div className="space-y-2 pt-2 border-t border-slate-700/60 text-xs">
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.target.checked)}
              className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
            />
            <span>Include Joyce Restobar Crest & Branch Header</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={includeSignatures}
              onChange={(e) => setIncludeSignatures(e.target.checked)}
              className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
            />
            <span>Include Auditor Verification & Management Sign-off Lines</span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPrintModalOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={handleExecutePrint}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </button>
        </div>
      </div>
    </Modal>

    {/* Printable Report Output (Only rendered when printing or saving as PDF) */}
    <div id="printable-report" className="hidden print:block text-black bg-white p-6 font-sans">
      {/* Official Header */}
      {includeHeader && (
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={logoImg} alt="Joyce Restobar" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-xl font-black tracking-wide uppercase">JOYCE RESTOBAR & LOUNGE</h1>
                <p className="text-xs font-semibold text-gray-700 uppercase">
                  Branch: {currentBranch?.name || "Main Branch"}
                </p>
                <p className="text-[11px] text-gray-500">Official Financial Audit & Ledger Statement</p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold text-sm uppercase">
                {selectedReportType === "all" && "Comprehensive Audit Dossier"}
                {selectedReportType === "staff" && "Staff Earnings & Payout Ranking"}
                {selectedReportType === "cashflow" && "Daily Financial Flows Statement"}
                {selectedReportType === "financial" && "Executive Financial Statement"}
              </p>
              <p className="text-gray-600 mt-1">Period: <span className="font-semibold text-black">{describeRange(filter)}</span></p>
              <p className="text-gray-500 text-[10px] mt-0.5">Printed: {new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: Executive Financial Summary (if 'all' or 'financial') */}
      {(selectedReportType === "all" || selectedReportType === "financial") && (
        <section className="mb-6">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {selectedReportType === "all" ? "1. Executive Financial Summary" : "Financial Performance Summary"}
            </h2>
            <span className="text-xs font-medium text-gray-600">Currency: Philippine Peso (PHP)</span>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4 text-center">
            <div className="border border-gray-400 p-2 rounded">
              <span className="text-[10px] uppercase text-gray-600 block">Gross Sales</span>
              <span className="text-base font-bold">{formatMoney(totalSales)}</span>
            </div>
            <div className="border border-gray-400 p-2 rounded">
              <span className="text-[10px] uppercase text-gray-600 block">Total Outflows</span>
              <span className="text-base font-bold">{formatMoney(totalOutflows)}</span>
            </div>
            <div className="border border-gray-400 p-2 rounded">
              <span className="text-[10px] uppercase text-gray-600 block">Net Operating Profit</span>
              <span className="text-base font-bold">{formatMoney(netProfit)}</span>
            </div>
            <div className="border border-gray-400 p-2 rounded">
              <span className="text-[10px] uppercase text-gray-600 block">Profit Margin</span>
              <span className="text-base font-bold">{profitMargin.toFixed(1)}%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Sales by Category Table */}
            <div>
              <h3 className="text-xs font-bold uppercase mb-1.5">Sales by Category</h3>
              <table className="w-full text-xs border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="p-1.5 text-left font-bold">Category</th>
                    <th className="p-1.5 text-right font-bold">Orders</th>
                    <th className="p-1.5 text-right font-bold">Amount</th>
                    <th className="p-1.5 text-right font-bold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {salesCategories.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-2 text-center text-gray-500">No sales recorded</td>
                    </tr>
                  ) : (
                    salesCategories.map((c) => (
                      <tr key={c.category} className="border-b border-gray-200">
                        <td className="p-1.5 font-medium">{c.category}</td>
                        <td className="p-1.5 text-right">{c.count}</td>
                        <td className="p-1.5 text-right font-semibold">{formatMoney(c.amount)}</td>
                        <td className="p-1.5 text-right">{c.percentage.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-400 font-bold">
                    <td className="p-1.5">Total Sales</td>
                    <td className="p-1.5 text-right">{sales.length}</td>
                    <td className="p-1.5 text-right">{formatMoney(totalSales)}</td>
                    <td className="p-1.5 text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Expenses by Category Table */}
            <div>
              <h3 className="text-xs font-bold uppercase mb-1.5">Operating Expenses Breakdown</h3>
              <table className="w-full text-xs border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="p-1.5 text-left font-bold">Category</th>
                    <th className="p-1.5 text-right font-bold">Count</th>
                    <th className="p-1.5 text-right font-bold">Amount</th>
                    <th className="p-1.5 text-right font-bold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesCategories.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-2 text-center text-gray-500">No expenses recorded</td>
                    </tr>
                  ) : (
                    expensesCategories.map((c) => (
                      <tr key={c.category} className="border-b border-gray-200">
                        <td className="p-1.5 font-medium">{c.category}</td>
                        <td className="p-1.5 text-right">{c.count}</td>
                        <td className="p-1.5 text-right font-semibold">{formatMoney(c.amount)}</td>
                        <td className="p-1.5 text-right">{c.percentage.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-400 font-bold">
                    <td className="p-1.5">Total OpEx</td>
                    <td className="p-1.5 text-right">{expenses.length}</td>
                    <td className="p-1.5 text-right">{formatMoney(totalExpenses)}</td>
                    <td className="p-1.5 text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* SECTION: Staff Earnings & Payout Ranking (if 'all' or 'staff') */}
      {(selectedReportType === "all" || selectedReportType === "staff") && (
        <section className="mb-6">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {selectedReportType === "all" ? "2. Staff Earnings & Payout Ranking" : "Staff Earnings & Payout Schedule"}
            </h2>
            <span className="text-xs font-medium text-gray-600">{staffSummaries.length} Staff Member(s)</span>
          </div>

          <table className="w-full text-xs border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-400">
                <th className="p-1.5 text-center font-bold w-10">Rank</th>
                <th className="p-1.5 text-left font-bold">Staff Member</th>
                <th className="p-1.5 text-left font-bold">Position</th>
                <th className="p-1.5 text-right font-bold">LD Drinks</th>
                <th className="p-1.5 text-right font-bold">LD Comm.</th>
                <th className="p-1.5 text-right font-bold">Sales Comm.</th>
                <th className="p-1.5 text-right font-bold">Base Salary</th>
                <th className="p-1.5 text-right font-bold">Total Payout</th>
              </tr>
            </thead>
            <tbody>
              {staffSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-3 text-center text-gray-500">No staff payout data found for this period.</td>
                </tr>
              ) : (
                staffSummaries.map((s, idx) => (
                  <tr key={s.name} className="border-b border-gray-200">
                    <td className="p-1.5 text-center font-bold text-gray-700">#{idx + 1}</td>
                    <td className="p-1.5 font-bold">{s.name}</td>
                    <td className="p-1.5 text-gray-600">{s.position || "—"}</td>
                    <td className="p-1.5 text-right">{s.ldQuantity > 0 ? s.ldQuantity : "—"}</td>
                    <td className="p-1.5 text-right">{formatMoney(s.ldAmount)}</td>
                    <td className="p-1.5 text-right">{formatMoney(s.commissionAmount)}</td>
                    <td className="p-1.5 text-right">{formatMoney(s.salaryAmount)}</td>
                    <td className="p-1.5 text-right font-bold">{formatMoney(s.totalPayout)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-black font-bold">
                <td colSpan={3} className="p-2 text-right">TOTAL PAYROLL LIABILITIES:</td>
                <td className="p-2 text-right">{totalLdQuantity}</td>
                <td className="p-2 text-right">{formatMoney(totalLdAmount)}</td>
                <td className="p-2 text-right">{formatMoney(totalCommissions)}</td>
                <td className="p-2 text-right">{formatMoney(totalSalaries)}</td>
                <td className="p-2 text-right text-sm underline">{formatMoney(totalStaffPayouts)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* SECTION: Daily Financial Flows (if 'all' or 'cashflow') */}
      {(selectedReportType === "all" || selectedReportType === "cashflow") && (
        <section className="mb-6">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {selectedReportType === "all" ? "3. Daily Financial Flows Statement" : "Daily Financial Cash Flows Statement"}
            </h2>
            <span className="text-xs font-medium text-gray-600">{dailyData.length} Day(s) Recorded</span>
          </div>

          <table className="w-full text-xs border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-400">
                <th className="p-1.5 text-left font-bold">Date</th>
                <th className="p-1.5 text-right font-bold">Gross Sales (Inflow)</th>
                <th className="p-1.5 text-right font-bold">Operating Outflows</th>
                <th className="p-1.5 text-right font-bold">Net Profit / Margin</th>
                <th className="p-1.5 text-right font-bold">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-gray-500">No chronological flow records for this period.</td>
                </tr>
              ) : (
                dailyData.map((d) => {
                  const dayMargin = d.sales > 0 ? (d.net / d.sales) * 100 : 0;
                  return (
                    <tr key={d.date} className="border-b border-gray-200">
                      <td className="p-1.5 font-medium">{d.displayDate} ({d.date})</td>
                      <td className="p-1.5 text-right font-semibold">{formatMoney(d.sales)}</td>
                      <td className="p-1.5 text-right text-gray-700">{formatMoney(d.outflows)}</td>
                      <td className="p-1.5 text-right font-bold">
                        {d.net >= 0 ? "+" : ""}{formatMoney(d.net)}
                      </td>
                      <td className="p-1.5 text-right font-medium">{dayMargin.toFixed(1)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-black font-bold">
                <td className="p-2">PERIOD TOTALS:</td>
                <td className="p-2 text-right">{formatMoney(totalSales)}</td>
                <td className="p-2 text-right">{formatMoney(totalOutflows)}</td>
                <td className="p-2 text-right text-sm underline">{formatMoney(netProfit)}</td>
                <td className="p-2 text-right">{profitMargin.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Signatures & Auditor Verification */}
      {includeSignatures && (
        <div className="pt-8 mt-8 border-t border-gray-400">
          <div className="grid grid-cols-3 gap-8 text-center text-xs">
            <div>
              <div className="border-b border-black mb-1 pb-8" />
              <p className="font-bold uppercase">Prepared By</p>
              <p className="text-[11px] text-gray-600">Cashier / Bookkeeper</p>
            </div>
            <div>
              <div className="border-b border-black mb-1 pb-8" />
              <p className="font-bold uppercase">Verified / Audited By</p>
              <p className="text-[11px] text-gray-600">Branch Supervisor</p>
            </div>
            <div>
              <div className="border-b border-black mb-1 pb-8" />
              <p className="font-bold uppercase">Approved By</p>
              <p className="text-[11px] text-gray-600">General Manager / Owner</p>
            </div>
          </div>
        </div>
      )}
    </div>
  </>
);
}
