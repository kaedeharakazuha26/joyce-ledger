use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::{AppHandle, Emitter, State};

use crate::db::sync::{self, SyncStatus};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{require_text, Branch, SafetyBackupItem, UserAccount, UserInput};

const USER_SELECT: &str = "SELECT id, name, pin, role, assigned_branch_id,
    can_view_dashboard, can_add_records, can_edit_records, can_delete_records,
    can_manage_employees, can_manage_branches, can_manage_settings, created_at
    FROM app_users";

fn user_from_row(r: &Row) -> rusqlite::Result<UserAccount> {
    Ok(UserAccount {
        id: r.get(0)?,
        name: r.get(1)?,
        pin: r.get(2)?,
        role: r.get(3)?,
        assigned_branch_id: r.get(4)?,
        can_view_dashboard: r.get::<_, i64>(5)? != 0,
        can_add_records: r.get::<_, i64>(6)? != 0,
        can_edit_records: r.get::<_, i64>(7)? != 0,
        can_delete_records: r.get::<_, i64>(8)? != 0,
        can_manage_employees: r.get::<_, i64>(9)? != 0,
        can_manage_branches: r.get::<_, i64>(10)? != 0,
        can_manage_settings: r.get::<_, i64>(11)? != 0,
        created_at: r.get(12)?,
    })
}

/// Verifies that the entered PIN belongs to a user authorized to delete records (or Owner/Admin).
pub fn check_pin(conn: &Connection, pin: &str) -> AppResult<()> {
    let clean = pin.trim();
    if clean.is_empty() {
        return Err(AppError::validation("PIN code is required."));
    }

    let user: Option<(String, i64, i64)> = conn
        .query_row(
            "SELECT name, can_delete_records, can_manage_settings FROM app_users WHERE pin = ?1",
            [clean],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;

    if let Some((name, can_del, can_settings)) = user {
        if can_del != 0 || can_settings != 0 {
            return Ok(());
        }
        return Err(AppError::validation(format!(
            "User \"{name}\" does not have Delete permission. Ask a Manager or Owner to enter their PIN."
        )));
    }

    let user_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM app_users", [], |r| r.get(0))
        .unwrap_or(0);
    if user_count == 0 {
        let stored: String = conn
            .query_row("SELECT value FROM app_settings WHERE key = 'admin_pin'", [], |r| r.get(0))
            .unwrap_or_else(|_| "0000".to_string());
        if clean == stored.trim() {
            return Ok(());
        }
    }

    Err(AppError::validation("Incorrect PIN code."))
}

/// Verifies that the entered PIN belongs to an Owner/Admin user with `can_manage_settings = 1`.
pub fn check_admin_settings_pin(conn: &Connection, pin: &str) -> AppResult<()> {
    let clean = pin.trim();
    if clean.is_empty() {
        return Err(AppError::validation("Owner / Admin PIN code is required."));
    }

    let user: Option<(String, i64)> = conn
        .query_row(
            "SELECT name, can_manage_settings FROM app_users WHERE pin = ?1",
            [clean],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;

    match user {
        Some((_name, 1..)) => Ok(()),
        Some((name, _)) => Err(AppError::validation(format!(
            "User \"{name}\" does not have Owner / Admin Settings permission."
        ))),
        None => Err(AppError::validation("Incorrect Owner / Admin PIN code.")),
    }
}

pub fn create_auto_safety_backup(
    conn: &Connection,
    backup_dir: Option<&Path>,
    reason: &str,
) -> AppResult<Option<SafetyBackupItem>> {
    let Some(dir) = backup_dir else {
        return Ok(None);
    };
    std::fs::create_dir_all(dir)?;

    let ts: String = conn
        .query_row("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')", [], |r| r.get(0))
        .unwrap_or_else(|_| "snapshot".to_string());
    let clean_reason: String = reason
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .collect();

    let mut filename = format!("auto_{clean_reason}_{ts}.db");
    let mut dest = dir.join(&filename);
    if dest.exists() {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        filename = format!("auto_{clean_reason}_{ts}_{millis}.db");
        dest = dir.join(&filename);
    }

    let dest_str = dest.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&dest_str])?;

    let size_bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);

    // Keep up to 12 most recent automatic snapshots
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut files: Vec<_> = entries
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("db"))
                    .unwrap_or(false)
            })
            .collect();
        files.sort_by_key(|e| {
            std::cmp::Reverse(
                e.metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
            )
        });
        for old in files.into_iter().skip(12) {
            let _ = std::fs::remove_file(old.path());
        }
    }

    Ok(Some(SafetyBackupItem {
        filename,
        reason: clean_reason,
        created_at: ts,
        size_bytes,
    }))
}

#[tauri::command]
pub fn verify_admin_pin(state: State<'_, DbState>, pin: String) -> AppResult<bool> {
    let conn = state.conn()?;
    Ok(check_pin(&conn, &pin).is_ok())
}

fn set_admin_pin_setting(conn: &Connection, pin: &str) -> AppResult<()> {
    let updated = conn.execute(
        "UPDATE app_settings SET value = ?1, updated_at = datetime('now','localtime') WHERE key = 'admin_pin'",
        params![pin],
    )?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?1, datetime('now','localtime'))",
            params![pin],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn change_admin_pin(
    state: State<'_, DbState>,
    old_pin: String,
    new_pin: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    check_admin_settings_pin(&conn, &old_pin)?;

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

    let conflict: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_users WHERE pin = ?1 AND sync_id != 'user:owner'",
        [clean_new],
        |r| r.get(0),
    )?;
    if conflict > 0 {
        return Err(AppError::validation(
            "Another user already uses that PIN. Please choose a unique PIN.",
        ));
    }

    set_admin_pin_setting(&conn, clean_new)?;
    conn.execute(
        "UPDATE app_users SET pin = ?1 WHERE sync_id = 'user:owner'",
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
        "INSERT INTO local_settings (key, value, updated_at) VALUES ('active_branch', ?1, datetime('now','localtime'))
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
pub fn update_branch(
    state: State<'_, DbState>,
    branch_id: String,
    name: String,
) -> AppResult<Branch> {
    let clean_name = require_text("Branch name", &name)?;
    let conn = state.conn()?;

    let rows_affected = conn.execute(
        "UPDATE branches SET name = ?1 WHERE id = ?2",
        params![clean_name, branch_id],
    )?;

    if rows_affected == 0 {
        return Err(AppError::validation("The specified branch does not exist."));
    }

    conn.query_row(
        "SELECT id, name, created_at FROM branches WHERE id = ?1",
        params![branch_id],
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
    check_admin_settings_pin(&conn, &pin)?;
    let _ = create_auto_safety_backup(&conn, state.backup_dir.as_deref(), "before_reset")?;

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
    check_admin_settings_pin(&conn, &pin)?;

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

    let _ = create_auto_safety_backup(&conn, state.backup_dir.as_deref(), "before_delete_branch")?;

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
                "INSERT INTO local_settings (key, value, updated_at) VALUES ('active_branch', 'main', datetime('now','localtime'))
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                [],
            );
            let _ = state.set_active_branch("main");
        }
    }

    Ok(())
}

// ---------- Cloud Sync (Turso) & Device Identity Commands ----------

#[tauri::command]
pub fn get_sync_settings(state: State<'_, DbState>) -> AppResult<SyncStatus> {
    let conn = state.conn()?;
    sync::get_sync_status(&conn)
}

#[tauri::command]
pub fn save_device_name(
    app: AppHandle,
    state: State<'_, DbState>,
    device_name: String,
) -> AppResult<SyncStatus> {
    let status = {
        let conn = state.conn()?;
        sync::set_device_name(&conn, &device_name)?
    };
    let _ = app.emit("sync-status", ());
    Ok(status)
}

#[tauri::command]
pub fn test_turso_connection(
    state: State<'_, DbState>,
    turso_url: String,
    turso_token: String,
) -> AppResult<String> {
    let token_to_use = {
        let trimmed = turso_token.trim().to_string();
        if !trimmed.is_empty() {
            trimmed
        } else {
            let conn = state.conn()?;
            sync::get_local_setting(&conn, "turso_token")
        }
    };
    sync::test_turso_connection_http(&turso_url, &token_to_use)
}

#[tauri::command]
pub fn save_turso_settings(
    app: AppHandle,
    state: State<'_, DbState>,
    turso_url: String,
    turso_token: String,
    pin: String,
) -> AppResult<SyncStatus> {
    let (clean_url, effective_token) = {
        let conn = state.conn()?;
        check_admin_settings_pin(&conn, &pin)?;
        let normalized_check = sync::normalize_turso_url(&turso_url)?;
        let _ = normalized_check;
        let stored_token = sync::get_local_setting(&conn, "turso_token");
        let tok = if turso_token.trim().is_empty() {
            stored_token
        } else {
            turso_token.trim().to_string()
        };
        if tok.trim().is_empty() {
            return Err(AppError::validation("Turso Auth Token is required."));
        }
        (turso_url.trim().to_string(), tok)
    };

    // Verify network connection outside the SQLite lock first
    sync::test_turso_connection_http(&clean_url, &effective_token)?;

    {
        let conn = state.conn()?;
        let prev_url = sync::get_local_setting(&conn, "turso_url");
        sync::set_local_setting(&conn, "turso_url", &clean_url)?;
        sync::set_local_setting(&conn, "turso_token", &effective_token)?;
        sync::set_local_setting(&conn, "sync_enabled", "1")?;
        sync::set_local_setting(&conn, "last_sync_error", "")?;
        if prev_url.trim() != clean_url {
            sync::set_local_setting(&conn, "last_sync_cursor", "0")?;
        }
        sync::queue_all_local_records(&conn)?;
    }

    let cycle_res = sync::run_sync_cycle(&state);
    let _ = app.emit("sync-status", ());
    match cycle_res {
        Ok((_pushed, pulled)) => {
            if pulled > 0 {
                let _ = app.emit("sync-updated", ());
            }
        }
        Err(e) => return Err(e),
    }

    let conn = state.conn()?;
    sync::get_sync_status(&conn)
}

#[tauri::command]
pub fn sync_now(app: AppHandle, state: State<'_, DbState>) -> AppResult<SyncStatus> {
    let result = sync::run_sync_cycle(&state);
    let _ = app.emit("sync-status", ());
    match result {
        Ok((_pushed, pulled)) => {
            if pulled > 0 {
                let _ = app.emit("sync-updated", ());
            }
            let conn = state.conn()?;
            sync::get_sync_status(&conn)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn disconnect_turso(
    app: AppHandle,
    state: State<'_, DbState>,
    pin: String,
) -> AppResult<SyncStatus> {
    let status = {
        let conn = state.conn()?;
        check_admin_settings_pin(&conn, &pin)?;
        sync::set_local_setting(&conn, "sync_enabled", "0")?;
        sync::set_local_setting(&conn, "turso_token", "")?;
        sync::set_local_setting(&conn, "last_sync_cursor", "0")?;
        sync::set_local_setting(&conn, "last_sync_error", "")?;
        sync::get_sync_status(&conn)?
    };
    let _ = app.emit("sync-status", ());
    Ok(status)
}

// ---------- Multi-User Accounts, PINs & Safety Snapshots ----------

fn clean_user_pin(pin: &str) -> AppResult<String> {
    let p = pin.trim();
    if p.len() < 4 || p.len() > 32 {
        return Err(AppError::validation("User PIN must be between 4 and 32 characters."));
    }
    Ok(p.to_string())
}

#[tauri::command]
pub fn login_with_pin(state: State<'_, DbState>, pin: String) -> AppResult<UserAccount> {
    let clean = pin.trim();
    if clean.is_empty() {
        return Err(AppError::validation("Please enter your PIN code."));
    }
    let conn = state.conn()?;
    let user = conn
        .query_row(&format!("{USER_SELECT} WHERE pin = ?1"), [clean], user_from_row)
        .optional()?
        .ok_or_else(|| AppError::validation("Invalid PIN code. Please try again."))?;

    let _ = sync::set_local_setting(&conn, "active_user_name", &user.name);
    if let Some(ref b) = user.assigned_branch_id {
        if !b.trim().is_empty() {
            let _ = sync::set_local_setting(&conn, "active_branch", b);
            let _ = state.set_active_branch(b);
        }
    }
    Ok(user)
}

#[tauri::command]
pub fn list_users(state: State<'_, DbState>) -> AppResult<Vec<UserAccount>> {
    let conn = state.conn()?;
    let mut stmt = conn.prepare(&format!(
        "{USER_SELECT} ORDER BY CASE WHEN sync_id = 'user:owner' THEN 0 ELSE 1 END, name COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([], user_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_user(
    app: AppHandle,
    state: State<'_, DbState>,
    input: UserInput,
    admin_pin: String,
) -> AppResult<UserAccount> {
    let clean_name = require_text("User name", &input.name)?;
    let clean_pin = clean_user_pin(&input.pin)?;
    let clean_role = require_text("Role", &input.role)?;
    let branch_id = input
        .assigned_branch_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let created = {
        let conn = state.conn()?;
        check_admin_settings_pin(&conn, &admin_pin)?;

        let dup_pin: i64 = conn.query_row(
            "SELECT COUNT(*) FROM app_users WHERE pin = ?1",
            [&clean_pin],
            |r| r.get(0),
        )?;
        if dup_pin > 0 {
            return Err(AppError::validation(
                "That PIN is already assigned to another user. Each user must have a unique PIN.",
            ));
        }

        conn.execute(
            "INSERT INTO app_users (
               name, pin, role, assigned_branch_id,
               can_view_dashboard, can_add_records, can_edit_records, can_delete_records,
               can_manage_employees, can_manage_branches, can_manage_settings
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                clean_name,
                clean_pin,
                clean_role,
                branch_id,
                i64::from(input.can_view_dashboard),
                i64::from(input.can_add_records),
                i64::from(input.can_edit_records),
                i64::from(input.can_delete_records),
                i64::from(input.can_manage_employees),
                i64::from(input.can_manage_branches),
                i64::from(input.can_manage_settings),
            ],
        )?;
        let id = conn.last_insert_rowid();
        conn.query_row(&format!("{USER_SELECT} WHERE id = ?1"), [id], user_from_row)?
    };
    let _ = app.emit("sync-status", ());
    Ok(created)
}

#[tauri::command]
pub fn update_user(
    app: AppHandle,
    state: State<'_, DbState>,
    id: i64,
    input: UserInput,
    admin_pin: String,
) -> AppResult<UserAccount> {
    let clean_name = require_text("User name", &input.name)?;
    let clean_pin = clean_user_pin(&input.pin)?;
    let clean_role = require_text("Role", &input.role)?;
    let branch_id = input
        .assigned_branch_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let updated = {
        let conn = state.conn()?;
        check_admin_settings_pin(&conn, &admin_pin)?;

        let existing_sync_id: Option<String> = conn
            .query_row("SELECT sync_id FROM app_users WHERE id = ?1", [id], |r| {
                r.get::<_, Option<String>>(0)
            })
            .optional()?
            .flatten();

        let other_admins: i64 = conn.query_row(
            "SELECT COUNT(*) FROM app_users WHERE can_manage_settings = 1 AND id != ?1",
            [id],
            |r| r.get(0),
        )?;
        if !input.can_manage_settings && other_admins == 0 {
            return Err(AppError::validation(
                "At least one Owner / Admin user must keep Settings & Admin permissions.",
            ));
        }

        let dup_pin: i64 = conn.query_row(
            "SELECT COUNT(*) FROM app_users WHERE pin = ?1 AND id != ?2",
            params![clean_pin, id],
            |r| r.get(0),
        )?;
        if dup_pin > 0 {
            return Err(AppError::validation(
                "That PIN is already assigned to another user. Choose a different PIN.",
            ));
        }

        let rows = conn.execute(
            "UPDATE app_users SET
               name = ?1, pin = ?2, role = ?3, assigned_branch_id = ?4,
               can_view_dashboard = ?5, can_add_records = ?6, can_edit_records = ?7, can_delete_records = ?8,
               can_manage_employees = ?9, can_manage_branches = ?10, can_manage_settings = ?11
             WHERE id = ?12",
            params![
                clean_name,
                clean_pin,
                clean_role,
                branch_id,
                i64::from(input.can_view_dashboard),
                i64::from(input.can_add_records),
                i64::from(input.can_edit_records),
                i64::from(input.can_delete_records),
                i64::from(input.can_manage_employees),
                i64::from(input.can_manage_branches),
                i64::from(input.can_manage_settings),
                id,
            ],
        )?;
        if rows == 0 {
            return Err(AppError::NotFound);
        }

        if existing_sync_id.as_deref() == Some("user:owner") {
            set_admin_pin_setting(&conn, &clean_pin)?;
        }

        conn.query_row(&format!("{USER_SELECT} WHERE id = ?1"), [id], user_from_row)?
    };
    let _ = app.emit("sync-status", ());
    Ok(updated)
}

#[tauri::command]
pub fn delete_user(
    app: AppHandle,
    state: State<'_, DbState>,
    id: i64,
    admin_pin: String,
) -> AppResult<()> {
    {
        let conn = state.conn()?;
        check_admin_settings_pin(&conn, &admin_pin)?;

        let sync_id: Option<String> = conn
            .query_row("SELECT sync_id FROM app_users WHERE id = ?1", [id], |r| {
                r.get::<_, Option<String>>(0)
            })
            .optional()?
            .flatten();
        if sync_id.as_deref() == Some("user:owner") {
            return Err(AppError::validation(
                "The primary Owner / Admin account cannot be deleted.",
            ));
        }

        let other_admins: i64 = conn.query_row(
            "SELECT COUNT(*) FROM app_users WHERE can_manage_settings = 1 AND id != ?1",
            [id],
            |r| r.get(0),
        )?;
        if other_admins == 0 {
            return Err(AppError::validation(
                "At least one Owner / Admin user must remain in the system.",
            ));
        }

        let rows = conn.execute("DELETE FROM app_users WHERE id = ?1", [id])?;
        if rows == 0 {
            return Err(AppError::NotFound);
        }
    }
    let _ = app.emit("sync-status", ());
    Ok(())
}

#[tauri::command]
pub fn list_safety_backups(state: State<'_, DbState>) -> AppResult<Vec<SafetyBackupItem>> {
    let Some(dir) = state.backup_dir.as_ref() else {
        return Ok(vec![]);
    };
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<_> = std::fs::read_dir(dir)?
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("db"))
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by_key(|e| {
        std::cmp::Reverse(
            e.metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        )
    });

    let mut items = Vec::new();
    for e in entries {
        let filename = e.file_name().to_string_lossy().to_string();
        let size_bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
        let reason = if filename.contains("before_reset") {
            "Auto-backup before Database Reset".to_string()
        } else if filename.contains("before_delete_branch") {
            "Auto-backup before Branch Delete".to_string()
        } else if filename.contains("before_restore") {
            "Auto-backup before Restore".to_string()
        } else {
            "Safety Snapshot".to_string()
        };
        let created_at = filename
            .trim_end_matches(".db")
            .rsplit('_')
            .next()
            .unwrap_or("")
            .to_string();
        items.push(SafetyBackupItem {
            filename,
            reason,
            created_at,
            size_bytes,
        });
    }
    Ok(items)
}

#[tauri::command]
pub fn restore_safety_backup(
    app: AppHandle,
    state: State<'_, DbState>,
    filename: String,
    pin: String,
) -> AppResult<()> {
    if filename.contains(['/', '\\']) || !filename.ends_with(".db") {
        return Err(AppError::validation("Invalid safety backup filename."));
    }
    let Some(dir) = state.backup_dir.as_ref() else {
        return Err(AppError::validation("Safety backups directory is not configured."));
    };
    let path = dir.join(&filename);
    if !path.exists() {
        return Err(AppError::validation("Selected safety backup no longer exists."));
    }

    {
        let mut conn = state.conn()?;
        check_admin_settings_pin(&conn, &pin)?;
        let _ = create_auto_safety_backup(&conn, state.backup_dir.as_deref(), "before_restore")?;

        let preserved_local: Vec<(String, String)> = conn
            .prepare("SELECT key, value FROM local_settings WHERE key IN ('device_name','turso_url','turso_token','sync_enabled','active_user_name')")
            .and_then(|mut s| {
                s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                    .collect::<Result<Vec<_>, _>>()
            })
            .unwrap_or_default();

        crate::commands::export::restore_from(&mut *conn, &path.to_string_lossy())?;

        for (k, v) in preserved_local {
            let _ = sync::set_local_setting(&conn, &k, &v);
        }

        let active = sync::get_local_setting(&conn, "active_branch");
        let active_branch = if active.is_empty() { "main".to_string() } else { active };
        state.set_active_branch(&active_branch)?;
        let _ = sync::queue_all_local_records(&conn);
    }

    let _ = app.emit("sync-updated", ());
    let _ = app.emit("sync-status", ());
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

    #[test]
    fn update_branch_name() {
        let conn = open_in_memory().unwrap();
        let rows = conn
            .execute("UPDATE branches SET name = 'Joyce Timog' WHERE id = 'main'", [])
            .unwrap();
        assert_eq!(rows, 1);
        let name: String = conn
            .query_row("SELECT name FROM branches WHERE id = 'main'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Joyce Timog");
    }

    #[test]
    fn multi_user_permissions_and_safety_backup() {
        let conn = open_in_memory().unwrap();

        // Seeded user:owner (PIN 0000) can delete records and manage settings
        assert!(check_pin(&conn, "0000").is_ok());
        assert!(check_admin_settings_pin(&conn, "0000").is_ok());

        // Cashier (PIN 1111) can add records only — blocked from delete and settings
        conn.execute(
            "INSERT INTO app_users (
               name, pin, role, assigned_branch_id,
               can_view_dashboard, can_add_records, can_edit_records, can_delete_records,
               can_manage_employees, can_manage_branches, can_manage_settings
             ) VALUES ('Cashier Ana', '1111', 'cashier', 'main', 0, 1, 0, 0, 0, 0, 0)",
            [],
        )
        .unwrap();
        assert!(check_pin(&conn, "1111").is_err());
        assert!(check_admin_settings_pin(&conn, "1111").is_err());

        // Manager (PIN 2222) can approve deletes (override) but cannot wipe database / change settings
        conn.execute(
            "INSERT INTO app_users (
               name, pin, role, assigned_branch_id,
               can_view_dashboard, can_add_records, can_edit_records, can_delete_records,
               can_manage_employees, can_manage_branches, can_manage_settings
             ) VALUES ('Manager Ben', '2222', 'manager', NULL, 1, 1, 1, 1, 1, 0, 0)",
            [],
        )
        .unwrap();
        assert!(check_pin(&conn, "2222").is_ok());
        assert!(check_admin_settings_pin(&conn, "2222").is_err());

        // Auto safety backup creates a valid readable SQLite snapshot file
        let backup_dir = std::env::temp_dir().join(format!(
            "joyce_safety_backup_test_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&backup_dir);
        let item = create_auto_safety_backup(&conn, Some(&backup_dir), "before_reset")
            .unwrap()
            .expect("expected safety backup metadata");
        let saved_path = backup_dir.join(&item.filename);
        assert!(saved_path.exists());
        assert!(item.size_bytes > 0);
        let snap_conn = Connection::open(&saved_path).unwrap();
        let user_count: i64 = snap_conn
            .query_row("SELECT COUNT(*) FROM app_users", [], |r| r.get(0))
            .unwrap();
        assert_eq!(user_count, 3);
        drop(snap_conn);
        let _ = std::fs::remove_dir_all(&backup_dir);
    }
}
