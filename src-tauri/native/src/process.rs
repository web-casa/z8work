#[cfg(unix)]
mod watchdog;
#[cfg(windows)]
mod windows_job;

/// Must run before initialization in every executable that uses native converters.
pub fn watchdog_entry() {
    #[cfg(unix)]
    watchdog::entry();
}

use process_wrap::std::{ChildWrapper, CommandWrap};
use std::{
    io::Read,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Default)]
pub struct Cancel(Arc<AtomicBool>);
impl Cancel {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn check(&self, deadline: Instant) -> Result<(), String> {
        self.check_cancelled()?;
        if Instant::now() >= deadline {
            Err("Timed out".into())
        } else {
            Ok(())
        }
    }
    pub(crate) fn check_cancelled(&self) -> Result<(), String> {
        if self.0.load(Ordering::SeqCst) {
            Err("Cancelled".into())
        } else {
            Ok(())
        }
    }
}
struct Guard {
    child: Box<dyn ChildWrapper>,
    #[cfg(unix)]
    watchdog: watchdog::Watchdog,
}
impl Guard {
    fn stop_tree(&mut self) {
        #[cfg(unix)]
        self.watchdog.stop();
        #[cfg(windows)]
        let _ = self.child.start_kill();
    }
}
impl Drop for Guard {
    fn drop(&mut self) {
        self.stop_tree();
        let _ = self.child.wait();
    }
}
fn drain(
    mut pipe: impl Read + Send + 'static,
    mut progress: Option<crate::progress::Parser>,
) -> mpsc::Receiver<Result<String, String>> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut tail = Vec::new();
        let mut buffer = [0; 4096];
        let result = loop {
            match pipe.read(&mut buffer) {
                Ok(0) => break Ok(String::from_utf8_lossy(&tail).into_owned()),
                Ok(n) => {
                    if let Some(parser) = &mut progress {
                        parser.feed(&buffer[..n], Instant::now());
                    }
                    tail.extend_from_slice(&buffer[..n]);
                    if tail.len() > 8192 {
                        tail.drain(..tail.len() - 8192);
                    }
                }
                Err(e) => break Err(e.to_string()),
            }
        };
        let _ = sender.send(result);
    });
    receiver
}
fn receive_output(
    receiver: &mpsc::Receiver<Result<String, String>>,
    cancel: &Cancel,
    deadline: Instant,
) -> Result<String, String> {
    loop {
        cancel.check(deadline)?;
        match receiver.recv_timeout(
            deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(20)),
        ) {
            Ok(result) => return result,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("Engine output reader stopped".into())
            }
        }
    }
}
pub(crate) fn run(command: Command, cancel: &Cancel, deadline: Instant) -> Result<String, String> {
    run_progress(command, cancel, deadline, None)
}
pub(crate) fn run_progress(
    command: Command,
    cancel: &Cancel,
    deadline: Instant,
    progress: Option<crate::progress::Parser>,
) -> Result<String, String> {
    cancel.check(deadline)?;
    let mut command = command;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    let watchdog = {
        use std::os::unix::process::CommandExt;
        let watchdog = watchdog::Watchdog::start(cancel, deadline)?;
        command.process_group(watchdog.group());
        watchdog
    };
    cancel.check(deadline)?;
    let mut wrapped = CommandWrap::from(command);
    #[cfg(windows)]
    {
        // Assign the close-on-owner-death job BEFORE JobObject resumes the suspended engine.
        wrapped.wrap(windows_job::LifetimeJob::new().map_err(|e| e.to_string())?);
        wrapped.wrap(process_wrap::std::JobObject);
        // CREATE_NO_WINDOW; the wrapper composes this with JobObject's suspended spawn.
        wrapped.wrap(process_wrap::std::CreationFlags(
            windows::Win32::System::Threading::CREATE_NO_WINDOW,
        ));
    }
    let mut child = Guard {
        child: wrapped
            .spawn()
            .map_err(|e| format!("Engine could not start: {e}"))?,
        #[cfg(unix)]
        watchdog,
    };
    let out = drain(
        child.child.stdout().take().ok_or("Missing stdout pipe")?,
        progress,
    );
    let err = drain(
        child.child.stderr().take().ok_or("Missing stderr pipe")?,
        None,
    );
    let status = loop {
        cancel.check(deadline)?;
        if let Some(status) = child.child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        thread::sleep(Duration::from_millis(20));
    };
    // Also stop descendants that retained a pipe after their parent exited.
    child.stop_tree();
    // Both pipes share one budget, and cancellation remains observable while draining.
    let drain_deadline = deadline.min(Instant::now() + Duration::from_secs(2));
    let stdout = receive_output(&out, cancel, drain_deadline)?;
    let stderr = receive_output(&err, cancel, drain_deadline)?;
    cancel.check(deadline)?;
    if !status.success() {
        return Err(format!("Engine exited {status}: {stderr}"));
    }
    Ok(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;
    pub(super) fn fixture(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--ignored",
                "--exact",
                "process::tests::fixture_child",
                "--nocapture",
            ])
            .env("Z8_TEST_PROCESS_MODE", mode);
        command
    }
    #[test]
    #[ignore = "subprocess fixture, invoked by the supervisor tests"]
    fn fixture_child() {
        match std::env::var("Z8_TEST_PROCESS_MODE").unwrap().as_str() {
            #[cfg(unix)]
            "watchdog" => super::watchdog::serve(),
            "logs" => {
                for _ in 0..8000 {
                    println!("abcdefghijklmnopqrstuvwxyz");
                    eprintln!("abcdefghijklmnopqrstuvwxyz");
                }
            }
            "failure" => {
                eprintln!("broken");
                std::process::exit(4);
            }
            "sleep" => thread::sleep(Duration::from_secs(30)),
            "supervisor" => {
                let _ = run(
                    fixture("tree"),
                    &Cancel::default(),
                    Instant::now() + Duration::from_secs(20),
                );
            }
            "tree" => {
                let mut child = fixture("descendant").spawn().unwrap();
                child.wait().unwrap();
            }
            "leave-tree" => {
                // This fixture intentionally outlives its immediate parent to test tree cleanup.
                #[allow(clippy::zombie_processes)]
                let _child = fixture("descendant").spawn().unwrap();
                let marker = std::path::PathBuf::from(std::env::var_os("Z8_TEST_MARKER").unwrap());
                let limit = Instant::now() + Duration::from_secs(5);
                while !marker.with_extension("ready").exists() && Instant::now() < limit {
                    thread::sleep(Duration::from_millis(10));
                }
                assert!(marker.with_extension("ready").exists());
                // Intentionally leave an inherited-pipe descendant for the supervisor to stop.
            }
            "descendant" => {
                let marker = std::path::PathBuf::from(std::env::var_os("Z8_TEST_MARKER").unwrap());
                std::fs::write(marker.with_extension("ready"), b"started").unwrap();
                thread::sleep(Duration::from_secs(2));
                std::fs::write(marker, b"leaked process").unwrap();
            }
            _ => panic!("unknown fixture mode"),
        }
    }

    #[test]
    fn abrupt_parent_exit_stops_descendants() {
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("orphan");
        let mut supervisor = fixture("supervisor")
            .env("Z8_TEST_MARKER", &marker)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !marker.with_extension("ready").exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        supervisor.kill().unwrap(); // SIGKILL / TerminateProcess: no Rust Drop runs.
        supervisor.wait().unwrap();
        assert!(
            marker.with_extension("ready").exists(),
            "descendant never started"
        );
        thread::sleep(Duration::from_millis(2300));
        assert!(
            !marker.exists(),
            "conversion descendant survived abrupt application exit"
        );
    }
    #[test]
    fn successful_parent_cannot_leave_pipe_holding_descendants() {
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("leak");
        let mut command = fixture("leave-tree");
        command.env("Z8_TEST_MARKER", &marker);
        run(
            command,
            &Cancel::default(),
            Instant::now() + Duration::from_secs(10),
        )
        .unwrap();
        assert!(marker.with_extension("ready").exists());
        thread::sleep(Duration::from_millis(2300));
        assert!(!marker.exists());
    }
    #[test]
    fn cancelled_or_expired_work_never_starts() {
        let cancel = Cancel::default();
        cancel.cancel();
        assert_eq!(
            run(
                fixture("failure"),
                &cancel,
                Instant::now() + Duration::from_secs(5)
            )
            .unwrap_err(),
            "Cancelled"
        );
        assert_eq!(
            run(fixture("failure"), &Cancel::default(), Instant::now()).unwrap_err(),
            "Timed out"
        );
    }
    #[test]
    fn output_wait_observes_cancellation_and_one_deadline() {
        let (_sender, receiver) = mpsc::channel();
        let cancel = Cancel::default();
        let other = cancel.clone();
        let started = Instant::now();
        let thread = thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            other.cancel();
        });
        assert_eq!(
            receive_output(&receiver, &cancel, started + Duration::from_secs(5)).unwrap_err(),
            "Cancelled"
        );
        thread.join().unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(
            receive_output(
                &receiver,
                &Cancel::default(),
                Instant::now() + Duration::from_millis(30)
            )
            .unwrap_err(),
            "Timed out"
        );
    }
    #[test]
    fn drains_both_pipes_with_bounded_memory() {
        let output = run(
            fixture("logs"),
            &Cancel::default(),
            Instant::now() + Duration::from_secs(10),
        )
        .unwrap();
        assert_eq!(output.len(), 8192);
    }
    #[test]
    fn failure_is_observable() {
        assert!(run(
            fixture("failure"),
            &Cancel::default(),
            Instant::now() + Duration::from_secs(5)
        )
        .unwrap_err()
        .contains("broken"));
    }
    #[test]
    fn deadline_is_total_and_kills_descendants() {
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("should-not-exist");
        let mut cmd = fixture("tree");
        cmd.env("Z8_TEST_MARKER", &marker);
        assert_eq!(
            run(
                cmd,
                &Cancel::default(),
                Instant::now() + Duration::from_secs(1)
            )
            .unwrap_err(),
            "Timed out"
        );
        assert!(
            marker.with_extension("ready").exists(),
            "descendant must have actually started"
        );
        thread::sleep(Duration::from_millis(1500));
        assert!(!marker.exists());
    }
    #[test]
    fn cancellation_stops_a_running_process() {
        let cancel = Cancel::default();
        let other = cancel.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            other.cancel();
        });
        let started = Instant::now();
        assert_eq!(
            run(fixture("sleep"), &cancel, started + Duration::from_secs(10)).unwrap_err(),
            "Cancelled"
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
