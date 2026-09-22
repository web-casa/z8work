//! FFmpeg machine progress only; no logs, filenames or implied publication success.
use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Encoding,
    Validating,
    Publishing,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Progress {
    pub stage: Stage,
    pub percent: Option<u8>,
}
pub type Reporter = Arc<dyn Fn(Progress) + Send + Sync>;
pub(crate) struct Parser {
    line: Vec<u8>,
    overflow: bool,
    micros: Option<u64>,
    duration: Option<f64>,
    last: Option<Instant>,
    percent: u8,
    report: Reporter,
}
impl Parser {
    pub fn new(duration: Option<f64>, report: Reporter) -> Self {
        Self {
            line: vec![],
            overflow: false,
            micros: None,
            duration: duration.filter(|v| v.is_finite() && *v > 0.0),
            last: None,
            percent: 0,
            report,
        }
    }
    pub fn feed(&mut self, bytes: &[u8], now: Instant) {
        for &b in bytes {
            if b == b'\n' {
                if !self.overflow {
                    self.line(now);
                }
                self.line.clear();
                self.overflow = false;
            } else if self.line.len() < 256 {
                self.line.push(b);
            } else {
                self.overflow = true;
            }
        }
    }
    fn line(&mut self, now: Instant) {
        let Ok(line) = std::str::from_utf8(&self.line) else {
            return;
        };
        let line = line.trim_end_matches('\r');
        if let Some(value) = line.strip_prefix("out_time_us=") {
            self.micros = value.parse().ok();
        } else if matches!(line, "progress=continue" | "progress=end") {
            let percent = self.duration.and_then(|d| {
                self.micros
                    .map(|us| ((us as f64 / 1_000_000.0 / d * 100.0).clamp(0.0, 99.0)) as u8)
            });
            if let Some(p) = percent {
                self.percent = self.percent.max(p);
            }
            if self.last.is_none_or(|last| {
                now.saturating_duration_since(last) >= Duration::from_millis(250)
            }) {
                (self.report)(Progress {
                    stage: Stage::Encoding,
                    percent: percent.map(|_| self.percent),
                });
                self.last = Some(now);
            }
            self.micros = None;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    #[test]
    fn bounded_fragmented_monotonic_throttled_and_never_complete() {
        let seen = Arc::new(Mutex::new(vec![]));
        let sink = seen.clone();
        let mut p = Parser::new(Some(10.0), Arc::new(move |v| sink.lock().unwrap().push(v)));
        let now = Instant::now();
        p.feed(b"out_time_us=500", now);
        p.feed(b"0000\nprogress=continue\n", now);
        p.feed(
            b"out_time_us=1000000\nprogress=continue\n",
            now + Duration::from_millis(300),
        );
        p.feed(
            b"out_time_us=9000000\nprogress=continue\n",
            now + Duration::from_millis(301),
        );
        p.feed(&vec![b'x'; 100_000], now);
        assert!(p.line.len() <= 256);
        p.feed(
            b"\nout_time_us=999999999999\nprogress=end\n",
            now + Duration::from_secs(1),
        );
        let v = seen.lock().unwrap();
        assert_eq!(
            v.iter().map(|v| v.percent).collect::<Vec<_>>(),
            vec![Some(50), Some(50), Some(99)]
        );
    }
    #[test]
    fn unknown_duration_and_invalid_values_have_no_percentage() {
        let seen = Arc::new(Mutex::new(vec![]));
        let sink = seen.clone();
        let mut p = Parser::new(None, Arc::new(move |v| sink.lock().unwrap().push(v)));
        p.feed(b"out_time_us=-1\nprogress=end\n", Instant::now());
        assert_eq!(seen.lock().unwrap()[0].percent, None);
    }
}
