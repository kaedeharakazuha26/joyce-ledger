//! Data structures shared with the frontend, plus input validation.
//! Every record struct exposes its date as `date` so the frontend can treat
//! all record modules the same way.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::money::MAX_AMOUNT;

pub const MAX_TEXT_LEN: usize = 120;

// ---------- Filters & totals ----------

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateFilter {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub count: i64,
    pub amount: i64,
    pub quantity: i64,
}

// ---------- Records ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sale {
    pub id: i64,
    pub category: String,
    pub amount: i64,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleInput {
    pub category: String,
    pub amount: i64,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    pub id: i64,
    pub category: String,
    pub amount: i64,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInput {
    pub category: String,
    pub amount: i64,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LdCommission {
    pub id: i64,
    pub name: String,
    pub quantity: i64,
    pub amount: i64,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LdCommissionInput {
    pub name: String,
    pub quantity: i64,
    pub amount: i64,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commission {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub amount: i64,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommissionInput {
    pub name: String,
    pub category: String,
    pub amount: i64,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Salary {
    pub id: i64,
    pub name: String,
    pub amount: i64,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalaryInput {
    pub name: String,
    pub amount: i64,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub id: i64,
    pub name: String,
    pub position: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeInput {
    pub name: String,
    pub position: Option<String>,
}

// ---------- Validation ----------

/// Trim and require non-empty text of reasonable length.
pub fn require_text(field: &str, value: &str) -> AppResult<String> {
    let v = value.trim();
    if v.is_empty() {
        return Err(AppError::validation(format!("{field} is required.")));
    }
    if v.chars().count() > MAX_TEXT_LEN {
        return Err(AppError::validation(format!(
            "{field} must be {MAX_TEXT_LEN} characters or fewer."
        )));
    }
    Ok(v.to_string())
}

/// Trim optional text; empty becomes `None`.
pub fn optional_text(field: &str, value: Option<&str>) -> AppResult<Option<String>> {
    match value.map(str::trim) {
        None | Some("") => Ok(None),
        Some(v) => require_text(field, v).map(Some),
    }
}

pub fn require_amount(amount: i64) -> AppResult<i64> {
    if amount <= 0 {
        return Err(AppError::validation("Amount must be greater than 0."));
    }
    if amount > MAX_AMOUNT {
        return Err(AppError::validation("Amount is too large."));
    }
    Ok(amount)
}

pub fn require_quantity(quantity: i64) -> AppResult<i64> {
    if quantity < 1 {
        return Err(AppError::validation("Quantity must be 1 or more."));
    }
    if quantity > 1_000_000 {
        return Err(AppError::validation("Quantity is too large."));
    }
    Ok(quantity)
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 0,
    }
}

/// Require a real calendar date in `YYYY-MM-DD` format.
pub fn require_date(value: &str) -> AppResult<String> {
    let s = value.trim();
    let invalid = || AppError::validation("Date must be a valid date (YYYY-MM-DD).");
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return Err(invalid());
    }
    let digits_ok = b
        .iter()
        .enumerate()
        .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if !digits_ok {
        return Err(invalid());
    }
    let year: u32 = s[0..4].parse().map_err(|_| invalid())?;
    let month: u32 = s[5..7].parse().map_err(|_| invalid())?;
    let day: u32 = s[8..10].parse().map_err(|_| invalid())?;
    if !(1900..=9999).contains(&year) || !(1..=12).contains(&month) {
        return Err(invalid());
    }
    if day < 1 || day > days_in_month(year, month) {
        return Err(invalid());
    }
    Ok(s.to_string())
}

/// Validate an optional date filter. Returns `(from, to)`.
pub fn validate_filter(filter: &DateFilter) -> AppResult<(Option<String>, Option<String>)> {
    let norm = |v: &Option<String>| -> AppResult<Option<String>> {
        match v.as_deref().map(str::trim) {
            None | Some("") => Ok(None),
            Some(d) => require_date(d).map(Some),
        }
    };
    let from = norm(&filter.from)?;
    let to = norm(&filter.to)?;
    if let (Some(f), Some(t)) = (&from, &to) {
        if f > t {
            return Err(AppError::validation(
                "The From date must be on or before the To date.",
            ));
        }
    }
    Ok((from, to))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates() {
        assert!(require_date("2026-10-13").is_ok());
        assert!(require_date("2024-02-29").is_ok());
        assert!(require_date("2023-02-29").is_err());
        assert!(require_date("2026-13-01").is_err());
        assert!(require_date("2026-1-01").is_err());
        assert!(require_date("2026/10/13").is_err());
        assert!(require_date("+026-10-13").is_err());
        assert!(require_date("").is_err());
    }

    #[test]
    fn text_and_numbers() {
        assert_eq!(require_text("Name", "  Ana ").unwrap(), "Ana");
        assert!(require_text("Name", "   ").is_err());
        assert_eq!(optional_text("Position", Some("  ")).unwrap(), None);
        assert!(require_amount(0).is_err());
        assert!(require_amount(-5).is_err());
        assert!(require_amount(1).is_ok());
        assert!(require_quantity(0).is_err());
        assert!(require_quantity(1).is_ok());
    }

    #[test]
    fn filters() {
        let f = DateFilter { from: Some("2026-10-14".into()), to: Some("2026-10-13".into()) };
        assert!(validate_filter(&f).is_err());
        let f = DateFilter { from: Some("".into()), to: None };
        assert_eq!(validate_filter(&f).unwrap(), (None, None));
    }
}
