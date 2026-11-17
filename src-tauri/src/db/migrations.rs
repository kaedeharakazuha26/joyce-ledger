//! Schema migrations tracked with `PRAGMA user_version`.
//! Append new migrations to the end of `MIGRATIONS`; never edit old ones.

use rusqlite::Connection;

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &[
    // v1: initial schema
    r#"
    CREATE TABLE sales (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      category      TEXT    NOT NULL,
      amount        INTEGER NOT NULL CHECK (amount > 0),
      sale_date     TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE expenses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      category      TEXT    NOT NULL,
      amount        INTEGER NOT NULL CHECK (amount > 0),
      expense_date  TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE ld_commissions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      quantity        INTEGER NOT NULL CHECK (quantity >= 1),
      amount          INTEGER NOT NULL CHECK (amount > 0),
      commission_date TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE commissions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      amount          INTEGER NOT NULL CHECK (amount > 0),
      commission_date TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE salaries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      amount       INTEGER NOT NULL CHECK (amount > 0),
      salary_date  TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE employees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      position    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX idx_sales_date        ON sales(sale_date);
    CREATE INDEX idx_expenses_date     ON expenses(expense_date);
    CREATE INDEX idx_ld_date           ON ld_commissions(commission_date);
    CREATE INDEX idx_commissions_date  ON commissions(commission_date);
    CREATE INDEX idx_salaries_date     ON salaries(salary_date);
    "#,
    // v2: categories table with defaults
    r#"
    CREATE TABLE categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(kind, name COLLATE NOCASE)
    );

    INSERT OR IGNORE INTO categories (kind, name) VALUES
      ('sales', 'Food'),
      ('sales', 'Drinks'),
      ('sales', 'Beer'),
      ('sales', 'Liquor'),
      ('sales', 'Cocktails'),
      ('sales', 'Cigarettes'),
      ('sales', 'Others'),
      ('expenses', 'Kitchen Supplies'),
      ('expenses', 'Meat & Seafood'),
      ('expenses', 'Produce & Groceries'),
      ('expenses', 'Beverages & Ice'),
      ('expenses', 'Gas & LPG'),
      ('expenses', 'Utilities'),
      ('expenses', 'Maintenance'),
      ('expenses', 'Packaging'),
      ('expenses', 'Others'),
      ('commissions', 'Bottle'),
      ('commissions', 'Table'),
      ('commissions', 'VIP'),
      ('commissions', 'Service'),
      ('commissions', 'Others');
    "#,
    // v3: branches, app_settings, and branch-scoped data
    r#"
    CREATE TABLE IF NOT EXISTS branches (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    INSERT OR IGNORE INTO branches (id, name) VALUES
      ('main', 'Main Branch'),
      ('branch_2', 'Branch 2');

    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    INSERT OR IGNORE INTO app_settings (key, value) VALUES
      ('admin_pin', '0000'),
      ('active_branch', 'main');

    -- Add branch_id column to transaction tables
    ALTER TABLE sales ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';
    ALTER TABLE expenses ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';
    ALTER TABLE ld_commissions ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';
    ALTER TABLE commissions ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';
    ALTER TABLE salaries ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';

    -- Recreate employees with branch_id and scoped uniqueness
    CREATE TABLE IF NOT EXISTS employees_v3 (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL COLLATE NOCASE,
      position    TEXT,
      branch_id   TEXT    NOT NULL DEFAULT 'main',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(name COLLATE NOCASE, branch_id)
    );
    INSERT OR IGNORE INTO employees_v3 (id, name, position, branch_id, created_at)
      SELECT id, name, position, 'main', created_at FROM employees;
    DROP TABLE employees;
    ALTER TABLE employees_v3 RENAME TO employees;

    -- Recreate categories with branch_id and scoped uniqueness
    CREATE TABLE IF NOT EXISTS categories_v3 (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      branch_id   TEXT    NOT NULL DEFAULT 'main',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(kind, name COLLATE NOCASE, branch_id)
    );
    INSERT OR IGNORE INTO categories_v3 (id, kind, name, branch_id, created_at)
      SELECT id, kind, name, 'main', created_at FROM categories;
    DROP TABLE categories;
    ALTER TABLE categories_v3 RENAME TO categories;

    -- Seed Branch 2 categories with default restobar categories
    INSERT OR IGNORE INTO categories (kind, name, branch_id) VALUES
      ('sales', 'Food', 'branch_2'),
      ('sales', 'Drinks', 'branch_2'),
      ('sales', 'Beer', 'branch_2'),
      ('sales', 'Liquor', 'branch_2'),
      ('sales', 'Cocktails', 'branch_2'),
      ('sales', 'Cigarettes', 'branch_2'),
      ('sales', 'Others', 'branch_2'),
      ('expenses', 'Kitchen Supplies', 'branch_2'),
      ('expenses', 'Meat & Seafood', 'branch_2'),
      ('expenses', 'Produce & Groceries', 'branch_2'),
      ('expenses', 'Beverages & Ice', 'branch_2'),
      ('expenses', 'Gas & LPG', 'branch_2'),
      ('expenses', 'Utilities', 'branch_2'),
      ('expenses', 'Maintenance', 'branch_2'),
      ('expenses', 'Packaging', 'branch_2'),
      ('expenses', 'Others', 'branch_2'),
      ('commissions', 'Bottle', 'branch_2'),
      ('commissions', 'Table', 'branch_2'),
      ('commissions', 'VIP', 'branch_2'),
      ('commissions', 'Service', 'branch_2'),
      ('commissions', 'Others', 'branch_2');

    CREATE INDEX IF NOT EXISTS idx_sales_branch        ON sales(branch_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_branch     ON expenses(branch_id);
    CREATE INDEX IF NOT EXISTS idx_ld_branch           ON ld_commissions(branch_id);
    CREATE INDEX IF NOT EXISTS idx_commissions_branch  ON commissions(branch_id);
    CREATE INDEX IF NOT EXISTS idx_salaries_branch     ON salaries(branch_id);
    CREATE INDEX IF NOT EXISTS idx_employees_branch    ON employees(branch_id);
    CREATE INDEX IF NOT EXISTS idx_categories_branch   ON categories(branch_id);
    "#,
    // v4: employee default base salary, commission, and LD commission per drink
    r#"
    ALTER TABLE employees ADD COLUMN base_salary INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE employees ADD COLUMN commission INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE employees ADD COLUMN ld_commission INTEGER NOT NULL DEFAULT 0;
    "#,
    // v5: multi-laptop sync metadata (sync_id, device_name), local-only settings, and trigger outbox
    r#"
    CREATE TABLE IF NOT EXISTS local_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    INSERT OR IGNORE INTO local_settings (key, value)
      SELECT 'active_branch', value FROM app_settings WHERE key = 'active_branch';
    INSERT OR IGNORE INTO local_settings (key, value) VALUES
      ('active_branch', 'main'),
      ('device_name', ''),
      ('turso_url', ''),
      ('turso_token', ''),
      ('sync_enabled', '0'),
      ('last_sync_at', ''),
      ('last_sync_cursor', '0'),
      ('last_sync_error', ''),
      ('sync_applying_remote', '0');

    CREATE TABLE IF NOT EXISTS sync_outbox (
      table_name  TEXT NOT NULL,
      sync_id     TEXT NOT NULL,
      op          TEXT NOT NULL,
      branch_id   TEXT NOT NULL DEFAULT 'main',
      changed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (table_name, sync_id)
    ) WITHOUT ROWID;

    -- Add sync metadata columns to all synced tables
    ALTER TABLE sales ADD COLUMN sync_id TEXT;
    ALTER TABLE sales ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE expenses ADD COLUMN sync_id TEXT;
    ALTER TABLE expenses ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE ld_commissions ADD COLUMN sync_id TEXT;
    ALTER TABLE ld_commissions ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE commissions ADD COLUMN sync_id TEXT;
    ALTER TABLE commissions ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE salaries ADD COLUMN sync_id TEXT;
    ALTER TABLE salaries ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE employees ADD COLUMN sync_id TEXT;
    ALTER TABLE employees ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE employees ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE categories ADD COLUMN sync_id TEXT;
    ALTER TABLE categories ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE categories ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE branches ADD COLUMN sync_id TEXT;
    ALTER TABLE branches ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE branches ADD COLUMN device_name TEXT NOT NULL DEFAULT '';

    -- Backfill deterministic sync_ids for seeded/natural-key tables and UUIDs for transaction tables
    UPDATE branches
      SET sync_id = 'branch:' || id,
          updated_at = COALESCE(NULLIF(updated_at, ''), created_at)
      WHERE sync_id IS NULL OR sync_id = '';

    UPDATE categories
      SET sync_id = 'cat:' || lower(branch_id) || ':' || lower(kind) || ':' || lower(name),
          updated_at = COALESCE(NULLIF(updated_at, ''), created_at)
      WHERE sync_id IS NULL OR sync_id = '';

    UPDATE employees
      SET sync_id = 'emp:' || lower(branch_id) || ':' || lower(name),
          updated_at = COALESCE(NULLIF(updated_at, ''), created_at)
      WHERE sync_id IS NULL OR sync_id = '';

    UPDATE sales SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR sync_id = '';
    UPDATE expenses SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR sync_id = '';
    UPDATE ld_commissions SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR sync_id = '';
    UPDATE commissions SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR sync_id = '';
    UPDATE salaries SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR sync_id = '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sync_id ON sales(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_sync_id ON expenses(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ld_commissions_sync_id ON ld_commissions(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_sync_id ON commissions(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_salaries_sync_id ON salaries(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_sync_id ON employees(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sync_id ON categories(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_sync_id ON branches(sync_id);

    -- Triggers for sales
    CREATE TRIGGER IF NOT EXISTS trg_sales_ai AFTER INSERT ON sales
    BEGIN
      UPDATE sales
      SET sync_id = COALESCE(NULLIF(sync_id, ''), lower(hex(randomblob(16)))),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'sales', s.sync_id, 'UPSERT', s.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM sales s
      WHERE s.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sales_au AFTER UPDATE ON sales
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE sales
      SET device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('sales', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sales_ad AFTER DELETE ON sales
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('sales', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for expenses
    CREATE TRIGGER IF NOT EXISTS trg_expenses_ai AFTER INSERT ON expenses
    BEGIN
      UPDATE expenses
      SET sync_id = COALESCE(NULLIF(sync_id, ''), lower(hex(randomblob(16)))),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'expenses', e.sync_id, 'UPSERT', e.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM expenses e
      WHERE e.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_expenses_au AFTER UPDATE ON expenses
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE expenses
      SET device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('expenses', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_expenses_ad AFTER DELETE ON expenses
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('expenses', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for ld_commissions
    CREATE TRIGGER IF NOT EXISTS trg_ld_commissions_ai AFTER INSERT ON ld_commissions
    BEGIN
      UPDATE ld_commissions
      SET sync_id = COALESCE(NULLIF(sync_id, ''), lower(hex(randomblob(16)))),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'ld_commissions', l.sync_id, 'UPSERT', l.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM ld_commissions l
      WHERE l.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_ld_commissions_au AFTER UPDATE ON ld_commissions
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE ld_commissions
      SET device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('ld_commissions', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_ld_commissions_ad AFTER DELETE ON ld_commissions
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('ld_commissions', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for commissions
    CREATE TRIGGER IF NOT EXISTS trg_commissions_ai AFTER INSERT ON commissions
    BEGIN
      UPDATE commissions
      SET sync_id = COALESCE(NULLIF(sync_id, ''), lower(hex(randomblob(16)))),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'commissions', c.sync_id, 'UPSERT', c.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM commissions c
      WHERE c.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_commissions_au AFTER UPDATE ON commissions
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE commissions
      SET device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('commissions', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_commissions_ad AFTER DELETE ON commissions
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('commissions', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for salaries
    CREATE TRIGGER IF NOT EXISTS trg_salaries_ai AFTER INSERT ON salaries
    BEGIN
      UPDATE salaries
      SET sync_id = COALESCE(NULLIF(sync_id, ''), lower(hex(randomblob(16)))),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'salaries', s.sync_id, 'UPSERT', s.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM salaries s
      WHERE s.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_salaries_au AFTER UPDATE ON salaries
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE salaries
      SET device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('salaries', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_salaries_ad AFTER DELETE ON salaries
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('salaries', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for employees
    CREATE TRIGGER IF NOT EXISTS trg_employees_ai AFTER INSERT ON employees
    BEGIN
      UPDATE employees
      SET sync_id = COALESCE(NULLIF(sync_id, ''), 'emp:' || lower(branch_id) || ':' || lower(name)),
          updated_at = COALESCE(NULLIF(updated_at, ''), datetime('now','localtime')),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'employees', e.sync_id, 'UPSERT', e.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM employees e
      WHERE e.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_employees_au AFTER UPDATE ON employees
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE employees
      SET updated_at = datetime('now','localtime'),
          device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('employees', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_employees_ad AFTER DELETE ON employees
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('employees', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for categories
    CREATE TRIGGER IF NOT EXISTS trg_categories_ai AFTER INSERT ON categories
    BEGIN
      UPDATE categories
      SET sync_id = COALESCE(NULLIF(sync_id, ''), 'cat:' || lower(branch_id) || ':' || lower(kind) || ':' || lower(name)),
          updated_at = COALESCE(NULLIF(updated_at, ''), datetime('now','localtime')),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'categories', c.sync_id, 'UPSERT', c.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM categories c
      WHERE c.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_categories_au AFTER UPDATE ON categories
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE categories
      SET updated_at = datetime('now','localtime'),
          device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('categories', NEW.sync_id, 'UPSERT', NEW.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_categories_ad AFTER DELETE ON categories
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('categories', OLD.sync_id, 'DELETE', OLD.branch_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for branches
    CREATE TRIGGER IF NOT EXISTS trg_branches_ai AFTER INSERT ON branches
    BEGIN
      UPDATE branches
      SET sync_id = COALESCE(NULLIF(sync_id, ''), 'branch:' || id),
          updated_at = COALESCE(NULLIF(updated_at, ''), datetime('now','localtime')),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'branches', b.sync_id, 'UPSERT', b.id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM branches b
      WHERE b.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_branches_au AFTER UPDATE ON branches
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE branches
      SET updated_at = datetime('now','localtime'),
          device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('branches', NEW.sync_id, 'UPSERT', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_branches_ad AFTER DELETE ON branches
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('branches', OLD.sync_id, 'DELETE', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    -- Triggers for shared admin_pin in app_settings (active_branch lives in local_settings)
    CREATE TRIGGER IF NOT EXISTS trg_app_settings_ai AFTER INSERT ON app_settings
    WHEN NEW.key = 'admin_pin'
      AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('app_settings', 'admin_pin', 'UPSERT', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_app_settings_au AFTER UPDATE ON app_settings
    WHEN NEW.key = 'admin_pin'
      AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('app_settings', 'admin_pin', 'UPSERT', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;
    "#,
    // v6: multi-user PIN accounts with granular permissions + Turso sync triggers
    r#"
    CREATE TABLE IF NOT EXISTS app_users (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      name                 TEXT    NOT NULL COLLATE NOCASE,
      pin                  TEXT    NOT NULL UNIQUE,
      role                 TEXT    NOT NULL DEFAULT 'cashier',
      assigned_branch_id   TEXT,
      can_view_dashboard   INTEGER NOT NULL DEFAULT 0,
      can_add_records      INTEGER NOT NULL DEFAULT 1,
      can_edit_records     INTEGER NOT NULL DEFAULT 0,
      can_delete_records   INTEGER NOT NULL DEFAULT 0,
      can_manage_employees INTEGER NOT NULL DEFAULT 0,
      can_manage_branches  INTEGER NOT NULL DEFAULT 0,
      can_manage_settings  INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      sync_id              TEXT,
      device_name          TEXT    NOT NULL DEFAULT ''
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_sync_id ON app_users(sync_id);

    -- Seed the primary Owner account from the existing admin_pin before attaching outbox triggers
    INSERT OR IGNORE INTO app_users (
      name, pin, role, assigned_branch_id,
      can_view_dashboard, can_add_records, can_edit_records, can_delete_records,
      can_manage_employees, can_manage_branches, can_manage_settings,
      sync_id
    ) VALUES (
      'Owner / Admin',
      COALESCE((SELECT NULLIF(TRIM(value), '') FROM app_settings WHERE key = 'admin_pin'), '0000'),
      'owner',
      NULL,
      1, 1, 1, 1, 1, 1, 1,
      'user:owner'
    );

    INSERT OR IGNORE INTO local_settings (key, value) VALUES ('active_user_name', '');

    CREATE TRIGGER IF NOT EXISTS trg_app_users_ai AFTER INSERT ON app_users
    BEGIN
      UPDATE app_users
      SET sync_id = COALESCE(NULLIF(sync_id, ''), lower(hex(randomblob(16)))),
          device_name = CASE WHEN device_name = '' THEN COALESCE((SELECT value FROM local_settings WHERE key = 'device_name'), '') ELSE device_name END
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      SELECT 'app_users', u.sync_id, 'UPSERT', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM app_users u
      WHERE u.rowid = NEW.rowid
        AND COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0';
    END;

    CREATE TRIGGER IF NOT EXISTS trg_app_users_au AFTER UPDATE ON app_users
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND NEW.sync_id IS NOT NULL
    BEGIN
      UPDATE app_users
      SET updated_at = datetime('now','localtime'),
          device_name = COALESCE(NULLIF((SELECT value FROM local_settings WHERE key = 'device_name'), ''), device_name)
      WHERE rowid = NEW.rowid;
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('app_users', NEW.sync_id, 'UPSERT', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_app_users_ad AFTER DELETE ON app_users
    WHEN COALESCE((SELECT value FROM local_settings WHERE key = 'sync_applying_remote'), '0') = '0'
      AND OLD.sync_id IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_outbox (table_name, sync_id, op, branch_id, changed_at)
      VALUES ('app_users', OLD.sync_id, 'DELETE', 'global', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_admin_pin_to_owner AFTER UPDATE ON app_settings
    WHEN NEW.key = 'admin_pin'
    BEGIN
      UPDATE app_users SET pin = NEW.value WHERE sync_id = 'user:owner' AND pin != NEW.value;
    END;
    "#,
];

/// Latest schema version known to this build.
pub fn latest_version() -> i64 {
    MIGRATIONS.len() as i64
}

pub fn current_version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Apply every migration newer than the stored `user_version`, each in its own transaction.
pub fn run(conn: &mut Connection) -> AppResult<()> {
    let current = current_version(conn)?;
    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let version = index as i64 + 1;
        if version <= current {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_to_latest_and_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        assert_eq!(current_version(&conn).unwrap(), latest_version());
        run(&mut conn).unwrap();
        assert_eq!(current_version(&conn).unwrap(), latest_version());
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN
                 ('sales','expenses','ld_commissions','commissions','salaries','employees','categories','branches','app_settings','local_settings','sync_outbox','app_users')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 12);
    }

    #[test]
    fn v5_triggers_queue_outbox_and_preserve_rowid() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();

        conn.execute(
            "INSERT OR REPLACE INTO local_settings (key, value) VALUES ('device_name', 'Cashier-1')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO sales (category, amount, sale_date, branch_id) VALUES ('Food', 5000, '2026-10-13', 'main')",
            [],
        )
        .unwrap();
        let row_id = conn.last_insert_rowid();
        assert!(row_id > 0);

        let (sync_id, dev): (String, String) = conn
            .query_row(
                "SELECT sync_id, device_name FROM sales WHERE id = ?1",
                [row_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(!sync_id.is_empty());
        assert_eq!(dev, "Cashier-1");

        let op: String = conn
            .query_row(
                "SELECT op FROM sync_outbox WHERE table_name = 'sales' AND sync_id = ?1",
                [&sync_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(op, "UPSERT");

        conn.execute("DELETE FROM sales WHERE id = ?1", [row_id]).unwrap();
        let op_after: String = conn
            .query_row(
                "SELECT op FROM sync_outbox WHERE table_name = 'sales' AND sync_id = ?1",
                [&sync_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(op_after, "DELETE");

        // Remote apply flag suppresses outbox queueing
        conn.execute(
            "UPDATE local_settings SET value = '1' WHERE key = 'sync_applying_remote'",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sales (category, amount, sale_date, branch_id, sync_id, device_name) VALUES ('Beer', 2000, '2026-10-13', 'main', 'remote-uuid-1', 'Laptop-2')",
            [],
        )
        .unwrap();
        let queued: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE sync_id = 'remote-uuid-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(queued, 0);
    }
}
