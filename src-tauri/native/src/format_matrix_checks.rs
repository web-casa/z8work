//! Exact package-route acceptance for the reviewed format expansion.
//!
//! This verifier is compiled into the separate `bundle-check` executable only.
//! It runs the production conversion path against the exact bundled engine
//! bytes, but it is deliberately separate from the shorter Phase 27 regression
//! suite: a target may not claim this expanded matrix until its package profile
//! grants every reviewed route and this command has completed successfully.
use crate::{
    convert, hash_file,
    phase2_smoke::{command, name, pdf_fixture},
    Cancel, Engines, OutputFormat,
};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

const TEXT_TOKENS: [&str; 3] = ["Z8_MATRIX_START", "Café 中文", "Z8_MATRIX_END"];
const MATRIX_MARKDOWN: &str = include_str!("../fixtures/format-matrix-source.md");
const HTML_FIXTURE: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Z8 Matrix Fixture</title>
  </head>
  <body>
    <h1>Z8_MATRIX_START</h1>
    <p>Café 中文</p>
    <p>Z8_MATRIX_END</p>
  </body>
</html>
"#;
const DOCBOOK_FIXTURE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<article xmlns="http://docbook.org/ns/docbook" version="5.0">
  <title>Z8_MATRIX_START</title>
  <para>Café 中文</para>
  <para>Z8_MATRIX_END</para>
</article>
"#;
const DOCX_FIXTURE: &[u8] = include_bytes!("../fixtures/format-matrix.docx");
const ODT_FIXTURE: &[u8] = include_bytes!("../fixtures/format-matrix.odt");
const EPUB_FIXTURE: &[u8] = include_bytes!("../fixtures/format-matrix.epub");
const ORG_FIXTURE: &str = "#+OPTIONS: ^:{}\n* Z8_MATRIX_START\nCafé 中文\n\nZ8_MATRIX_END\n";

fn group(id: &str) -> Result<&'static crate::formats::Group, String> {
    crate::formats::groups()
        .iter()
        .find(|group| group.id == id)
        .ok_or_else(|| format!("Missing reviewed format group: {id}"))
}

fn image_path(coder: &str, path: &Path, first_frame: bool) -> String {
    format!(
        "{coder}:{}{}",
        path.display(),
        if first_frame { "[0]" } else { "" }
    )
}

fn command_strings(engines: &Engines, id: &str, args: Vec<String>) -> Result<String, String> {
    let values: Vec<_> = args.iter().map(String::as_str).collect();
    command(engines, id, &values)
}

fn dimensions(engines: &Engines, path: &Path, coder: &str) -> Result<(u32, u32), String> {
    let source = image_path(coder, path, false);
    let value = command(
        engines,
        "magick",
        &["identify", "-format", "%w %h", &source],
    )?;
    let values: Vec<u32> = value
        .split_whitespace()
        .map(str::parse)
        .collect::<Result<_, _>>()
        .map_err(|_| format!("Invalid image dimensions: {value}"))?;
    match values.as_slice() {
        [width, height] if *width > 0 && *height > 0 => Ok((*width, *height)),
        _ => Err(format!("Invalid image dimensions: {value}")),
    }
}

fn image_readback(
    engines: &Engines,
    path: &Path,
    format: OutputFormat,
    expected: (u32, u32),
    root: &Path,
    label: &str,
) -> Result<Value, String> {
    let actual = dimensions(engines, path, format.coder())?;
    if actual != expected {
        return Err(format!(
            "Image readback dimensions changed for {label}: {}x{} (expected {}x{})",
            actual.0, actual.1, expected.0, expected.1
        ));
    }
    let raw = root.join(format!("decoded-{label}.rgba"));
    let source = image_path(format.coder(), path, false);
    let target = format!("RGBA:{}", raw.display());
    command(
        engines,
        "magick",
        &[&source, "-auto-orient", "-depth", "8", &target],
    )?;
    let bytes = fs::read(&raw).map_err(|error| error.to_string())?;
    if bytes.len() != actual.0 as usize * actual.1 as usize * 4 {
        return Err(format!(
            "Image readback has an invalid byte count for {label}"
        ));
    }
    let colours: HashSet<[u8; 4]> = bytes
        .chunks_exact(4)
        .map(|pixel| [pixel[0], pixel[1], pixel[2], pixel[3]])
        .collect();
    if colours.len() < 2 {
        return Err(format!("Image readback is blank for {label}"));
    }
    Ok(json!({
        "kind":"image",
        "reader":"magick",
        "width":actual.0,
        "height":actual.1,
        "distinctColors":colours.len(),
    }))
}

fn make_base_raster(engines: &Engines, root: &Path) -> Result<PathBuf, String> {
    let path = root.join("matrix-source.png");
    let target = image_path("PNG", &path, false);
    command(
        engines,
        "magick",
        &[
            "-size",
            "32x24",
            "xc:black",
            "-fill",
            "white",
            "-draw",
            "rectangle 0,0 15,11",
            "-fill",
            "red",
            "-draw",
            "rectangle 16,0 31,11",
            "-fill",
            "blue",
            "-draw",
            "rectangle 0,12 15,23",
            "-fill",
            "lime",
            "-draw",
            "rectangle 16,12 31,23",
            &target,
        ],
    )?;
    Ok(path)
}

fn professional_fixture_arguments(extension: &str) -> &'static [&'static str] {
    match extension {
        // EXR and Radiance HDR can represent this deliberately over-range
        // fixture, which exercises the fixed exposure path in production.
        "exr" | "hdr" => &["-colorspace", "RGB", "-evaluate", "Multiply", "4"],
        // DPX is an integer, production-image container. Writing over-range
        // samples into it can silently wrap to black, so use valid 10-bit RGB
        // values and exercise its separate SDR import path instead.
        "dpx" => &["-type", "TrueColor", "-depth", "10"],
        _ => &[],
    }
}

fn make_image_input(
    engines: &Engines,
    base: &Path,
    root: &Path,
    extension: &str,
) -> Result<PathBuf, String> {
    let path = root.join(format!("image-input.{extension}"));
    match extension {
        "png" => {
            fs::copy(base, &path).map_err(|error| error.to_string())?;
        }
        "svg" => fs::write(
            &path,
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24" viewBox="0 0 32 24"><rect width="16" height="12" fill="#fff"/><rect x="16" width="16" height="12" fill="#f00"/><rect y="12" width="16" height="12" fill="#00f"/><rect x="16" y="12" width="16" height="12" fill="#0f0"/></svg>"##,
        )
        .map_err(|error| error.to_string())?,
        // This is a checked-in real HEIC decode fixture. The two extensions are
        // aliases at the product boundary, so the byte-identical fixture is
        // intentional and exercises the same declared HEIF container reader.
        "heic" | "heif" => fs::write(
            &path,
            include_bytes!("../../../tests/fixtures/gradient-10bit.heic"),
        )
        .map_err(|error| error.to_string())?,
        "exr" | "hdr" | "dpx" => {
            let source = image_path("PNG", base, false);
            let target = image_path(crate::convert::input_coder(extension), &path, false);
            let mut args = vec![source.as_str()];
            args.extend(professional_fixture_arguments(extension));
            args.push(target.as_str());
            command(engines, "magick", &args)?;
        }
        _ => {
            let source = image_path("PNG", base, false);
            let target = image_path(crate::convert::input_coder(extension), &path, false);
            command(engines, "magick", &[&source, &target])?;
        }
    }
    if !path.is_file()
        || fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .len()
            == 0
    {
        return Err(format!("Did not create image input fixture: {extension}"));
    }
    Ok(path)
}

fn verify_images(engines: &Engines, root: &Path, output: &Path) -> Result<Vec<Value>, String> {
    let base = make_base_raster(engines, root)?;
    let reviewed = group("images")?;
    let mut routes = Vec::new();
    for extension in &reviewed.inputs {
        let input = make_image_input(engines, &base, root, extension)?;
        let expected = if extension == "svg" {
            (32, 24)
        } else {
            dimensions(engines, &input, crate::convert::input_coder(extension))?
        };
        let source_sha256 = hash_file(&input)?;
        for format in &reviewed.outputs {
            let result = convert(engines, &input, output, *format, &Cancel::default())?;
            if hash_file(&input)? != source_sha256 {
                return Err(format!("Image source changed: {extension}"));
            }
            let expected_output = if *format == OutputFormat::Ico {
                (256, 256)
            } else {
                expected
            };
            let evidence = image_readback(
                engines,
                Path::new(&result.path),
                *format,
                expected_output,
                root,
                &format!("image-{extension}-{format:?}"),
            )?;
            routes.push(json!({
                "group":"images",
                "input":extension,
                "output":format,
                "sourceSha256":source_sha256.clone(),
                "sourceUnchanged":true,
                "bytes":result.bytes,
                "evidence":evidence,
            }));
        }
    }
    Ok(routes)
}

fn has_ordered_tokens(value: &str) -> bool {
    let mut cursor = 0;
    for token in TEXT_TOKENS {
        let Some(offset) = value[cursor..].find(token) else {
            return false;
        };
        cursor += offset + token.len();
    }
    true
}

fn has_ordered_pdf_tokens(value: &str) -> bool {
    let mut cursor = 0;
    for token in ["Z8 Page 1", "Z8 Page 2", "Z8 Page 3"] {
        let Some(offset) = value[cursor..].find(token) else {
            return false;
        };
        cursor += offset + token.len();
    }
    true
}

fn verify_pdf(engines: &Engines, root: &Path, output: &Path) -> Result<Vec<Value>, String> {
    let pdf = root.join("matrix.pdf");
    fs::write(&pdf, pdf_fixture(3)).map_err(|error| error.to_string())?;
    let source_sha256 = hash_file(&pdf)?;
    let mut routes = Vec::new();
    for format in &group("pdf")?.outputs {
        let result = convert(engines, &pdf, output, *format, &Cancel::default())?;
        if hash_file(&pdf)? != source_sha256 {
            return Err("PDF source changed".into());
        }
        let evidence = if *format == OutputFormat::Txt {
            let text = fs::read_to_string(&result.path).map_err(|error| error.to_string())?;
            if !has_ordered_pdf_tokens(&text) {
                return Err("PDF text layer is missing expected content".into());
            }
            json!({"kind":"text","reader":"mutool","orderedTokens":true,"chars":text.chars().count()})
        } else {
            if !result.complete || result.total != 3 || result.files.len() != 3 {
                return Err(format!("PDF output count is incomplete for {format:?}"));
            }
            let mut files = Vec::new();
            for (index, file) in result.files.iter().enumerate() {
                let expected = if *format == OutputFormat::Ico {
                    (256, 256)
                } else if index % 2 == 0 {
                    (144, 96)
                } else {
                    (96, 144)
                };
                let evidence = image_readback(
                    engines,
                    Path::new(&file.path),
                    *format,
                    expected,
                    root,
                    &format!("pdf-{format:?}-{}", index + 1),
                )?;
                files.push(json!({
                    "page":file.page,
                    "sha256":file.sha256,
                    "bytes":file.bytes,
                    "evidence":evidence,
                }));
            }
            json!({"kind":"pages","reader":"magick","pages":files})
        };
        routes.push(json!({
            "group":"pdf",
            "input":"pdf",
            "output":format,
            "sourceSha256":source_sha256.clone(),
            "sourceUnchanged":true,
            "bytes":result.bytes,
            "evidence":evidence,
        }));
    }
    Ok(routes)
}

fn make_document_input(markdown: &Path, root: &Path, extension: &str) -> Result<PathBuf, String> {
    let path = root.join(format!("document-input.{extension}"));
    match extension {
        "md" | "markdown" | "mdown" | "mkdn" => {
            fs::copy(markdown, &path).map_err(|error| error.to_string())?;
        }
        "rst" => fs::write(
            &path,
            "Z8_MATRIX_START\n===============\n\nCafé 中文\n\nZ8_MATRIX_END\n",
        )
        .map_err(|error| error.to_string())?,
        "csv" => fs::write(
            &path,
            "marker,value\nZ8_MATRIX_START,Café 中文\nZ8_MATRIX_END,42\n",
        )
        .map_err(|error| error.to_string())?,
        "tsv" => fs::write(
            &path,
            "marker\tvalue\nZ8_MATRIX_START\tCafé 中文\nZ8_MATRIX_END\t42\n",
        )
        .map_err(|error| error.to_string())?,
        // Org interprets unescaped underscores as subscripts. This fixture
        // deliberately uses its documented option to preserve identifiers so
        // the matrix tests text extraction rather than a markup round trip.
        "org" => fs::write(&path, ORG_FIXTURE).map_err(|error| error.to_string())?,
        // These are inputs to the product's Pandoc reader. Do not create
        // DOCX/ODT/EPUB by invoking the bundled writer here: the writer needs
        // its own template data and would test a different code path from the
        // sandboxed input-to-text conversion. Deterministic, checked-in files
        // keep the matrix focused on the advertised reader route.
        "html" | "htm" => fs::write(&path, HTML_FIXTURE).map_err(|error| error.to_string())?,
        "docx" => fs::write(&path, DOCX_FIXTURE).map_err(|error| error.to_string())?,
        "odt" => fs::write(&path, ODT_FIXTURE).map_err(|error| error.to_string())?,
        "epub" => fs::write(&path, EPUB_FIXTURE).map_err(|error| error.to_string())?,
        "docbook" => fs::write(&path, DOCBOOK_FIXTURE).map_err(|error| error.to_string())?,
        _ => return Err(format!("Unexpected reviewed document input: {extension}")),
    }
    if !path.is_file()
        || fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .len()
            == 0
    {
        return Err(format!(
            "Did not create document input fixture: {extension}"
        ));
    }
    Ok(path)
}

fn verify_text_routes(engines: &Engines, root: &Path, output: &Path) -> Result<Vec<Value>, String> {
    let mut routes = Vec::new();
    let plain = "\u{feff}Z8_MATRIX_START\r\nCafé 中文\r\nZ8_MATRIX_END\r\n";
    for extension in &group("plain-text")?.inputs {
        let input = root.join(format!("plain-input.{extension}"));
        fs::write(&input, plain).map_err(|error| error.to_string())?;
        let source_sha256 = hash_file(&input)?;
        let result = convert(
            engines,
            &input,
            output,
            OutputFormat::Txt,
            &Cancel::default(),
        )?;
        let text = fs::read_to_string(&result.path).map_err(|error| error.to_string())?;
        if text != "Z8_MATRIX_START\nCafé 中文\nZ8_MATRIX_END\n" {
            return Err(format!(
                "Plain text normalization changed content: {extension}"
            ));
        }
        if hash_file(&input)? != source_sha256 {
            return Err(format!("Plain text source changed: {extension}"));
        }
        routes.push(json!({
            "group":"plain-text",
            "input":extension,
            "output":"txt",
            "sourceSha256":source_sha256.clone(),
            "sourceUnchanged":true,
            "bytes":result.bytes,
            "evidence":{"kind":"text","reader":"native","orderedTokens":true,"chars":text.chars().count()},
        }));
    }
    Ok(routes)
}

fn verify_documents(engines: &Engines, root: &Path, output: &Path) -> Result<Vec<Value>, String> {
    let markdown = root.join("matrix-source.md");
    fs::write(&markdown, MATRIX_MARKDOWN).map_err(|error| error.to_string())?;
    let mut routes = Vec::new();
    for extension in &group("documents")?.inputs {
        let input = make_document_input(&markdown, root, extension)?;
        let source_sha256 = hash_file(&input)?;
        let result = convert(
            engines,
            &input,
            output,
            OutputFormat::Txt,
            &Cancel::default(),
        )?;
        let text = fs::read_to_string(&result.path).map_err(|error| error.to_string())?;
        if !has_ordered_tokens(&text) {
            return Err(format!(
                "Document text is incomplete or reordered: {extension}"
            ));
        }
        if hash_file(&input)? != source_sha256 {
            return Err(format!("Document source changed: {extension}"));
        }
        routes.push(json!({
            "group":"documents",
            "input":extension,
            "output":"txt",
            "sourceSha256":source_sha256.clone(),
            "sourceUnchanged":true,
            "bytes":result.bytes,
            "evidence":{"kind":"text","reader":"pandoc","orderedTokens":true,"chars":text.chars().count()},
        }));
    }
    Ok(routes)
}

fn make_amr(path: &Path) -> Result<(), String> {
    // AMR-NB FT=0 (4.75 kbit/s) has a 12-byte payload. A one-second sequence
    // of zero-coded frames is a valid, deterministic silence fixture and avoids
    // depending on an optional AMR encoder in the target FFmpeg build.
    let mut bytes = b"#!AMR\n".to_vec();
    for _ in 0..50 {
        bytes.push(0x04); // F=0, FT=0, Q=1, padding=0.
        bytes.extend_from_slice(&[0; 12]);
    }
    fs::write(path, bytes).map_err(|error| error.to_string())
}

fn make_audio_input(engines: &Engines, root: &Path, extension: &str) -> Result<PathBuf, String> {
    let path = root.join(format!("audio-input.{extension}"));
    if extension == "amr" {
        make_amr(&path)?;
        return Ok(path);
    }
    let tone = "aevalsrc=0.2*sin(2*PI*440*t)|0.2*sin(2*PI*880*t):s=48000:d=1";
    let (codec, muxer) = match extension {
        "mp3" => ("libmp3lame", "mp3"),
        "wav" => ("pcm_s16le", "wav"),
        "flac" => ("flac", "flac"),
        "ogg" | "oga" => ("libvorbis", "ogg"),
        "m4a" => ("aac", "ipod"),
        "opus" => ("libopus", "opus"),
        "aiff" | "aif" => ("pcm_s16be", "aiff"),
        "mka" => ("flac", "matroska"),
        "weba" => ("libopus", "webm"),
        "aac" => ("aac", "adts"),
        "ac3" => ("ac3", "ac3"),
        "au" => ("pcm_s16be", "au"),
        "caf" => ("pcm_s16le", "caf"),
        "wma" => ("wmav2", "asf"),
        "mp2" => ("mp2", "mp2"),
        "voc" => ("pcm_u8", "voc"),
        "wv" => ("wavpack", "wv"),
        "mp4" | "mov" | "mkv" | "webm" => {
            let (video_codec, audio_codec, container) = match extension {
                "mp4" | "mov" => ("mpeg4", "aac", extension),
                "mkv" => ("ffv1", "flac", "matroska"),
                "webm" => ("libvpx-vp9", "libopus", "webm"),
                _ => unreachable!(),
            };
            command_strings(
                engines,
                "ffmpeg",
                vec![
                    "-nostdin".into(),
                    "-y".into(),
                    "-v".into(),
                    "error".into(),
                    "-f".into(),
                    "lavfi".into(),
                    "-i".into(),
                    "color=c=red:s=16x16:r=10".into(),
                    "-f".into(),
                    "lavfi".into(),
                    "-i".into(),
                    tone.into(),
                    "-t".into(),
                    "1".into(),
                    "-c:v".into(),
                    video_codec.into(),
                    "-c:a".into(),
                    audio_codec.into(),
                    "-f".into(),
                    container.into(),
                    name(&path).into(),
                ],
            )?;
            return Ok(path);
        }
        _ => return Err(format!("Unexpected reviewed media input: {extension}")),
    };
    command_strings(
        engines,
        "ffmpeg",
        vec![
            "-nostdin".into(),
            "-y".into(),
            "-v".into(),
            "error".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            tone.into(),
            "-c:a".into(),
            codec.into(),
            "-f".into(),
            muxer.into(),
            name(&path).into(),
        ],
    )?;
    if !path.is_file()
        || fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .len()
            == 0
    {
        return Err(format!("Did not create media input fixture: {extension}"));
    }
    Ok(path)
}

fn audio_probe(engines: &Engines, path: &Path) -> Result<Value, String> {
    serde_json::from_str(&command(
        engines,
        "ffprobe",
        &[
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,sample_rate,channels:format=duration,format_name",
            "-of",
            "json",
            name(path),
        ],
    )?)
    .map_err(|error| error.to_string())
}

fn probe_duration(value: &Value) -> Result<f64, String> {
    value["format"]["duration"]
        .as_str()
        .ok_or("Missing audio duration")?
        .parse()
        .map_err(|_| "Invalid audio duration".into())
}

fn expected_audio_codec(format: OutputFormat) -> &'static str {
    match format {
        OutputFormat::Wav => "pcm_s16le",
        OutputFormat::Mp3 => "mp3",
        OutputFormat::Flac => "flac",
        OutputFormat::Opus => "opus",
        OutputFormat::M4a | OutputFormat::Aac => "aac",
        OutputFormat::Ogg => "vorbis",
        OutputFormat::Aiff => "pcm_s16be",
        OutputFormat::Alac => "alac",
        _ => unreachable!("not an audio output"),
    }
}

fn audio_readback(
    engines: &Engines,
    input: &Path,
    output: &Path,
    format: OutputFormat,
) -> Result<Value, String> {
    let source = audio_probe(engines, input)?;
    let decoded = audio_probe(engines, output)?;
    let input_stream = source["streams"]
        .get(0)
        .ok_or("Missing input audio stream")?;
    let output_stream = decoded["streams"]
        .get(0)
        .ok_or("Missing output audio stream")?;
    let source_duration = probe_duration(&source)?;
    let output_duration = probe_duration(&decoded)?;
    let duration_delta = (source_duration - output_duration).abs();
    if output_stream["codec_name"] != expected_audio_codec(format)
        || input_stream["channels"] != output_stream["channels"]
        || !crate::convert::audio_output_sample_rate_matches_contract(
            format,
            input_stream["sample_rate"].as_str(),
            output_stream["sample_rate"].as_str(),
        )
        || duration_delta > 0.2
    {
        return Err(format!(
            "Audio readback differs for {format:?}: {source} -> {decoded}"
        ));
    }
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-i",
            name(output),
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
    )?;
    Ok(json!({
        "kind":"audio",
        "reader":"ffprobe+ffmpeg",
        "codec":expected_audio_codec(format),
        "channels":output_stream["channels"],
        "sampleRate":output_stream["sample_rate"],
        "durationSeconds":output_duration,
        "durationDeltaSeconds":duration_delta,
    }))
}

fn verify_media(engines: &Engines, root: &Path, output: &Path) -> Result<Vec<Value>, String> {
    let mut routes = Vec::new();
    let reviewed = group("media")?;
    for extension in &reviewed.inputs {
        let input = make_audio_input(engines, root, extension)?;
        let source_sha256 = hash_file(&input)?;
        for format in &reviewed.outputs {
            let result = convert(engines, &input, output, *format, &Cancel::default())?;
            if hash_file(&input)? != source_sha256 {
                return Err(format!("Media source changed: {extension}"));
            }
            let evidence = audio_readback(engines, &input, Path::new(&result.path), *format)?;
            routes.push(json!({
                "group":"media",
                "input":extension,
                "output":format,
                "sourceSha256":source_sha256.clone(),
                "sourceUnchanged":true,
                "bytes":result.bytes,
                "evidence":evidence,
            }));
        }
    }
    Ok(routes)
}

fn require_full_package_acceptance(engines: &Engines) -> Result<(), String> {
    for reviewed in crate::formats::groups() {
        for input in &reviewed.inputs {
            if engines.formats_for(input) != reviewed.outputs {
                return Err(format!(
                    "Package acceptance does not grant every reviewed route for {input}; run this verifier only on an expanded target candidate"
                ));
            }
        }
    }
    Ok(())
}

fn assert_exact_coverage(routes: &[Value]) -> Result<(), String> {
    let mut expected = HashSet::new();
    for reviewed in crate::formats::groups() {
        for input in &reviewed.inputs {
            for output in &reviewed.outputs {
                expected.insert(format!(
                    "{}:{input}:{}",
                    reviewed.id,
                    format!("{output:?}").to_ascii_lowercase()
                ));
            }
        }
    }
    let mut actual = HashSet::new();
    for route in routes {
        let group = route["group"]
            .as_str()
            .ok_or("Matrix route is missing group")?;
        let input = route["input"]
            .as_str()
            .ok_or("Matrix route is missing input")?;
        let output = route["output"]
            .as_str()
            .ok_or("Matrix route is missing output")?;
        let key = format!("{group}:{input}:{output}");
        if !actual.insert(key.clone()) || !expected.contains(&key) {
            return Err(format!("Unexpected or duplicate matrix route: {key}"));
        }
    }
    if actual != expected {
        return Err("Format matrix route coverage is incomplete".into());
    }
    Ok(())
}

pub fn verify(engines: &Engines) -> Result<Value, String> {
    engines.verify_bundle()?;
    require_full_package_acceptance(engines)?;
    let root = tempfile::tempdir().map_err(|error| error.to_string())?;
    let output = root.path().join("output");
    fs::create_dir(&output).map_err(|error| error.to_string())?;
    let mut routes = verify_images(engines, root.path(), &output)?;
    routes.extend(verify_pdf(engines, root.path(), &output)?);
    routes.extend(verify_text_routes(engines, root.path(), &output)?);
    routes.extend(verify_documents(engines, root.path(), &output)?);
    routes.extend(verify_media(engines, root.path(), &output)?);
    assert_exact_coverage(&routes)?;
    Ok(json!({
        "schema":1,
        "scope":crate::formats::scope_id(),
        "platform":std::env::consts::OS,
        "arch":std::env::consts::ARCH,
        "engines":engines.info(),
        "routes":routes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reviewed_scope_has_no_duplicate_route_keys() {
        let mut routes = HashSet::new();
        for reviewed in crate::formats::groups() {
            for input in &reviewed.inputs {
                for output in &reviewed.outputs {
                    assert!(routes.insert(format!(
                        "{}:{input}:{}",
                        reviewed.id,
                        format!("{output:?}").to_ascii_lowercase()
                    )));
                }
            }
        }
        assert!(routes.len() > 800);
    }

    #[test]
    fn amr_fixture_has_a_valid_header_and_one_second_of_frames() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("fixture.amr");
        make_amr(&path).unwrap();
        let bytes = fs::read(path).unwrap();
        assert!(bytes.starts_with(b"#!AMR\n"));
        assert_eq!(bytes.len(), 6 + 50 * 13);
        assert!(bytes[6..].chunks_exact(13).all(|frame| frame[0] == 0x04));
    }

    #[test]
    fn dpx_fixture_keeps_pixels_in_its_representable_ten_bit_range() {
        assert_eq!(
            professional_fixture_arguments("dpx"),
            ["-type", "TrueColor", "-depth", "10"]
        );
        assert!(!professional_fixture_arguments("dpx").contains(&"Multiply"));
        assert_eq!(
            professional_fixture_arguments("exr"),
            ["-colorspace", "RGB", "-evaluate", "Multiply", "4"]
        );
    }

    #[test]
    fn checked_in_document_archives_are_nonempty_zip_inputs() {
        for archive in [DOCX_FIXTURE, ODT_FIXTURE, EPUB_FIXTURE] {
            assert!(archive.starts_with(b"PK\x03\x04"));
            assert!(archive.len() > 1024);
        }
        assert!(MATRIX_MARKDOWN.contains("Z8_MATRIX_START"));
        assert!(MATRIX_MARKDOWN.contains("Café 中文"));
        assert!(MATRIX_MARKDOWN.contains("Z8_MATRIX_END"));
    }

    #[test]
    fn org_fixture_declares_literal_identifier_semantics() {
        assert!(ORG_FIXTURE.starts_with("#+OPTIONS: ^:{}\n"));
        assert!(ORG_FIXTURE.contains("Z8_MATRIX_START"));
        assert!(ORG_FIXTURE.contains("Z8_MATRIX_END"));
    }

    #[test]
    fn audio_matrix_uses_the_shared_opus_sample_rate_contract() {
        assert!(crate::convert::audio_output_sample_rate_matches_contract(
            OutputFormat::Opus,
            Some("8000"),
            Some("48000")
        ));
        assert!(!crate::convert::audio_output_sample_rate_matches_contract(
            OutputFormat::Aac,
            Some("8000"),
            Some("48000")
        ));
    }
}
