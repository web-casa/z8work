//! A finite, separate verifier; this command is not registered in the desktop IPC.
fn main() -> Result<(), String> {
    z8_native::watchdog_entry();
    let mut args = std::env::args_os().skip(1);
    let root = args.next().ok_or(
        "Usage: bundle-check ENGINE_DIRECTORY [--full|--quality|--pdf-color|--capabilities|--image-expansion|--document-expansion]",
    )?;
    let mode = match args.next() {
        None => "integrity",
        Some(arg) if arg == "--document-expansion" => "document-expansion",
        Some(arg) if arg == "--image-expansion" => "image-expansion",
        Some(arg) if arg == "--capabilities" => "capabilities",
        Some(arg) if arg == "--full" => "full",
        Some(arg) if arg == "--quality" => "quality",
        Some(arg) if arg == "--pdf-color" => "pdf-color",
        _ => return Err("Unknown option".into()),
    };
    if args.next().is_some() {
        return Err("Too many arguments".into());
    }
    let engines = z8_native::Engines::load_bundle(std::path::Path::new(&root))?;
    let report = if mode == "document-expansion" {
        z8_native::document_expansion_checks::verify_with_network(&engines)?
    } else if mode == "image-expansion" {
        z8_native::image_expansion_checks::verify(&engines)?
    } else if mode == "capabilities" {
        z8_native::capabilities::inspect(&engines)?
    } else if mode == "pdf-color" {
        z8_native::pdf_color_checks::verify(&engines)?
    } else if mode == "quality" {
        z8_native::phase27_smoke::verify_engines(engines, None)?
    } else if mode == "full" {
        z8_native::phase2_smoke::verify_engines(engines, None)?
    } else {
        serde_json::json!({"integrity":"passed", "engines":engines.info()})
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
    );
    Ok(())
}
