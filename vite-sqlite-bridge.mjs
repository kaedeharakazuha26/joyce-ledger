import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function openDatabase(customDbPath) {
  const dbPath = customDbPath ? path.resolve(customDbPath) : path.resolve(process.cwd(), "joyce_restobar_ledger.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");

  const migrationsSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src-tauri/src/db/migrations.rs"),
    "utf8",
  );
  const migrations = [...migrationsSrc.matchAll(/r#"([\s\S]*?)"#/g)].map((m) => m[1]);
  const currentVersion = Number(db.prepare("PRAGMA user_version").get().user_version || 0);
  for (let i = currentVersion; i < migrations.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(migrations[i]);
      db.exec(`PRAGMA user_version = ${i + 1};`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  ensureDeviceName(db);
  return db;
}

function getLocalSetting(db, key) {
  const row = db.prepare("SELECT value FROM local_settings WHERE key = ?").get(key);
  return row ? String(row.value) : "";
}

function setLocalSetting(db, key, value) {
  db.prepare(
    "INSERT INTO local_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(key, String(value));
}

function ensureDeviceName(db) {
  const cur = getLocalSetting(db, "device_name").trim();
  if (cur) return cur;
  const host = (os.hostname() || "Restobar-Laptop").slice(0, 60);
  setLocalSetting(db, "device_name", host);
  return host;
}

function maskToken(token) {
  const t = token.trim();
  if (!t) return "";
  if (t.length <= 10) return "••••••••";
  return `${t.slice(0, 4)}••••••${t.slice(-4)}`;
}

function normalizeTursoUrl(raw) {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Turso Database URL is required.");
  const httpsBase = trimmed.startsWith("libsql://")
    ? `https://${trimmed.slice("libsql://".length)}`
    : trimmed.startsWith("https://") || trimmed.startsWith("http://")
      ? trimmed
      : `https://${trimmed}`;
  return httpsBase.endsWith("/v2/pipeline") ? httpsBase : `${httpsBase}/v2/pipeline`;
}

function checkPin(db, pin) {
  const clean = String(pin || "").trim();
  if (!clean) throw new Error("PIN code is required.");
  const u = db
    .prepare("SELECT name, can_delete_records, can_manage_settings FROM app_users WHERE pin = ?")
    .get(clean);
  if (u) {
    if (Number(u.can_delete_records) !== 0 || Number(u.can_manage_settings) !== 0) return;
    throw new Error(`User "${u.name}" does not have Delete permission. Ask a Manager or Owner to enter their PIN.`);
  }
  const cnt = Number(db.prepare("SELECT COUNT(*) as c FROM app_users").get().c || 0);
  if (cnt === 0) {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_pin'").get();
    if (clean === String(row ? row.value : "0000").trim()) return;
  }
  throw new Error("Incorrect PIN code.");
}

function checkAdminSettingsPin(db, pin) {
  const clean = String(pin || "").trim();
  if (!clean) throw new Error("Owner / Admin PIN code is required.");
  const u = db.prepare("SELECT name, can_manage_settings FROM app_users WHERE pin = ?").get(clean);
  if (u) {
    if (Number(u.can_manage_settings) !== 0) return;
    throw new Error(`User "${u.name}" does not have Owner / Admin Settings permission.`);
  }
  throw new Error("Incorrect Owner / Admin PIN code.");
}

function setAdminPinSetting(db, pin) {
  const res = db
    .prepare("UPDATE app_settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = 'admin_pin'")
    .run(pin);
  if (res.changes === 0) {
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?, datetime('now','localtime'))").run(pin);
  }
}

function mapUserRow(r) {
  return {
    id: Number(r.id),
    name: String(r.name),
    pin: String(r.pin),
    role: String(r.role),
    assignedBranchId: r.assigned_branch_id ? String(r.assigned_branch_id) : null,
    canViewDashboard: Number(r.can_view_dashboard) !== 0,
    canAddRecords: Number(r.can_add_records) !== 0,
    canEditRecords: Number(r.can_edit_records) !== 0,
    canDeleteRecords: Number(r.can_delete_records) !== 0,
    canManageEmployees: Number(r.can_manage_employees) !== 0,
    canManageBranches: Number(r.can_manage_branches) !== 0,
    canManageSettings: Number(r.can_manage_settings) !== 0,
    createdAt: String(r.created_at),
  };
}

function getBackupDir(customDbPath) {
  const base = customDbPath ? path.dirname(path.resolve(customDbPath)) : process.cwd();
  return path.join(base, "safety_backups");
}

function createAutoSafetyBackup(db, backupDir, reason) {
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = db.prepare("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime') as t").get().t;
  const cleanReason = String(reason || "snapshot").replace(/[^a-zA-Z0-9_]/g, "_");
  let filename = `auto_${cleanReason}_${ts}.db`;
  let dest = path.join(backupDir, filename);
  if (fs.existsSync(dest)) {
    filename = `auto_${cleanReason}_${ts}_${Date.now()}.db`;
    dest = path.join(backupDir, filename);
  }
  db.prepare("VACUUM INTO ?").run(dest);
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.toLowerCase().endsWith(".db"))
    .map((f) => ({ f, m: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const old of files.slice(12)) {
    try {
      fs.unlinkSync(path.join(backupDir, old.f));
    } catch {}
  }
  return filename;
}

function requireText(field, v) {
  const s = String(v || "").trim();
  if (!s) throw new Error(`${field} is required.`);
  if (s.length > 120) throw new Error(`${field} must be 120 characters or fewer.`);
  return s;
}

function requireAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) throw new Error("Amount must be greater than 0.");
  return Math.round(v);
}

function requireQuantity(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) throw new Error("Quantity must be 1 or more.");
  return v;
}

function requireDate(v) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Date must be a valid date (YYYY-MM-DD).");
  return s;
}

function activeBranch(db, explicit) {
  if (explicit) return explicit;
  return getLocalSetting(db, "active_branch") || "main";
}

function getSyncStatus(db) {
  const deviceName = ensureDeviceName(db);
  const tursoUrl = getLocalSetting(db, "turso_url");
  const tursoToken = getLocalSetting(db, "turso_token");
  const syncEnabled = getLocalSetting(db, "sync_enabled") === "1" && !!tursoUrl.trim() && !!tursoToken.trim();
  const pendingChanges = Number(db.prepare("SELECT COUNT(*) as c FROM sync_outbox").get().c || 0);
  const lastSyncAt = getLocalSetting(db, "last_sync_at").trim() || null;
  const lastSyncError = getLocalSetting(db, "last_sync_error").trim() || null;
  return {
    deviceName,
    tursoUrl,
    tursoTokenMasked: maskToken(tursoToken),
    hasToken: !!tursoToken.trim(),
    syncEnabled,
    pendingChanges,
    lastSyncAt,
    lastSyncError,
  };
}

async function sendTursoPipeline(url, token, requests) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: [...requests, { type: "close" }] }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Turso HTTP ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  for (const r of data.results || []) {
    if (r.type === "error") {
      throw new Error(r.error?.message || "Unknown Turso SQL error");
    }
  }
  return data.results || [];
}

function hranaArg(val) {
  if (val === null || val === undefined) return { type: "null" };
  if (typeof val === "number") return { type: "integer", value: String(Math.trunc(val)) };
  return { type: "text", value: String(val) };
}

function hranaStmt(sql, args = []) {
  return { type: "execute", stmt: { sql, args: args.map(hranaArg) } };
}

function queueAllLocalRecords(db) {
  db.exec(`
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'branches', sync_id, 'UPSERT', id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM branches
      WHERE sync_id IS NOT NULL
        AND NOT (
          (id = 'main' AND name = 'Main Branch' AND updated_at = created_at)
          OR (id = 'branch_2' AND name = 'Branch 2' AND updated_at = created_at)
        );
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'categories', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM categories
      WHERE sync_id IS NOT NULL
        AND NOT (
          branch_id IN ('main', 'branch_2')
          AND updated_at = created_at
          AND name IN (
            'Food','Drinks','Beer','Liquor','Cocktails','Cigarettes','Others',
            'Kitchen Supplies','Meat & Seafood','Produce & Groceries','Beverages & Ice',
            'Gas & LPG','Utilities','Maintenance','Packaging',
            'Bottle','Table','VIP','Service'
          )
        );
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'employees', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM employees WHERE sync_id IS NOT NULL;
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'sales', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM sales WHERE sync_id IS NOT NULL;
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'expenses', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM expenses WHERE sync_id IS NOT NULL;
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'ld_commissions', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM ld_commissions WHERE sync_id IS NOT NULL;
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'commissions', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM commissions WHERE sync_id IS NOT NULL;
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'salaries', sync_id, 'UPSERT', branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM salaries WHERE sync_id IS NOT NULL;
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'app_settings', 'admin_pin', 'UPSERT', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM app_settings WHERE key = 'admin_pin' AND value != '0000';
    INSERT OR IGNORE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'app_users', sync_id, 'UPSERT', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM app_users
      WHERE sync_id IS NOT NULL
        AND NOT (sync_id = 'user:owner' AND pin = '0000' AND updated_at = created_at);
  `);
}

const INITIALIZED_TURSO_URLS = new Set();

async function ensureRemoteSchemaOnce(pipelineUrl, token) {
  if (INITIALIZED_TURSO_URLS.has(pipelineUrl)) return;
  await sendTursoPipeline(pipelineUrl, token, [
    hranaStmt(`CREATE TABLE IF NOT EXISTS turso_sync_log (seq INTEGER PRIMARY KEY, table_name TEXT NOT NULL, sync_id TEXT NOT NULL, op TEXT NOT NULL, branch_id TEXT NOT NULL, payload TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS branches (sync_id TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS categories (sync_id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS employees (sync_id TEXT PRIMARY KEY, name TEXT NOT NULL, position TEXT, base_salary INTEGER NOT NULL DEFAULT 0, commission INTEGER NOT NULL DEFAULT 0, ld_commission INTEGER NOT NULL DEFAULT 0, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS sales (sync_id TEXT PRIMARY KEY, category TEXT NOT NULL, amount INTEGER NOT NULL, sale_date TEXT NOT NULL, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS expenses (sync_id TEXT PRIMARY KEY, category TEXT NOT NULL, amount INTEGER NOT NULL, expense_date TEXT NOT NULL, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS ld_commissions (sync_id TEXT PRIMARY KEY, name TEXT NOT NULL, quantity INTEGER NOT NULL, amount INTEGER NOT NULL, commission_date TEXT NOT NULL, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS commissions (sync_id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL, commission_date TEXT NOT NULL, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS salaries (sync_id TEXT PRIMARY KEY, name TEXT NOT NULL, amount INTEGER NOT NULL, salary_date TEXT NOT NULL, branch_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    hranaStmt(`CREATE TABLE IF NOT EXISTS app_users (sync_id TEXT PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL, role TEXT NOT NULL, assigned_branch_id TEXT, can_view_dashboard INTEGER NOT NULL DEFAULT 0, can_add_records INTEGER NOT NULL DEFAULT 1, can_edit_records INTEGER NOT NULL DEFAULT 0, can_delete_records INTEGER NOT NULL DEFAULT 0, can_manage_employees INTEGER NOT NULL DEFAULT 0, can_manage_branches INTEGER NOT NULL DEFAULT 0, can_manage_settings INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '')`),
  ]);
  INITIALIZED_TURSO_URLS.add(pipelineUrl);
}

async function runTursoSyncCycle(db) {
  const enabled = getLocalSetting(db, "sync_enabled") === "1";
  const rawUrl = getLocalSetting(db, "turso_url");
  const token = getLocalSetting(db, "turso_token");
  if (!enabled || !rawUrl.trim() || !token.trim()) return { pushed: 0, pulled: 0 };

  const pipelineUrl = normalizeTursoUrl(rawUrl);

  try {
    await ensureRemoteSchemaOnce(pipelineUrl, token);

    let totalPushed = 0;
    let totalPulled = 0;

    for (let round = 0; round < 30; round++) {
      const lastCursor = Number(getLocalSetting(db, "last_sync_cursor") || "0");
      const outbox = db.prepare("SELECT table_name, sync_id, op, branch_id, changed_at FROM sync_outbox LIMIT 50").all();
      const deviceFallback = ensureDeviceName(db);
      if (outbox.length > 0) {
        const stmts = [];
        for (const item of outbox) {
          let payload = {};
          let updatedAt = item.changed_at;
          let deviceName = deviceFallback;
          if (item.op !== "DELETE") {
            const row =
              item.table_name === "app_settings"
                ? db.prepare("SELECT key, value, updated_at FROM app_settings WHERE key='admin_pin'").get()
                : db.prepare(`SELECT * FROM ${item.table_name} WHERE sync_id = ?`).get(item.sync_id);
            if (row) {
              payload = { ...row };
              updatedAt = row.updated_at || item.changed_at;
              deviceName = row.device_name || deviceFallback;
            }
          }
          stmts.push(
            hranaStmt(
              "INSERT INTO turso_sync_log (table_name, sync_id, op, branch_id, payload, device_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [item.table_name, item.sync_id, item.op, item.branch_id, JSON.stringify(payload), deviceName, updatedAt],
            ),
          );
        }
        await sendTursoPipeline(pipelineUrl, token, stmts);
        for (const item of outbox) {
          db.prepare("DELETE FROM sync_outbox WHERE table_name=? AND sync_id=? AND changed_at <= ?").run(
            item.table_name,
            item.sync_id,
            item.changed_at,
          );
        }
        totalPushed += outbox.length;
      }

      const pullRes = await sendTursoPipeline(pipelineUrl, token, [
        hranaStmt(
          "SELECT seq, table_name, sync_id, op, branch_id, payload, device_name, updated_at FROM turso_sync_log WHERE seq > ? ORDER BY seq ASC LIMIT 400",
          [lastCursor],
        ),
      ]);
      const rows = pullRes[0]?.response?.result?.rows || [];
      let maxSeq = lastCursor;
      let pulled = 0;
      if (rows.length > 0) {
        db.exec("BEGIN");
        setLocalSetting(db, "sync_applying_remote", "1");
        try {
          for (const r of rows) {
            const seq = Number(r[0]?.value || 0);
            if (seq > maxSeq) maxSeq = seq;
            const table = String(r[1]?.value || "");
            const syncId = String(r[2]?.value || "");
            const op = String(r[3]?.value || "");
            const payload = JSON.parse(String(r[5]?.value || "{}"));
            const deviceName = String(r[6]?.value || "");
            const updatedAt = String(r[7]?.value || "");

            const hasPending = Number(
              db.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE table_name = ? AND sync_id = ?").get(table, syncId)?.c || 0,
            );
            if (hasPending > 0) continue;

            if (op === "DELETE") {
              if ((table !== "branches" || syncId !== "branch:main") && (table !== "app_users" || syncId !== "user:owner")) {
                db.prepare(`DELETE FROM ${table} WHERE sync_id = ?`).run(syncId);
              }
              pulled++;
              continue;
            }
            if (table === "sales") {
              db.prepare("INSERT INTO sales (category, amount, sale_date, branch_id, created_at, updated_at, sync_id, device_name) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET category=excluded.category, amount=excluded.amount, sale_date=excluded.sale_date, branch_id=excluded.branch_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.category, Number(payload.amount), payload.sale_date, payload.branch_id, payload.created_at, updatedAt, syncId, deviceName);
              pulled++;
            } else if (table === "expenses") {
              db.prepare("INSERT INTO expenses (category, amount, expense_date, branch_id, created_at, updated_at, sync_id, device_name) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET category=excluded.category, amount=excluded.amount, expense_date=excluded.expense_date, branch_id=excluded.branch_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.category, Number(payload.amount), payload.expense_date, payload.branch_id, payload.created_at, updatedAt, syncId, deviceName);
              pulled++;
            } else if (table === "ld_commissions") {
              db.prepare("INSERT INTO ld_commissions (name, quantity, amount, commission_date, branch_id, created_at, updated_at, sync_id, device_name) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name, quantity=excluded.quantity, amount=excluded.amount, commission_date=excluded.commission_date, branch_id=excluded.branch_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.name, Number(payload.quantity), Number(payload.amount), payload.commission_date, payload.branch_id, payload.created_at, updatedAt, syncId, deviceName);
              pulled++;
            } else if (table === "commissions") {
              db.prepare("INSERT INTO commissions (name, category, amount, commission_date, branch_id, created_at, updated_at, sync_id, device_name) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name, category=excluded.category, amount=excluded.amount, commission_date=excluded.commission_date, branch_id=excluded.branch_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.name, payload.category, Number(payload.amount), payload.commission_date, payload.branch_id, payload.created_at, updatedAt, syncId, deviceName);
              pulled++;
            } else if (table === "salaries") {
              db.prepare("INSERT INTO salaries (name, amount, salary_date, branch_id, created_at, updated_at, sync_id, device_name) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name, amount=excluded.amount, salary_date=excluded.salary_date, branch_id=excluded.branch_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.name, Number(payload.amount), payload.salary_date, payload.branch_id, payload.created_at, updatedAt, syncId, deviceName);
              pulled++;
            } else if (table === "employees") {
              const exists = db.prepare("SELECT COUNT(*) as c FROM employees WHERE sync_id = ?").get(syncId).c;
              if (!exists) {
                db.prepare("UPDATE employees SET sync_id = ? WHERE branch_id = ? AND lower(name) = lower(?)").run(syncId, payload.branch_id, payload.name);
              } else {
                db.prepare("DELETE FROM employees WHERE branch_id = ? AND lower(name) = lower(?) AND sync_id != ?").run(payload.branch_id, payload.name, syncId);
              }
              db.prepare("INSERT INTO employees (name, position, base_salary, commission, ld_commission, branch_id, created_at, sync_id, updated_at, device_name) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name, position=excluded.position, base_salary=excluded.base_salary, commission=excluded.commission, ld_commission=excluded.ld_commission, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.name, payload.position ?? null, Number(payload.base_salary || 0), Number(payload.commission || 0), Number(payload.ld_commission || 0), payload.branch_id, payload.created_at, syncId, updatedAt, deviceName);
              pulled++;
            } else if (table === "categories") {
              const exists = db.prepare("SELECT COUNT(*) as c FROM categories WHERE sync_id = ?").get(syncId).c;
              if (!exists) {
                db.prepare("UPDATE categories SET sync_id = ? WHERE kind = ? AND lower(name) = lower(?) AND branch_id = ?").run(syncId, payload.kind, payload.name, payload.branch_id);
              }
              db.prepare("INSERT INTO categories (kind, name, branch_id, created_at, sync_id, updated_at, device_name) VALUES (?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET kind=excluded.kind, name=excluded.name, branch_id=excluded.branch_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.kind, payload.name, payload.branch_id, payload.created_at, syncId, updatedAt, deviceName);
              pulled++;
            } else if (table === "branches") {
              db.prepare("INSERT INTO branches (id, name, created_at, sync_id, updated_at, device_name) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, sync_id=excluded.sync_id, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(payload.id, payload.name, payload.created_at, syncId, updatedAt, deviceName);
              pulled++;
            } else if (table === "app_settings" && syncId === "admin_pin") {
              db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
                .run(payload.value, updatedAt);
              pulled++;
            } else if (table === "app_users") {
              db.prepare("DELETE FROM app_users WHERE pin = ? AND sync_id != ? AND sync_id != 'user:owner'").run(payload.pin, syncId);
              db.prepare("INSERT INTO app_users (name, pin, role, assigned_branch_id, can_view_dashboard, can_add_records, can_edit_records, can_delete_records, can_manage_employees, can_manage_branches, can_manage_settings, created_at, updated_at, sync_id, device_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name, pin=excluded.pin, role=excluded.role, assigned_branch_id=excluded.assigned_branch_id, can_view_dashboard=excluded.can_view_dashboard, can_add_records=excluded.can_add_records, can_edit_records=excluded.can_edit_records, can_delete_records=excluded.can_delete_records, can_manage_employees=excluded.can_manage_employees, can_manage_branches=excluded.can_manage_branches, can_manage_settings=excluded.can_manage_settings, updated_at=excluded.updated_at, device_name=excluded.device_name")
                .run(
                  payload.name,
                  payload.pin,
                  payload.role || "cashier",
                  payload.assigned_branch_id ?? null,
                  Number(payload.can_view_dashboard || 0),
                  Number(payload.can_add_records || 0),
                  Number(payload.can_edit_records || 0),
                  Number(payload.can_delete_records || 0),
                  Number(payload.can_manage_employees || 0),
                  Number(payload.can_manage_branches || 0),
                  Number(payload.can_manage_settings || 0),
                  payload.created_at,
                  updatedAt,
                  syncId,
                  deviceName,
                );
              if (syncId === "user:owner") {
                db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
                  .run(payload.pin, updatedAt);
              }
              pulled++;
            }
          }
          setLocalSetting(db, "last_sync_cursor", String(maxSeq));
          setLocalSetting(db, "sync_applying_remote", "0");
          db.exec("COMMIT");
        } catch (e) {
          setLocalSetting(db, "sync_applying_remote", "0");
          db.exec("ROLLBACK");
          throw e;
        }
      }
      totalPulled += pulled;
      const remaining = Number(db.prepare("SELECT COUNT(*) as c FROM sync_outbox").get().c || 0);
      if (remaining === 0 && rows.length < 400) break;
    }

    const nowTs = db.prepare("SELECT datetime('now','localtime') as t").get().t;
    setLocalSetting(db, "last_sync_at", nowTs);
    setLocalSetting(db, "last_sync_error", "");
    return { pushed: totalPushed, pulled: totalPulled };
  } catch (e) {
    setLocalSetting(db, "last_sync_error", e.message || String(e));
    throw e;
  }
}

export function createSqliteMiddleware(customDbPath) {
  const db = openDatabase(customDbPath);
  const backupDir = getBackupDir(customDbPath);

  async function dispatch(cmd, args = {}) {
    const emit = [];
    const branchId = activeBranch(db, args.branch);
    const filter = args.filter || { from: null, to: null };
    const from = filter.from || null;
    const to = filter.to || null;

    switch (cmd) {
      case "list_sales":
        return {
          result: db
            .prepare(
              "SELECT id, category, amount, sale_date as date, created_at as createdAt, updated_at as updatedAt FROM sales WHERE (? IS NULL OR sale_date >= ?) AND (? IS NULL OR sale_date <= ?) AND branch_id = ? ORDER BY sale_date DESC, id DESC",
            )
            .all(from, from, to, to, branchId),
        };
      case "create_sales": {
        const cat = requireText("Category", args.input?.category);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        const r = db.prepare("INSERT INTO sales (category, amount, sale_date, branch_id) VALUES (?, ?, ?, ?)").run(cat, amt, dt, branchId);
        emit.push("sync-status");
        return {
          emit,
          result: db.prepare("SELECT id, category, amount, sale_date as date, created_at as createdAt, updated_at as updatedAt FROM sales WHERE id = ?").get(Number(r.lastInsertRowid)),
        };
      }
      case "update_sales": {
        const cat = requireText("Category", args.input?.category);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        db.prepare("UPDATE sales SET category=?, amount=?, sale_date=?, updated_at=datetime('now','localtime') WHERE id=?").run(cat, amt, dt, args.id);
        emit.push("sync-status");
        return {
          emit,
          result: db.prepare("SELECT id, category, amount, sale_date as date, created_at as createdAt, updated_at as updatedAt FROM sales WHERE id = ?").get(args.id),
        };
      }
      case "delete_sales":
        checkPin(db, args.pin);
        db.prepare("DELETE FROM sales WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };
      case "totals_sales":
        return {
          result: db
            .prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, 0 as quantity FROM sales WHERE (? IS NULL OR sale_date >= ?) AND (? IS NULL OR sale_date <= ?) AND branch_id = ?")
            .get(from, from, to, to, branchId),
        };

      case "list_expenses":
        return {
          result: db
            .prepare(
              "SELECT id, category, amount, expense_date as date, created_at as createdAt, updated_at as updatedAt FROM expenses WHERE (? IS NULL OR expense_date >= ?) AND (? IS NULL OR expense_date <= ?) AND branch_id = ? ORDER BY expense_date DESC, id DESC",
            )
            .all(from, from, to, to, branchId),
        };
      case "create_expenses": {
        const cat = requireText("Category", args.input?.category);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        const r = db.prepare("INSERT INTO expenses (category, amount, expense_date, branch_id) VALUES (?, ?, ?, ?)").run(cat, amt, dt, branchId);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, category, amount, expense_date as date, created_at as createdAt, updated_at as updatedAt FROM expenses WHERE id = ?").get(Number(r.lastInsertRowid)),
        };
      }
      case "update_expenses": {
        const cat = requireText("Category", args.input?.category);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        db.prepare("UPDATE expenses SET category=?, amount=?, expense_date=?, updated_at=datetime('now','localtime') WHERE id=?").run(cat, amt, dt, args.id);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, category, amount, expense_date as date, created_at as createdAt, updated_at as updatedAt FROM expenses WHERE id = ?").get(args.id),
        };
      }
      case "delete_expenses":
        checkPin(db, args.pin);
        db.prepare("DELETE FROM expenses WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };
      case "totals_expenses":
        return {
          result: db
            .prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, 0 as quantity FROM expenses WHERE (? IS NULL OR expense_date >= ?) AND (? IS NULL OR expense_date <= ?) AND branch_id = ?")
            .get(from, from, to, to, branchId),
        };

      case "list_ld_commissions":
        return {
          result: db
            .prepare(
              "SELECT id, name, quantity, amount, commission_date as date, created_at as createdAt, updated_at as updatedAt FROM ld_commissions WHERE (? IS NULL OR commission_date >= ?) AND (? IS NULL OR commission_date <= ?) AND branch_id = ? ORDER BY commission_date DESC, id DESC",
            )
            .all(from, from, to, to, branchId),
        };
      case "create_ld_commissions": {
        const name = requireText("Name", args.input?.name);
        const qty = requireQuantity(args.input?.quantity);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        const r = db.prepare("INSERT INTO ld_commissions (name, quantity, amount, commission_date, branch_id) VALUES (?, ?, ?, ?, ?)").run(name, qty, amt, dt, branchId);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, quantity, amount, commission_date as date, created_at as createdAt, updated_at as updatedAt FROM ld_commissions WHERE id = ?").get(Number(r.lastInsertRowid)),
        };
      }
      case "update_ld_commissions": {
        const name = requireText("Name", args.input?.name);
        const qty = requireQuantity(args.input?.quantity);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        db.prepare("UPDATE ld_commissions SET name=?, quantity=?, amount=?, commission_date=?, updated_at=datetime('now','localtime') WHERE id=?").run(name, qty, amt, dt, args.id);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, quantity, amount, commission_date as date, created_at as createdAt, updated_at as updatedAt FROM ld_commissions WHERE id = ?").get(args.id),
        };
      }
      case "delete_ld_commissions":
        checkPin(db, args.pin);
        db.prepare("DELETE FROM ld_commissions WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };
      case "totals_ld_commissions":
        return {
          result: db
            .prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, COALESCE(SUM(quantity), 0) as quantity FROM ld_commissions WHERE (? IS NULL OR commission_date >= ?) AND (? IS NULL OR commission_date <= ?) AND branch_id = ?")
            .get(from, from, to, to, branchId),
        };

      case "list_commissions":
        return {
          result: db
            .prepare(
              "SELECT id, name, category, amount, commission_date as date, created_at as createdAt, updated_at as updatedAt FROM commissions WHERE (? IS NULL OR commission_date >= ?) AND (? IS NULL OR commission_date <= ?) AND branch_id = ? ORDER BY commission_date DESC, id DESC",
            )
            .all(from, from, to, to, branchId),
        };
      case "create_commissions": {
        const name = requireText("Name", args.input?.name);
        const cat = requireText("Category", args.input?.category);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        const r = db.prepare("INSERT INTO commissions (name, category, amount, commission_date, branch_id) VALUES (?, ?, ?, ?, ?)").run(name, cat, amt, dt, branchId);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, category, amount, commission_date as date, created_at as createdAt, updated_at as updatedAt FROM commissions WHERE id = ?").get(Number(r.lastInsertRowid)),
        };
      }
      case "update_commissions": {
        const name = requireText("Name", args.input?.name);
        const cat = requireText("Category", args.input?.category);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        db.prepare("UPDATE commissions SET name=?, category=?, amount=?, commission_date=?, updated_at=datetime('now','localtime') WHERE id=?").run(name, cat, amt, dt, args.id);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, category, amount, commission_date as date, created_at as createdAt, updated_at as updatedAt FROM commissions WHERE id = ?").get(args.id),
        };
      }
      case "delete_commissions":
        checkPin(db, args.pin);
        db.prepare("DELETE FROM commissions WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };
      case "totals_commissions":
        return {
          result: db
            .prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, 0 as quantity FROM commissions WHERE (? IS NULL OR commission_date >= ?) AND (? IS NULL OR commission_date <= ?) AND branch_id = ?")
            .get(from, from, to, to, branchId),
        };

      case "list_salaries":
        return {
          result: db
            .prepare(
              "SELECT id, name, amount, salary_date as date, created_at as createdAt, updated_at as updatedAt FROM salaries WHERE (? IS NULL OR salary_date >= ?) AND (? IS NULL OR salary_date <= ?) AND branch_id = ? ORDER BY salary_date DESC, id DESC",
            )
            .all(from, from, to, to, branchId),
        };
      case "create_salaries": {
        const name = requireText("Name", args.input?.name);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        const r = db.prepare("INSERT INTO salaries (name, amount, salary_date, branch_id) VALUES (?, ?, ?, ?)").run(name, amt, dt, branchId);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, amount, salary_date as date, created_at as createdAt, updated_at as updatedAt FROM salaries WHERE id = ?").get(Number(r.lastInsertRowid)),
        };
      }
      case "update_salaries": {
        const name = requireText("Name", args.input?.name);
        const amt = requireAmount(args.input?.amount);
        const dt = requireDate(args.input?.date);
        db.prepare("UPDATE salaries SET name=?, amount=?, salary_date=?, updated_at=datetime('now','localtime') WHERE id=?").run(name, amt, dt, args.id);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, amount, salary_date as date, created_at as createdAt, updated_at as updatedAt FROM salaries WHERE id = ?").get(args.id),
        };
      }
      case "delete_salaries":
        checkPin(db, args.pin);
        db.prepare("DELETE FROM salaries WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };
      case "totals_salaries":
        return {
          result: db
            .prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, 0 as quantity FROM salaries WHERE (? IS NULL OR salary_date >= ?) AND (? IS NULL OR salary_date <= ?) AND branch_id = ?")
            .get(from, from, to, to, branchId),
        };

      case "list_employees":
        return {
          result: db
            .prepare("SELECT id, name, position, base_salary as baseSalary, commission, ld_commission as ldCommission, created_at as createdAt FROM employees WHERE branch_id = ? ORDER BY name COLLATE NOCASE, id")
            .all(branchId),
        };
      case "create_employee": {
        const name = requireText("Name", args.input?.name);
        const pos = String(args.input?.position || "").trim() || null;
        const r = db
          .prepare("INSERT INTO employees (name, position, base_salary, commission, ld_commission, branch_id) VALUES (?, ?, ?, ?, ?, ?)")
          .run(name, pos, Number(args.input?.baseSalary || 0), Number(args.input?.commission || 0), Number(args.input?.ldCommission || 0), branchId);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, position, base_salary as baseSalary, commission, ld_commission as ldCommission, created_at as createdAt FROM employees WHERE id = ?").get(Number(r.lastInsertRowid)),
        };
      }
      case "update_employee": {
        const name = requireText("Name", args.input?.name);
        const pos = String(args.input?.position || "").trim() || null;
        db.prepare("UPDATE employees SET name=?, position=?, base_salary=?, commission=?, ld_commission=? WHERE id=?")
          .run(name, pos, Number(args.input?.baseSalary || 0), Number(args.input?.commission || 0), Number(args.input?.ldCommission || 0), args.id);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, position, base_salary as baseSalary, commission, ld_commission as ldCommission, created_at as createdAt FROM employees WHERE id = ?").get(args.id),
        };
      }
      case "delete_employee":
        checkPin(db, args.pin);
        db.prepare("DELETE FROM employees WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };

      case "get_suggestions": {
        const queries = {
          salesCategory: "SELECT name FROM categories WHERE kind='sales' AND branch_id=? UNION SELECT category FROM sales WHERE branch_id=? ORDER BY 1 COLLATE NOCASE",
          expensesCategory: "SELECT name FROM categories WHERE kind='expenses' AND branch_id=? UNION SELECT category FROM expenses WHERE branch_id=? ORDER BY 1 COLLATE NOCASE",
          commissionsCategory: "SELECT name FROM categories WHERE kind='commissions' AND branch_id=? UNION SELECT category FROM commissions WHERE branch_id=? ORDER BY 1 COLLATE NOCASE",
          names: "SELECT name FROM employees WHERE branch_id=? UNION SELECT name FROM ld_commissions WHERE branch_id=? UNION SELECT name FROM commissions WHERE branch_id=? UNION SELECT name FROM salaries WHERE branch_id=? ORDER BY 1 COLLATE NOCASE",
        };
        const sql = queries[args.kind];
        if (!sql) throw new Error(`Unknown suggestion type: ${args.kind}`);
        const count = args.kind === "names" ? 4 : 2;
        const rows = db.prepare(sql).all(...Array(count).fill(branchId));
        const out = [];
        for (const r of rows) {
          if (!out.some((x) => x.toLowerCase() === r.name.toLowerCase())) out.push(r.name);
        }
        return { result: out };
      }
      case "add_category": {
        const trimmed = requireText("Category", args.name);
        const kind = args.kind.replace("Category", "");
        db.prepare("INSERT OR IGNORE INTO categories (kind, name, branch_id) VALUES (?, ?, ?)").run(kind, trimmed, branchId);
        return { emit: ["sync-status"], result: trimmed };
      }

      case "list_branches":
        return {
          result: db
            .prepare("SELECT id, name, created_at as createdAt FROM branches ORDER BY CASE WHEN id='main' THEN 0 ELSE 1 END, name COLLATE NOCASE")
            .all(),
        };
      case "get_active_branch":
        return { result: getLocalSetting(db, "active_branch") || "main" };
      case "set_active_branch":
        setLocalSetting(db, "active_branch", args.branchId);
        return { result: args.branchId };
      case "create_branch": {
        const name = requireText("Branch name", args.name);
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
        const id = `branch_${slug}_${Date.now()}`;
        db.prepare("INSERT INTO branches (id, name) VALUES (?, ?)").run(id, name);
        db.prepare("INSERT OR IGNORE INTO categories (kind, name, branch_id) SELECT kind, name, ? FROM categories WHERE branch_id='main'").run(id);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, created_at as createdAt FROM branches WHERE id = ?").get(id),
        };
      }
      case "update_branch": {
        const name = requireText("Branch name", args.name);
        db.prepare("UPDATE branches SET name = ? WHERE id = ?").run(name, args.branchId);
        return {
          emit: ["sync-status"],
          result: db.prepare("SELECT id, name, created_at as createdAt FROM branches WHERE id = ?").get(args.branchId),
        };
      }
      case "delete_branch": {
        checkAdminSettingsPin(db, args.pin);
        if (args.branchId === "main") throw new Error("The primary Main Branch cannot be deleted.");
        createAutoSafetyBackup(db, backupDir, "before_delete_branch");
        for (const t of ["sales", "expenses", "ld_commissions", "commissions", "salaries", "employees", "categories"]) {
          db.prepare(`DELETE FROM ${t} WHERE branch_id = ?`).run(args.branchId);
        }
        db.prepare("DELETE FROM branches WHERE id = ?").run(args.branchId);
        if (getLocalSetting(db, "active_branch") === args.branchId) {
          setLocalSetting(db, "active_branch", "main");
        }
        return { emit: ["sync-status"], result: null };
      }
      case "reset_database": {
        checkAdminSettingsPin(db, args.pin);
        createAutoSafetyBackup(db, backupDir, "before_reset");
        const isAll = args.branchId === "all";
        const isFull = args.resetType === "full";
        const tables = ["sales", "expenses", "ld_commissions", "commissions", "salaries"];
        if (isFull) tables.push("employees");
        for (const t of tables) {
          if (isAll) db.prepare(`DELETE FROM ${t}`).run();
          else db.prepare(`DELETE FROM ${t} WHERE branch_id = ?`).run(args.branchId);
        }
        return { emit: ["sync-status"], result: null };
      }
      case "verify_admin_pin": {
        try {
          checkPin(db, args.pin);
          return { result: true };
        } catch {
          return { result: false };
        }
      }
      case "change_admin_pin": {
        checkAdminSettingsPin(db, args.oldPin);
        const cleanNew = requireText("New PIN", args.newPin);
        if (cleanNew.length < 4 || cleanNew.length > 32) throw new Error("New admin PIN must be 4-32 characters.");
        const conflict = Number(db.prepare("SELECT COUNT(*) as c FROM app_users WHERE pin = ? AND sync_id != 'user:owner'").get(cleanNew).c || 0);
        if (conflict > 0) throw new Error("Another user already uses that PIN.");
        setAdminPinSetting(db, cleanNew);
        db.prepare("UPDATE app_users SET pin = ? WHERE sync_id = 'user:owner'").run(cleanNew);
        return { emit: ["sync-status"], result: null };
      }

      case "login_with_pin": {
        const clean = String(args.pin || "").trim();
        if (!clean) throw new Error("Please enter your PIN code.");
        const row = db.prepare("SELECT * FROM app_users WHERE pin = ?").get(clean);
        if (!row) throw new Error("Invalid PIN code. Please try again.");
        const user = mapUserRow(row);
        setLocalSetting(db, "active_user_name", user.name);
        if (user.assignedBranchId) setLocalSetting(db, "active_branch", user.assignedBranchId);
        return { result: user };
      }
      case "list_users":
        return {
          result: db
            .prepare("SELECT * FROM app_users ORDER BY CASE WHEN sync_id='user:owner' THEN 0 ELSE 1 END, name COLLATE NOCASE")
            .all()
            .map(mapUserRow),
        };
      case "create_user": {
        checkAdminSettingsPin(db, args.adminPin);
        const inp = args.input || {};
        const name = requireText("User name", inp.name);
        const pin = String(inp.pin || "").trim();
        if (pin.length < 4 || pin.length > 32) throw new Error("User PIN must be between 4 and 32 characters.");
        const dup = Number(db.prepare("SELECT COUNT(*) as c FROM app_users WHERE pin = ?").get(pin).c || 0);
        if (dup > 0) throw new Error("That PIN is already assigned to another user.");
        const r = db
          .prepare(
            "INSERT INTO app_users (name, pin, role, assigned_branch_id, can_view_dashboard, can_add_records, can_edit_records, can_delete_records, can_manage_employees, can_manage_branches, can_manage_settings) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            name,
            pin,
            requireText("Role", inp.role),
            inp.assignedBranchId ? String(inp.assignedBranchId).trim() || null : null,
            inp.canViewDashboard ? 1 : 0,
            inp.canAddRecords ? 1 : 0,
            inp.canEditRecords ? 1 : 0,
            inp.canDeleteRecords ? 1 : 0,
            inp.canManageEmployees ? 1 : 0,
            inp.canManageBranches ? 1 : 0,
            inp.canManageSettings ? 1 : 0,
          );
        return {
          emit: ["sync-status"],
          result: mapUserRow(db.prepare("SELECT * FROM app_users WHERE id = ?").get(Number(r.lastInsertRowid))),
        };
      }
      case "update_user": {
        checkAdminSettingsPin(db, args.adminPin);
        const inp = args.input || {};
        const name = requireText("User name", inp.name);
        const pin = String(inp.pin || "").trim();
        if (pin.length < 4 || pin.length > 32) throw new Error("User PIN must be between 4 and 32 characters.");
        const otherAdmins = Number(db.prepare("SELECT COUNT(*) as c FROM app_users WHERE can_manage_settings = 1 AND id != ?").get(args.id).c || 0);
        if (!inp.canManageSettings && otherAdmins === 0) throw new Error("At least one Owner / Admin user must keep Settings & Admin permissions.");
        const dup = Number(db.prepare("SELECT COUNT(*) as c FROM app_users WHERE pin = ? AND id != ?").get(pin, args.id).c || 0);
        if (dup > 0) throw new Error("That PIN is already assigned to another user.");
        const cur = db.prepare("SELECT sync_id FROM app_users WHERE id = ?").get(args.id);
        db.prepare(
          "UPDATE app_users SET name=?, pin=?, role=?, assigned_branch_id=?, can_view_dashboard=?, can_add_records=?, can_edit_records=?, can_delete_records=?, can_manage_employees=?, can_manage_branches=?, can_manage_settings=? WHERE id=?",
        ).run(
          name,
          pin,
          requireText("Role", inp.role),
          inp.assignedBranchId ? String(inp.assignedBranchId).trim() || null : null,
          inp.canViewDashboard ? 1 : 0,
          inp.canAddRecords ? 1 : 0,
          inp.canEditRecords ? 1 : 0,
          inp.canDeleteRecords ? 1 : 0,
          inp.canManageEmployees ? 1 : 0,
          inp.canManageBranches ? 1 : 0,
          inp.canManageSettings ? 1 : 0,
          args.id,
        );
        if (cur?.sync_id === "user:owner") {
          setAdminPinSetting(db, pin);
        }
        return {
          emit: ["sync-status"],
          result: mapUserRow(db.prepare("SELECT * FROM app_users WHERE id = ?").get(args.id)),
        };
      }
      case "delete_user": {
        checkAdminSettingsPin(db, args.adminPin);
        const cur = db.prepare("SELECT sync_id FROM app_users WHERE id = ?").get(args.id);
        if (cur?.sync_id === "user:owner") throw new Error("The primary Owner / Admin account cannot be deleted.");
        const otherAdmins = Number(db.prepare("SELECT COUNT(*) as c FROM app_users WHERE can_manage_settings = 1 AND id != ?").get(args.id).c || 0);
        if (otherAdmins === 0) throw new Error("At least one Owner / Admin user must remain.");
        db.prepare("DELETE FROM app_users WHERE id = ?").run(args.id);
        return { emit: ["sync-status"], result: null };
      }
      case "list_safety_backups": {
        if (!fs.existsSync(backupDir)) return { result: [] };
        const files = fs
          .readdirSync(backupDir)
          .filter((f) => f.toLowerCase().endsWith(".db"))
          .map((f) => {
            const st = fs.statSync(path.join(backupDir, f));
            const reason = f.includes("before_reset")
              ? "Auto-backup before Database Reset"
              : f.includes("before_delete_branch")
                ? "Auto-backup before Branch Delete"
                : f.includes("before_restore")
                  ? "Auto-backup before Restore"
                  : "Safety Snapshot";
            const createdAt = f.replace(/\.db$/i, "").split("_").pop() || "";
            return { filename: f, reason, createdAt, sizeBytes: st.size, m: st.mtimeMs };
          })
          .sort((a, b) => b.m - a.m)
          .map(({ m, ...rest }) => rest);
        return { result: files };
      }
      case "restore_safety_backup": {
        checkAdminSettingsPin(db, args.pin);
        const fn = String(args.filename || "");
        if (!fn || fn.includes("/") || fn.includes("\\") || !fn.endsWith(".db")) throw new Error("Invalid safety backup filename.");
        const srcPath = path.join(backupDir, fn);
        if (!fs.existsSync(srcPath)) throw new Error("Selected safety backup no longer exists.");
        createAutoSafetyBackup(db, backupDir, "before_restore");
        const src = new DatabaseSync(srcPath);
        db.exec("BEGIN");
        try {
          for (const t of ["sales", "expenses", "ld_commissions", "commissions", "salaries", "employees", "categories", "branches", "app_users"]) {
            db.prepare(`DELETE FROM ${t}`).run();
            const rows = src.prepare(`SELECT * FROM ${t}`).all();
            if (rows.length > 0) {
              const cols = Object.keys(rows[0]);
              const placeholders = cols.map(() => "?").join(",");
              const stmt = db.prepare(`INSERT INTO ${t} (${cols.join(",")}) VALUES (${placeholders})`);
              for (const r of rows) stmt.run(...cols.map((c) => r[c]));
            }
          }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        } finally {
          src.close();
        }
        queueAllLocalRecords(db);
        return { emit: ["sync-updated", "sync-status"], result: null };
      }

      case "get_sync_settings":
        return { result: getSyncStatus(db) };
      case "save_device_name": {
        const clean = requireText("Device name", args.deviceName);
        setLocalSetting(db, "device_name", clean);
        return { emit: ["sync-status"], result: getSyncStatus(db) };
      }
      case "test_turso_connection": {
        const url = normalizeTursoUrl(args.tursoUrl);
        const tok = String(args.tursoToken || "").trim() || getLocalSetting(db, "turso_token");
        if (!tok) throw new Error("Turso Auth Token is required.");
        await sendTursoPipeline(url, tok, [hranaStmt("SELECT 1")]);
        return { result: `Connected successfully to ${url}` };
      }
      case "save_turso_settings": {
        checkAdminSettingsPin(db, args.pin);
        const url = String(args.tursoUrl || "").trim();
        const pipelineUrl = normalizeTursoUrl(url);
        const tok = String(args.tursoToken || "").trim() || getLocalSetting(db, "turso_token");
        if (!tok) throw new Error("Turso Auth Token is required.");
        await sendTursoPipeline(pipelineUrl, tok, [hranaStmt("SELECT 1")]);
        const prevUrl = getLocalSetting(db, "turso_url").trim();
        setLocalSetting(db, "turso_url", url);
        setLocalSetting(db, "turso_token", tok);
        setLocalSetting(db, "sync_enabled", "1");
        setLocalSetting(db, "last_sync_error", "");
        if (prevUrl !== url) setLocalSetting(db, "last_sync_cursor", "0");
        queueAllLocalRecords(db);
        const { pulled } = await runTursoSyncCycle(db);
        return { emit: pulled > 0 ? ["sync-updated", "sync-status"] : ["sync-status"], result: getSyncStatus(db) };
      }
      case "sync_now": {
        const { pulled } = await runTursoSyncCycle(db);
        return { emit: pulled > 0 ? ["sync-updated", "sync-status"] : ["sync-status"], result: getSyncStatus(db) };
      }
      case "disconnect_turso":
        checkAdminSettingsPin(db, args.pin);
        setLocalSetting(db, "sync_enabled", "0");
        setLocalSetting(db, "turso_token", "");
        setLocalSetting(db, "last_sync_cursor", "0");
        setLocalSetting(db, "last_sync_error", "");
        return { emit: ["sync-status"], result: getSyncStatus(db) };

      default:
        throw new Error(`Command "${cmd}" is only available in desktop installer builds.`);
    }
  }

  return (req, res, next) => {
    if (req.method !== "POST") return next();
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", async () => {
      res.setHeader("Content-Type", "application/json");
      try {
        const body = JSON.parse(raw || "{}");
        const out = await dispatch(body.cmd, body.args || {});
        res.end(JSON.stringify({ ok: true, result: out.result, emit: out.emit || [] }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
      }
    });
  };
}
