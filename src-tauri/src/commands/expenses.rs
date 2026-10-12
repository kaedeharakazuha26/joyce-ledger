use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    require_amount, require_date, require_text, validate_filter, DateFilter, Expense,
    ExpenseInput, Totals,
};

const SELECT: &str =
    "SELECT id, category, amount, expense_date, created_at, updated_at FROM expenses";
const RANGE: &str = "(?1 IS NULL OR expense_date >= ?1) AND (?2 IS NULL OR expense_date <= ?2) AND branch_id = ?3";

fn from_row(r: &Row) -> rusqlite::Result<Expense> {
    Ok(Expense {
        id: r.get(0)?,
        category: r.get(1)?,
        amount: r.get(2)?,
        date: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

fn clean(input: &ExpenseInput) -> AppResult<ExpenseInput> {
    Ok(ExpenseInput {
        category: require_text("Category", &input.category)?,
        amount: require_amount(input.amount)?,
        date: require_date(&input.date)?,
    })
}

pub fn list(conn: &Connection, filter: &DateFilter, branch_id: &str) -> AppResult<Vec<Expense>> {
    let (from, to) = validate_filter(filter)?;
    let mut stmt =
        conn.prepare(&format!("{SELECT} WHERE {RANGE} ORDER BY expense_date DESC, id DESC"))?;
    let rows = stmt
        .query_map(params![from, to, branch_id], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Expense> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn create(conn: &Connection, input: &ExpenseInput, branch_id: &str) -> AppResult<Expense> {
    let i = clean(input)?;
    conn.execute(
        "INSERT INTO expenses (category, amount, expense_date, branch_id) VALUES (?1, ?2, ?3, ?4)",
        params![i.category, i.amount, i.date, branch_id],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &ExpenseInput) -> AppResult<Expense> {
    let i = clean(input)?;
    let n = conn.execute(
        "UPDATE expenses SET category = ?1, amount = ?2, expense_date = ?3,
         updated_at = datetime('now','localtime') WHERE id = ?4",
        params![i.category, i.amount, i.date, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if conn.execute("DELETE FROM expenses WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn totals(conn: &Connection, filter: &DateFilter, branch_id: &str) -> AppResult<Totals> {
    let (from, to) = validate_filter(filter)?;
    Ok(conn.query_row(
        &format!("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM expenses WHERE {RANGE}"),
        params![from, to, branch_id],
        |r| Ok(Totals { count: r.get(0)?, amount: r.get(1)?, quantity: 0 }),
    )?)
}

#[tauri::command]
pub fn list_expenses(
    state: State<'_, DbState>,
    filter: Option<DateFilter>,
    branch: Option<String>,
) -> AppResult<Vec<Expense>> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    list(&*state.conn()?, &filter.unwrap_or_default(), &branch_id)
}

#[tauri::command]
pub fn create_expenses(
    state: State<'_, DbState>,
    input: ExpenseInput,
    branch: Option<String>,
) -> AppResult<Expense> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    create(&*state.conn()?, &input, &branch_id)
}

#[tauri::command]
pub fn update_expenses(
    state: State<'_, DbState>,
    id: i64,
    input: ExpenseInput,
) -> AppResult<Expense> {
    update(&*state.conn()?, id, &input)
}

#[tauri::command]
pub fn delete_expenses(state: State<'_, DbState>, id: i64, pin: String) -> AppResult<()> {
    let conn = state.conn()?;
    crate::commands::admin::check_pin(&conn, &pin)?;
    delete(&conn, id)
}

#[tauri::command]
pub fn totals_expenses(
    state: State<'_, DbState>,
    filter: Option<DateFilter>,
    branch: Option<String>,
) -> AppResult<Totals> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    totals(&*state.conn()?, &filter.unwrap_or_default(), &branch_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn input(category: &str, amount: i64, date: &str) -> ExpenseInput {
        ExpenseInput { category: category.into(), amount, date: date.into() }
    }

    #[test]
    fn crud_and_filter() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &input("Ice", 20_000, "2026-10-01"), "main").unwrap();
        create(&conn, &input("Gas", 75_050, "2026-10-13"), "main").unwrap();

        assert_eq!(list(&conn, &DateFilter::default(), "main").unwrap().len(), 2);
        let oct13 = DateFilter { from: Some("2026-10-13".into()), to: Some("2026-10-13".into()) };
        let rows = list(&conn, &oct13, "main").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].category, "Gas");
        assert_eq!(totals(&conn, &oct13, "main").unwrap().amount, 75_050);

        let from_only = DateFilter { from: Some("2026-10-02".into()), to: None };
        assert_eq!(list(&conn, &from_only, "main").unwrap().len(), 1);

        let u = update(&conn, a.id, &input("Ice cubes", 21_000, "2026-10-01")).unwrap();
        assert_eq!((u.category.as_str(), u.amount), ("Ice cubes", 21_000));

        delete(&conn, a.id).unwrap();
        assert_eq!(list(&conn, &DateFilter::default(), "main").unwrap().len(), 1);
        assert!(matches!(update(&conn, a.id, &input("x", 1, "2026-10-01")), Err(AppError::NotFound)));
    }

    #[test]
    fn rejects_invalid() {
        let conn = open_in_memory().unwrap();
        assert!(create(&conn, &input(" ", 1, "2026-10-13"), "main").is_err());
        assert!(create(&conn, &input("Gas", -1, "2026-10-13"), "main").is_err());
        assert!(create(&conn, &input("Gas", 1, "2026-02-30"), "main").is_err());
    }
}
