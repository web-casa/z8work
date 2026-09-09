//! Desktop-only preferences. No paths, file grants, queue state or browser migration.
use crate::{Options, OutputFormat};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
const LIMIT: u64 = 16 * 1024;
const MAX_REVISION: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    #[default]
    System,
    En,
    ZhHans,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    pub language: Language,
    pub batch_format: OutputFormat,
    pub batch_options: Options,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            language: Language::System,
            batch_format: OutputFormat::Webp,
            batch_options: Options::default(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub schema: u8,
    pub revision: u64,
    pub preferences: Preferences,
}
impl Default for Record {
    fn default() -> Self {
        Self {
            schema: 1,
            revision: 0,
            preferences: Preferences::default(),
        }
    }
}
// The app's single-instance guard precedes this store. The mutex serializes IPC;
// revisions also reject stale requests after a UI reload or ambiguous reply.
pub struct Store {
    path: PathBuf,
    lock: Mutex<()>,
}
impl Store {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }
    pub fn read(&self) -> Result<Record, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "Preferences lock unavailable")?;
        load(&self.path)
    }
    pub fn save(&self, expected_revision: u64, preferences: Preferences) -> Result<Record, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "Preferences lock unavailable")?;
        preferences.batch_options.validate()?;
        let current = load(&self.path)?;
        if current.revision != expected_revision {
            return Err("Preferences changed; reload before saving again".into());
        }
        if current.revision >= MAX_REVISION {
            return Err("Preferences revision exhausted".into());
        }
        let next = Record {
            schema: 1,
            revision: current.revision + 1,
            preferences,
        };
        let parent = self
            .path
            .parent()
            .ok_or("Preferences directory unavailable")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        let bytes = serde_json::to_vec(&next).map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(&self.path).map_err(|e| e.error.to_string())?;
        Ok(next)
    }
}
fn load(path: &Path) -> Result<Record, String> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Record::default()),
        Err(e) => return Err(e.to_string()),
        Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
            return Err("Preferences must be a regular file".into())
        }
        Ok(_) => (),
    }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("Preferences exceed 16 KiB; original file preserved".into());
    }
    let record: Record = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Cannot read preferences; original file preserved: {e}"))?;
    if record.schema != 1 || record.revision > MAX_REVISION {
        return Err("Unsupported preferences schema or revision; original file preserved".into());
    }
    record.preferences.batch_options.validate()?;
    Ok(record)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Store) {
        let root = tempfile::tempdir().unwrap();
        let store = Store::new(root.path().join("偏好.json"));
        (root, store)
    }
    #[test]
    fn first_read_does_not_write_and_restart_restores_preferences() {
        let (_root, store) = fixture();
        assert_eq!(store.read().unwrap(), Record::default());
        assert!(!store.path.exists());
        let prefs = Preferences {
            language: Language::En,
            batch_format: OutputFormat::Avif,
            batch_options: Options {
                quality: crate::Quality::High,
                keep_metadata: true,
                pdf_dpi: 96,
            },
        };
        let saved = store.save(0, prefs.clone()).unwrap();
        assert_eq!(saved.revision, 1);
        assert_eq!(
            Store::new(store.path.clone()).read().unwrap().preferences,
            prefs
        );
        let serialized = fs::read_to_string(&store.path).unwrap();
        for forbidden in ["path", "authorized", "output_hint", "tasks"] {
            assert!(!serialized.contains(forbidden));
        }
    }
    #[test]
    fn stale_save_cannot_replace_a_newer_choice() {
        let (_root, store) = fixture();
        let first = store.save(0, Preferences::default()).unwrap();
        assert!(store
            .save(
                0,
                Preferences {
                    language: Language::En,
                    ..Preferences::default()
                }
            )
            .is_err());
        assert_eq!(store.read().unwrap(), first);
    }
    #[test]
    fn invalid_or_future_records_are_never_overwritten() {
        let (_root, store) = fixture();
        let mut future = serde_json::to_value(Record::default()).unwrap();
        future["schema"] = 2.into();
        let mut grants = serde_json::to_value(Record::default()).unwrap();
        grants["authorized"] = true.into();
        for raw in [
            b"{broken".to_vec(),
            serde_json::to_vec(&future).unwrap(),
            serde_json::to_vec(&grants).unwrap(),
            vec![b' '; LIMIT as usize + 1],
        ] {
            fs::write(&store.path, &raw).unwrap();
            assert!(store.read().is_err());
            assert!(store.save(0, Preferences::default()).is_err());
            assert_eq!(fs::read(&store.path).unwrap(), raw);
        }
    }
    #[test]
    fn invalid_dpi_and_revision_exhaustion_preserve_previous_bytes() {
        let (_root, store) = fixture();
        store.save(0, Preferences::default()).unwrap();
        let before = fs::read(&store.path).unwrap();
        let mut bad = Preferences::default();
        bad.batch_options.pdf_dpi = 900;
        assert!(store.save(1, bad).is_err());
        assert_eq!(fs::read(&store.path).unwrap(), before);
        let full = Record {
            revision: MAX_REVISION,
            ..Record::default()
        };
        fs::write(&store.path, serde_json::to_vec(&full).unwrap()).unwrap();
        assert!(store.save(MAX_REVISION, Preferences::default()).is_err());
        assert_eq!(store.read().unwrap(), full);
    }
    #[test]
    fn unavailable_directory_can_be_retried_without_advancing_revision() {
        let (root, _) = fixture();
        let parent = root.path().join("not-a-directory");
        fs::write(&parent, b"preserve").unwrap();
        let store = Store::new(parent.join("preferences.json"));
        assert!(store.save(0, Preferences::default()).is_err());
        assert_eq!(fs::read(&parent).unwrap(), b"preserve");
        fs::remove_file(&parent).unwrap();
        assert_eq!(store.save(0, Preferences::default()).unwrap().revision, 1);
    }
    #[test]
    fn concurrent_same_revision_saves_have_one_winner() {
        let (_root, store) = fixture();
        let store = std::sync::Arc::new(store);
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let store = store.clone();
                std::thread::spawn(move || store.save(0, Preferences::default()).is_ok())
            })
            .collect();
        assert_eq!(
            handles
                .into_iter()
                .filter_map(|h| h.join().ok())
                .filter(|ok| *ok)
                .count(),
            1
        );
        assert_eq!(store.read().unwrap().revision, 1);
    }
    #[cfg(unix)]
    #[test]
    fn symlink_preferences_do_not_follow_or_replace_the_target() {
        let (root, store) = fixture();
        let target = root.path().join("target");
        fs::write(&target, b"preserve").unwrap();
        std::os::unix::fs::symlink(&target, &store.path).unwrap();
        assert!(store.read().is_err());
        assert!(store.save(0, Preferences::default()).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"preserve");
    }
}
