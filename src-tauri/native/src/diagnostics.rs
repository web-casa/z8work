//! Shareable diagnostics are built from an allowlist, never by redacting a log.
use crate::{
    queue::{Phase, Snapshot},
    EngineInfo,
};
use serde::Serialize;
use std::{collections::BTreeMap, io::Write, path::Path, sync::Mutex};

#[derive(Serialize)]
pub struct Report {
    schema: u8,
    product: &'static str,
    native_version: &'static str,
    os: &'static str,
    arch: &'static str,
    debug: bool,
    workspace_initialized: bool,
    engines: Vec<Engine>,
    queue: Option<Queue>,
}
#[derive(Serialize)]
struct Engine {
    id: &'static str,
    available: bool,
    development: Option<bool>,
    numeric_version: Option<String>,
}
#[derive(Serialize)]
struct Queue {
    tasks: usize,
    phases: BTreeMap<&'static str, usize>,
    processing: bool,
    persistence_failed: bool,
}
fn version(id: &str, value: &str) -> Option<String> {
    let prefix = match id {
        "magick" => "Version: ImageMagick ",
        "ffmpeg" => "ffmpeg version ",
        "ffprobe" => "ffprobe version ",
        "pandoc" => "pandoc ",
        "mutool" => "mutool version ",
        _ => return None,
    };
    let token = value.strip_prefix(prefix)?.split_whitespace().next()?;
    let numeric: String = token
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .take(33)
        .collect();
    if numeric.len() > 32
        || !numeric.contains('.')
        || numeric.split(['.', '-']).any(|p| p.is_empty())
    {
        return None;
    }
    Some(numeric)
}
pub fn build(
    engines: &[EngineInfo],
    snapshot: Option<&Snapshot>,
    workspace_initialized: bool,
) -> Report {
    Report {
        schema: 1,
        product: "Z8.Work",
        native_version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        debug: cfg!(debug_assertions),
        workspace_initialized,
        engines: ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]
            .into_iter()
            .map(|id| {
                let engine = engines.iter().find(|e| e.id == id);
                Engine {
                    id,
                    available: engine.is_some_and(|e| e.available),
                    development: engine.map(|e| e.development),
                    numeric_version: engine.and_then(|e| version(id, &e.version)),
                }
            })
            .collect(),
        queue: snapshot.map(|s| {
            let mut phases = BTreeMap::new();
            for task in &s.tasks {
                let key = match task.phase {
                    Phase::Ready => "ready",
                    Phase::Queued => "queued",
                    Phase::Running => "running",
                    Phase::Saved => "saved",
                    Phase::Failed => "failed",
                    Phase::Cancelled => "cancelled",
                    Phase::Interrupted => "interrupted",
                    Phase::Partial => "partial",
                };
                *phases.entry(key).or_insert(0) += 1;
            }
            Queue {
                tasks: s.tasks.len(),
                phases,
                processing: s.processing,
                persistence_failed: s.persistence_error.is_some(),
            }
        }),
    }
}
#[derive(Clone, Serialize)]
pub struct Preview {
    pub id: String,
    pub text: String,
}
#[derive(Default)]
pub struct Store(Mutex<Option<Preview>>);
impl Store {
    pub fn prepare(&self, report: Report) -> Result<Preview, String> {
        let preview = Preview {
            id: uuid::Uuid::new_v4().to_string(),
            text: format!(
                "{}\n",
                serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
            ),
        };
        if preview.text.len() > 8192 {
            return Err("Diagnostic report exceeds its size limit".into());
        }
        *self.0.lock().map_err(|_| "Diagnostic report unavailable")? = Some(preview.clone());
        Ok(preview)
    }
    pub fn reviewed(&self, id: &str) -> Result<String, String> {
        self.0
            .lock()
            .map_err(|_| "Diagnostic report unavailable")?
            .as_ref()
            .filter(|p| p.id == id)
            .map(|p| p.text.clone())
            .ok_or_else(|| "Preview this diagnostic report again before saving".into())
    }
}
// Only call with a path supplied by a native Save dialog. No IPC accepts paths or text.
pub fn save(path: &Path, reviewed: &str) -> Result<(), String> {
    if !path.is_absolute() || reviewed.len() > 8192 {
        return Err("Invalid diagnostic report destination or size".into());
    }
    let parent = path.parent().ok_or("Missing report folder")?;
    let mut pending = tempfile::Builder::new()
        .prefix(".z8-report-")
        .tempfile_in(parent)
        .map_err(|e| format!("Cannot create diagnostic report: {e}"))?;
    pending
        .write_all(reviewed.as_bytes())
        .map_err(|e| e.to_string())?;
    pending.as_file().sync_all().map_err(|e| e.to_string())?;
    pending.persist_noclobber(path).map_err(|e| {
        format!(
            "Cannot save diagnostic report; choose a new filename: {}",
            e.error
        )
    })?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn numeric_versions_exclude_paths_urls_and_arbitrary_suffixes() {
        assert_eq!(
            version("magick", "Version: ImageMagick 7.1.1-43 Q16 /private/path"),
            Some("7.1.1-43".into())
        );
        assert_eq!(
            version("ffmpeg", "ffmpeg version 7.1.5-0+deb13u1 private"),
            Some("7.1.5-0".into())
        );
        for text in [
            "pandoc /home/private/3.0",
            "pandoc secret",
            "pandoc 3..0",
            "pandoc 3.-2",
        ] {
            assert!(version("pandoc", text).is_none());
        }
        assert!(version("/home/private", "1.0").is_none());
    }
    #[test]
    fn report_never_serializes_sensitive_snapshot_fields() {
        let mut snapshot: Snapshot = serde_json::from_str(include_str!(
            "../../../desktop/tests/fixtures/queue-snapshot.json"
        ))
        .unwrap();
        let secret = "PRIVATE_SENTINEL /home/alice/客户.png https://private.test/token";
        snapshot.epoch = secret.into();
        snapshot.output = Some(secret.into());
        snapshot.persistence_error = Some(secret.into());
        snapshot.recovery_notice = Some(secret.into());
        if let Some(report) = &mut snapshot.import_report {
            report.id = secret.into();
            for issue in &mut report.issues {
                issue.name = secret.into();
            }
        }
        for task in &mut snapshot.tasks {
            task.name = secret.into();
            task.id = secret.into();
            task.error = Some(secret.into());
            if let Some(result) = &mut task.result {
                result.path = secret.into();
                result.note = secret.into();
                result.fingerprint = secret.into();
                for file in &mut result.files {
                    file.path = secret.into();
                    file.sha256 = secret.into();
                }
            }
        }
        let engines = vec![EngineInfo {
            id: "magick".into(),
            version: secret.into(),
            available: false,
            development: true,
            error: Some(secret.into()),
        }];
        let text = serde_json::to_string(&build(&engines, Some(&snapshot), false)).unwrap();
        assert!(!text.contains("PRIVATE") && !text.contains("alice") && !text.contains("https:"));
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(json["queue"]["tasks"], snapshot.tasks.len());
        assert_eq!(json["engines"].as_array().unwrap().len(), 5);
        assert_eq!(json["queue"]["persistence_failed"], true);
        let keys: Vec<_> = json
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            vec![
                "arch",
                "debug",
                "engines",
                "native_version",
                "os",
                "product",
                "queue",
                "schema",
                "workspace_initialized"
            ]
        );
        assert_eq!(json["queue"].as_object().unwrap().len(), 4);
    }
    #[test]
    fn refreshing_invalidates_old_ids_and_preserves_exact_reviewed_bytes() {
        let store = Store::default();
        let first = store.prepare(build(&[], None, false)).unwrap();
        assert_eq!(store.reviewed(&first.id).unwrap(), first.text);
        let second = store.prepare(build(&[], None, true)).unwrap();
        assert!(store.reviewed(&first.id).is_err());
        assert_eq!(store.reviewed(&second.id).unwrap(), second.text);
        assert!(Store::default().reviewed(&second.id).is_err());
    }
    #[test]
    fn report_save_is_exact_and_never_overwrites_or_leaves_temporary_files() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("诊断.json");
        let preview = Store::default().prepare(build(&[], None, false)).unwrap();
        save(&path, &preview.text).unwrap();
        assert!(save(&path, "different").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), preview.text);
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
        assert!(save(Path::new("relative.json"), &preview.text).is_err());
    }
}
