import { invoke } from "@tauri-apps/api/core";
import type {
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
  list(filter: DateFilter): Promise<T[]>;
  create(input: I): Promise<T>;
  update(id: number, input: I): Promise<T>;
  remove(id: number): Promise<void>;
  totals(filter: DateFilter): Promise<Totals>;
}

/** Typed wrappers for the five record modules (list_sales, create_sales, ...). */
export function recordApi<T, I>(module: ModuleKey): RecordApi<T, I> {
  return {
    list: (filter) => invoke<T[]>(`list_${module}`, { filter }),
    create: (input) => invoke<T>(`create_${module}`, { input }),
    update: (id, input) => invoke<T>(`update_${module}`, { id, input }),
    remove: (id) => invoke<void>(`delete_${module}`, { id }),
    totals: (filter) => invoke<Totals>(`totals_${module}`, { filter }),
  };
}

export const employeesApi = {
  list: () => invoke<Employee[]>("list_employees"),
  create: (input: EmployeeInput) => invoke<Employee>("create_employee", { input }),
  update: (id: number, input: EmployeeInput) => invoke<Employee>("update_employee", { id, input }),
  remove: (id: number) => invoke<void>("delete_employee", { id }),
};

export const getSuggestions = (kind: SuggestionKind) => invoke<string[]>("get_suggestions", { kind });

/** Writes a CSV file; returns the number of rows written. */
export const exportCsv = (module: ModuleKey, filter: DateFilter, path: string) =>
  invoke<number>("export_csv", { module, filter, path });

export const backupDatabase = (path: string) => invoke<void>("backup_database", { path });
