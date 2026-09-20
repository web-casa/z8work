fn main() {
    println!("cargo:rerun-if-changed=src/macos_termination.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/macos_termination.m")
            .flag("-fobjc-arc")
            .compile("z8_termination");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "begin_save",
            "append_save",
            "finish_save",
            "abort_save",
            "confirm_close",
            "finish_close",
        ]),
    ))
    .expect("Tauri build failed");
}
