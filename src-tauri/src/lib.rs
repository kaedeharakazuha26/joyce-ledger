pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod money;

use tauri::Manager;

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
            app.manage(DbState::new(conn));
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
            commands::export::export_csv,
            commands::export::backup_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Joyce Restobar Ledger");
}
