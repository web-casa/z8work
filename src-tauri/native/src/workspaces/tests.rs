use super::*;
use std::{
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

fn orphan(root: &Path, observed: Option<u64>) -> PathBuf {
    let dir = private_builder("session-").tempdir_in(root).unwrap().keep();
    let mut lease = fs::File::create(dir.join("lease.json")).unwrap();
    write_marker(
        &mut lease,
        &Marker {
            schema: 1,
            kind: "z8-native-workspace".into(),
            session: dir.file_name().unwrap().to_string_lossy().into(),
            orphaned_at_ms: observed,
        },
    )
    .unwrap();
    fs::create_dir(dir.join("job-test")).unwrap();
    fs::write(dir.join("job-test/input.png"), b"private input copy").unwrap();
    dir
}
#[test]
fn workdir_retains_session_and_cleans_after_last_owner() {
    let root = private_builder("test-").tempdir().unwrap();
    let store = Store::open(root.path().join("work")).unwrap();
    let session = store.session.path().to_owned();
    let job = store.create().unwrap();
    let job_path = job.path().to_owned();
    fs::write(job.path().join("input"), b"copy").unwrap();
    drop(store);
    assert!(job_path.exists());
    assert_eq!(
        cleanup(session.parent().unwrap(), u64::MAX).unwrap().active,
        1
    );
    drop(job);
    assert!(!job_path.exists());
    assert!(!session.exists());
}
#[test]
fn active_session_is_preserved_by_another_store() {
    let root = private_builder("test-").tempdir().unwrap();
    let a = Store::open(root.path().join("work")).unwrap();
    let b = Store::open(root.path().join("work")).unwrap();
    assert_eq!(b.report().unwrap().active, 1);
    let job = a.create().unwrap();
    assert!(job.path().exists());
    assert_eq!(a.report().unwrap().active, 2);
}
#[test]
fn requires_two_observations_and_clock_rollback_delays_cleanup() {
    let root = private_builder("test-").tempdir().unwrap();
    let dir = orphan(root.path(), None);
    assert_eq!(cleanup(root.path(), 100_000).unwrap().deferred, 1);
    assert_eq!(cleanup(root.path(), 1).unwrap().deferred, 1);
    assert_eq!(cleanup(root.path(), 159_999).unwrap().deferred, 1);
    assert!(dir.exists());
    assert_eq!(cleanup(root.path(), 160_000).unwrap().removed, 1);
    assert!(!dir.exists());
}
#[test]
fn unknown_or_corrupt_markers_are_never_removed() {
    let root = private_builder("test-").tempdir().unwrap();
    for bytes in [
        b"broken".to_vec(),
        vec![b' '; 1025],
        br#"{"schema":2,"kind":"z8-native-workspace","session":"wrong","orphaned_at_ms":0}"#
            .to_vec(),
    ] {
        let dir = orphan(root.path(), Some(0));
        fs::write(dir.join("lease.json"), bytes).unwrap();
    }
    fs::create_dir(root.path().join("other-app")).unwrap();
    let report = cleanup(root.path(), GRACE_MS).unwrap();
    assert_eq!(report.unrecognized, 4);
    assert_eq!(report.removed, 0);
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 4);
}
#[test]
fn scan_is_bounded() {
    let root = private_builder("test-").tempdir().unwrap();
    for i in 0..SCAN_LIMIT + 2 {
        fs::write(root.path().join(i.to_string()), b"unknown").unwrap();
    }
    let report = cleanup(root.path(), GRACE_MS).unwrap();
    assert!(report.limited);
    assert_eq!(report.unrecognized as usize, SCAN_LIMIT);
}
#[cfg(unix)]
#[test]
fn links_and_external_hardlinked_markers_are_preserved() {
    use std::os::unix::fs::symlink;
    let root = private_builder("test-").tempdir().unwrap();
    let outside = private_builder("test-").tempdir().unwrap();
    let sentinel = outside.path().join("original");
    fs::write(&sentinel, b"never delete or modify").unwrap();
    symlink(outside.path(), root.path().join("session-Linked")).unwrap();
    let linked_marker = orphan(root.path(), Some(0));
    fs::remove_file(linked_marker.join("lease.json")).unwrap();
    symlink(&sentinel, linked_marker.join("lease.json")).unwrap();
    let hardlinked = orphan(root.path(), Some(0));
    fs::hard_link(
        hardlinked.join("lease.json"),
        outside.path().join("lease-copy"),
    )
    .unwrap();
    let owned = orphan(root.path(), Some(0));
    symlink(outside.path(), owned.join("job-test/outside")).unwrap();
    let report = cleanup(root.path(), GRACE_MS).unwrap();
    assert_eq!(report.unrecognized, 3);
    assert_eq!(report.removed, 1);
    assert!(linked_marker.exists() && hardlinked.exists());
    assert_eq!(fs::read(&sentinel).unwrap(), b"never delete or modify");
}
#[cfg(unix)]
#[test]
fn unsafe_root_is_rejected_without_changing_permissions() {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let root = private_builder("test-").tempdir().unwrap();
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o755)).unwrap();
    assert!(Store::open(root.path().to_owned()).is_err());
    assert_eq!(
        fs::metadata(root.path()).unwrap().permissions().mode() & 0o777,
        0o755
    );
    let parent = private_builder("test-").tempdir().unwrap();
    symlink(root.path(), parent.path().join("link")).unwrap();
    assert!(Store::open(parent.path().join("link")).is_err());
}
#[test]
#[ignore = "subprocess fixture invoked by abrupt_exit_releases_lease"]
fn crash_fixture() {
    let root = PathBuf::from(std::env::var_os("Z8_TEST_WORKSPACE_ROOT").unwrap());
    let store = Store::open(root.join("work")).unwrap();
    let job = store.create().unwrap();
    fs::write(job.path().join("input"), b"private input copy").unwrap();
    fs::write(
        root.join("ready"),
        store.session.path().to_string_lossy().as_bytes(),
    )
    .unwrap();
    thread::sleep(Duration::from_secs(30));
}
#[test]
fn abrupt_exit_releases_lease_and_cleanup_removes_only_owned_scratch() {
    let root = private_builder("test-").tempdir().unwrap();
    fs::write(root.path().join("saved.png"), b"saved result").unwrap();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--ignored",
            "--exact",
            "workspaces::tests::crash_fixture",
            "--nocapture",
        ])
        .env("Z8_TEST_WORKSPACE_ROOT", root.path())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let end = Instant::now() + Duration::from_secs(5);
    while !root.path().join("ready").exists() && Instant::now() < end {
        thread::sleep(Duration::from_millis(10));
    }
    let ready = root.path().join("ready").exists();
    let active = if ready {
        cleanup(&root.path().join("work"), GRACE_MS).unwrap().active
    } else {
        0
    };
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(ready, "workspace fixture never started");
    assert_eq!(active, 1);
    let session = PathBuf::from(fs::read_to_string(root.path().join("ready")).unwrap());
    assert!(session.exists(), "hard exit must leave scratch behind");
    assert_eq!(
        cleanup(&root.path().join("work"), GRACE_MS)
            .unwrap()
            .deferred,
        1
    );
    assert_eq!(
        cleanup(&root.path().join("work"), GRACE_MS * 2)
            .unwrap()
            .removed,
        1
    );
    assert!(!session.exists());
    assert_eq!(
        fs::read(root.path().join("saved.png")).unwrap(),
        b"saved result"
    );
}

#[cfg(unix)]
#[test]
fn partial_deletion_failure_retains_marker_for_retry() {
    use std::os::unix::fs::PermissionsExt;
    let root = private_builder("test-").tempdir().unwrap();
    let dir = orphan(root.path(), Some(0));
    fs::set_permissions(dir.join("job-test"), fs::Permissions::from_mode(0o500)).unwrap();
    assert_eq!(cleanup(root.path(), GRACE_MS).unwrap().failed, 1);
    assert!(dir.join("lease.json").is_file());
    fs::set_permissions(dir.join("job-test"), fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(cleanup(root.path(), GRACE_MS).unwrap().removed, 1);
}
#[cfg(unix)]
#[test]
fn normal_drop_failure_also_retains_ownership_marker() {
    use std::os::unix::fs::PermissionsExt;
    let root = private_builder("test-").tempdir().unwrap();
    let store = Store::open(root.path().join("work")).unwrap();
    let session = store.session.path().to_owned();
    let job = store.create().unwrap();
    let job_path = job.path().to_owned();
    fs::write(job.path().join("input"), b"copy").unwrap();
    fs::set_permissions(job.path(), fs::Permissions::from_mode(0o500)).unwrap();
    drop(job);
    drop(store);
    assert!(session.join("lease.json").is_file());
    fs::set_permissions(job_path, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(cleanup(&root.path().join("work"), 0).unwrap().deferred, 1);
    assert_eq!(
        cleanup(&root.path().join("work"), GRACE_MS)
            .unwrap()
            .removed,
        1
    );
}
