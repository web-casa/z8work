//! Real filesystem faults, only in explicitly bounded Linux tmpfs mounts.
//! Separate validation executable; never registered as desktop IPC.
use crate::{
    convert_source,
    failure::Failure,
    phase2_smoke::{command, name, source},
    Cancel, ConversionContext, Engines, OutputFormat, PendingOutput,
};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::Path,
    sync::{Arc, Mutex},
    time::Instant,
};

#[cfg(target_os = "linux")]
fn tmpfs(path: &Path, readonly: bool, inode_limit: bool) -> Result<(), String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Fault root must be a real directory".into());
    }
    let p = CString::new(path.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    let mut stats = std::mem::MaybeUninit::<libc::statfs>::uninit();
    // SAFETY: valid terminated path and writable statfs storage.
    if unsafe { libc::statfs(p.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: successful statfs initialized the structure.
    let stats = unsafe { stats.assume_init() };
    let size = u128::from(stats.f_blocks) * stats.f_bsize as u128;
    if stats.f_type != libc::TMPFS_MAGIC
        || !(24 * 1024 * 1024..=64 * 1024 * 1024).contains(&size)
        || (inode_limit && stats.f_files > 256)
    {
        return Err("Fault injection requires a 24–64 MiB tmpfs and bounded inode count".into());
    }
    let mut flags = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: same valid path and writable statvfs storage.
    if unsafe { libc::statvfs(p.as_ptr(), flags.as_mut_ptr()) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: successful statvfs initialized the structure.
    if (unsafe { flags.assume_init() }.f_flag & libc::ST_RDONLY != 0) != readonly {
        return Err("Unexpected read-only mount state".into());
    }
    Ok(())
}
#[cfg(target_os = "linux")]
fn exhaust(path: &Path, inodes: bool) -> Result<usize, String> {
    tmpfs(path, false, inodes)?;
    if inodes {
        for index in 0..256 {
            match fs::File::options()
                .write(true)
                .create_new(true)
                .open(path.join(format!("inode-{index}")))
            {
                Ok(_) => (),
                Err(e) if e.raw_os_error() == Some(libc::ENOSPC) => return Ok(index),
                Err(e) => return Err(e.to_string()),
            }
        }
    } else {
        let mut file = fs::File::options()
            .write(true)
            .create_new(true)
            .open(path.join("filler"))
            .map_err(|e| e.to_string())?;
        let bytes = [0x5a; 65536];
        for index in 0..1025 {
            match file.write_all(&bytes) {
                Ok(()) => (),
                Err(e) if e.raw_os_error() == Some(libc::ENOSPC) => return Ok(index * bytes.len()),
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    Err("Bounded fault injection did not reach ENOSPC".into())
}
// Process-wide fault injection, only in the dedicated sequential verifier.
// It is installed after encoding, with no engine child running, and restored
// before save recovery or any subsequent engine invocation.
struct FileLimit {
    previous: libc::rlimit,
    action: libc::sigaction,
    active: bool,
}
impl FileLimit {
    fn install() -> Result<Self, String> {
        // SAFETY: both C output structures are initialized by successful calls below.
        let mut previous = unsafe { std::mem::zeroed::<libc::rlimit>() };
        let mut action = unsafe { std::mem::zeroed::<libc::sigaction>() };
        if unsafe { libc::getrlimit(libc::RLIMIT_FSIZE, &mut previous) } != 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        if previous.rlim_cur <= 256 {
            return Err("Existing file-size limit is too low for fault verification".into());
        }
        // SAFETY: SIG_IGN is a valid disposition; sigemptyset initializes its mask.
        let mut ignored = unsafe { std::mem::zeroed::<libc::sigaction>() };
        ignored.sa_sigaction = libc::SIG_IGN;
        if unsafe { libc::sigemptyset(&mut ignored.sa_mask) } != 0
            || unsafe { libc::sigaction(libc::SIGXFSZ, &ignored, &mut action) } != 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let mut guard = Self {
            previous,
            action,
            active: true,
        };
        let limit = libc::rlimit {
            rlim_cur: 256,
            rlim_max: previous.rlim_max,
        };
        // SAFETY: retain the hard limit; only this verifier's soft limit changes.
        if unsafe { libc::setrlimit(libc::RLIMIT_FSIZE, &limit) } != 0 {
            let error = std::io::Error::last_os_error().to_string();
            guard.restore()?;
            return Err(error);
        }
        Ok(guard)
    }
    fn restore(&mut self) -> Result<(), String> {
        if self.active {
            // SAFETY: restore the exact previous limit and signal action.
            if unsafe { libc::setrlimit(libc::RLIMIT_FSIZE, &self.previous) } != 0
                || unsafe { libc::sigaction(libc::SIGXFSZ, &self.action, std::ptr::null_mut()) }
                    != 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            self.active = false;
        }
        Ok(())
    }
}
impl Drop for FileLimit {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}
#[cfg(target_os = "linux")]
pub fn verify(engines: Engines) -> Result<Value, String> {
    use std::os::unix::fs::PermissionsExt;
    // SAFETY: geteuid has no preconditions.
    if unsafe { libc::geteuid() } == 0 {
        return Err("Fault checks require an unprivileged UID".into());
    }
    let started = Instant::now();
    for (path, ro, inodes) in [
        ("/fault-output", false, false),
        ("/fault-readonly", true, false),
        ("/fault-inodes", false, true),
    ] {
        tmpfs(Path::new(path), ro, inodes)?;
        if fs::read_dir(path)
            .map_err(|e| e.to_string())?
            .next()
            .is_some()
        {
            return Err("Fault mounts must be empty; refusing to modify existing files".into());
        }
    }
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let input = root.path().join("source.png");
    command(
        &engines,
        "magick",
        &["-size", "64x48", "gradient:red-blue", name(&input)],
    )?;
    let original = crate::hash_file(&input)?;
    let workspace = crate::workspaces::Store::open(root.path().join("cache"))?;
    let good = root.path().join("saved");
    fs::create_dir(&good).map_err(|e| e.to_string())?;
    let mut checks = vec![];
    let readonly = crate::storage::prepare_output(Path::new("/fault-readonly"))
        .err()
        .ok_or("Read-only mount unexpectedly writable")?;
    if Failure::classify(&readonly) != Failure::OutputPermission {
        return Err(format!("Wrong read-only category: {readonly}"));
    }
    checks.push(
        json!({"id":"readonly-mount","status":"passed","failure":Failure::classify(&readonly)}),
    );
    let inode_count = exhaust(Path::new("/fault-inodes"), true)?;
    let inode_error = crate::storage::prepare_output(Path::new("/fault-inodes"))
        .err()
        .ok_or("Inode exhaustion undetected")?;
    if Failure::classify(&inode_error) != Failure::Storage {
        return Err(format!("Wrong inode exhaustion category: {inode_error}"));
    }
    checks.push(json!({"id":"inode-exhaustion","status":"passed","createdFiles":inode_count,"failure":Failure::classify(&inode_error)}));
    for mode in ["disk-full", "permission-revoked", "file-size-limit"] {
        let directory = Path::new("/fault-output");
        let sentinel = directory.join("source-z8-1.png");
        fs::write(&sentinel, b"existing user result").map_err(|e| e.to_string())?;
        let retained: Arc<Mutex<Option<PendingOutput>>> = Default::default();
        let captured = retained.clone();
        let injection: Arc<Mutex<Option<Result<usize, String>>>> = Default::default();
        let injected = injection.clone();
        let limit: Arc<Mutex<Option<FileLimit>>> = Default::default();
        let limit_injection = limit.clone();
        let mut source = source(&input, ConversionContext::default())?;
        source.context = ConversionContext {
            workspace: Some(workspace.clone()),
            progress: Some(Arc::new(move |event| {
                if event.stage == crate::progress::Stage::Publishing {
                    let result = if mode == "disk-full" {
                        exhaust(directory, false)
                    } else if mode == "file-size-limit" {
                        FileLimit::install().map(|guard| {
                            *limit_injection.lock().unwrap() = Some(guard);
                            0
                        })
                    } else {
                        fs::set_permissions(directory, fs::Permissions::from_mode(0o500))
                            .map(|_| 0)
                            .map_err(|e| e.to_string())
                    };
                    *injected.lock().unwrap() = Some(result);
                }
            })),
            retain: Some(Arc::new(move |value| {
                *captured.lock().unwrap() = Some(value);
                Ok(())
            })),
            ..Default::default()
        };
        let result = convert_source(
            &engines,
            source,
            directory,
            OutputFormat::Png,
            &Cancel::default(),
        );
        let injected = injection
            .lock()
            .unwrap()
            .take()
            .ok_or("Publishing fault hook was not reached")??;
        let error = result
            .err()
            .ok_or("Faulted publication unexpectedly succeeded")?;
        if mode == "file-size-limit" && !error.contains("os error 27") {
            return Err(format!("Expected real EFBIG during publication: {error}"));
        }
        let expected = if mode != "permission-revoked" {
            Failure::Storage
        } else {
            Failure::OutputPermission
        };
        if Failure::classify(&error) != expected {
            return Err(format!("Wrong publication failure: {error}"));
        }
        let pending = retained
            .lock()
            .unwrap()
            .take()
            .ok_or("Verified output lost after publication failure")?;
        let retry_error = pending.save(directory, &Cancel::default()).err();
        if retry_error.is_none() {
            return Err("Retry ignored active fault".into());
        }
        if mode == "file-size-limit" {
            if !retry_error.unwrap().contains("os error 27") || pending.bytes <= 256 {
                return Err("Save retry did not reach the real file-size limit".into());
            }
            limit
                .lock()
                .unwrap()
                .as_mut()
                .ok_or("Missing file-size guard")?
                .restore()?;
        }
        if fs::read(&sentinel).map_err(|e| e.to_string())? != b"existing user result"
            || crate::hash_file(&input)? != original
        {
            return Err("Fault modified an original or existing output".into());
        }
        let entries = fs::read_dir(directory).map_err(|e| e.to_string())?.count();
        if entries != if mode == "disk-full" { 2 } else { 1 } {
            return Err("Partial publication file leaked".into());
        }
        if mode == "disk-full" {
            fs::remove_file(directory.join("filler")).map_err(|e| e.to_string())?;
        }
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
        let removed = root.path().join("unregistered-source.png");
        fs::rename(&input, &removed).map_err(|e| e.to_string())?;
        let collision = good.join("source-z8-1.png");
        fs::write(&collision, b"keep this file").map_err(|e| e.to_string())?;
        let saved = pending.save(&good, &Cancel::default())?;
        if !saved.path.ends_with("source-z8-2.png")
            || fs::read(&collision).map_err(|e| e.to_string())? != b"keep this file"
        {
            return Err("Save retry overwrote an existing output".into());
        }
        crate::phase27_smoke::image_semantics(
            &engines,
            &removed,
            Path::new(&saved.path),
            OutputFormat::Png,
            root.path(),
        )?;
        let saved_hash = crate::hash_file(Path::new(&saved.path))?;
        drop(pending);
        fs::rename(removed, &input).map_err(|e| e.to_string())?;
        fs::remove_file(&sentinel).map_err(|e| e.to_string())?;
        fs::remove_file(&saved.path).map_err(|e| e.to_string())?;
        checks.push(json!({"id":mode,"status":"passed","injectedBytes":injected,"fileSizeLimit":if mode == "file-size-limit" {256} else {0},"failure":expected,"saveRetryWithoutSource":true,"existingFilesPreserved":true,"partialFiles":0,"savedBytes":saved.bytes,"savedSha256":saved_hash}));
    }
    drop(workspace);
    if fs::read_dir(root.path().join("cache"))
        .map_err(|e| e.to_string())?
        .next()
        .is_some()
    {
        return Err("Session workspace leaked".into());
    }
    checks.push(json!({"id":"workspace-cleanup","status":"passed"}));
    Ok(
        json!({"schema":2,"phase":29,"status":"passed","platform":format!("{}-{}",std::env::consts::OS,std::env::consts::ARCH),"scope":"native conversion/publisher fault checks; not installed GUI acceptance","elapsedMs":started.elapsed().as_millis(),"checks":checks}),
    )
}
