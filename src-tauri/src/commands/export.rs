//! Phase 2: CSV export per module and full database backup.

use std::path::Path;

use rusqlite::Connection;
use tauri::State;

use crate::commands::{commissions, expenses, ld_commissions, salaries, sales};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::DateFilter;
use crate::money::centavos_to_decimal;

fn csv_field(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn push_row(out: &mut String, fields: &[String]) {
    let line: Vec<String> = fields.iter().map(|f| csv_field(f)).collect();
    out.push_str(&line.join(","));
    out.push_str("\r\n");
}

/// Build CSV text for a module. Returns `(csv, row_count)`.
pub fn build_csv(conn: &Connection, module: &str, filter: &DateFilter) -> AppResult<(String, usize)> {
    let mut out = String::new();
    let count;
    match module {
        "sales" => {
            let rows = sales::list(conn, filter)?;
            push_row(&mut out, &["Date".into(), "Category".into(), "Amount".into()]);
            let mut total = 0;
            for r in &rows {
                total += r.amount;
                push_row(&mut out, &[r.date.clone(), r.category.clone(), centavos_to_decimal(r.amount)]);
            }
            push_row(&mut out, &["TOTAL".into(), String::new(), centavos_to_decimal(total)]);
            count = rows.len();
        }
        "expenses" => {
            let rows = expenses::list(conn, filter)?;
            push_row(&mut out, &["Date".into(), "Category".into(), "Amount".into()]);
            let mut total = 0;
            for r in &rows {
                total += r.amount;
                push_row(&mut out, &[r.date.clone(), r.category.clone(), centavos_to_decimal(r.amount)]);
            }
            push_row(&mut out, &["TOTAL".into(), String::new(), centavos_to_decimal(total)]);
            count = rows.len();
        }
        "ld_commissions" => {
            let rows = ld_commissions::list(conn, filter)?;
            push_row(&mut out, &["Date".into(), "Name".into(), "Quantity".into(), "Amount".into()]);
            let (mut total, mut qty) = (0, 0);
            for r in &rows {
                total += r.amount;
                qty += r.quantity;
                push_row(
                    &mut out,
                    &[r.date.clone(), r.name.clone(), r.quantity.to_string(), centavos_to_decimal(r.amount)],
                );
            }
            push_row(&mut out, &["TOTAL".into(), String::new(), qty.to_string(), centavos_to_decimal(total)]);
            count = rows.len();
        }
        "commissions" => {
            let rows = commissions::list(conn, filter)?;
            push_row(&mut out, &["Date".into(), "Name".into(), "Category".into(), "Amount".into()]);
            let mut total = 0;
            for r in &rows {
                total += r.amount;
                push_row(
                    &mut out,
                    &[r.date.clone(), r.name.clone(), r.category.clone(), centavos_to_decimal(r.amount)],
                );
            }
            push_row(&mut out, &["TOTAL".into(), String::new(), String::new(), centavos_to_decimal(total)]);
            count = rows.len();
        }
        "salaries" => {
            let rows = salaries::list(conn, filter)?;
            push_row(&mut out, &["Date".into(), "Name".into(), "Amount".into()]);
            let mut total = 0;
            for r in &rows {
                total += r.amount;
                push_row(&mut out, &[r.date.clone(), r.name.clone(), centavos_to_decimal(r.amount)]);
            }
            push_row(&mut out, &["TOTAL".into(), String::new(), centavos_to_decimal(total)]);
            count = rows.len();
        }
        other => return Err(AppError::validation(format!("Unknown module: {other}"))),
    }
    Ok((out, count))
}

/// Write a CSV export to `path`. Returns the number of data rows written.
#[tauri::command]
pub fn export_csv(
    state: State<'_, DbState>,
    module: String,
    filter: Option<DateFilter>,
    path: String,
) -> AppResult<usize> {
    let (csv, count) = build_csv(&*state.conn()?, &module, &filter.unwrap_or_default())?;
    // UTF-8 BOM so Excel shows ₱ and accented names correctly.
    std::fs::write(&path, format!("\u{FEFF}{csv}"))?;
    Ok(count)
}

/// Copy the full database into a single consistent file using `VACUUM INTO`.
pub fn backup_to(conn: &Connection, path: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::validation("Choose a file to save the backup to."));
    }
    let target = Path::new(path);
    if target.exists() {
        // The user already confirmed overwrite in the save dialog.
        std::fs::remove_file(target)?;
    }
    conn.execute("VACUUM INTO ?1", [path])?;
    Ok(())
}

#[tauri::command]
pub fn backup_database(state: State<'_, DbState>, path: String) -> AppResult<()> {
    backup_to(&*state.conn()?, &path)
}

/// Restore the database live using SQLite's online backup API.
pub fn restore_from(dest_conn: &mut Connection, backup_path: &str) -> AppResult<()> {
    if backup_path.trim().is_empty() {
        return Err(AppError::validation("Choose a backup file to restore."));
    }
    let p = Path::new(backup_path);
    if !p.exists() {
        return Err(AppError::validation("The selected backup file does not exist."));
    }
    let src_conn = Connection::open_with_flags(p, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let tables: i64 = src_conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('sales','expenses')",
            [],
            |r| r.get(0),
        )
        .map_err(|_| AppError::validation("The file is not a valid Joyce Restobar Ledger database."))?;
    if tables == 0 {
        return Err(AppError::validation("The backup file does not contain ledger tables."));
    }

    {
        let backup = rusqlite::backup::Backup::new(&src_conn, dest_conn)?;
        backup.run_to_completion(10, std::time::Duration::from_millis(100), None)?;
    }

    crate::db::migrations::run(dest_conn)?;
    Ok(())
}

#[tauri::command]
pub fn restore_database(state: State<'_, DbState>, path: String) -> AppResult<()> {
    let mut conn = state.conn()?;
    restore_from(&mut *conn, &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::models::{LdCommissionInput, SaleInput};

    #[test]
    fn csv_escaping_and_totals() {
        let conn = open_in_memory().unwrap();
        sales::create(&conn, &SaleInput { category: "Food, \"special\"".into(), amount: 123_450, date: "2026-10-13".into() })
            .unwrap();
        let (csv, n) = build_csv(&conn, "sales", &DateFilter::default()).unwrap();
        assert_eq!(n, 1);
        assert_eq!(
            csv,
            "Date,Category,Amount\r\n2026-10-13,\"Food, \"\"special\"\"\",1234.50\r\nTOTAL,,1234.50\r\n"
        );
        assert!(build_csv(&conn, "bogus", &DateFilter::default()).is_err());
    }

    #[test]
    fn ld_csv_has_quantity_total() {
        let conn = open_in_memory().unwrap();
        for q in [2, 3] {
            ld_commissions::create(&conn, &LdCommissionInput { name: "Ana".into(), quantity: q, amount: 100, date: "2026-10-13".into() })
                .unwrap();
        }
        let (csv, _) = build_csv(&conn, "ld_commissions", &DateFilter::default()).unwrap();
        assert!(csv.ends_with("TOTAL,,5,2.00\r\n"));
    }

    #[test]
    fn backup_creates_readable_copy() {
        let conn = open_in_memory().unwrap();
        sales::create(&conn, &SaleInput { category: "Food".into(), amount: 100, date: "2026-10-13".into() })
            .unwrap();
        let path = std::env::temp_dir().join(format!("joyce_backup_test_{}.db", std::process::id()));
        let p = path.to_string_lossy().to_string();
        backup_to(&conn, &p).unwrap();
        backup_to(&conn, &p).unwrap(); // overwrite works
        let copy = Connection::open(&path).unwrap();
        let n: i64 = copy.query_row("SELECT COUNT(*) FROM sales", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        drop(copy);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn restore_copies_data_into_connection() {
        let mut conn = open_in_memory().unwrap();
        sales::create(&conn, &SaleInput { category: "Original".into(), amount: 500, date: "2026-10-13".into() }).unwrap();

        let path = std::env::temp_dir().join(format!("joyce_restore_test_{}.db", std::process::id()));
        let p = path.to_string_lossy().to_string();
        backup_to(&conn, &p).unwrap();

        sales::create(&conn, &SaleInput { category: "Added Later".into(), amount: 999, date: "2026-10-13".into() }).unwrap();
        assert_eq!(sales::list(&conn, &DateFilter::default()).unwrap().len(), 2);

        restore_from(&mut conn, &p).unwrap();
        let rows = sales::list(&conn, &DateFilter::default()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].category, "Original");

        let _ = std::fs::remove_file(&path);
    }
}
