//! Only native responsibility: atomically save bytes to a user-selected destination.
use std::{collections::HashMap, io::Write, path::PathBuf, sync::Mutex};
use tempfile::NamedTempFile;

pub const CHUNK_LIMIT: usize = 1024 * 1024;
const OUTPUT_LIMIT: u64 = 2 * 1024 * 1024 * 1024;

pub struct PendingSave {
    file: NamedTempFile,
    path: PathBuf,
    expected: u64,
    written: u64,
}
impl PendingSave {
    pub fn new(path: PathBuf, expected: u64) -> Result<Self, String> {
        if expected > OUTPUT_LIMIT {
            return Err("Output exceeds the 2 GiB save limit".into());
        }
        let parent = path.parent().ok_or("Invalid output directory")?;
        let file = NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        Ok(Self {
            file,
            path,
            expected,
            written: 0,
        })
    }
    pub fn append(&mut self, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty()
            || bytes.len() > CHUNK_LIMIT
            || self.written + bytes.len() as u64 > self.expected
        {
            return Err("Invalid output chunk size".into());
        }
        self.file.write_all(bytes).map_err(|e| e.to_string())?;
        self.written += bytes.len() as u64;
        Ok(())
    }
    pub fn finish(self) -> Result<(), String> {
        if self.written != self.expected {
            return Err("Incomplete output; original destination was not changed".into());
        }
        self.file.as_file().sync_all().map_err(|e| e.to_string())?;
        self.file.persist(&self.path).map_err(|e| e.to_string())?;
        Ok(())
    }
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
    fn filename_is_only_a_safe_hint() {
        assert_eq!(suggested_name("../a\\b:?.png"), "_a_b__.png");
        assert_eq!(suggested_name("..."), "converted-file");
        assert_eq!(suggested_name("测试.png"), "测试.png");
    }
}
