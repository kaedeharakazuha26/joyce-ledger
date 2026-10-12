use serde::{Serialize, Serializer};

/// Application error. Serializes to a plain, human-readable string so the
/// frontend can show it directly in a toast.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("{0}")]
    Validation(String),

    #[error("Record not found.")]
    NotFound,

    #[error("File error: {0}")]
    Io(#[from] std::io::Error),

    #[error("The database is busy. Please try again.")]
    Lock,
}

impl AppError {
    pub fn validation(msg: impl Into<String>) -> Self {
        AppError::Validation(msg.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_readable_string() {
        let e = AppError::validation("Amount must be greater than 0.");
        assert_eq!(
            serde_json::to_string(&e).unwrap(),
            "\"Amount must be greater than 0.\""
        );
        assert_eq!(
            serde_json::to_string(&AppError::NotFound).unwrap(),
            "\"Record not found.\""
        );
    }
}
