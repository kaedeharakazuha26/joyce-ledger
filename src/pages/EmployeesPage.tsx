import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "../components/AppLayout";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { TextInput } from "../components/TextInput";
import { useToast } from "../components/Toast";
import { useBranch } from "../context/BranchContext";
import { employeesApi, errorMessage } from "../lib/api";
import type { Employee } from "../types/models";

const columns: Column<Employee>[] = [
  { header: "Name", render: (r) => r.name, className: "font-semibold" },
  { header: "Position", render: (r) => r.position ?? <span className="text-slate-400">—</span> },
  { header: "Added", render: (r) => r.createdAt.slice(0, 10), className: "tabular text-slate-500" },
];

export function EmployeesPage() {
  const toast = useToast();
  const { currentBranchId } = useBranch();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});
  const [editing, setEditing] = useState<Employee | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEmployees(await employeesApi.list(currentBranchId));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reset = useCallback(() => {
    setEditing(null);
    setName("");
    setPosition("");
    setErrors({});
  }, []);

  useEffect(() => {
    if (!editing || pendingDelete) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && reset();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, pendingDelete, reset]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const n = name.trim();
    const p = position.trim();
    const errs: typeof errors = {};
    if (!n) errs.name = "Name is required.";
    else if (n.length > 120) errs.name = "Name must be 120 characters or fewer.";
    else if (employees.some((x) => x.id !== editing?.id && x.name.toLowerCase() === n.toLowerCase()))
      errs.name = "An employee with that name already exists.";
    if (p.length > 120) errs.position = "Position must be 120 characters or fewer.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const input = { name: n, position: p || null };
      if (editing) {
        await employeesApi.update(editing.id, input);
        toast.success("Employee updated.");
      } else {
        await employeesApi.create(input, currentBranchId);
        toast.success("Employee added.");
      }
      reset();
      await reload();
      nameRef.current?.focus();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (emp: Employee) => {
    setEditing(emp);
    setName(emp.name);
    setPosition(emp.position ?? "");
    setErrors({});
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const confirmDelete = async (pin: string) => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await employeesApi.remove(pendingDelete.id, pin);
      if (editing?.id === pendingDelete.id) reset();
      toast.success("Employee deleted.");
      setPendingDelete(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || (e.position ?? "").toLowerCase().includes(q))
    : employees;

  return (
    <>
      <PageHeader title="Employees" description="The staff master list. Names here are suggested in LD Commission, Commission and Salary." />

      <form id="employees-form" noValidate onSubmit={handleSubmit} className={`card card-hover mb-6 p-6 transition-all duration-300 ${editing ? "ring-2 ring-amber-400" : ""}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? "Edit employee" : "New employee"}</h2>
          {editing && (
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              Editing · press Esc to cancel
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            ref={nameRef}
            id="employees-name"
            label="Name"
            placeholder="Full name"
            value={name}
            onChange={(v) => {
              setName(v);
              if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
            }}
            error={errors.name}
          />
          <TextInput
            id="employees-position"
            label="Position (optional)"
            placeholder="e.g. Waiter, Cashier, Cook"
            value={position}
            onChange={(v) => {
              setPosition(v);
              if (errors.position) setErrors((x) => ({ ...x, position: undefined }));
            }}
            error={errors.position}
          />
        </div>
        <div className="mt-5 flex justify-end gap-3">
          {editing && (
            <button id="employees-cancel" type="button" className="btn-secondary" onClick={reset}>
              Cancel
            </button>
          )}
          <button id="employees-submit" type="submit" className="btn-primary min-w-40" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add employee"}
          </button>
        </div>
      </form>

      <section className="card card-hover overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-500">
            {employees.length} {employees.length === 1 ? "employee" : "employees"}
          </p>
          <input
            id="employees-search"
            type="search"
            placeholder="Search name or position…"
            className="input h-10 w-72 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loadError ? (
          <div className="p-6 text-center font-medium text-rose-600">{loadError}</div>
        ) : loading && employees.length === 0 ? (
          <div className="p-10 text-center text-slate-400">Loading…</div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={employees.length === 0 ? "No employees yet" : "No matches"}
            message={employees.length === 0 ? "Add your staff using the form above." : "Try a different search."}
          />
        ) : (
          <DataTable
            idPrefix="employees"
            columns={columns}
            rows={visible}
            editingId={editing?.id ?? null}
            onEdit={startEdit}
            onDelete={setPendingDelete}
          />
        )}
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this employee?"
        message={
          pendingDelete && (
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{pendingDelete.name}</span> will be removed from the
              list. Existing commission and salary records keep the name.
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
