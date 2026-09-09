//! Finite M2 real-engine checks. Uses only generated/checked-in fixtures.
use crate::{
    convert, convert_source, hash_file, process::run, Cancel, ConversionContext, ConversionResult,
    Engines, Options, OutputFormat, Quality,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
pub(crate) fn command(engines: &Engines, id: &str, args: &[&str]) -> Result<String, String> {
    eprintln!("[validation] {id} {args:?}");
    let mut cmd = engines.command(id)?;
    // Explicit raster coders avoid treating a Windows drive letter (e.g. C:)
    // as an ImageMagick coder. Production conversions already use coder_path.
    let arguments: Vec<String> = args
        .iter()
        .map(|arg| {
            if id == "magick" && Path::new(arg).is_absolute() {
                let coder = match Path::new(arg).extension().and_then(|e| e.to_str()) {
                    Some("png") => Some("PNG"),
                    Some("jpg" | "jpeg") => Some("JPEG"),
                    Some("webp") => Some("WEBP"),
                    Some("avif") => Some("AVIF"),
                    Some("heic" | "heif") => Some("HEIC"),
                    _ => None,
                };
                if let Some(coder) = coder {
                    return format!("{coder}:{arg}");
                }
            }
            arg.to_string()
        })
        .collect();
    cmd.args(arguments);
    if id == "pandoc" {
        if let Some(data) = engines.data_dir(id) {
            cmd.arg("--data-dir").arg(data);
        }
    }
    run(
        cmd,
        &Cancel::default(),
        Instant::now() + Duration::from_secs(30),
    )
}
pub(crate) fn name(p: &Path) -> &str {
    p.to_str().unwrap()
}
fn decode(engines: &Engines, path: &Path) -> Result<(), String> {
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-i",
            name(path),
            "-f",
            "null",
            "-",
        ],
    )?;
    Ok(())
}
pub fn pdf_fixture(pages: u32) -> Vec<u8> {
    let mut objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        format!(
            "<< /Type /Pages /Kids [{}] /Count {pages} >>",
            (0..pages)
                .map(|p| format!("{} 0 R", 3 + p * 2))
                .collect::<Vec<_>>()
                .join(" ")
        ),
    ];
    for page in 0..pages {
        let (w, h, color) = if page % 2 == 0 {
            (72, 48, "1 0 0")
        } else {
            (48, 72, "0 1 0")
        };
        let stream = format!(
            "{color} rg 0 0 {w} {h} re f\n1 1 1 rg BT /F1 10 Tf 6 12 Td (Z8 Page {}) Tj ET\n",
            page + 1
        );
        objects.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents {} 0 R >>",4+page*2));
        objects.push(format!(
            "<< /Length {} >>\nstream\n{stream}endstream",
            stream.len()
        ));
    }
    let mut pdf = "%PDF-1.4\n".to_string();
    let mut offsets = vec![0];
    for (i, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.push_str(&format!("{} 0 obj\n{object}\nendobj\n", i + 1));
    }
    let xref = pdf.len();
    pdf.push_str(&format!(
        "xref\n0 {}\n0000000000 65535 f \n",
        objects.len() + 1
    ));
    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{offset:010} 00000 n \n"));
    }
    pdf.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
        objects.len() + 1
    ));
    pdf.into_bytes()
}
pub(crate) fn source(
    path: &Path,
    context: ConversionContext,
) -> Result<crate::queue::Source, String> {
    Ok(crate::queue::Source {
        file: crate::input::open_regular(path).map_err(|e| e.to_string())?,
        name: path.to_path_buf(),
        context,
    })
}
fn partial(engines: &Engines, pdf: &Path, output: &Path) -> Result<ConversionResult, String> {
    let cancel = Cancel::default();
    let token = cancel.clone();
    let progress: Arc<Mutex<Option<ConversionResult>>> = Arc::new(Mutex::new(None));
    let saved = progress.clone();
    let context = ConversionContext {
        report: Some(Arc::new(move |r| {
            if r.files.len() == 1 {
                token.cancel();
            }
            *saved.lock().unwrap() = Some(r);
            Ok(())
        })),
        ..Default::default()
    };
    let error = convert_source(
        engines,
        source(pdf, context)?,
        output,
        OutputFormat::Png,
        &cancel,
    )
    .unwrap_err();
    if error != "Cancelled" {
        return Err(error);
    }
    let result = progress
        .lock()
        .unwrap()
        .clone()
        .ok_or("Missing partial PDF result")?;
    if result.files.len() != 1 || result.complete {
        return Err("Partial PDF semantics failed".into());
    }
    Ok(result)
}
pub fn verify(manifest: &Path) -> Result<Value, String> {
    let engines = Engines::load(manifest)?;
    verify_engines(engines, Some(manifest))
}
pub fn verify_engines(
    engines: Engines,
    development_manifest: Option<&Path>,
) -> Result<Value, String> {
    let root = tempfile::tempdir().map_err(|e| format!("Create validation workspace: {e}"))?;
    let output = root.path().join("保存 results");
    fs::create_dir(&output).map_err(|e| format!("Create validation output: {e}"))?;
    let mut cases = vec![];
    let png = root.path().join("alpha.png");
    command(
        &engines,
        "magick",
        &[
            "-size",
            "64x48",
            "xc:none",
            "-fill",
            "red",
            "-draw",
            "rectangle 0,0 31,47",
            name(&png),
        ],
    )?;
    if !png.is_file() {
        return Err(format!(
            "ImageMagick did not create fixture: {}",
            png.display()
        ));
    }
    let mut images = vec![png.clone()];
    for format in [OutputFormat::Jpeg, OutputFormat::Webp, OutputFormat::Avif] {
        images.push(PathBuf::from(
            convert(&engines, &png, &output, format, &Cancel::default())
                .map_err(|e| format!("Prepare {format:?} fixture: {e}"))?
                .path,
        ));
    }
    let heic = root.path().join("gradient.heic");
    fs::write(
        &heic,
        include_bytes!("../../../tests/fixtures/gradient-10bit.heic"),
    )
    .map_err(|e| e.to_string())?;
    let heif = root.path().join("alias.heif");
    fs::copy(&heic, &heif).map_err(|e| e.to_string())?;
    let jpeg = root.path().join("alias.jpeg");
    fs::copy(&images[1], &jpeg).map_err(|e| e.to_string())?;
    // Ensure both JPEG extensions are real decoder inputs.
    let jpg = root.path().join("alias.jpg");
    fs::copy(&images[1], &jpg).map_err(|e| e.to_string())?;
    images[1] = jpg;
    images.extend([heic, heif, jpeg]);
    for input in &images {
        for format in [
            OutputFormat::Png,
            OutputFormat::Jpeg,
            OutputFormat::Webp,
            OutputFormat::Avif,
        ] {
            eprintln!("[validation] convert {} -> {format:?}", input.display());
            let result = convert(&engines, input, &output, format, &Cancel::default())?;
            decode(&engines, Path::new(&result.path))?;
            let semantic = crate::phase27_smoke::image_semantics(
                &engines,
                input,
                Path::new(&result.path),
                format,
                root.path(),
            )?;
            cases.push(json!({"input":input.extension().unwrap().to_string_lossy(),"inputSha256":hash_file(input)?,"output":format,"bytes":result.bytes,"decoded":true,"semantic":semantic}));
        }
    }
    let png_result = convert(
        &engines,
        &png,
        &output,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    for (input, raw) in [
        (&png, root.path().join("before.rgba")),
        (
            &PathBuf::from(&png_result.path),
            root.path().join("after.rgba"),
        ),
    ] {
        command(
            &engines,
            "magick",
            &[
                name(input),
                "-depth",
                "16",
                &format!("RGBA:{}", raw.display()),
            ],
        )?;
    }
    if fs::read(root.path().join("before.rgba")).unwrap()
        != fs::read(root.path().join("after.rgba")).unwrap()
    {
        return Err("PNG alpha/pixel roundtrip changed".into());
    }
    let xmp = root.path().join("metadata.xmp");
    fs::write(&xmp, r#"<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="Z8 fixture"/></rdf:RDF></x:xmpmeta>"#).unwrap();
    let metadata_png = root.path().join("metadata.png");
    command(
        &engines,
        "magick",
        &[name(&png), "-profile", name(&xmp), name(&metadata_png)],
    )?;
    if !command(
        &engines,
        "magick",
        &["identify", "-format", "%[profiles]", name(&metadata_png)],
    )?
    .contains("xmp")
    {
        return Err("XMP fixture was not embedded".into());
    }
    for keep_metadata in [false, true] {
        let result = convert_source(
            &engines,
            source(
                &metadata_png,
                ConversionContext {
                    options: Options {
                        keep_metadata,
                        ..Default::default()
                    },
                    ..Default::default()
                },
            )?,
            &output,
            OutputFormat::Png,
            &Cancel::default(),
        )?;
        let profiles = command(
            &engines,
            "magick",
            &["identify", "-format", "%[profiles]", &result.path],
        )?;
        if profiles.contains("xmp") != keep_metadata {
            return Err("Metadata toggle did not match encoded output".into());
        }
    }
    let gradient = root.path().join("gradient16.png");
    command(
        &engines,
        "magick",
        &[
            "-size",
            "256x64",
            "gradient:black-white",
            "-depth",
            "16",
            name(&gradient),
        ],
    )?;
    let highdepth = convert(
        &engines,
        &gradient,
        &output,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    for (input, raw) in [
        (name(&gradient), "depth-before"),
        (&highdepth.path, "depth-after"),
    ] {
        command(
            &engines,
            "magick",
            &[
                input,
                "-depth",
                "16",
                &format!("RGBA:{}", root.path().join(raw).display()),
            ],
        )?;
    }
    if fs::read(root.path().join("depth-before")).unwrap()
        != fs::read(root.path().join("depth-after")).unwrap()
    {
        return Err("16-bit PNG pixel roundtrip changed".into());
    }
    let photo = root.path().join("calibration.png");
    command(
        &engines,
        "magick",
        &[
            "-seed",
            "42",
            "-size",
            "256x256",
            "plasma:fractal",
            "-depth",
            "8",
            name(&photo),
        ],
    )?;
    let mut calibration = vec![];
    for format in [OutputFormat::Avif, OutputFormat::Webp, OutputFormat::Jpeg] {
        let mut sizes = vec![];
        for quality in [Quality::Small, Quality::Balanced, Quality::High] {
            let options = Options {
                quality,
                ..Default::default()
            };
            let result = convert_source(
                &engines,
                source(
                    &photo,
                    ConversionContext {
                        options,
                        ..Default::default()
                    },
                )?,
                &output,
                format,
                &Cancel::default(),
            )?;
            decode(&engines, Path::new(&result.path))?;
            sizes.push(result.bytes);
            calibration.push(json!({"format":format,"preset":quality,"bytes":result.bytes}));
        }
        if sizes[0] >= sizes[2] {
            return Err(format!(
                "Quality presets did not affect calibration fixture: {format:?}"
            ));
        }
    }
    let audio = root.path().join("source.mp3");
    command(
        &engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.2*sin(2*PI*440*t)|0.2*sin(2*PI*880*t):s=48000:d=1",
            "-c:a",
            "libmp3lame",
            name(&audio),
        ],
    )?;
    let formats = [
        OutputFormat::Wav,
        OutputFormat::Mp3,
        OutputFormat::Flac,
        OutputFormat::Opus,
        OutputFormat::M4a,
    ];
    let mut audio_inputs = vec![audio.clone()];
    for format in formats {
        if format != OutputFormat::Mp3 {
            audio_inputs.push(PathBuf::from(
                convert(&engines, &audio, &output, format, &Cancel::default())?.path,
            ));
        }
    }
    let ogg = root.path().join("source.ogg");
    command(
        &engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-i",
            name(&audio),
            "-c:a",
            "libvorbis",
            name(&ogg),
        ],
    )?;
    audio_inputs.push(ogg);
    for (ext, vc, ac) in [
        ("mp4", "mpeg4", "aac"),
        ("mov", "mpeg4", "aac"),
        ("mkv", "ffv1", "flac"),
        ("webm", "libvpx-vp9", "libopus"),
    ] {
        let video = root.path().join(format!("video.{ext}"));
        command(
            &engines,
            "ffmpeg",
            &[
                "-nostdin",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=16x16:r=10",
                "-i",
                name(&audio),
                "-t",
                "0.3",
                "-c:v",
                vc,
                "-c:a",
                ac,
                name(&video),
            ],
        )?;
        audio_inputs.push(video);
    }
    for input in audio_inputs {
        for format in formats {
            let result = convert(&engines, &input, &output, format, &Cancel::default())?;
            decode(&engines, Path::new(&result.path))?;
            let semantic =
                crate::phase27_smoke::audio_semantics(&engines, &input, Path::new(&result.path))?;
            cases.push(json!({"input":input.extension().unwrap().to_string_lossy(),"inputSha256":hash_file(&input)?,"output":format,"bytes":result.bytes,"decoded":true,"semantic":semantic}));
        }
    }
    let pdf = root.path().join("三页 [0].pdf");
    fs::write(&pdf, pdf_fixture(3)).map_err(|e| e.to_string())?;
    for format in [
        OutputFormat::Png,
        OutputFormat::Jpeg,
        OutputFormat::Webp,
        OutputFormat::Avif,
    ] {
        let result = convert(&engines, &pdf, &output, format, &Cancel::default())?;
        if !result.complete || result.total != 3 || result.files.len() != 3 {
            return Err("PDF page count mismatch".into());
        }
        for (i, file) in result.files.iter().enumerate() {
            decode(&engines, Path::new(&file.path))?;
            let size = command(
                &engines,
                "magick",
                &["identify", "-format", "%w %h", &file.path],
            )?;
            if size != if i % 2 == 0 { "144 96" } else { "96 144" } {
                return Err("PDF dimensions/order mismatch".into());
            }
            crate::phase27_smoke::pdf_font_semantics(&engines, Path::new(&file.path), root.path())?;
            if file.page != i as u32 + 1 || !file.path.contains(&format!("page-{:03}", i + 1)) {
                return Err("PDF page filename mismatch".into());
            }
        }
        cases.push(
            json!({"input":"pdf","output":format,"pages":3,"decoded":true,"bytes":result.bytes,"inputSha256":hash_file(&pdf)?,"semantic":{"dimensions_order_names":true,"base14_font_visible":true}}),
        );
    }
    let partial_dir = root.path().join("partial");
    fs::create_dir(&partial_dir).unwrap();
    let partial = partial(&engines, &pdf, &partial_dir)?;
    let first = partial.files[0].clone();
    let resumed = convert_source(
        &engines,
        source(
            &pdf,
            ConversionContext {
                resume: Some(partial.clone()),
                ..Default::default()
            },
        )?,
        &partial_dir,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    if !resumed.complete
        || resumed.files.len() != 3
        || resumed.files[0].path != first.path
        || hash_file(Path::new(&first.path))? != first.sha256
        || fs::read_dir(&partial_dir).unwrap().count() != 3
    {
        return Err("PDF resume repeated or damaged a saved page".into());
    }
    // A deleted page is regenerated; a changed input/preset must not reuse pages.
    fs::remove_file(&first.path).unwrap();
    let regenerated = convert_source(
        &engines,
        source(
            &pdf,
            ConversionContext {
                resume: Some(partial.clone()),
                ..Default::default()
            },
        )?,
        &partial_dir,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    if regenerated.files.len() != 3 || !Path::new(&regenerated.files[0].path).exists() {
        return Err("Deleted PDF page was not regenerated".into());
    }
    let changed = convert_source(
        &engines,
        source(
            &pdf,
            ConversionContext {
                resume: Some(partial.clone()),
                options: Options {
                    pdf_dpi: 72,
                    ..Default::default()
                },
                report: None,
                ..Default::default()
            },
        )?,
        &partial_dir,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    if changed.files[0].path == regenerated.files[0].path {
        return Err("Changed settings reused an old page".into());
    }
    let mut changed_pdf = pdf_fixture(3);
    // Change actual contents while retaining page count and task settings.
    let offset = changed_pdf
        .windows(8)
        .position(|bytes| bytes == b"1 0 0 rg")
        .unwrap();
    changed_pdf[offset..offset + 8].copy_from_slice(b"0 0 1 rg");
    fs::write(&pdf, changed_pdf).unwrap();
    let changed_input = convert_source(
        &engines,
        source(
            &pdf,
            ConversionContext {
                resume: Some(partial),
                ..Default::default()
            },
        )?,
        &partial_dir,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    if changed_input.files[0].path == first.path || changed_input.files[0].sha256 == first.sha256 {
        return Err("Changed PDF input reused an old page".into());
    }
    let long_name = root.path().join(format!("{}.pdf", "😀".repeat(60)));
    fs::write(&long_name, pdf_fixture(1)).unwrap();
    let long_result = convert(
        &engines,
        &long_name,
        &output,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    if Path::new(&long_result.path)
        .file_name()
        .unwrap()
        .as_encoded_bytes()
        .len()
        > 255
    {
        return Err("Unicode output filename exceeded budget".into());
    }
    let masquerade = root.path().join("playlist.mp4");
    fs::write(
        &masquerade,
        format!("#EXTM3U\n#EXTINF:1,\n{}\n", audio.display()),
    )
    .unwrap();
    if convert(
        &engines,
        &masquerade,
        &output,
        OutputFormat::Wav,
        &Cancel::default(),
    )
    .is_ok()
    {
        return Err("Disguised playlist was accepted".into());
    }
    let over = root.path().join("201.pdf");
    fs::write(&over, pdf_fixture(201)).unwrap();
    if !convert(
        &engines,
        &over,
        &output,
        OutputFormat::Png,
        &Cancel::default(),
    )
    .unwrap_err()
    .contains("200 pages")
    {
        return Err("PDF page limit was bypassed".into());
    }
    let md = root.path().join("text.md");
    fs::write(
        &md,
        "# 标题\n\n中文 **body** ![image](https://invalid.example/image.png)",
    )
    .unwrap();
    let docx = root.path().join("text.docx");
    fs::write(
        &docx,
        include_bytes!("../../../desktop/tests/fixtures/text.docx"),
    )
    .map_err(|e| e.to_string())?;
    for doc in [&md, &docx] {
        let result = convert(
            &engines,
            doc,
            &output,
            OutputFormat::Txt,
            &Cancel::default(),
        )?;
        let text = fs::read_to_string(&result.path).unwrap();
        if !text.contains("中文") || !text.contains("body") {
            return Err("Document text lost".into());
        }
        cases.push(json!({"input":doc.extension().unwrap().to_string_lossy(),"output":"txt","inputSha256":hash_file(doc)?,"text_checked":true}));
    }
    if let Some(manifest) = development_manifest {
        let mut missing: Value = serde_json::from_slice(&fs::read(manifest).unwrap()).unwrap();
        missing["engines"].as_object_mut().unwrap().remove("pandoc");
        let missing_path = root.path().join("missing.json");
        fs::write(&missing_path, serde_json::to_vec(&missing).unwrap()).unwrap();
        let degraded = Engines::load_available(&missing_path)?;
        if !degraded.formats_for("docx").is_empty() || degraded.formats_for("png").len() != 4 {
            return Err("Missing engine blocked unrelated capabilities".into());
        }
        convert(
            &degraded,
            &png,
            &output,
            OutputFormat::Avif,
            &Cancel::default(),
        )?;
    }
    Ok(
        json!({"scope":if development_manifest.is_some() { "M2 local development engines; not a released package" } else { "M3 bundled engine verification; not installer certification" },"platform":format!("{}-{}",std::env::consts::OS,std::env::consts::ARCH),"engines":engines.info(),"routes":cases,"calibration":calibration,"checks":{"png_alpha_pixels":true,"xmp_metadata_toggle":true,"png_16bit_pixels":true,"pdf_page_order_dimensions":true,"pdf_partial_cancel":true,"pdf_resume_no_duplicate":true,"pdf_missing_page_regenerated":true,"pdf_changed_settings_no_reuse":true,"pdf_changed_input_no_reuse":true,"pdf_200_page_limit":true,"missing_pandoc_keeps_images":development_manifest.is_some(),"unicode_filename_budget":true,"disguised_playlist_rejected":true,"audio_duration_channels":true}}),
    )
}
