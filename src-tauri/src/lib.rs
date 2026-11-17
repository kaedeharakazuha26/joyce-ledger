pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod money;

use tauri::{Emitter, Manager};

use crate::db::DbState;

/// File name of the SQLite database inside the app data directory.
pub const DB_FILE_NAME: &str = "joyce_restobar_ledger.db";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join(DB_FILE_NAME))?;
            app.manage(DbState::with_backup_dir(conn, Some(dir.join("safety_backups"))));

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_poll = std::time::Instant::now()
                    .checked_sub(std::time::Duration::from_secs(60))
                    .unwrap_or_else(std::time::Instant::now);

                loop {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let state = handle.state::<DbState>();
                    let (enabled, pending, had_err) = {
                        match state.conn() {
                            Ok(conn) => db::sync::pending_sync_hint(&conn),
                            Err(_) => (false, 0, false),
                        }
                    };
                    if !enabled {
                        continue;
                    }

                    // Adaptive sync cadence to protect Turso row-read limits:
                    // - Push within ~2s whenever local writes exist in sync_outbox
                    // - Poll every 30s when idle, or 60s when offline/errored
                    let poll_interval = if had_err {
                        std::time::Duration::from_secs(60)
                    } else {
                        std::time::Duration::from_secs(30)
                    };
                    if pending == 0 && last_poll.elapsed() < poll_interval {
                        continue;
                    }

                    last_poll = std::time::Instant::now();
                    match db::sync::run_sync_cycle(&state) {
                        Ok((pushed, pulled)) => {
                            if pulled > 0 {
                                let _ = handle.emit("sync-updated", ());
                            }
                            if pushed > 0 || pulled > 0 {
                                let _ = handle.emit("sync-status", ());
                            }
                        }
                        Err(_) => {
                            let _ = handle.emit("sync-status", ());
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::employees::list_employees,
            commands::employees::create_employee,
            commands::employees::update_employee,
            commands::employees::delete_employee,
            commands::sales::list_sales,
            commands::sales::create_sales,
            commands::sales::update_sales,
            commands::sales::delete_sales,
            commands::sales::totals_sales,
            commands::expenses::list_expenses,
            commands::expenses::create_expenses,
            commands::expenses::update_expenses,
            commands::expenses::delete_expenses,
            commands::expenses::totals_expenses,
            commands::ld_commissions::list_ld_commissions,
            commands::ld_commissions::create_ld_commissions,
            commands::ld_commissions::update_ld_commissions,
            commands::ld_commissions::delete_ld_commissions,
            commands::ld_commissions::totals_ld_commissions,
            commands::commissions::list_commissions,
            commands::commissions::create_commissions,
            commands::commissions::update_commissions,
            commands::commissions::delete_commissions,
            commands::commissions::totals_commissions,
            commands::salaries::list_salaries,
            commands::salaries::create_salaries,
            commands::salaries::update_salaries,
            commands::salaries::delete_salaries,
            commands::salaries::totals_salaries,
            commands::suggestions::get_suggestions,
            commands::suggestions::add_category,
            commands::export::export_csv,
            commands::export::backup_database,
            commands::export::restore_database,
            commands::admin::list_branches,
            commands::admin::get_active_branch,
            commands::admin::set_active_branch,
            commands::admin::create_branch,
            commands::admin::verify_admin_pin,
            commands::admin::change_admin_pin,
            commands::admin::reset_database,
            commands::admin::delete_branch,
            commands::admin::update_branch,
            commands::admin::get_sync_settings,
            commands::admin::save_device_name,
            commands::admin::test_turso_connection,
            commands::admin::save_turso_settings,
            commands::admin::sync_now,
            commands::admin::disconnect_turso,
            commands::admin::login_with_pin,
            commands::admin::list_users,
            commands::admin::create_user,
            commands::admin::update_user,
            commands::admin::delete_user,
            commands::admin::list_safety_backups,
            commands::admin::restore_safety_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Joyce Restobar Ledger");
}
