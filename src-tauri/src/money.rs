//! Money helpers. All amounts are stored as integer centavos (`i64`).

/// Currency symbol used everywhere money is displayed.
pub const CURRENCY_SYMBOL: &str = "₱";

/// Largest accepted amount: ₱100,000,000,000.00 (in centavos).
pub const MAX_AMOUNT: i64 = 10_000_000_000_000;

/// Parse a peso string such as `"1,234.5"` or `"₱12"` into centavos.
/// Returns `None` for invalid input or more than two decimal places.
pub fn parse_pesos(input: &str) -> Option<i64> {
    let cleaned: String = input
        .trim()
        .trim_start_matches(CURRENCY_SYMBOL)
        .chars()
        .filter(|c| *c != ',' && !c.is_whitespace())
        .collect();
    if cleaned.is_empty() {
        return None;
    }
    let (negative, body) = match cleaned.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, cleaned.as_str()),
    };
    let mut parts = body.splitn(2, '.');
    let whole = parts.next().unwrap_or("");
    let frac = parts.next().unwrap_or("");
    if whole.is_empty() && frac.is_empty() {
        return None;
    }
    if !whole.chars().all(|c| c.is_ascii_digit()) || !frac.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if frac.len() > 2 {
        return None;
    }
    let whole_val: i64 = if whole.is_empty() { 0 } else { whole.parse().ok()? };
    let frac_val: i64 = match frac.len() {
        0 => 0,
        1 => frac.parse::<i64>().ok()? * 10,
        _ => frac.parse().ok()?,
    };
    let total = whole_val.checked_mul(100)?.checked_add(frac_val)?;
    Some(if negative { -total } else { total })
}

/// Plain decimal string without symbol or separators, e.g. `123450` -> `"1234.50"`.
/// Used for CSV export so spreadsheets read it as a number.
pub fn centavos_to_decimal(centavos: i64) -> String {
    let sign = if centavos < 0 { "-" } else { "" };
    let abs = centavos.unsigned_abs();
    format!("{sign}{}.{:02}", abs / 100, abs % 100)
}

/// Display format, e.g. `123450` -> `"₱1,234.50"`.
pub fn format_centavos(centavos: i64) -> String {
    let sign = if centavos < 0 { "-" } else { "" };
    let abs = centavos.unsigned_abs();
    let whole = (abs / 100).to_string();
    let mut grouped = String::with_capacity(whole.len() + whole.len() / 3);
    for (i, ch) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    format!("{sign}{CURRENCY_SYMBOL}{grouped}.{:02}", abs % 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_amounts() {
        assert_eq!(parse_pesos("0"), Some(0));
        assert_eq!(parse_pesos("1"), Some(100));
        assert_eq!(parse_pesos("1.5"), Some(150));
        assert_eq!(parse_pesos("1.05"), Some(105));
        assert_eq!(parse_pesos(".75"), Some(75));
        assert_eq!(parse_pesos("1,234.50"), Some(123_450));
        assert_eq!(parse_pesos("₱1,234.50"), Some(123_450));
        assert_eq!(parse_pesos(" 99 "), Some(9_900));
        assert_eq!(parse_pesos("-12.30"), Some(-1_230));
    }

    #[test]
    fn rejects_invalid_amounts() {
        assert_eq!(parse_pesos(""), None);
        assert_eq!(parse_pesos("."), None);
        assert_eq!(parse_pesos("abc"), None);
        assert_eq!(parse_pesos("1.234"), None);
        assert_eq!(parse_pesos("1.2.3"), None);
        assert_eq!(parse_pesos("1e5"), None);
        assert_eq!(parse_pesos("99999999999999999999"), None);
    }

    #[test]
    fn formats_amounts() {
        assert_eq!(format_centavos(0), "₱0.00");
        assert_eq!(format_centavos(5), "₱0.05");
        assert_eq!(format_centavos(123_450), "₱1,234.50");
        assert_eq!(format_centavos(100_000_000), "₱1,000,000.00");
        assert_eq!(format_centavos(-99_999), "-₱999.99");
    }

    #[test]
    fn decimal_strings() {
        assert_eq!(centavos_to_decimal(123_450), "1234.50");
        assert_eq!(centavos_to_decimal(7), "0.07");
        assert_eq!(centavos_to_decimal(-250), "-2.50");
    }

    #[test]
    fn round_trip() {
        for c in [1_i64, 99, 100, 101, 123_456_789, MAX_AMOUNT] {
            assert_eq!(parse_pesos(&format_centavos(c)), Some(c));
            assert_eq!(parse_pesos(&centavos_to_decimal(c)), Some(c));
        }
    }
}
