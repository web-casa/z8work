use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema: u8,
    kind: String,
    engines: BTreeMap<String, Entry>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Entry {
    pub(crate) path: PathBuf,
    pub(crate) sha256: String,
    pub(crate) version: String,
    #[serde(default)]
    pub(crate) library_dir: Option<PathBuf>,
    #[serde(default)]
    pub(crate) data_dir: Option<PathBuf>,
}
#[derive(Clone)]
pub struct Engines {
    pub(crate) entries: BTreeMap<String, Entry>,
    pub(crate) development: bool,
    pub(crate) unavailable: BTreeMap<String, String>,
    pub(crate) bundle: Option<crate::engine_bundle::VerifiedBundle>,
}
#[derive(Serialize)]
pub struct EngineInfo {
    pub id: String,
    pub version: String,
    pub development: bool,
    pub available: bool,
    pub error: Option<String>,
}
pub fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = crate::input::open_regular(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
impl Engines {
    pub fn load(path: &Path) -> Result<Self, String> {
        Self::load_mode(path, true)
    }
    pub fn load_available(path: &Path) -> Result<Self, String> {
        Self::load_mode(path, false)
    }
    fn load_mode(path: &Path, strict: bool) -> Result<Self, String> {
        let content = fs::read(path).map_err(|e| format!("Engine manifest unavailable: {e}"))?;
        if content.len() > 64 * 1024 {
            return Err("Engine manifest too large".into());
        }
        let manifest: Manifest = serde_json::from_slice(&content).map_err(|e| e.to_string())?;
        if manifest.schema != 1 {
            return Err("Unsupported engine manifest schema".into());
        }
        let development = manifest.kind == "development";
        // No production engine distribution has passed M0 package validation yet.
        // Fail closed instead of treating host binaries as a releasable engine bundle.
        if !development || !cfg!(feature = "development-engines") {
            return Err("M0 requires the explicit development-engines feature; production bundles are not ready".into());
        }
        let mut unavailable = BTreeMap::new();
        for id in ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"] {
            let validation = (|| {
                let entry = manifest
                    .engines
                    .get(id)
                    .ok_or_else(|| format!("Missing engine: {id}"))?;
                if !entry.path.is_absolute()
                    || !entry.path.is_file()
                    || entry.version.trim().is_empty()
                {
                    return Err(format!("Invalid engine: {id}"));
                }
                if let Some(dir) = &entry.library_dir {
                    if !dir.is_absolute() || !dir.is_dir() {
                        return Err(format!("Invalid library directory: {id}"));
                    }
                }
                if let Some(dir) = &entry.data_dir {
                    if !dir.is_absolute() || !dir.is_dir() {
                        return Err(format!("Invalid data directory: {id}"));
                    }
                }
                if hash_file(&entry.path)? != entry.sha256 {
                    return Err(format!("Engine hash mismatch: {id}"));
                }
                Ok::<_, String>(())
            })();
            if let Err(error) = validation {
                if strict {
                    return Err(error);
                }
                unavailable.insert(id.to_string(), error);
            }
        }
        Ok(Self {
            entries: manifest
                .engines
                .into_iter()
                .filter(|(id, _)| {
                    ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"].contains(&id.as_str())
                        && !unavailable.contains_key(id)
                })
                .collect(),
            unavailable,
            development,
            bundle: None,
        })
    }
    pub fn info(&self) -> Vec<EngineInfo> {
        ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]
            .iter()
            .map(|id| EngineInfo {
                id: id.to_string(),
                version: self
                    .entries
                    .get(*id)
                    .map(|e| e.version.clone())
                    .unwrap_or_default(),
                development: self.development,
                available: self.entries.contains_key(*id),
                error: self.unavailable.get(*id).cloned(),
            })
            .collect()
    }
    pub fn formats_for(&self, extension: &str) -> Vec<crate::OutputFormat> {
        let formats = crate::output_formats(extension);
        let required: &[&str] = match extension.to_ascii_lowercase().as_str() {
            "pdf" => &["mutool", "magick"],
            "md" | "docx" => &["pandoc"],
            "png" | "jpg" | "jpeg" | "webp" | "avif" | "heic" | "heif" => &["magick"],
            _ => &["ffmpeg", "ffprobe"],
        };
        if required.iter().all(|id| self.entries.contains_key(*id)) {
            formats
        } else {
            vec![]
        }
    }
    pub(crate) fn identity(&self) -> String {
        if let Some(bundle) = &self.bundle {
            return bundle.identity.clone();
        }
        self.entries
            .iter()
            .map(|(id, e)| format!("{id}:{}:{}", e.sha256, e.version))
            .collect::<Vec<_>>()
            .join(";")
    }
    pub fn verify_bundle(&self) -> Result<(), String> {
        if let Some(bundle) = &self.bundle {
            bundle.verify()?;
        }
        Ok(())
    }
    pub(crate) fn command(&self, id: &str) -> Result<std::process::Command, String> {
        let (path, library) = self.executable(id)?;
        let mut cmd = if let Some(loader) = self.bundle.as_ref().and_then(|b| b.loader.as_ref()) {
            let mut cmd = std::process::Command::new(loader);
            cmd.arg("--inhibit-cache");
            if let Some(dir) = &library {
                cmd.arg("--library-path").arg(dir);
            }
            cmd.arg(path);
            cmd
        } else {
            std::process::Command::new(path)
        };
        self.configure_command(&mut cmd, id)?;
        Ok(cmd)
    }
    pub(crate) fn configure_command(
        &self,
        cmd: &mut std::process::Command,
        id: &str,
    ) -> Result<(), String> {
        if let Some(dir) = self.entries.get(id).and_then(|e| e.library_dir.as_ref()) {
            cmd.env("LD_LIBRARY_PATH", dir);
        }
        if id == "magick" {
            if let Some(dir) = self.bundle.as_ref().and_then(|b| b.magick_config.as_ref()) {
                let mut paths: Vec<PathBuf> = cmd
                    .get_envs()
                    .find(|(key, _)| *key == "MAGICK_CONFIGURE_PATH")
                    .and_then(|(_, value)| value)
                    .map(std::env::split_paths)
                    .into_iter()
                    .flatten()
                    .collect();
                if !paths.contains(dir) {
                    paths.push(dir.clone());
                }
                cmd.env(
                    "MAGICK_CONFIGURE_PATH",
                    std::env::join_paths(paths).map_err(|e| e.to_string())?,
                );
            }
            if let Some(dir) = self.bundle.as_ref().and_then(|b| b.heif_plugins.as_ref()) {
                cmd.env("LIBHEIF_PLUGIN_PATH", dir);
            }
            if let Some(dir) = self.bundle.as_ref().and_then(|b| b.magick_modules.as_ref()) {
                cmd.env("MAGICK_CODER_MODULE_PATH", dir);
            }
        }
        Ok(())
    }
    pub(crate) fn data_dir(&self, id: &str) -> Option<&Path> {
        self.entries.get(id)?.data_dir.as_deref()
    }
    pub(crate) fn executable(&self, id: &str) -> Result<(PathBuf, Option<PathBuf>), String> {
        let entry = self
            .entries
            .get(id)
            .ok_or_else(|| format!("Unknown engine: {id}"))?;
        // Detect binary replacement between startup and a later job.
        if hash_file(&entry.path)? != entry.sha256 {
            return Err(format!("Engine hash mismatch: {id}"));
        }
        Ok((entry.path.clone(), entry.library_dir.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn v1_scope_matches_routes_and_each_required_engine() {
        let scope: serde_json::Value =
            serde_json::from_str(include_str!("../../../packaging/desktop/v1-scope.json")).unwrap();
        let mut seen = std::collections::BTreeSet::new();
        for group in scope["groups"].as_array().unwrap() {
            let required: Vec<&str> = group["engines"]
                .as_array()
                .unwrap()
                .iter()
                .map(|id| id.as_str().unwrap())
                .collect();
            let mut engines = Engines {
                entries: required
                    .iter()
                    .map(|id| {
                        (
                            id.to_string(),
                            Entry {
                                path: PathBuf::new(),
                                sha256: String::new(),
                                version: String::new(),
                                library_dir: None,
                                data_dir: None,
                            },
                        )
                    })
                    .collect(),
                development: false,
                unavailable: BTreeMap::new(),
                bundle: None,
            };
            for input in group["inputs"].as_array().unwrap() {
                let input = input.as_str().unwrap();
                assert!(seen.insert(input), "duplicate scope input: {input}");
                for extension in [input.to_string(), input.to_ascii_uppercase()] {
                    assert_eq!(
                        serde_json::to_value(crate::output_formats(&extension)).unwrap(),
                        group["outputs"]
                    );
                    assert_eq!(
                        serde_json::to_value(engines.formats_for(&extension)).unwrap(),
                        group["outputs"]
                    );
                    for id in &required {
                        let entry = engines.entries.remove(*id).unwrap();
                        assert!(
                            engines.formats_for(&extension).is_empty(),
                            "{input} without {id}"
                        );
                        engines.entries.insert(id.to_string(), entry);
                    }
                }
            }
        }
        for unsupported in ["xlsx", "xls", "exe", "svg", "tiff", "", ".png"] {
            assert!(crate::output_formats(unsupported).is_empty());
        }
    }
    fn rejected(kind: &str, schema: u8) -> String {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("engines.json");
        fs::write(
            &path,
            serde_json::json!({"kind":kind,"schema":schema,"engines":{}}).to_string(),
        )
        .unwrap();
        Engines::load(&path)
            .err()
            .expect("manifest should be rejected")
    }
    #[test]
    fn unverified_production_bundle_is_rejected() {
        assert!(rejected("bundled", 1).contains("production bundles are not ready"));
    }
    #[test]
    fn incompatible_schema_is_rejected() {
        assert!(rejected("development", 2).contains("schema"));
    }
    #[cfg(not(feature = "development-engines"))]
    #[test]
    fn development_manifest_cannot_enable_compiled_out_support() {
        assert!(rejected("development", 1).contains("development-engines feature"));
    }
}
