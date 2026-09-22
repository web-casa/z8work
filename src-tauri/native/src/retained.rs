//! Session-only verified output. No paths or grants are deserialized from IPC/history.
use crate::{workspaces::Workdir, Cancel, ConversionResult, OutputFormat};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

pub(crate) const TTL: Duration = Duration::from_secs(30 * 60);
pub(crate) const TOTAL_BUDGET: u64 = 1024 * 1024 * 1024;
pub(crate) const FILE_BUDGET: u64 = 256 * 1024 * 1024;
pub(crate) const EXPIRED: &str = "Saved result expired or unavailable; convert again";
pub(crate) const INVALID: &str = "Saved result changed or is unreadable; convert again";
pub(crate) const FULL: &str =
    "Saved-result cache is full; convert again after saving or removing other tasks";

pub(crate) fn budget_allows(used: u64, bytes: u64) -> bool {
    bytes > 0 && bytes <= FILE_BUDGET && used.checked_add(bytes).is_some_and(|n| n <= TOTAL_BUDGET)
}

pub struct PendingOutput {
    work: Workdir,
    // Released after Workdir deletion and only after the final Arc owner is gone.
    reservation: Option<Reservation>,
    name: PathBuf,
    pub(crate) format: OutputFormat,
    pub(crate) bytes: u64,
    hash: String,
    note: String,
}
struct Reservation {
    counter: Arc<AtomicU64>,
    bytes: u64,
}
impl Drop for Reservation {
    fn drop(&mut self) {
        self.counter.fetch_sub(self.bytes, Ordering::SeqCst);
    }
}
impl PendingOutput {
    pub(crate) fn reserve(&mut self, counter: Arc<AtomicU64>) -> Result<(), String> {
        if self.reservation.is_some() {
            return Err("Encoded result already reserved".into());
        }
        counter
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |used| {
                budget_allows(used, self.bytes).then(|| used + self.bytes)
            })
            .map_err(|_| FULL)?;
        self.reservation = Some(Reservation {
            counter,
            bytes: self.bytes,
        });
        Ok(())
    }
    #[cfg(test)]
    pub(crate) fn test_path(&self) -> PathBuf {
        self.work.path().join("encoded")
    }
    pub(crate) fn capture(
        work: &Workdir,
        output: &Path,
        input: &Path,
        format: OutputFormat,
        note: String,
    ) -> Result<Self, String> {
        let meta = fs::symlink_metadata(output).map_err(|_| INVALID)?;
        if !meta.is_file() || meta.len() == 0 || meta.len() > FILE_BUDGET {
            return Err(INVALID.into());
        }
        let bytes = meta.len();
        let hash = crate::hash_file(output)?;
        let retained = work.sibling()?;
        crate::storage::ensure(retained.path(), 0, crate::storage::Area::Workspace)?;
        // Same session/filesystem: move just the encoded file, not staged inputs or scratch.
        fs::rename(output, retained.path().join("encoded")).map_err(|e| e.to_string())?;
        Ok(Self {
            work: retained,
            reservation: None,
            name: input.file_name().ok_or("Missing input name")?.into(),
            format,
            bytes,
            hash,
            note,
        })
    }
    pub(crate) fn save(
        &self,
        directory: &Path,
        cancel: &Cancel,
    ) -> Result<ConversionResult, String> {
        let saved = crate::convert::publish_verified(
            cancel,
            Instant::now() + Duration::from_secs(120),
            &self.work.path().join("encoded"),
            directory,
            &self.name,
            self.format,
            None,
            FILE_BUDGET,
            Some((self.bytes, &self.hash)),
        )?;
        Ok(ConversionResult {
            path: saved.path.clone(),
            bytes: saved.bytes,
            note: self.note.clone(),
            files: vec![saved],
            total: 1,
            complete: true,
            fingerprint: String::new(),
        })
    }
}

#[cfg(test)]
mod tests;
