pub mod migrations;

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Shared database handle managed by Tauri.
pub struct DbState {
    pub conn: Mutex<Connection>,
    pub active_branch: Mutex<String>,
}

impl DbState {
    pub fn new(conn: Connection) -> Self {
        let active = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'active_branch'",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "main".to_string());
        Self {
            conn: Mutex::new(conn),
            active_branch: Mutex::new(active),
        }
    }

    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| AppError::Lock)
    }

    pub fn active_branch(&self) -> AppResult<String> {
        let b = self.active_branch.lock().map_err(|_| AppError::Lock)?;
        Ok(b.clone())
    }

    pub fn set_active_branch(&self, branch_id: &str) -> AppResult<()> {
        let mut b = self.active_branch.lock().map_err(|_| AppError::Lock)?;
        *b = branch_id.to_string();
        Ok(())
    }
}

fn configure(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    // journal_mode returns a row, so read it instead of using execute.
    let _mode: String = conn.query_row("PRAGMA journal_mode = WAL;", [], |r| r.get(0))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

/// Open (creating if needed) the database file and apply pending migrations.
pub fn open(path: &Path) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;
    configure(&conn)?;
    migrations::run(&mut conn)?;
    Ok(conn)
}

/// In-memory database with the full schema. Used by unit tests.
pub fn open_in_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configure(&conn)?;
    migrations::run(&mut conn)?;
    Ok(conn)
}
