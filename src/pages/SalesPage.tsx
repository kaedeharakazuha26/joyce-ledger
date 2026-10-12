import { RecordModule, type FieldDef } from "../components/RecordModule";
import type { Column } from "../components/DataTable";
import { formatDisplayDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { Sale } from "../types/models";

const fields: FieldDef[] = [
  { key: "category", label: "Category", type: "text", suggestions: "salesCategory", placeholder: "e.g. Food, Drinks" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "date", label: "Date", type: "date" },
];

const columns: Column<Sale>[] = [
  { header: "Date", render: (r) => formatDisplayDate(r.date), className: "tabular text-slate-500 whitespace-nowrap" },
  { header: "Category", render: (r) => r.category, className: "font-medium" },
  { header: "Amount", render: (r) => formatMoney(r.amount), align: "right", className: "tabular font-semibold" },
];

export function SalesPage() {
  return (
    <RecordModule<Sale>
      module="sales"
      title="Sales"
      noun="Sale"
      description="Record the restobar's sales by category."
      fields={fields}
      columns={columns}
      describe={(r) => `${r.category} · ${formatMoney(r.amount)} · ${formatDisplayDate(r.date)}`}
    />
  );
}
