use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    require_amount, require_date, require_text, validate_filter, DateFilter, Sale, SaleInput,
    Totals,
};

const SELECT: &str = "SELECT id, category, amount, sale_date, created_at, updated_at FROM sales";
const RANGE: &str = "(?1 IS NULL OR sale_date >= ?1) AND (?2 IS NULL OR sale_date <= ?2)";

fn from_row(r: &Row) -> rusqlite::Result<Sale> {
    Ok(Sale {
        id: r.get(0)?,
        category: r.get(1)?,
        amount: r.get(2)?,
        date: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

fn clean(input: &SaleInput) -> AppResult<SaleInput> {
    Ok(SaleInput {
        category: require_text("Category", &input.category)?,
        amount: require_amount(input.amount)?,
        date: require_date(&input.date)?,
    })
}

pub fn list(conn: &Connection, filter: &DateFilter) -> AppResult<Vec<Sale>> {
    let (from, to) = validate_filter(filter)?;
    let mut stmt =
        conn.prepare(&format!("{SELECT} WHERE {RANGE} ORDER BY sale_date DESC, id DESC"))?;
    let rows = stmt
        .query_map(params![from, to], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Sale> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn create(conn: &Connection, input: &SaleInput) -> AppResult<Sale> {
    let i = clean(input)?;
    conn.execute(
        "INSERT INTO sales (category, amount, sale_date) VALUES (?1, ?2, ?3)",
        params![i.category, i.amount, i.date],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &SaleInput) -> AppResult<Sale> {
    let i = clean(input)?;
    let n = conn.execute(
        "UPDATE sales SET category = ?1, amount = ?2, sale_date = ?3,
         updated_at = datetime('now','localtime') WHERE id = ?4",
        params![i.category, i.amount, i.date, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if conn.execute("DELETE FROM sales WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn totals(conn: &Connection, filter: &DateFilter) -> AppResult<Totals> {
    let (from, to) = validate_filter(filter)?;
    Ok(conn.query_row(
        &format!("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM sales WHERE {RANGE}"),
        params![from, to],
        |r| Ok(Totals { count: r.get(0)?, amount: r.get(1)?, quantity: 0 }),
    )?)
}

#[tauri::command]
pub fn list_sales(state: State<'_, DbState>, filter: Option<DateFilter>) -> AppResult<Vec<Sale>> {
    list(&*state.conn()?, &filter.unwrap_or_default())
}

#[tauri::command]
pub fn create_sales(state: State<'_, DbState>, input: SaleInput) -> AppResult<Sale> {
    create(&*state.conn()?, &input)
}

#[tauri::command]
pub fn update_sales(state: State<'_, DbState>, id: i64, input: SaleInput) -> AppResult<Sale> {
    update(&*state.conn()?, id, &input)
}

#[tauri::command]
pub fn delete_sales(state: State<'_, DbState>, id: i64) -> AppResult<()> {
    delete(&*state.conn()?, id)
}

#[tauri::command]
pub fn totals_sales(state: State<'_, DbState>, filter: Option<DateFilter>) -> AppResult<Totals> {
    totals(&*state.conn()?, &filter.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn input(category: &str, amount: i64, date: &str) -> SaleInput {
        SaleInput { category: category.into(), amount, date: date.into() }
    }

    fn range(from: &str, to: &str) -> DateFilter {
        DateFilter { from: Some(from.into()), to: Some(to.into()) }
    }

    #[test]
    fn crud_and_filter() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &input(" Food ", 12_345, "2026-10-12")).unwrap();
        assert_eq!(a.category, "Food");
        create(&conn, &input("Drinks", 50_000, "2026-10-13")).unwrap();
        create(&conn, &input("Drinks", 1_000, "2026-10-13")).unwrap();

        let all = list(&conn, &DateFilter::default()).unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].date, "2026-10-13");
        assert!(all[0].id > all[1].id, "same date sorted by id desc");
        assert_eq!(all[2].id, a.id);

        let today = range("2026-10-13", "2026-10-13");
        assert_eq!(list(&conn, &today).unwrap().len(), 2);
        assert_eq!(
            totals(&conn, &today).unwrap(),
            Totals { count: 2, amount: 51_000, quantity: 0 }
        );

        let u = update(&conn, a.id, &input("Food", 99, "2026-10-13")).unwrap();
        assert_eq!((u.amount, u.date.as_str()), (99, "2026-10-13"));
        assert_eq!(list(&conn, &today).unwrap().len(), 3);

        delete(&conn, a.id).unwrap();
        assert!(matches!(get(&conn, a.id), Err(AppError::NotFound)));
        assert!(matches!(delete(&conn, a.id), Err(AppError::NotFound)));
    }

    #[test]
    fn rejects_invalid() {
        let conn = open_in_memory().unwrap();
        assert!(create(&conn, &input("", 100, "2026-10-13")).is_err());
        assert!(create(&conn, &input("Food", 0, "2026-10-13")).is_err());
        assert!(create(&conn, &input("Food", 100, "13/10/2026")).is_err());
        assert!(list(&conn, &range("2026-10-14", "2026-10-13")).is_err());
    }
}
