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
                 ('sales','expenses','ld_commissions','commissions','salaries','employees','categories','branches','app_settings')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 9);
    }
}
