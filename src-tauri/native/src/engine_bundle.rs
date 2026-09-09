//! Package-relative resources. Hashes detect corruption; publisher trust belongs to signing.
use crate::engines::{Engines, Entry};
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Resource {
    pub sha256: String,
    pub bytes: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Bundle {
    schema: u8,
    kind: String,
    os: String,
    arch: String,
    engines: BTreeMap<String, Entry>,
    files: BTreeMap<String, Resource>,
    loader: Option<String>,
    magick_modules: Option<String>,
    magick_config: Option<String>,
    heif_plugins: Option<String>,
}
#[derive(Clone)]
pub(crate) struct VerifiedBundle {
    root: PathBuf,
    files: BTreeMap<String, Resource>,
    pub loader: Option<PathBuf>,
    pub magick_modules: Option<PathBuf>,
    pub magick_config: Option<PathBuf>,
    pub heif_plugins: Option<PathBuf>,
    pub identity: String,
}
fn relative(value: &str) -> Result<&Path, String> {
    let path = Path::new(value);
    if value.is_empty()
        || value.contains(['\\', ':'])
        || value.starts_with('/')
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || !path
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err(format!("Invalid package-relative path: {value}"));
    }
    Ok(path)
}
fn inside(root: &Path, value: &str, directory: bool) -> Result<PathBuf, String> {
    let path = relative(value)?;
    let mut current = root.to_path_buf();
    for component in path.components() {
        current.push(component);
        let meta = fs::symlink_metadata(&current)
            .map_err(|e| format!("Missing bundle resource {value}: {e}"))?;
        if meta.file_type().is_symlink() {
            return Err(format!("Bundle symlink rejected: {value}"));
        }
    }
    let meta = fs::metadata(&current).map_err(|e| e.to_string())?;
    if (directory && !meta.is_dir()) || (!directory && !meta.is_file()) {
        return Err(format!("Wrong bundle resource type: {value}"));
    }
    Ok(current)
}
impl VerifiedBundle {
    pub fn verify(&self) -> Result<(), String> {
        self.verify_checked(
            &crate::Cancel::default(),
            std::time::Instant::now() + std::time::Duration::from_secs(120),
        )
    }
    fn verify_checked(
        &self,
        cancel: &crate::Cancel,
        deadline: std::time::Instant,
    ) -> Result<(), String> {
        let mut found = 0;
        let mut pending = vec![self.root.clone()];
        while let Some(dir) = pending.pop() {
            cancel.check(deadline)?;
            for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
                let item = item.map_err(|e| e.to_string())?;
                let kind = item.file_type().map_err(|e| e.to_string())?;
                let path = item.path();
                if kind.is_dir() {
                    pending.push(path);
                    continue;
                }
                if !kind.is_file() {
                    return Err("Non-regular bundle resource rejected".into());
                }
                let name = path
                    .strip_prefix(&self.root)
                    .map_err(|e| e.to_string())?
                    .to_str()
                    .ok_or("Non-UTF8 bundle path")?
                    .replace('\\', "/");
                if name == "engines.json" {
                    continue;
                }
                let resource = self
                    .files
                    .get(&name)
                    .ok_or_else(|| format!("Unlisted bundle resource: {name}"))?;
                if fs::metadata(&path).map_err(|e| e.to_string())?.len() != resource.bytes
                    || crate::engines::hash_file_checked(&path, cancel, deadline)?
                        != resource.sha256
                {
                    return Err(format!("Bundle integrity mismatch: {name}"));
                }
                found += 1;
            }
        }
        if found != self.files.len() {
            return Err("Bundle resources missing".into());
        }
        Ok(())
    }
}
impl Engines {
    /// Only the Rust package resolver may choose this root; it is never an IPC argument.
    pub fn load_bundle(root: &Path) -> Result<Self, String> {
        Self::load_bundle_checked(
            root,
            &crate::Cancel::default(),
            std::time::Instant::now() + std::time::Duration::from_secs(120),
        )
    }
    pub(crate) fn load_bundle_checked(
        root: &Path,
        cancel: &crate::Cancel,
        deadline: std::time::Instant,
    ) -> Result<Self, String> {
        cancel.check(deadline)?;
        if fs::symlink_metadata(root)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Bundle root must not be a symlink".into());
        }
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let manifest_path = inside(&root, "engines.json", false)?;
        let mut bytes = vec![];
        crate::input::open_regular(&manifest_path)
            .map_err(|e| e.to_string())?
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("Bundle manifest too large".into());
        }
        let bundle: Bundle = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if bundle.schema != 2 || bundle.kind != "bundled" {
            return Err("Unsupported bundle schema/kind".into());
        }
        if bundle.os != std::env::consts::OS || bundle.arch != std::env::consts::ARCH {
            return Err("Bundle OS/architecture mismatch".into());
        }
        if bundle.files.is_empty() || bundle.files.len() > 10000 {
            return Err("Invalid bundle inventory size".into());
        }
        let mut total = 0u64;
        for (name, resource) in &bundle.files {
            relative(name)?;
            if name == "engines.json"
                || resource.sha256.len() != 64
                || !resource.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err("Invalid bundle inventory entry".into());
            }
            total = total
                .checked_add(resource.bytes)
                .ok_or("Bundle size overflow")?;
        }
        if total > 8 * 1024 * 1024 * 1024 {
            return Err("Bundle exceeds 8 GiB".into());
        }
        let loader = bundle
            .loader
            .as_deref()
            .map(|p| inside(&root, p, false))
            .transpose()?;
        if loader.is_some() && !cfg!(target_os = "linux") {
            return Err("ELF loader only supported on Linux".into());
        }
        let modules = bundle
            .magick_modules
            .as_deref()
            .map(|p| inside(&root, p, true))
            .transpose()?;
        let heif_plugins = bundle
            .heif_plugins
            .as_deref()
            .map(|p| inside(&root, p, true))
            .transpose()?;
        let magick_config = bundle
            .magick_config
            .as_deref()
            .map(|p| inside(&root, p, true))
            .transpose()?;
        let verified = VerifiedBundle {
            root: root.clone(),
            files: bundle.files,
            loader,
            magick_modules: modules,
            magick_config,
            heif_plugins,
            identity: crate::hash_file(&manifest_path)?,
        };
        verified.verify_checked(cancel, deadline)?;
        if bundle.engines.len() != 5 {
            return Err("Bundle must contain exactly five engine entries".into());
        }
        let mut entries = BTreeMap::new();
        for id in ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"] {
            let mut entry = bundle
                .engines
                .get(id)
                .ok_or_else(|| format!("Missing bundled engine: {id}"))?
                .clone();
            let name = entry.path.to_str().ok_or("Non-UTF8 engine path")?;
            if entry.version.trim().is_empty()
                || verified
                    .files
                    .get(name)
                    .is_none_or(|r| r.sha256 != entry.sha256)
            {
                return Err(format!("Invalid engine inventory entry: {id}"));
            }
            entry.path = inside(&root, name, false)?;
            entry.library_dir = entry
                .library_dir
                .map(|p| inside(&root, p.to_str().ok_or("Invalid library path")?, true))
                .transpose()?;
            entry.data_dir = entry
                .data_dir
                .map(|p| inside(&root, p.to_str().ok_or("Invalid data path")?, true))
                .transpose()?;
            entries.insert(id.to_string(), entry);
        }
        Ok(Engines {
            entries,
            development: false,
            unavailable: BTreeMap::new(),
            bundle: Some(verified),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, serde_json::Value) {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("tool"), b"fixture").unwrap();
        let hash = crate::hash_file(&root.path().join("tool")).unwrap();
        let entry = serde_json::json!({"path":"tool", "sha256":hash,"version":"test"});
        let engines: BTreeMap<_, _> = ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]
            .map(|id| (id, entry.clone()))
            .into();
        let value = serde_json::json!({"schema":2,"kind":"bundled","os":std::env::consts::OS,"arch":std::env::consts::ARCH,"engines":engines,"files":{"tool":{"sha256":hash,"bytes":7}},"loader":null,"magick_modules":null});
        (root, value)
    }
    fn load(root: &Path, value: &serde_json::Value) -> Result<Engines, String> {
        fs::write(
            root.join("engines.json"),
            serde_json::to_vec(value).unwrap(),
        )
        .unwrap();
        Engines::load_bundle(root)
    }
    #[test]
    fn bundle_is_relocatable_and_detects_changed_or_extra_files() {
        let (root, value) = fixture();
        let engines = load(root.path(), &value).unwrap();
        assert!(engines.info().iter().all(|e| !e.development && e.available));
        fs::write(root.path().join("tool"), b"changed").unwrap();
        assert!(engines.verify_bundle().is_err());
        fs::write(root.path().join("tool"), b"fixture").unwrap();
        fs::write(root.path().join("extra"), b"extra").unwrap();
        assert!(load(root.path(), &value).is_err());
    }
    #[test]
    fn rejects_wrong_platform_traversal_missing_engine_and_missing_resource() {
        for change in ["platform", "path", "engine", "missing"] {
            let (root, mut value) = fixture();
            match change {
                "platform" => value["arch"] = "wrong".into(),
                "path" => value["engines"]["magick"]["path"] = "../tool".into(),
                "engine" => {
                    value["engines"].as_object_mut().unwrap().remove("pandoc");
                }
                _ => {
                    fs::remove_file(root.path().join("tool")).unwrap();
                }
            }
            assert!(load(root.path(), &value).is_err(), "{change}");
        }
        for path in [
            "/tmp/x", "../x", "a/../x", "a//b", "a\\b", "C:/x", ".", "a/./b", "",
        ] {
            assert!(relative(path).is_err(), "{path}");
        }
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_even_when_bytes_match() {
        let (root, value) = fixture();
        let outside = tempfile::NamedTempFile::new().unwrap();
        fs::write(outside.path(), b"fixture").unwrap();
        fs::remove_file(root.path().join("tool")).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("tool")).unwrap();
        assert!(load(root.path(), &value).is_err());
    }
}
