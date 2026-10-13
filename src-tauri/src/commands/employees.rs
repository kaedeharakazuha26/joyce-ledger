use rusqlite::{params, Connection, ErrorCode, OptionalExtension, Row};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{optional_text, require_text, Employee, EmployeeInput};

const SELECT: &str = "SELECT id, name, position, base_salary, commission, ld_commission, created_at FROM employees";

fn from_row(r: &Row) -> rusqlite::Result<Employee> {
    Ok(Employee {
        id: r.get(0)?,
        name: r.get(1)?,
        position: r.get(2)?,
        base_salary: r.get(3).unwrap_or(0),
        commission: r.get(4).unwrap_or(0),
        ld_commission: r.get(5).unwrap_or(0),
        created_at: r.get(6)?,
    })
}

fn clean(input: &EmployeeInput) -> AppResult<(String, Option<String>, i64, i64, i64)> {
    let base_salary = input.base_salary.unwrap_or(0);
    let commission = input.commission.unwrap_or(0);
    let ld_commission = input.ld_commission.unwrap_or(0);
    if base_salary < 0 || base_salary > crate::money::MAX_AMOUNT {
        return Err(AppError::validation("Base salary must be non-negative."));
    }
    if commission < 0 || commission > crate::money::MAX_AMOUNT {
        return Err(AppError::validation("Commission must be non-negative."));
    }
    if ld_commission < 0 || ld_commission > crate::money::MAX_AMOUNT {
        return Err(AppError::validation("LD commission must be non-negative."));
    }
    Ok((
        require_text("Name", &input.name)?,
        optional_text("Position", input.position.as_deref())?,
        base_salary,
        commission,
        ld_commission,
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
    let (name, position, base_salary, commission, ld_commission) = clean(input)?;
    conn.execute(
        "INSERT INTO employees (name, position, base_salary, commission, ld_commission, branch_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![name, position, base_salary, commission, ld_commission, branch_id],
    )
    .map_err(map_unique)?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: &EmployeeInput) -> AppResult<Employee> {
    let (name, position, base_salary, commission, ld_commission) = clean(input)?;
    let n = conn
        .execute(
            "UPDATE employees SET name = ?1, position = ?2, base_salary = ?3, commission = ?4, ld_commission = ?5 WHERE id = ?6",
            params![name, position, base_salary, commission, ld_commission, id],
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
        EmployeeInput {
            name: name.into(),
            position: position.map(Into::into),
            base_salary: None,
            commission: None,
            ld_commission: None,
        }
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

    #[test]
    fn employee_compensation_rates() {
        let conn = open_in_memory().unwrap();
        let emp = create(
            &conn,
            &EmployeeInput {
                name: "Joyce".into(),
                position: Some("Manager".into()),
                base_salary: Some(25_000_00),
                commission: Some(500_00),
                ld_commission: Some(150_00),
            },
            "main",
        )
        .unwrap();

        assert_eq!(emp.base_salary, 25_000_00);
        assert_eq!(emp.commission, 500_00);
        assert_eq!(emp.ld_commission, 150_00);

        let updated = update(
            &conn,
            emp.id,
            &EmployeeInput {
                name: "Joyce P.".into(),
                position: Some("Senior Manager".into()),
                base_salary: Some(30_000_00),
                commission: Some(600_00),
                ld_commission: Some(200_00),
            },
        )
        .unwrap();

        assert_eq!(updated.base_salary, 30_000_00);
        assert_eq!(updated.commission, 600_00);
        assert_eq!(updated.ld_commission, 200_00);
    }
}
