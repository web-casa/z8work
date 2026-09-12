//! Background readiness; no engine probing or filesystem work under the status lock.
use crate::{Cancel, EngineInfo, Engines};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
pub const IDS: [&str; 5] = ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"];
#[derive(Clone)]
pub enum Source {
    Development(PathBuf),
    Bundle(PathBuf),
    Disabled,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Preparing,
    Ready,
    Failed,
}
#[derive(Clone, Serialize)]
pub struct Status {
    pub id: String,
    pub phase: Phase,
    pub failure: Option<crate::failure::Failure>,
}
struct State {
    engines: Engines,
    phases: BTreeMap<String, Phase>,
    active: bool,
    closing: bool,
}
pub struct Runtime {
    state: Mutex<State>,
    changed: Condvar,
    cancel: Cancel,
    notify: Arc<dyn Fn() + Send + Sync>,
}
type Loader = dyn Fn(&str, &Cancel, Instant) -> Result<Engines, String> + Send + Sync;
impl Runtime {
    pub fn new(development: bool, notify: Arc<dyn Fn() + Send + Sync>) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State {
                engines: Engines {
                    entries: BTreeMap::new(),
                    development,
                    unavailable: BTreeMap::new(),
                    bundle: None,
                },
                phases: IDS
                    .into_iter()
                    .map(|id| (id.into(), Phase::Preparing))
                    .collect(),
                active: false,
                closing: false,
            }),
            changed: Condvar::new(),
            cancel: Cancel::default(),
            notify,
        })
    }
    pub fn start(self: &Arc<Self>, source: Source) {
        let this = self.clone();
        {
            let mut s = self.state.lock().unwrap();
            if s.active || s.closing {
                return;
            }
            s.active = true;
        }
        let result = std::thread::Builder::new()
            .name("engine-startup".into())
            .spawn(move || {
                let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let loader: Arc<Loader> = match source {
                        Source::Development(path) => Arc::new(move |id, cancel, deadline| {
                            Engines::load_selected(&path, true, Some(id), cancel, deadline)
                        }),
                        Source::Bundle(path) => {
                            let bundle = Engines::load_bundle_checked(
                                &path,
                                &this.cancel,
                                Instant::now() + Duration::from_secs(120),
                            )?;
                            Arc::new(move |_, cancel, deadline| {
                                cancel.check(deadline)?;
                                Ok(bundle.clone())
                            })
                        }
                        Source::Disabled => return Err("Z8:engine_unavailable".to_string()),
                    };
                    this.workers(loader);
                    Ok(())
                }));
                let mut state = this.state.lock().unwrap();
                if !matches!(run, Ok(Ok(()))) {
                    for p in state.phases.values_mut() {
                        if *p == Phase::Preparing {
                            *p = Phase::Failed;
                        }
                    }
                }
                state.active = false;
                drop(state);
                this.changed.notify_all();
                (this.notify)();
            });
        if result.is_err() {
            let mut s = self.state.lock().unwrap();
            s.active = false;
            for p in s.phases.values_mut() {
                *p = Phase::Failed;
            }
            drop(s);
            (self.notify)();
        }
    }
    fn workers(&self, loader: Arc<Loader>) {
        std::thread::scope(|scope| {
            for id in IDS {
                let loader = loader.clone();
                scope.spawn(move || {
                    let deadline = Instant::now() + Duration::from_secs(30);
                    let result = (|| {
                        let engines = loader(id, &self.cancel, deadline)?;
                        let mut command = engines.command_checked(id, &self.cancel, deadline)?;
                        command.arg(match id {
                            "magick" => "-version",
                            "mutool" => "-v",
                            "pandoc" => "--version",
                            _ => "-version",
                        });
                        command.env_clear();
                        for key in ["SystemRoot", "WINDIR"] {
                            if let Some(value) = std::env::var_os(key) {
                                command.env(key, value);
                            }
                        }
                        engines.configure_command(&mut command, id)?;
                        crate::process::run(
                            command,
                            &self.cancel,
                            deadline.min(Instant::now() + Duration::from_secs(10)),
                        )?;
                        Ok::<_, String>(engines)
                    })();
                    self.finish(id, result);
                });
            }
        });
    }
    fn finish(&self, id: &str, result: Result<Engines, String>) {
        let mut state = self.state.lock().unwrap();
        if state.closing {
            return;
        }
        match result {
            Ok(engine) => {
                if let Some(entry) = engine.entries.get(id) {
                    state.engines.entries.insert(id.into(), entry.clone());
                    state.engines.bundle = engine.bundle;
                    state.phases.insert(id.into(), Phase::Ready);
                } else {
                    state.phases.insert(id.into(), Phase::Failed);
                }
            }
            Err(_) => {
                state.phases.insert(id.into(), Phase::Failed);
            }
        }
        drop(state);
        (self.notify)();
    }
    pub fn status(&self) -> Vec<Status> {
        self.state
            .lock()
            .unwrap()
            .phases
            .iter()
            .map(|(id, p)| Status {
                id: id.clone(),
                phase: *p,
                failure: (*p == Phase::Failed)
                    .then_some(crate::failure::Failure::EngineUnavailable),
            })
            .collect()
    }
    pub fn info(&self) -> Vec<EngineInfo> {
        self.state.lock().unwrap().engines.info()
    }
    pub fn engines(&self) -> Engines {
        self.state.lock().unwrap().engines.clone()
    }
    pub fn require(&self, extension: &str) -> Result<Engines, String> {
        let state = self.state.lock().unwrap();
        if state.closing {
            return Err("Z8:closing".into());
        }
        let required = required(extension);
        if required
            .iter()
            .any(|id| state.phases.get(*id) == Some(&Phase::Failed))
        {
            return Err("Z8:engine_unavailable".into());
        }
        if required
            .iter()
            .any(|id| state.phases.get(*id) != Some(&Phase::Ready))
        {
            return Err("Z8:preparing".into());
        }
        Ok(state.engines.clone())
    }
    pub fn shutdown(&self) {
        self.cancel.cancel();
        let mut s = self.state.lock().unwrap();
        s.closing = true;
        while s.active {
            s = self.changed.wait(s).unwrap();
        }
    }
}
pub fn required(extension: &str) -> &'static [&'static str] {
    match extension.to_ascii_lowercase().as_str() {
        "pdf" => &["magick", "mutool"],
        "md" | "docx" => &["pandoc"],
        "png" | "jpg" | "jpeg" | "webp" | "avif" | "heic" | "heif" => &["magick"],
        _ => &["ffmpeg", "ffprobe"],
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn blocked_probe_does_not_block_status_other_formats_or_cancellation() {
        use std::os::unix::fs::PermissionsExt;
        // /bin/true is not present on every Unix host (notably macOS).
        // Use an owned executable fixture instead of a host utility path.
        let fixtures = tempfile::tempdir().unwrap();
        let probe = fixtures.path().join("probe");
        std::fs::write(&probe, "#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&probe, std::fs::Permissions::from_mode(0o700)).unwrap();
        let runtime = Runtime::new(true, Arc::new(|| {}));
        let worker = runtime.clone();
        let thread = std::thread::spawn(move || {
            worker.workers(Arc::new(move |id, cancel, deadline| {
                if id == "magick" {
                    loop {
                        cancel.check(deadline)?;
                        std::thread::sleep(Duration::from_millis(10));
                    }
                }
                if id == "pandoc" {
                    return Err("broken".into());
                }
                let path = probe.clone();
                let entry = crate::engines::Entry {
                    sha256: crate::hash_file(&path)?,
                    path,
                    version: "fixture".into(),
                    library_dir: None,
                    data_dir: None,
                };
                Ok(Engines {
                    entries: [(id.into(), entry)].into(),
                    development: true,
                    unavailable: BTreeMap::new(),
                    bundle: None,
                })
            }))
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while (runtime.require("mp3").is_err()
            || runtime.require("md").err().as_deref() != Some("Z8:engine_unavailable"))
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(runtime.require("mp3").is_ok());
        assert_eq!(runtime.require("png").err().unwrap(), "Z8:preparing");
        assert_eq!(
            runtime.require("md").err().unwrap(),
            "Z8:engine_unavailable"
        );
        let now = Instant::now();
        assert_eq!(runtime.status().len(), 5);
        assert!(now.elapsed() < Duration::from_millis(100));
        runtime.shutdown();
        thread.join().unwrap();
        assert_eq!(runtime.require("mp3").err().unwrap(), "Z8:closing");
    }
}
