#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod web_save;
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use web_save::{PendingSave, Saves};

#[tauri::command]
async fn begin_save(
    app: tauri::AppHandle,
    name: String,
    size: u64,
) -> Result<Option<String>, String> {
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
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().message("Tasks and unsaved results will be lost. Close?\n任务和未保存的结果将丢失，是否退出？")
            .title("Z8.Work").buttons(MessageDialogButtons::OkCancel).blocking_show()
    }).await.map_err(|e| e.to_string())
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
    if matches!(url.scheme(), "https" | "http" | "mailto") && !local_navigation(url) {
        if let Err(error) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
            eprintln!("Could not open external link: {error}");
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(Saves::default())
        .setup(|app| {
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
            confirm_close
        ])
        .run(tauri::generate_context!())
        .expect("Desktop application failed");
}

#[cfg(test)]
mod navigation_tests {
    use super::*;
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
