//! Early storage checks are lower bounds, never reservations or output estimates.
use std::{io::Write, path::Path};

const HEADROOM: u64 = 16 * 1024 * 1024;
#[derive(Clone, Copy)]
pub(crate) enum Area {
    Workspace,
    Output,
}
impl Area {
    fn label(self) -> &'static str {
        match self {
            Self::Workspace => "Temporary workspace",
            Self::Output => "Output folder",
        }
    }
}
struct Available {
    bytes: u64,
    files: Option<u64>,
}

#[cfg(unix)]
fn available(path: &Path) -> Result<Available, String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let path = CString::new(path.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: path is NUL-terminated and stats points to writable statvfs storage.
    if unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: successful statvfs initialized the structure.
    let stats = unsafe { stats.assume_init() };
    if stats.f_frsize == 0 {
        return Err("Filesystem reported an invalid allocation unit".into());
    }
    let bytes = u128::from(stats.f_bavail) * u128::from(stats.f_frsize);
    Ok(Available {
        bytes: bytes
            .try_into()
            .map_err(|_| "Filesystem capacity is out of range")?,
        files: if stats.f_files == 0 {
            None
        } else {
            Some(
                u128::from(stats.f_favail)
                    .try_into()
                    .map_err(|_| "Filesystem file count is out of range")?,
            )
        },
    })
}
#[cfg(windows)]
fn available(path: &Path) -> Result<Available, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR, Win32::Storage::FileSystem::GetDiskFreeSpaceExW};
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    if wide.contains(&0) {
        return Err("Invalid directory path".into());
    }
    // UNC share roots require a trailing separator; also valid for local directories.
    if !matches!(wide.last(), Some(47 | 92)) {
        wide.push(92);
    }
    wide.push(0);
    let mut bytes = 0u64;
    // SAFETY: the terminated path and output pointer live throughout this call.
    unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut bytes), None, None) }
        .map_err(|e| e.to_string())?;
    Ok(Available { bytes, files: None })
}
#[cfg(not(any(unix, windows)))]
fn available(_: &Path) -> Result<Available, String> {
    Err("Storage checks are unavailable on this platform".into())
}
fn assess(available: Available, payload: u64, area: Area) -> Result<(), String> {
    let required = payload
        .checked_add(HEADROOM)
        .ok_or("Storage requirement is out of range")?;
    if available.bytes < required {
        return Err(format!(
            "{} has insufficient free space. Required: {required} bytes; available: {} bytes.",
            area.label(),
            available.bytes
        ));
    }
    let files = match area {
        Area::Workspace => 4,
        Area::Output => 1,
    };
    if available.files.is_some_and(|free| free < files) {
        return Err(format!(
            "{} has insufficient free file entries.",
            area.label()
        ));
    }
    Ok(())
}
pub(crate) fn ensure(path: &Path, payload: u64, area: Area) -> Result<(), String> {
    if !path.is_dir() {
        return Err(format!("{} is unavailable.", area.label()));
    }
    let capacity =
        available(path).map_err(|e| format!("Cannot check free space in {}: {e}", area.label()))?;
    assess(capacity, payload, area)
}
pub(crate) fn prepare_output(path: &Path) -> Result<(), String> {
    ensure(path, 0, Area::Output)?;
    // Do not trust permission bits: ACLs, quotas and read-only mounts matter.
    // Probe only a freshly-created random file, never a user-named target.
    let probe = (|| {
        let mut file = tempfile::Builder::new()
            .prefix(".z8-write-check-")
            .tempfile_in(path)?;
        file.write_all(b"Z8")?;
        file.as_file().sync_all()?;
        file.close()
    })();
    probe.map_err(|e: std::io::Error| format!("Cannot write to output folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn exact_lower_bound_and_insufficient_capacity() {
        assert!(assess(
            Available {
                bytes: HEADROOM + 1024,
                files: Some(4)
            },
            1024,
            Area::Workspace
        )
        .is_ok());
        let error = assess(
            Available {
                bytes: HEADROOM + 1023,
                files: None,
            },
            1024,
            Area::Workspace,
        )
        .unwrap_err();
        assert!(error.starts_with("Temporary workspace has insufficient free space."));
        assert!(assess(
            Available {
                bytes: u64::MAX,
                files: None
            },
            u64::MAX,
            Area::Output
        )
        .is_err());
    }
    #[test]
    fn free_file_entries_checked_only_when_reported() {
        assert!(assess(
            Available {
                bytes: u64::MAX,
                files: Some(0)
            },
            0,
            Area::Output
        )
        .unwrap_err()
        .contains("file entries"));
        assert!(assess(
            Available {
                bytes: u64::MAX,
                files: Some(3)
            },
            0,
            Area::Workspace
        )
        .is_err());
        assert!(assess(
            Available {
                bytes: u64::MAX,
                files: None
            },
            0,
            Area::Workspace
        )
        .is_ok());
    }
    #[test]
    fn real_filesystem_query_and_probe_leave_existing_files_untouched() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("保存 空间");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("original.png"), b"preserve").unwrap();
        assert!(available(&path).unwrap().bytes > 0);
        prepare_output(&path).unwrap();
        assert_eq!(fs::read(path.join("original.png")).unwrap(), b"preserve");
        assert_eq!(fs::read_dir(&path).unwrap().count(), 1);
        assert!(ensure(&path, u64::MAX - HEADROOM, Area::Output)
            .unwrap_err()
            .contains("insufficient free space"));
    }
    #[test]
    fn missing_or_file_instead_of_directory_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        assert!(prepare_output(&root.path().join("missing")).is_err());
        let file = root.path().join("file");
        fs::write(&file, b"preserve").unwrap();
        assert!(prepare_output(&file).is_err());
        assert_eq!(fs::read(file).unwrap(), b"preserve");
    }
    #[cfg(unix)]
    #[test]
    fn unwritable_directory_fails_before_conversion() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o500)).unwrap();
        let result = prepare_output(root.path());
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
        assert!(result
            .unwrap_err()
            .starts_with("Cannot write to output folder:"));
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }
}
