//! A finite, separate verifier; this command is not registered in the desktop IPC.
fn main() -> Result<(), String> {
    z8_native::watchdog_entry();
    let mut args = std::env::args_os().skip(1);
    let root = args
        .next()
        .ok_or("Usage: bundle-check ENGINE_DIRECTORY [--full]")?;
    let full = match args.next() {
        None => false,
        Some(arg) if arg == "--full" => true,
        _ => return Err("Unknown option".into()),
    };
    if args.next().is_some() {
        return Err("Too many arguments".into());
    }
    let engines = z8_native::Engines::load_bundle(std::path::Path::new(&root))?;
    let report = if full {
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
