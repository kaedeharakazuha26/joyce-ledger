import { RecordModule, type FieldDef } from "../components/RecordModule";
import type { Column } from "../components/DataTable";
import { formatDisplayDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { LdCommission } from "../types/models";

const fields: FieldDef[] = [
  {
    key: "name",
    label: "Name",
    type: "select",
    optionsSource: "employees",
    placeholder: "Select employee…",
    allowAdd: true,
    addTitle: "Add New Employee",
    addPlaceholder: "Employee full name",
  },
  { key: "quantity", label: "Quantity", type: "int", placeholder: "1" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "date", label: "Date", type: "date" },
];

const columns: Column<LdCommission>[] = [
  { header: "Date", render: (r) => formatDisplayDate(r.date), className: "tabular text-slate-500 whitespace-nowrap" },
  { header: "Name", render: (r) => r.name, className: "font-medium" },
  { header: "Quantity", render: (r) => r.quantity.toLocaleString("en-US"), align: "right", className: "tabular" },
  { header: "Amount", render: (r) => formatMoney(r.amount), align: "right", className: "tabular font-semibold" },
];

export function LdCommissionPage() {
  return (
    <RecordModule<LdCommission>
      module="ld_commissions"
      title="LD Commission"
      noun="LD commission"
      description="Lady drink commissions per person, with quantity."
      fields={fields}
      columns={columns}
      showQuantity
      describe={(r) => `${r.name} · ${r.quantity} × · ${formatMoney(r.amount)} · ${formatDisplayDate(r.date)}`}
    />
  );
}
