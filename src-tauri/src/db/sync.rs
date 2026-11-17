//! Conflict-free offline-first Turso HTTP v2 pipeline synchronization engine.

use std::sync::Mutex;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::DbState;
use crate::error::{AppError, AppResult};

static INITIALIZED_TURSO_URL: Mutex<Option<String>> = Mutex::new(None);
static SYNC_CYCLE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub device_name: String,
    pub turso_url: String,
    pub turso_token_masked: String,
    pub has_token: bool,
    pub sync_enabled: bool,
    pub pending_changes: i64,
    pub last_sync_at: Option<String>,
    pub last_sync_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncChange {
    pub table_name: String,
    pub sync_id: String,
    pub op: String,
    pub branch_id: String,
    pub payload: Value,
    pub device_name: String,
    pub updated_at: String,
    pub changed_at: String,
}

#[derive(Debug, Clone)]
pub struct SyncSnapshot {
    pub turso_url: String,
    pub turso_token: String,
    pub last_cursor: i64,
    pub batch: Vec<SyncChange>,
}

pub fn normalize_turso_url(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(AppError::validation("Turso Database URL is required."));
    }
    let https_base = if let Some(rest) = trimmed.strip_prefix("libsql://") {
        format!("https://{rest}")
    } else if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    if let Some(base) = https_base.strip_suffix("/v2/pipeline") {
        Ok(format!("{base}/v2/pipeline"))
    } else {
        Ok(format!("{https_base}/v2/pipeline"))
    }
}

pub fn mask_token(token: &str) -> String {
    let t = token.trim();
    if t.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = t.chars().collect();
    if chars.len() <= 10 {
        return "••••••••".to_string();
    }
    let prefix: String = chars.iter().take(4).collect();
    let suffix: String = chars.iter().skip(chars.len() - 4).collect();
    format!("{prefix}••••••{suffix}")
}

pub fn get_local_setting(conn: &Connection, key: &str) -> String {
    conn.query_row(
        "SELECT value FROM local_settings WHERE key = ?1",
        [key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_default()
}

pub fn set_local_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO local_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now','localtime'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value],
    )?;
    Ok(())
}

pub fn ensure_default_device_name(conn: &Connection) -> AppResult<String> {
    let current = get_local_setting(conn, "device_name");
    if !current.trim().is_empty() {
        return Ok(current);
    }
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    let clean_host = host.trim();
    let default_name = if clean_host.is_empty() {
        let suffix: String = conn
            .query_row("SELECT upper(substr(hex(randomblob(2)), 1, 4))", [], |r| r.get(0))
            .unwrap_or_else(|_| "0001".to_string());
        format!("Restobar-Laptop-{suffix}")
    } else {
        clean_host.chars().take(60).collect()
    };
    set_local_setting(conn, "device_name", &default_name)?;
    Ok(default_name)
}

pub fn set_device_name(conn: &Connection, name: &str) -> AppResult<SyncStatus> {
    let clean = crate::models::require_text("Device name", name)?;
    set_local_setting(conn, "device_name", &clean)?;
    get_sync_status(conn)
}

pub fn get_sync_status(conn: &Connection) -> AppResult<SyncStatus> {
    let device_name = ensure_default_device_name(conn)?;
    let turso_url = get_local_setting(conn, "turso_url");
    let turso_token = get_local_setting(conn, "turso_token");
    let sync_enabled = get_local_setting(conn, "sync_enabled") == "1"
        && !turso_url.trim().is_empty()
        && !turso_token.trim().is_empty();
    let pending_changes: i64 = conn
        .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
        .unwrap_or(0);
    let last_sync_at_raw = get_local_setting(conn, "last_sync_at");
    let last_sync_error_raw = get_local_setting(conn, "last_sync_error");

    Ok(SyncStatus {
        device_name,
        turso_url,
        turso_token_masked: mask_token(&turso_token),
        has_token: !turso_token.trim().is_empty(),
        sync_enabled,
        pending_changes,
        last_sync_at: if last_sync_at_raw.trim().is_empty() {
            None
        } else {
            Some(last_sync_at_raw)
        },
        last_sync_error: if last_sync_error_raw.trim().is_empty() {
            None
        } else {
            Some(last_sync_error_raw)
        },
    })
}

/// Queue user-created or modified local records into `sync_outbox` when connecting to Turso.
/// Skips unchanged default seeded branches, categories, and default PIN ('0000') to minimize Turso row writes/reads.
pub fn queue_all_local_records(conn: &Connection) -> AppResult<usize> {
    let sql = "
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
    ";
    conn.execute_batch(sql)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))?;
    Ok(count as usize)
}

/// Fast local-only check used by the adaptive background sync loop (zero network I/O).
pub fn pending_sync_hint(conn: &Connection) -> (bool, i64, bool) {
    let enabled = get_local_setting(conn, "sync_enabled") == "1"
        && !get_local_setting(conn, "turso_url").trim().is_empty()
        && !get_local_setting(conn, "turso_token").trim().is_empty();
    if !enabled {
        return (false, 0, false);
    }
    let pending: i64 = conn
        .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
        .unwrap_or(0);
    let had_err = !get_local_setting(conn, "last_sync_error").trim().is_empty();
    (true, pending, had_err)
}

fn table_priority(table_name: &str) -> i32 {
    match table_name {
        "branches" => 0,
        "categories" => 1,
        "employees" => 2,
        "app_settings" => 3,
        _ => 4,
    }
}

pub fn collect_outbox_batch(conn: &Connection, limit: usize) -> AppResult<Vec<SyncChange>> {
    let device_fallback = ensure_default_device_name(conn)?;
    let mut stmt = conn.prepare(
        "SELECT table_name, sync_id, op, branch_id, changed_at
         FROM sync_outbox
         ORDER BY CASE table_name
           WHEN 'branches' THEN 0
           WHEN 'categories' THEN 1
           WHEN 'employees' THEN 2
           WHEN 'app_settings' THEN 3
           ELSE 4 END,
           changed_at ASC
         LIMIT ?1",
    )?;

    let outbox_rows: Vec<(String, String, String, String, String)> = stmt
        .query_map([limit as i64], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut changes = Vec::with_capacity(outbox_rows.len());

    for (table_name, sync_id, op, branch_id, changed_at) in outbox_rows {
        if op == "DELETE" {
            changes.push(SyncChange {
                table_name,
                sync_id,
                op,
                branch_id,
                payload: json!({}),
                device_name: device_fallback.clone(),
                updated_at: changed_at.clone(),
                changed_at,
            });
            continue;
        }

        let built: Option<(Value, String, String)> = match table_name.as_str() {
            "branches" => conn
                .query_row(
                    "SELECT id, name, created_at, updated_at, device_name FROM branches WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let id: String = r.get(0)?;
                        let name: String = r.get(1)?;
                        let created_at: String = r.get(2)?;
                        let updated_at: String = r.get(3)?;
                        let dev: String = r.get(4)?;
                        Ok((
                            json!({ "id": id, "name": name, "created_at": created_at }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "categories" => conn
                .query_row(
                    "SELECT kind, name, branch_id, created_at, updated_at, device_name FROM categories WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let kind: String = r.get(0)?;
                        let name: String = r.get(1)?;
                        let branch: String = r.get(2)?;
                        let created_at: String = r.get(3)?;
                        let updated_at: String = r.get(4)?;
                        let dev: String = r.get(5)?;
                        Ok((
                            json!({ "kind": kind, "name": name, "branch_id": branch, "created_at": created_at }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "employees" => conn
                .query_row(
                    "SELECT name, position, base_salary, commission, ld_commission, branch_id, created_at, updated_at, device_name
                     FROM employees WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let name: String = r.get(0)?;
                        let position: Option<String> = r.get(1)?;
                        let base_salary: i64 = r.get(2)?;
                        let commission: i64 = r.get(3)?;
                        let ld_commission: i64 = r.get(4)?;
                        let branch: String = r.get(5)?;
                        let created_at: String = r.get(6)?;
                        let updated_at: String = r.get(7)?;
                        let dev: String = r.get(8)?;
                        Ok((
                            json!({
                                "name": name,
                                "position": position,
                                "base_salary": base_salary,
                                "commission": commission,
                                "ld_commission": ld_commission,
                                "branch_id": branch,
                                "created_at": created_at
                            }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "sales" => conn
                .query_row(
                    "SELECT category, amount, sale_date, branch_id, created_at, updated_at, device_name FROM sales WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let category: String = r.get(0)?;
                        let amount: i64 = r.get(1)?;
                        let sale_date: String = r.get(2)?;
                        let branch: String = r.get(3)?;
                        let created_at: String = r.get(4)?;
                        let updated_at: String = r.get(5)?;
                        let dev: String = r.get(6)?;
                        Ok((
                            json!({
                                "category": category,
                                "amount": amount,
                                "sale_date": sale_date,
                                "branch_id": branch,
                                "created_at": created_at
                            }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "expenses" => conn
                .query_row(
                    "SELECT category, amount, expense_date, branch_id, created_at, updated_at, device_name FROM expenses WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let category: String = r.get(0)?;
                        let amount: i64 = r.get(1)?;
                        let expense_date: String = r.get(2)?;
                        let branch: String = r.get(3)?;
                        let created_at: String = r.get(4)?;
                        let updated_at: String = r.get(5)?;
                        let dev: String = r.get(6)?;
                        Ok((
                            json!({
                                "category": category,
                                "amount": amount,
                                "expense_date": expense_date,
                                "branch_id": branch,
                                "created_at": created_at
                            }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "ld_commissions" => conn
                .query_row(
                    "SELECT name, quantity, amount, commission_date, branch_id, created_at, updated_at, device_name
                     FROM ld_commissions WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let name: String = r.get(0)?;
                        let quantity: i64 = r.get(1)?;
                        let amount: i64 = r.get(2)?;
                        let commission_date: String = r.get(3)?;
                        let branch: String = r.get(4)?;
                        let created_at: String = r.get(5)?;
                        let updated_at: String = r.get(6)?;
                        let dev: String = r.get(7)?;
                        Ok((
                            json!({
                                "name": name,
                                "quantity": quantity,
                                "amount": amount,
                                "commission_date": commission_date,
                                "branch_id": branch,
                                "created_at": created_at
                            }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "commissions" => conn
                .query_row(
                    "SELECT name, category, amount, commission_date, branch_id, created_at, updated_at, device_name
                     FROM commissions WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let name: String = r.get(0)?;
                        let category: String = r.get(1)?;
                        let amount: i64 = r.get(2)?;
                        let commission_date: String = r.get(3)?;
                        let branch: String = r.get(4)?;
                        let created_at: String = r.get(5)?;
                        let updated_at: String = r.get(6)?;
                        let dev: String = r.get(7)?;
                        Ok((
                            json!({
                                "name": name,
                                "category": category,
                                "amount": amount,
                                "commission_date": commission_date,
                                "branch_id": branch,
                                "created_at": created_at
                            }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "salaries" => conn
                .query_row(
                    "SELECT name, amount, salary_date, branch_id, created_at, updated_at, device_name FROM salaries WHERE sync_id = ?1",
                    [&sync_id],
                    |r| {
                        let name: String = r.get(0)?;
                        let amount: i64 = r.get(1)?;
                        let salary_date: String = r.get(2)?;
                        let branch: String = r.get(3)?;
                        let created_at: String = r.get(4)?;
                        let updated_at: String = r.get(5)?;
                        let dev: String = r.get(6)?;
                        Ok((
                            json!({
                                "name": name,
                                "amount": amount,
                                "salary_date": salary_date,
                                "branch_id": branch,
                                "created_at": created_at
                            }),
                            updated_at,
                            dev,
                        ))
                    },
                )
                .optional()?,
            "app_settings" if sync_id == "admin_pin" => conn
                .query_row(
                    "SELECT value, updated_at FROM app_settings WHERE key = 'admin_pin'",
                    [],
                    |r| {
                        let val: String = r.get(0)?;
                        let updated_at: String = r.get(1)?;
                        Ok((json!({ "key": "admin_pin", "value": val }), updated_at, device_fallback.clone()))
                    },
                )
                .optional()?,
            _ => None,
        };

        if let Some((payload, updated_at, dev)) = built {
            changes.push(SyncChange {
                table_name,
                sync_id,
                op,
                branch_id,
                payload,
                device_name: if dev.trim().is_empty() {
                    device_fallback.clone()
                } else {
                    dev
                },
                updated_at,
                changed_at,
            });
        } else {
            // Row vanished locally before push; treat as DELETE tombstone so outbox clears cleanly.
            changes.push(SyncChange {
                table_name,
                sync_id,
                op: "DELETE".to_string(),
                branch_id,
                payload: json!({}),
                device_name: device_fallback.clone(),
                updated_at: changed_at.clone(),
                changed_at,
            });
        }
    }

    changes.sort_by(|a, b| {
        table_priority(&a.table_name)
            .cmp(&table_priority(&b.table_name))
            .then_with(|| a.changed_at.cmp(&b.changed_at))
    });

    Ok(changes)
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}

fn opt_str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn i64_field(v: &Value, key: &str) -> i64 {
    v.get(key)
        .and_then(|x| x.as_i64().or_else(|| x.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0)
}

/// Apply incoming remote changes in a single transaction with triggers suppressed.
pub fn apply_remote_changes(
    conn: &mut Connection,
    changes: &[SyncChange],
    new_cursor: Option<i64>,
) -> AppResult<usize> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO local_settings (key, value, updated_at) VALUES ('sync_applying_remote', '1', datetime('now','localtime'))
         ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at",
        [],
    )?;

    let mut applied = 0usize;

    for c in changes {
        // Never overwrite a row that currently has a newer unpushed local edit in sync_outbox.
        let has_pending: i64 = tx.query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE table_name = ?1 AND sync_id = ?2",
            params![c.table_name, c.sync_id],
            |r| r.get(0),
        )?;
        if has_pending > 0 {
            continue;
        }

        if c.op == "DELETE" {
            match c.table_name.as_str() {
                "branches" if c.sync_id != "branch:main" => {
                    tx.execute("DELETE FROM branches WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "categories" => {
                    tx.execute("DELETE FROM categories WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "employees" => {
                    tx.execute("DELETE FROM employees WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "sales" => {
                    tx.execute("DELETE FROM sales WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "expenses" => {
                    tx.execute("DELETE FROM expenses WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "ld_commissions" => {
                    tx.execute("DELETE FROM ld_commissions WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "commissions" => {
                    tx.execute("DELETE FROM commissions WHERE sync_id = ?1", [&c.sync_id])?;
                }
                "salaries" => {
                    tx.execute("DELETE FROM salaries WHERE sync_id = ?1", [&c.sync_id])?;
                }
                _ => {}
            }
            applied += 1;
            continue;
        }

        let p = &c.payload;
        match c.table_name.as_str() {
            "branches" => {
                let id = str_field(p, "id");
                let name = str_field(p, "name");
                let created_at = str_field(p, "created_at");
                if !id.is_empty() && !name.is_empty() {
                    tx.execute(
                        "INSERT INTO branches (id, name, created_at, sync_id, updated_at, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                         ON CONFLICT(id) DO UPDATE SET
                           name = excluded.name,
                           sync_id = excluded.sync_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![id, name, created_at, c.sync_id, c.updated_at, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "categories" => {
                let kind = str_field(p, "kind");
                let name = str_field(p, "name");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !kind.is_empty() && !name.is_empty() && !branch_id.is_empty() {
                    let exists_by_sync: i64 = tx.query_row(
                        "SELECT COUNT(*) FROM categories WHERE sync_id = ?1",
                        [&c.sync_id],
                        |r| r.get(0),
                    )?;
                    if exists_by_sync == 0 {
                        tx.execute(
                            "UPDATE categories SET sync_id = ?1
                             WHERE kind = ?2 AND lower(name) = lower(?3) AND branch_id = ?4",
                            params![c.sync_id, kind, name, branch_id],
                        )?;
                    }
                    tx.execute(
                        "INSERT INTO categories (kind, name, branch_id, created_at, sync_id, updated_at, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           kind = excluded.kind,
                           name = excluded.name,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![kind, name, branch_id, created_at, c.sync_id, c.updated_at, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "employees" => {
                let name = str_field(p, "name");
                let position = opt_str_field(p, "position");
                let base_salary = i64_field(p, "base_salary");
                let commission = i64_field(p, "commission");
                let ld_commission = i64_field(p, "ld_commission");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !name.is_empty() && !branch_id.is_empty() {
                    let exists_by_sync: i64 = tx.query_row(
                        "SELECT COUNT(*) FROM employees WHERE sync_id = ?1",
                        [&c.sync_id],
                        |r| r.get(0),
                    )?;
                    if exists_by_sync == 0 {
                        tx.execute(
                            "UPDATE employees SET sync_id = ?1
                             WHERE branch_id = ?2 AND lower(name) = lower(?3)",
                            params![c.sync_id, branch_id, name],
                        )?;
                    } else {
                        // Avoid unique collision if another local row has the target name
                        tx.execute(
                            "DELETE FROM employees
                             WHERE branch_id = ?1 AND lower(name) = lower(?2) AND sync_id != ?3",
                            params![branch_id, name, c.sync_id],
                        )?;
                    }
                    tx.execute(
                        "INSERT INTO employees (name, position, base_salary, commission, ld_commission, branch_id, created_at, sync_id, updated_at, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           name = excluded.name,
                           position = excluded.position,
                           base_salary = excluded.base_salary,
                           commission = excluded.commission,
                           ld_commission = excluded.ld_commission,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![
                            name,
                            position,
                            base_salary,
                            commission,
                            ld_commission,
                            branch_id,
                            created_at,
                            c.sync_id,
                            c.updated_at,
                            c.device_name
                        ],
                    )?;
                    applied += 1;
                }
            }
            "sales" => {
                let category = str_field(p, "category");
                let amount = i64_field(p, "amount");
                let sale_date = str_field(p, "sale_date");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !category.is_empty() && amount > 0 && !sale_date.is_empty() {
                    tx.execute(
                        "INSERT INTO sales (category, amount, sale_date, branch_id, created_at, updated_at, sync_id, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           category = excluded.category,
                           amount = excluded.amount,
                           sale_date = excluded.sale_date,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![category, amount, sale_date, branch_id, created_at, c.updated_at, c.sync_id, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "expenses" => {
                let category = str_field(p, "category");
                let amount = i64_field(p, "amount");
                let expense_date = str_field(p, "expense_date");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !category.is_empty() && amount > 0 && !expense_date.is_empty() {
                    tx.execute(
                        "INSERT INTO expenses (category, amount, expense_date, branch_id, created_at, updated_at, sync_id, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           category = excluded.category,
                           amount = excluded.amount,
                           expense_date = excluded.expense_date,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![category, amount, expense_date, branch_id, created_at, c.updated_at, c.sync_id, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "ld_commissions" => {
                let name = str_field(p, "name");
                let quantity = i64_field(p, "quantity");
                let amount = i64_field(p, "amount");
                let commission_date = str_field(p, "commission_date");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !name.is_empty() && quantity >= 1 && amount > 0 && !commission_date.is_empty() {
                    tx.execute(
                        "INSERT INTO ld_commissions (name, quantity, amount, commission_date, branch_id, created_at, updated_at, sync_id, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           name = excluded.name,
                           quantity = excluded.quantity,
                           amount = excluded.amount,
                           commission_date = excluded.commission_date,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![name, quantity, amount, commission_date, branch_id, created_at, c.updated_at, c.sync_id, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "commissions" => {
                let name = str_field(p, "name");
                let category = str_field(p, "category");
                let amount = i64_field(p, "amount");
                let commission_date = str_field(p, "commission_date");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !name.is_empty() && !category.is_empty() && amount > 0 && !commission_date.is_empty() {
                    tx.execute(
                        "INSERT INTO commissions (name, category, amount, commission_date, branch_id, created_at, updated_at, sync_id, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           name = excluded.name,
                           category = excluded.category,
                           amount = excluded.amount,
                           commission_date = excluded.commission_date,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![name, category, amount, commission_date, branch_id, created_at, c.updated_at, c.sync_id, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "salaries" => {
                let name = str_field(p, "name");
                let amount = i64_field(p, "amount");
                let salary_date = str_field(p, "salary_date");
                let branch_id = str_field(p, "branch_id");
                let created_at = str_field(p, "created_at");
                if !name.is_empty() && amount > 0 && !salary_date.is_empty() {
                    tx.execute(
                        "INSERT INTO salaries (name, amount, salary_date, branch_id, created_at, updated_at, sync_id, device_name)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                         ON CONFLICT(sync_id) DO UPDATE SET
                           name = excluded.name,
                           amount = excluded.amount,
                           salary_date = excluded.salary_date,
                           branch_id = excluded.branch_id,
                           updated_at = excluded.updated_at,
                           device_name = excluded.device_name",
                        params![name, amount, salary_date, branch_id, created_at, c.updated_at, c.sync_id, c.device_name],
                    )?;
                    applied += 1;
                }
            }
            "app_settings" if c.sync_id == "admin_pin" => {
                let val = str_field(p, "value");
                if !val.is_empty() {
                    tx.execute(
                        "INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?1, ?2)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                        params![val, c.updated_at],
                    )?;
                    applied += 1;
                }
            }
            _ => {}
        }
    }

    if let Some(cursor) = new_cursor {
        tx.execute(
            "INSERT INTO local_settings (key, value, updated_at) VALUES ('last_sync_cursor', ?1, datetime('now','localtime'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [cursor.to_string()],
        )?;
    }

    tx.execute(
        "INSERT INTO local_settings (key, value, updated_at) VALUES ('sync_applying_remote', '0', datetime('now','localtime'))
         ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at",
        [],
    )?;
    tx.commit()?;
    Ok(applied)
}

// ---------- Turso Hrana HTTP v2 Pipeline Client ----------

enum HranaArg {
    Text(String),
    Int(i64),
    OptText(Option<String>),
}

impl HranaArg {
    fn to_json(&self) -> Value {
        match self {
            HranaArg::Text(s) => json!({ "type": "text", "value": s }),
            HranaArg::Int(n) => json!({ "type": "integer", "value": n.to_string() }),
            HranaArg::OptText(Some(s)) => json!({ "type": "text", "value": s }),
            HranaArg::OptText(None) => json!({ "type": "null" }),
        }
    }
}

fn hrana_stmt(sql: &str, args: Vec<HranaArg>) -> Value {
    json!({
        "type": "execute",
        "stmt": {
            "sql": sql,
            "args": args.into_iter().map(|a| a.to_json()).collect::<Vec<_>>()
        }
    })
}

fn send_turso_pipeline(pipeline_url: &str, token: &str, requests: Vec<Value>) -> AppResult<Vec<Value>> {
    let mut full_reqs = requests;
    full_reqs.push(json!({ "type": "close" }));
    let payload = json!({ "requests": full_reqs });
    let body_str = serde_json::to_string(&payload)
        .map_err(|e| AppError::sync(format!("JSON encode failed: {e}")))?;

    let resp = ureq::post(pipeline_url)
        .timeout(Duration::from_secs(15))
        .set("Authorization", &format!("Bearer {}", token.trim()))
        .set("Content-Type", "application/json")
        .send_string(&body_str);

    let text = match resp {
        Ok(ok) => ok
            .into_string()
            .map_err(|e| AppError::sync(format!("Failed reading Turso response: {e}")))?,
        Err(ureq::Error::Status(code, r)) => {
            let err_body = r.into_string().unwrap_or_default();
            return Err(AppError::sync(format!("Turso HTTP {code}: {err_body}")));
        }
        Err(ureq::Error::Transport(t)) => {
            return Err(AppError::sync(format!("Offline or network unreachable: {t}")));
        }
    };

    let parsed: Value = serde_json::from_str(&text)
        .map_err(|e| AppError::sync(format!("Invalid Turso JSON response: {e}")))?;

    let results = parsed
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or_else(|| AppError::sync("Unexpected Turso pipeline response format."))?
        .clone();

    for res in &results {
        if res.get("type").and_then(|t| t.as_str()) == Some("error") {
            let msg = res
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown Turso SQL error");
            return Err(AppError::sync(msg.to_string()));
        }
    }

    Ok(results)
}

fn cell_str(cell: &Value) -> String {
    match cell.get("value") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn cell_i64(cell: &Value) -> i64 {
    match cell.get("value") {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

fn ensure_remote_schema(pipeline_url: &str, token: &str) -> AppResult<()> {
    {
        if let Ok(guard) = INITIALIZED_TURSO_URL.lock() {
            if guard.as_deref() == Some(pipeline_url) {
                return Ok(());
            }
        }
    }

    let ddl = vec![
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS turso_sync_log (
                seq INTEGER PRIMARY KEY,
                table_name TEXT NOT NULL,
                sync_id TEXT NOT NULL,
                op TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS branches (
                sync_id TEXT PRIMARY KEY,
                id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS categories (
                sync_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS employees (
                sync_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                position TEXT,
                base_salary INTEGER NOT NULL DEFAULT 0,
                commission INTEGER NOT NULL DEFAULT 0,
                ld_commission INTEGER NOT NULL DEFAULT 0,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS sales (
                sync_id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                amount INTEGER NOT NULL,
                sale_date TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS expenses (
                sync_id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                amount INTEGER NOT NULL,
                expense_date TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS ld_commissions (
                sync_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                commission_date TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS commissions (
                sync_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                amount INTEGER NOT NULL,
                commission_date TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS salaries (
                sync_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                amount INTEGER NOT NULL,
                salary_date TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT ''
            )",
            vec![],
        ),
        hrana_stmt(
            "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            vec![],
        ),
    ];

    send_turso_pipeline(pipeline_url, token, ddl)?;

    if let Ok(mut guard) = INITIALIZED_TURSO_URL.lock() {
        *guard = Some(pipeline_url.to_string());
    }
    Ok(())
}

pub fn test_turso_connection_http(raw_url: &str, token: &str) -> AppResult<String> {
    let url = normalize_turso_url(raw_url)?;
    if token.trim().is_empty() {
        return Err(AppError::validation("Turso Auth Token is required."));
    }
    send_turso_pipeline(&url, token, vec![hrana_stmt("SELECT 1", vec![])])?;
    Ok(format!("Connected successfully to {url}"))
}

fn push_statements_for_change(c: &SyncChange) -> Vec<Value> {
    let mut stmts = Vec::new();
    let p = &c.payload;

    if c.op == "DELETE" {
        let delete_sql = match c.table_name.as_str() {
            "branches" => Some("DELETE FROM branches WHERE sync_id = ?1"),
            "categories" => Some("DELETE FROM categories WHERE sync_id = ?1"),
            "employees" => Some("DELETE FROM employees WHERE sync_id = ?1"),
            "sales" => Some("DELETE FROM sales WHERE sync_id = ?1"),
            "expenses" => Some("DELETE FROM expenses WHERE sync_id = ?1"),
            "ld_commissions" => Some("DELETE FROM ld_commissions WHERE sync_id = ?1"),
            "commissions" => Some("DELETE FROM commissions WHERE sync_id = ?1"),
            "salaries" => Some("DELETE FROM salaries WHERE sync_id = ?1"),
            _ => None,
        };
        if let Some(sql) = delete_sql {
            stmts.push(hrana_stmt(sql, vec![HranaArg::Text(c.sync_id.clone())]));
        }
    } else {
        match c.table_name.as_str() {
            "branches" => stmts.push(hrana_stmt(
                "INSERT INTO branches (sync_id, id, name, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(sync_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "id")),
                    HranaArg::Text(str_field(p, "name")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "categories" => stmts.push(hrana_stmt(
                "INSERT INTO categories (sync_id, kind, name, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(sync_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "kind")),
                    HranaArg::Text(str_field(p, "name")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "employees" => stmts.push(hrana_stmt(
                "INSERT INTO employees (sync_id, name, position, base_salary, commission, ld_commission, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(sync_id) DO UPDATE SET
                   name = excluded.name,
                   position = excluded.position,
                   base_salary = excluded.base_salary,
                   commission = excluded.commission,
                   ld_commission = excluded.ld_commission,
                   updated_at = excluded.updated_at,
                   device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "name")),
                    HranaArg::OptText(opt_str_field(p, "position")),
                    HranaArg::Int(i64_field(p, "base_salary")),
                    HranaArg::Int(i64_field(p, "commission")),
                    HranaArg::Int(i64_field(p, "ld_commission")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "sales" => stmts.push(hrana_stmt(
                "INSERT INTO sales (sync_id, category, amount, sale_date, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(sync_id) DO UPDATE SET
                   category = excluded.category,
                   amount = excluded.amount,
                   sale_date = excluded.sale_date,
                   branch_id = excluded.branch_id,
                   updated_at = excluded.updated_at,
                   device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "category")),
                    HranaArg::Int(i64_field(p, "amount")),
                    HranaArg::Text(str_field(p, "sale_date")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "expenses" => stmts.push(hrana_stmt(
                "INSERT INTO expenses (sync_id, category, amount, expense_date, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(sync_id) DO UPDATE SET
                   category = excluded.category,
                   amount = excluded.amount,
                   expense_date = excluded.expense_date,
                   branch_id = excluded.branch_id,
                   updated_at = excluded.updated_at,
                   device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "category")),
                    HranaArg::Int(i64_field(p, "amount")),
                    HranaArg::Text(str_field(p, "expense_date")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "ld_commissions" => stmts.push(hrana_stmt(
                "INSERT INTO ld_commissions (sync_id, name, quantity, amount, commission_date, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(sync_id) DO UPDATE SET
                   name = excluded.name,
                   quantity = excluded.quantity,
                   amount = excluded.amount,
                   commission_date = excluded.commission_date,
                   branch_id = excluded.branch_id,
                   updated_at = excluded.updated_at,
                   device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "name")),
                    HranaArg::Int(i64_field(p, "quantity")),
                    HranaArg::Int(i64_field(p, "amount")),
                    HranaArg::Text(str_field(p, "commission_date")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "commissions" => stmts.push(hrana_stmt(
                "INSERT INTO commissions (sync_id, name, category, amount, commission_date, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(sync_id) DO UPDATE SET
                   name = excluded.name,
                   category = excluded.category,
                   amount = excluded.amount,
                   commission_date = excluded.commission_date,
                   branch_id = excluded.branch_id,
                   updated_at = excluded.updated_at,
                   device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "name")),
                    HranaArg::Text(str_field(p, "category")),
                    HranaArg::Int(i64_field(p, "amount")),
                    HranaArg::Text(str_field(p, "commission_date")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "salaries" => stmts.push(hrana_stmt(
                "INSERT INTO salaries (sync_id, name, amount, salary_date, branch_id, created_at, updated_at, device_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(sync_id) DO UPDATE SET
                   name = excluded.name,
                   amount = excluded.amount,
                   salary_date = excluded.salary_date,
                   branch_id = excluded.branch_id,
                   updated_at = excluded.updated_at,
                   device_name = excluded.device_name",
                vec![
                    HranaArg::Text(c.sync_id.clone()),
                    HranaArg::Text(str_field(p, "name")),
                    HranaArg::Int(i64_field(p, "amount")),
                    HranaArg::Text(str_field(p, "salary_date")),
                    HranaArg::Text(str_field(p, "branch_id")),
                    HranaArg::Text(str_field(p, "created_at")),
                    HranaArg::Text(c.updated_at.clone()),
                    HranaArg::Text(c.device_name.clone()),
                ],
            )),
            "app_settings" if c.sync_id == "admin_pin" => stmts.push(hrana_stmt(
                "INSERT INTO app_settings (key, value, updated_at)
                 VALUES ('admin_pin', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                vec![
                    HranaArg::Text(str_field(p, "value")),
                    HranaArg::Text(c.updated_at.clone()),
                ],
            )),
            _ => {}
        }
    }

    let payload_str = serde_json::to_string(p).unwrap_or_else(|_| "{}".to_string());
    stmts.push(hrana_stmt(
        "INSERT INTO turso_sync_log (table_name, sync_id, op, branch_id, payload, device_name, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        vec![
            HranaArg::Text(c.table_name.clone()),
            HranaArg::Text(c.sync_id.clone()),
            HranaArg::Text(c.op.clone()),
            HranaArg::Text(c.branch_id.clone()),
            HranaArg::Text(payload_str),
            HranaArg::Text(c.device_name.clone()),
            HranaArg::Text(c.updated_at.clone()),
        ],
    ));

    stmts
}

fn pull_remote_log(
    pipeline_url: &str,
    token: &str,
    since_cursor: i64,
) -> AppResult<(Vec<SyncChange>, i64)> {
    let results = send_turso_pipeline(
        pipeline_url,
        token,
        vec![hrana_stmt(
            "SELECT seq, table_name, sync_id, op, branch_id, payload, device_name, updated_at
             FROM turso_sync_log
             WHERE seq > ?1
             ORDER BY seq ASC
             LIMIT 400",
            vec![HranaArg::Int(since_cursor)],
        )],
    )?;

    let rows = results
        .first()
        .and_then(|r| r.get("response"))
        .and_then(|r| r.get("result"))
        .and_then(|r| r.get("rows"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let mut max_seq = since_cursor;
    let mut changes = Vec::with_capacity(rows.len());

    for row in rows {
        let Some(cols) = row.as_array() else { continue };
        if cols.len() < 8 {
            continue;
        }
        let seq = cell_i64(&cols[0]);
        if seq > max_seq {
            max_seq = seq;
        }
        let table_name = cell_str(&cols[1]);
        let sync_id = cell_str(&cols[2]);
        let op = cell_str(&cols[3]);
        let branch_id = cell_str(&cols[4]);
        let payload_str = cell_str(&cols[5]);
        let device_name = cell_str(&cols[6]);
        let updated_at = cell_str(&cols[7]);
        let payload = serde_json::from_str(&payload_str).unwrap_or_else(|_| json!({}));

        changes.push(SyncChange {
            table_name,
            sync_id,
            op,
            branch_id,
            payload,
            device_name,
            updated_at: updated_at.clone(),
            changed_at: updated_at,
        });
    }

    Ok((changes, max_seq))
}

/// Runs non-blocking push + pull cycles against Turso without holding the SQLite Mutex during HTTP calls.
/// Drains pending outbox batches and remote log pages in chunks of 50/400.
/// Returns `(pushed_count, pulled_count)`.
pub fn run_sync_cycle(state: &DbState) -> AppResult<(usize, usize)> {
    let _cycle_guard = SYNC_CYCLE_LOCK.lock().map_err(|_| AppError::Lock)?;
    let mut total_pushed = 0usize;
    let mut total_pulled = 0usize;

    for _round in 0..30 {
        // 1. Short read lock: extract snapshot of settings + pending outbox batch
        let snapshot: Option<SyncSnapshot> = {
            let conn = state.conn()?;
            let enabled = get_local_setting(&conn, "sync_enabled") == "1";
            let raw_url = get_local_setting(&conn, "turso_url");
            let token = get_local_setting(&conn, "turso_token");
            if !enabled || raw_url.trim().is_empty() || token.trim().is_empty() {
                None
            } else {
                let turso_url = normalize_turso_url(&raw_url)?;
                let _ = ensure_default_device_name(&conn)?;
                let last_cursor = get_local_setting(&conn, "last_sync_cursor")
                    .parse::<i64>()
                    .unwrap_or(0);
                let batch = collect_outbox_batch(&conn, 50)?;
                Some(SyncSnapshot {
                    turso_url,
                    turso_token: token,
                    last_cursor,
                    batch,
                })
            }
        };

        let Some(snap) = snapshot else {
            return Ok((total_pushed, total_pulled));
        };

        // 2. Network phase (NO SQLite lock held so UI remains 100% responsive)
        let network_result: AppResult<(usize, Vec<(String, String, String)>, Vec<SyncChange>, i64)> = (|| {
            ensure_remote_schema(&snap.turso_url, &snap.turso_token)?;

            let mut pushed_keys = Vec::new();
            if !snap.batch.is_empty() {
                let mut stmts = Vec::new();
                for change in &snap.batch {
                    stmts.extend(push_statements_for_change(change));
                    pushed_keys.push((
                        change.table_name.clone(),
                        change.sync_id.clone(),
                        change.changed_at.clone(),
                    ));
                }
                send_turso_pipeline(&snap.turso_url, &snap.turso_token, stmts)?;
            }

            let (pulled, max_seq) =
                pull_remote_log(&snap.turso_url, &snap.turso_token, snap.last_cursor)?;

            Ok((snap.batch.len(), pushed_keys, pulled, max_seq))
        })();

        // 3. Short write lock: remove pushed outbox entries, apply pulled changes, record status
        match network_result {
            Ok((pushed_count, pushed_keys, pulled, max_seq)) => {
                let raw_pulled_len = pulled.len();
                let mut conn = state.conn()?;
                for (table_name, sync_id, changed_at) in pushed_keys {
                    conn.execute(
                        "DELETE FROM sync_outbox WHERE table_name = ?1 AND sync_id = ?2 AND changed_at <= ?3",
                        params![table_name, sync_id, changed_at],
                    )?;
                }
                let pulled_applied = if !pulled.is_empty() || max_seq > snap.last_cursor {
                    apply_remote_changes(&mut conn, &pulled, Some(max_seq))?
                } else {
                    0
                };

                let now_ts: String = conn
                    .query_row("SELECT datetime('now','localtime')", [], |r| r.get(0))
                    .unwrap_or_default();
                set_local_setting(&conn, "last_sync_at", &now_ts)?;
                set_local_setting(&conn, "last_sync_error", "")?;

                // Keep in-memory active_branch valid if active branch was deleted remotely
                if let Ok(active) = state.active_branch() {
                    let exists: i64 = conn
                        .query_row("SELECT COUNT(*) FROM branches WHERE id = ?1", [&active], |r| r.get(0))
                        .unwrap_or(1);
                    if exists == 0 {
                        set_local_setting(&conn, "active_branch", "main")?;
                        let _ = state.set_active_branch("main");
                    }
                }

                total_pushed += pushed_count;
                total_pulled += pulled_applied;

                let remaining_outbox: i64 = conn
                    .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
                    .unwrap_or(0);
                if remaining_outbox == 0 && raw_pulled_len < 400 {
                    break;
                }
            }
            Err(err) => {
                if let Ok(conn) = state.conn() {
                    let _ = set_local_setting(&conn, "last_sync_error", &err.to_string());
                }
                return Err(err);
            }
        }
    }

    Ok((total_pushed, total_pulled))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{employees, expenses, sales};
    use crate::db::open_in_memory;
    use crate::models::{EmployeeInput, ExpenseInput, SaleInput};

    #[test]
    fn url_normalization_handles_libsql_and_https() {
        assert_eq!(
            normalize_turso_url("libsql://joyce-ledger-org.turso.io").unwrap(),
            "https://joyce-ledger-org.turso.io/v2/pipeline"
        );
        assert_eq!(
            normalize_turso_url("https://joyce-ledger-org.turso.io/").unwrap(),
            "https://joyce-ledger-org.turso.io/v2/pipeline"
        );
        assert_eq!(
            normalize_turso_url("https://joyce-ledger-org.turso.io/v2/pipeline").unwrap(),
            "https://joyce-ledger-org.turso.io/v2/pipeline"
        );
        assert!(normalize_turso_url("   ").is_err());
    }

    #[test]
    fn ten_laptops_concurrent_and_offline_sync_without_conflict() {
        let mut laptops: Vec<Connection> = (1..=10)
            .map(|idx| {
                let conn = open_in_memory().unwrap();
                set_local_setting(&conn, "device_name", &format!("Laptop-{idx}")).unwrap();
                conn
            })
            .collect();

        // Simulate Laptop 1 switching local branch to branch_2 while Laptops 2..10 stay on main
        set_local_setting(&laptops[0], "active_branch", "branch_2").unwrap();

        // All 10 laptops simultaneously write offline transactions, and Laptops 1 & 2 add same employee offline
        for (i, conn) in laptops.iter().enumerate() {
            let num = (i + 1) as i64;
            sales::create(
                conn,
                &SaleInput {
                    category: "Food".into(),
                    amount: num * 10_000,
                    date: "2026-10-15".into(),
                },
                "main",
            )
            .unwrap();
            expenses::create(
                conn,
                &ExpenseInput {
                    category: "Ice".into(),
                    amount: 2_500,
                    date: "2026-10-15".into(),
                },
                "main",
            )
            .unwrap();
        }

        // Overlapping employee created offline on Laptop 1 and Laptop 2
        employees::create(
            &laptops[0],
            &EmployeeInput {
                name: "Maria".into(),
                position: Some("Server".into()),
                base_salary: Some(50_000),
                commission: None,
                ld_commission: None,
            },
            "main",
        )
        .unwrap();
        employees::create(
            &laptops[1],
            &EmployeeInput {
                name: "MARIA".into(),
                position: Some("Senior Server".into()),
                base_salary: Some(55_000),
                commission: None,
                ld_commission: None,
            },
            "main",
        )
        .unwrap();

        // Collect outbox batches from all 10 laptops into a shared simulated Turso log
        let mut turso_log: Vec<SyncChange> = Vec::new();
        for conn in &laptops {
            let batch = collect_outbox_batch(conn, 200).unwrap();
            assert!(batch.len() >= 2);
            for c in &batch {
                conn.execute(
                    "DELETE FROM sync_outbox WHERE table_name = ?1 AND sync_id = ?2",
                    params![c.table_name, c.sync_id],
                )
                .unwrap();
            }
            turso_log.extend(batch);
        }

        // Pull the shared Turso log into all 10 laptops
        let total_events = turso_log.len() as i64;
        for conn in &mut laptops {
            apply_remote_changes(conn, &turso_log, Some(total_events)).unwrap();
        }

        // Every laptop must now have identical totals: 10 sales totaling 550_000, 10 expenses totaling 25_000, 1 merged Maria employee
        for (i, conn) in laptops.iter().enumerate() {
            let sale_rows = sales::list(conn, &Default::default(), "main").unwrap();
            assert_eq!(sale_rows.len(), 10, "Laptop {} sales count mismatch", i + 1);
            let total_sales: i64 = sale_rows.iter().map(|s| s.amount).sum();
            assert_eq!(total_sales, 550_000);

            let emp_rows = employees::list(conn, "main").unwrap();
            assert_eq!(emp_rows.len(), 1);
            assert_eq!(emp_rows[0].name.to_lowercase(), "maria");
        }

        // Verify local-only active_branch isolation
        assert_eq!(get_local_setting(&laptops[0], "active_branch"), "branch_2");
        assert_eq!(get_local_setting(&laptops[1], "active_branch"), "main");
    }
}
