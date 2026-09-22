use crate::{Cancel, Engines};
mod preview;
#[cfg(all(test, unix))]
mod storage_tests;
mod svg;
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
    Bmp,
    Tga,
    Qoi,
    Pbm,
    Pgm,
    Ppm,
    Pnm,
    Pam,
    Gif,
    Tiff,
    Ico,
    Pcx,
    Xbm,
    Xpm,
    Heic,
    Heif,
    Jxl,
    Wav,
    Mp3,
    Flac,
    Opus,
    M4a,
    Ogg,
    Aiff,
    Aac,
    Alac,
    Txt,
}
impl OutputFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
            Self::Avif => "avif",
            Self::Bmp => "bmp",
            Self::Tga => "tga",
            Self::Qoi => "qoi",
            Self::Pbm => "pbm",
            Self::Pgm => "pgm",
            Self::Ppm => "ppm",
            Self::Pnm => "pnm",
            Self::Pam => "pam",
            Self::Gif => "gif",
            Self::Tiff => "tiff",
            Self::Ico => "ico",
            Self::Pcx => "pcx",
            Self::Xbm => "xbm",
            Self::Xpm => "xpm",
            Self::Heic => "heic",
            Self::Heif => "heif",
            Self::Jxl => "jxl",
            Self::Wav => "wav",
            Self::Mp3 => "mp3",
            Self::Flac => "flac",
            Self::Opus => "opus",
            Self::M4a => "m4a",
            Self::Ogg => "ogg",
            Self::Aiff => "aiff",
            Self::Aac => "aac",
            // ALAC is stored in an M4A/MP4-family container. Keep the extension
            // truthful even though its serialized output choice is `alac`.
            Self::Alac => "m4a",
            Self::Txt => "txt",
        }
    }
    pub(crate) fn coder(self) -> &'static str {
        match self {
            Self::Jpeg => "JPEG",
            Self::Png => "PNG",
            Self::Webp => "WEBP",
            Self::Avif => "AVIF",
            Self::Bmp => "BMP3",
            Self::Tga => "TGA",
            Self::Qoi => "QOI",
            Self::Pbm => "PBM",
            Self::Pgm => "PGM",
            Self::Ppm => "PPM",
            Self::Pnm => "PNM",
            Self::Pam => "PAM",
            Self::Gif => "GIF",
            Self::Tiff => "TIFF",
            Self::Ico => "ICO",
            Self::Pcx => "PCX",
            Self::Xbm => "XBM",
            Self::Xpm => "XPM",
            Self::Heic | Self::Heif => "HEIC",
            Self::Jxl => "JXL",
            _ => "",
        }
    }
}
pub fn output_formats(extension: &str) -> Vec<OutputFormat> {
    crate::formats::outputs(extension)
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
    fn work_file(&self, path: &Path) -> Result<OsString, String> {
        // MuPDF does not reliably accept Windows verbatim (\\?\) paths.
        // Commands already run inside this private directory. Pass only the
        // filename of our own staged input/output; keep filesystem paths intact.
        if path.parent() != Some(self.cwd) {
            return Err("Engine file is outside the job directory".into());
        }
        path.file_name()
            .map(|name| name.to_owned())
            .ok_or_else(|| "Missing engine work filename".into())
    }
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
<policy domain="coder" rights="read|write" pattern="{PNG,PNG32,JPEG,WEBP,AVIF,HEIC,BMP,BMP2,BMP3,TGA,QOI,PNM,PAM,PBM,PGM,PPM,GIF,TIFF,ICON,ICO,PCX,XBM,XPM,JXL,EXR,HDR,DPX}"/>
<policy domain="coder" rights="read" pattern="ICC"/>
<policy domain="resource" name="memory" value="256MiB"/>
<policy domain="resource" name="map" value="256MiB"/>
<policy domain="resource" name="disk" value="512MiB"/>
<policy domain="resource" name="width" value="16000"/>
<policy domain="resource" name="height" value="16000"/>
<policy domain="resource" name="thread" value="2"/>
<policy domain="resource" name="time" value="90"/>
</policymap>"#;

const PLAIN_TEXT_INPUT_LIMIT: u64 = 16 * 1024 * 1024;
const TEXT_OUTPUT_LIMIT: u64 = 64 * 1024 * 1024;

// Fixed readers only: an unknown extension must never fall back to Markdown.
fn document_reader(extension: &str) -> Result<&'static str, String> {
    match extension {
        "md" | "markdown" | "mdown" | "mkdn" => Ok("markdown"),
        "rst" => Ok("rst"),
        "docx" => Ok("docx"),
        "html" | "htm" => Ok("html+raw_html"),
        "odt" => Ok("odt"),
        "epub" => Ok("epub"),
        "csv" => Ok("csv"),
        "tsv" => Ok("tsv"),
        "docbook" => Ok("docbook"),
        "org" => Ok("org"),
        _ => Err("Unsupported document input".into()),
    }
}

fn plain_text_input(extension: &str) -> bool {
    matches!(extension, "txt" | "text")
}

fn normalized_text(bytes: &[u8], empty: &str) -> Result<Vec<u8>, String> {
    if bytes.len() as u64 > TEXT_OUTPUT_LIMIT {
        return Err("Text output exceeds the 64 MiB budget".into());
    }
    let value = std::str::from_utf8(bytes).map_err(|_| "Text is not valid UTF-8")?;
    let value = value.strip_prefix('\u{feff}').unwrap_or(value);
    if value.contains('\0') {
        return Err("Text contains NUL bytes".into());
    }
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    if !normalized
        .chars()
        .any(|character| !character.is_whitespace())
    {
        return Err(empty.into());
    }
    Ok(normalized.into_bytes())
}

fn normalize_text_file(path: &Path, empty: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let normalized = normalized_text(&bytes, empty)?;
    if normalized != bytes {
        fs::write(path, normalized).map_err(|e| e.to_string())?;
    }
    Ok(())
}

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
    // Keep unsupported extensions from reaching any filesystem work, while the
    // package-specific authorization check remains after output preflight. The
    // latter ordering preserves a useful storage error and still occurs before
    // staging or starting an engine process.
    if !output_formats(&ext).contains(&format) {
        return Err("Unsupported conversion in this installed package".into());
    }
    if ext == "pdf" && initial_metadata.len() > 100 * 1024 * 1024 {
        return Err("PDF input limit is 100 MiB".into());
    }
    if plain_text_input(&ext) && initial_metadata.len() > PLAIN_TEXT_INPUT_LIMIT {
        return Err("Plain text input limit is 16 MiB".into());
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
    if !engines.formats_for(&ext).contains(&format) {
        return Err("Unsupported conversion in this installed package".into());
    }
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
        | OutputFormat::M4a
        | OutputFormat::Ogg
        | OutputFormat::Aiff
        | OutputFormat::Aac
        | OutputFormat::Alac => {
            encode_audio(&job, &staged, &output, format, context.progress.clone())?;
            audio_note(format).into()
        }
        OutputFormat::Txt => {
            if plain_text_input(&ext) {
                let bytes = fs::read(&staged).map_err(|e| e.to_string())?;
                let normalized = normalized_text(&bytes, "Text input contains no readable text")?;
                fs::write(&output, normalized).map_err(|e| e.to_string())?;
            } else {
                job.run(
                    "pandoc",
                    &[
                        text("--sandbox"),
                        text("--from"),
                        text(document_reader(&ext)?),
                        text("--to"),
                        text("plain"),
                        text("--output"),
                        output.clone().into_os_string(),
                        staged.clone().into_os_string(),
                    ],
                )?;
                normalize_text_file(&output, "Document contains no readable text")?;
            }
            document_note(&ext).to_string()
        }
        _ => {
            let raster = if ext == "svg" {
                let raster = work.path().join("static-svg.png");
                svg::render(&staged, &raster, None)?;
                raster
            } else {
                staged.clone()
            };
            encode_image(
                &job,
                &raster,
                if ext == "svg" {
                    "PNG"
                } else {
                    input_coder(&ext)
                },
                &output,
                format,
                &context.options,
            )?;
            image_note(&ext, format)
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

fn image_note(input: &str, format: OutputFormat) -> String {
    if input == "svg" {
        return "Static SVG only. Scripts, animation, external files and system fonts are not used; embedded raster data is limited. Output is an 8-bit sRGB bitmap.".into();
    }
    let coder = input_coder(input);
    if fixed_exposure_hdr_input(coder) {
        return "First image only. HDR/linear source is mapped with a fixed exposure to 8-bit sRGB SDR; it is not a high-dynamic-range preservation conversion.".into();
    }
    if coder == "DPX" {
        return "First image only. DPX is reduced to 8-bit sRGB SDR using ImageMagick's decoded DPX interpretation. Log/camera-specific LUTs, custom reference black/white choices, production metadata, multiple elements and high-bit-depth preservation are not retained.".into();
    }
    match format {
        OutputFormat::Heic | OutputFormat::Heif => "First frame only. HEIC/HEIF uses a lossy HEVC 8-bit SDR compatibility profile with 4:2:0 chroma and a white background. Metadata and ICC profiles are omitted. Third-party preview support varies.".into(),
        OutputFormat::Jxl => "First frame only. JPEG XL is 8-bit sRGB. Metadata and ICC profiles are omitted; operating-system and browser preview support varies.".into(),
        OutputFormat::Gif => "First frame only. GIF is a static 256-color image; metadata and ICC profiles are omitted. Output may be larger.".into(),
        OutputFormat::Tiff => "First frame only. TIFF is a single 8-bit sRGB page, not BigTIFF, multi-page, CMYK or high-bit-depth preservation. Metadata and ICC profiles are omitted.".into(),
        OutputFormat::Ico => "First frame only. ICO is a single centered 256 × 256 icon; metadata and ICC profiles are omitted.".into(),
        OutputFormat::Pbm | OutputFormat::Xbm => "First frame only. PBM/XBM is thresholded at 50% to a 1-bit black-and-white image; metadata and ICC profiles are omitted.".into(),
        OutputFormat::Pgm => "First frame only. PGM is an 8-bit grayscale image; metadata and ICC profiles are omitted.".into(),
        OutputFormat::Xpm => "First frame only. XPM is limited to 256 colors; metadata and ICC profiles are omitted.".into(),
        OutputFormat::Bmp | OutputFormat::Tga | OutputFormat::Qoi | OutputFormat::Ppm | OutputFormat::Pnm | OutputFormat::Pam | OutputFormat::Pcx => "First frame only. Fixed 8-bit sRGB output; metadata and ICC profiles are omitted. Formats without alpha use a white background.".into(),
        _ => "First frame only. JPEG uses a white background; PNG preserves pixels. EXIF/XMP/IPTC are optional; ICC is retained. Output may be larger.".into(),
    }
}

fn document_note(input: &str) -> &'static str {
    if input == "org" {
        return "Text only. Org markup is interpreted by Pandoc; underscores can represent subscripts, so use Org literal/code markup or #+OPTIONS: ^:{} for identifiers that must retain underscores. Images, layout and formatting are omitted.";
    }
    "Text only; images, layout and formatting are omitted."
}

fn audio_note(format: OutputFormat) -> &'static str {
    match format {
        OutputFormat::Ogg => "First audio track only. OGG uses lossy Vorbis quality 5. Tags and cover art are removed. Output may be larger.",
        OutputFormat::Aiff => "First audio track only. AIFF uses uncompressed PCM 16-bit; higher source bit depths are reduced. Tags and cover art are removed. Output may be larger.",
        OutputFormat::Mp3 => "First audio track only. MP3 is lossy at 192 kb/s; sources at unsupported MP3 sampling rates are resampled. Metadata is removed.",
        OutputFormat::M4a => "First audio track only. M4A uses lossy AAC at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Metadata is removed.",
        OutputFormat::Aac => "First audio track only. AAC uses a lossy ADTS stream at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Tags and cover art are removed.",
        OutputFormat::Alac => "First audio track only. ALAC is lossless and stored in an M4A container. Tags and cover art are removed; output may be larger.",
        OutputFormat::Opus => "First audio track only. Opus is lossy at 128 kb/s and uses a 48 kHz clock; sources not at 48 kHz are resampled. Metadata is removed.",
        _ => "First audio track only. WAV uses PCM 16-bit; FLAC is lossless. Metadata is removed.",
    }
}

const MP3_SAMPLE_RATES: [u32; 9] = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
const AAC_SAMPLE_RATES: [u32; 13] = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

fn nearest_supported_sample_rate_matches(
    source_rate: Option<&str>,
    output_rate: Option<&str>,
    supported: &[u32],
) -> bool {
    let (Some(source_rate), Some(output_rate)) = (
        source_rate.and_then(|rate| rate.parse::<u32>().ok()),
        output_rate.and_then(|rate| rate.parse::<u32>().ok()),
    ) else {
        return false;
    };
    let Some(delta) = supported
        .iter()
        .map(|rate| rate.abs_diff(source_rate))
        .min()
    else {
        return false;
    };
    supported
        .iter()
        .any(|rate| *rate == output_rate && rate.abs_diff(source_rate) == delta)
}

/// Opus readers report the codec's 48 kHz clock. MP3 and AAC have discrete
/// supported sample-rate sets, so FFmpeg resamples an unsupported source rate
/// to the nearest valid value. Other output formats must preserve the source
/// rate; accepting arbitrary resampling would hide a conversion regression.
pub(crate) fn audio_output_sample_rate_matches_contract(
    format: OutputFormat,
    source_rate: Option<&str>,
    output_rate: Option<&str>,
) -> bool {
    match format {
        OutputFormat::Opus => output_rate == Some("48000"),
        OutputFormat::Mp3 => {
            nearest_supported_sample_rate_matches(source_rate, output_rate, &MP3_SAMPLE_RATES)
        }
        OutputFormat::M4a | OutputFormat::Aac => {
            nearest_supported_sample_rate_matches(source_rate, output_rate, &AAC_SAMPLE_RATES)
        }
        _ => source_rate.is_some() && source_rate == output_rate,
    }
}
pub(crate) fn input_coder(ext: &str) -> &str {
    match ext {
        "jpg" | "jpeg" | "jpe" | "jfif" => "JPEG",
        "heif" | "heic" => "HEIC",
        "avif" => "AVIF",
        "webp" => "WEBP",
        "bmp" => "BMP",
        "tga" => "TGA",
        "qoi" => "QOI",
        "pbm" => "PBM",
        "pgm" => "PGM",
        "ppm" => "PPM",
        "pnm" => "PNM",
        "pam" => "PAM",
        "gif" => "GIF",
        "tif" | "tiff" => "TIFF",
        "ico" => "ICO",
        "pcx" => "PCX",
        "xbm" => "XBM",
        "xpm" => "XPM",
        "jxl" => "JXL",
        "exr" => "EXR",
        "hdr" => "HDR",
        "dpx" => "DPX",
        _ => "PNG",
    }
}

fn fixed_sdr_output(format: OutputFormat) -> bool {
    matches!(
        format,
        OutputFormat::Bmp
            | OutputFormat::Tga
            | OutputFormat::Qoi
            | OutputFormat::Pbm
            | OutputFormat::Pgm
            | OutputFormat::Ppm
            | OutputFormat::Pnm
            | OutputFormat::Pam
            | OutputFormat::Gif
            | OutputFormat::Tiff
            | OutputFormat::Ico
            | OutputFormat::Pcx
            | OutputFormat::Xbm
            | OutputFormat::Xpm
            | OutputFormat::Heic
            | OutputFormat::Heif
            | OutputFormat::Jxl
    )
}

fn white_background_output(format: OutputFormat) -> bool {
    matches!(
        format,
        OutputFormat::Jpeg
            | OutputFormat::Bmp
            | OutputFormat::Pbm
            | OutputFormat::Pgm
            | OutputFormat::Ppm
            | OutputFormat::Pnm
            | OutputFormat::Pcx
            | OutputFormat::Xbm
            | OutputFormat::Heic
            | OutputFormat::Heif
    )
}

fn fixed_exposure_hdr_input(coder: &str) -> bool {
    matches!(coder, "EXR" | "HDR")
}

fn professional_sdr_input(coder: &str) -> bool {
    fixed_exposure_hdr_input(coder) || coder == "DPX"
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
    if white_background_output(format) {
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
    if fixed_exposure_hdr_input(coder) {
        // This is intentionally a fixed SDR import, not a color-managed HDR
        // round trip. Work in linear RGB, use a fixed exposure, clip remaining
        // out-of-range values, then encode sRGB below. DPX has distinct
        // logarithmic / reference-point conventions, so it is intentionally
        // not forced through this generic exposure adjustment.
        args.extend([
            text("-colorspace"),
            text("RGB"),
            text("-evaluate"),
            text("Multiply"),
            text("0.25"),
            text("-clamp"),
        ]);
    }
    if professional_sdr_input(coder) {
        // All reviewed professional-image import routes publish SDR bitmaps.
        // For DPX this lets ImageMagick apply its decoded DPX interpretation;
        // product-specific Log LUTs and reference points remain outside the
        // bounded first-version contract stated in image_note().
        args.extend([text("-colorspace"), text("sRGB"), text("-depth"), text("8")]);
    }
    if fixed_sdr_output(format) {
        // These outputs have a deliberately limited, portable first-version
        // contract. Apply orientation before stripping metadata, then quantize
        // to sRGB 8-bit. TIFF is one static RGB/RGBA page, not a preservation
        // route for BigTIFF, CMYK, layers or high-bit-depth source data.
        let srgb = job.cwd.join("output-srgb.icc");
        fs::write(
            &srgb,
            include_bytes!("../../../packaging/desktop/profiles/srgb.icc"),
        )
        .map_err(|e| e.to_string())?;
        args.extend([
            text("-profile"),
            job.work_file(&srgb)?,
            text("-colorspace"),
            text("sRGB"),
            text("-depth"),
            text("8"),
            text("+profile"),
            text("*"),
        ]);
    }
    match format {
        OutputFormat::Pbm | OutputFormat::Xbm => args.extend([
            text("-colorspace"),
            text("Gray"),
            text("-threshold"),
            text("50%"),
        ]),
        OutputFormat::Pgm => args.extend([text("-colorspace"), text("Gray")]),
        OutputFormat::Gif | OutputFormat::Xpm => args.extend([text("-colors"), text("256")]),
        OutputFormat::Tiff => args.extend([
            text("-define"),
            text("tiff:write-layers=false"),
            text("-compress"),
            text("zip"),
        ]),
        OutputFormat::Ico => args.extend([
            text("-background"),
            text("none"),
            text("-resize"),
            text("256x256"),
            text("-gravity"),
            text("center"),
            text("-extent"),
            text("256x256"),
            text("-define"),
            text("icon:auto-resize=256"),
        ]),
        OutputFormat::Heic | OutputFormat::Heif => args.extend([
            text("-define"),
            text("heic:lossless=false"),
            text("-define"),
            text("heic:chroma=420"),
        ]),
        OutputFormat::Jxl => args.extend([text("-define"), text("jxl:effort=7")]),
        _ => {}
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
    validate_image_encoding(output, format)?;
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
// The decoder check below is still required: a matching header alone is not a valid image.
fn validate_image_encoding(path: &Path, format: OutputFormat) -> Result<(), String> {
    let file = crate::input::open_regular(path).map_err(|e| e.to_string())?;
    let mut bytes = vec![];
    file.take(4096)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let matches = match format {
        OutputFormat::Png => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        OutputFormat::Jpeg => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        OutputFormat::Webp => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        OutputFormat::Bmp => {
            bytes.starts_with(b"BM") && bytes.get(14..18) == Some(&40u32.to_le_bytes())
        }
        OutputFormat::Qoi => {
            bytes.starts_with(b"qoif")
                && matches!(bytes.get(12), Some(3 | 4))
                && matches!(bytes.get(13), Some(0 | 1))
        }
        // TGA has no magic prefix; require the structural fields our encoder emits,
        // then require successful decoding below (not just a file extension).
        OutputFormat::Tga => {
            bytes.len() >= 18
                && bytes[1] <= 1
                && matches!(bytes[2], 1 | 2 | 3 | 9 | 10 | 11)
                && u16::from_le_bytes([bytes[12], bytes[13]]) > 0
                && u16::from_le_bytes([bytes[14], bytes[15]]) > 0
                && matches!(bytes[16], 8 | 16 | 24 | 32)
        }
        OutputFormat::Avif => {
            let length = bytes
                .get(..4)
                .map(|b| u32::from_be_bytes(b.try_into().unwrap()) as usize)
                .unwrap_or(0);
            length >= 16
                && length <= bytes.len()
                && bytes.get(4..8) == Some(b"ftyp")
                && (bytes.get(8..12) == Some(b"avif")
                    || bytes[16..length].chunks_exact(4).any(|b| b == b"avif"))
        }
        OutputFormat::Pbm => matches!(bytes.get(..2), Some(b"P1") | Some(b"P4")),
        OutputFormat::Pgm => matches!(bytes.get(..2), Some(b"P2") | Some(b"P5")),
        OutputFormat::Ppm => matches!(bytes.get(..2), Some(b"P3") | Some(b"P6")),
        OutputFormat::Pnm => matches!(
            bytes.get(..2),
            Some(b"P1") | Some(b"P2") | Some(b"P3") | Some(b"P4") | Some(b"P5") | Some(b"P6")
        ),
        OutputFormat::Pam => bytes.starts_with(b"P7\n"),
        OutputFormat::Gif => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        OutputFormat::Tiff => bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*"),
        OutputFormat::Ico => {
            bytes.len() >= 6
                && bytes[..4] == [0, 0, 1, 0]
                && u16::from_le_bytes([bytes[4], bytes[5]]) > 0
        }
        OutputFormat::Pcx => bytes.len() >= 4 && bytes[0] == 0x0a && bytes[1] <= 5 && bytes[2] == 1,
        OutputFormat::Xbm => bytes.starts_with(b"#define "),
        OutputFormat::Xpm => bytes.starts_with(b"/* XPM */"),
        OutputFormat::Heic | OutputFormat::Heif => is_heic_header(&bytes),
        OutputFormat::Jxl => {
            bytes.starts_with(&[0xff, 0x0a])
                || (bytes.get(4..8) == Some(b"JXL ")
                    && bytes
                        .get(8..12)
                        .is_some_and(|box_type| box_type == b"\r\n\x87\n"))
        }
        _ => false,
    };
    if matches {
        Ok(())
    } else {
        Err("Image output encoding does not match requested format".into())
    }
}

fn is_heic_header(bytes: &[u8]) -> bool {
    let length = bytes
        .get(..4)
        .map(|b| u32::from_be_bytes(b.try_into().unwrap()) as usize)
        .unwrap_or(0);
    length >= 16
        && length <= bytes.len()
        && bytes.get(4..8) == Some(b"ftyp")
        && bytes.get(8..12).is_some_and(|brand| {
            brand == b"heic"
                || brand == b"heix"
                || brand == b"hevc"
                || brand == b"hevx"
                || brand == b"mif1"
        })
}
fn media_demuxer(extension: &str) -> Option<&'static str> {
    // Force the declared container: never sniff a renamed playlist.
    Some(match extension {
        "mp3" => "mp3",
        // FFmpeg's MP3 demuxer is the documented reader for MPEG layer II and III.
        "mp2" => "mp3",
        "aac" => "aac",
        "ac3" => "ac3",
        "amr" => "amr",
        "au" => "au",
        "caf" => "caf",
        "wma" => "asf",
        "voc" => "voc",
        "wv" => "wv",
        "wav" => "wav",
        "aiff" | "aif" => "aiff",
        "flac" => "flac",
        "ogg" | "opus" | "oga" => "ogg",
        "m4a" | "mp4" | "mov" => "mov",
        "mkv" | "webm" | "mka" | "weba" => "matroska",
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
        OutputFormat::Ogg => ("libvorbis", "ogg", "vorbis", None),
        OutputFormat::Aiff => ("pcm_s16be", "aiff", "pcm_s16be", None),
        OutputFormat::Aac => ("aac", "adts", "aac", Some("192k")),
        OutputFormat::Alac => ("alac", "ipod", "alac", None),
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
        text("stream=duration,channels,sample_rate:format=duration"),
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
    if format == OutputFormat::Ogg {
        args.extend([text("-q:a"), text("5")]);
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
            text("stream=codec_name,sample_rate,channels,duration:format=format_name,duration"),
            text("-of"),
            text("json"),
            output.as_os_str().into(),
        ],
    )?;
    let value: serde_json::Value = serde_json::from_str(&probe).map_err(|e| e.to_string())?;
    if value["streams"][0]["codec_name"] != expected {
        return Err("Audio output validation failed".into());
    }
    if !audio_output_sample_rate_matches_contract(
        format,
        original["streams"][0]["sample_rate"].as_str(),
        value["streams"][0]["sample_rate"].as_str(),
    ) {
        return Err("Audio sample rate changed; no output was published".into());
    }
    if matches!(
        format,
        OutputFormat::Ogg | OutputFormat::Aiff | OutputFormat::Aac
    ) {
        let mut header = [0u8; 12];
        fs::File::open(output)
            .and_then(|mut f| f.read_exact(&mut header))
            .map_err(|e| e.to_string())?;
        let container_matches = match format {
            OutputFormat::Ogg => &header[..4] == b"OggS",
            OutputFormat::Aiff => &header[..4] == b"FORM" && &header[8..] == b"AIFF",
            OutputFormat::Aac => header[0] == 0xff && (header[1] & 0xf6) == 0xf0,
            _ => false,
        };
        if !container_matches {
            return Err("Audio container validation failed; no output was published".into());
        }
    }
    if matches!(format, OutputFormat::M4a | OutputFormat::Alac)
        && !value["format"]["format_name"]
            .as_str()
            .is_some_and(|names| {
                names
                    .split(',')
                    .any(|name| matches!(name, "mov" | "mp4" | "m4a"))
            })
    {
        return Err("M4A output container validation failed".into());
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
    if format == OutputFormat::Txt {
        return convert_pdf_text(job, staged, input, directory, context);
    }
    let total = pdf_page_count(job, staged)?;
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
                job.work_file(&rendered)?,
                job.work_file(staged)?,
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

fn pdf_page_count(job: &Job<'_>, staged: &Path) -> Result<u32, String> {
    let count = job.run(
        "mutool",
        &[
            text("show"),
            job.work_file(staged)?,
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
    Ok(total)
}

fn convert_pdf_text(
    job: &Job<'_>,
    staged: &Path,
    input: &Path,
    directory: &Path,
    context: &ConversionContext,
) -> Result<ConversionResult, String> {
    let total = pdf_page_count(job, staged)?;
    let output = job.cwd.join("output.txt");
    job.run(
        "mutool",
        &[
            text("draw"),
            text("-q"),
            text("-L"),
            text("-F"),
            text("txt"),
            text("-o"),
            job.work_file(&output)?,
            job.work_file(staged)?,
        ],
    )?;
    normalize_text_file(
        &output,
        "PDF has no extractable text layer; OCR is not included",
    )?;
    if let Some(report) = &context.progress {
        report(crate::progress::Progress {
            stage: crate::progress::Stage::Publishing,
            percent: None,
        });
    }
    let saved = publish(
        job,
        &output,
        directory,
        input,
        OutputFormat::Txt,
        None,
        TEXT_OUTPUT_LIMIT,
    )?;
    Ok(ConversionResult {
        path: saved.path.clone(),
        bytes: saved.bytes,
        note: format!(
            "PDF text layer extracted from {total} pages. Images, layout and OCR are omitted."
        ),
        files: vec![saved],
        fingerprint: String::new(),
        total: 1,
        complete: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imagemagick_policy_keeps_default_deny_and_allows_ico_png32_internally() {
        assert!(POLICY.contains(r#"domain="delegate" rights="none" pattern="*""#));
        assert!(POLICY.contains(r#"domain="filter" rights="none" pattern="*""#));
        assert!(POLICY.contains(r#"domain="coder" rights="none" pattern="*""#));
        assert!(POLICY.contains("{PNG,PNG32,JPEG,"));
        assert!(!POLICY.contains("PDF,"));
        assert!(!POLICY.contains(r#"rights="read|write" pattern="*""#));
    }

    #[test]
    fn limited_raster_notes_describe_the_actual_encoding_contract() {
        assert!(image_note("png", OutputFormat::Pbm).contains("thresholded at 50%"));
        assert!(image_note("png", OutputFormat::Xbm).contains("1-bit black-and-white"));
        assert!(image_note("png", OutputFormat::Pgm).contains("8-bit grayscale"));
        assert!(image_note("png", OutputFormat::Xpm).contains("256 colors"));
    }

    #[test]
    fn professional_image_imports_have_separate_sdr_contracts() {
        assert!(fixed_exposure_hdr_input("EXR"));
        assert!(fixed_exposure_hdr_input("HDR"));
        assert!(!fixed_exposure_hdr_input("DPX"));
        assert!(professional_sdr_input("DPX"));
        assert!(image_note("dpx", OutputFormat::Png).contains("decoded DPX interpretation"));
    }

    #[test]
    fn org_text_note_explains_its_markup_semantics() {
        assert!(document_note("org").contains("#+OPTIONS: ^:{}"));
        assert_eq!(
            document_note("md"),
            "Text only; images, layout and formatting are omitted."
        );
    }

    #[test]
    fn audio_sample_rate_contract_allows_only_codec_required_normalization() {
        assert!(audio_output_sample_rate_matches_contract(
            OutputFormat::Opus,
            Some("8000"),
            Some("48000")
        ));
        assert!(!audio_output_sample_rate_matches_contract(
            OutputFormat::Opus,
            Some("8000"),
            Some("8000")
        ));
        assert!(audio_output_sample_rate_matches_contract(
            OutputFormat::Mp3,
            Some("47994"),
            Some("48000")
        ));
        assert!(!audio_output_sample_rate_matches_contract(
            OutputFormat::Mp3,
            Some("47994"),
            Some("44100")
        ));
        assert!(audio_output_sample_rate_matches_contract(
            OutputFormat::Aac,
            Some("10000"),
            Some("11025")
        ));
        assert!(!audio_output_sample_rate_matches_contract(
            OutputFormat::Aac,
            Some("10000"),
            Some("8000")
        ));
        assert!(!audio_output_sample_rate_matches_contract(
            OutputFormat::Flac,
            None,
            Some("48000")
        ));
    }

    #[test]
    fn document_scope_requires_an_explicit_reader() {
        for input in &crate::formats::group("docx").unwrap().inputs {
            assert!(document_reader(input).is_ok(), "{input}");
        }
        assert_eq!(
            document_reader("htm").unwrap(),
            document_reader("html").unwrap()
        );
        assert!(document_reader("xlsx").is_err());
        assert!(output_formats("rtf").is_empty());
    }

    #[test]
    fn plain_text_is_local_bounded_and_normalized() {
        assert!(plain_text_input("txt"));
        assert!(plain_text_input("text"));
        assert!(!plain_text_input("md"));
        assert_eq!(
            normalized_text(b"\xef\xbb\xbfFirst\r\nSecond\rThird\n", "empty").unwrap(),
            b"First\nSecond\nThird\n"
        );
        assert_eq!(
            normalized_text(b"\xff", "empty").unwrap_err(),
            "Text is not valid UTF-8"
        );
        assert_eq!(
            normalized_text(b"valid\0text", "empty").unwrap_err(),
            "Text contains NUL bytes"
        );
        assert_eq!(normalized_text(b" \n\t", "empty").unwrap_err(), "empty");
    }

    #[test]
    fn explicit_media_demuxers_cover_the_reviewed_media_scope() {
        let group = crate::formats::group("mp3").unwrap();
        for input in &group.inputs {
            assert!(media_demuxer(input).is_some(), "{input}");
        }
        assert_eq!(media_demuxer("wma"), Some("asf"));
        assert_eq!(media_demuxer("mp2"), Some("mp3"));
        assert_eq!(media_demuxer("unknown"), None);
    }

    #[test]
    fn engine_work_files_are_relative_and_confined_to_the_private_job() {
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().canonicalize().unwrap();
        let cancel = Cancel::default();
        let engines = Engines {
            entries: Default::default(),
            development: true,
            unavailable: Default::default(),
            bundle: None,
        };
        let job = Job {
            engines: &engines,
            cwd: &cwd,
            cancel: &cancel,
            deadline: Instant::now() + Duration::from_secs(5),
        };
        for name in ["input.pdf", "page.png", "preview.png"] {
            assert_eq!(job.work_file(&cwd.join(name)).unwrap(), text(name));
        }
        assert!(job.work_file(&cwd.join("../input.pdf")).is_err());
        assert!(job.work_file(&cwd.join("nested/input.pdf")).is_err());
        assert!(job.work_file(&cwd).is_err());
    }
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
        assert!(output_formats("PDF").contains(&OutputFormat::Txt));
        assert_eq!(output_formats("docx"), vec![OutputFormat::Txt]);
        assert_eq!(output_formats("txt"), vec![OutputFormat::Txt]);
        assert!(output_formats("svg").contains(&OutputFormat::Heic));
        assert!(output_formats("exr").contains(&OutputFormat::Jxl));
        assert!(!output_formats("png").contains(&OutputFormat::Wav));
        assert!(output_formats("mp4").contains(&OutputFormat::Opus));
        assert!(output_formats("wma").contains(&OutputFormat::Alac));
        assert_eq!(OutputFormat::Alac.extension(), "m4a");
    }
}

#[cfg(test)]
mod encoding_tests {
    use super::*;
    #[test]
    fn rejects_renamed_ppm_and_wrong_container_before_publish() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("result.png");
        for payload in [
            b"P6\n2 2\n255\n".as_slice(),
            b"RIFFxxxxWAVE",
            b"",
            b"\0\0\0\x10ftypheic\0\0\0\0",
        ] {
            fs::write(&path, payload).unwrap();
            for format in [
                OutputFormat::Png,
                OutputFormat::Jpeg,
                OutputFormat::Webp,
                OutputFormat::Avif,
                OutputFormat::Bmp,
                OutputFormat::Tga,
                OutputFormat::Qoi,
            ] {
                assert!(validate_image_encoding(&path, format).is_err());
            }
        }
    }
    #[test]
    fn accepts_target_headers_but_not_avif_text_outside_the_brand_box() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("result");
        for (format, payload) in [
            (OutputFormat::Png, b"\x89PNG\r\n\x1a\n".as_slice()),
            (OutputFormat::Jpeg, b"\xff\xd8\xff"),
            (OutputFormat::Webp, b"RIFFxxxxWEBP"),
            (OutputFormat::Avif, b"\0\0\0\x10ftypavif\0\0\0\0"),
            (OutputFormat::Avif, b"\0\0\0\x14ftypmif1\0\0\0\0avif"),
        ] {
            fs::write(&path, payload).unwrap();
            assert!(validate_image_encoding(&path, format).is_ok());
        }
        fs::write(&path, b"\0\0\0\x10ftypmif1\0\0\0\0avif").unwrap();
        assert!(validate_image_encoding(&path, OutputFormat::Avif).is_err());
    }

    #[test]
    fn target_headers_are_specific_for_expanded_raster_outputs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("result");
        for (format, payload) in [
            (OutputFormat::Pbm, b"P4\n".as_slice()),
            (OutputFormat::Pgm, b"P5\n"),
            (OutputFormat::Ppm, b"P6\n"),
            (OutputFormat::Pnm, b"P3\n"),
            (OutputFormat::Pam, b"P7\n"),
            (OutputFormat::Gif, b"GIF89a"),
            (OutputFormat::Tiff, b"II*\0"),
            (OutputFormat::Ico, b"\0\0\x01\0\x01\0"),
            (OutputFormat::Pcx, b"\x0a\x05\x01\0"),
            (OutputFormat::Xbm, b"#define width 1\n"),
            (OutputFormat::Xpm, b"/* XPM */"),
            (OutputFormat::Heic, b"\0\0\0\x10ftypheic\0\0\0\0"),
            (OutputFormat::Heif, b"\0\0\0\x10ftypmif1\0\0\0\0"),
            (OutputFormat::Jxl, b"\xff\x0a"),
            (OutputFormat::Jxl, b"\0\0\0\x0cJXL \r\n\x87\n"),
        ] {
            fs::write(&path, payload).unwrap();
            assert!(validate_image_encoding(&path, format).is_ok(), "{format:?}");
        }
        fs::write(&path, b"\0\0\0\x10ftypavif\0\0\0\0").unwrap();
        assert!(validate_image_encoding(&path, OutputFormat::Heic).is_err());
        assert!(validate_image_encoding(&path, OutputFormat::Jxl).is_err());
    }
}
