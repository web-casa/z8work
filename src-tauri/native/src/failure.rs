//! Stable public categories. Legacy String errors are classified only at this boundary.
//! Raw engine diagnostics remain internal and are never part of this value.
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Failure {
    Preparing,
    EngineUnavailable,
    Cancelled,
    TimedOut,
    InputUnavailable,
    ImportLimit,
    CacheExpired,
    CacheInvalid,
    CacheFull,
    Storage,
    Publish,
    OutputPermission,
    Conversion,
    History,
    Closing,
}
// Classify OS errors before formatting: localized messages and numeric errno
// values are not portable. Keep the existing String boundary for callers.
pub(crate) fn output_io(error: std::io::Error) -> String {
    use std::io::ErrorKind;
    match error.kind() {
        ErrorKind::StorageFull | ErrorKind::QuotaExceeded | ErrorKind::FileTooLarge => {
            format!("Storage: Cannot write output: {error}")
        }
        ErrorKind::PermissionDenied | ErrorKind::ReadOnlyFilesystem => {
            format!("Cannot write to output folder: {error}")
        }
        _ => format!("Output write failed: {error}"),
    }
}
impl Failure {
    pub fn classify(message: &str) -> Self {
        match message {
            "Z8:preparing" => Self::Preparing,
            "Z8:history" => Self::History,
            "Z8:engine_unavailable" => Self::EngineUnavailable,
            "Z8:import_limit" => Self::ImportLimit,
            "Z8:closing" => Self::Closing,
            "Cancelled" => Self::Cancelled,
            "Timed out" => Self::TimedOut,
            crate::retained::EXPIRED => Self::CacheExpired,
            crate::retained::INVALID => Self::CacheInvalid,
            crate::retained::FULL => Self::CacheFull,
            _ if message.contains("Could not retain encoded result") => Self::CacheExpired,
            _ if message.starts_with("Storage:")
                || message.starts_with("Storage ")
                || message.contains("free space")
                || message.contains("free file slots")
                || message.contains("insufficient free file entries")
                || message.starts_with("Cannot check ") =>
            {
                Self::Storage
            }
            _ if message.starts_with("Cannot write to output folder") => Self::OutputPermission,
            _ if message.starts_with("Output ")
                || message == "Too many output filename collisions" =>
            {
                Self::Publish
            }
            _ if message.starts_with("Input ") || message.starts_with("Choose this input") => {
                Self::InputUnavailable
            }
            _ if message.starts_with("Queue history") => Self::History,
            _ => Self::Conversion,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_io_categories_follow_error_kinds_not_message_text() {
        use std::io::{Error, ErrorKind};
        for (kind, expected) in [
            (ErrorKind::StorageFull, Failure::Storage),
            (ErrorKind::QuotaExceeded, Failure::Storage),
            (ErrorKind::FileTooLarge, Failure::Storage),
            (ErrorKind::PermissionDenied, Failure::OutputPermission),
            (ErrorKind::ReadOnlyFilesystem, Failure::OutputPermission),
            (ErrorKind::NotFound, Failure::Publish),
            (ErrorKind::Other, Failure::Publish),
        ] {
            assert_eq!(
                Failure::classify(&output_io(Error::new(kind, "opaque OS detail"))),
                expected
            );
        }
    }
    #[cfg(unix)]
    #[test]
    fn actual_unix_storage_errno_is_not_an_output_permission_error() {
        for code in [libc::ENOSPC, libc::EDQUOT, libc::EFBIG] {
            assert_eq!(
                Failure::classify(&output_io(std::io::Error::from_raw_os_error(code))),
                Failure::Storage
            );
        }
        assert_eq!(
            Failure::classify(&output_io(std::io::Error::from_raw_os_error(libc::EIO))),
            Failure::Publish
        );
    }
    #[test]
    fn public_categories_match_shared_frontend_fixture() {
        use Failure::*;
        let actual = serde_json::to_value([
            Preparing,
            EngineUnavailable,
            Cancelled,
            TimedOut,
            InputUnavailable,
            ImportLimit,
            CacheExpired,
            CacheInvalid,
            CacheFull,
            Storage,
            Publish,
            OutputPermission,
            Conversion,
            History,
            Closing,
        ])
        .unwrap();
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../desktop/tests/fixtures/runtime-contract.json"
        ))
        .unwrap();
        assert_eq!(actual, fixture["failures"]);
        assert_eq!(
            serde_json::to_value([
                crate::startup::Phase::Preparing,
                crate::startup::Phase::Ready,
                crate::startup::Phase::Failed
            ])
            .unwrap(),
            fixture["engineStates"]
        );
        assert_eq!(
            serde_json::to_value([
                crate::progress::Stage::Encoding,
                crate::progress::Stage::Validating,
                crate::progress::Stage::Publishing
            ])
            .unwrap(),
            fixture["progressStages"]
        );
    }
    #[test]
    fn categories_never_contain_raw_logs_or_paths() {
        let value = Failure::classify("Engine exited 1: secret /home/private/image.png <script>");
        assert_eq!(serde_json::to_string(&value).unwrap(), "\"conversion\"");
        assert_eq!(
            Failure::classify(crate::retained::INVALID),
            Failure::CacheInvalid
        );
        assert_eq!(Failure::classify("Z8:preparing"), Failure::Preparing);
    }
    #[test]
    fn filesystem_inode_exhaustion_is_a_storage_failure() {
        for area in ["Output folder", "Temporary workspace"] {
            assert_eq!(
                Failure::classify(&format!("{area} has insufficient free file entries.")),
                Failure::Storage
            );
        }
    }
}
