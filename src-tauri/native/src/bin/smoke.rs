fn main() -> Result<(), String> {
    z8_native::watchdog_entry();
    let path = std::env::var_os("Z8_DEV_ENGINE_MANIFEST").ok_or("Set Z8_DEV_ENGINE_MANIFEST")?;
    let report = if std::env::args().any(|arg| arg == "--audio-expansion") {
        z8_native::audio_expansion_checks::verify(&z8_native::Engines::load(
            std::path::Path::new(&path),
        )?)?
    } else if std::env::args().any(|arg| arg == "--document-expansion") {
        z8_native::document_expansion_checks::verify_with_network(&z8_native::Engines::load(
            std::path::Path::new(&path),
        )?)?
    } else if std::env::args().any(|arg| arg == "--image-expansion") {
        z8_native::image_expansion_checks::verify(&z8_native::Engines::load(
            std::path::Path::new(&path),
        )?)?
    } else if std::env::args().any(|arg| arg == "--phase27") {
        z8_native::phase27_smoke::verify(std::path::Path::new(&path))?
    } else if std::env::args().any(|arg| arg == "--phase2") {
        z8_native::phase2_smoke::verify(std::path::Path::new(&path))?
    } else {
        z8_native::smoke::verify(std::path::Path::new(&path))?
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
    );
    Ok(())
}
