import { invoke } from "@tauri-apps/api/core";
import type {
  Branch,
  DateFilter,
  Employee,
  EmployeeInput,
  ModuleKey,
  SuggestionKind,
  Totals,
} from "../types/models";

/** Turn whatever invoke() rejected with into a readable message. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export interface RecordApi<T, I> {
  list(filter: DateFilter, branch?: string): Promise<T[]>;
  create(input: I, branch?: string): Promise<T>;
  update(id: number, input: I): Promise<T>;
  remove(id: number, pin: string): Promise<void>;
  totals(filter: DateFilter, branch?: string): Promise<Totals>;
}

/** Typed wrappers for the five record modules (list_sales, create_sales, ...). */
export function recordApi<T, I>(module: ModuleKey): RecordApi<T, I> {
  return {
    list: (filter, branch) => invoke<T[]>(`list_${module}`, { filter, branch }),
    create: (input, branch) => invoke<T>(`create_${module}`, { input, branch }),
    update: (id, input) => invoke<T>(`update_${module}`, { id, input }),
    remove: (id, pin) => invoke<void>(`delete_${module}`, { id, pin }),
    totals: (filter, branch) => invoke<Totals>(`totals_${module}`, { filter, branch }),
  };
}

export const employeesApi = {
  list: (branch?: string) => invoke<Employee[]>("list_employees", { branch }),
  create: (input: EmployeeInput, branch?: string) => invoke<Employee>("create_employee", { input, branch }),
  update: (id: number, input: EmployeeInput) => invoke<Employee>("update_employee", { id, input }),
  remove: (id: number, pin: string) => invoke<void>("delete_employee", { id, pin }),
};

export const getSuggestions = (kind: SuggestionKind, branch?: string) =>
  invoke<string[]>("get_suggestions", { kind, branch });

export const addCategory = (kind: string, name: string, branch?: string) =>
  invoke<string>("add_category", { kind, name, branch });

/** Writes a CSV file; returns the number of rows written. */
export const exportCsv = (module: ModuleKey, filter: DateFilter, path: string, branch?: string) =>
  invoke<number>("export_csv", { module, filter, path, branch });

export const backupDatabase = (path: string) => invoke<void>("backup_database", { path });

export const restoreDatabase = (path: string) => invoke<void>("restore_database", { path });

// ---------- Admin & Branch APIs ----------

export const listBranches = () => invoke<Branch[]>("list_branches");

export const getActiveBranch = () => invoke<string>("get_active_branch");

export const setActiveBranch = (branchId: string) =>
  invoke<string>("set_active_branch", { branchId });

export const createBranch = (name: string) =>
  invoke<Branch>("create_branch", { name });

export const verifyAdminPin = (pin: string) =>
  invoke<boolean>("verify_admin_pin", { pin });

export const changeAdminPin = (oldPin: string, newPin: string) =>
  invoke<void>("change_admin_pin", { oldPin, newPin });

export const resetDatabase = (branchId: string, pin: string, resetType: string) =>
  invoke<void>("reset_database", { branchId, pin, resetType });

export const deleteBranch = (branchId: string, pin: string) =>
  invoke<void>("delete_branch", { branchId, pin });
