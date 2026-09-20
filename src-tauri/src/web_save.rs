//! Only native responsibility: atomically save bytes to a user-selected destination.
use std::{collections::HashMap, io::Write, path::PathBuf, sync::Mutex};
use tempfile::NamedTempFile;

pub const CHUNK_LIMIT: usize = 1024 * 1024;
pub const OUTPUT_LIMIT: u64 = 2 * 1024 * 1024 * 1024;

pub struct PendingSave {
    file: NamedTempFile,
    path: PathBuf,
    expected: u64,
    written: u64,
    failed: bool,
}
impl PendingSave {
    pub fn new(path: PathBuf, expected: u64) -> Result<Self, String> {
        if expected > OUTPUT_LIMIT {
            return Err("Output exceeds the 2 GiB save limit".into());
        }
        let parent = path.parent().ok_or("Invalid output directory")?;
        let file = NamedTempFile::new_in(parent).map_err(save_error)?;
        Ok(Self {
            file,
            path,
            expected,
            written: 0,
            failed: false,
        })
    }
    pub fn append(&mut self, bytes: &[u8]) -> Result<(), String> {
        if self.failed {
            return Err(
                "Save failed; choose another destination / 保存失败，请重新选择位置".into(),
            );
        }
        if bytes.is_empty()
            || bytes.len() > CHUNK_LIMIT
            || self.written + bytes.len() as u64 > self.expected
        {
            return Err("Invalid output chunk size".into());
        }
        if let Err(error) = self.file.write_all(bytes) {
            self.failed = true;
            return Err(save_error(error));
        }
        self.written += bytes.len() as u64;
        Ok(())
    }
    pub fn finish(self) -> Result<(), String> {
        if self.failed
            || self.written != self.expected
            || self.file.as_file().metadata().map_err(save_error)?.len() != self.expected
        {
            return Err("Incomplete output; original destination was not changed".into());
        }
        self.file.as_file().sync_all().map_err(save_error)?;
        self.file
            .persist(&self.path)
            .map_err(|e| save_error(e.error))?;
        Ok(())
    }
}
fn save_error(error: std::io::Error) -> String {
    let guidance = match error.kind() {
        std::io::ErrorKind::StorageFull => {
            "Disk full. Free space or choose another disk / 磁盘空间不足，请清理空间或选择其他磁盘"
        }
        std::io::ErrorKind::PermissionDenied => {
            "No write permission. Choose another folder / 没有写入权限，请选择其他文件夹"
        }
        _ => "Could not save. Choose another location and retry / 无法保存，请选择其他位置后重试",
    };
    format!("{guidance}. Result remains available / 转换结果仍可下载。({error})")
}
#[derive(Default)]
pub struct Saves(pub Mutex<HashMap<String, PendingSave>>);

pub fn suggested_name(name: &str) -> String {
    // A filename hint, never a frontend-supplied path. Also valid on Windows.
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(180)
        .collect();
    let clean = clean.trim_matches(|c| c == ' ' || c == '.');
    if clean.is_empty() {
        "converted-file".into()
    } else {
        clean.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incomplete_or_aborted_save_preserves_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("中文.txt");
        std::fs::write(&path, b"original").unwrap();
        let mut save = PendingSave::new(path.clone(), 6).unwrap();
        save.append(b"abc").unwrap();
        assert!(save.finish().is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        let mut save = PendingSave::new(path.clone(), 6).unwrap();
        save.append(b"abc").unwrap();
        drop(save);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn chunks_publish_atomically_and_validate_limits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("output.txt");
        std::fs::write(&path, b"old").unwrap();
        let mut save = PendingSave::new(path.clone(), 6).unwrap();
        assert!(save.append(&vec![0; CHUNK_LIMIT + 1]).is_err());
        save.append(b"abc").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"old");
        assert!(save.append(b"defg").is_err());
        save.append(b"def").unwrap();
        save.finish().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"abcdef");
        assert!(PendingSave::new(path, OUTPUT_LIMIT + 1).is_err());
    }
    #[test]
    fn large_output_is_streamed_and_failed_publish_can_be_retried() {
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("occupied");
        std::fs::create_dir(&blocked).unwrap();
        std::fs::write(blocked.join("keep"), b"original").unwrap();
        let mut save = PendingSave::new(blocked.clone(), 3).unwrap();
        save.append(b"new").unwrap();
        assert!(save.finish().unwrap_err().contains("retry"));
        assert_eq!(std::fs::read(blocked.join("keep")).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        let path = dir.path().join("retry.bin");
        let block = vec![42; CHUNK_LIMIT];
        let mut retry = PendingSave::new(path.clone(), 32 * CHUNK_LIMIT as u64).unwrap();
        for _ in 0..32 {
            retry.append(&block).unwrap();
        }
        retry.finish().unwrap();
        assert_eq!(
            std::fs::metadata(path).unwrap().len(),
            32 * CHUNK_LIMIT as u64
        );
    }
    #[cfg(unix)]
    #[test]
    fn read_only_directory_reports_actionable_error() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc::geteuid() } == 0 {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o500)).unwrap();
        let result = PendingSave::new(dir.path().join("denied"), 3);
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(result.err().unwrap().contains("No write permission"));
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn actual_enospc_poisoned_writer_cannot_publish_or_accept_more_chunks() {
        use std::os::fd::AsRawFd;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kept.txt");
        std::fs::write(&path, b"original").unwrap();
        let mut save = PendingSave::new(path.clone(), 3).unwrap();
        let full = std::fs::OpenOptions::new()
            .write(true)
            .open("/dev/full")
            .unwrap();
        // Replace only this private test writer's descriptor; /dev/full returns ENOSPC.
        assert!(unsafe { libc::dup2(full.as_raw_fd(), save.file.as_raw_fd()) } >= 0);
        assert!(save.append(b"new").unwrap_err().contains("Disk full"));
        assert!(save.append(b"new").is_err());
        assert!(save.finish().is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn filename_is_only_a_safe_hint() {
        assert_eq!(suggested_name("../a\\b:?.png"), "_a_b__.png");
        assert_eq!(suggested_name("..."), "converted-file");
        assert_eq!(suggested_name("测试.png"), "测试.png");
    }
}
