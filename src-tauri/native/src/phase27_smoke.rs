//! R4 real sample semantics. Test supervisor only; no desktop IPC entry.
use crate::{
    convert_source, hash_file,
    phase2_smoke::{command, name, source},
    Cancel, ConversionContext, Engines, Options, OutputFormat, Quality,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex},
    time::Instant,
};

fn raw(engines: &Engines, input: &Path, dest: &Path, jpeg: bool) -> Result<Vec<u8>, String> {
    let mut args = vec![name(input), "-auto-orient"];
    if jpeg {
        args.extend(["-background", "white", "-alpha", "remove", "-alpha", "off"]);
    }
    let target = format!("RGBA:{}", dest.display());
    args.extend(["-depth", "8", &target]);
    command(engines, "magick", &args)?;
    fs::read(dest).map_err(|e| e.to_string())
}
pub(crate) fn image_semantics(
    engines: &Engines,
    input: &Path,
    output: &Path,
    format: OutputFormat,
    root: &Path,
) -> Result<Value, String> {
    let a = raw(
        engines,
        input,
        &root.join("expected.rgba"),
        format == OutputFormat::Jpeg,
    )?;
    let b = raw(engines, output, &root.join("actual.rgba"), false)?;
    let dims = |path: &Path| {
        command(
            engines,
            "magick",
            &[name(path), "-auto-orient", "-format", "%w %h", "info:"],
        )
    };
    if a.len() != b.len() || a.is_empty() || dims(input)? != dims(output)? {
        return Err("Image dimensions changed".into());
    }
    let mut square = 0.0;
    let mut alpha_error: f64 = 0.0;
    // Compare premultiplied RGB: hidden colour in fully transparent pixels is not visible fidelity.
    for (a, b) in a.chunks_exact(4).zip(b.chunks_exact(4)) {
        alpha_error = alpha_error.max((a[3] as f64 - b[3] as f64).abs() / 255.0);
        for i in 0..3 {
            square += ((a[i] as f64 * a[3] as f64 - b[i] as f64 * b[3] as f64) / 65025.0).powi(2);
        }
    }
    let rmse = (square / (a.len() / 4 * 3) as f64).sqrt();
    if rmse > 0.15 || alpha_error > 0.02 {
        return Err(format!(
            "Image fidelity failed {format:?}: RMSE={rmse}, alpha={alpha_error}"
        ));
    }
    Ok(
        json!({"dimensions":dims(output)?,"premultipliedRgbRmse":rmse,"rmseLimit":0.15,"maxAlphaError":alpha_error,"alphaLimit":0.02}),
    )
}
fn signal(engines: &Engines, input: &Path) -> Result<Vec<f64>, String> {
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let pcm = temp.path().join("signal.f32");
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-i",
            name(input),
            "-map",
            "0:a:0",
            "-t",
            "2",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-f",
            "f32le",
            name(&pcm),
        ],
    )?;
    let bytes = fs::read(pcm).map_err(|e| e.to_string())?;
    let frames: Vec<_> = bytes
        .chunks_exact(8)
        .map(|b| {
            [
                f32::from_le_bytes(b[..4].try_into().unwrap()) as f64,
                f32::from_le_bytes(b[4..].try_into().unwrap()) as f64,
            ]
        })
        .collect();
    if frames.len() < 4800 {
        return Err("Audio signal too short".into());
    }
    let mut amplitudes = vec![];
    for (channel, frequency) in [(0, 440.0), (1, 880.0)] {
        let (mut real, mut imaginary) = (0.0, 0.0);
        for (n, frame) in frames.iter().enumerate() {
            let phase = std::f64::consts::TAU * frequency * n as f64 / 48000.0;
            real += frame[channel] * phase.cos();
            imaginary += frame[channel] * phase.sin();
        }
        let amplitude = 2.0 * real.hypot(imaginary) / frames.len() as f64;
        if !amplitude.is_finite() || !(0.08..0.3).contains(&amplitude) {
            return Err(format!(
                "Lost or distorted audio tone on channel {channel}: {amplitude}"
            ));
        }
        amplitudes.push(amplitude);
    }
    Ok(amplitudes)
}
pub(crate) fn audio_semantics(
    engines: &Engines,
    input: &Path,
    output: &Path,
) -> Result<Value, String> {
    let probe = |path: &Path| -> Result<Value, String> {
        serde_json::from_str(&command(
            engines,
            "ffprobe",
            &[
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=channels,codec_name:format=duration",
                "-of",
                "json",
                name(path),
            ],
        )?)
        .map_err(|e| e.to_string())
    };
    let a = probe(input)?;
    let b = probe(output)?;
    let duration = |v: &Value| -> Result<f64, String> {
        v["format"]["duration"]
            .as_str()
            .ok_or("Missing duration")?
            .parse::<f64>()
            .map_err(|e| e.to_string())
    };
    let delta = (duration(&a)? - duration(&b)?).abs();
    if a["streams"][0]["channels"] != b["streams"][0]["channels"] || delta > 0.15 {
        return Err(format!("Audio duration/channels differ: {a} -> {b}"));
    }
    Ok(
        json!({"input":a,"output":b,"durationDeltaSeconds":delta,"durationLimitSeconds":0.15,"left440HzRight880HzAmplitude":signal(engines, output)?,"amplitudeRange":[0.08,0.3]}),
    )
}
pub(crate) fn pdf_font_semantics(
    engines: &Engines,
    output: &Path,
    root: &Path,
) -> Result<(), String> {
    let pixels = raw(engines, output, &root.join("pdf-font.rgba"), false)?;
    // Pages have solid saturated backgrounds; the only pixels with all channels above 100 are glyphs (allow lossy chroma subsampling).
    let white = pixels
        .chunks_exact(4)
        .filter(|p| p[0] > 100 && p[1] > 100 && p[2] > 100)
        .count();
    if !(50..=2500).contains(&white) {
        return Err(format!("PDF font raster missing or page blank: {white}"));
    }
    Ok(())
}
pub fn verify(manifest: &Path) -> Result<Value, String> {
    verify_engines(Engines::load(manifest)?, Some(manifest))
}
pub fn verify_engines(
    engines: Engines,
    development_manifest: Option<&Path>,
) -> Result<Value, String> {
    let started = Instant::now();
    let pdf_color = crate::pdf_color_checks::verify(&engines)?;
    let mut report = crate::phase2_smoke::verify_engines(engines.clone(), development_manifest)?;
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = root.path().join("results");
    fs::create_dir(&output).map_err(|e| e.to_string())?;
    let profile = root.path().join("display-p3.icc");
    fs::write(
        &profile,
        include_bytes!("../../../tests/fixtures/display-p3.icc"),
    )
    .map_err(|e| e.to_string())?;
    let png = root.path().join("icc.png");
    command(
        &engines,
        "magick",
        &[
            "-size",
            "96x64",
            "gradient:red-blue",
            "-profile",
            name(&profile),
            name(&png),
        ],
    )?;
    let mut checks = vec![];
    for format in [
        OutputFormat::Png,
        OutputFormat::Jpeg,
        OutputFormat::Webp,
        OutputFormat::Avif,
    ] {
        for keep_metadata in [false, true] {
            let result = convert_source(
                &engines,
                source(
                    &png,
                    ConversionContext {
                        options: Options {
                            keep_metadata,
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                )?,
                &output,
                format,
                &Cancel::default(),
            )?;
            let extracted = root.path().join("output.icc");
            command(&engines, "magick", &[&result.path, name(&extracted)])?;
            if fs::read(&extracted).map_err(|e| e.to_string())?
                != fs::read(&profile).map_err(|e| e.to_string())?
            {
                return Err(format!(
                    "ICC changed for {format:?}, metadata={keep_metadata}"
                ));
            }
            checks.push(json!({"check":"ICC byte preservation","format":format,"keep_metadata":keep_metadata,"passed":true}));
        }
    }
    let jpeg = root.path().join("orientation.jpg");
    command(
        &engines,
        "magick",
        &["-size", "96x64", "gradient:red-blue", name(&jpeg)],
    )?;
    let bytes = fs::read(&jpeg).map_err(|e| e.to_string())?;
    let mut oriented = bytes[..2].to_vec();
    // JPEG APP1, little-endian TIFF IFD with EXIF Orientation=6 (90 degrees CW).
    oriented.extend_from_slice(&[
        0xff, 0xe1, 0, 34, b'E', b'x', b'i', b'f', 0, 0, b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12,
        1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    oriented.extend_from_slice(&bytes[2..]);
    fs::write(&jpeg, oriented).map_err(|e| e.to_string())?;
    if command(
        &engines,
        "magick",
        &["identify", "-format", "%[orientation]", name(&jpeg)],
    )? != "RightTop"
    {
        return Err("Invalid EXIF orientation fixture".into());
    }
    for format in [
        OutputFormat::Png,
        OutputFormat::Jpeg,
        OutputFormat::Webp,
        OutputFormat::Avif,
    ] {
        for keep_metadata in [false, true] {
            let result = convert_source(
                &engines,
                source(
                    &jpeg,
                    ConversionContext {
                        options: Options {
                            keep_metadata,
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                )?,
                &output,
                format,
                &Cancel::default(),
            )?;
            let semantic = image_semantics(
                &engines,
                &jpeg,
                Path::new(&result.path),
                format,
                root.path(),
            )?;
            if semantic["dimensions"] != "64 96" {
                return Err("Orientation was not applied".into());
            }
            checks.push(json!({"check":"EXIF orientation 6","format":format,"keep_metadata":keep_metadata,"semantic":semantic}));
        }
    }
    let embedded_pdf = root.path().join("嵌入字体.pdf");
    fs::write(
        &embedded_pdf,
        include_bytes!("../../../desktop/tests/fixtures/embedded-font.pdf"),
    )
    .map_err(|e| e.to_string())?;
    let reference = crate::convert(
        &engines,
        &embedded_pdf,
        &output,
        OutputFormat::Png,
        &Cancel::default(),
    )?;
    let reference_pixels = raw(
        &engines,
        Path::new(&reference.path),
        &root.path().join("font-reference.rgba"),
        false,
    )?;
    let ink = reference_pixels
        .chunks_exact(4)
        .filter(|p| p[0] < 100 && p[1] < 100 && p[2] < 100)
        .count();
    if !(1000..10000).contains(&ink) {
        return Err(format!("Embedded font ink missing or corrupt: {ink}"));
    }
    for format in [
        OutputFormat::Png,
        OutputFormat::Jpeg,
        OutputFormat::Webp,
        OutputFormat::Avif,
    ] {
        let result = crate::convert(&engines, &embedded_pdf, &output, format, &Cancel::default())?;
        let semantic = image_semantics(
            &engines,
            Path::new(&reference.path),
            Path::new(&result.path),
            format,
            root.path(),
        )?;
        if semantic["dimensions"] != "480 200" || result.total != 1 {
            return Err("Embedded font page dimensions/count changed".into());
        }
        checks.push(json!({"check":"embedded Host Grotesk font","format":format,"referenceInkPixels":ink,"inputSha256":hash_file(&embedded_pdf)?,"semantic":semantic}));
    }
    // ImageMagick's built-in rose photograph and fixed-seed synthetic texture.
    let photo = root.path().join("rose.png");
    command(&engines, "magick", &["rose:", name(&photo)])?;
    let alpha = root.path().join("alpha.png");
    command(
        &engines,
        "magick",
        &[
            "-size",
            "128x96",
            "xc:none",
            "-fill",
            "red",
            "-draw",
            "rectangle 0,0 63,95",
            name(&alpha),
        ],
    )?;
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
    let heic = root.path().join("gradient10.heic");
    fs::write(
        &heic,
        include_bytes!("../../../tests/fixtures/gradient-10bit.heic"),
    )
    .map_err(|e| e.to_string())?;
    let mut samples = vec![];
    for (fixture, photo) in [
        ("ImageMagick rose:", &photo),
        ("alpha 128x96", &alpha),
        ("16-bit gradient 256x64", &gradient),
        ("10-bit HEIC seed", &heic),
    ] {
        for format in [
            OutputFormat::Avif,
            OutputFormat::Webp,
            OutputFormat::Jpeg,
            OutputFormat::Png,
        ] {
            for quality in [Quality::Small, Quality::Balanced, Quality::High] {
                for repeat in 1..=5 {
                    let started = Instant::now();
                    let publishing = Arc::new(Mutex::new(None));
                    let marker = publishing.clone();
                    let result = convert_source(
                        &engines,
                        source(
                            photo,
                            ConversionContext {
                                options: Options {
                                    quality,
                                    ..Default::default()
                                },
                                progress: Some(Arc::new(move |p| {
                                    if p.stage == crate::progress::Stage::Publishing {
                                        *marker.lock().unwrap() =
                                            Some(started.elapsed().as_secs_f64());
                                    }
                                })),
                                ..Default::default()
                            },
                        )?,
                        &output,
                        format,
                        &Cancel::default(),
                    )?;
                    let elapsed = started.elapsed().as_secs_f64();
                    let semantic = image_semantics(
                        &engines,
                        photo,
                        Path::new(&result.path),
                        format,
                        root.path(),
                    )?;
                    let before_publication = publishing
                        .lock()
                        .unwrap()
                        .ok_or("Missing publication marker")?;
                    samples.push(json!({"fixture":fixture,"inputSha256":hash_file(photo)?,"inputBytes":fs::metadata(photo).map_err(|e| e.to_string())?.len(),"format":format,"preset":quality,"repeat":repeat,"conversionAndPublicationSeconds":elapsed,"beforePublicationSeconds":before_publication,"publicationSeconds":elapsed-before_publication,"bytes":result.bytes,"semantic":semantic}));
                }
            }
        }
    }
    let scope: Value =
        serde_json::from_str(include_str!("../../../packaging/desktop/v1-scope.json"))
            .map_err(|e| e.to_string())?;
    let routes = report["routes"].as_array().ok_or("Missing route results")?;
    let mut expected = 0;
    for group in scope["groups"].as_array().ok_or("Missing scope")? {
        for input in group["inputs"].as_array().unwrap() {
            for output in group["outputs"].as_array().unwrap() {
                expected += 1;
                if routes
                    .iter()
                    .filter(|r| r["input"] == *input && r["output"] == *output)
                    .count()
                    != 1
                {
                    return Err(format!(
                        "Missing/duplicate frozen route {input} -> {output}"
                    ));
                }
            }
        }
    }
    if routes.len() != expected {
        return Err("Unfrozen route tested".into());
    }
    report["phase"] = json!(27);
    report["qualityChecks"] = json!(checks);
    report["pdfColor"] = pdf_color;
    report["imageCalibration"] = json!(samples);
    report["elapsedSeconds"] = json!(started.elapsed().as_secs_f64());
    report["installation"] = json!("not-run");
    Ok(report)
}
