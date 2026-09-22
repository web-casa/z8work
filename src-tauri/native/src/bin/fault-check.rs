fn main() -> Result<(), String> {
    z8_native::watchdog_entry();
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 1 {
        return Err("Use fault-check ENGINE_DIRECTORY inside the isolated fault runner".into());
    }
    #[cfg(target_os = "linux")]
    {
        let engines = z8_native::Engines::load_bundle(std::path::Path::new(&args[0]))?;
        let report = z8_native::fault_checks::verify(engines)?;
        println!(
            "{}",
            serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
        );
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    Err("Filesystem fault runner currently requires native Linux".into())
}
