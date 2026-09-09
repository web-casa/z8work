//! A fresh process watches a private pipe. No Rust code runs between fork and exec.
//! Keeping the group leader unreaped also prevents signalling a recycled process-group ID.
use super::{Cancel, Duration, Instant};
use std::{
    io::{self, Read, Write},
    os::unix::process::CommandExt,
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
};

const ARG: &str = "--z8-process-watchdog";
const READY: &[u8] = b"\0Z8-watchdog-ready\0";

/// Call before GUI, single-instance registration, engine loading or CLI parsing.
/// The private mode accepts neither a target PID nor an executable path.
pub fn entry() {
    if std::env::args_os().len() == 2 && std::env::args_os().nth(1).is_some_and(|a| a == ARG) {
        serve();
    }
}

pub(super) fn serve() -> ! {
    // Never signal a caller's process group when someone invokes the private flag manually.
    // SAFETY: these libc calls have no pointer arguments and only inspect this process.
    if unsafe { libc::getpgrp() != libc::getpid() || libc::getpid() <= 1 } {
        std::process::exit(125);
    }
    let mut metadata = std::mem::MaybeUninit::<libc::stat>::uninit();
    // SAFETY: fstat initializes the structure on success; stdin must be the control pipe.
    if unsafe { libc::fstat(libc::STDIN_FILENO, metadata.as_mut_ptr()) } != 0 {
        std::process::exit(125);
    }
    let metadata = unsafe { metadata.assume_init() };
    if metadata.st_mode & libc::S_IFMT != libc::S_IFIFO {
        std::process::exit(125);
    }
    if io::stdout()
        .write_all(READY)
        .and_then(|_| io::stdout().flush())
        .is_ok()
    {
        let mut byte = [0];
        // EOF, protocol data or any non-interrupted error all mean "stop this group".
        loop {
            match io::stdin().read(&mut byte) {
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                _ => break,
            }
        }
    }
    // SAFETY: group 0 is our own group, which was validated above; no user-supplied PID.
    unsafe { libc::kill(0, libc::SIGKILL) };
    std::process::exit(125);
}

fn launcher() -> Result<Command, String> {
    #[cfg(test)]
    return Ok(super::tests::fixture("watchdog"));
    #[cfg(not(test))]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut command = Command::new(&exe);
        // A verifier invoked through the bundle's ELF loader sees that loader as current_exe.
        // Re-exec with the same package-local loader/library directory and absolute argv[0].
        // No PATH fallback or engine-supplied command is accepted.
        #[cfg(target_os = "linux")]
        if exe
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with("ld-linux-"))
        {
            let program = std::env::args_os()
                .next()
                .map(std::path::PathBuf::from)
                .filter(|p| p.is_absolute() && p.is_file())
                .ok_or("Loader invocation requires an absolute executable path")?;
            command
                .args([
                    std::ffi::OsStr::new("--inhibit-cache"),
                    std::ffi::OsStr::new("--library-path"),
                ])
                .arg(exe.parent().ok_or("Missing loader directory")?)
                .arg(program);
        }
        command.arg(ARG);
        Ok(command)
    }
}

pub(super) struct Watchdog {
    child: Child,
    stopped: bool,
}
impl Watchdog {
    pub(super) fn start(cancel: &Cancel, deadline: Instant) -> Result<Self, String> {
        Self::start_command(launcher()?, cancel, deadline)
    }
    fn start_command(
        mut command: Command,
        cancel: &Cancel,
        deadline: Instant,
    ) -> Result<Self, String> {
        cancel.check(deadline)?;
        let child = command
            .process_group(0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Process watchdog could not start: {e}"))?;
        let mut guard = Self {
            child,
            stopped: false,
        };
        let mut pipe = guard
            .child
            .stdout
            .take()
            .ok_or("Missing watchdog readiness pipe")?;
        let (send, receive) = mpsc::channel();
        thread::spawn(move || {
            // The Rust test harness prints a short prefix before running the private fixture.
            // Bound all handshake data; only the exact framed marker means ready.
            let mut bytes = Vec::with_capacity(1024);
            let mut byte = [0];
            while bytes.len() < 1024 && pipe.read_exact(&mut byte).is_ok() {
                bytes.push(byte[0]);
                if bytes.ends_with(READY) {
                    let _ = send.send(true);
                    return;
                }
            }
            let _ = send.send(false);
        });
        let ready_by = deadline.min(Instant::now() + Duration::from_secs(3));
        loop {
            cancel.check(ready_by)?;
            match receive.recv_timeout(Duration::from_millis(20)) {
                Ok(true) => return Ok(guard),
                Ok(false) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("Process watchdog did not become ready".into())
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        }
    }
    pub(super) fn group(&self) -> i32 {
        self.child.id() as i32
    }
    pub(super) fn stop(&mut self) {
        if self.stopped {
            return;
        }
        // Never try_wait/reap this child before sending the group signal. Even an exited
        // leader keeps its PID reserved until wait(), so it cannot refer to an unrelated group.
        // SAFETY: a successful spawn established a new group with this child's positive PID.
        unsafe { libc::kill(-self.group(), libc::SIGKILL) };
        self.child.stdin.take();
        let _ = self.child.wait();
        self.stopped = true;
    }
}
impl Drop for Watchdog {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_mode_refuses_the_callers_process_group() {
        let status = super::super::tests::fixture("watchdog")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(125));
    }
    #[test]
    fn private_mode_refuses_nonpipe_input_even_in_its_own_group() {
        let status = super::super::tests::fixture("watchdog")
            .process_group(0)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(125));
    }
    #[test]
    fn readiness_timeout_is_bounded() {
        let started = Instant::now();
        let result = Watchdog::start_command(
            super::super::tests::fixture("sleep"),
            &Cancel::default(),
            started + Duration::from_millis(100),
        );
        assert!(matches!(result, Err(e) if e == "Timed out"));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
    #[test]
    fn failed_watchdog_never_allows_engine_spawn() {
        let result = Watchdog::start_command(
            super::super::tests::fixture("failure"),
            &Cancel::default(),
            Instant::now() + Duration::from_secs(3),
        );
        assert!(matches!(result, Err(e) if e.contains("did not become ready")));
    }
}
