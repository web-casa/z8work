use super::*;
use std::{
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    time::{Duration, Instant},
};
fn root() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

fn retaining_queue(root: &Path, count: Arc<AtomicUsize>, gate: Option<Arc<AtomicBool>>) -> Queue {
    let workspace = crate::workspaces::Store::open(root.join("retained-work")).unwrap();
    Queue::open(
        root.join("history.json"),
        Arc::new(move |source, _, format, cancel| {
            let call = count.fetch_add(1, Ordering::SeqCst);
            if call > 0 {
                if let Some(gate) = &gate {
                    let deadline = Instant::now() + Duration::from_secs(5);
                    while !gate.load(Ordering::SeqCst) {
                        cancel.check(deadline)?;
                        thread::sleep(Duration::from_millis(5));
                    }
                }
            }
            let work = workspace.create()?;
            let output = work.path().join("output");
            fs::write(&output, b"verified content").unwrap();
            let retained = crate::PendingOutput::capture(
                &work,
                &output,
                &source.name,
                format,
                "Text only".into(),
            )?;
            source.context.retain.as_ref().unwrap()(retained)?;
            Err("Synthetic publication failure".into())
        }),
        Arc::new(|_| {}),
    )
    .unwrap()
}
fn save_request(snapshot: &Snapshot) -> Submission {
    let mut request = request(snapshot);
    request.items.retain(|i| {
        snapshot
            .tasks
            .iter()
            .any(|t| t.id == i.id && t.phase == Phase::AwaitingSave)
    });
    for item in &mut request.items {
        item.save_only = true;
    }
    request
}
fn cached_path(q: &Queue, id: &str) -> PathBuf {
    locked(&q.shared).unwrap().retained[id].output.test_path()
}
#[test]
fn saving_cached_output_needs_no_input_or_encoder_and_is_idempotent() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = retaining_queue(root.path(), count.clone(), None);
    let initial = ready(&q, root.path(), 1);
    q.submit(request(&initial)).unwrap();
    let pending = wait(&q, |s| !s.processing);
    assert_eq!(pending.tasks[0].phase, Phase::AwaitingSave);
    assert!(!q.prepare_idle_exit().unwrap());
    let cache = cached_path(&q, &pending.tasks[0].id);
    fs::remove_file(root.path().join("0.md")).unwrap();
    let output = root.path().join("other output");
    fs::create_dir(&output).unwrap();
    q.set_output(output.clone()).unwrap();
    let req = save_request(&pending);
    q.submit(req.clone()).unwrap();
    q.submit(req.clone()).unwrap();
    let saved = wait(&q, |s| !s.processing);
    assert_eq!(saved.tasks[0].phase, Phase::Saved);
    assert_eq!(count.load(Ordering::SeqCst), 1);
    assert_eq!(
        fs::read(&saved.tasks[0].result.as_ref().unwrap().path).unwrap(),
        b"verified content"
    );
    assert!(!cache.exists());
    q.submit(req).unwrap();
    assert_eq!(fs::read_dir(output).unwrap().count(), 1);
    assert_eq!(q.snapshot().unwrap().tasks[0].attempt, 2);
}
#[test]
fn cache_expiry_tampering_and_parameter_changes_require_explicit_conversion() {
    for mode in ["expired", "tampered", "options", "remove"] {
        let root = root();
        let count = Arc::new(AtomicUsize::new(0));
        let q = retaining_queue(root.path(), count.clone(), None);
        q.submit(request(&ready(&q, root.path(), 1))).unwrap();
        let s = wait(&q, |s| !s.processing);
        let id = &s.tasks[0].id;
        let path = cached_path(&q, id);
        match mode {
            "expired" => {
                locked(&q.shared)
                    .unwrap()
                    .retained
                    .get_mut(id)
                    .unwrap()
                    .expires = Instant::now();
                q.shared.changed.notify_all();
                wait(&q, |s| s.tasks[0].phase == Phase::Failed);
                assert!(q.submit(save_request(&s)).is_err());
            }
            "tampered" => {
                fs::write(&path, b"tampered content").unwrap();
                q.submit(save_request(&s)).unwrap();
                let failed = wait(&q, |s| !s.processing);
                assert_eq!(failed.tasks[0].phase, Phase::Failed);
                assert_eq!(
                    failed.tasks[0].error.as_deref(),
                    Some(crate::retained::INVALID)
                );
            }
            "options" => {
                let mut options = s.tasks[0].options.clone();
                options.keep_metadata = true;
                q.configure(std::slice::from_ref(id), None, options)
                    .unwrap();
                assert!(q.submit(save_request(&s)).is_err());
            }
            _ => {
                q.remove(std::slice::from_ref(id)).unwrap();
            }
        }
        assert!(!path.exists());
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}
#[test]
fn cancel_of_queued_save_retains_result_and_shutdown_requires_reconversion() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(AtomicBool::new(false));
    let q = retaining_queue(root.path(), count.clone(), Some(gate.clone()));
    q.submit(request(&ready(&q, root.path(), 1))).unwrap();
    let pending = wait(&q, |s| !s.processing);
    let id = pending.tasks[0].id.clone();
    let path = cached_path(&q, &id);
    q.register(vec![input(root.path(), "other.md")], None)
        .unwrap();
    // The scheduler follows journal order, not the order of request.items.
    locked(&q.shared).unwrap().journal.tasks.reverse();
    let mut req = request(&q.snapshot().unwrap());
    req.items
        .iter_mut()
        .find(|item| item.id == id)
        .unwrap()
        .save_only = true;
    q.submit(req).unwrap();
    wait(&q, |_| count.load(Ordering::SeqCst) == 2);
    q.cancel(std::slice::from_ref(&id)).unwrap();
    assert_eq!(
        q.snapshot()
            .unwrap()
            .tasks
            .iter()
            .find(|t| t.id == id)
            .unwrap()
            .phase,
        Phase::AwaitingSave
    );
    assert!(path.exists());
    gate.store(true, Ordering::SeqCst);
    wait(&q, |s| !s.processing);
    q.shutdown();
    assert!(!path.exists());
    drop(q);
    let reopened = retaining_queue(root.path(), count.clone(), None);
    assert!(reopened
        .snapshot()
        .unwrap()
        .tasks
        .iter()
        .all(|t| t.phase == Phase::Interrupted && !t.authorized));
    assert!(locked(&reopened.shared).unwrap().retained.is_empty());
    assert_eq!(count.load(Ordering::SeqCst), 2);
}
#[test]
fn schema_two_history_has_an_exact_backup_before_upgrade() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    {
        let q = queue(root.path(), count.clone(), None);
        ready(&q, root.path(), 1);
    }
    let path = root.path().join("history.json");
    let mut old: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    old["schema"] = serde_json::json!(2);
    let bytes = serde_json::to_vec(&old).unwrap();
    fs::write(&path, &bytes).unwrap();
    let q = queue(root.path(), count, None);
    assert_eq!(q.snapshot().unwrap().schema, 3);
    assert_eq!(
        fs::read(path.with_extension("v2-backup.json")).unwrap(),
        bytes
    );
}

#[test]
fn lost_output_grant_preserves_cache_but_rejects_stale_attempts_and_formats() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = retaining_queue(root.path(), count.clone(), None);
    q.submit(request(&ready(&q, root.path(), 1))).unwrap();
    let pending = wait(&q, |s| !s.processing);
    let mut stale = save_request(&pending);
    stale.items[0].expected_attempt = 0;
    assert!(q.submit(stale).is_err());
    let mut wrong = save_request(&pending);
    wrong.items[0].format = OutputFormat::Png;
    assert!(q.submit(wrong).is_err());
    let target = root.path().join("vanished");
    fs::create_dir(&target).unwrap();
    q.set_output(target.clone()).unwrap();
    fs::remove_dir(target).unwrap();
    q.submit(save_request(&pending)).unwrap();
    let failed = wait(&q, |s| !s.processing);
    assert_eq!(failed.tasks[0].phase, Phase::AwaitingSave);
    assert!(!failed.output_authorized);
    assert!(cached_path(&q, &failed.tasks[0].id).exists());
    q.set_output(root.path().to_path_buf()).unwrap();
    q.submit(save_request(&failed)).unwrap();
    assert_eq!(wait(&q, |s| !s.processing).tasks[0].phase, Phase::Saved);
    assert_eq!(count.load(Ordering::SeqCst), 1);
}

#[test]
fn removal_waits_for_saving_owner_and_releases_its_budget() {
    let root = root();
    let hold = Arc::new(AtomicBool::new(false));
    let entered = Arc::new(AtomicBool::new(false));
    let hold_worker = hold.clone();
    let entered_worker = entered.clone();
    let workspace = crate::workspaces::Store::open(root.path().join("cache")).unwrap();
    let q = Arc::new(
        Queue::open(
            root.path().join("history.json"),
            Arc::new(move |source, _, format, _| {
                let work = workspace.create()?;
                let output = work.path().join("output");
                fs::write(&output, b"verified content").unwrap();
                source.context.retain.as_ref().unwrap()(crate::PendingOutput::capture(
                    &work,
                    &output,
                    &source.name,
                    format,
                    String::new(),
                )?)?;
                Err("Synthetic publication failure".into())
            }),
            Arc::new(move |_| {
                if thread::current().name() == Some("z8-conversion-queue")
                    && hold_worker.load(Ordering::SeqCst)
                {
                    entered_worker.store(true, Ordering::SeqCst);
                    let until = Instant::now() + Duration::from_secs(5);
                    while hold_worker.load(Ordering::SeqCst) && Instant::now() < until {
                        thread::sleep(Duration::from_millis(2));
                    }
                }
            }),
        )
        .unwrap(),
    );
    q.submit(request(&ready(&q, root.path(), 1))).unwrap();
    let pending = wait(&q, |s| !s.processing);
    let id = pending.tasks[0].id.clone();
    let path = cached_path(&q, &id);
    hold.store(true, Ordering::SeqCst);
    q.submit(save_request(&pending)).unwrap();
    wait(&q, |s| {
        s.tasks[0].phase == Phase::Saving && entered.load(Ordering::SeqCst)
    });
    let remover = q.clone();
    let done = Arc::new(AtomicBool::new(false));
    let removed = done.clone();
    let thread = thread::spawn(move || {
        remover.remove(&[id]).unwrap();
        removed.store(true, Ordering::SeqCst);
    });
    wait(&q, |s| s.clearing);
    assert!(!done.load(Ordering::SeqCst));
    assert!(path.exists());
    assert_eq!(
        locked(&q.shared)
            .unwrap()
            .retained_bytes
            .load(Ordering::SeqCst),
        16
    );
    hold.store(false, Ordering::SeqCst);
    thread.join().unwrap();
    assert!(!path.exists());
    assert!(q.snapshot().unwrap().tasks.is_empty());
    assert_eq!(
        locked(&q.shared)
            .unwrap()
            .retained_bytes
            .load(Ordering::SeqCst),
        0
    );
}
fn input(root: &Path, name: &str) -> PathBuf {
    let path = root.join(name);
    fs::write(&path, b"synthetic input").unwrap();
    path
}
fn queue(root: &Path, count: Arc<AtomicUsize>, gate: Option<Arc<AtomicBool>>) -> Queue {
    Queue::open(
        root.join("history.json"),
        Arc::new(move |_source, directory, _, cancel| {
            let n = count.fetch_add(1, Ordering::SeqCst);
            if let Some(gate) = &gate {
                let deadline = Instant::now() + Duration::from_secs(5);
                while !gate.load(Ordering::SeqCst) {
                    cancel.check(deadline)?;
                    thread::sleep(Duration::from_millis(5));
                }
            }
            cancel.check(Instant::now() + Duration::from_secs(1))?;
            let path = directory.join(format!("result-{n}.txt"));
            fs::write(&path, b"saved result").map_err(|e| e.to_string())?;
            Ok(ConversionResult {
                path: path.to_string_lossy().into(),
                bytes: 12,
                note: String::new(),
                complete: true,
                ..Default::default()
            })
        }),
        Arc::new(|_| {}),
    )
    .unwrap()
}
fn request(snapshot: &Snapshot) -> Submission {
    Submission {
        epoch: snapshot.epoch.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        items: snapshot
            .tasks
            .iter()
            .map(|t| SubmissionItem {
                save_only: false,
                id: t.id.clone(),
                format: t.format,
                expected_attempt: t.attempt,
                options: t.options.clone(),
            })
            .collect(),
    }
}
fn wait(queue: &Queue, predicate: impl Fn(&Snapshot) -> bool) -> Snapshot {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let state = queue.snapshot().unwrap();
        if predicate(&state) {
            return state;
        }
        assert!(Instant::now() < deadline, "queue wait timed out: {state:?}");
        thread::sleep(Duration::from_millis(5));
    }
}
fn ready(queue: &Queue, root: &Path, count: usize) -> Snapshot {
    let files = (0..count)
        .map(|i| input(root, &format!("{i}.md")))
        .collect();
    queue.register(files, None).unwrap();
    queue.set_output(root.to_path_buf()).unwrap()
}
#[test]
fn scheduler_runs_a_whole_batch_without_frontend_calls() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let queue = queue(root.path(), count.clone(), None);
    let initial = ready(&queue, root.path(), 3);
    queue.submit(request(&initial)).unwrap();
    let final_state = wait(&queue, |s| !s.processing);
    assert_eq!(count.load(Ordering::SeqCst), 3);
    assert!(final_state.tasks.iter().all(|t| t.phase == Phase::Saved));
    assert!(final_state.revision > initial.revision);
}
#[test]
fn duplicate_request_and_stale_retry_never_run_twice() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let queue = queue(root.path(), count.clone(), None);
    let initial = ready(&queue, root.path(), 1);
    let req = request(&initial);
    queue.submit(req.clone()).unwrap();
    queue.submit(req.clone()).unwrap();
    wait(&queue, |s| !s.processing);
    queue.submit(req.clone()).unwrap();
    assert_eq!(count.load(Ordering::SeqCst), 1);
    let mut stale = req.clone();
    stale.request_id = uuid::Uuid::new_v4().to_string();
    assert!(queue.submit(stale).unwrap_err().contains("Stale"));
    let mut changed = req;
    changed.items[0].format = OutputFormat::Avif;
    assert!(queue
        .submit(changed)
        .unwrap_err()
        .contains("different content"));
}
#[test]
fn invalid_batch_is_atomic() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let queue = queue(root.path(), count.clone(), None);
    let initial = ready(&queue, root.path(), 2);
    let mut req = request(&initial);
    req.items[1].id = "invented".into();
    assert!(queue.submit(req).is_err());
    assert_eq!(count.load(Ordering::SeqCst), 0);
    assert!(queue
        .snapshot()
        .unwrap()
        .tasks
        .iter()
        .all(|t| t.attempt == 0 && t.phase == Phase::Ready));
}
#[test]
fn clear_waits_for_cancellation_and_never_deletes_saved_files() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(AtomicBool::new(false));
    let queue = queue(root.path(), count.clone(), Some(gate));
    fs::write(root.path().join("previous.webp"), b"user saved result").unwrap();
    let state = ready(&queue, root.path(), 3);
    let req = request(&state);
    queue.submit(req.clone()).unwrap();
    wait(&queue, |s| {
        s.tasks.iter().any(|t| t.phase == Phase::Running) && count.load(Ordering::SeqCst) == 1
    });
    let cleared = queue.remove(&[]).unwrap();
    assert!(cleared.tasks.is_empty() && !cleared.processing);
    assert_eq!(count.load(Ordering::SeqCst), 1);
    assert!(root.path().join("previous.webp").exists());
    assert!(root.path().join("0.md").exists());
    assert!(queue.submit(req).unwrap_err().contains("Queue changed"));
}
#[test]
fn cancellation_prevents_queued_work_and_allows_explicit_retry() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(AtomicBool::new(false));
    let queue = queue(root.path(), count.clone(), Some(gate.clone()));
    let state = ready(&queue, root.path(), 2);
    queue.submit(request(&state)).unwrap();
    wait(&queue, |s| {
        s.tasks.iter().any(|t| t.phase == Phase::Running)
    });
    queue.cancel(&[]).unwrap();
    let cancelled = wait(&queue, |s| !s.processing);
    assert!(cancelled.tasks.iter().all(|t| t.phase == Phase::Cancelled));
    gate.store(true, Ordering::SeqCst);
    queue.submit(request(&cancelled)).unwrap();
    let done = wait(&queue, |s| !s.processing);
    assert!(done
        .tasks
        .iter()
        .all(|t| t.phase == Phase::Saved && t.attempt == 2));
}
#[test]
fn restart_restores_history_but_never_restores_file_authority() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let req;
    {
        let q = queue(root.path(), count.clone(), None);
        let state = ready(&q, root.path(), 1);
        req = request(&state);
        q.submit(req.clone()).unwrap();
        wait(&q, |s| !s.processing);
    }
    let q = queue(root.path(), count.clone(), None);
    let restored = q.snapshot().unwrap();
    assert!(!restored.output_authorized && !restored.tasks[0].authorized);
    assert_eq!(restored.tasks[0].phase, Phase::Saved);
    q.submit(req).unwrap();
    assert_eq!(count.load(Ordering::SeqCst), 1);
    assert!(q.submit(request(&restored)).is_err());
    q.register(vec![root.path().join("0.md")], Some(&restored.tasks[0].id))
        .unwrap();
    let permitted = q.set_output(root.path().to_path_buf()).unwrap();
    q.submit(request(&permitted)).unwrap();
    wait(&q, |s| !s.processing);
    assert_eq!(count.load(Ordering::SeqCst), 2);
}
#[test]
fn interrupted_history_does_not_autorun() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    {
        let q = queue(root.path(), count.clone(), None);
        ready(&q, root.path(), 1);
    }
    let path = root.path().join("history.json");
    let mut journal = store::load(&path).unwrap();
    journal.tasks[0].phase = Phase::Running;
    store::save(&path, &journal).unwrap();
    let q = queue(root.path(), count.clone(), None);
    let s = q.snapshot().unwrap();
    assert_eq!(s.tasks[0].phase, Phase::Interrupted);
    assert!(!s.tasks[0].authorized);
    assert_eq!(count.load(Ordering::SeqCst), 0);
}
#[test]
fn replaced_input_is_rejected_before_executor_runs() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count.clone(), None);
    let state = ready(&q, root.path(), 1);
    fs::write(root.path().join("0.md"), b"different replacement content").unwrap();
    q.submit(request(&state)).unwrap();
    let done = wait(&q, |s| !s.processing);
    assert_eq!(done.tasks[0].phase, Phase::Failed);
    assert!(done.tasks[0]
        .error
        .as_ref()
        .unwrap()
        .contains("Input changed"));
    assert_eq!(count.load(Ordering::SeqCst), 0);
}
#[test]
fn missing_output_revokes_permission_and_requires_a_new_selection() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count.clone(), None);
    ready(&q, root.path(), 2);
    let output = root.path().join("output");
    fs::create_dir(&output).unwrap();
    let state = q.set_output(output.clone()).unwrap();
    fs::remove_dir(&output).unwrap();
    q.submit(request(&state)).unwrap();
    let done = wait(&q, |s| !s.processing);
    assert!(!done.output_authorized);
    assert!(done
        .tasks
        .iter()
        .all(|t| t.phase == Phase::Failed && t.authorized));
    assert_eq!(count.load(Ordering::SeqCst), 0);
    fs::create_dir(&output).unwrap();
    assert!(q
        .submit(request(&done))
        .unwrap_err()
        .contains("output directory"));
    let selected = q.set_output(output).unwrap();
    q.submit(request(&selected)).unwrap();
    assert!(wait(&q, |s| !s.processing)
        .tasks
        .iter()
        .all(|t| t.phase == Phase::Saved));
}
#[test]
fn deleted_input_requires_reselection_even_after_it_is_recreated() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count.clone(), None);
    let state = ready(&q, root.path(), 1);
    let path = root.path().join("0.md");
    fs::remove_file(&path).unwrap();
    q.submit(request(&state)).unwrap();
    let done = wait(&q, |s| !s.processing);
    assert!(!done.tasks[0].authorized && done.output_authorized);
    assert_eq!(count.load(Ordering::SeqCst), 0);
    fs::write(&path, b"new file").unwrap();
    assert!(q
        .submit(request(&done))
        .unwrap_err()
        .contains("restore permission"));
    let selected = q.register(vec![path], Some(&done.tasks[0].id)).unwrap();
    q.submit(request(&selected)).unwrap();
    assert_eq!(wait(&q, |s| !s.processing).tasks[0].phase, Phase::Saved);
}
#[cfg(unix)]
#[test]
fn fifo_input_is_rejected_at_registration_and_after_replacement() {
    use std::{
        ffi::CString,
        os::unix::{ffi::OsStrExt, fs::OpenOptionsExt},
    };
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count.clone(), None);
    let state = ready(&q, root.path(), 1);
    let path = root.path().join("0.md");
    fs::remove_file(&path).unwrap();
    let name = CString::new(path.as_os_str().as_bytes()).unwrap();
    // SAFETY: name is a live, NUL-terminated path in this test's private directory.
    assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
    // If a regression blocks in open(), release it so the test fails instead of
    // hanging the suite. The nonblocking writer has no engine or queue authority.
    let (stop, receiver) = std::sync::mpsc::channel();
    let rescue_path = path.clone();
    let rescue = thread::spawn(move || {
        if receiver.recv_timeout(Duration::from_secs(2)).is_err() {
            let _file = fs::OpenOptions::new()
                .read(true)
                .write(true)
                .custom_flags(libc::O_NONBLOCK)
                .open(rescue_path)
                .unwrap();
            let _ = receiver.recv_timeout(Duration::from_secs(2));
            true
        } else {
            false
        }
    });
    assert!(q.register(vec![path], None).is_err());
    q.submit(request(&state)).unwrap();
    let done = wait(&q, |s| !s.processing);
    let _ = stop.send(());
    assert!(!rescue.join().unwrap(), "opening the FIFO blocked");
    assert!(!done.tasks[0].authorized);
    assert_eq!(count.load(Ordering::SeqCst), 0);
    assert!(q.remove(&[]).unwrap().tasks.is_empty());
    q.shutdown();
}
#[test]
fn cancellation_before_source_check_prevents_executor_start() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let executions = count.clone();
    let slot: Arc<Mutex<Option<std::sync::Weak<Queue>>>> = Arc::new(Mutex::new(None));
    let notify_slot = slot.clone();
    let q = Arc::new(
        Queue::open(
            root.path().join("history.json"),
            Arc::new(move |_, _, _, _| {
                executions.fetch_add(1, Ordering::SeqCst);
                Err("must not start".into())
            }),
            Arc::new(move |_| {
                // Cancel at the notification boundary, before opening the input.
                let queue = notify_slot
                    .lock()
                    .unwrap()
                    .as_ref()
                    .and_then(|q| q.upgrade());
                if let Some(queue) = queue {
                    let mut state = locked(&queue.shared).unwrap();
                    if let Some((_, token)) = &mut state.running {
                        token.cancel();
                    }
                }
            }),
        )
        .unwrap(),
    );
    *slot.lock().unwrap() = Some(Arc::downgrade(&q));
    let state = ready(&q, root.path(), 1);
    q.submit(request(&state)).unwrap();
    let done = wait(&q, |s| !s.processing);
    assert_eq!(done.tasks[0].phase, Phase::Cancelled);
    assert_eq!(count.load(Ordering::SeqCst), 0);
    q.shutdown();
}
#[test]
fn corrupt_history_is_preserved_and_not_silently_reset() {
    let root = root();
    let path = root.path().join("history.json");
    fs::write(&path, b"corrupted").unwrap();
    assert!(Queue::open(
        path.clone(),
        Arc::new(|_, _, _, _| unreachable!()),
        Arc::new(|_| {})
    )
    .is_err());
    assert_eq!(fs::read(path).unwrap(), b"corrupted");
}
#[test]
fn persistence_failure_prevents_submission_and_can_be_retried() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count.clone(), None);
    let state = ready(&q, root.path(), 1);
    let path = root.path().join("history.json");
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(q.submit(request(&state)).is_err());
    assert_eq!(count.load(Ordering::SeqCst), 0);
    fs::remove_dir(&path).unwrap();
    q.retry_history().unwrap();
    q.submit(request(&state)).unwrap();
    wait(&q, |s| !s.processing);
}
#[test]
fn shutdown_cancels_running_and_queued_work() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(
        root.path(),
        count.clone(),
        Some(Arc::new(AtomicBool::new(false))),
    );
    let state = ready(&q, root.path(), 2);
    q.submit(request(&state)).unwrap();
    wait(&q, |s| {
        s.tasks[0].phase == Phase::Running && count.load(Ordering::SeqCst) == 1
    });
    q.shutdown();
    assert_eq!(count.load(Ordering::SeqCst), 1);
    assert!(q
        .snapshot()
        .unwrap()
        .tasks
        .iter()
        .all(|t| t.phase == Phase::Cancelled));
    assert!(q.submit(request(&q.snapshot().unwrap())).is_err());
}

#[test]
fn idle_exit_fences_late_submissions_and_keeps_unstarted_tasks() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count.clone(), None);
    let initial = ready(&q, root.path(), 2);
    assert!(q.prepare_idle_exit().unwrap());
    assert!(q.submit(request(&initial)).unwrap_err().contains("closing"));
    assert!(q.can_pick().is_err());
    q.shutdown();
    assert_eq!(count.load(Ordering::SeqCst), 0);
    assert_eq!(q.snapshot().unwrap().tasks.len(), 2);
}

#[test]
fn active_exit_check_does_not_cancel_or_pause_the_batch() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(AtomicBool::new(false));
    let q = queue(root.path(), count.clone(), Some(gate.clone()));
    let initial = ready(&q, root.path(), 2);
    q.submit(request(&initial)).unwrap();
    wait(&q, |s| s.tasks.iter().any(|t| t.phase == Phase::Running));
    for _ in 0..4 {
        assert!(!q.prepare_idle_exit().unwrap());
    }
    gate.store(true, Ordering::SeqCst);
    let done = wait(&q, |s| !s.processing);
    assert!(done.tasks.iter().all(|t| t.phase == Phase::Saved));
    assert_eq!(count.load(Ordering::SeqCst), 2);
    assert!(q.can_pick().is_ok());
    assert!(q.prepare_idle_exit().unwrap());
    q.shutdown();
    assert_eq!(
        fs::read(root.path().join("result-0.txt")).unwrap(),
        b"saved result"
    );
}

#[test]
fn queued_or_clearing_work_also_requires_exit_confirmation() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    ready(&q, root.path(), 1);
    // Exercise queued-only and clearing-only boundaries without a worker race.
    {
        let mut state = locked(&q.shared).unwrap();
        state.persistence_error = Some("test pauses scheduling".into());
        state.journal.tasks[0].phase = Phase::Queued;
    }
    assert!(!q.prepare_idle_exit().unwrap());
    {
        let mut state = locked(&q.shared).unwrap();
        state.journal.tasks[0].phase = Phase::Ready;
        state.clearing = true;
    }
    assert!(!q.prepare_idle_exit().unwrap());
    locked(&q.shared).unwrap().clearing = false;
    assert!(q.prepare_idle_exit().unwrap());
}
#[test]
fn separate_instances_cannot_write_the_same_history() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let q = queue(root.path(), count, None);
    let second = Queue::open(
        root.path().join("history.json"),
        Arc::new(|_, _, _, _| unreachable!()),
        Arc::new(|_| {}),
    );
    assert!(second.err().unwrap().contains("locked"));
    drop(q);
    assert!(Queue::open(
        root.path().join("history.json"),
        Arc::new(|_, _, _, _| unreachable!()),
        Arc::new(|_| {})
    )
    .is_ok());
}
#[test]
fn shutdown_drop_releases_lock_even_if_a_duplicate_handle_exists() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    // On Unix a concurrent fork can briefly retain the open file description
    // until exec closes CLOEXEC handles. A clone models that shared lock lifetime.
    let inherited = q._file_lock.try_clone().unwrap();
    drop(q);
    let reopened = Queue::open(
        root.path().join("history.json"),
        Arc::new(|_, _, _, _| unreachable!()),
        Arc::new(|_| {}),
    );
    assert!(
        reopened.is_ok(),
        "queue drop must explicitly release its lock"
    );
    drop(inherited);
}
#[test]
fn saved_output_survives_history_failure_and_following_jobs_pause() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(AtomicBool::new(false));
    let q = queue(root.path(), count.clone(), Some(gate.clone()));
    let state = ready(&q, root.path(), 2);
    q.submit(request(&state)).unwrap();
    wait(&q, |s| s.tasks[0].phase == Phase::Running);
    let path = root.path().join("history.json");
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    gate.store(true, Ordering::SeqCst);
    let failed_history = wait(&q, |s| s.persistence_error.is_some());
    assert_eq!(failed_history.tasks[0].phase, Phase::Saved);
    assert_eq!(failed_history.tasks[1].phase, Phase::Queued);
    assert!(Path::new(&failed_history.tasks[0].result.as_ref().unwrap().path).is_file());
    assert_eq!(count.load(Ordering::SeqCst), 1);
    fs::remove_dir(&path).unwrap();
    q.retry_history().unwrap();
    let saved = wait(&q, |s| !s.processing);
    assert!(saved.tasks.iter().all(|t| t.phase == Phase::Saved));
    assert_eq!(count.load(Ordering::SeqCst), 2);
}
#[test]
fn panic_in_one_executor_does_not_abandon_the_batch() {
    let root = root();
    let count = Arc::new(AtomicUsize::new(0));
    let executions = count.clone();
    let q = Queue::open(
        root.path().join("history.json"),
        Arc::new(move |_, _, _, _| {
            if executions.fetch_add(1, Ordering::SeqCst) == 0 {
                panic!("synthetic engine panic");
            }
            Ok(ConversionResult {
                path: "synthetic result".into(),
                bytes: 1,
                note: String::new(),
                complete: true,
                ..Default::default()
            })
        }),
        Arc::new(|_| {}),
    )
    .unwrap();
    let state = ready(&q, root.path(), 2);
    q.submit(request(&state)).unwrap();
    let final_state = wait(&q, |s| !s.processing);
    assert_eq!(final_state.tasks[0].phase, Phase::Failed);
    assert_eq!(final_state.tasks[1].phase, Phase::Saved);
}
#[test]
fn serialized_snapshot_matches_the_frontend_contract_fixture() {
    let value: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../desktop/tests/fixtures/queue-snapshot.json"
    ))
    .unwrap();
    let snapshot: Snapshot = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(snapshot).unwrap(), value);
}
#[test]
fn clear_is_available_when_history_is_too_large_or_unsaved() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    ready(&q, root.path(), 1);
    {
        let mut state = locked(&q.shared).unwrap();
        state.persistence_error = Some("History exceeds budget".into());
        state.journal.tasks[0].error = Some("x".repeat(3 * 1024 * 1024));
    }
    let cleared = q.remove(&[]).unwrap();
    assert!(cleared.tasks.is_empty());
    assert!(cleared.persistence_error.is_none());
}
#[test]
fn removing_a_queued_task_does_not_wait_for_an_unrelated_running_task() {
    let root = root();
    let gate = Arc::new(AtomicBool::new(false));
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), Some(gate));
    let state = ready(&q, root.path(), 2);
    q.submit(request(&state)).unwrap();
    wait(&q, |s| s.tasks[0].phase == Phase::Running);
    let removed = q.remove(&[state.tasks[1].id.clone()]).unwrap();
    assert_eq!(removed.tasks.len(), 1);
    assert!(removed.processing);
}
#[test]
fn batch_configuration_is_atomic_and_stale_settings_are_rejected() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let state = ready(&q, root.path(), 2);
    let old = request(&state);
    let options = crate::Options {
        quality: crate::Quality::Small,
        ..Default::default()
    };
    assert!(q
        .configure(
            &[state.tasks[0].id.clone(), "unknown".into()],
            None,
            options.clone()
        )
        .is_err());
    assert_eq!(
        q.snapshot().unwrap().tasks[0].options,
        crate::Options::default()
    );
    assert!(q
        .configure(
            &[state.tasks[0].id.clone()],
            Some(OutputFormat::Avif),
            options.clone()
        )
        .is_err());
    let updated = q
        .configure(
            &state.tasks.iter().map(|t| t.id.clone()).collect::<Vec<_>>(),
            None,
            options,
        )
        .unwrap();
    assert!(q.submit(old).unwrap_err().contains("settings changed"));
    q.submit(request(&updated)).unwrap();
    assert!(wait(&q, |s| !s.processing)
        .tasks
        .iter()
        .all(|t| t.phase == Phase::Saved));
}
#[test]
fn legacy_history_is_backed_up_before_schema_migration() {
    let root = root();
    let path = root.path().join("history.json");
    {
        let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
        ready(&q, root.path(), 1);
    }
    let mut old: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    old["schema"] = serde_json::json!(1);
    old["tasks"][0].as_object_mut().unwrap().remove("options");
    let bytes = serde_json::to_vec(&old).unwrap();
    fs::write(&path, &bytes).unwrap();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    assert_eq!(q.snapshot().unwrap().schema, 3);
    assert_eq!(
        fs::read(path.with_extension("v1-backup.json")).unwrap(),
        bytes
    );
    assert!(!q.snapshot().unwrap().tasks[0].authorized);
}
#[test]
fn saved_pages_survive_cancellation_and_are_passed_to_an_explicit_retry() {
    let root = root();
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let q = Queue::open(
        root.path().join("history.json"),
        Arc::new(move |source, _, _, _| {
            if count.fetch_add(1, Ordering::SeqCst) == 0 {
                source.context.report.as_ref().unwrap()(ConversionResult {
                    complete: false,
                    total: 2,
                    files: vec![crate::SavedFile {
                        path: "saved-page.png".into(),
                        bytes: 12,
                        page: 1,
                        sha256: "a".repeat(64),
                    }],
                    bytes: 12,
                    ..Default::default()
                })?;
                Err("Cancelled".into())
            } else {
                assert_eq!(source.context.resume.unwrap().files.len(), 1);
                Ok(ConversionResult::default())
            }
        }),
        Arc::new(|_| {}),
    )
    .unwrap();
    let initial = ready(&q, root.path(), 1);
    q.submit(request(&initial)).unwrap();
    let partial = wait(&q, |s| !s.processing);
    assert_eq!(partial.tasks[0].phase, Phase::Partial);
    assert_eq!(partial.tasks[0].result.as_ref().unwrap().files.len(), 1);
    q.submit(request(&partial)).unwrap();
    assert_eq!(wait(&q, |s| !s.processing).tasks[0].phase, Phase::Saved);
}
#[test]
fn unsupported_engine_routes_are_not_advertised_at_registration() {
    let root = root();
    let q = Queue::open_with_formats(
        root.path().join("history.json"),
        Arc::new(|_, _, _, _| unreachable!()),
        Arc::new(|_| {}),
        Arc::new(|ext| {
            if ext == "md" {
                vec![OutputFormat::Txt]
            } else {
                vec![]
            }
        }),
    )
    .unwrap();
    let markdown = input(root.path(), "file.md");
    let image = input(root.path(), "file.png");
    assert!(q.register(vec![markdown.clone(), image], None).is_err());
    assert!(q.snapshot().unwrap().tasks.is_empty());
    assert_eq!(
        q.register(vec![markdown], None).unwrap().tasks[0].formats,
        vec![OutputFormat::Txt]
    );
}
#[test]
fn revealing_results_requires_current_directory_authority_and_unchanged_bytes() {
    let root = root();
    let q = Queue::open(
        root.path().join("history.json"),
        Arc::new(|_, directory, _, _| {
            let path = directory.join("verified.txt");
            fs::write(&path, b"verified").unwrap();
            let saved = crate::SavedFile {
                path: path.to_string_lossy().into(),
                bytes: 8,
                page: 1,
                sha256: crate::hash_file(&path)?,
            };
            Ok(ConversionResult {
                path: saved.path.clone(),
                bytes: 8,
                files: vec![saved],
                ..Default::default()
            })
        }),
        Arc::new(|_| {}),
    )
    .unwrap();
    let state = ready(&q, root.path(), 1);
    q.submit(request(&state)).unwrap();
    let done = wait(&q, |s| !s.processing);
    let id = &done.tasks[0].id;
    let path = q.result_path(id, 1).unwrap();
    assert!(q.result_path("invented", 1).is_err());
    fs::write(path, b"modified").unwrap();
    assert!(q.result_path(id, 1).is_err());
    locked(&q.shared).unwrap().output = None;
    assert!(q.result_path(id, 1).is_err());
}

#[test]
fn preview_is_authorized_input_only_and_does_not_change_task_state() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let registered = q
        .register(vec![input(root.path(), "preview.png")], None)
        .unwrap();
    let id = &registered.tasks[0].id;
    assert!(q.with_preview("invented", |_, _| Ok(())).is_err());
    q.with_preview(id, |source, _| {
        assert_eq!(source.name.file_name().unwrap(), "preview.png");
        assert!(q.snapshot().unwrap().processing);
        assert!(q.can_pick().is_err());
        assert!(!q.prepare_idle_exit().unwrap());
        assert!(q.with_preview(id, |_, _| Ok(())).is_err());
        assert!(q.submit(request(&registered)).is_err());
        Ok(())
    })
    .unwrap();
    let after = q.snapshot().unwrap();
    assert!(!after.processing);
    assert!(!after.output_authorized);
    assert_eq!(after.tasks[0].attempt, 0);
    assert_eq!(after.tasks[0].phase, Phase::Ready);
    assert!(after.tasks[0].result.is_none());
    fs::write(root.path().join("preview.png"), b"changed").unwrap();
    assert!(q
        .with_preview::<()>(id, |_, _| panic!("Changed file reached renderer"))
        .is_err());
    assert!(!q.snapshot().unwrap().processing);
    assert!(!q.snapshot().unwrap().tasks[0].authorized);
}
#[test]
fn preview_errors_and_cancellation_leave_conversion_available() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let initial = ready(&q, root.path(), 1);
    let id = &initial.tasks[0].id;
    let failure: Result<(), String> = q.with_preview(id, |_, _| Err("bad preview".into()));
    assert!(failure.is_err());
    assert!(q
        .with_preview(id, |_, cancel| {
            q.cancel(std::slice::from_ref(id)).unwrap();
            cancel.check_cancelled()
        })
        .is_err());
    assert!(!q.snapshot().unwrap().processing);
    q.submit(request(&q.snapshot().unwrap())).unwrap();
    assert_eq!(wait(&q, |s| !s.processing).tasks[0].phase, Phase::Saved);
}
#[test]
fn remove_and_exit_wait_for_preview_cleanup() {
    for closing in [false, true] {
        let root = root();
        let q = Arc::new(queue(root.path(), Arc::new(AtomicUsize::new(0)), None));
        let state = ready(&q, root.path(), 1);
        let id = state.tasks[0].id.clone();
        let finished = Arc::new(AtomicBool::new(false));
        let flag = finished.clone();
        let handle = q.clone();
        let preview = thread::spawn(move || {
            handle.with_preview(&id, |_, cancel| {
                let deadline = Instant::now() + Duration::from_secs(3);
                while cancel.check(deadline).is_ok() {
                    thread::sleep(Duration::from_millis(5));
                }
                thread::sleep(Duration::from_millis(30));
                flag.store(true, Ordering::SeqCst);
                Err::<(), _>("Cancelled".into())
            })
        });
        wait(&q, |s| s.processing);
        if closing {
            q.shutdown();
        } else {
            q.remove(&[]).unwrap();
        }
        assert!(finished.load(Ordering::SeqCst));
        assert!(preview.join().unwrap().is_err());
        assert!(!q.snapshot().unwrap().processing);
        assert!(root.path().join("0.md").exists());
    }
}
#[test]
fn preview_grants_do_not_survive_restart() {
    let root = root();
    let id;
    {
        let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
        id = ready(&q, root.path(), 1).tasks[0].id.clone();
    }
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    assert!(q.with_preview(&id, |_, _| Ok(())).is_err());
}

#[test]
fn partial_import_accepts_valid_peers_and_reports_each_rejection() {
    use model::ImportReason;
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let valid = input(root.path(), "good.md");
    let bad = input(root.path(), "unsupported.xyz");
    let missing = root.path().join("missing.md");
    let huge = root.path().join("huge.png");
    fs::File::create(&huge)
        .unwrap()
        .set_len(512 * 1024 * 1024 + 1)
        .unwrap();
    let s = q
        .import_files(vec![bad, valid, missing, root.path().into(), huge])
        .unwrap();
    assert_eq!(s.tasks.len(), 1);
    assert_eq!(s.tasks[0].name, "good.md");
    assert!(s.tasks[0].authorized);
    let report = s.import_report.unwrap();
    assert_eq!(report.accepted, 1);
    assert_eq!(
        report
            .issues
            .iter()
            .map(|i| i.reason.clone())
            .collect::<Vec<_>>(),
        vec![
            ImportReason::Unsupported,
            ImportReason::Unreadable,
            ImportReason::NotRegular,
            ImportReason::TooLarge
        ]
    );
    assert!(report
        .issues
        .iter()
        .all(|i| !i.name.contains(std::path::MAIN_SEPARATOR)));
    // Report is in the authoritative snapshot even if an event listener missed it.
    assert_eq!(q.snapshot().unwrap().import_report.unwrap().id, report.id);
    assert!(!fs::read_to_string(root.path().join("history.json"))
        .unwrap()
        .contains("import_report"));
}

#[test]
fn import_capacity_keeps_fitting_files_and_reports_overflow() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    ready(&q, root.path(), 98);
    let paths = (0..4)
        .map(|i| input(root.path(), &format!("extra-{i}.md")))
        .collect();
    let s = q.import_files(paths).unwrap();
    assert_eq!(s.tasks.len(), 100);
    let report = s.import_report.unwrap();
    assert_eq!(report.accepted, 2);
    assert_eq!(report.issues.len(), 2);
    assert!(report
        .issues
        .iter()
        .all(|i| i.reason == model::ImportReason::QueueFull));
    assert!(q.import_files(vec![root.path().join("0.md"); 101]).is_err());
}

#[test]
fn import_notice_dismissal_cannot_erase_a_newer_report_and_cancel_preserves_it() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let bad = input(root.path(), "bad.xyz");
    let a = q
        .import_files(vec![bad.clone()])
        .unwrap()
        .import_report
        .unwrap();
    assert_eq!(a.accepted, 0);
    assert_eq!(
        q.import_files(vec![]).unwrap().import_report.unwrap().id,
        a.id
    );
    let b = q.import_files(vec![bad]).unwrap().import_report.unwrap();
    assert_ne!(a.id, b.id);
    assert_eq!(
        q.dismiss_import_report(&a.id)
            .unwrap()
            .import_report
            .unwrap()
            .id,
        b.id
    );
    assert!(q
        .dismiss_import_report(&b.id)
        .unwrap()
        .import_report
        .is_none());
}

#[test]
fn partial_import_failure_to_persist_does_not_register_or_claim_success() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let good = input(root.path(), "good.md");
    let history = root.path().join("history.json");
    let saved = root.path().join("saved-history.json");
    fs::rename(&history, &saved).unwrap();
    fs::create_dir(&history).unwrap();
    assert!(q.import_files(vec![good]).is_err());
    let s = q.snapshot().unwrap();
    assert!(s.tasks.is_empty());
    assert!(s.import_report.is_none());
    assert!(locked(&q.shared).unwrap().inputs.is_empty());
    fs::remove_dir(history).unwrap();
    fs::rename(saved, root.path().join("history.json")).unwrap();
}

#[test]
fn partial_import_does_not_relax_restore_validation_and_report_expires_on_restart() {
    let root = root();
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let good = input(root.path(), "good.md");
    let bad = input(root.path(), "bad.xyz");
    let s = q.import_files(vec![good.clone(), bad.clone()]).unwrap();
    let id = s.tasks[0].id.clone();
    assert!(q.register(vec![good, bad.clone()], Some(&id)).is_err());
    assert!(q.register(vec![bad], Some(&id)).is_err());
    assert_eq!(q.snapshot().unwrap().tasks[0].name, "good.md");
    drop(q);
    let q = queue(root.path(), Arc::new(AtomicUsize::new(0)), None);
    let s = q.snapshot().unwrap();
    assert!(s.import_report.is_none());
    assert!(!s.tasks[0].authorized);
}
