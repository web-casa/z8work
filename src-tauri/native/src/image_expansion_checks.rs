//! Real-file acceptance for the additional static raster routes. No IPC exposure.
use crate::{
    convert, convert_source, hash_file, output_formats,
    phase2_smoke::{command, name, pdf_fixture, source},
    Cancel, ConversionContext, Engines, Options, OutputFormat, Quality,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
const NEW: [OutputFormat; 3] = [OutputFormat::Bmp, OutputFormat::Tga, OutputFormat::Qoi];

fn pixels(engines: &Engines, path: &Path, root: &Path, white: bool) -> Result<Vec<u8>, String> {
    let dest = root.join("pixels.rgba");
    let profile = root.join("srgb.icc");
    fs::write(
        &profile,
        include_bytes!("../../../packaging/desktop/profiles/srgb.icc"),
    )
    .map_err(|e| e.to_string())?;
    let mut args = vec![name(path), "-auto-orient"];
    if white {
        args.extend(["-background", "white", "-alpha", "remove", "-alpha", "off"]);
    }
    let output = format!("RGBA:{}", dest.display());
    args.extend([
        "-profile",
        name(&profile),
        "-colorspace",
        "sRGB",
        "-depth",
        "8",
        &output,
    ]);
    command(engines, "magick", &args)?;
    fs::read(dest).map_err(|e| e.to_string())
}
fn equal_pixels(a: &[u8], b: &[u8]) -> Result<(), String> {
    if a.is_empty() || a.len() != b.len() {
        return Err("Raster dimensions changed".into());
    }
    for (a, b) in a.chunks_exact(4).zip(b.chunks_exact(4)) {
        if a[3].abs_diff(b[3]) > 1
            || (0..3).any(|c| (a[c] as i32 * a[3] as i32 - b[c] as i32 * b[3] as i32).abs() > 510)
        {
            return Err("8-bit raster pixels or alpha changed".into());
        }
    }
    Ok(())
}
pub fn verify(engines: &Engines) -> Result<Value, String> {
    engines.verify_bundle()?;
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let out = root.path().join("out");
    fs::create_dir(&out).map_err(|e| e.to_string())?;
    let png = root.path().join("alpha.png");
    command(
        engines,
        "magick",
        &[
            "-size",
            "24x18",
            "xc:rgba(20,100,200,0.5)",
            "-fill",
            "rgba(200,40,10,1)",
            "-draw",
            "rectangle 2,2 10,10",
            name(&png),
        ],
    )?;
    let mut inputs = vec![png.clone()];
    for f in [
        OutputFormat::Jpeg,
        OutputFormat::Webp,
        OutputFormat::Avif,
        OutputFormat::Bmp,
        OutputFormat::Tga,
        OutputFormat::Qoi,
    ] {
        inputs.push(PathBuf::from(
            convert(engines, &png, &out, f, &Cancel::default())?.path,
        ));
    }
    let jpeg = root.path().join("alias.jpeg");
    fs::copy(&inputs[1], &jpeg).map_err(|e| e.to_string())?;
    inputs.push(jpeg);
    for ext in ["heic", "heif"] {
        let p = root.path().join(format!("gradient.{ext}"));
        fs::write(
            &p,
            include_bytes!("../../../tests/fixtures/gradient-10bit.heic"),
        )
        .map_err(|e| e.to_string())?;
        inputs.push(p);
    }
    let mut routes = vec![];
    for input in &inputs {
        let ext = input.extension().unwrap().to_str().unwrap();
        for format in output_formats(ext) {
            if !NEW.contains(&format) && !["bmp", "tga", "qoi"].contains(&ext) {
                continue;
            }
            let result = convert(engines, input, &out, format, &Cancel::default())?;
            let path = Path::new(&result.path);
            let semantic =
                crate::phase27_smoke::image_semantics(engines, input, path, format, root.path())?;
            if NEW.contains(&format) {
                equal_pixels(
                    &pixels(engines, input, root.path(), format == OutputFormat::Bmp)?,
                    &pixels(engines, path, root.path(), false)?,
                )?;
            }
            routes.push(json!({"input":ext,"output":format,"bytes":result.bytes,"inputSha256":hash_file(input)?,"decoded":true,"semantic":semantic}));
        }
    }
    let pdf = root.path().join("pages.pdf");
    fs::write(&pdf, pdf_fixture(3)).map_err(|e| e.to_string())?;
    let baseline = convert(engines, &pdf, &out, OutputFormat::Png, &Cancel::default())?;
    for format in NEW {
        let result = convert(engines, &pdf, &out, format, &Cancel::default())?;
        if result.files.len() != 3 || !result.complete {
            return Err("PDF expansion did not save all pages".into());
        }
        for (page, reference) in result.files.iter().zip(&baseline.files) {
            if page.page != reference.page {
                return Err("PDF page order changed".into());
            }
            equal_pixels(
                &pixels(
                    engines,
                    Path::new(&reference.path),
                    root.path(),
                    format == OutputFormat::Bmp,
                )?,
                &pixels(engines, Path::new(&page.path), root.path(), false)?,
            )?;
        }
        routes.push(
            json!({"input":"pdf","output":format,"pages":3,"decoded":true,"bytes":result.bytes}),
        );
    }
    // Quality presets must not silently quantize these fixed 8-bit formats differently.
    let mut presets = vec![];
    for format in NEW {
        for quality in [Quality::Small, Quality::Balanced, Quality::High] {
            let context = ConversionContext {
                options: Options {
                    quality,
                    ..Default::default()
                },
                ..Default::default()
            };
            let result = convert_source(
                engines,
                source(&png, context)?,
                &out,
                format,
                &Cancel::default(),
            )?;
            equal_pixels(
                &pixels(engines, &png, root.path(), format == OutputFormat::Bmp)?,
                &pixels(engines, Path::new(&result.path), root.path(), false)?,
            )?;
            presets.push(json!({"format":format,"quality":quality,"passed":true}));
        }
    }
    let gradient = root.path().join("depth16.png");
    command(
        engines,
        "magick",
        &[
            "-size",
            "96x64",
            "gradient:red-blue",
            "-depth",
            "16",
            name(&gradient),
        ],
    )?;
    let tagged = root.path().join("display-p3.png");
    let profile = root.path().join("display-p3.icc");
    fs::write(
        &profile,
        include_bytes!("../../../tests/fixtures/display-p3.icc"),
    )
    .map_err(|e| e.to_string())?;
    command(
        engines,
        "magick",
        &[
            "-size",
            "24x18",
            "xc:rgb(200,100,50)",
            "-profile",
            name(&profile),
            name(&tagged),
        ],
    )?;
    let jpeg = root.path().join("oriented.jpg");
    command(engines, "magick", &[name(&gradient), name(&jpeg)])?;
    let bytes = fs::read(&jpeg).map_err(|e| e.to_string())?;
    let mut oriented = bytes[..2].to_vec();
    oriented.extend_from_slice(&[
        0xff, 0xe1, 0, 34, b'E', b'x', b'i', b'f', 0, 0, b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12,
        1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    oriented.extend_from_slice(&bytes[2..]);
    fs::write(&jpeg, oriented).map_err(|e| e.to_string())?;
    let mut semantics = vec![];
    for (kind, input) in [
        ("16-bit", gradient),
        ("ICC to sRGB", tagged),
        ("EXIF orientation 6", jpeg),
    ] {
        for format in NEW {
            for keep_metadata in [false, true] {
                let context = ConversionContext {
                    options: Options {
                        keep_metadata,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let result = convert_source(
                    engines,
                    source(&input, context)?,
                    &out,
                    format,
                    &Cancel::default(),
                )?;
                equal_pixels(
                    &pixels(engines, &input, root.path(), format == OutputFormat::Bmp)?,
                    &pixels(engines, Path::new(&result.path), root.path(), false)?,
                )?;
                semantics.push(json!({"check":kind,"format":format,"keep_metadata":keep_metadata,"passed":true}));
            }
        }
    }
    Ok(
        json!({"schema":1,"scope":"static-raster-expansion-2","platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"routes":routes,"presets":presets,"semantics":semantics,"engines":engines.info()}),
    )
}
