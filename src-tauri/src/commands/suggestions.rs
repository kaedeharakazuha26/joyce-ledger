//! Autocomplete values gathered from saved records.

use rusqlite::Connection;
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

/// Map a suggestion kind to a fixed SQL statement (no string building from input).
fn sql_for(kind: &str) -> AppResult<&'static str> {
    Ok(match kind {
        "salesCategory" => {
            "SELECT name FROM categories WHERE kind = 'sales' AND branch_id = ?1
             UNION SELECT category FROM sales WHERE branch_id = ?1
             ORDER BY 1 COLLATE NOCASE"
        }
        "expensesCategory" => {
            "SELECT name FROM categories WHERE kind = 'expenses' AND branch_id = ?1
             UNION SELECT category FROM expenses WHERE branch_id = ?1
             ORDER BY 1 COLLATE NOCASE"
        }
        "commissionsCategory" => {
            "SELECT name FROM categories WHERE kind = 'commissions' AND branch_id = ?1
             UNION SELECT category FROM commissions WHERE branch_id = ?1
             ORDER BY 1 COLLATE NOCASE"
        }
        "names" => {
            "SELECT name FROM employees WHERE branch_id = ?1
             UNION SELECT name FROM ld_commissions WHERE branch_id = ?1
             UNION SELECT name FROM commissions WHERE branch_id = ?1
             UNION SELECT name FROM salaries WHERE branch_id = ?1
             ORDER BY 1 COLLATE NOCASE"
        }
        other => return Err(AppError::validation(format!("Unknown suggestion type: {other}"))),
    })
}

pub fn suggestions(conn: &Connection, kind: &str, branch_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(sql_for(kind)?)?;
    let mut out: Vec<String> = Vec::new();
    for v in stmt.query_map([branch_id], |r| r.get::<_, String>(0))? {
        let v = v?;
        // Collapse case-only duplicates (e.g. "Food" vs "food").
        if !out.iter().any(|e| e.eq_ignore_ascii_case(&v)) {
            out.push(v);
        }
    }
    Ok(out)
}

pub fn add(conn: &Connection, kind: &str, name: &str, branch_id: &str) -> AppResult<String> {
    let trimmed = crate::models::require_text("Category", name)?;
    let valid_kind = match kind {
        "salesCategory" | "sales" => "sales",
        "expensesCategory" | "expenses" => "expenses",
        "commissionsCategory" | "commissions" => "commissions",
        other => return Err(AppError::validation(format!("Invalid category kind: {other}"))),
    };
    conn.execute(
        "INSERT OR IGNORE INTO categories (kind, name, branch_id) VALUES (?1, ?2, ?3)",
        rusqlite::params![valid_kind, trimmed, branch_id],
    )?;
    Ok(trimmed)
}

#[tauri::command]
pub fn get_suggestions(
    state: State<'_, DbState>,
    kind: String,
    branch: Option<String>,
) -> AppResult<Vec<String>> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    suggestions(&*state.conn()?, &kind, &branch_id)
}

#[tauri::command]
pub fn add_category(
    state: State<'_, DbState>,
    kind: String,
    name: String,
    branch: Option<String>,
) -> AppResult<String> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    add(&*state.conn()?, &kind, &name, &branch_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{employees, salaries, sales};
    use crate::db::open_in_memory;
    use crate::models::{EmployeeInput, SaleInput, SalaryInput};

    #[test]
    fn gathers_distinct_values() {
        let conn = open_in_memory().unwrap();
        add(&conn, "sales", "New Special Combo", "main").unwrap();
        sales::create(
            &conn,
            &SaleInput { category: "Cocktails".into(), amount: 1, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();
        let cats = suggestions(&conn, "salesCategory", "main").unwrap();
        assert!(cats.contains(&"Food".to_string()));
        assert!(cats.contains(&"New Special Combo".to_string()));
        assert!(cats.contains(&"Cocktails".to_string()));

        employees::create(&conn, &EmployeeInput { name: "Ana".into(), position: None }, "main").unwrap();
        salaries::create(
            &conn,
            &SalaryInput { name: "Carl".into(), amount: 1, date: "2026-10-13".into() },
            "main",
        )
        .unwrap();
        assert_eq!(suggestions(&conn, "names", "main").unwrap(), ["Ana", "Carl"]);
        assert!(suggestions(&conn, "nope", "main").is_err());
    }
}
