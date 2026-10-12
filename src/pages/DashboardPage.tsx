import { useCallback, useEffect, useMemo, useState } from "react";
import { CashFlowChart, CategoryBreakdown, type CategoryBreakdownItem, type DailyDataPoint } from "../components/Charts";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { PageHeader } from "../components/AppLayout";
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
        recordApi<Sale, unknown>("sales").list(filter),
        recordApi<Expense, unknown>("expenses").list(filter),
        recordApi<LdCommission, unknown>("ld_commissions").list(filter),
        recordApi<Commission, unknown>("commissions").list(filter),
        recordApi<Salary, unknown>("salaries").list(filter),
        employeesApi.list(),
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
  }, [filter]);

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

  return (
    <>
      <PageHeader
        title="Dashboard & Reports"
        description="Comprehensive restobar financial overview, visual reports, and staff earnings."
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.print()}
            title="Print or save as PDF"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </button>
        }
      />

      {/* Date Filter Bar */}
      <div className="card mb-6 p-5">
        <DateRangeFilter idPrefix="dashboard" value={filter} onChange={setFilter} />
      </div>

      {/* Executive Financial Stat Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Profit Card */}
        <div className={`card relative col-span-1 overflow-hidden p-6 sm:col-span-2 lg:col-span-2 ${
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
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Sales</span>
            <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              {sales.length} bills
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-extrabold text-brand-600 dark:text-brand-300">
            {formatMoney(totalSales)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Total revenue generated</p>
        </div>

        {/* Total Expenses */}
        <div className="card p-6">
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
        <div className="card p-6">
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
        <div className="card p-6">
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
        <div className="card p-6">
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
        <div className="card p-6">
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
    </>
  );
}
