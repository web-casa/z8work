use tauri::Manager;
const APPLICATION: &str = include_str!("../../LICENSE");
#[tauri::command]
pub async fn license_index(app: tauri::AppHandle) -> Result<Vec<z8_native::LicenseEntry>, String> {
    let mut entries = vec![z8_native::LicenseEntry {
        id: "application".into(),
        bytes: APPLICATION.len() as u64,
    }];
    if cfg!(feature = "packaged-engines") {
        let root = app
            .path()
            .resource_dir()
            .map_err(|_| "licenses_unavailable")?
            .join("engines");
        let bundled = tauri::async_runtime::spawn_blocking(move || z8_native::license_index(&root))
            .await
            .map_err(|_| "licenses_unavailable")?
            .map_err(|_| "licenses_unavailable")?;
        entries.extend(bundled);
    }
    Ok(entries)
}
#[tauri::command]
pub async fn read_license(app: tauri::AppHandle, id: String) -> Result<String, String> {
    if id == "application" {
        return Ok(APPLICATION.into());
    }
    if !cfg!(feature = "packaged-engines") || id.len() > 512 {
        return Err("licenses_unavailable".into());
    }
    let root = app
        .path()
        .resource_dir()
        .map_err(|_| "licenses_unavailable")?
        .join("engines");
    tauri::async_runtime::spawn_blocking(move || z8_native::read_license(&root, &id))
        .await
        .map_err(|_| "licenses_unavailable")?
        .map_err(|_| "licenses_unavailable".into())
}
