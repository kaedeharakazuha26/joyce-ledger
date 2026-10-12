use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    require_amount, require_date, require_text, validate_filter, DateFilter, Salary, SalaryInput,
    Totals,
};

const SELECT: &str =
    "SELECT id, name, amount, salary_date, created_at, updated_at FROM salaries";
const RANGE: &str = "(?1 IS NULL OR salary_date >= ?1) AND (?2 IS NULL OR salary_date <= ?2) AND branch_id = ?3";

fn from_row(r: &Row) -> rusqlite::Result<Salary> {
    Ok(Salary {
        id: r.get(0)?,
        name: r.get(1)?,
        amount: r.get(2)?,
        date: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

fn clean(input: &SalaryInput) -> AppResult<SalaryInput> {
    Ok(SalaryInput {
        name: require_text("Name", &input.name)?,
        amount: require_amount(input.amount)?,
        date: require_date(&input.date)?,
    })
}

pub fn list(conn: &Connection, filter: &DateFilter, branch_id: &str) -> AppResult<Vec<Salary>> {
    let (from, to) = validate_filter(filter)?;
    let mut stmt =
        conn.prepare(&format!("{SELECT} WHERE {RANGE} ORDER BY salary_date DESC, id DESC"))?;
    let rows = stmt
        .query_map(params![from, to, branch_id], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Salary> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn create(conn: &Connection, input: &SalaryInput, branch_id: &str) -> AppResult<Salary> {
    let i = clean(input)?;
    conn.execute(
        "INSERT INTO salaries (name, amount, salary_date, branch_id) VALUES (?1, ?2, ?3, ?4)",
        params![i.name, i.amount, i.date, branch_id],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &SalaryInput) -> AppResult<Salary> {
    let i = clean(input)?;
    let n = conn.execute(
        "UPDATE salaries SET name = ?1, amount = ?2, salary_date = ?3,
         updated_at = datetime('now','localtime') WHERE id = ?4",
        params![i.name, i.amount, i.date, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if conn.execute("DELETE FROM salaries WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn totals(conn: &Connection, filter: &DateFilter, branch_id: &str) -> AppResult<Totals> {
    let (from, to) = validate_filter(filter)?;
    Ok(conn.query_row(
        &format!("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM salaries WHERE {RANGE}"),
        params![from, to, branch_id],
        |r| Ok(Totals { count: r.get(0)?, amount: r.get(1)?, quantity: 0 }),
    )?)
}

#[tauri::command]
pub fn list_salaries(
    state: State<'_, DbState>,
    filter: Option<DateFilter>,
    branch: Option<String>,
) -> AppResult<Vec<Salary>> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    list(&*state.conn()?, &filter.unwrap_or_default(), &branch_id)
}

#[tauri::command]
pub fn create_salaries(
    state: State<'_, DbState>,
    input: SalaryInput,
    branch: Option<String>,
) -> AppResult<Salary> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    create(&*state.conn()?, &input, &branch_id)
}

#[tauri::command]
pub fn update_salaries(
    state: State<'_, DbState>,
    id: i64,
    input: SalaryInput,
) -> AppResult<Salary> {
    update(&*state.conn()?, id, &input)
}

#[tauri::command]
pub fn delete_salaries(state: State<'_, DbState>, id: i64, pin: String) -> AppResult<()> {
    let conn = state.conn()?;
    crate::commands::admin::check_pin(&conn, &pin)?;
    delete(&conn, id)
}

#[tauri::command]
pub fn totals_salaries(
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

    fn input(name: &str, amount: i64, date: &str) -> SalaryInput {
        SalaryInput { name: name.into(), amount, date: date.into() }
    }

    #[test]
    fn crud_and_filter() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &input("Ana", 500_000, "2026-10-15"), "main").unwrap();
        create(&conn, &input("Ben", 450_000, "2026-09-30"), "main").unwrap();

        let oct = DateFilter { from: Some("2026-10-01".into()), to: Some("2026-10-31".into()) };
        assert_eq!(list(&conn, &oct, "main").unwrap().len(), 1);
        assert_eq!(totals(&conn, &oct, "main").unwrap().amount, 500_000);

        let u = update(&conn, a.id, &input("Ana", 520_000, "2026-09-30")).unwrap();
        assert_eq!(u.amount, 520_000);
        assert!(list(&conn, &oct, "main").unwrap().is_empty());

        delete(&conn, a.id).unwrap();
        assert_eq!(list(&conn, &DateFilter::default(), "main").unwrap().len(), 1);
    }

    #[test]
    fn rejects_invalid() {
        let conn = open_in_memory().unwrap();
        assert!(create(&conn, &input("", 100, "2026-10-13"), "main").is_err());
        assert!(create(&conn, &input("Ana", 0, "2026-10-13"), "main").is_err());
        assert!(create(&conn, &input("Ana", 100, ""), "main").is_err());
    }
}
