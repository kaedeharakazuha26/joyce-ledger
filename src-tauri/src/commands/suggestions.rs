//! Autocomplete values gathered from saved records.

use rusqlite::Connection;
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

/// Map a suggestion kind to a fixed SQL statement (no string building from input).
fn sql_for(kind: &str) -> AppResult<&'static str> {
    Ok(match kind {
        "salesCategory" => {
            "SELECT DISTINCT category FROM sales ORDER BY category COLLATE NOCASE"
        }
        "expensesCategory" => {
            "SELECT DISTINCT category FROM expenses ORDER BY category COLLATE NOCASE"
        }
        "commissionsCategory" => {
            "SELECT DISTINCT category FROM commissions ORDER BY category COLLATE NOCASE"
        }
        "names" => {
            "SELECT name FROM employees
             UNION SELECT name FROM ld_commissions
             UNION SELECT name FROM commissions
             UNION SELECT name FROM salaries
             ORDER BY 1 COLLATE NOCASE"
        }
        other => return Err(AppError::validation(format!("Unknown suggestion type: {other}"))),
    })
}

pub fn suggestions(conn: &Connection, kind: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(sql_for(kind)?)?;
    let mut out: Vec<String> = Vec::new();
    for v in stmt.query_map([], |r| r.get::<_, String>(0))? {
        let v = v?;
        // Collapse case-only duplicates (e.g. "Food" vs "food").
        if !out.iter().any(|e| e.eq_ignore_ascii_case(&v)) {
            out.push(v);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn get_suggestions(state: State<'_, DbState>, kind: String) -> AppResult<Vec<String>> {
    suggestions(&*state.conn()?, &kind)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{employees, sales, salaries};
    use crate::db::open_in_memory;
    use crate::models::{EmployeeInput, SaleInput, SalaryInput};

    #[test]
    fn gathers_distinct_values() {
        let conn = open_in_memory().unwrap();
        for c in ["Food", "drinks", "food"] {
            sales::create(&conn, &SaleInput { category: c.into(), amount: 1, date: "2026-10-13".into() })
                .unwrap();
        }
        let cats = suggestions(&conn, "salesCategory").unwrap();
        assert_eq!(cats.len(), 2);
        assert_eq!(cats[0], "drinks");
        assert!(cats[1].eq_ignore_ascii_case("food"));

        employees::create(&conn, &EmployeeInput { name: "Ana".into(), position: None }).unwrap();
        salaries::create(&conn, &SalaryInput { name: "Carl".into(), amount: 1, date: "2026-10-13".into() })
            .unwrap();
        assert_eq!(suggestions(&conn, "names").unwrap(), ["Ana", "Carl"]);
        assert!(suggestions(&conn, "nope").is_err());
    }
}
