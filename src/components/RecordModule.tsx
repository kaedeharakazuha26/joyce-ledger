import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useBranch } from "../context/BranchContext";
import { addCategory, employeesApi, errorMessage, exportCsv } from "../lib/api";
import { describeRange, isValidIsoDate, rangeSlug, todayFilter, todayLocal } from "../lib/dates";
import { centavosToInput, formatMoney, MAX_CENTAVOS, parsePesos } from "../lib/money";
import { useRecords } from "../hooks/useRecords";
import { useSuggestions } from "../hooks/useSuggestions";
import type { BaseRecord, DateFilter, Employee, ModuleKey, SuggestionKind } from "../types/models";
import { PageHeader } from "./AppLayout";
import { ConfirmDialog } from "./ConfirmDialog";
import { DataTable, type Column } from "./DataTable";
import { DateInput } from "./DateInput";
import { DateRangeFilter } from "./DateRangeFilter";
import { EmptyState } from "./EmptyState";
import { MoneyInput } from "./MoneyInput";
import { SelectWithAdd } from "./SelectWithAdd";
import { TextInput } from "./TextInput";
import { useToast } from "./Toast";

export type FieldType = "text" | "money" | "int" | "date" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  suggestions?: SuggestionKind;
  placeholder?: string;
  optionsSource?: "suggestions" | "employees";
  allowAdd?: boolean;
  addTitle?: string;
  addPlaceholder?: string;
}

type AnyRecord = BaseRecord & { quantity?: number };
type Values = Record<string, string>;

interface RecordModuleProps<T extends AnyRecord> {
  module: ModuleKey;
  title: string;
  /** Singular noun used in messages, e.g. "Sale". */
  noun: string;
  description: string;
  fields: FieldDef[];
  columns: Column<T>[];
  /** Show total quantity (LD Commission). */
  showQuantity?: boolean;
  /** Describe a row in the delete confirmation. */
  describe: (row: T) => string;
}

function blankValues(fields: FieldDef[]): Values {
  return Object.fromEntries(fields.map((f) => [f.key, f.type === "date" ? todayLocal() : ""]));
}

function valuesFromRecord(fields: FieldDef[], row: AnyRecord): Values {
  return Object.fromEntries(
    fields.map((f) => {
      const v = (row as unknown as Record<string, unknown>)[f.key];
      if (f.type === "money") return [f.key, centavosToInput(Number(v))];
      return [f.key, v == null ? "" : String(v)];
    }),
  );
}

/** Validate form values; returns field errors and the typed input to send to Rust. */
function validate(fields: FieldDef[], values: Values) {
  const errors: Record<string, string> = {};
  const input: Record<string, string | number> = {};
  for (const f of fields) {
    const raw = (values[f.key] ?? "").trim();
    switch (f.type) {
      case "text":
      case "select":
        if (!raw) errors[f.key] = `${f.label} is required.`;
        else if (raw.length > 120) errors[f.key] = `${f.label} must be 120 characters or fewer.`;
        input[f.key] = raw;
        break;
      case "money": {
        const c = raw ? parsePesos(raw) : null;
        if (!raw) errors[f.key] = "Amount is required.";
        else if (c === null) errors[f.key] = "Enter a valid amount (up to 2 decimals).";
        else if (c <= 0) errors[f.key] = "Amount must be greater than 0.";
        else if (c > MAX_CENTAVOS) errors[f.key] = "Amount is too large.";
        input[f.key] = c ?? 0;
        break;
      }
      case "int": {
        const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!raw) errors[f.key] = `${f.label} is required.`;
        else if (!Number.isInteger(n)) errors[f.key] = `${f.label} must be a whole number.`;
        else if (n < 1) errors[f.key] = `${f.label} must be 1 or more.`;
        else if (n > 1_000_000) errors[f.key] = `${f.label} is too large.`;
        input[f.key] = Number.isInteger(n) ? n : 0;
        break;
      }
      case "date":
        if (!raw) errors[f.key] = "Date is required.";
        else if (!isValidIsoDate(raw)) errors[f.key] = "Enter a valid date.";
        input[f.key] = raw;
        break;
    }
  }
  return { errors, input };
}

/** Shared page for Sales, Expenses, LD Commission, Commission and Salary. */
export function RecordModule<T extends AnyRecord>({
  module,
  title,
  noun,
  description,
  fields,
  columns,
  showQuantity,
  describe,
}: RecordModuleProps<T>) {
  const toast = useToast();
  const [filter, setFilter] = useState<DateFilter>(todayFilter);
  const { records, totals, loading, error, create, update, remove } = useRecords<T, Record<string, unknown>>(module, filter);

  const kinds = useMemo(
    () => Array.from(new Set(fields.map((f) => f.suggestions).filter((k): k is SuggestionKind => !!k))),
    [fields],
  );
  const suggestions = useSuggestions(kinds);

  const { currentBranchId } = useBranch();
  const hasEmployeeField = useMemo(() => fields.some((f) => f.optionsSource === "employees"), [fields]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const reloadEmployees = useCallback(async () => {
    if (!hasEmployeeField) return;
    try {
      const list = await employeesApi.list(currentBranchId);
      setEmployees(list);
    } catch {
      // Ignore
    }
  }, [hasEmployeeField, currentBranchId]);

  useEffect(() => {
    void reloadEmployees();
  }, [reloadEmployees]);

  const [values, setValues] = useState<Values>(() => blankValues(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<T | null>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const setField = (key: string, v: string) => {
    setValues((prev) => {
      const updated = { ...prev, [key]: v };

      // Auto-populate amounts from employee's configured rates
      if (hasEmployeeField) {
        if (key === "name") {
          const emp = employees.find((e) => e.name.toLowerCase() === v.toLowerCase());
          if (emp) {
            if (module === "salaries" && emp.baseSalary > 0) {
              updated.amount = centavosToInput(emp.baseSalary);
            } else if (module === "commissions" && emp.commission > 0) {
              updated.amount = centavosToInput(emp.commission);
            } else if (module === "ld_commissions" && emp.ldCommission > 0) {
              const qty = Math.max(1, Number(prev.quantity) || 1);
              if (!prev.quantity) updated.quantity = String(qty);
              updated.amount = centavosToInput(qty * emp.ldCommission);
            }
          }
        } else if (key === "quantity" && module === "ld_commissions") {
          const empName = prev.name;
          if (empName) {
            const emp = employees.find((e) => e.name.toLowerCase() === empName.toLowerCase());
            if (emp && emp.ldCommission > 0) {
              const qty = Number(v);
              if (qty >= 1) {
                updated.amount = centavosToInput(qty * emp.ldCommission);
              }
            }
          }
        }
      }

      return updated;
    });

    setErrors((prevErrors) => {
      const updated = { ...prevErrors };
      delete updated[key];
      if (key === "name" || (key === "quantity" && module === "ld_commissions")) {
        delete updated.amount;
      }
      return updated;
    });
  };

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setValues(blankValues(fields));
    setErrors({});
  }, [fields]);

  // Esc cancels edit mode (the confirm dialog handles its own Esc).
  useEffect(() => {
    if (!editing || pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, pendingDelete, cancelEdit]);

  const startEdit = (row: T) => {
    setEditing(row);
    setValues(valuesFromRecord(fields, row));
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const { errors: errs, input } = validate(fields, values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, input);
        toast.success(`${noun} updated.`);
        cancelEdit();
      } else {
        await create(input);
        toast.success(`${noun} saved.`);
        // Keep the chosen date so several entries for the same day are quick.
        setValues((prev) => ({ ...blankValues(fields), date: prev.date ?? todayLocal() }));
      }
      void suggestions.refresh();
      firstFieldRef.current?.focus();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (pin: string) => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await remove(pendingDelete.id, pin);
      if (editing?.id === pendingDelete.id) cancelEdit();
      toast.success(`${noun} deleted.`);
      setPendingDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      const path = await save({
        title: `Export ${title} to CSV`,
        defaultPath: `${module}-${rangeSlug(filter)}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      const n = await exportCsv(module, filter, path, currentBranchId);
      toast.success(`Exported ${n} ${n === 1 ? "row" : "rows"} to CSV.`);
    } catch (err) {
      toast.error(`Export failed: ${errorMessage(err)}`);
    }
  };

  const gridCols = fields.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <button id={`${module}-export`} type="button" className="btn-secondary" onClick={handleExport}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Export CSV
          </button>
        }
      />

      {/* Entry form */}
      <form
        id={`${module}-form`}
        noValidate
        onSubmit={handleSubmit}
        className={`card card-hover mb-6 p-6 transition-all duration-300 ${editing ? "ring-2 ring-amber-400" : ""}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}</h2>
          {editing && (
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              Editing · press Esc to cancel
            </span>
          )}
        </div>
        <div className={`grid grid-cols-2 gap-4 ${gridCols}`}>
          {fields.map((f, i) => {
            const id = `${module}-${f.key}`;
            const ref = i === 0 ? firstFieldRef : undefined;
            const common = { id, label: f.label, value: values[f.key] ?? "", onChange: (v: string) => setField(f.key, v), error: errors[f.key] };
            if (f.type === "money") return <MoneyInput key={f.key} ref={ref} {...common} />;
            if (f.type === "date") return <DateInput key={f.key} ref={ref} {...common} />;
            if (f.type === "select") {
              const opts =
                f.optionsSource === "employees"
                  ? employees.map((e) => ({
                      label: e.position ? `${e.name} (${e.position})` : e.name,
                      value: e.name,
                    }))
                  : (f.suggestions ? suggestions.values[f.suggestions] ?? [] : []);

              const handleAddOption = async (newVal: string) => {
                if (f.optionsSource === "employees") {
                  await employeesApi.create({ name: newVal, position: null });
                  await reloadEmployees();
                  toast.success(`Employee "${newVal}" added.`);
                } else if (f.suggestions) {
                  await addCategory(f.suggestions, newVal);
                  await suggestions.refresh();
                  toast.success(`Category "${newVal}" added.`);
                }
              };

              return (
                <SelectWithAdd
                  key={f.key}
                  id={id}
                  label={f.label}
                  value={values[f.key] ?? ""}
                  onChange={(v: string) => setField(f.key, v)}
                  options={opts}
                  placeholder={f.placeholder ?? `Select ${f.label.toLowerCase()}…`}
                  error={errors[f.key]}
                  onAdd={f.allowAdd ? handleAddOption : undefined}
                  addTitle={f.addTitle ?? `Add New ${f.label}`}
                  addPlaceholder={f.addPlaceholder ?? `Enter ${f.label.toLowerCase()} name…`}
                  emptyNotice={
                    f.optionsSource === "employees" && employees.length === 0
                      ? "No staff found. Click + to add an employee."
                      : undefined
                  }
                />
              );
            }
            return (
              <TextInput
                key={f.key}
                ref={ref}
                {...common}
                placeholder={f.placeholder}
                inputMode={f.type === "int" ? "numeric" : undefined}
                className={f.type === "int" ? "tabular" : undefined}
                suggestions={f.suggestions ? suggestions.values[f.suggestions] : undefined}
              />
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          {editing && (
            <button id={`${module}-cancel`} type="button" className="btn-secondary" onClick={cancelEdit}>
              Cancel
            </button>
          )}
          <button id={`${module}-submit`} type="submit" className="btn-primary min-w-40" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : `Add ${noun.toLowerCase()}`}
          </button>
        </div>
      </form>

      {/* Filter + totals */}
      <section className="card card-hover overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <DateRangeFilter idPrefix={module} value={filter} onChange={setFilter} />
        </div>

        <div className={`grid gap-px bg-slate-200 dark:bg-slate-800 ${showQuantity ? "grid-cols-3" : "grid-cols-2"}`}>
          <Stat label="Records" value={String(totals.count)} />
          {showQuantity && <Stat label="Total quantity" value={totals.quantity.toLocaleString("en-US")} />}
          <Stat label={`Total · ${describeRange(filter)}`} value={formatMoney(totals.amount)} highlight />
        </div>

        {error ? (
          <div className="p-6 text-center font-medium text-rose-600">{error}</div>
        ) : loading && records.length === 0 ? (
          <div className="p-10 text-center text-slate-400">Loading…</div>
        ) : records.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} records`} message={`Nothing recorded for ${describeRange(filter).toLowerCase()}. Add one using the form above.`} />
        ) : (
          <DataTable
            idPrefix={module}
            columns={columns}
            rows={records}
            editingId={editing?.id ?? null}
            onEdit={startEdit}
            onDelete={setPendingDelete}
          />
        )}
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete this ${noun.toLowerCase()}?`}
        message={
          pendingDelete && (
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{describe(pendingDelete)}</span>
              <br />
              This cannot be undone.
            </>
          )
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white px-6 py-4 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`tabular mt-1 text-2xl font-extrabold ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}
