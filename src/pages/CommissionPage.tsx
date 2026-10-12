import { RecordModule, type FieldDef } from "../components/RecordModule";
import type { Column } from "../components/DataTable";
import { formatDisplayDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { Commission } from "../types/models";

const fields: FieldDef[] = [
  { key: "name", label: "Name", type: "text", suggestions: "names", placeholder: "Employee name" },
  { key: "category", label: "Category", type: "text", suggestions: "commissionsCategory", placeholder: "e.g. Bottle, Table" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "date", label: "Date", type: "date" },
];

const columns: Column<Commission>[] = [
  { header: "Date", render: (r) => formatDisplayDate(r.date), className: "tabular text-slate-500 whitespace-nowrap" },
  { header: "Name", render: (r) => r.name, className: "font-medium" },
  { header: "Category", render: (r) => r.category },
  { header: "Amount", render: (r) => formatMoney(r.amount), align: "right", className: "tabular font-semibold" },
];

export function CommissionPage() {
  return (
    <RecordModule<Commission>
      module="commissions"
      title="Commission"
      noun="Commission"
      description="Commissions earned per person and category."
      fields={fields}
      columns={columns}
      describe={(r) => `${r.name} · ${r.category} · ${formatMoney(r.amount)} · ${formatDisplayDate(r.date)}`}
    />
  );
}
