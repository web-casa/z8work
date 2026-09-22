//! Finite candidate checks: ICCBased PDF pixels, through the production pipeline.
use crate::{
    convert_source, hash_file,
    phase2_smoke::{command, name, source},
    Cancel, ConversionContext, Engines, Options, OutputFormat,
};
use serde_json::{json, Value};
use std::{fs, path::Path};

const COLORS: [[f64; 3]; 6] = [
    [1.0, 0.5, 0.2],
    [0.2, 0.8, 0.4],
    [0.35, 0.3, 0.85],
    [0.55, 0.35, 0.25],
    [0.5, 0.5, 0.5],
    [0.15, 0.35, 0.6],
];
// Independent reference: linearize Display P3, P3 -> XYZ D65 -> sRGB, clip,
// encode sRGB, round to 8 bits. See W3C css-color-4/conversions.js and the
// fixture documentation. No expected pixels are obtained from the renderer.
const EXPECTED: [[u8; 3]; 6] = [
    [255, 118, 0],
    [0, 208, 88],
    [92, 76, 225],
    [149, 86, 58],
    [128, 128, 128],
    [5, 91, 158],
];

fn stream(dictionary: &str, bytes: &[u8]) -> Vec<u8> {
    let mut object = format!("<< {dictionary} /Length {} >>\nstream\n", bytes.len()).into_bytes();
    object.extend_from_slice(bytes);
    object.extend_from_slice(b"\nendstream");
    object
}

pub fn fixture() -> Vec<u8> {
    let mut paint = String::from("/RelativeColorimetric ri /P3 cs\n");
    for (i, [r, g, b]) in COLORS.iter().enumerate() {
        paint.push_str(&format!("{r} {g} {b} scn {} 0 48 48 re f\n", i * 48));
    }
    let objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 48] /Resources << /ColorSpace << /P3 [/ICCBased 5 0 R] >> >> /Contents 4 0 R >>".to_vec(),
        stream("", paint.as_bytes()),
        stream("/N 3 /Alternate /DeviceRGB", include_bytes!("../../../tests/fixtures/display-p3.icc")),
    ];
    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![];
    for (i, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", i + 1).as_bytes());
        pdf.extend_from_slice(object);
        pdf.extend_from_slice(b"\nendobj\n");
    }
    let xref = pdf.len();
    pdf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
    for offset in offsets {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n").as_bytes(),
    );
    pdf
}

fn pixels(engines: &Engines, image: &Path, root: &Path) -> Result<Vec<u8>, String> {
    let output = root.join("pixels.rgba");
    command(
        engines,
        "magick",
        &[
            name(image),
            "-depth",
            "8",
            &format!("RGBA:{}", output.display()),
        ],
    )?;
    let pixels = fs::read(output).map_err(|e| e.to_string())?;
    if pixels.len() != 288 * 48 * 4
        || command(
            engines,
            "magick",
            &[name(image), "-format", "%w %h", "info:"],
        )? != "288 48"
    {
        return Err("PDF ICC fixture dimensions changed".into());
    }
    Ok(pixels)
}

fn swatches(pixels: &[u8]) -> Result<Vec<[f64; 3]>, String> {
    (0..6)
        .map(|i| {
            let mut rgb = [0.0; 3];
            // Sample the central 16x16 area: no edge/antialiasing/chroma-boundary pixels.
            for y in 16..32 {
                for x in (i * 48 + 16)..(i * 48 + 32) {
                    let pixel = &pixels[(y * 288 + x) * 4..][..4];
                    if pixel[3] != 255 {
                        return Err("PDF ICC swatch lost opacity".into());
                    }
                    for c in 0..3 {
                        rgb[c] += f64::from(pixel[c]) / 256.0;
                    }
                }
            }
            Ok(rgb)
        })
        .collect()
}

pub fn verify(engines: &Engines) -> Result<Value, String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let pdf = root.path().join("display-p3.pdf");
    fs::write(&pdf, fixture()).map_err(|e| e.to_string())?;
    let output = root.path().join("results");
    fs::create_dir(&output).map_err(|e| e.to_string())?;
    // Negative control proves this fixture detects disabled ICC, even if a future
    // engine quietly ignores its embedded profile. Never use it as the oracle.
    let unmanaged = root.path().join("unmanaged.png");
    command(
        engines,
        "mutool",
        &[
            "draw",
            "-q",
            "-N",
            "-r",
            "72",
            "-c",
            "rgba",
            "-o",
            name(&unmanaged),
            name(&pdf),
            "1",
        ],
    )?;
    let control = swatches(&pixels(engines, &unmanaged, root.path())?)?;
    let error = |actual: &[[f64; 3]]| {
        actual
            .iter()
            .zip(EXPECTED)
            .flat_map(|(a, b)| (0..3).map(move |c| (a[c] - f64::from(b[c])).abs()))
            .fold(0.0, f64::max)
    };
    let control_error = error(&control);
    if control_error < 30.0 {
        return Err(format!(
            "PDF ICC negative control no longer discriminates: {control_error}"
        ));
    }
    let mut checks = vec![];
    for format in [
        OutputFormat::Png,
        OutputFormat::Jpeg,
        OutputFormat::Webp,
        OutputFormat::Avif,
    ] {
        let result = convert_source(
            engines,
            source(
                &pdf,
                ConversionContext {
                    options: Options {
                        pdf_dpi: 72,
                        ..Default::default()
                    },
                    ..Default::default()
                },
            )?,
            &output,
            format,
            &Cancel::default(),
        )?;
        if !result.complete || result.files.len() != 1 {
            return Err("PDF ICC conversion did not publish its page".into());
        }
        let actual = swatches(&pixels(
            engines,
            Path::new(&result.files[0].path),
            root.path(),
        )?)?;
        let max_error = error(&actual);
        // MuPDF 1.25.1 uses LCMS LOWRESPRECALC: near clipped gamut boundaries
        // its interpolated transform differs from the analytical oracle. Eight
        // codes cover that approximation plus encoding, not exact colourimetry.
        // The disabled renderer misses by >30 codes on this unchanged fixture.
        let limit = 8.0;
        if max_error > limit {
            return Err(format!("PDF ICC {format:?}: max RGB error {max_error} > {limit}; actual {actual:?}; expected {EXPECTED:?}"));
        }
        checks.push(json!({"check":"pdf-icc","format":format,"passed":true,"dimensions":[288,48],"expectedRgb":EXPECTED,"actualRgb":actual,"maxChannelError":max_error,"limit":limit}));
    }
    Ok(
        json!({"fixtureSha256":hash_file(&pdf)?,"negativeControlMaxChannelError":control_error,"checks":checks}),
    )
}
