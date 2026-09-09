//! Finite test execution under the same lifetime guard used by conversions.
use std::{
    path::Path,
    process::Command,
    time::{Duration, Instant},
};

pub fn run_test(executable: &Path, name: Option<&str>) -> Result<String, String> {
    if !executable.is_absolute() || !executable.is_file() {
        return Err("Expected an absolute test executable path".into());
    }
    let allowed: Vec<String> = serde_json::from_str(include_str!(
        "../../../packaging/desktop/windows/lifecycle-tests.json"
    ))
    .map_err(|error| error.to_string())?;
    let mut command = Command::new(executable);
    if let Some(name) = name {
        if !allowed.iter().any(|test| test == name) {
            return Err("Unknown lifecycle test".into());
        }
        command.args(["--exact", name, "--test-threads=1"]);
    } else {
        command.arg("--list");
    }
    crate::process::run(
        command,
        &crate::Cancel::default(),
        Instant::now() + Duration::from_secs(60),
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_unlisted_tests_before_starting_any_process() {
        assert!(
            super::run_test(&std::env::current_exe().unwrap(), Some("arbitrary"))
                .unwrap_err()
                .contains("Unknown lifecycle test")
        );
        assert!(super::run_test(std::path::Path::new("relative.exe"), None).is_err());
    }
}
