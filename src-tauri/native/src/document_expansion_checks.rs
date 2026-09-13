//! Bounded real-document checks through the production conversion path; no IPC.
use crate::{
    convert, hash_file,
    phase2_smoke::{command, name},
    Cancel, Engines, OutputFormat,
};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

const INPUTS: [&str; 5] = ["html", "htm", "rtf", "odt", "epub"];
// The listener replies if contacted, so a privacy regression fails promptly instead of hanging.
struct NetworkProbe {
    stop: Arc<AtomicBool>,
    hits: Arc<AtomicUsize>,
    worker: Option<thread::JoinHandle<()>>,
    address: String,
}
impl NetworkProbe {
    fn new() -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let address = listener
            .local_addr()
            .map_err(|e| e.to_string())?
            .to_string();
        let stop = Arc::new(AtomicBool::new(false));
        let hits = Arc::new(AtomicUsize::new(0));
        let (halt, count) = (stop.clone(), hits.clone());
        let worker = thread::spawn(move || {
            while !halt.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        count.fetch_add(1, Ordering::SeqCst);
                        let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                        let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\nConnection: close\r\n\r\nNETWORK_SECRET!");
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            stop,
            hits,
            worker: Some(worker),
            address,
        })
    }
}
impl Drop for NetworkProbe {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub fn verify(engines: &Engines) -> Result<Value, String> {
    verify_inner(engines, false)
}
// Dedicated host audit only. Installed Snap checks must not require network-bind.
pub fn verify_with_network(engines: &Engines) -> Result<Value, String> {
    verify_inner(engines, true)
}
fn verify_inner(engines: &Engines, network_probe: bool) -> Result<Value, String> {
    engines.verify_bundle()?;
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let out = root.path().join("output");
    fs::create_dir(&out).map_err(|e| e.to_string())?;
    let markdown = root.path().join("fixture.md");
    fs::write(&markdown, "# 第一章\n\n起点 Café Ελληνικά\n\n- 项目一\n- 项目二\n\n| 键 | 值 |\n|---|---|\n| 表格正文 | 单元格内容 |\n\n# 第二章\n\n终点 Z8_END\n").map_err(|e| e.to_string())?;
    let mut routes = Vec::new();
    let mut controls = Vec::new();
    for input in INPUTS {
        let path = root.path().join(format!("中文 空格.{input}"));
        let writer = if input == "htm" { "html" } else { input };
        command(
            engines,
            "pandoc",
            &[
                "--from",
                "markdown",
                "--to",
                writer,
                "--standalone",
                "--metadata",
                "title=Document fixture",
                "--output",
                name(&path),
                name(&markdown),
            ],
        )?;
        let before = hash_file(&path)?;
        let result = convert(engines, &path, &out, OutputFormat::Txt, &Cancel::default())?;
        let text = fs::read_to_string(&result.path).map_err(|e| e.to_string())?;
        let tokens = [
            "第一章",
            "起点",
            "Café",
            "Ελληνικά",
            "项目一",
            "项目二",
            "表格正文",
            "单元格内容",
            "第二章",
            "终点",
            "Z8_END",
        ];
        let mut cursor = 0;
        for token in tokens {
            let offset = text[cursor..]
                .find(token)
                .ok_or_else(|| format!("{input}: missing or reordered {token}: {text}"))?;
            cursor += offset + token.len();
        }
        if hash_file(&path)? != before {
            return Err("Document source changed".into());
        }
        let again = convert(engines, &path, &out, OutputFormat::Txt, &Cancel::default())?;
        if again.path == result.path
            || fs::read(&again.path).map_err(|e| e.to_string())? != text.as_bytes()
        {
            return Err("Document collision/retry changed output".into());
        }
        let cancelled = Cancel::default();
        cancelled.cancel();
        if convert(engines, &path, &out, OutputFormat::Txt, &cancelled)
            .err()
            .as_deref()
            != Some("Cancelled")
        {
            return Err("Document cancellation ignored".into());
        }
        routes.push(json!({"input":input,"output":"txt","utf8":true,"orderedText":true,"sourceUnchanged":true,"bytes":text.len()}));
        controls.push(json!({"input":input,"cancel":true,"collision":true}));
    }
    // Real ZIP readers must reject truncated archives without publishing output.
    for input in ["odt", "epub"] {
        let bad = root.path().join(format!("broken.{input}"));
        fs::write(&bad, b"PK\x03\x04truncated").map_err(|e| e.to_string())?;
        if convert(engines, &bad, &out, OutputFormat::Txt, &Cancel::default()).is_ok() {
            return Err(format!("Corrupt {input} accepted"));
        }
    }
    let probe = if network_probe {
        Some(NetworkProbe::new()?)
    } else {
        None
    };
    let address = probe
        .as_ref()
        .map(|p| p.address.as_str())
        .unwrap_or("127.0.0.1:9");
    let secret = root.path().join("secret.html");
    fs::write(&secret, "<p>LOCAL_SECRET_MARKER</p>").map_err(|e| e.to_string())?;
    let hostile = root.path().join("external.html");
    let file_url = format!(
        "file:///{}",
        name(&secret).replace('\\', "/").trim_start_matches('/')
    );
    fs::write(&hostile, format!(r#"<!doctype html><html><head><link rel="stylesheet" href="http://{0}/style.css"></head><body><p>SAFE_BODY</p><iframe src="http://{0}/iframe"></iframe><iframe src="{1}"></iframe><object data="{1}"></object><img src="http://{0}/image.png"><script src="http://{0}/script.js">SCRIPT_SECRET_MARKER</script></body></html>"#, address, file_url)).map_err(|e| e.to_string())?;
    let converted = convert(
        engines,
        &hostile,
        &out,
        OutputFormat::Txt,
        &Cancel::default(),
    )?;
    let text = fs::read_to_string(converted.path).map_err(|e| e.to_string())?;
    if !text.contains("SAFE_BODY")
        || [
            "LOCAL_SECRET_MARKER",
            "NETWORK_SECRET",
            "SCRIPT_SECRET_MARKER",
        ]
        .iter()
        .any(|s| text.contains(s))
        || probe
            .as_ref()
            .is_some_and(|p| p.hits.load(Ordering::SeqCst) != 0)
    {
        return Err(format!("HTML external resource isolation failed: {text}"));
    }
    Ok(
        json!({"schema":1,"scope":"document-input-expansion-3a","platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"engines":engines.info(),"routes":routes,"controls":controls,"corruptArchivesRejected":["odt","epub"],"resourceIsolation":{"network":if network_probe { json!({"status":"passed","httpRequests":0}) } else { json!({"status":"not-run"}) },"localFileOmitted":true,"scriptOmitted":true}}),
    )
}
