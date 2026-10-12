use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    require_amount, require_date, require_text, validate_filter, Commission, CommissionInput,
    DateFilter, Totals,
};

const SELECT: &str = "SELECT id, name, category, amount, commission_date, created_at, updated_at
                      FROM commissions";
const RANGE: &str =
    "(?1 IS NULL OR commission_date >= ?1) AND (?2 IS NULL OR commission_date <= ?2) AND branch_id = ?3";

fn from_row(r: &Row) -> rusqlite::Result<Commission> {
    Ok(Commission {
        id: r.get(0)?,
        name: r.get(1)?,
        category: r.get(2)?,
        amount: r.get(3)?,
        date: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn clean(input: &CommissionInput) -> AppResult<CommissionInput> {
    Ok(CommissionInput {
        name: require_text("Name", &input.name)?,
        category: require_text("Category", &input.category)?,
        amount: require_amount(input.amount)?,
        date: require_date(&input.date)?,
    })
}

pub fn list(conn: &Connection, filter: &DateFilter, branch_id: &str) -> AppResult<Vec<Commission>> {
    let (from, to) = validate_filter(filter)?;
    let mut stmt = conn
        .prepare(&format!("{SELECT} WHERE {RANGE} ORDER BY commission_date DESC, id DESC"))?;
    let rows = stmt
        .query_map(params![from, to, branch_id], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Commission> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn create(conn: &Connection, input: &CommissionInput, branch_id: &str) -> AppResult<Commission> {
    let i = clean(input)?;
    conn.execute(
        "INSERT INTO commissions (name, category, amount, commission_date, branch_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![i.name, i.category, i.amount, i.date, branch_id],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &CommissionInput) -> AppResult<Commission> {
    let i = clean(input)?;
    let n = conn.execute(
        "UPDATE commissions SET name = ?1, category = ?2, amount = ?3, commission_date = ?4,
         updated_at = datetime('now','localtime') WHERE id = ?5",
        params![i.name, i.category, i.amount, i.date, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if conn.execute("DELETE FROM commissions WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn totals(conn: &Connection, filter: &DateFilter, branch_id: &str) -> AppResult<Totals> {
    let (from, to) = validate_filter(filter)?;
    Ok(conn.query_row(
        &format!("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM commissions WHERE {RANGE}"),
        params![from, to, branch_id],
        |r| Ok(Totals { count: r.get(0)?, amount: r.get(1)?, quantity: 0 }),
    )?)
}

#[tauri::command]
pub fn list_commissions(
    state: State<'_, DbState>,
    filter: Option<DateFilter>,
    branch: Option<String>,
) -> AppResult<Vec<Commission>> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    list(&*state.conn()?, &filter.unwrap_or_default(), &branch_id)
}

#[tauri::command]
pub fn create_commissions(
    state: State<'_, DbState>,
    input: CommissionInput,
    branch: Option<String>,
) -> AppResult<Commission> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    create(&*state.conn()?, &input, &branch_id)
}

#[tauri::command]
pub fn update_commissions(
    state: State<'_, DbState>,
    id: i64,
    input: CommissionInput,
) -> AppResult<Commission> {
    update(&*state.conn()?, id, &input)
}

#[tauri::command]
pub fn delete_commissions(state: State<'_, DbState>, id: i64, pin: String) -> AppResult<()> {
    let conn = state.conn()?;
    crate::commands::admin::check_pin(&conn, &pin)?;
    delete(&conn, id)
}

#[tauri::command]
pub fn totals_commissions(
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

    fn input(name: &str, category: &str, amount: i64, date: &str) -> CommissionInput {
        CommissionInput { name: name.into(), category: category.into(), amount, date: date.into() }
    }

    #[test]
    fn crud_and_filter() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &input("Ana", "Lady drink", 10_000, "2026-10-13"), "main").unwrap();
        create(&conn, &input("Ben", "Bottle", 25_000, "2026-10-12"), "main").unwrap();

        let f = DateFilter { from: None, to: Some("2026-10-12".into()) };
        let rows = list(&conn, &f, "main").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "Ben");
        assert_eq!(totals(&conn, &DateFilter::default(), "main").unwrap().amount, 35_000);

        let u = update(&conn, a.id, &input("Ana", "Bottle", 11_000, "2026-10-13")).unwrap();
        assert_eq!(u.category, "Bottle");

        delete(&conn, a.id).unwrap();
        assert_eq!(totals(&conn, &DateFilter::default(), "main").unwrap().count, 1);
    }

    #[test]
    fn rejects_invalid() {
        let conn = open_in_memory().unwrap();
        assert!(create(&conn, &input("Ana", "", 100, "2026-10-13"), "main").is_err());
        assert!(create(&conn, &input("", "Bottle", 100, "2026-10-13"), "main").is_err());
        assert!(create(&conn, &input("Ana", "Bottle", 0, "2026-10-13"), "main").is_err());
    }
}
