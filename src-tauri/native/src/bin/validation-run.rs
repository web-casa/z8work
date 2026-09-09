//! Test supervisor only, never registered as a desktop command or IPC handler.
fn main() -> Result<(), String> {
    z8_native::watchdog_entry();
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let name = match args.as_slice() {
        [_, flag] if flag == "--list" => None,
        [_, flag, name] if flag == "--exact" => Some(name.to_str().ok_or("Invalid test name")?),
        _ => {
            return Err(
                "Usage: validation-run ABSOLUTE_TEST_EXECUTABLE --list OR --exact TEST_NAME".into(),
            )
        }
    };
    print!(
        "{}",
        z8_native::validation::run_test(std::path::Path::new(&args[0]), name)?
    );
    Ok(())
}
