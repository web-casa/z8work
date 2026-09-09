use super::*;
use model::{ImportIssue, ImportReason};

pub(super) type Prepared = (PathBuf, Stamp, u64, Vec<OutputFormat>);
pub(super) fn prepare(shared: &Shared, path: PathBuf) -> Result<Prepared, (ImportReason, String)> {
    let unreadable = |e: std::io::Error| (ImportReason::Unreadable, e.to_string());
    let path = path.canonicalize().map_err(unreadable)?;
    let meta = path.metadata().map_err(unreadable)?;
    if !meta.is_file() {
        return Err((
            ImportReason::NotRegular,
            "Select regular files up to 512 MiB each".into(),
        ));
    }
    // Reuse the nonblocking regular-file opener, then stamp the actual handle.
    let file = crate::input::open_regular(&path).map_err(unreadable)?;
    let meta = file.metadata().map_err(unreadable)?;
    if meta.len() > 512 * 1024 * 1024 {
        return Err((
            ImportReason::TooLarge,
            "Select regular files up to 512 MiB each".into(),
        ));
    }
    let formats = (shared.formats)(path.extension().and_then(|e| e.to_str()).unwrap_or(""));
    if formats.is_empty() {
        return Err((
            ImportReason::Unsupported,
            format!(
                "Unsupported input or required native engine unavailable: {}",
                path.file_name().unwrap_or_default().to_string_lossy()
            ),
        ));
    }
    Ok((path, Stamp::file(&meta), meta.len(), formats))
}
pub(super) fn issue(path: &Path, reason: ImportReason) -> ImportIssue {
    ImportIssue {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .chars()
            .take(256)
            .collect(),
        reason,
    }
}
