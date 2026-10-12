import { RecordModule, type FieldDef } from "../components/RecordModule";
import type { Column } from "../components/DataTable";
import { formatDisplayDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { Salary } from "../types/models";

const fields: FieldDef[] = [
  { key: "name", label: "Name", type: "text", suggestions: "names", placeholder: "Employee name" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "date", label: "Date", type: "date" },
];

const columns: Column<Salary>[] = [
  { header: "Date", render: (r) => formatDisplayDate(r.date), className: "tabular text-slate-500 whitespace-nowrap" },
  { header: "Name", render: (r) => r.name, className: "font-medium" },
  { header: "Amount", render: (r) => formatMoney(r.amount), align: "right", className: "tabular font-semibold" },
];

export function SalaryPage() {
  return (
    <RecordModule<Salary>
      module="salaries"
      title="Salary"
      noun="Salary"
      description="Salaries paid to staff."
      fields={fields}
      columns={columns}
      describe={(r) => `${r.name} · ${formatMoney(r.amount)} · ${formatDisplayDate(r.date)}`}
    />
  );
}
