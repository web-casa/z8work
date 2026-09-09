//! Finite development-engine verification, never a release/package certificate.
use crate::{convert, hash_file, process::run, Cancel, Engines, OutputFormat};
use serde_json::{json, Value};
use std::{
    fs,
    path::Path,
    process::Command,
    time::{Duration, Instant},
};
fn fixture_pdf() -> Vec<u8> {
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 48] /Resources << >> /Contents 4 0 R >>",
        "<< /Length 26 >>\nstream\n1 0 0 rg 8 8 20 20 re f\n\n\n\nendstream",
    ];
    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = vec![0];
    for (i, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.push_str(&format!("{} 0 obj\n{object}\nendobj\n", i + 1));
    }
    let xref = pdf.len();
    pdf.push_str("xref\n0 5\n0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{offset:010} 00000 n \n"));
    }
    pdf.push_str(&format!(
        "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ));
    pdf.into_bytes()
}
pub fn verify(manifest: &Path) -> Result<Value, String> {
    let engines = Engines::load(manifest)?;
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = root.path().join("保存 outputs");
    fs::create_dir(&output).map_err(|e| e.to_string())?;
    let png = root.path().join("中文 [0] ; $ image.png");
    let audio = root.path().join("audio.mp3");
    let heic = root.path().join("10bit.heic");
    let md = root.path().join("document.md");
    let pdf = root.path().join("page.pdf");
    let bad = root.path().join("broken.png");
    for (path, bytes) in [
        (
            &png,
            include_bytes!("../../../tests/fixtures/cover.png").as_slice(),
        ),
        (
            &audio,
            include_bytes!("../../../tests/fixtures/cover.mp3").as_slice(),
        ),
        (
            &heic,
            include_bytes!("../../../tests/fixtures/gradient-10bit.heic").as_slice(),
        ),
        (
            &md,
            "# Z8.Work\n\n中文转换测试 **local text**.\n".as_bytes(),
        ),
        (&bad, b"not a png".as_slice()),
    ] {
        fs::write(path, bytes).map_err(|e| e.to_string())?;
    }
    fs::write(&pdf, fixture_pdf()).map_err(|e| e.to_string())?;
    let original_hash = hash_file(&png)?;
    let mut results = vec![];
    let cases = [
        (&png, OutputFormat::Webp),
        (&png, OutputFormat::Avif),
        (&png, OutputFormat::Jpeg),
        (&png, OutputFormat::Png),
        (&heic, OutputFormat::Png),
        (&audio, OutputFormat::Wav),
        (&md, OutputFormat::Txt),
        (&pdf, OutputFormat::Png),
        (&pdf, OutputFormat::Avif),
    ];
    for (input, format) in cases {
        let result = convert(&engines, input, &output, format, &Cancel::default())
            .map_err(|e| format!("{} → {format:?}: {e}", input.display()))?;
        if format == OutputFormat::Txt {
            let text = fs::read_to_string(&result.path).map_err(|e| e.to_string())?;
            if !text.contains("中文转换测试") || !text.contains("local text") {
                return Err("Text content was lost".into());
            }
        } else {
            let (ffmpeg, _) = engines.executable("ffmpeg")?;
            let mut command = Command::new(ffmpeg);
            command.args([
                "-nostdin",
                "-v",
                "error",
                "-xerror",
                "-i",
                &result.path,
                "-f",
                "null",
                "-",
            ]);
            run(
                command,
                &Cancel::default(),
                Instant::now() + Duration::from_secs(30),
            )?;
        }
        results.push(json!({"input": input.file_name().unwrap().to_string_lossy(), "output": format, "bytes": result.bytes, "decoded": true, "sha256": hash_file(Path::new(&result.path))? }));
    }
    let previous = output.join("中文 [0] ; $ image-z8-1.webp");
    let previous_hash = hash_file(&previous)?;
    let repeat = convert(
        &engines,
        &png,
        &output,
        OutputFormat::Webp,
        &Cancel::default(),
    )?;
    if !repeat.path.ends_with("-z8-2.webp")
        || hash_file(&previous)? != previous_hash
        || hash_file(&png)? != original_hash
    {
        return Err("Collision overwrote a file".into());
    }
    let count = fs::read_dir(&output).map_err(|e| e.to_string())?.count();
    if convert(
        &engines,
        &bad,
        &output,
        OutputFormat::Webp,
        &Cancel::default(),
    )
    .is_ok()
    {
        return Err("Corrupt image accepted".into());
    }
    let cancel = Cancel::default();
    cancel.cancel();
    if convert(&engines, &png, &output, OutputFormat::Avif, &cancel).unwrap_err() != "Cancelled" {
        return Err("Cancelled conversion ran".into());
    }
    if fs::read_dir(&output).map_err(|e| e.to_string())?.count() != count {
        return Err("Failed conversion left output or temporary files".into());
    }
    if convert(
        &engines,
        &md,
        &output,
        OutputFormat::Avif,
        &Cancel::default(),
    )
    .is_ok()
    {
        return Err("Unsupported route accepted".into());
    }
    let mut corrupt: Value =
        serde_json::from_slice(&fs::read(manifest).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    corrupt["engines"]["magick"]["sha256"] = json!("0".repeat(64));
    let wrong = root.path().join("wrong.json");
    fs::write(&wrong, serde_json::to_vec(&corrupt).unwrap()).map_err(|e| e.to_string())?;
    if !Engines::load(&wrong)
        .err()
        .unwrap_or_default()
        .contains("hash mismatch")
    {
        return Err("Engine hash mismatch accepted".into());
    }
    let queue_dir = root.path().join("queue-output");
    fs::create_dir(&queue_dir).map_err(|e| e.to_string())?;
    let queue_engines = engines.clone();
    let execute = std::sync::Arc::new(move |source, output: &Path, format, cancel: &Cancel| {
        crate::convert_source(&queue_engines, source, output, format, cancel)
    });
    let queue_path = root.path().join("queue.json");
    let queue = crate::queue::Queue::open(
        queue_path.clone(),
        execute.clone(),
        std::sync::Arc::new(|_| {}),
    )?;
    queue.register(vec![png.clone(), heic.clone(), pdf.clone()], None)?;
    let queue_state = queue.set_output(queue_dir.clone())?;
    let request = crate::queue::Submission {
        epoch: queue_state.epoch,
        request_id: uuid::Uuid::new_v4().to_string(),
        items: queue_state
            .tasks
            .iter()
            .map(|t| crate::queue::SubmissionItem {
                id: t.id.clone(),
                format: t.format,
                expected_attempt: t.attempt,
                options: t.options.clone(),
            })
            .collect(),
    };
    queue.submit(request.clone())?;
    let limit = Instant::now() + Duration::from_secs(180);
    loop {
        let state = queue.snapshot()?;
        if !state.processing {
            if !state
                .tasks
                .iter()
                .all(|t| t.phase == crate::queue::Phase::Saved)
            {
                return Err(format!("Native queue failed: {state:?}"));
            }
            break;
        }
        if Instant::now() >= limit {
            return Err("Native queue smoke timed out".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    queue.submit(request)?;
    let output_count = fs::read_dir(&queue_dir).map_err(|e| e.to_string())?.count();
    if output_count != 3 {
        return Err("Duplicate request encoded extra files".into());
    }
    drop(queue);
    let restored = crate::queue::Queue::open(queue_path, execute, std::sync::Arc::new(|_| {}))?;
    let restored_state = restored.snapshot()?;
    if restored_state.output_authorized
        || restored_state.processing
        || restored_state
            .tasks
            .iter()
            .any(|t| t.authorized || t.phase != crate::queue::Phase::Saved)
    {
        return Err("History restored authority or started work".into());
    }
    Ok(
        json!({"scope": "development engines, not a bundled installer", "platform": format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH), "engines": engines.info(), "cases": results, "queue": {"saved": 3, "duplicate_submission_no_extra_output": true, "history_restored_without_authorization": true}, "checks": {"collision_no_overwrite": true, "corrupt_input_cleanup": true, "cancelled_before_start": true, "unsupported_route_rejected": true, "binary_hash_mismatch_rejected": true}}),
    )
}
