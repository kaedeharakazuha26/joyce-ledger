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
pub fn build_csv(
    conn: &Connection,
    module: &str,
    filter: &DateFilter,
    branch_id: &str,
) -> AppResult<(String, usize)> {
    let mut out = String::new();
    let count;
    match module {
        "sales" => {
            let rows = sales::list(conn, filter, branch_id)?;
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
            let rows = expenses::list(conn, filter, branch_id)?;
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
            let rows = ld_commissions::list(conn, filter, branch_id)?;
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
            let rows = commissions::list(conn, filter, branch_id)?;
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
            let rows = salaries::list(conn, filter, branch_id)?;
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
    branch: Option<String>,
) -> AppResult<usize> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    let (csv, count) = build_csv(&*state.conn()?, &module, &filter.unwrap_or_default(), &branch_id)?;
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
    restore_from(&mut *conn, &path)?;
    let active = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'active_branch'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "main".to_string());
    state.set_active_branch(&active)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::models::{
        CommissionInput, EmployeeInput, ExpenseInput, LdCommissionInput, SalaryInput, SaleInput,
    };

    #[test]
    fn csv_escaping_and_totals() {
        let conn = open_in_memory().unwrap();
        sales::create(
            &conn,
            &SaleInput { category: "Food, \"special\"".into(), amount: 123_450, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();
        let (csv, n) = build_csv(&conn, "sales", &DateFilter::default(), "main").unwrap();
        assert_eq!(n, 1);
        assert_eq!(
            csv,
            "Date,Category,Amount\r\n2026-10-13,\"Food, \"\"special\"\"\",1234.50\r\nTOTAL,,1234.50\r\n"
        );
        assert!(build_csv(&conn, "bogus", &DateFilter::default(), "main").is_err());
    }

    #[test]
    fn ld_csv_has_quantity_total() {
        let conn = open_in_memory().unwrap();
        for q in [2, 3] {
            ld_commissions::create(
                &conn,
                &LdCommissionInput { name: "Ana".into(), quantity: q, amount: 100, date: "2026-10-13".into() },
                "main",
            )
            .unwrap();
        }
        let (csv, _) = build_csv(&conn, "ld_commissions", &DateFilter::default(), "main").unwrap();
        assert!(csv.ends_with("TOTAL,,5,2.00\r\n"));
    }

    #[test]
    fn backup_creates_readable_copy() {
        let conn = open_in_memory().unwrap();
        sales::create(&conn, &SaleInput { category: "Food".into(), amount: 100, date: "2026-10-13".into() }, "main")
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
        sales::create(&conn, &SaleInput { category: "Original".into(), amount: 500, date: "2026-10-13".into() }, "main").unwrap();

        let path = std::env::temp_dir().join(format!("joyce_restore_test_{}.db", std::process::id()));
        let p = path.to_string_lossy().to_string();
        backup_to(&conn, &p).unwrap();

        sales::create(&conn, &SaleInput { category: "Added Later".into(), amount: 999, date: "2026-10-13".into() }, "main").unwrap();
        assert_eq!(sales::list(&conn, &DateFilter::default(), "main").unwrap().len(), 2);

        restore_from(&mut conn, &p).unwrap();
        let rows = sales::list(&conn, &DateFilter::default(), "main").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].category, "Original");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn full_database_backup_and_restore_across_branches() {
        let mut conn = open_in_memory().unwrap();

        // 1. Setup multi-branch data
        conn.execute(
            "INSERT INTO branches (id, name) VALUES ('branch_two', 'Branch Two')",
            [],
        )
        .unwrap();

        // Admin PIN
        conn.execute(
            "UPDATE app_settings SET value = '7777' WHERE key = 'admin_pin'",
            [],
        )
        .unwrap();

        // Employees
        crate::commands::employees::create(
            &conn,
            &EmployeeInput { name: "Maria".into(), position: Some("Server".into()) },
            "main",
        )
        .unwrap();
        crate::commands::employees::create(
            &conn,
            &EmployeeInput { name: "Carlos".into(), position: Some("Bartender".into()) },
            "branch_two",
        )
        .unwrap();

        // Sales
        sales::create(
            &conn,
            &SaleInput { category: "Cocktails".into(), amount: 150_000, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();
        sales::create(
            &conn,
            &SaleInput { category: "VIP Lounge".into(), amount: 300_000, date: "2026-10-13".into() },
            "branch_two",
        )
        .unwrap();

        // Expenses
        crate::commands::expenses::create(
            &conn,
            &ExpenseInput { category: "Ice Supplies".into(), amount: 25_000, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();
        crate::commands::expenses::create(
            &conn,
            &ExpenseInput { category: "Sound System".into(), amount: 80_000, date: "2026-10-13".into() },
            "branch_two",
        )
        .unwrap();

        // LD Commissions
        ld_commissions::create(
            &conn,
            &LdCommissionInput { name: "Maria".into(), quantity: 5, amount: 250_000, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();

        // Commissions
        crate::commands::commissions::create(
            &conn,
            &CommissionInput {
                name: "Carlos".into(),
                category: "Bottles".into(),
                amount: 120_000,
                date: "2026-10-13".into(),
            },
            "branch_two",
        )
        .unwrap();

        // Salaries
        crate::commands::salaries::create(
            &conn,
            &SalaryInput { name: "Maria".into(), amount: 500_000, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();

        // 2. Perform Full Backup
        let path = std::env::temp_dir().join(format!("joyce_full_backup_test_{}.db", std::process::id()));
        let p = path.to_string_lossy().to_string();
        backup_to(&conn, &p).unwrap();

        // 3. Mutate / Corrupt Current Database State
        conn.execute("DELETE FROM sales", []).unwrap();
        conn.execute("DELETE FROM expenses", []).unwrap();
        conn.execute("DELETE FROM employees", []).unwrap();
        conn.execute("UPDATE app_settings SET value = '9999' WHERE key = 'admin_pin'", []).unwrap();
        assert_eq!(sales::list(&conn, &DateFilter::default(), "main").unwrap().len(), 0);

        // 4. Restore Full Database
        restore_from(&mut conn, &p).unwrap();

        // 5. Verify All Restored Data
        let restored_pin: String = conn
            .query_row("SELECT value FROM app_settings WHERE key = 'admin_pin'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(restored_pin, "7777");

        let main_sales = sales::list(&conn, &DateFilter::default(), "main").unwrap();
        assert_eq!(main_sales.len(), 1);
        assert_eq!(main_sales[0].category, "Cocktails");
        assert_eq!(main_sales[0].amount, 150_000);

        let branch2_sales = sales::list(&conn, &DateFilter::default(), "branch_two").unwrap();
        assert_eq!(branch2_sales.len(), 1);
        assert_eq!(branch2_sales[0].category, "VIP Lounge");
        assert_eq!(branch2_sales[0].amount, 300_000);

        let main_expenses = crate::commands::expenses::list(&conn, &DateFilter::default(), "main").unwrap();
        assert_eq!(main_expenses.len(), 1);
        assert_eq!(main_expenses[0].category, "Ice Supplies");

        let b2_expenses = crate::commands::expenses::list(&conn, &DateFilter::default(), "branch_two").unwrap();
        assert_eq!(b2_expenses.len(), 1);
        assert_eq!(b2_expenses[0].category, "Sound System");

        let employees_main = crate::commands::employees::list(&conn, "main").unwrap();
        assert_eq!(employees_main.len(), 1);
        assert_eq!(employees_main[0].name, "Maria");

        let employees_b2 = crate::commands::employees::list(&conn, "branch_two").unwrap();
        assert_eq!(employees_b2.len(), 1);
        assert_eq!(employees_b2[0].name, "Carlos");

        let ld_list = ld_commissions::list(&conn, &DateFilter::default(), "main").unwrap();
        assert_eq!(ld_list.len(), 1);
        assert_eq!(ld_list[0].quantity, 5);

        let comm_list = crate::commands::commissions::list(&conn, &DateFilter::default(), "branch_two").unwrap();
        assert_eq!(comm_list.len(), 1);
        assert_eq!(comm_list[0].amount, 120_000);

        let sal_list = crate::commands::salaries::list(&conn, &DateFilter::default(), "main").unwrap();
        assert_eq!(sal_list.len(), 1);
        assert_eq!(sal_list[0].amount, 500_000);

        let _ = std::fs::remove_file(&path);
    }
}
