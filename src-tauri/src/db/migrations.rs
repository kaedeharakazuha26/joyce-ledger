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
                 ('sales','expenses','ld_commissions','commissions','salaries','employees','categories')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 7);
    }
}
