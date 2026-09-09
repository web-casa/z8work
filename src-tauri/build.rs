fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_info",
            "open_impact_source",
            "preview_diagnostics",
            "save_diagnostics",
            "read_preferences",
            "save_preferences",
            "queue_snapshot",
            "dismiss_import_report",
            "preview_input",
            "pick_inputs",
            "pick_output",
            "set_task_format",
            "configure_tasks",
            "reveal_result",
            "submit_batch",
            "cancel_tasks",
            "remove_tasks",
            "retry_queue_history",
        ]),
    ))
    .expect("Tauri build failed");
}
