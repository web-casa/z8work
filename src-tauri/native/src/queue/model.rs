use crate::{ConversionResult, OutputFormat};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::PathBuf, time::SystemTime};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Ready,
    Queued,
    Running,
    Saving,
    AwaitingSave,
    Saved,
    Failed,
    Cancelled,
    Interrupted,
    Partial,
}
impl Phase {
    pub fn active(&self) -> bool {
        matches!(self, Self::Queued | Self::Running | Self::Saving)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub formats: Vec<OutputFormat>,
    pub format: OutputFormat,
    pub phase: Phase,
    pub attempt: u32,
    pub authorized: bool,
    pub result: Option<ConversionResult>,
    pub error: Option<String>,
    #[serde(default)]
    pub options: crate::Options,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SubmissionItem {
    #[serde(default)]
    pub save_only: bool,
    pub id: String,
    pub format: OutputFormat,
    pub expected_attempt: u32,
    #[serde(default)]
    pub options: crate::Options,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Submission {
    pub epoch: String,
    pub request_id: String,
    pub items: Vec<SubmissionItem>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Journal {
    pub schema: u8,
    pub epoch: String,
    pub revision: u64,
    pub tasks: Vec<Task>,
    pub output_hint: Option<String>,
    pub receipts: BTreeMap<String, Submission>,
}
impl Default for Journal {
    fn default() -> Self {
        Self {
            schema: 3,
            epoch: uuid::Uuid::new_v4().to_string(),
            revision: 0,
            tasks: vec![],
            output_hint: None,
            receipts: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportReason {
    Unreadable,
    NotRegular,
    TooLarge,
    Unsupported,
    QueueFull,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImportIssue {
    pub name: String,
    pub reason: ImportReason,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImportReport {
    pub id: String,
    pub accepted: u32,
    pub issues: Vec<ImportIssue>,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<TaskProgress>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub failures: BTreeMap<String, crate::failure::Failure>,
    pub schema: u8,
    pub epoch: String,
    pub revision: u64,
    pub tasks: Vec<Task>,
    pub output: Option<String>,
    pub output_authorized: bool,
    pub processing: bool,
    pub clearing: bool,
    pub closing: bool,
    pub persistence_error: Option<String>,
    pub recovery_notice: Option<String>,
    #[serde(default)]
    pub import_report: Option<ImportReport>,
}
#[derive(Clone, Serialize)]
pub struct Change {
    pub epoch: String,
    pub revision: u64,
}
// Only the backend creates Sources. An opened handle pins the selected input during conversion.
pub struct Source {
    pub file: fs::File,
    pub name: PathBuf,
    pub context: crate::ConversionContext,
}
#[derive(Clone, PartialEq, Eq)]
pub(super) struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
    created: Option<SystemTime>,
    #[cfg(unix)]
    dev: u64,
    #[cfg(unix)]
    ino: u64,
}
impl Stamp {
    pub fn file(m: &fs::Metadata) -> Self {
        Self::new(m, false)
    }
    pub fn directory(m: &fs::Metadata) -> Self {
        Self::new(m, true)
    }
    fn new(m: &fs::Metadata, dir: bool) -> Self {
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Self {
            len: if dir { 0 } else { m.len() },
            modified: if dir { None } else { m.modified().ok() },
            created: m.created().ok(),
            #[cfg(unix)]
            dev: m.dev(),
            #[cfg(unix)]
            ino: m.ino(),
        }
    }
}
#[derive(Clone)]
pub(super) struct Registered {
    pub path: PathBuf,
    pub stamp: Stamp,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaskProgress {
    pub id: String,
    pub attempt: u32,
    pub value: crate::progress::Progress,
}
