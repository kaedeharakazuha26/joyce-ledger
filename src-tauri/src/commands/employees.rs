use rusqlite::{params, Connection, ErrorCode, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{optional_text, require_text, Employee, EmployeeInput};

const SELECT: &str = "SELECT id, name, position, created_at FROM employees";

fn from_row(r: &Row) -> rusqlite::Result<Employee> {
    Ok(Employee {
        id: r.get(0)?,
        name: r.get(1)?,
        position: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn clean(input: &EmployeeInput) -> AppResult<(String, Option<String>)> {
    Ok((
        require_text("Name", &input.name)?,
        optional_text("Position", input.position.as_deref())?,
    ))
}

fn map_unique(e: rusqlite::Error) -> AppError {
    match &e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == ErrorCode::ConstraintViolation => {
            AppError::validation("An employee with that name already exists.")
        }
        _ => AppError::Database(e),
    }
}

pub fn list(conn: &Connection, branch_id: &str) -> AppResult<Vec<Employee>> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE branch_id = ?1 ORDER BY name COLLATE NOCASE, id"))?;
    let rows = stmt.query_map([branch_id], from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Employee> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn create(conn: &Connection, input: &EmployeeInput, branch_id: &str) -> AppResult<Employee> {
    let (name, position) = clean(input)?;
    conn.execute(
        "INSERT INTO employees (name, position, branch_id) VALUES (?1, ?2, ?3)",
        params![name, position, branch_id],
    )
    .map_err(map_unique)?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &EmployeeInput) -> AppResult<Employee> {
    let (name, position) = clean(input)?;
    let n = conn
        .execute(
            "UPDATE employees SET name = ?1, position = ?2 WHERE id = ?3",
            params![name, position, id],
        )
        .map_err(map_unique)?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let n = conn.execute("DELETE FROM employees WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[tauri::command]
pub fn list_employees(state: State<'_, DbState>, branch: Option<String>) -> AppResult<Vec<Employee>> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    list(&*state.conn()?, &branch_id)
}

#[tauri::command]
pub fn create_employee(
    state: State<'_, DbState>,
    input: EmployeeInput,
    branch: Option<String>,
) -> AppResult<Employee> {
    let branch_id = match branch {
        Some(b) => b,
        None => state.active_branch()?,
    };
    create(&*state.conn()?, &input, &branch_id)
}

#[tauri::command]
pub fn update_employee(
    state: State<'_, DbState>,
    id: i64,
    input: EmployeeInput,
) -> AppResult<Employee> {
    update(&*state.conn()?, id, &input)
}

#[tauri::command]
pub fn delete_employee(state: State<'_, DbState>, id: i64, pin: String) -> AppResult<()> {
    let conn = state.conn()?;
    crate::commands::admin::check_pin(&conn, &pin)?;
    delete(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn input(name: &str, position: Option<&str>) -> EmployeeInput {
        EmployeeInput { name: name.into(), position: position.map(Into::into) }
    }

    #[test]
    fn crud() {
        let conn = open_in_memory().unwrap();
        let ana = create(&conn, &input("  Ana ", Some("Cashier")), "main").unwrap();
        assert_eq!(ana.name, "Ana");
        assert_eq!(ana.position.as_deref(), Some("Cashier"));
        create(&conn, &input("ben", Some(" ")), "main").unwrap();

        let all = list(&conn, "main").unwrap();
        assert_eq!(all.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["Ana", "ben"]);
        assert_eq!(all[1].position, None);

        let updated = update(&conn, ana.id, &input("Ana Cruz", None)).unwrap();
        assert_eq!(updated.name, "Ana Cruz");
        assert_eq!(updated.position, None);

        delete(&conn, ana.id).unwrap();
        assert_eq!(list(&conn, "main").unwrap().len(), 1);
        assert!(matches!(delete(&conn, ana.id), Err(AppError::NotFound)));
        assert!(matches!(update(&conn, 999, &input("X", None)), Err(AppError::NotFound)));
    }

    #[test]
    fn rejects_invalid_and_duplicate() {
        let conn = open_in_memory().unwrap();
        assert!(matches!(create(&conn, &input("  ", None), "main"), Err(AppError::Validation(_))));
        create(&conn, &input("Ana", None), "main").unwrap();
        let dup = create(&conn, &input("ANA", None), "main");
        assert!(matches!(dup, Err(AppError::Validation(_))));
    }
}
