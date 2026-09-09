#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod boot;
mod build_report;
mod dialogs;
mod impact;
mod quit;
#[cfg(all(feature = "development-engines", feature = "packaged-engines"))]
compile_error!("packaged-engines and development-engines are mutually exclusive");
#[cfg(all(feature = "gtk-dialog", feature = "linux-portal"))]
compile_error!("gtk-dialog and linux-portal are mutually exclusive; use --no-default-features for portal builds");
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use z8_native::{
    queue::{Queue, Snapshot, Submission},
    EngineInfo, OutputFormat,
};
struct Backend {
    diagnostics: z8_native::diagnostics::Store,
    boot: Arc<boot::Boot>,
    preferences: Result<Arc<z8_native::preferences::Store>, String>,
    engines: Arc<z8_native::startup::Runtime>,
    dialog: Arc<AtomicBool>,
    closing: quit::Gate,
}
// Returns true only after the queue worker has been joined. All OS/window exit
// requests share this gate, including repeated requests while a dialog is open.
fn allow_exit(app: &tauri::AppHandle, code: i32) -> bool {
    let Some(state) = app.try_state::<Backend>() else {
        return true;
    };
    match state.closing.request() {
        quit::Action::Allow => return true,
        quit::Action::Wait => return false,
        quit::Action::Start => {}
    }
    // A native picker already owns the modal interaction. Let the user finish
    // that interaction first; do not cancel it or open a second modal on top.
    if state
        .dialog
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        state.closing.resume();
        return false;
    }
    let guard = DialogGuard(state.dialog.clone());
    let handle = app.clone();
    let started = std::thread::Builder::new()
        .name("confirm-exit".into())
        .spawn(move || {
            let _guard = guard;
            let state = handle.state::<Backend>();
            {
                let idle = if state.boot.pending() > 0 {
                    Ok(false)
                } else {
                    state
                        .queue()
                        .map_or(Ok(true), |queue| queue.prepare_idle_exit())
                };
                if !matches!(idle, Ok(true)) {
                    let language = state
                        .preferences
                        .as_ref()
                        .ok()
                        .and_then(|store| store.read().ok())
                        .map(|record| record.preferences.language)
                        .unwrap_or_default();
                    let copy = quit::copy(&language, idle.is_err());
                    // Blocking only this helper, never the event loop or worker.
                    let confirmed = quit::show(&handle, copy).unwrap_or_else(|error| {
                        let _ = handle.emit_to("main", "desktop-import-error", error);
                        false
                    });
                    if !confirmed {
                        state.closing.resume();
                        return;
                    }
                }
            }
            state.boot.close();
            if let Ok(queue) = state.queue() {
                queue.shutdown();
            }
            state.engines.shutdown();
            state.boot.shutdown();
            state.closing.finish();
            handle.exit(code);
        });
    if let Err(error) = started {
        state.closing.resume();
        let _ = app.emit_to(
            "main",
            "desktop-import-error",
            format!("Could not prepare exit: {error}"),
        );
    }
    false
}
struct DialogGuard(Arc<AtomicBool>);
impl Drop for DialogGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
impl Backend {
    fn language(&self) -> z8_native::preferences::Language {
        self.preferences
            .as_ref()
            .ok()
            .and_then(|p| p.read().ok())
            .map(|r| r.preferences.language)
            .unwrap_or_default()
    }
    fn queue(&self) -> Result<Arc<Queue>, String> {
        self.boot.queue()
    }
    fn begin_dialog(&self) -> Result<DialogGuard, String> {
        if !self.closing.accepts_dialog() {
            return Err("Z8:closing".into());
        }
        if let Ok(queue) = self.queue() {
            queue.can_pick()?;
        }
        self.dialog
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A file picker is already open")?;
        Ok(DialogGuard(self.dialog.clone()))
    }
}
#[derive(Serialize)]
struct DesktopInfo {
    processing_location: &'static str,
    preparing: bool,
    startup: Vec<z8_native::startup::Status>,
    pending_imports: usize,
    import_failure: Option<z8_native::failure::Failure>,
    workspace_error: Option<String>,
    temporary_cleanup: Option<z8_native::workspaces::CleanupReport>,
    engines: Vec<EngineInfo>,
    error: Option<String>,
    queue_error: Option<String>,
    architecture: String,
}
#[tauri::command]
fn desktop_info(state: State<Backend>) -> DesktopInfo {
    let services = state.boot.services.get();
    DesktopInfo {
        processing_location: "device-v1",
        preparing: services.is_none()
            && state.boot.failure() != Some(z8_native::failure::Failure::History),
        startup: state.engines.status(),
        pending_imports: state.boot.pending(),
        import_failure: state.boot.failure(),
        workspace_error: services.and_then(|s| s.workspace.as_ref().err().cloned()),
        temporary_cleanup: services
            .and_then(|s| s.workspace.as_ref().ok())
            .and_then(|s| s.report().ok()),
        engines: state.engines.info(),
        error: None,
        queue_error: state.queue().err().filter(|e| e != "Z8:preparing"),
        architecture: format!("{} / {}", std::env::consts::OS, std::env::consts::ARCH),
    }
}
#[tauri::command]
async fn open_impact_source(id: String) -> Result<(), String> {
    let url = impact::source(&id)?.to_owned();
    tauri::async_runtime::spawn_blocking(move || tauri_plugin_opener::open_url(url, None::<&str>))
        .await
        .map_err(|_| "Could not open source")?
        .map_err(|_| "Could not open source".into())
}
#[tauri::command]
async fn preview_diagnostics(
    state: State<'_, Backend>,
) -> Result<z8_native::diagnostics::Preview, String> {
    let queue = state.queue().ok();
    let engines = state.engines.info();
    let workspace_initialized = state
        .boot
        .services
        .get()
        .is_some_and(|s| s.workspace.is_ok());
    // Reuse snapshot authority, but keep cloning potentially large history off
    // the event loop. Only the small allowlisted report crosses this boundary.
    let report = tauri::async_runtime::spawn_blocking(move || {
        let snapshot = queue.and_then(|q| q.snapshot().ok());
        z8_native::diagnostics::build(&engines, snapshot.as_ref(), workspace_initialized)
    })
    .await
    .map_err(|e| e.to_string())?;
    state.diagnostics.prepare(report)
}
#[tauri::command]
async fn save_diagnostics(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, Backend>,
) -> Result<bool, String> {
    let reviewed = state.diagnostics.reviewed(&id)?;
    // Share modal ownership with pickers and quit, but diagnostics also work
    // when the queue is unavailable or a conversion is running.
    state
        .dialog
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "Close the current dialog first")?;
    let guard = DialogGuard(state.dialog.clone());
    if !state.closing.accepts_dialog() {
        return Err("Application is closing".into());
    }
    let title = dialogs::title(&state.language(), dialogs::Kind::Diagnostic);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let mut picker = app
            .dialog()
            .file()
            .set_title(title)
            .set_file_name("z8-work-diagnostics.json")
            .add_filter("JSON", &["json"]);
        if let Some(window) = app.get_webview_window("main") {
            picker = picker.set_parent(&window);
        }
        let Some(path) = picker.blocking_save_file() else {
            return Ok(false);
        };
        z8_native::diagnostics::save(&path.into_path().map_err(|e| e.to_string())?, &reviewed)?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_preferences(
    state: State<'_, Backend>,
) -> Result<z8_native::preferences::Record, String> {
    let preferences = state.preferences.as_ref().map_err(Clone::clone)?.clone();
    tauri::async_runtime::spawn_blocking(move || preferences.read())
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_preferences(
    expected_revision: u64,
    preferences: z8_native::preferences::Preferences,
    state: State<'_, Backend>,
) -> Result<z8_native::preferences::Record, String> {
    let store = state.preferences.as_ref().map_err(Clone::clone)?.clone();
    tauri::async_runtime::spawn_blocking(move || store.save(expected_revision, preferences))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn preview_input(
    id: String,
    state: State<'_, Backend>,
) -> Result<tauri::ipc::Response, String> {
    let queue = state.queue()?.clone();
    let engines = state.engines.engines();
    let workspace = state
        .boot
        .services
        .get()
        .ok_or("Z8:preparing")?
        .workspace
        .as_ref()
        .map_err(Clone::clone)?
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        queue
            .preview_with_workspace(&id, &engines, workspace)
            .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn dismiss_import_report(id: String, state: State<'_, Backend>) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.dismiss_import_report(&id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn queue_snapshot(state: State<'_, Backend>) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.snapshot())
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn pick_inputs(
    restore_id: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, Backend>,
) -> Result<Snapshot, String> {
    let _guard = state.begin_dialog()?;
    let title = dialogs::title(&state.language(), dialogs::Kind::Input);
    let paths = tauri::async_runtime::spawn_blocking(move || {
        let mut picker = app.dialog().file().set_title(title);
        if let Some(window) = app.get_webview_window("main") {
            picker = picker.set_parent(&window);
        }
        if restore_id.is_some() {
            (restore_id, picker.blocking_pick_file().map(|p| vec![p]))
        } else {
            (restore_id, picker.blocking_pick_files())
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    let (restore_id, paths) = paths;
    if let Some(paths) = paths {
        let paths: Result<Vec<PathBuf>, _> = paths.into_iter().map(|p| p.into_path()).collect();
        let boot = state.boot.clone();
        let paths = paths.map_err(|e| e.to_string())?;
        boot.enqueue(paths, restore_id)?;
        tauri::async_runtime::spawn_blocking(move || boot.wait_snapshot())
            .await
            .map_err(|e| e.to_string())?
    } else {
        let boot = state.boot.clone();
        tauri::async_runtime::spawn_blocking(move || boot.wait_snapshot())
            .await
            .map_err(|e| e.to_string())?
    }
}
#[tauri::command]
async fn pick_output(app: tauri::AppHandle, state: State<'_, Backend>) -> Result<Snapshot, String> {
    let _guard = state.begin_dialog()?;
    let queue = state.queue()?;
    let suggested = tauri::async_runtime::spawn_blocking(move || queue.suggested_output())
        .await
        .map_err(|e| e.to_string())?
        .or_else(|| app.path().home_dir().ok());
    let title = dialogs::title(&state.language(), dialogs::Kind::Output);
    let path = tauri::async_runtime::spawn_blocking(move || {
        let mut picker = app.dialog().file().set_title(title);
        if let Some(window) = app.get_webview_window("main") {
            picker = picker.set_parent(&window);
        }
        if let Some(directory) = suggested {
            picker = picker.set_directory(directory);
        }
        picker.blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let queue = state.queue()?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(path) = path {
            queue.set_output(path.into_path().map_err(|e| e.to_string())?)
        } else {
            queue.snapshot()
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_task_format(
    id: String,
    format: OutputFormat,
    state: State<'_, Backend>,
) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.set_format(&id, format))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn configure_tasks(
    ids: Vec<String>,
    format: Option<OutputFormat>,
    options: z8_native::Options,
    state: State<'_, Backend>,
) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.configure(&ids, format, options))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn reveal_result(id: String, page: u32, state: State<'_, Backend>) -> Result<(), String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        tauri_plugin_opener::reveal_item_in_dir(queue.result_path(&id, page)?)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn submit_batch(request: Submission, state: State<'_, Backend>) -> Result<Snapshot, String> {
    if state.dialog.load(Ordering::SeqCst) {
        return Err("Close the file picker before starting a batch".into());
    }
    let queue = state.queue()?.clone();
    let engines = state.engines.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = queue.snapshot()?;
        for item in &request.items {
            if !item.save_only {
                let task = snapshot
                    .tasks
                    .iter()
                    .find(|t| t.id == item.id)
                    .ok_or("Unknown task")?;
                engines.require(
                    std::path::Path::new(&task.name)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or(""),
                )?;
            }
        }
        queue.submit(request)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn cancel_tasks(ids: Vec<String>, state: State<'_, Backend>) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.cancel(&ids))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn remove_tasks(ids: Vec<String>, state: State<'_, Backend>) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.remove(&ids))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn retry_queue_history(state: State<'_, Backend>) -> Result<Snapshot, String> {
    let queue = state.queue()?.clone();
    tauri::async_runtime::spawn_blocking(move || queue.retry_history())
        .await
        .map_err(|e| e.to_string())?
}
fn engine_source(app: &tauri::App) -> z8_native::startup::Source {
    use z8_native::startup::Source;
    #[cfg(feature = "packaged-engines")]
    {
        app.path()
            .resource_dir()
            .map(|p| Source::Bundle(p.join("engines")))
            .unwrap_or(Source::Disabled)
    }
    #[cfg(feature = "development-engines")]
    {
        let _ = app;
        std::env::var_os("Z8_DEV_ENGINE_MANIFEST")
            .map(|p| Source::Development(p.into()))
            .unwrap_or(Source::Disabled)
    }
    #[cfg(not(any(feature = "development-engines", feature = "packaged-engines")))]
    {
        let _ = app;
        Source::Disabled
    }
}
fn main() {
    z8_native::watchdog_entry();
    // Finite metadata query before WebView/queue initialization. The explicit
    // file variant works without a Windows console and only creates a new file.
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.first().is_some_and(|a| {
        a == "--build-info" || a == "--build-info-file" || a == "--runtime-info-file"
    }) {
        let runtime_report = args[0] == "--runtime-info-file";
        let file_report = args[0] != "--build-info";
        if args.len() != if file_report { 2 } else { 1 } {
            eprintln!("Usage: --build-info OR --build-info-file ABSOLUTE_NEW_FILE OR --runtime-info-file ABSOLUTE_NEW_FILE");
            std::process::exit(2);
        }
        if runtime_report {
            if let Err(error) = build_report::write(
                std::path::Path::new(&args[1]),
                &build_report::runtime_info(),
            ) {
                eprintln!("{error}");
                std::process::exit(1);
            }
            return;
        }
        let mode = if cfg!(feature = "packaged-engines") {
            "bundled"
        } else if cfg!(feature = "development-engines") {
            "development"
        } else {
            "disabled"
        };
        let context: tauri::Context<tauri::Wry> = tauri::generate_context!();
        let info = serde_json::json!({"schema":1,"version":context.package_info().version.to_string(),"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"engines":mode,"debug":cfg!(debug_assertions),"customProtocol":cfg!(feature="custom-protocol"),"updater":false,"processLifetime":if cfg!(windows) { "job-close-v1" } else { "watchdog-pipe-v1" },"fileDialog":if cfg!(target_os="linux") { if cfg!(feature="linux-portal") { "xdg-portal" } else { "gtk3" } } else { "native" },"resourceDirectoryName":context.package_info().name,"applicationId":context.config().identifier});
        if file_report {
            if let Err(error) = build_report::write(std::path::Path::new(&args[1]), &info) {
                eprintln!("{error}");
                std::process::exit(1);
            }
        } else {
            println!("{info}");
        }
        return;
    }
    tauri::Builder::default()
        // Register first, before starting a queue or touching its history file.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let source = engine_source(app);
            let handle = app.handle().clone();
            let notify: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
                let _ = handle.emit_to("main", "desktop-startup-changed", ());
            });
            let engines = z8_native::startup::Runtime::new(
                cfg!(feature = "development-engines"),
                notify.clone(),
            );
            let boot = boot::Boot::new();
            let data = app.path().app_data_dir().map_err(|e| e.to_string());
            let cache = app.path().app_cache_dir().map_err(|e| e.to_string());
            let emitter = app.handle().clone();
            let queue_notify = Arc::new(move |change| {
                let _ = emitter.emit_to("main", "queue-changed", change);
            });
            let preferences = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .map(|dir| {
                    Arc::new(z8_native::preferences::Store::new(
                        dir.join("preferences-v1.json"),
                    ))
                });
            app.manage(Backend {
                diagnostics: Default::default(),
                boot: boot.clone(),
                preferences,
                engines: engines.clone(),
                dialog: Arc::new(AtomicBool::new(false)),
                closing: quit::Gate::default(),
            });
            boot.start(data, cache, engines.clone(), notify, queue_notify);
            engines.start(source);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            open_impact_source,
            preview_diagnostics,
            save_diagnostics,
            read_preferences,
            save_preferences,
            queue_snapshot,
            dismiss_import_report,
            preview_input,
            pick_inputs,
            pick_output,
            set_task_format,
            configure_tasks,
            reveal_result,
            submit_batch,
            cancel_tasks,
            remove_tasks,
            retry_queue_history
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let state = window.state::<Backend>();
                let handle = window.app_handle().clone();
                let boot = state.boot.clone();
                let closing = !state.closing.accepts_dialog();
                let paths = paths.clone();
                // OS-provided paths only. There is no frontend command accepting
                // arbitrary paths, and drops share the native authorization path.
                let dialog_open = state.dialog.load(Ordering::SeqCst);
                tauri::async_runtime::spawn_blocking(move || {
                    let result = if closing {
                        Err("Z8:closing".into())
                    } else if dialog_open {
                        Err("Close the file picker before dropping files".into())
                    } else {
                        boot.enqueue(paths, None)
                    };
                    if let Err(error) = result {
                        let _ = handle.emit_to("main", "desktop-import-error", error);
                    }
                });
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !allow_exit(window.app_handle(), 0) {
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Could not build Z8.Work desktop prototype")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                // OS/menu quit must use the same cleanup path as closing the window.
                if !allow_exit(app, code.unwrap_or(0)) {
                    api.prevent_exit();
                }
            }
        });
}
