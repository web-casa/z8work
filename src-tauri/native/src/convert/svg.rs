//! A deliberately small, local-only static SVG rasterization boundary.
//!
//! `resvg` itself is in-process, but its default resolver can read sibling files.
//! This module replaces that resolver, avoids system fonts and checks the subset
//! before parsing so an SVG cannot expand the conversion trust boundary.
use resvg::{
    tiny_skia::{Pixmap, Transform},
    usvg::{self, ImageKind},
};
use std::{fs, path::Path, sync::Arc};

const INPUT_LIMIT: usize = 10 * 1024 * 1024;
const EMBEDDED_IMAGE_LIMIT: usize = 8 * 1024 * 1024;
const MAX_SIDE: u32 = 16_000;
const MAX_PIXELS: u64 = 64_000_000;

pub(crate) fn render(input: &Path, output: &Path, max_side: Option<u32>) -> Result<(), String> {
    let bytes = fs::read(input).map_err(|e| e.to_string())?;
    if bytes.len() > INPUT_LIMIT {
        return Err("Static SVG input limit is 10 MiB".into());
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| "SVG must be UTF-8 text")?;
    validate_static_source(text)?;

    let mut options = usvg::Options::default();
    options.resources_dir = None;
    options.font_family = "Host Grotesk".to_owned();
    // Neither font is loaded from the host. The second is a fixed CJK fallback.
    options.fontdb_mut().load_font_data(
        include_bytes!("../../../../packaging/desktop/fonts/HostGrotesk-Regular.ttf").to_vec(),
    );
    options.fontdb_mut().load_font_data(
        include_bytes!("../../../../packaging/desktop/fonts/DroidSansFallbackFull.ttf").to_vec(),
    );
    options.image_href_resolver = usvg::ImageHrefResolver {
        resolve_data: Box::new(|mime: &str, data: Arc<Vec<u8>>, _: &usvg::Options| {
            if data.len() > EMBEDDED_IMAGE_LIMIT {
                return None;
            }
            match mime {
                "image/jpg" | "image/jpeg" => Some(ImageKind::JPEG(data)),
                "image/png" => Some(ImageKind::PNG(data)),
                "image/gif" => Some(ImageKind::GIF(data)),
                "image/webp" => Some(ImageKind::WEBP(data)),
                _ => None,
            }
        }),
        // Do not let an SVG resolve relative files, absolute paths or URLs.
        resolve_string: Box::new(|_, _| None),
    };
    let tree = usvg::Tree::from_data(&bytes, &options)
        .map_err(|error| format!("Unsupported static SVG: {error}"))?;
    let natural = tree.size().to_int_size();
    let natural_width = natural.width();
    let natural_height = natural.height();
    validate_size(natural_width, natural_height)?;
    let (width, height, scale) = match max_side {
        Some(bound) if bound > 0 && (natural_width > bound || natural_height > bound) => {
            let scale = bound as f32 / natural_width.max(natural_height) as f32;
            let width = ((natural_width as f32 * scale).round() as u32).max(1);
            let height = ((natural_height as f32 * scale).round() as u32).max(1);
            (width, height, scale)
        }
        _ => (natural_width, natural_height, 1.0),
    };
    validate_size(width, height)?;
    let mut pixmap = Pixmap::new(width, height).ok_or("SVG raster allocation failed")?;
    resvg::render(
        &tree,
        Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    pixmap.save_png(output).map_err(|e| e.to_string())
}

fn validate_size(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE {
        return Err("Static SVG dimensions exceed 16000 pixels per side".into());
    }
    if width as u64 * height as u64 > MAX_PIXELS {
        return Err("Static SVG raster exceeds the 64 megapixel budget".into());
    }
    Ok(())
}

fn validate_static_source(value: &str) -> Result<(), String> {
    if value.contains('\0') {
        return Err("SVG contains NUL bytes".into());
    }
    let lower = value.to_ascii_lowercase();
    for forbidden in [
        "<!doctype",
        "<!entity",
        "<script",
        "<foreignobject",
        "<animate",
        "<set",
        "<a ",
        "<a>",
        "<iframe",
        "<object",
        "<embed",
        "@import",
        "@font",
        "javascript:",
        "file:",
        "data:image/svg",
    ] {
        if lower.contains(forbidden) {
            return Err("SVG contains a forbidden dynamic or external feature".into());
        }
    }
    if has_event_handler(&lower) {
        return Err("SVG event handlers are not supported".into());
    }
    validate_hrefs(&lower)?;
    validate_urls(&lower)
}

fn has_event_handler(lower: &str) -> bool {
    let bytes = lower.as_bytes();
    for index in 0..bytes.len().saturating_sub(3) {
        if bytes[index..].starts_with(b"on")
            && (index == 0
                || matches!(bytes[index - 1], b' ' | b'\t' | b'\n' | b'\r' | b'<' | b'/'))
        {
            let mut cursor = index + 2;
            let start = cursor;
            while cursor < bytes.len()
                && (bytes[cursor].is_ascii_alphanumeric() || bytes[cursor] == b'-')
            {
                cursor += 1;
            }
            if cursor > start {
                while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                    cursor += 1;
                }
                if bytes.get(cursor) == Some(&b'=') {
                    return true;
                }
            }
        }
    }
    false
}

fn validate_hrefs(lower: &str) -> Result<(), String> {
    let bytes = lower.as_bytes();
    let mut from = 0;
    while let Some(relative) = lower[from..].find("href") {
        let index = from + relative;
        let mut cursor = index + 4;
        while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
            cursor += 1;
        }
        if bytes.get(cursor) != Some(&b'=') {
            from = cursor;
            continue;
        }
        cursor += 1;
        while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
            cursor += 1;
        }
        let quote = *bytes
            .get(cursor)
            .ok_or("SVG href is missing a quoted value")?;
        if !matches!(quote, b'\'' | b'\"') {
            return Err("SVG href must use a quoted value".into());
        }
        cursor += 1;
        let end = lower[cursor..]
            .find(quote as char)
            .map(|offset| cursor + offset)
            .ok_or("SVG href is not closed")?;
        let href = &lower[cursor..end];
        if !href.starts_with('#')
            && ![
                "data:image/png;base64,",
                "data:image/jpeg;base64,",
                "data:image/jpg;base64,",
                "data:image/gif;base64,",
                "data:image/webp;base64,",
            ]
            .iter()
            .any(|prefix| href.starts_with(prefix))
        {
            return Err("SVG references must be local fragments or embedded raster data".into());
        }
        from = end + 1;
    }
    Ok(())
}

fn validate_urls(lower: &str) -> Result<(), String> {
    let mut from = 0;
    while let Some(relative) = lower[from..].find("url(") {
        let mut cursor = from + relative + 4;
        while lower
            .as_bytes()
            .get(cursor)
            .is_some_and(u8::is_ascii_whitespace)
        {
            cursor += 1;
        }
        if lower.as_bytes().get(cursor) != Some(&b'#') {
            return Err("SVG CSS URLs must be local fragments".into());
        }
        from = cursor + 1;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_source_rejects_dynamic_or_external_features() {
        for value in [
            r#"<svg><script>alert(1)</script></svg>"#,
            r#"<svg><rect onclick="go()"/></svg>"#,
            r#"<svg><image href="nearby.png"/></svg>"#,
            r#"<svg><style>rect { fill: url(https://example.test/a) }</style></svg>"#,
            r#"<!DOCTYPE svg><svg/>"#,
        ] {
            assert!(validate_static_source(value).is_err(), "{value}");
        }
    }

    #[test]
    fn static_source_allows_fragments_and_embedded_raster() {
        assert!(validate_static_source(
            r##"<svg><use href="#mark"/><image href="data:image/png;base64,AA=="/></svg>"##,
        )
        .is_ok());
    }

    #[test]
    fn renderer_uses_bounded_dimensions() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("shape.svg");
        let output = root.path().join("shape.png");
        fs::write(
            &source,
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="#0a0"/></svg>"##,
        )
        .unwrap();
        render(&source, &output, Some(16)).unwrap();
        let bytes = fs::read(output).unwrap();
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()), 16);
        assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 8);
    }
}
