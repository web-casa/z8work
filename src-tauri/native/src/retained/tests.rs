use super::*;

#[test]
#[ignore = "explicit 1 GiB logical cache-pressure check; uses sparse test files"]
fn one_gib_cache_budget_is_enforced_and_released() {
    let counter = Arc::new(AtomicU64::new(0));
    let mut outputs = vec![];
    for _ in 0..4 {
        let work = Workdir::temporary(tempfile::tempdir().unwrap());
        let path = work.path().join("output");
        fs::File::create(&path)
            .unwrap()
            .set_len(FILE_BUDGET)
            .unwrap();
        let mut output = PendingOutput::capture(
            &work,
            &path,
            Path::new("large.md"),
            OutputFormat::Txt,
            String::new(),
        )
        .unwrap();
        output.reserve(counter.clone()).unwrap();
        outputs.push(output);
    }
    assert_eq!(counter.load(Ordering::SeqCst), TOTAL_BUDGET);
    let mut extra = sample();
    assert_eq!(extra.reserve(counter.clone()).unwrap_err(), FULL);
    drop(outputs.pop());
    extra.reserve(counter.clone()).unwrap();
    drop(outputs);
    drop(extra);
    assert_eq!(counter.load(Ordering::SeqCst), 0);
}
fn sample() -> PendingOutput {
    let work = Workdir::temporary(tempfile::tempdir().unwrap());
    let output = work.path().join("output");
    fs::write(&output, b"verified content").unwrap();
    PendingOutput::capture(
        &work,
        &output,
        Path::new("中文 [0].md"),
        OutputFormat::Txt,
        "Text only".into(),
    )
    .unwrap()
}
#[test]
fn retained_output_is_bounded_and_released_with_its_owner() {
    assert!(budget_allows(TOTAL_BUDGET - FILE_BUDGET, FILE_BUDGET));
    for (used, size) in [
        (TOTAL_BUDGET, 1),
        (u64::MAX, 1),
        (0, 0),
        (0, FILE_BUDGET + 1),
    ] {
        assert!(!budget_allows(used, size));
    }
    let pending = sample();
    let path = pending.test_path();
    assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    drop(pending);
    assert!(!path.exists());
}
#[test]
fn cache_reservation_stays_charged_until_last_output_owner_drops() {
    let counter = Arc::new(AtomicU64::new(TOTAL_BUDGET - 16));
    let mut pending = sample();
    pending.reserve(counter.clone()).unwrap();
    let pending = Arc::new(pending);
    let reader = pending.clone();
    assert_eq!(counter.load(Ordering::SeqCst), TOTAL_BUDGET);
    let mut other = sample();
    assert_eq!(other.reserve(counter.clone()).unwrap_err(), FULL);
    drop(pending);
    assert_eq!(counter.load(Ordering::SeqCst), TOTAL_BUDGET);
    let path = reader.test_path();
    drop(reader);
    assert!(!path.exists());
    assert_eq!(counter.load(Ordering::SeqCst), TOTAL_BUDGET - 16);
    other.reserve(counter.clone()).unwrap();
}
#[test]
fn cancelled_or_tampered_save_never_publishes_and_collisions_preserve_existing_files() {
    let pending = sample();
    let destination = tempfile::tempdir().unwrap();
    let existing = destination.path().join("中文 [0]-z8-1.txt");
    fs::write(&existing, b"existing").unwrap();
    let cancel = Cancel::default();
    cancel.cancel();
    assert_eq!(
        pending.save(destination.path(), &cancel).unwrap_err(),
        "Cancelled"
    );
    let result = pending
        .save(destination.path(), &Cancel::default())
        .unwrap();
    assert!(result.path.ends_with("-z8-2.txt"));
    assert_eq!(fs::read(&result.path).unwrap(), b"verified content");
    assert_eq!(fs::read(existing).unwrap(), b"existing");
    fs::write(pending.test_path(), b"tampered content").unwrap();
    assert_eq!(
        pending
            .save(destination.path(), &Cancel::default())
            .unwrap_err(),
        INVALID
    );
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 2);
    fs::remove_file(pending.test_path()).unwrap();
    assert_eq!(
        pending
            .save(destination.path(), &Cancel::default())
            .unwrap_err(),
        INVALID
    );
}

#[cfg(target_os = "linux")]
#[test]
fn saving_cached_output_across_filesystems_uses_target_volume_publication() {
    use std::os::unix::fs::MetadataExt;
    let pending = sample();
    let destination = tempfile::tempdir_in("/dev/shm").unwrap();
    assert_ne!(
        fs::metadata(pending.test_path()).unwrap().dev(),
        fs::metadata(destination.path()).unwrap().dev()
    );
    let result = pending
        .save(destination.path(), &Cancel::default())
        .unwrap();
    assert_eq!(fs::read(result.path).unwrap(), b"verified content");
}
