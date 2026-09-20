fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "begin_save",
            "append_save",
            "finish_save",
            "abort_save",
            "confirm_close",
        ]),
    ))
    .expect("Tauri build failed");
}
