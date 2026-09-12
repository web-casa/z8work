use super::*;
mod media;
const INPUT_LIMIT: u64 = 32 * 1024 * 1024;
const OUTPUT_LIMIT: u64 = 512 * 1024;
const SIDE: u32 = 256;

pub(crate) fn preview(
    engines: &Engines,
    source: crate::queue::Source,
    cancel: &Cancel,
) -> Result<Vec<u8>, String> {
    let deadline = Instant::now() + Duration::from_secs(15);
    cancel.check(deadline)?;
    let ext = source
        .name
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if media_demuxer(&ext).is_none()
        && !matches!(
            ext.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "avif" | "heic" | "heif" | "pdf"
        )
    {
        return Err("Preview is available for image, PDF and media inputs only".into());
    }
    let mut input = source.file;
    let before = input.metadata().map_err(|e| e.to_string())?;
    if !before.is_file() || before.len() > INPUT_LIMIT {
        return Err("Preview input limit is 32 MiB; conversion remains available".into());
    }
    engines.verify_bundle()?;
    let work = match &source.context.workspace {
        Some(store) => store.create()?,
        None => {
            crate::workspaces::Workdir::temporary(tempfile::tempdir().map_err(|e| e.to_string())?)
        }
    };
    crate::storage::ensure(work.path(), before.len(), crate::storage::Area::Workspace)?;
    let policy = POLICY
        .replace("256MiB", "64MiB")
        .replace("512MiB", "128MiB")
        .replace("16000", "8000")
        .replace("value=\"2\"", "value=\"1\"")
        .replace("value=\"90\"", "value=\"15\"");
    fs::write(work.path().join("policy.xml"), policy).map_err(|e| e.to_string())?;
    let staged = work.path().join(format!("input.{ext}"));
    let mut dest = fs::File::create(&staged).map_err(|e| e.to_string())?;
    let mut buffer = [0; 65536];
    let mut copied = 0u64;
    loop {
        cancel.check(deadline)?;
        let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        copied += n as u64;
        if copied > INPUT_LIMIT {
            return Err("Preview input exceeds 32 MiB".into());
        }
        dest.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
    drop(dest);
    let after = input.metadata().map_err(|e| e.to_string())?;
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
        return Err("Input changed while previewing; select it again".into());
    }
    let job = Job {
        engines,
        cwd: work.path(),
        cancel,
        deadline,
    };
    let output = work.path().join("preview.png");
    if ext == "pdf" {
        // MuPDF also opens non-PDF documents. Do not accept those via a renamed input.
        let mut header = [0; 5];
        fs::File::open(&staged)
            .and_then(|mut file| file.read_exact(&mut header))
            .map_err(|_| "PDF preview requires a PDF header".to_string())?;
        if &header != b"%PDF-" {
            return Err("PDF preview requires a PDF header".into());
        }
        // Explicit page 1: the default renders every page. This budget is independent
        // of full conversion, and does not need an unbounded page-count preflight.
        job.run(
            "mutool",
            &[
                text("draw"),
                text("-q"),
                text("-L"),
                text("-D"),
                text("-m"),
                text("67108864"),
                text("-F"),
                text("png"),
                text("-c"),
                text("rgba"),
                text("-r"),
                text("72"),
                text("-w"),
                text("256"),
                text("-h"),
                text("256"),
                text("-o"),
                job.work_file(&output)?,
                job.work_file(&staged)?,
                text("1"),
            ],
        )?;
    } else if media_demuxer(&ext).is_some() {
        media::render(&job, &staged, &output, &ext)?;
    } else {
        job.run(
            "magick",
            &[
                text("-limit"),
                text("thread"),
                text("1"),
                coder_path(input_coder(&ext), &staged, true),
                text("-auto-orient"),
                text("-thumbnail"),
                text("256x256>"),
                text("-colorspace"),
                text("sRGB"),
                text("-strip"),
                text("-depth"),
                text("8"),
                text("-define"),
                text("png:color-type=6"),
                coder_path("PNG", &output, false),
            ],
        )?;
    }
    let mut bytes = Vec::new();
    fs::File::open(&output)
        .map_err(|e| e.to_string())?
        .take(OUTPUT_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    validate(&bytes)?;
    cancel.check(deadline)?;
    Ok(bytes)
}
fn validate(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 33
        || bytes.len() as u64 > OUTPUT_LIMIT
        || &bytes[..8] != b"\x89PNG\r\n\x1a\n"
        || &bytes[12..16] != b"IHDR"
    {
        return Err("Invalid or oversized preview output".into());
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if !(1..=SIDE).contains(&width) || !(1..=SIDE).contains(&height) {
        return Err("Preview dimensions exceed the display budget".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_gate_rejects_other_payloads_and_large_dimensions() {
        let mut png = vec![0; 33];
        png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        png[12..16].copy_from_slice(b"IHDR");
        png[16..20].copy_from_slice(&256u32.to_be_bytes());
        png[20..24].copy_from_slice(&1u32.to_be_bytes());
        assert!(validate(&png).is_ok());
        png[16..20].copy_from_slice(&257u32.to_be_bytes());
        assert!(validate(&png).is_err());
        assert!(validate(b"<svg/>").is_err());
        assert!(validate(&vec![0; OUTPUT_LIMIT as usize + 1]).is_err());
    }
}
