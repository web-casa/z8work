//! One bounded native inbox. Paths originate only from OS pickers/drop events.
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex, OnceLock},
    time::{Duration, Instant},
};
use z8_native::{
    queue::{Queue, Snapshot},
    startup::Runtime,
};
pub struct Services {
    pub workspace: Result<Arc<z8_native::workspaces::Store>, String>,
    pub queue: Result<Arc<Queue>, String>,
}
struct Batch {
    paths: Vec<PathBuf>,
    restore: Option<String>,
}
struct Inbox {
    batches: VecDeque<Batch>,
    count: usize,
    active: bool,
    closing: bool,
    stopped: bool,
    failure: Option<z8_native::failure::Failure>,
}
struct StopGuard(Arc<Boot>);
impl Drop for StopGuard {
    fn drop(&mut self) {
        let mut s = self.0.inbox.lock().unwrap();
        if !s.closing {
            s.failure = Some(z8_native::failure::Failure::History);
        }
        s.stopped = true;
        drop(s);
        self.0.changed.notify_all();
    }
}
pub struct Boot {
    pub services: OnceLock<Services>,
    inbox: Mutex<Inbox>,
    changed: Condvar,
}
impl Boot {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            services: OnceLock::new(),
            inbox: Mutex::new(Inbox {
                batches: VecDeque::new(),
                count: 0,
                active: false,
                closing: false,
                stopped: false,
                failure: None,
            }),
            changed: Condvar::new(),
        })
    }
    pub fn queue(&self) -> Result<Arc<Queue>, String> {
        if let Some(services) = self.services.get() {
            return services.queue.clone();
        }
        if self.inbox.lock().unwrap().stopped {
            Err("Z8:history".into())
        } else {
            Err("Z8:preparing".into())
        }
    }
    pub fn pending(&self) -> usize {
        self.inbox.lock().unwrap().count
    }
    pub fn failure(&self) -> Option<z8_native::failure::Failure> {
        self.inbox.lock().unwrap().failure
    }
    pub fn enqueue(&self, paths: Vec<PathBuf>, restore: Option<String>) -> Result<(), String> {
        let mut s = self.inbox.lock().unwrap();
        if s.closing || s.stopped {
            return Err("Z8:closing".into());
        }
        if paths.len() > 100
            || s.count + paths.len() > 100
            || (restore.is_some() && paths.len() != 1)
        {
            s.failure = Some(z8_native::failure::Failure::ImportLimit);
            return Err("Z8:import_limit".into());
        }
        if paths.is_empty() {
            return Ok(());
        }
        s.count += paths.len();
        s.batches.push_back(Batch { paths, restore });
        s.failure = None;
        drop(s);
        self.changed.notify_all();
        Ok(())
    }
    pub fn wait_snapshot(&self) -> Result<Snapshot, String> {
        let deadline = Instant::now() + Duration::from_secs(120);
        let mut s = self.inbox.lock().unwrap();
        while !s.closing && !s.stopped && (self.services.get().is_none() || s.count > 0) {
            if Instant::now() >= deadline {
                return Err("Z8:preparing".into());
            }
            s = self
                .changed
                .wait_timeout(s, Duration::from_millis(100))
                .unwrap()
                .0;
        }
        if s.closing {
            return Err("Z8:closing".into());
        }
        drop(s);
        self.queue()?.snapshot()
    }
    pub fn start(
        self: &Arc<Self>,
        data: Result<PathBuf, String>,
        cache: Result<PathBuf, String>,
        engines: Arc<Runtime>,
        notify: Arc<dyn Fn() + Send + Sync>,
        queue_notify: Arc<dyn Fn(z8_native::queue::Change) + Send + Sync>,
    ) {
        let this = self.clone();
        let result = std::thread::Builder::new()
            .name("desktop-bootstrap".into())
            .spawn(move || {
                let _stop = StopGuard(this.clone());
                let workspace = cache
                    .and_then(|p| z8_native::workspaces::Store::open(p.join("native-work-v1")));
                let work = workspace.clone();
                let runtime = engines.clone();
                let queue = data.and_then(|p| {
                    Queue::open(
                        p.join("queue-v1.json"),
                        Arc::new(move |mut source, output, format, cancel| {
                            let ext = source
                                .name
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("");
                            let engines = runtime.require(ext)?;
                            source.context.workspace =
                                Some(work.as_ref().map_err(Clone::clone)?.clone());
                            z8_native::convert_source(&engines, source, output, format, cancel)
                        }),
                        queue_notify,
                    )
                    .map(Arc::new)
                });
                let _ = this.services.set(Services { workspace, queue });
                this.changed.notify_all();
                notify();
                loop {
                    let mut s = this.inbox.lock().unwrap();
                    while !s.closing && s.batches.is_empty() {
                        s = this.changed.wait(s).unwrap();
                    }
                    if s.closing {
                        s.batches.clear();
                        s.count = 0;
                        break;
                    }
                    let batch = s.batches.pop_front().unwrap();
                    s.active = true;
                    drop(s);
                    let result = this.queue().and_then(|q| {
                        if let Some(id) = batch.restore {
                            q.register(batch.paths.clone(), Some(&id))
                        } else {
                            q.import_files(batch.paths.clone())
                        }
                    });
                    let mut s = this.inbox.lock().unwrap();
                    s.count -= batch.paths.len();
                    s.active = false;
                    if let Err(e) = result {
                        s.failure = Some(z8_native::failure::Failure::classify(&e));
                    }
                    drop(s);
                    this.changed.notify_all();
                    notify();
                }
                if let Ok(q) = this.queue() {
                    q.shutdown();
                }
                let mut s = this.inbox.lock().unwrap();
                s.stopped = true;
                drop(s);
                this.changed.notify_all();
            });
        if result.is_err() {
            let mut s = self.inbox.lock().unwrap();
            s.stopped = true;
            s.failure = Some(z8_native::failure::Failure::History);
            self.changed.notify_all();
        }
    }
    pub fn close(&self) {
        let mut s = self.inbox.lock().unwrap();
        s.closing = true;
        drop(s);
        self.changed.notify_all();
    }
    pub fn shutdown(&self) {
        let mut s = self.inbox.lock().unwrap();
        s.closing = true;
        self.changed.notify_all();
        while !s.stopped {
            s = self.changed.wait(s).unwrap();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn early_inbox_is_bounded_and_closed_inbox_rejects_imports() {
        let b = Boot::new();
        b.enqueue(vec![PathBuf::from("not-opened-yet"); 100], None)
            .unwrap();
        assert_eq!(b.pending(), 100);
        assert!(b.queue().is_err());
        assert_eq!(
            b.enqueue(vec!["extra".into()], None).unwrap_err(),
            "Z8:import_limit"
        );
        assert_eq!(b.pending(), 100);
        b.close();
        assert_eq!(
            b.enqueue(vec!["later".into()], None).unwrap_err(),
            "Z8:closing"
        );
    }
    #[test]
    fn startup_imports_are_processed_once_and_never_autoconvert() {
        let root = std::env::temp_dir().join(format!(
            "z8-boot-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let input = root.join("early.png");
        std::fs::write(&input, b"synthetic input").unwrap();
        let b = Boot::new();
        b.enqueue(vec![input], None).unwrap();
        b.start(
            Ok(root.join("data")),
            Ok(root.join("cache")),
            Runtime::new(false, Arc::new(|| {})),
            Arc::new(|| {}),
            Arc::new(|_| {}),
        );
        let first = b.wait_snapshot().unwrap();
        assert_eq!(first.tasks.len(), 1);
        assert_eq!(first.tasks[0].attempt, 0);
        assert!(first.tasks[0].authorized);
        assert!(!first.processing);
        assert_eq!(b.wait_snapshot().unwrap().tasks[0].id, first.tasks[0].id);
        assert_eq!(b.pending(), 0);
        b.shutdown();
        assert!(b.enqueue(vec![root.join("late.png")], None).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
