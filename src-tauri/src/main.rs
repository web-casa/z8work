#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(target_os = "macos")]
mod macos_termination;
mod web_save;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use web_save::{PendingSave, Saves};

#[derive(Default)]
struct ExitApproved(AtomicBool);

#[tauri::command]
fn distribution_channel() -> &'static str {
    if cfg!(feature = "store") {
        "store"
    } else {
        "direct"
    }
}

fn external_link_allowed(url: &tauri::Url, store: bool) -> bool {
    if !matches!(url.scheme(), "https" | "http" | "mailto") || local_navigation(url) {
        return false;
    }
    // Store builds retain support/source links, but cannot open our direct updater/download route.
    !(store
        && url.host_str() == Some("github.com")
        && url
            .path()
            .to_ascii_lowercase()
            .starts_with("/web-casa/z8work/releases"))
}

#[tauri::command]
fn finish_close(app: tauri::AppHandle, approved: State<'_, ExitApproved>) {
    approved.0.store(true, Ordering::SeqCst);
    if let Ok(mut saves) = app.state::<Saves>().0.lock() {
        saves.clear();
    }
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            macos_termination::reply(true);
            handle.exit(0);
        }) {
            eprintln!("Could not finish termination: {error}");
            app.exit(0);
        }
    }
    #[cfg(not(target_os = "macos"))]
    app.exit(0);
}

#[tauri::command]
async fn begin_save(
    app: tauri::AppHandle,
    name: String,
    size: u64,
) -> Result<Option<String>, String> {
    if size > web_save::OUTPUT_LIMIT {
        return Err("Output exceeds the 2 GiB save limit / 输出超过 2 GiB 保存上限".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let destination = app
            .dialog()
            .file()
            .set_file_name(web_save::suggested_name(&name))
            .blocking_save_file();
        let Some(destination) = destination else {
            return Ok(None);
        };
        let path = destination.into_path().map_err(|e| e.to_string())?;
        let saves = app.state::<Saves>();
        let mut pending = saves.0.lock().map_err(|_| "Save state unavailable")?;
        if pending.len() >= 4 {
            return Err("Too many pending saves".into());
        }
        let save = PendingSave::new(path, size)?;
        let token = uuid::Uuid::new_v4().to_string();
        pending.insert(token.clone(), save);
        Ok(Some(token))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn append_save(request: tauri::ipc::Request<'_>, saves: State<'_, Saves>) -> Result<(), String> {
    let token = request
        .headers()
        .get("x-save-token")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing save token")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary output chunk".into());
    };
    let mut pending = saves.0.lock().map_err(|_| "Save state unavailable")?;
    pending
        .get_mut(token)
        .ok_or("Unknown save token")?
        .append(bytes)
}

#[tauri::command]
async fn finish_save(app: tauri::AppHandle, token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let save = app
            .state::<Saves>()
            .0
            .lock()
            .map_err(|_| "Save state unavailable")?
            .remove(&token)
            .ok_or("Unknown save token")?;
        save.finish()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn abort_save(token: String, saves: State<'_, Saves>) -> Result<(), String> {
    saves
        .0
        .lock()
        .map_err(|_| "Save state unavailable")?
        .remove(&token);
    Ok(())
}

#[tauri::command]
async fn confirm_close(app: tauri::AppHandle) -> Result<bool, String> {
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        handle.dialog().message("Tasks and unsaved results will be lost. Close?\n任务和未保存的结果将丢失，是否退出？")
            .title("Z8.Work").buttons(MessageDialogButtons::OkCancel).blocking_show()
    }).await.map_err(|e| e.to_string());
    #[cfg(target_os = "macos")]
    if !matches!(result, Ok(true)) {
        app.run_on_main_thread(|| macos_termination::reply(false))
            .map_err(|e| e.to_string())?;
    }
    result
}

fn local_navigation(url: &tauri::Url) -> bool {
    matches!(
        (url.scheme(), url.host_str(), url.port()),
        ("tauri", Some("localhost"), None) | ("http" | "https", Some("tauri.localhost"), None)
    ) || (!cfg!(feature = "custom-protocol")
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        && url.port() == Some(1420))
}

fn open_external(url: &tauri::Url) {
    if external_link_allowed(url, cfg!(feature = "store")) {
        if let Err(error) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
            eprintln!("Could not open external link: {error}");
        }
    }
}

// The standard macOS Quit item calls NSApplication.terminate directly, bypassing
// Tauri's ExitRequested event. Use an ordinary menu item to enter our guarded path.
#[cfg(target_os = "macos")]
fn install_macos_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
    let menu = Menu::default(app)?;
    let quit = MenuItem::with_id(
        app,
        "guarded-quit",
        "Quit Z8.Work",
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    let application = Submenu::with_items(
        app,
        "Z8.Work",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    // Tauri 2.11's default menu starts with the macOS application submenu.
    menu.remove_at(0)?;
    menu.insert(&application, 0)?;
    app.set_menu(menu)?;
    Ok(())
}

fn main() {
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Saves::default())
        .manage(ExitApproved::default())
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "guarded-quit" {
                app.exit(0);
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                install_macos_menu(app.handle())?;
                macos_termination::install(app.handle())?;
            }
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    if local_navigation(url) {
                        true
                    } else {
                        open_external(url);
                        false
                    }
                })
                .on_new_window(|url, _| {
                    open_external(&url);
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            begin_save,
            append_save,
            finish_save,
            abort_save,
            confirm_close,
            finish_close,
            distribution_channel
        ])
        .build(tauri::generate_context!())
        .expect("Desktop application failed")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<ExitApproved>().0.load(Ordering::SeqCst) {
                    if let Some(window) = app.get_webview_window("main") {
                        // Menu Quit and Cmd-Q must use the same confirmation as the close button.
                        api.prevent_exit();
                        if let Err(error) = window.close() {
                            eprintln!("Could not request window close: {error}");
                        }
                    }
                }
            }
        });
}

#[cfg(test)]
mod navigation_tests {
    use super::*;
    #[test]
    fn store_blocks_direct_downloads_but_keeps_source_and_support() {
        for path in [
            "/web-casa/z8work/releases",
            "/web-casa/z8work/releases/latest",
            "/web-casa/z8work/releases/download/v1/app.dmg",
        ] {
            let url = format!("https://github.com{path}").parse().unwrap();
            assert!(!external_link_allowed(&url, true));
            assert!(external_link_allowed(&url, false));
        }
        assert!(external_link_allowed(
            &"https://github.com/web-casa/z8work".parse().unwrap(),
            true
        ));
        assert!(external_link_allowed(
            &"mailto:support@z8.work".parse().unwrap(),
            true
        ));
        assert!(!external_link_allowed(
            &"file:///tmp/app".parse().unwrap(),
            false
        ));
    }
    #[test]
    fn only_bundled_origins_can_replace_the_workspace() {
        for url in [
            "tauri://localhost/convert/",
            "http://tauri.localhost/zh-Hans/convert/",
        ] {
            assert!(local_navigation(&url.parse().unwrap()));
        }
        for url in [
            "https://vert.sh/",
            "file:///etc/passwd",
            "tauri://evil/",
            "http://tauri.localhost:9999/",
            "https://tauri.localhost.evil/",
        ] {
            assert!(!local_navigation(&url.parse().unwrap()));
        }
    }
}
