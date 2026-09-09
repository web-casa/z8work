use super::*;
fn no_engines() -> Engines {
    Engines {
        entries: Default::default(),
        unavailable: Default::default(),
        development: false,
        bundle: None,
    }
}
#[cfg(unix)]
#[test]
fn output_preflight_precedes_staging_and_engine_invocation() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("source.png");
    fs::write(&input, b"original input").unwrap();
    let output = root.path().join("output");
    fs::create_dir(&output).unwrap();
    let cache = root.path().join("cache");
    let store = crate::workspaces::Store::open(cache.clone()).unwrap();
    let stale = cache.join("session-Reclaim");
    fs::create_dir(&stale).unwrap();
    fs::set_permissions(&stale, fs::Permissions::from_mode(0o700)).unwrap();
    fs::write(stale.join("lease.json"), br#"{"schema":1,"kind":"z8-native-workspace","session":"session-Reclaim","orphaned_at_ms":0}"#).unwrap();
    fs::write(stale.join("input-copy"), b"reclaim before checking space").unwrap();
    let source = crate::queue::Source {
        file: fs::File::open(&input).unwrap(),
        name: input.clone(),
        context: ConversionContext {
            workspace: Some(store.clone()),
            ..Default::default()
        },
    };
    fs::set_permissions(&output, fs::Permissions::from_mode(0o500)).unwrap();
    let result = convert_source(
        &no_engines(),
        source,
        &output,
        OutputFormat::Png,
        &Cancel::default(),
    );
    fs::set_permissions(&output, fs::Permissions::from_mode(0o700)).unwrap();
    // An empty engine registry would fail differently if an engine were reached.
    assert!(result
        .unwrap_err()
        .starts_with("Cannot write to output folder:"));
    assert!(
        !stale.exists(),
        "eligible scratch should be reclaimed even when output preflight fails"
    );
    let session = fs::read_dir(cache).unwrap().next().unwrap().unwrap().path();
    assert_eq!(fs::read_dir(session).unwrap().count(), 1); // lease only, no staging
    assert_eq!(fs::read_dir(output).unwrap().count(), 0);
    assert_eq!(fs::read(input).unwrap(), b"original input");
}
#[cfg(unix)]
#[test]
fn publication_rechecks_permissions_and_preserves_previous_output() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("output");
    fs::create_dir(&directory).unwrap();
    crate::storage::prepare_output(&directory).unwrap();
    let encoded = root.path().join("encoded");
    fs::write(&encoded, b"validated bytes from encoder").unwrap();
    let previous = directory.join("source-z8-1.png");
    fs::write(&previous, b"previous result").unwrap();
    let engines = no_engines();
    let cancel = Cancel::default();
    let job = Job {
        engines: &engines,
        cwd: root.path(),
        cancel: &cancel,
        deadline: Instant::now() + Duration::from_secs(10),
    };
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o500)).unwrap();
    let failed = publish(
        &job,
        &encoded,
        &directory,
        Path::new("source.png"),
        OutputFormat::Png,
        None,
        1024,
    );
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    assert!(failed
        .unwrap_err()
        .starts_with("Cannot write to output folder:"));
    assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
    let saved = publish(
        &job,
        &encoded,
        &directory,
        Path::new("source.png"),
        OutputFormat::Png,
        None,
        1024,
    )
    .unwrap();
    assert!(saved.path.ends_with("source-z8-2.png"));
    assert_eq!(fs::read(previous).unwrap(), b"previous result");
    assert_eq!(fs::read(saved.path).unwrap(), fs::read(encoded).unwrap());
    assert_eq!(fs::read_dir(directory).unwrap().count(), 2);
}
