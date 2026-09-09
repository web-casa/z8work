use crate::{Cancel, Engines};
mod preview;
#[cfg(all(test, unix))]
mod storage_tests;
pub(crate) use preview::preview;
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::Path,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Png,
    Jpeg,
    Webp,
    Avif,
    Wav,
    Mp3,
    Flac,
    Opus,
    M4a,
    Txt,
}
impl OutputFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
            Self::Avif => "avif",
            Self::Wav => "wav",
            Self::Mp3 => "mp3",
            Self::Flac => "flac",
            Self::Opus => "opus",
            Self::M4a => "m4a",
            Self::Txt => "txt",
        }
    }
    fn coder(self) -> &'static str {
        match self {
            Self::Jpeg => "JPEG",
            Self::Png => "PNG",
            Self::Webp => "WEBP",
            Self::Avif => "AVIF",
            _ => "",
        }
    }
}
pub fn output_formats(extension: &str) -> Vec<OutputFormat> {
    use OutputFormat::*;
    match extension.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "avif" | "heic" | "heif" | "pdf" => {
            vec![Png, Jpeg, Webp, Avif]
        }
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "opus" | "mp4" | "mov" | "mkv" | "webm" => {
            vec![Wav, Mp3, Flac, Opus, M4a]
        }
        "md" | "docx" => vec![Txt],
        _ => vec![],
    }
}
#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct ConversionResult {
    pub path: String,
    pub bytes: u64,
    pub note: String,
    #[serde(default)]
    pub files: Vec<SavedFile>,
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default = "default_total")]
    pub total: u32,
    #[serde(default = "default_complete")]
    pub complete: bool,
}
impl Default for ConversionResult {
    fn default() -> Self {
        Self {
            path: String::new(),
            bytes: 0,
            note: String::new(),
            files: vec![],
            fingerprint: String::new(),
            total: 1,
            complete: true,
        }
    }
}
fn default_total() -> u32 {
    1
}
fn default_complete() -> bool {
    true
}
#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct SavedFile {
    pub path: String,
    pub bytes: u64,
    pub page: u32,
    pub sha256: String,
}
pub type Reporter = std::sync::Arc<dyn Fn(ConversionResult) -> Result<(), String> + Send + Sync>;
pub type Retainer =
    std::sync::Arc<dyn Fn(crate::PendingOutput) -> Result<(), String> + Send + Sync>;
#[derive(Default)]
pub struct ConversionContext {
    pub progress: Option<crate::progress::Reporter>,
    pub retain: Option<Retainer>,
    pub workspace: Option<std::sync::Arc<crate::workspaces::Store>>,
    pub options: crate::Options,
    pub resume: Option<ConversionResult>,
    pub report: Option<Reporter>,
}
fn text(value: &str) -> OsString {
    OsString::from(value)
}
fn coder_path(coder: &str, path: &Path, first_frame: bool) -> OsString {
    let mut value = OsString::from(format!("{coder}:"));
    value.push(path);
    if first_frame {
        value.push("[0]");
    }
    value
}
struct Job<'a> {
    engines: &'a Engines,
    cwd: &'a Path,
    cancel: &'a Cancel,
    deadline: Instant,
}
impl Job<'_> {
    fn run(&self, engine: &str, args: &[OsString]) -> Result<String, String> {
        self.run_progress(engine, args, None)
    }
    fn run_progress(
        &self,
        engine: &str,
        args: &[OsString],
        progress: Option<crate::progress::Parser>,
    ) -> Result<String, String> {
        self.cancel.check(self.deadline)?;
        let mut cmd = self.engines.command(engine)?;
        if engine == "pandoc" {
            if let Some(data) = self.engines.data_dir(engine) {
                cmd.arg("--data-dir").arg(data);
            }
        }
        cmd.args(args).current_dir(self.cwd).env_clear();
        // Essential Windows loader variables only. No inherited PATH / loader / engine config.
        for key in ["SystemRoot", "WINDIR"] {
            if let Some(value) = std::env::var_os(key) {
                cmd.env(key, value);
            }
        }
        cmd.env("HOME", self.cwd)
            .env("USERPROFILE", self.cwd)
            .env("TMPDIR", self.cwd)
            .env("TMP", self.cwd)
            .env("TEMP", self.cwd)
            .env("LANG", "C.UTF-8")
            .env("OMP_NUM_THREADS", "2")
            .env("MAGICK_CONFIGURE_PATH", self.cwd)
            .env("MAGICK_TEMPORARY_PATH", self.cwd);
        self.engines.configure_command(&mut cmd, engine)?;
        crate::process::run_progress(
            cmd,
            self.cancel,
            self.deadline.min(Instant::now() + Duration::from_secs(120)),
            progress,
        )
    }
}
const POLICY: &str = r#"<policymap>
<policy domain="delegate" rights="none" pattern="*"/>
<policy domain="filter" rights="none" pattern="*"/>
<policy domain="path" rights="none" pattern="@*"/>
<policy domain="coder" rights="none" pattern="*"/>
<policy domain="coder" rights="read|write" pattern="{PNG,JPEG,WEBP,AVIF,HEIC}"/>
<policy domain="resource" name="memory" value="256MiB"/>
<policy domain="resource" name="map" value="256MiB"/>
<policy domain="resource" name="disk" value="512MiB"/>
<policy domain="resource" name="width" value="16000"/>
<policy domain="resource" name="height" value="16000"/>
<policy domain="resource" name="thread" value="2"/>
<policy domain="resource" name="time" value="90"/>
</policymap>"#;

pub fn convert(
    engines: &Engines,
    input: &Path,
    directory: &Path,
    format: OutputFormat,
    cancel: &Cancel,
) -> Result<ConversionResult, String> {
    let path = input.canonicalize().map_err(|e| e.to_string())?;
    let file = crate::input::open_regular(&path).map_err(|e| e.to_string())?;
    convert_source(
        engines,
        crate::queue::Source {
            file,
            name: path,
            context: ConversionContext::default(),
        },
        directory,
        format,
        cancel,
    )
}

pub fn convert_source(
    engines: &Engines,
    source: crate::queue::Source,
    directory: &Path,
    format: OutputFormat,
    cancel: &Cancel,
) -> Result<ConversionResult, String> {
    let deadline = Instant::now()
        + Duration::from_secs(
            if source
                .name
                .extension()
                .and_then(|v| v.to_str())
                .is_some_and(|s| s.eq_ignore_ascii_case("pdf"))
            {
                900
            } else {
                120
            },
        );
    cancel.check(deadline)?;
    source.context.options.validate()?;
    let context = source.context;
    let input = source.name;
    let mut source = source.file;
    let initial_metadata = source.metadata().map_err(|e| e.to_string())?;
    let directory = directory.canonicalize().map_err(|e| e.to_string())?;
    if !initial_metadata.is_file() || !directory.is_dir() {
        return Err("Select a regular input file and an output directory".into());
    }
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !output_formats(&ext).contains(&format) {
        return Err("Unsupported conversion in this M0 prototype".into());
    }
    if ext == "pdf" && initial_metadata.len() > 100 * 1024 * 1024 {
        return Err("PDF input limit is 100 MiB".into());
    }
    // A private work directory avoids passing user-controlled engine filename syntax.
    let work = match &context.workspace {
        Some(store) => store.create()?,
        None => crate::workspaces::Workdir::temporary(
            tempfile::tempdir_in(&directory).map_err(crate::failure::output_io)?,
        ),
    };
    // Reclaim eligible managed scratch before checking either volume.
    crate::storage::prepare_output(&directory)?;
    crate::storage::ensure(
        work.path(),
        initial_metadata.len(),
        crate::storage::Area::Workspace,
    )?;
    engines.verify_bundle()?;
    fs::write(work.path().join("policy.xml"), POLICY).map_err(|e| e.to_string())?;
    let staged = work.path().join(format!("input.{ext}"));
    if !source.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Input is not a regular file".into());
    }
    let mut dest = fs::File::create(&staged).map_err(|e| e.to_string())?;
    let mut buffer = [0; 65536];
    let mut copied = 0u64;
    loop {
        cancel.check(deadline)?;
        let n = source.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        copied += n as u64;
        if copied > 512 * 1024 * 1024 {
            return Err("M0 input limit is 512 MiB".into());
        }
        dest.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
    let final_metadata = source.metadata().map_err(|e| e.to_string())?;
    if initial_metadata.len() != final_metadata.len()
        || initial_metadata.modified().ok() != final_metadata.modified().ok()
    {
        return Err("Input changed while being read; select it again".into());
    }
    drop(dest);
    let job = Job {
        engines,
        cwd: work.path(),
        cancel,
        deadline,
    };
    if ext == "pdf" {
        return convert_pdf(&job, &staged, &input, &directory, format, &context);
    }
    let output = work.path().join(format!("output.{}", format.extension()));
    let note = match format {
        OutputFormat::Wav
        | OutputFormat::Mp3
        | OutputFormat::Flac
        | OutputFormat::Opus
        | OutputFormat::M4a => {
            encode_audio(&job, &staged, &output, format, context.progress.clone())?;
            "First audio track only. WAV uses PCM 16-bit; MP3/AAC/Opus are lossy. Metadata is removed.".to_string()
        }
        OutputFormat::Txt => {
            job.run(
                "pandoc",
                &[
                    text("--sandbox"),
                    text("--from"),
                    text(if ext == "docx" { "docx" } else { "markdown" }),
                    text("--to"),
                    text("plain"),
                    text("--output"),
                    output.clone().into_os_string(),
                    staged.clone().into_os_string(),
                ],
            )?;
            fs::read_to_string(&output).map_err(|_| "Document output is not valid UTF-8")?;
            "Text only; images, layout and formatting are omitted.".to_string()
        }
        _ => {
            encode_image(
                &job,
                &staged,
                input_coder(&ext),
                &output,
                format,
                &context.options,
            )?;
            "First frame only. JPEG uses a white background; PNG preserves pixels. EXIF/XMP/IPTC are optional; ICC is retained. Output may be larger.".to_string()
        }
    };
    if let Some(report) = &context.progress {
        report(crate::progress::Progress {
            stage: crate::progress::Stage::Publishing,
            percent: None,
        });
    }
    let saved = publish(
        &job,
        &output,
        &directory,
        &input,
        format,
        None,
        256 * 1024 * 1024,
    );
    let saved = match saved {
        Ok(saved) => saved,
        Err(error) => {
            if let Some(retain) = &context.retain {
                let cached = crate::PendingOutput::capture(&work, &output, &input, format, note);
                if let Err(cache_error) = cached.and_then(|cached| retain(cached)) {
                    return Err(format!(
                        "{error}; Could not retain encoded result; convert again: {cache_error}"
                    ));
                }
            }
            return Err(error);
        }
    };
    Ok(ConversionResult {
        path: saved.path.clone(),
        bytes: saved.bytes,
        note,
        files: vec![saved],
        total: 1,
        complete: true,
        fingerprint: String::new(),
    })
}
fn input_coder(ext: &str) -> &str {
    match ext {
        "jpg" | "jpeg" => "JPEG",
        "heif" | "heic" => "HEIC",
        "avif" => "AVIF",
        "webp" => "WEBP",
        _ => "PNG",
    }
}
fn encode_image(
    job: &Job<'_>,
    image: &Path,
    coder: &str,
    output: &Path,
    format: OutputFormat,
    options: &crate::Options,
) -> Result<(), String> {
    let mut args = vec![coder_path(coder, image, true), text("-auto-orient")];
    if !options.keep_metadata {
        args.extend([text("+profile"), text("exif,xmp,iptc")]);
    }
    if format == OutputFormat::Jpeg {
        args.extend([
            text("-background"),
            text("white"),
            text("-alpha"),
            text("remove"),
            text("-alpha"),
            text("off"),
        ]);
    }
    if format == OutputFormat::Avif {
        args.extend([
            text("-define"),
            text("heic:speed=6"),
            text("-define"),
            text("heic:chroma=420"),
        ]);
    }
    if format == OutputFormat::Webp {
        args.extend([
            text("-define"),
            text("webp:method=4"),
            text("-define"),
            text("webp:lossless=false"),
        ]);
    }
    // PNG quality is a compression/filter setting, not a lossy quality scale.
    args.extend([
        text("-quality"),
        text(&if format == OutputFormat::Png {
            "95".into()
        } else {
            options
                .image_quality(format == OutputFormat::Avif)
                .to_string()
        }),
        coder_path(format.coder(), output, false),
    ]);
    job.run("magick", &args)?;
    let dimensions = job.run(
        "magick",
        &[
            text("identify"),
            text("-format"),
            text("%w %h"),
            coder_path(format.coder(), output, false),
        ],
    )?;
    let dimensions: Vec<u32> = dimensions
        .split_whitespace()
        .filter_map(|v| v.parse().ok())
        .collect();
    if dimensions.len() != 2 || dimensions.contains(&0) {
        return Err("Image output validation failed".into());
    }
    Ok(())
}
fn media_demuxer(extension: &str) -> Option<&'static str> {
    // Force the declared container: never sniff a renamed playlist.
    Some(match extension {
        "mp3" => "mp3",
        "wav" => "wav",
        "flac" => "flac",
        "ogg" | "opus" => "ogg",
        "m4a" | "mp4" | "mov" => "mov",
        "mkv" | "webm" => "matroska",
        _ => return None,
    })
}
fn encode_audio(
    job: &Job<'_>,
    input: &Path,
    output: &Path,
    format: OutputFormat,
    progress: Option<crate::progress::Reporter>,
) -> Result<(), String> {
    let demuxer = media_demuxer(input.extension().and_then(|e| e.to_str()).unwrap_or(""))
        .ok_or("Unsupported media container")?;
    let (codec, muxer, expected, bitrate) = match format {
        OutputFormat::Wav => ("pcm_s16le", "wav", "pcm_s16le", None),
        OutputFormat::Mp3 => ("libmp3lame", "mp3", "mp3", Some("192k")),
        OutputFormat::Flac => ("flac", "flac", "flac", None),
        OutputFormat::Opus => ("libopus", "opus", "opus", Some("128k")),
        OutputFormat::M4a => ("aac", "ipod", "aac", Some("192k")),
        _ => return Err("Unsupported audio format".into()),
    };
    let mut probe_args = vec![
        text("-v"),
        text("error"),
        text("-protocol_whitelist"),
        text("file"),
        text("-f"),
        text(demuxer),
    ];
    if demuxer == "mov" {
        probe_args.extend([
            text("-enable_drefs"),
            text("0"),
            text("-use_absolute_path"),
            text("0"),
        ]);
    }
    probe_args.extend([
        text("-select_streams"),
        text("a:0"),
        text("-show_entries"),
        text("stream=duration,channels:format=duration"),
        text("-of"),
        text("json"),
        input.as_os_str().into(),
    ]);
    let original: serde_json::Value =
        serde_json::from_str(&job.run("ffprobe", &probe_args)?).map_err(|e| e.to_string())?;
    fn duration(value: &serde_json::Value) -> Option<f64> {
        [
            &value["streams"][0]["duration"],
            &value["format"]["duration"],
        ]
        .iter()
        .find_map(|v| {
            v.as_str()?
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite() && *v > 0.0)
        })
    }
    let original_duration = duration(&original).ok_or("Cannot verify source audio duration")?;
    let mut args = vec![
        text("-nostdin"),
        text("-v"),
        text("error"),
        text("-xerror"),
        text("-n"),
        text("-protocol_whitelist"),
        text("file"),
        text("-f"),
        text(demuxer),
        text("-i"),
        input.as_os_str().into(),
        text("-map"),
        text("0:a:0"),
        text("-vn"),
        text("-map_metadata"),
        text("-1"),
        text("-map_chapters"),
        text("-1"),
        text("-fs"),
        text("268435457"),
        text("-threads"),
        text("2"),
        text("-c:a"),
        text(codec),
    ];
    if demuxer == "mov" {
        // Input options must precede -i.
        let index = args.iter().position(|a| a == "-i").expect("input option");
        args.splice(
            index..index,
            [
                text("-enable_drefs"),
                text("0"),
                text("-use_absolute_path"),
                text("0"),
            ],
        );
    }
    if let Some(bitrate) = bitrate {
        args.extend([text("-b:a"), text(bitrate)]);
    }
    args.extend([text("-f"), text(muxer), output.as_os_str().into()]);
    args.splice(
        0..0,
        [
            text("-progress"),
            text("pipe:1"),
            text("-nostats"),
            text("-stats_period"),
            text("0.25"),
        ],
    );
    job.run_progress(
        "ffmpeg",
        &args,
        progress
            .clone()
            .map(|p| crate::progress::Parser::new(Some(original_duration), p)),
    )?;
    if let Some(report) = &progress {
        report(crate::progress::Progress {
            stage: crate::progress::Stage::Validating,
            percent: None,
        });
    }
    if fs::metadata(output).map_err(|e| e.to_string())?.len() > 256 * 1024 * 1024 {
        return Err("Audio output exceeds the 256 MiB budget".into());
    }
    let probe = job.run(
        "ffprobe",
        &[
            text("-v"),
            text("error"),
            text("-show_entries"),
            text("stream=codec_name,sample_rate,channels,duration:format=duration"),
            text("-of"),
            text("json"),
            output.as_os_str().into(),
        ],
    )?;
    let value: serde_json::Value = serde_json::from_str(&probe).map_err(|e| e.to_string())?;
    if value["streams"][0]["codec_name"] != expected {
        return Err("Audio output validation failed".into());
    }
    let encoded_duration = duration(&value).ok_or("Cannot verify output audio duration")?;
    if (encoded_duration - original_duration).abs() > 0.2
        || value["streams"][0]["channels"] != original["streams"][0]["channels"]
    {
        return Err("Audio duration or channel count changed; no output was published".into());
    }
    job.run(
        "ffmpeg",
        &[
            text("-nostdin"),
            text("-v"),
            text("error"),
            text("-xerror"),
            text("-protocol_whitelist"),
            text("file"),
            text("-i"),
            output.as_os_str().into(),
            text("-f"),
            text("null"),
            text("-"),
        ],
    )?;
    Ok(())
}
fn publish(
    job: &Job<'_>,
    output: &Path,
    directory: &Path,
    input: &Path,
    format: OutputFormat,
    page: Option<u32>,
    budget: u64,
) -> Result<SavedFile, String> {
    publish_verified(
        job.cancel,
        job.deadline,
        output,
        directory,
        input,
        format,
        page,
        budget,
        None,
    )
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn publish_verified(
    cancel: &Cancel,
    deadline: Instant,
    output: &Path,
    directory: &Path,
    input: &Path,
    format: OutputFormat,
    page: Option<u32>,
    budget: u64,
    expected: Option<(u64, &str)>,
) -> Result<SavedFile, String> {
    cancel.check(deadline)?;
    let size = fs::metadata(output)
        .map_err(|e| {
            if expected.is_some() {
                crate::retained::INVALID.into()
            } else {
                e.to_string()
            }
        })?
        .len();
    if expected.is_some_and(|(bytes, _)| bytes != size) {
        return Err(crate::retained::INVALID.into());
    }
    if size == 0 || size > budget {
        return Err("Output is empty or exceeds the 256 MiB output budget".into());
    }
    crate::storage::ensure(directory, size, crate::storage::Area::Output)?;
    let mut pending =
        tempfile::NamedTempFile::new_in(directory).map_err(crate::failure::output_io)?;
    let mut encoded = crate::input::open_regular(output).map_err(|e| {
        if expected.is_some() {
            crate::retained::INVALID.into()
        } else {
            e.to_string()
        }
    })?;
    let mut buffer = [0; 65536];
    let mut copied = 0u64;
    loop {
        cancel.check(deadline)?;
        let n = encoded.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        copied += n as u64;
        if copied > budget || copied > size {
            return Err(crate::retained::INVALID.into());
        }
        pending
            .write_all(&buffer[..n])
            .map_err(crate::failure::output_io)?;
    }
    pending
        .as_file()
        .sync_all()
        .map_err(crate::failure::output_io)?;
    let sha256 = crate::hash_file(pending.path())?;
    if copied != size || expected.is_some_and(|(_, hash)| hash != sha256) {
        return Err(crate::retained::INVALID.into());
    }
    let mut stem = String::new();
    for character in input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted")
        .chars()
    {
        // Reserve room for page/collision suffixes in UTF-8 file systems too.
        if stem.len() + character.len_utf8() > 180 {
            break;
        }
        stem.push(character);
    }
    let suffix = page.map(|p| format!("-page-{p:03}")).unwrap_or_default();
    for index in 1..=1000 {
        cancel.check(deadline)?;
        let target = directory.join(format!("{stem}{suffix}-z8-{index}.{}", format.extension()));
        match pending.persist_noclobber(&target) {
            Ok(_) => {
                return Ok(SavedFile {
                    path: target.to_string_lossy().into(),
                    bytes: size,
                    page: page.unwrap_or(1),
                    sha256,
                })
            }
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => pending = e.file,
            Err(e) => return Err(crate::failure::output_io(e.error)),
        }
    }
    Err("Too many output filename collisions".into())
}
fn convert_pdf(
    job: &Job<'_>,
    staged: &Path,
    input: &Path,
    directory: &Path,
    format: OutputFormat,
    context: &ConversionContext,
) -> Result<ConversionResult, String> {
    use sha2::{Digest, Sha256};
    let count = job.run(
        "mutool",
        &[
            text("show"),
            staged.as_os_str().into(),
            text("trailer/Root/Pages/Count"),
        ],
    )?;
    let total: u32 = count
        .trim()
        .parse()
        .map_err(|_| "Cannot determine PDF page count (invalid or encrypted PDF)")?;
    if total == 0 || total > 200 {
        return Err("PDF must contain 1 to 200 pages".into());
    }
    let fingerprint = format!(
        "{:x}",
        Sha256::digest(format!(
            "m2:{}:{:?}:{}:{}",
            crate::hash_file(staged)?,
            format,
            serde_json::to_string(&context.options).map_err(|e| e.to_string())?,
            job.engines.identity()
        ))
    );
    let mut result = ConversionResult { path: String::new(), bytes: 0, note: format!("PDF: {total} pages, {} DPI, at most 4000 × 4000 pixels per page. Successfully saved pages are retained on cancellation or failure.", context.options.pdf_dpi), files: vec![], fingerprint, total, complete: false };
    if let Some(old) = &context.resume {
        if !old.complete && old.fingerprint == result.fingerprint && old.total == total {
            for file in &old.files {
                job.cancel.check(job.deadline)?;
                let path = Path::new(&file.path);
                // History is not authority: only reuse files under the freshly
                // selected output directory, after byte identity verification.
                if file.page > 0
                    && file.page <= total
                    && path.parent() == Some(directory)
                    && !result.files.iter().any(|f| f.page == file.page)
                    && path
                        .symlink_metadata()
                        .map(|m| m.is_file() && m.len() == file.bytes)
                        .unwrap_or(false)
                    && crate::hash_file(path).ok().as_ref() == Some(&file.sha256)
                {
                    result.bytes += file.bytes;
                    result.files.push(file.clone());
                }
            }
        }
    }
    result.files.sort_by_key(|f| f.page);
    result.path = result
        .files
        .first()
        .map(|f| f.path.clone())
        .unwrap_or_default();
    if let Some(report) = &context.report {
        report(result.clone())?;
    }
    for page in 1..=total {
        job.cancel.check(job.deadline)?;
        if result.files.iter().any(|f| f.page == page) {
            continue;
        }
        let rendered = job.cwd.join("page.png");
        let output = job.cwd.join(format!("encoded.{}", format.extension()));
        job.run(
            "mutool",
            &[
                text("draw"),
                text("-q"),
                text("-L"),
                text("-m"),
                text("268435456"),
                text("-F"),
                text("png"),
                text("-c"),
                text("rgba"),
                text("-r"),
                text(&context.options.pdf_dpi.to_string()),
                text("-w"),
                text("4000"),
                text("-h"),
                text("4000"),
                text("-o"),
                rendered.clone().into_os_string(),
                staged.as_os_str().into(),
                text(&page.to_string()),
            ],
        )?;
        encode_image(job, &rendered, "PNG", &output, format, &context.options)?;
        let remaining = (256 * 1024 * 1024u64)
            .checked_sub(result.bytes)
            .ok_or("PDF output budget exceeded")?;
        let file = publish(
            job,
            &output,
            directory,
            input,
            format,
            Some(page),
            remaining,
        )?;
        result.bytes += file.bytes;
        result.files.push(file);
        result.files.sort_by_key(|f| f.page);
        result.path = result.files[0].path.clone();
        // Persist each verified output before beginning another page. A reporting
        // failure stops conversion; the queue still retains the in-memory result.
        if let Some(report) = &context.report {
            report(result.clone())?;
        }
        fs::remove_file(&rendered).map_err(|e| e.to_string())?;
        fs::remove_file(&output).map_err(|e| e.to_string())?;
    }
    result.complete = true;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn store_materials_describe_only_native_conversion_routes() {
        let content: serde_json::Value = serde_json::from_str(include_str!(
            "../../../packaging/desktop/store/content.json"
        ))
        .unwrap();
        for group in content["routes"].as_array().unwrap() {
            let expected: Vec<OutputFormat> =
                serde_json::from_value(group["outputs"].clone()).unwrap();
            for input in group["inputs"].as_array().unwrap() {
                assert_eq!(
                    output_formats(input.as_str().unwrap()),
                    expected,
                    "{}",
                    input
                );
            }
        }
    }
    #[test]
    fn routes_are_explicit() {
        assert!(output_formats("xlsx").is_empty());
        assert!(output_formats("PDF").contains(&OutputFormat::Avif));
        assert_eq!(output_formats("docx"), vec![OutputFormat::Txt]);
        assert!(!output_formats("png").contains(&OutputFormat::Wav));
        assert!(output_formats("mp4").contains(&OutputFormat::Opus));
    }
}
