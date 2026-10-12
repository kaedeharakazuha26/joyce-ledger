import { RecordModule, type FieldDef } from "../components/RecordModule";
import type { Column } from "../components/DataTable";
import { formatDisplayDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { Expense } from "../types/models";

const fields: FieldDef[] = [
  { key: "category", label: "Category", type: "text", suggestions: "expensesCategory", placeholder: "e.g. Ice, Gas, Supplies" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "date", label: "Date", type: "date" },
];

const columns: Column<Expense>[] = [
  { header: "Date", render: (r) => formatDisplayDate(r.date), className: "tabular text-slate-500 whitespace-nowrap" },
  { header: "Category", render: (r) => r.category, className: "font-medium" },
  { header: "Amount", render: (r) => formatMoney(r.amount), align: "right", className: "tabular font-semibold" },
];

export function ExpensesPage() {
  return (
    <RecordModule<Expense>
      module="expenses"
      title="Expenses"
      noun="Expense"
      description="Track money spent on supplies, utilities and other costs."
      fields={fields}
      columns={columns}
      describe={(r) => `${r.category} · ${formatMoney(r.amount)} · ${formatDisplayDate(r.date)}`}
    />
  );
}
