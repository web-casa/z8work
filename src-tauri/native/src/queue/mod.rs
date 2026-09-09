mod imports;
mod model;
mod store;
use crate::{output_formats, Cancel, ConversionResult, OutputFormat};
pub use model::{Change, ImportReport, Phase, Snapshot, Source, Submission, SubmissionItem, Task};
use model::{Journal, Registered, Stamp};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Condvar, Mutex, MutexGuard},
    thread,
};

type Executor =
    dyn Fn(Source, &Path, OutputFormat, &Cancel) -> Result<ConversionResult, String> + Send + Sync;
type Notify = dyn Fn(Change) + Send + Sync;
type Formats = dyn Fn(&str) -> Vec<OutputFormat> + Send + Sync;
struct State {
    journal: Journal,
    inputs: BTreeMap<String, Registered>,
    output: Option<Registered>,
    running: Option<(String, Cancel)>,
    preview: Option<(String, Cancel)>,
    clearing: bool,
    closing: bool,
    persistence_error: Option<String>,
    recovery_notice: Option<String>,
    import_report: Option<ImportReport>,
}
struct Shared {
    state: Mutex<State>,
    changed: Condvar,
    path: PathBuf,
    notify: Arc<Notify>,
    formats: Arc<Formats>,
}
pub struct Queue {
    shared: Arc<Shared>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    _file_lock: fs::File,
}
// Own the preview reservation until native work and its temporary files are
// gone. Removal and shutdown wait for this guard just like the queue worker.
struct PreviewGuard(Arc<Shared>);
impl Drop for PreviewGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = locked(&self.0) {
            state.preview = None;
            state.journal.revision = state.journal.revision.saturating_add(1);
        }
        notify(&self.0);
    }
}
fn locked(shared: &Shared) -> Result<MutexGuard<'_, State>, String> {
    shared
        .state
        .lock()
        .map_err(|_| "Queue state unavailable; restart the application".into())
}
fn snapshot(state: &State) -> Snapshot {
    Snapshot {
        schema: 2,
        epoch: state.journal.epoch.clone(),
        revision: state.journal.revision,
        tasks: state.journal.tasks.clone(),
        output: state.journal.output_hint.clone(),
        output_authorized: state.output.is_some(),
        processing: state.preview.is_some()
            || state.running.is_some()
            || state.journal.tasks.iter().any(|t| t.phase == Phase::Queued),
        clearing: state.clearing,
        closing: state.closing,
        persistence_error: state.persistence_error.clone(),
        recovery_notice: state.recovery_notice.clone(),
        import_report: state.import_report.clone(),
    }
}
fn available(state: &State) -> Result<(), String> {
    if state.closing {
        Err("Queue is closing".into())
    } else if state.clearing {
        Err("Queue is clearing".into())
    } else if let Some(error) = &state.persistence_error {
        Err(format!("Queue history is not saved: {error}"))
    } else {
        Ok(())
    }
}
fn idle(state: &State) -> Result<(), String> {
    available(state)?;
    if state.preview.is_some()
        || state.running.is_some()
        || state.journal.tasks.iter().any(|t| t.phase == Phase::Queued)
    {
        Err("Queue is already processing".into())
    } else {
        Ok(())
    }
}
// Called with the mutex held. Persist before acknowledging user mutations.
fn commit(shared: &Shared, state: &mut State, mut next: Journal) -> Result<(), String> {
    next.revision = state
        .journal
        .revision
        .checked_add(1)
        .ok_or("Queue revision exhausted")?;
    store::save(&shared.path, &next)?;
    state.journal = next;
    Ok(())
}
fn notify(shared: &Shared) {
    if let Ok(state) = locked(shared) {
        let change = Change {
            epoch: state.journal.epoch.clone(),
            revision: state.journal.revision,
        };
        drop(state);
        // Event delivery is best effort; snapshots remain authoritative.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| (shared.notify)(change)));
    }
    shared.changed.notify_all();
}
impl Queue {
    pub fn open(
        path: PathBuf,
        execute: Arc<Executor>,
        on_change: Arc<Notify>,
    ) -> Result<Self, String> {
        Self::open_with_formats(path, execute, on_change, Arc::new(output_formats))
    }
    pub fn open_with_formats(
        path: PathBuf,
        execute: Arc<Executor>,
        on_change: Arc<Notify>,
        formats: Arc<Formats>,
    ) -> Result<Self, String> {
        fs::create_dir_all(path.parent().ok_or("Queue directory unavailable")?)
            .map_err(|e| e.to_string())?;
        let file_lock = fs::File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.with_extension("lock"))
            .map_err(|e| e.to_string())?;
        file_lock
            .try_lock()
            .map_err(|e| format!("Queue history is already in use or cannot be locked: {e}"))?;
        let journal = store::load(&path)?;
        let recovery_notice = if journal.tasks.is_empty() {
            None
        } else {
            Some("History restored. Choose input files and an output folder again before retrying. Interrupted tasks are never resumed automatically.".into())
        };
        store::save(&path, &journal)?;
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                journal,
                inputs: BTreeMap::new(),
                output: None,
                running: None,
                preview: None,
                clearing: false,
                closing: false,
                persistence_error: None,
                recovery_notice,
                import_report: None,
            }),
            changed: Condvar::new(),
            path,
            notify: on_change,
            formats,
        });
        let worker_shared = shared.clone();
        let worker = thread::Builder::new()
            .name("z8-conversion-queue".into())
            .spawn(move || work(worker_shared, execute))
            .map_err(|e| e.to_string())?;
        Ok(Self {
            shared,
            worker: Mutex::new(Some(worker)),
            _file_lock: file_lock,
        })
    }
    pub fn snapshot(&self) -> Result<Snapshot, String> {
        Ok(snapshot(&*locked(&self.shared)?))
    }
    pub fn preview(&self, id: &str, engines: &crate::Engines) -> Result<Vec<u8>, String> {
        self.with_preview(id, |source, cancel| {
            crate::convert::preview(engines, source, cancel)
        })
    }
    pub fn preview_with_workspace(
        &self,
        id: &str,
        engines: &crate::Engines,
        workspace: Arc<crate::workspaces::Store>,
    ) -> Result<Vec<u8>, String> {
        self.with_preview(id, |mut source, cancel| {
            source.context.workspace = Some(workspace);
            crate::convert::preview(engines, source, cancel)
        })
    }
    fn with_preview<T>(
        &self,
        id: &str,
        render: impl FnOnce(Source, &Cancel) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut state = locked(&self.shared)?;
        idle(&state)?;
        let registered = state
            .inputs
            .get(id)
            .cloned()
            .ok_or("Choose the input file again before previewing")?;
        let cancel = Cancel::default();
        state.preview = Some((id.into(), cancel.clone()));
        state.journal.revision = state.journal.revision.saturating_add(1);
        let guard = PreviewGuard(self.shared.clone());
        drop(state);
        notify(&self.shared);
        let source = self.preview_source(id, registered.clone())?;
        let result = render(source, &cancel)?;
        // Recheck the original registration before returning a preview. It is
        // never a replacement input and grants no output-directory permission.
        self.preview_source(id, registered)?;
        cancel.check_cancelled()?;
        drop(guard);
        Ok(result)
    }
    fn preview_source(&self, id: &str, registered: Registered) -> Result<Source, String> {
        prepare_input(Some(registered)).inspect_err(|_| {
            if let Ok(mut state) = locked(&self.shared) {
                state.inputs.remove(id);
                if let Some(task) = state.journal.tasks.iter_mut().find(|t| t.id == id) {
                    task.authorized = false;
                }
            }
            // PreviewGuard publishes the updated authorization on every exit.
        })
    }
    pub fn suggested_output(&self) -> Option<PathBuf> {
        let state = locked(&self.shared).ok()?;
        state.output.as_ref().map(|r| r.path.clone()).or_else(|| {
            state
                .inputs
                .values()
                .next()?
                .path
                .parent()
                .map(Path::to_path_buf)
        })
    }
    pub fn result_path(&self, id: &str, page: u32) -> Result<PathBuf, String> {
        let state = locked(&self.shared)?;
        let directory = state
            .output
            .as_ref()
            .ok_or("Choose the output folder again before revealing results")?
            .clone();
        let file = state
            .journal
            .tasks
            .iter()
            .find(|t| t.id == id)
            .and_then(|t| t.result.as_ref())
            .and_then(|r| r.files.iter().find(|f| f.page == page))
            .ok_or("Unknown saved output")?
            .clone();
        drop(state);
        let path = PathBuf::from(&file.path);
        if path.parent() != Some(directory.path.as_path())
            || Stamp::directory(&directory.path.metadata().map_err(|e| e.to_string())?)
                != directory.stamp
            || path.canonicalize().map_err(|e| e.to_string())? != path
            || crate::hash_file(&path)? != file.sha256
        {
            return Err("Saved output changed or is outside the selected folder".into());
        }
        Ok(path)
    }
    pub fn can_pick(&self) -> Result<(), String> {
        idle(&*locked(&self.shared)?)
    }
    /// User-initiated multi-file import. Invalid entries do not discard valid peers.
    pub fn import_files(&self, paths: Vec<PathBuf>) -> Result<Snapshot, String> {
        self.register_impl(paths, None, true)
    }
    pub fn dismiss_import_report(&self, id: &str) -> Result<Snapshot, String> {
        let mut state = locked(&self.shared)?;
        if state.import_report.as_ref().is_some_and(|r| r.id == id) {
            let revision = state
                .journal
                .revision
                .checked_add(1)
                .ok_or("Queue revision exhausted")?;
            state.import_report = None;
            state.journal.revision = revision;
        }
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn register(&self, paths: Vec<PathBuf>, replace: Option<&str>) -> Result<Snapshot, String> {
        self.register_impl(paths, replace, false)
    }
    fn register_impl(
        &self,
        paths: Vec<PathBuf>,
        replace: Option<&str>,
        partial: bool,
    ) -> Result<Snapshot, String> {
        if paths.is_empty() {
            return self.snapshot();
        }
        if paths.len() > 100 || (replace.is_some() && paths.len() != 1) {
            return Err("Select at most 100 files (one file when restoring a task)".into());
        }
        self.can_pick()?;
        let mut pending = vec![];
        let mut issues = vec![];
        for path in paths {
            match imports::prepare(&self.shared, path.clone()) {
                Ok(input) => pending.push(input),
                Err((reason, message)) => {
                    if !partial {
                        return Err(message);
                    }
                    issues.push(imports::issue(&path, reason));
                }
            }
        }
        let mut state = locked(&self.shared)?;
        idle(&state)?;
        if replace.is_none() && state.journal.tasks.len() + pending.len() > 100 {
            if !partial {
                return Err("Queue limit is 100 files".into());
            }
            for (path, ..) in pending.split_off(100 - state.journal.tasks.len()) {
                issues.push(imports::issue(&path, model::ImportReason::QueueFull));
            }
        }
        let accepted = pending.len() as u32;
        let mut next = state.journal.clone();
        let mut registrations = vec![];
        for (path, stamp, bytes, formats) in pending {
            let default = if formats.contains(&OutputFormat::Webp) {
                OutputFormat::Webp
            } else {
                formats[0]
            };
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let id = if let Some(id) = replace {
                let task = next
                    .tasks
                    .iter_mut()
                    .find(|t| t.id == id)
                    .ok_or("Unknown task")?;
                task.name = name;
                task.bytes = bytes;
                task.formats = formats;
                if !task.formats.contains(&task.format) {
                    task.format = default;
                }
                task.phase = Phase::Ready;
                task.authorized = true;
                task.error = None;
                id.to_string()
            } else {
                let id = uuid::Uuid::new_v4().to_string();
                next.tasks.push(Task {
                    id: id.clone(),
                    name,
                    bytes,
                    formats,
                    format: default,
                    phase: Phase::Ready,
                    attempt: 0,
                    authorized: true,
                    result: None,
                    error: None,
                    options: crate::Options::default(),
                });
                id
            };
            registrations.push((id, Registered { path, stamp }));
        }
        commit(&self.shared, &mut state, next)?;
        state.inputs.extend(registrations);
        if partial {
            state.import_report = Some(ImportReport {
                id: uuid::Uuid::new_v4().to_string(),
                accepted,
                issues,
            });
        }
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn set_output(&self, path: PathBuf) -> Result<Snapshot, String> {
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        let meta = path.metadata().map_err(|e| e.to_string())?;
        if !meta.is_dir() {
            return Err("Choose an output directory".into());
        }
        let mut state = locked(&self.shared)?;
        idle(&state)?;
        let mut next = state.journal.clone();
        next.output_hint = Some(path.to_string_lossy().into());
        commit(&self.shared, &mut state, next)?;
        state.output = Some(Registered {
            path,
            stamp: Stamp::directory(&meta),
        });
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn set_format(&self, id: &str, format: OutputFormat) -> Result<Snapshot, String> {
        let mut state = locked(&self.shared)?;
        idle(&state)?;
        let mut next = state.journal.clone();
        let task = next
            .tasks
            .iter_mut()
            .find(|t| t.id == id)
            .ok_or("Unknown task")?;
        if !task.formats.contains(&format) {
            return Err("Unsupported output format".into());
        }
        if task.format != format {
            task.format = format;
            task.phase = Phase::Ready;
            task.error = None;
        }
        commit(&self.shared, &mut state, next)?;
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn submit(&self, request: Submission) -> Result<Snapshot, String> {
        let mut state = locked(&self.shared)?;
        if request.epoch != state.journal.epoch {
            return Err("Queue changed; refresh before submitting".into());
        }
        if let Some(previous) = state.journal.receipts.get(&request.request_id) {
            if previous != &request {
                return Err("Request ID was reused with different content".into());
            }
            return Ok(snapshot(&state));
        }
        idle(&state)?;
        if uuid::Uuid::parse_str(&request.request_id).is_err()
            || request.items.is_empty()
            || request.items.len() > 100
        {
            return Err("Invalid batch request".into());
        }
        if state.journal.receipts.len() >= 1024 {
            return Err(
                "Request history is full; clear the queue before submitting more batches".into(),
            );
        }
        if state.output.is_none() {
            return Err("Choose an output directory first".into());
        }
        let mut next = state.journal.clone();
        let mut ids = BTreeSet::new();
        for item in &request.items {
            if !ids.insert(&item.id) {
                return Err("Duplicate task in batch".into());
            }
            let task = next
                .tasks
                .iter_mut()
                .find(|t| t.id == item.id)
                .ok_or("Unknown input; choose it in the native file picker")?;
            if !state.inputs.contains_key(&item.id) {
                return Err("Choose this input again to restore permission".into());
            }
            if task.attempt != item.expected_attempt {
                return Err("Stale task attempt; refresh before retrying".into());
            }
            if task.options != item.options {
                return Err("Task settings changed; refresh before submitting".into());
            }
            if !task.formats.contains(&item.format) {
                return Err("Unsupported output format".into());
            }
            task.format = item.format;
            task.attempt = task
                .attempt
                .checked_add(1)
                .ok_or("Task attempt exhausted")?;
            task.phase = Phase::Queued;
            task.error = None;
        }
        next.receipts.insert(request.request_id.clone(), request);
        commit(&self.shared, &mut state, next)?;
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn configure(
        &self,
        ids: &[String],
        format: Option<OutputFormat>,
        options: crate::Options,
    ) -> Result<Snapshot, String> {
        options.validate()?;
        let mut state = locked(&self.shared)?;
        idle(&state)?;
        if ids.is_empty() || ids.len() > 100 {
            return Err("Select 1 to 100 tasks".into());
        }
        let mut next = state.journal.clone();
        let mut seen = BTreeSet::new();
        for id in ids {
            if !seen.insert(id) {
                return Err("Duplicate task".into());
            }
            let task = next
                .tasks
                .iter_mut()
                .find(|t| &t.id == id)
                .ok_or("Unknown task")?;
            if let Some(format) = format {
                if !task.formats.contains(&format) {
                    return Err("Batch contains an incompatible output format".into());
                }
                task.format = format;
            }
            if task.options != options || format.is_some() {
                task.options = options.clone();
                task.phase = Phase::Ready;
                task.error = None;
            }
        }
        commit(&self.shared, &mut state, next)?;
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn cancel(&self, ids: &[String]) -> Result<Snapshot, String> {
        let mut state = locked(&self.shared)?;
        if state.closing || state.clearing {
            return Err("Queue is closing or clearing".into());
        }
        let mut next = state.journal.clone();
        for task in &mut next.tasks {
            if (ids.is_empty() || ids.contains(&task.id)) && task.phase == Phase::Queued {
                task.phase = Phase::Cancelled;
            }
        }
        if let Some((id, token)) = &state.preview {
            if ids.is_empty() || ids.contains(id) {
                token.cancel();
            }
        }
        // Cancellation must still stop native work if the journal cannot be written.
        if let Some((id, token)) = &state.running {
            if ids.is_empty() || ids.contains(id) {
                token.cancel();
            }
        }
        apply_worker_state(&self.shared, &mut state, next);
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    pub fn remove(&self, ids: &[String]) -> Result<Snapshot, String> {
        let mut state = locked(&self.shared)?;
        if state.closing || state.clearing {
            return Err("Queue is closing or clearing".into());
        }
        let targets: BTreeSet<String> = state
            .journal
            .tasks
            .iter()
            .filter(|t| ids.is_empty() || ids.contains(&t.id))
            .map(|t| t.id.clone())
            .collect();
        if targets.is_empty() {
            return Ok(snapshot(&state));
        }
        let mut next = state.journal.clone();
        for task in &mut next.tasks {
            if targets.contains(&task.id) && task.phase == Phase::Queued {
                task.phase = Phase::Cancelled;
            }
        }
        apply_worker_state(&self.shared, &mut state, next);
        state.clearing = true;
        if let Some((id, cancel)) = &state.preview {
            if targets.contains(id) {
                cancel.cancel();
            }
        }
        if let Some((id, cancel)) = &state.running {
            if targets.contains(id) {
                cancel.cancel();
            }
        }
        drop(state);
        notify(&self.shared);
        state = locked(&self.shared)?;
        while state
            .running
            .as_ref()
            .is_some_and(|(id, _)| targets.contains(id))
            || state
                .preview
                .as_ref()
                .is_some_and(|(id, _)| targets.contains(id))
        {
            state = self.shared.changed.wait(state).map_err(|e| e.to_string())?;
        }
        let mut next = state.journal.clone();
        next.tasks.retain(|t| !targets.contains(&t.id));
        if next.tasks.is_empty() {
            next.epoch = uuid::Uuid::new_v4().to_string();
            next.receipts.clear();
        }
        let saved = commit(&self.shared, &mut state, next);
        state.clearing = false;
        state.persistence_error = saved.as_ref().err().cloned();
        if saved.is_err() {
            state.journal.revision = state.journal.revision.saturating_add(1);
        }
        if saved.is_ok() {
            state.inputs.retain(|id, _| !targets.contains(id));
            if state.journal.tasks.is_empty() {
                state.recovery_notice = None;
                state.import_report = None;
            }
        }
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        saved?;
        Ok(result)
    }
    pub fn retry_history(&self) -> Result<Snapshot, String> {
        let mut state = locked(&self.shared)?;
        let next = state.journal.clone();
        commit(&self.shared, &mut state, next)?;
        state.persistence_error = None;
        let result = snapshot(&state);
        drop(state);
        notify(&self.shared);
        Ok(result)
    }
    /// Atomically fence an idle queue before skipping exit confirmation. A
    /// snapshot followed by shutdown would allow a submission in between.
    /// Active/clearing queues are unchanged until the user explicitly confirms.
    pub fn prepare_idle_exit(&self) -> Result<bool, String> {
        let mut state = locked(&self.shared)?;
        if state.running.is_some()
            || state.preview.is_some()
            || state.clearing
            || state.journal.tasks.iter().any(|t| t.phase == Phase::Queued)
        {
            return Ok(false);
        }
        state.closing = true;
        Ok(true)
    }
    pub fn shutdown(&self) {
        if let Ok(mut state) = locked(&self.shared) {
            if !state.closing {
                state.closing = true;
                if let Some((_, token)) = &state.preview {
                    token.cancel();
                }
                if let Some((_, token)) = &state.running {
                    token.cancel();
                }
                let mut next = state.journal.clone();
                for task in &mut next.tasks {
                    if task.phase == Phase::Queued {
                        task.phase = Phase::Cancelled;
                    }
                }
                apply_worker_state(&self.shared, &mut state, next);
            }
        }
        notify(&self.shared);
        if let Ok(mut state) = locked(&self.shared) {
            while state.preview.is_some() {
                match self.shared.changed.wait(state) {
                    Ok(next) => state = next,
                    Err(_) => break,
                }
            }
        }
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(handle) = worker.take() {
                let _ = handle.join();
            }
        }
    }
}
impl Drop for Queue {
    fn drop(&mut self) {
        self.shutdown();
        // Closing our handle alone may leave the shared lock alive in a child
        // between fork and exec. Release it only after all journal writes stop.
        let _ = self._file_lock.unlock();
    }
}
// A completed file cannot be rolled back just because saving history failed.
// Keep the result in memory, display the error and pause subsequent work.
fn apply_worker_state(shared: &Shared, state: &mut State, mut next: Journal) {
    next.revision = state.journal.revision.saturating_add(1);
    state.persistence_error = store::save(&shared.path, &next).err();
    state.journal = next;
}
// Authorization failures are typed; OS error wording must not control revocation.
enum SourceError {
    Input(String),
    Output(String),
}
fn prepare_input(input: Option<Registered>) -> Result<Source, String> {
    let registered = input.ok_or("Input permission expired")?;
    let file = crate::input::open_regular(&registered.path)
        .map_err(|e| format!("Input unavailable; select it again: {e}"))?;
    let meta = file
        .metadata()
        .map_err(|e| format!("Input unavailable; select it again: {e}"))?;
    if Stamp::file(&meta) != registered.stamp {
        return Err("Input changed; select it again".into());
    }
    Ok(Source {
        file,
        name: registered.path,
        context: crate::ConversionContext::default(),
    })
}
fn prepare_source(
    input: Option<Registered>,
    output: Option<Registered>,
) -> Result<(Source, PathBuf), SourceError> {
    let source = prepare_input(input).map_err(SourceError::Input)?;
    let dir = output.ok_or_else(|| SourceError::Output("Output permission expired".into()))?;
    let meta = dir
        .path
        .metadata()
        .map_err(|e| SourceError::Output(format!("Output unavailable; select it again: {e}")))?;
    if !meta.is_dir() || Stamp::directory(&meta) != dir.stamp {
        return Err(SourceError::Output(
            "Output directory changed; select it again".into(),
        ));
    }
    Ok((source, dir.path))
}
fn work(shared: Arc<Shared>, execute: Arc<Executor>) {
    loop {
        let mut state = match locked(&shared) {
            Ok(state) => state,
            Err(_) => return,
        };
        let id = loop {
            if state.closing {
                return;
            }
            if !state.clearing && state.persistence_error.is_none() {
                if let Some(task) = state
                    .journal
                    .tasks
                    .iter()
                    .find(|t| t.phase == Phase::Queued)
                {
                    break task.id.clone();
                }
            }
            state = match shared.changed.wait(state) {
                Ok(state) => state,
                Err(_) => return,
            };
        };
        let token = Cancel::default();
        let mut next = state.journal.clone();
        let task = next
            .tasks
            .iter_mut()
            .find(|t| t.id == id)
            .expect("queued task exists");
        task.phase = Phase::Running;
        let format = task.format;
        let options = task.options.clone();
        let resume = task.result.clone();
        let attempt = task.attempt;
        if let Err(error) = commit(&shared, &mut state, next) {
            state.persistence_error = Some(error);
            state.journal.revision += 1;
            drop(state);
            notify(&shared);
            continue;
        }
        state.running = Some((id.clone(), token.clone()));
        let registered = state.inputs.get(&id).cloned();
        let output = state.output.clone();
        drop(state);
        notify(&shared);
        // File system access can be slow; snapshots and cancellation must not wait
        // for it while holding the state mutex. Running tasks retain their grants.
        let source = prepare_source(registered, output);
        let revoke_input = matches!(&source, Err(SourceError::Input(_)));
        let revoke_output = matches!(&source, Err(SourceError::Output(_)));
        let result = source
            .map_err(|e| match e {
                SourceError::Input(message) | SourceError::Output(message) => message,
            })
            .and_then(|(mut source, output)| {
                token.check_cancelled()?;
                let reporter_shared = shared.clone();
                let reporter_id = id.clone();
                source.context = crate::ConversionContext {
                    workspace: None,
                    options,
                    resume,
                    report: Some(Arc::new(move |progress| {
                        let mut state = locked(&reporter_shared)?;
                        if state
                            .running
                            .as_ref()
                            .is_none_or(|(id, _)| id != &reporter_id)
                        {
                            return Err("Task is no longer running".into());
                        }
                        let mut next = state.journal.clone();
                        let task = next
                            .tasks
                            .iter_mut()
                            .find(|t| t.id == reporter_id && t.attempt == attempt)
                            .ok_or("Stale conversion progress")?;
                        task.result = Some(progress);
                        apply_worker_state(&reporter_shared, &mut state, next);
                        let error = state.persistence_error.clone();
                        drop(state);
                        notify(&reporter_shared);
                        match error {
                            Some(error) => Err(format!("Cannot save page history: {error}")),
                            None => Ok(()),
                        }
                    })),
                };
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    execute(source, &output, format, &token)
                }))
                .unwrap_or_else(|_| Err("Conversion worker panicked".into()))
            });
        let mut state = match locked(&shared) {
            Ok(state) => state,
            Err(_) => return,
        };
        let mut next = state.journal.clone();
        let task = next
            .tasks
            .iter_mut()
            .find(|t| t.id == id)
            .expect("running task retained until cleanup");
        match result {
            Ok(result) => {
                task.phase = Phase::Saved;
                task.result = Some(result);
                task.error = None;
            }
            Err(error) => {
                task.phase = if task
                    .result
                    .as_ref()
                    .is_some_and(|r| !r.complete && !r.files.is_empty())
                {
                    Phase::Partial
                } else if error == "Cancelled" {
                    Phase::Cancelled
                } else {
                    Phase::Failed
                };
                task.error = Some(error);
            }
        }
        if revoke_input {
            task.authorized = false;
            state.inputs.remove(&id);
        }
        if revoke_output {
            state.output = None;
        }
        state.running = None;
        apply_worker_state(&shared, &mut state, next);
        drop(state);
        notify(&shared);
    }
}

#[cfg(test)]
mod tests;
