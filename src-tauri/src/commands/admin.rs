use rusqlite::{params, Connection};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{require_text, Branch};

pub fn check_pin(conn: &Connection, pin: &str) -> AppResult<()> {
    let stored: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'admin_pin'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "0000".to_string());

    if pin.trim() == stored.trim() {
        Ok(())
    } else {
        Err(AppError::validation("Incorrect admin PIN code."))
    }
}

#[tauri::command]
pub fn verify_admin_pin(state: State<'_, DbState>, pin: String) -> AppResult<bool> {
    let conn = state.conn()?;
    let stored: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'admin_pin'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "0000".to_string());

    Ok(pin.trim() == stored.trim())
}

#[tauri::command]
pub fn change_admin_pin(
    state: State<'_, DbState>,
    old_pin: String,
    new_pin: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    check_pin(&conn, &old_pin)?;

    let clean_new = new_pin.trim();
    if clean_new.len() < 4 {
        return Err(AppError::validation(
            "New admin PIN must be at least 4 digits or characters.",
        ));
    }
    if clean_new.len() > 32 {
        return Err(AppError::validation(
            "New admin PIN must be 32 characters or fewer.",
        ));
    }

    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?1, datetime('now','localtime'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![clean_new],
    )?;

    Ok(())
}

#[tauri::command]
pub fn list_branches(state: State<'_, DbState>) -> AppResult<Vec<Branch>> {
    let conn = state.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at FROM branches ORDER BY CASE WHEN id = 'main' THEN 0 ELSE 1 END, name COLLATE NOCASE",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Branch {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn get_active_branch(state: State<'_, DbState>) -> AppResult<String> {
    state.active_branch()
}

#[tauri::command]
pub fn set_active_branch(state: State<'_, DbState>, branch_id: String) -> AppResult<String> {
    let conn = state.conn()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM branches WHERE id = ?1",
        params![branch_id],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Err(AppError::validation("Specified branch does not exist."));
    }

    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('active_branch', ?1, datetime('now','localtime'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![branch_id],
    )?;

    state.set_active_branch(&branch_id)?;
    Ok(branch_id)
}

#[tauri::command]
pub fn create_branch(state: State<'_, DbState>, name: String) -> AppResult<Branch> {
    let clean_name = require_text("Branch name", &name)?;
    let conn = state.conn()?;

    let slug: String = clean_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = format!("branch_{}_{}", slug.trim_matches('_'), millis);

    conn.execute(
        "INSERT INTO branches (id, name) VALUES (?1, ?2)",
        params![id, clean_name],
    )?;

    // Clone default categories for new branch
    conn.execute(
        "INSERT OR IGNORE INTO categories (kind, name, branch_id)
         SELECT kind, name, ?1 FROM categories WHERE branch_id = 'main'",
        params![id],
    )?;

    conn.query_row(
        "SELECT id, name, created_at FROM branches WHERE id = ?1",
        params![id],
        |r| {
            Ok(Branch {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
            })
        },
    )
    .map_err(AppError::Database)
}

#[tauri::command]
pub fn reset_database(
    state: State<'_, DbState>,
    branch_id: String,
    pin: String,
    reset_type: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    check_pin(&conn, &pin)?;

    let is_all = branch_id == "all";
    let is_full = reset_type == "full";

    let tx = conn.unchecked_transaction()?;

    if is_all {
        tx.execute("DELETE FROM sales", [])?;
        tx.execute("DELETE FROM expenses", [])?;
        tx.execute("DELETE FROM ld_commissions", [])?;
        tx.execute("DELETE FROM commissions", [])?;
        tx.execute("DELETE FROM salaries", [])?;

        if is_full {
            tx.execute("DELETE FROM employees", [])?;
        }
    } else {
        tx.execute("DELETE FROM sales WHERE branch_id = ?1", params![branch_id])?;
        tx.execute("DELETE FROM expenses WHERE branch_id = ?1", params![branch_id])?;
        tx.execute("DELETE FROM ld_commissions WHERE branch_id = ?1", params![branch_id])?;
        tx.execute("DELETE FROM commissions WHERE branch_id = ?1", params![branch_id])?;
        tx.execute("DELETE FROM salaries WHERE branch_id = ?1", params![branch_id])?;

        if is_full {
            tx.execute("DELETE FROM employees WHERE branch_id = ?1", params![branch_id])?;
        }
    }

    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn delete_branch(
    state: State<'_, DbState>,
    branch_id: String,
    pin: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    check_pin(&conn, &pin)?;

    if branch_id == "main" {
        return Err(AppError::validation("The primary Main Branch cannot be deleted."));
    }

    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM branches WHERE id = ?1",
        params![branch_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::validation("The specified branch does not exist."));
    }

    let tx = conn.unchecked_transaction()?;

    tx.execute("DELETE FROM sales WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM expenses WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM ld_commissions WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM commissions WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM salaries WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM employees WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM categories WHERE branch_id = ?1", params![branch_id])?;
    tx.execute("DELETE FROM branches WHERE id = ?1", params![branch_id])?;

    tx.commit()?;

    // If currently on the deleted branch, switch back to 'main'
    if let Ok(current) = state.active_branch() {
        if current == branch_id {
            let _ = conn.execute(
                "UPDATE app_settings SET value = 'main', updated_at = datetime('now','localtime') WHERE key = 'active_branch'",
                [],
            );
            let _ = state.set_active_branch("main");
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn pin_verification_and_change() {
        let conn = open_in_memory().unwrap();
        assert!(check_pin(&conn, "0000").is_ok());
        assert!(check_pin(&conn, "wrong").is_err());

        // Change pin
        conn.execute(
            "UPDATE app_settings SET value = '1234' WHERE key = 'admin_pin'",
            [],
        )
        .unwrap();
        assert!(check_pin(&conn, "1234").is_ok());
        assert!(check_pin(&conn, "0000").is_err());
    }

    #[test]
    fn branches_list_and_defaults() {
        let conn = open_in_memory().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM branches", [], |r| r.get(0))
            .unwrap();
        assert!(count >= 2);
    }
}
