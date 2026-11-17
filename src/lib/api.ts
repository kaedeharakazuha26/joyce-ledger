import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Branch,
  DateFilter,
  Employee,
  EmployeeInput,
  ModuleKey,
  SafetyBackupItem,
  SuggestionKind,
  SyncStatus,
  Totals,
  UserAccount,
  UserInput,
} from "../types/models";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function callBackend<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return invoke<T>(cmd, args);
  }
  const res = await fetch("/api/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd, args: args ?? {} }),
  });
  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    error?: string;
    emit?: string[];
  } | null;
  if (!res.ok || !payload || payload.ok === false) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  if (Array.isArray(payload.emit)) {
    for (const ev of payload.emit) {
      window.dispatchEvent(new CustomEvent(ev));
    }
  }
  return payload.result as T;
}

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
    list: (filter, branch) => callBackend<T[]>(`list_${module}`, { filter, branch }),
    create: (input, branch) => callBackend<T>(`create_${module}`, { input, branch }),
    update: (id, input) => callBackend<T>(`update_${module}`, { id, input }),
    remove: (id, pin) => callBackend<void>(`delete_${module}`, { id, pin }),
    totals: (filter, branch) => callBackend<Totals>(`totals_${module}`, { filter, branch }),
  };
}

export const employeesApi = {
  list: (branch?: string) => callBackend<Employee[]>("list_employees", { branch }),
  create: (input: EmployeeInput, branch?: string) => callBackend<Employee>("create_employee", { input, branch }),
  update: (id: number, input: EmployeeInput) => callBackend<Employee>("update_employee", { id, input }),
  remove: (id: number, pin: string) => callBackend<void>("delete_employee", { id, pin }),
};

export const getSuggestions = (kind: SuggestionKind, branch?: string) =>
  callBackend<string[]>("get_suggestions", { kind, branch });

export const addCategory = (kind: string, name: string, branch?: string) =>
  callBackend<string>("add_category", { kind, name, branch });

/** Writes a CSV file; returns the number of rows written. */
export const exportCsv = (module: ModuleKey, filter: DateFilter, path: string, branch?: string) =>
  callBackend<number>("export_csv", { module, filter, path, branch });

export const backupDatabase = (path: string) => callBackend<void>("backup_database", { path });

export const restoreDatabase = (path: string, pin?: string) =>
  callBackend<void>("restore_database", { path, pin });

// ---------- Admin & Branch APIs ----------

export const listBranches = () => callBackend<Branch[]>("list_branches");

export const getActiveBranch = () => callBackend<string>("get_active_branch");

export const setActiveBranch = (branchId: string) =>
  callBackend<string>("set_active_branch", { branchId });

export const createBranch = (name: string) =>
  callBackend<Branch>("create_branch", { name });

export const verifyAdminPin = (pin: string) =>
  callBackend<boolean>("verify_admin_pin", { pin });

export const changeAdminPin = (oldPin: string, newPin: string) =>
  callBackend<void>("change_admin_pin", { oldPin, newPin });

export const resetDatabase = (branchId: string, pin: string, resetType: string) =>
  callBackend<void>("reset_database", { branchId, pin, resetType });

export const deleteBranch = (branchId: string, pin: string) =>
  callBackend<void>("delete_branch", { branchId, pin });

export const updateBranch = (branchId: string, name: string) =>
  callBackend<Branch>("update_branch", { branchId, name });

// ---------- Cloud Sync (Turso) & Device Identity APIs ----------

export const getSyncSettings = () => callBackend<SyncStatus>("get_sync_settings");

export const saveDeviceName = (deviceName: string) =>
  callBackend<SyncStatus>("save_device_name", { deviceName });

export const testTursoConnection = (tursoUrl: string, tursoToken: string) =>
  callBackend<string>("test_turso_connection", { tursoUrl, tursoToken });

export const saveTursoSettings = (tursoUrl: string, tursoToken: string, pin: string) =>
  callBackend<SyncStatus>("save_turso_settings", { tursoUrl, tursoToken, pin });

export const syncNow = () => callBackend<SyncStatus>("sync_now");

export const disconnectTurso = (pin: string) =>
  callBackend<SyncStatus>("disconnect_turso", { pin });

// ---------- Multi-User Accounts, PINs & Safety Snapshots ----------

export const loginWithPin = (pin: string) =>
  callBackend<UserAccount>("login_with_pin", { pin });

export const listUsers = () => callBackend<UserAccount[]>("list_users");

export const createUser = (input: UserInput, adminPin: string) =>
  callBackend<UserAccount>("create_user", { input, adminPin });

export const updateUser = (id: number, input: UserInput, adminPin: string) =>
  callBackend<UserAccount>("update_user", { id, input, adminPin });

export const deleteUser = (id: number, adminPin: string) =>
  callBackend<void>("delete_user", { id, adminPin });

export const listSafetyBackups = () =>
  callBackend<SafetyBackupItem[]>("list_safety_backups");

export const restoreSafetyBackup = (filename: string, pin: string) =>
  callBackend<void>("restore_safety_backup", { filename, pin });

/** Subscribe to Tauri backend sync events (`sync-updated` or `sync-status`) safely. */
export function onSyncEvent(eventName: "sync-updated" | "sync-status", handler: () => void): () => void {
  if (!isTauri()) {
    const listener = () => handler();
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }

  let cancelled = false;
  let unlistenFn: (() => void) | undefined;

  void listen(eventName, () => {
    if (!cancelled) handler();
  })
    .then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    })
    .catch(() => {
      // Ignore if running outside Tauri webview
    });

  return () => {
    cancelled = true;
    if (unlistenFn) unlistenFn();
  };
}
