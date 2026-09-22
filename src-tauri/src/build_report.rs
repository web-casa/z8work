//! A GUI-subsystem Windows executable may have no stdout. Explicit CLI reports
//! avoid depending on a console and must never replace an existing user file.
use std::{fs::OpenOptions, io::Write, path::Path};

pub fn runtime_info() -> serde_json::Value {
    #[cfg(windows)]
    let webview = webview_status(tauri::webview_version().map_err(|error| error.to_string()));
    #[cfg(not(windows))]
    let webview = serde_json::json!({"engine":"webview2","status":"not-applicable"});
    serde_json::json!({"schema":1,"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"webview":webview,"gui":"not-run"})
}

#[cfg(any(windows, test))]
fn webview_status(result: Result<String, String>) -> serde_json::Value {
    match result {
        Ok(version) if !version.trim().is_empty() => {
            serde_json::json!({"engine":"webview2","status":"available","version":version})
        }
        result => {
            serde_json::json!({"engine":"webview2","status":"unavailable","error":result.err().unwrap_or_else(|| "Empty WebView2 version".into())})
        }
    }
}

pub fn write(path: &Path, info: &serde_json::Value) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Build report requires an absolute output path".into());
    }
    let bytes = serde_json::to_vec_pretty(info).map_err(|e| e.to_string())?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Cannot create build report: {e}"))?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_detection_preserves_missing_and_prerelease_results() {
        assert_eq!(
            webview_status(Err("not found".into()))["status"],
            "unavailable"
        );
        assert_eq!(webview_status(Ok(" ".into()))["status"], "unavailable");
        assert_eq!(
            webview_status(Ok("140.0.1.2 beta".into()))["version"],
            "140.0.1.2 beta"
        );
    }

    #[test]
    fn rejects_relative_paths_without_writing() {
        assert!(write(Path::new("report.json"), &serde_json::json!({})).is_err());
    }

    #[test]
    fn report_roundtrips_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!("z8-build-report-{}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("构建 result.json");
        let data = serde_json::json!({"schema":1,"version":"0.1.0"});
        write(&path, &data).unwrap();
        assert!(write(&path, &serde_json::json!({})).is_err());
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&std::fs::read(&path).unwrap()).unwrap(),
            data
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
