use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    require_amount, require_date, require_quantity, require_text, validate_filter, DateFilter,
    LdCommission, LdCommissionInput, Totals,
};

const SELECT: &str = "SELECT id, name, quantity, amount, commission_date, created_at, updated_at
                      FROM ld_commissions";
const RANGE: &str =
    "(?1 IS NULL OR commission_date >= ?1) AND (?2 IS NULL OR commission_date <= ?2)";

fn from_row(r: &Row) -> rusqlite::Result<LdCommission> {
    Ok(LdCommission {
        id: r.get(0)?,
        name: r.get(1)?,
        quantity: r.get(2)?,
        amount: r.get(3)?,
        date: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn clean(input: &LdCommissionInput) -> AppResult<LdCommissionInput> {
    Ok(LdCommissionInput {
        name: require_text("Name", &input.name)?,
        quantity: require_quantity(input.quantity)?,
        amount: require_amount(input.amount)?,
        date: require_date(&input.date)?,
    })
}

pub fn list(conn: &Connection, filter: &DateFilter) -> AppResult<Vec<LdCommission>> {
    let (from, to) = validate_filter(filter)?;
    let mut stmt = conn
        .prepare(&format!("{SELECT} WHERE {RANGE} ORDER BY commission_date DESC, id DESC"))?;
    let rows = stmt
        .query_map(params![from, to], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<LdCommission> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn create(conn: &Connection, input: &LdCommissionInput) -> AppResult<LdCommission> {
    let i = clean(input)?;
    conn.execute(
        "INSERT INTO ld_commissions (name, quantity, amount, commission_date)
         VALUES (?1, ?2, ?3, ?4)",
        params![i.name, i.quantity, i.amount, i.date],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &LdCommissionInput) -> AppResult<LdCommission> {
    let i = clean(input)?;
    let n = conn.execute(
        "UPDATE ld_commissions SET name = ?1, quantity = ?2, amount = ?3, commission_date = ?4,
         updated_at = datetime('now','localtime') WHERE id = ?5",
        params![i.name, i.quantity, i.amount, i.date, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if conn.execute("DELETE FROM ld_commissions WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn totals(conn: &Connection, filter: &DateFilter) -> AppResult<Totals> {
    let (from, to) = validate_filter(filter)?;
    Ok(conn.query_row(
        &format!(
            "SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(quantity), 0)
             FROM ld_commissions WHERE {RANGE}"
        ),
        params![from, to],
        |r| Ok(Totals { count: r.get(0)?, amount: r.get(1)?, quantity: r.get(2)? }),
    )?)
}

#[tauri::command]
pub fn list_ld_commissions(
    state: State<'_, DbState>,
    filter: Option<DateFilter>,
) -> AppResult<Vec<LdCommission>> {
    list(&*state.conn()?, &filter.unwrap_or_default())
}

#[tauri::command]
pub fn create_ld_commissions(
    state: State<'_, DbState>,
    input: LdCommissionInput,
) -> AppResult<LdCommission> {
    create(&*state.conn()?, &input)
}

#[tauri::command]
pub fn update_ld_commissions(
    state: State<'_, DbState>,
    id: i64,
    input: LdCommissionInput,
) -> AppResult<LdCommission> {
    update(&*state.conn()?, id, &input)
}

#[tauri::command]
pub fn delete_ld_commissions(state: State<'_, DbState>, id: i64) -> AppResult<()> {
    delete(&*state.conn()?, id)
}

#[tauri::command]
pub fn totals_ld_commissions(
    state: State<'_, DbState>,
    filter: Option<DateFilter>,
) -> AppResult<Totals> {
    totals(&*state.conn()?, &filter.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn input(name: &str, quantity: i64, amount: i64, date: &str) -> LdCommissionInput {
        LdCommissionInput { name: name.into(), quantity, amount, date: date.into() }
    }

    #[test]
    fn crud_and_totals() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &input("Ana", 3, 30_000, "2026-10-13")).unwrap();
        create(&conn, &input("Ben", 2, 20_000, "2026-10-13")).unwrap();
        create(&conn, &input("Ana", 9, 90_000, "2026-10-01")).unwrap();

        let f = DateFilter { from: Some("2026-10-13".into()), to: Some("2026-10-13".into()) };
        assert_eq!(list(&conn, &f).unwrap().len(), 2);
        assert_eq!(
            totals(&conn, &f).unwrap(),
            Totals { count: 2, amount: 50_000, quantity: 5 }
        );

        let u = update(&conn, a.id, &input("Ana", 4, 40_000, "2026-10-13")).unwrap();
        assert_eq!((u.quantity, u.amount), (4, 40_000));
        assert_eq!(totals(&conn, &DateFilter::default()).unwrap().quantity, 15);

        delete(&conn, a.id).unwrap();
        assert_eq!(list(&conn, &DateFilter::default()).unwrap().len(), 2);
    }

    #[test]
    fn rejects_invalid() {
        let conn = open_in_memory().unwrap();
        assert!(create(&conn, &input("Ana", 0, 100, "2026-10-13")).is_err());
        assert!(create(&conn, &input("", 1, 100, "2026-10-13")).is_err());
        assert!(create(&conn, &input("Ana", 1, 0, "2026-10-13")).is_err());
    }
}
