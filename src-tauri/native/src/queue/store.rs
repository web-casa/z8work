use super::model::{Journal, Phase};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
const LIMIT: u64 = 2 * 1024 * 1024;
pub(super) fn load(path: &Path) -> Result<Journal, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Journal::default()),
        Err(e) => return Err(e.to_string()),
    };
    let mut bytes = vec![];
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("Queue record exceeds 2 MiB".into());
    }
    let mut journal: Journal =
        serde_json::from_slice(&bytes).map_err(|e| format!("Cannot read queue history: {e}"))?;
    if ![1, 2].contains(&journal.schema)
        || journal.revision >= 9_007_199_254_740_991
        || uuid::Uuid::parse_str(&journal.epoch).is_err()
    {
        return Err(
            "Unsupported queue history schema; preserve the file and use a compatible application"
                .into(),
        );
    }
    if journal.tasks.len() > 100 || journal.receipts.len() > 1024 {
        return Err("Queue history limit exceeded".into());
    }
    let mut ids = std::collections::BTreeSet::new();
    for task in &mut journal.tasks {
        if !ids.insert(task.id.clone()) || !task.formats.contains(&task.format) {
            return Err("Invalid queue history".into());
        }
        task.options.validate()?;
        if let Some(result) = &task.result {
            let mut pages = std::collections::BTreeSet::new();
            if result.total == 0
                || result.total > 200
                || result.files.len() > 200
                || result.bytes > 256 * 1024 * 1024
                || result.files.iter().any(|f| {
                    f.page == 0
                        || f.page > result.total
                        || !pages.insert(f.page)
                        || f.bytes > 256 * 1024 * 1024
                })
            {
                return Err("Invalid saved output history".into());
            }
        }
        task.authorized = false;
        if task.phase.active() {
            task.phase = Phase::Interrupted;
            task.error = Some("Interrupted by application exit. Check the output folder before retrying; a file may have been saved before the history update.".into());
        }
    }
    if journal.schema == 1 {
        // Preserve the exact Phase 1 record before upgrading in place. Never
        // silently overwrite a backup belonging to different history bytes.
        let backup = path.with_extension("v1-backup.json");
        match fs::read(&backup) {
            Ok(old) if old == bytes => (),
            Ok(_) => return Err("Different Phase 1 history backup already exists; preserve both records before migration".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing history directory")?).map_err(|e| e.to_string())?;
                temp.write_all(&bytes).map_err(|e| e.to_string())?;
                temp.as_file().sync_all().map_err(|e| e.to_string())?;
                temp.persist_noclobber(&backup).map_err(|e| e.to_string())?;
            }
            Err(e) => return Err(e.to_string()),
        }
        journal.schema = 2;
    }
    journal.revision = journal
        .revision
        .checked_add(1)
        .ok_or("Queue revision exhausted")?;
    Ok(journal)
}
pub(super) fn save(path: &Path, journal: &Journal) -> Result<(), String> {
    let parent = path.parent().ok_or("Queue history directory unavailable")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(journal).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("Queue history exceeds 2 MiB; clear completed tasks".into());
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(&bytes).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}
