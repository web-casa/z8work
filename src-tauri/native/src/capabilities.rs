//! Read-only discovery from the verified bundle. Enumerated codecs are not
//! automatically enabled product routes, nor evidence of successful encoding.
use crate::{Cancel, Engines};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

pub fn inspect(engines: &Engines) -> Result<Value, String> {
    engines.verify_bundle()?;
    let work = tempfile::tempdir().map_err(|e| e.to_string())?;
    let cancel = Cancel::default();
    let deadline = Instant::now() + Duration::from_secs(120);
    let mut probes = vec![];
    for (engine, kind, args) in [
        ("magick", "image-formats", vec!["-list", "format"]),
        ("ffmpeg", "decoders", vec!["-hide_banner", "-decoders"]),
        ("ffmpeg", "encoders", vec!["-hide_banner", "-encoders"]),
        ("ffmpeg", "demuxers", vec!["-hide_banner", "-demuxers"]),
        ("ffmpeg", "muxers", vec!["-hide_banner", "-muxers"]),
        ("pandoc", "document-inputs", vec!["--list-input-formats"]),
        ("pandoc", "document-outputs", vec!["--list-output-formats"]),
    ] {
        let result = (|| {
            let mut command = engines.command_checked(engine, &cancel, deadline)?;
            command.args(args).current_dir(work.path()).env_clear();
            for key in ["SystemRoot", "WINDIR"] {
                if let Some(value) = std::env::var_os(key) {
                    command.env(key, value);
                }
            }
            command
                .env("HOME", work.path())
                .env("USERPROFILE", work.path())
                .env("TMPDIR", work.path())
                .env("TEMP", work.path())
                .env("TMP", work.path())
                .env("LANG", "C.UTF-8");
            engines.configure_command(&mut command, engine)?;
            crate::process::run(
                command,
                &cancel,
                deadline.min(Instant::now() + Duration::from_secs(15)),
            )
        })();
        probes.push(match result {
            Ok(raw) if !raw.trim().is_empty() => json!({"engine":engine,"kind":kind,"status":"listed","raw":raw}),
            Ok(_) => json!({"engine":engine,"kind":kind,"status":"unavailable","error":"Empty inventory output"}),
            Err(error) => json!({"engine":engine,"kind":kind,"status":"unavailable","error":error}),
        });
    }
    let routes: Vec<_> = crate::formats::groups()
        .iter()
        .map(|g| json!({"group":g.id,"inputs":g.inputs,"outputs":g.outputs,"engines":g.engines}))
        .collect();
    Ok(
        json!({"schema":1,"scope":"engine-discovery-not-conversion-acceptance","platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"engines":engines.info(),"productRoutes":routes,"probes":probes,"notes":["Enumerated readers/writers/codecs do not authorize additional routes.","Hardware availability, external delegates, rendering fidelity and real conversions require separate tests.","Pandoc PDF output listing does not establish that a PDF typesetting engine is packaged."]}),
    )
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn successful_process_with_empty_inventory_is_not_reported_as_capable() {
        let path = std::path::PathBuf::from("/usr/bin/true");
        let entry = crate::engines::Entry {
            sha256: crate::hash_file(&path).unwrap(),
            path,
            version: "test fixture".into(),
            library_dir: None,
            data_dir: None,
        };
        let engines = Engines {
            entries: [
                ("magick".into(), entry.clone()),
                ("ffmpeg".into(), entry.clone()),
                ("pandoc".into(), entry),
            ]
            .into(),
            development: true,
            unavailable: Default::default(),
            bundle: None,
        };
        let report = inspect(&engines).unwrap();
        assert_eq!(report["probes"].as_array().unwrap().len(), 7);
        assert!(report["probes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["status"] == "unavailable" && p["error"] == "Empty inventory output"));
        assert!(crate::output_formats("tiff").is_empty());
    }
}
