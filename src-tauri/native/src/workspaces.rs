//! Application-owned scratch sessions. Never scan user output folders or /tmp.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const GRACE_MS: u64 = 60_000;
const SCAN_LIMIT: usize = 128;
#[derive(Clone, Debug, Default, Serialize)]
pub struct CleanupReport {
    pub removed: u32,
    pub deferred: u32,
    pub active: u32,
    pub unrecognized: u32,
    pub failed: u32,
    pub limited: bool,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Marker {
    schema: u8,
    kind: String,
    session: String,
    orphaned_at_ms: Option<u64>,
}
// The lease remains locked through explicit session cleanup.
pub struct Store {
    _lease: fs::File,
    session: tempfile::TempDir,
    root: PathBuf,
    report: Mutex<CleanupReport>,
}
pub(crate) struct Workdir {
    directory: tempfile::TempDir,
    // Keep the session lock until after its last job directory has gone.
    _owner: Option<Arc<Store>>,
}
impl Workdir {
    pub(crate) fn sibling(&self) -> Result<Self, String> {
        match &self._owner {
            Some(owner) => owner.create(),
            None => Ok(Self::temporary(
                private_builder("z8-saved-")
                    .tempdir_in(self.path().parent().ok_or("Missing workspace parent")?)
                    .map_err(|e| e.to_string())?,
            )),
        }
    }
    pub fn path(&self) -> &Path {
        self.directory.path()
    }
    pub fn temporary(directory: tempfile::TempDir) -> Self {
        Self {
            directory,
            _owner: None,
        }
    }
}
fn private_builder(prefix: &str) -> tempfile::Builder<'_, '_> {
    let mut builder = tempfile::Builder::new();
    builder.prefix(prefix);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(fs::Permissions::from_mode(0o700));
    }
    builder
}
fn now() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis()
        .try_into()
        .map_err(|_| "Clock out of range".into())
}
fn plain(path: &Path, directory: bool) -> Result<fs::Metadata, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink()
        || (if directory {
            !meta.is_dir()
        } else {
            !meta.is_file()
        })
    {
        return Err("Temporary workspace must not be a link or special file".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Temporary workspace must not be a reparse point".into());
        }
    }
    Ok(meta)
}
fn private_root(root: &Path) -> Result<(), String> {
    let meta = plain(root, true)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 {
            return Err("Temporary workspace must be private to the current user".into());
        }
    }
    #[cfg(not(unix))]
    let _ = meta;
    Ok(())
}
fn write_marker(file: &mut fs::File, marker: &Marker) -> Result<(), String> {
    let bytes = serde_json::to_vec(marker).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.set_len(bytes.len() as u64)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Arc<Self>, String> {
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&root).map_err(|e| e.to_string())?;
        private_root(&root)?;
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let report = cleanup(&root, now()?)?;
        let session = private_builder("session-")
            .tempdir_in(&root)
            .map_err(|e| e.to_string())?;
        let mut lease = fs::File::options()
            .read(true)
            .write(true)
            .create_new(true)
            .open(session.path().join("lease.json"))
            .map_err(|e| e.to_string())?;
        lease.try_lock().map_err(|e| e.to_string())?;
        write_marker(
            &mut lease,
            &Marker {
                schema: 1,
                kind: "z8-native-workspace".into(),
                session: session.path().file_name().unwrap().to_string_lossy().into(),
                orphaned_at_ms: None,
            },
        )?;
        Ok(Arc::new(Self {
            _lease: lease,
            session,
            root,
            report: Mutex::new(report),
        }))
    }
    pub fn report(&self) -> Result<CleanupReport, String> {
        self.report
            .lock()
            .map(|r| r.clone())
            .map_err(|e| e.to_string())
    }
    pub(crate) fn create(self: &Arc<Self>) -> Result<Workdir, String> {
        private_root(&self.root)?;
        plain(self.session.path(), true)?;
        let report = cleanup(&self.root, now()?)?;
        *self.report.lock().map_err(|e| e.to_string())? = report;
        let directory = private_builder("job-")
            .tempdir_in(self.session.path())
            .map_err(|e| e.to_string())?;
        Ok(Workdir {
            directory,
            _owner: Some(self.clone()),
        })
    }
}
// Delete the ownership marker last. A partial cleanup failure must leave enough
// information for a later retry instead of stranding unrecognizable input copies.
fn remove_session(path: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_name() == "lease.json" {
            continue;
        }
        if entry.file_type()?.is_dir() {
            fs::remove_dir_all(entry.path())?;
        } else {
            fs::remove_file(entry.path())?;
        }
    }
    fs::remove_file(path.join("lease.json"))?;
    fs::remove_dir(path)
}
impl Drop for Store {
    fn drop(&mut self) {
        // TempDir's unspecified entry order might remove the marker first.
        // Keep failures discoverable by the next application's cleanup pass.
        self.session.disable_cleanup(true);
        if private_root(self.session.path()).is_ok() {
            let _ = remove_session(self.session.path());
        }
    }
}
fn cleanup(root: &Path, at_ms: u64) -> Result<CleanupReport, String> {
    private_root(root)?;
    let mut report = CleanupReport::default();
    for (index, entry) in fs::read_dir(root).map_err(|e| e.to_string())?.enumerate() {
        if index == SCAN_LIMIT {
            report.limited = true;
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                report.failed += 1;
                continue;
            }
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.strip_prefix("session-").is_some_and(|s| {
            (6..=32).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric())
        }) || private_root(&entry.path()).is_err()
        {
            report.unrecognized += 1;
            continue;
        }
        let lease_path = entry.path().join("lease.json");
        if plain(&lease_path, false).is_err() {
            report.unrecognized += 1;
            continue;
        }
        let mut options = fs::File::options();
        options.read(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let mut lease = match options.open(&lease_path) {
            Ok(file) => file,
            Err(_) => {
                report.failed += 1;
                continue;
            }
        };
        // A marker must be a private, single-link regular file. Recheck the
        // opened handle, not only its path, before ever rewriting its contents.
        let Ok(meta) = lease.metadata() else {
            report.failed += 1;
            continue;
        };
        if !meta.is_file() {
            report.unrecognized += 1;
            continue;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if meta.nlink() != 1 || meta.uid() != unsafe { libc::geteuid() } {
                report.unrecognized += 1;
                continue;
            }
        }
        match lease.try_lock() {
            Ok(()) => {}
            Err(fs::TryLockError::WouldBlock) => {
                report.active += 1;
                continue;
            }
            Err(fs::TryLockError::Error(_)) => {
                report.failed += 1;
                continue;
            }
        }
        let mut bytes = Vec::new();
        if (&mut lease).take(1025).read_to_end(&mut bytes).is_err() || bytes.len() > 1024 {
            report.unrecognized += 1;
            continue;
        }
        let mut marker: Marker = match serde_json::from_slice(&bytes) {
            Ok(marker) => marker,
            Err(_) => {
                report.unrecognized += 1;
                continue;
            }
        };
        if marker.schema != 1 || marker.kind != "z8-native-workspace" || marker.session != name {
            report.unrecognized += 1;
            continue;
        }
        // Observe an unlocked session twice. Its age alone does not prove an
        // engine has finished following abrupt parent death. Never reset this
        // grace timer on later starts; a backward clock only delays deletion.
        let Some(orphaned) = marker.orphaned_at_ms else {
            marker.orphaned_at_ms = Some(at_ms);
            if write_marker(&mut lease, &marker).is_err() {
                report.failed += 1;
            } else {
                report.deferred += 1;
            }
            continue;
        };
        if at_ms.saturating_sub(orphaned) < GRACE_MS {
            report.deferred += 1;
            continue;
        }
        // Standard remove_dir_all does not follow descendant symlinks. Keep the
        // exclusive lease through deletion so another cleaner cannot enter.
        if remove_session(&entry.path()).is_ok() {
            report.removed += 1;
        } else {
            report.failed += 1;
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests;
