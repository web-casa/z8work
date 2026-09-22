//! Dock Quit and logout call AppKit directly, not Tauri's ExitRequested event.
use std::sync::OnceLock;
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
extern "C" {
    fn z8_install_termination_guard(callback: extern "C" fn()) -> bool;
    fn z8_reply_to_termination(approved: bool);
}
extern "C" fn request_exit() {
    if let Some(app) = APP.get() {
        app.exit(0);
    }
}
pub fn install(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    APP.set(app.clone())
        .map_err(|_| "Termination guard already installed")?;
    // setup runs on the AppKit main thread. The callback has process lifetime.
    if !unsafe { z8_install_termination_guard(request_exit) } {
        return Err("Could not install macOS termination guard; delegate contract changed".into());
    }
    Ok(())
}
/// Call only on the AppKit main thread, for both cancellation and approval.
pub fn reply(approved: bool) {
    // Objective-C validates the main-thread precondition and tracks pending replies.
    unsafe { z8_reply_to_termination(approved) }
}
