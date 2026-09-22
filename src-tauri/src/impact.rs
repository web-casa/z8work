// Only these fixed public sources may leave the app, via the system browser.
// No URL, path, query or browser command is accepted from the WebView.
pub fn source(id: &str) -> Result<&'static str, &'static str> {
    match id {
        "storage" => Ok("https://www.cloudcarbonfootprint.org/docs/methodology/"),
        "electricity" => Ok("https://www.iea.org/reports/electricity-2026/emissions"),
        "population" => Ok("https://www.itu.int/en/mediacentre/Pages/PR-2025-11-17-Facts-and-Figures.aspx"),
        "materials" => Ok("https://www.seagate.com/resources/working-toward-the-future-of-circularity/"),
        "waste" => Ok("https://www.itu.int/en/ITU-D/Environment/Pages/Publications/The-Global-E-waste-Monitor-2024.aspx"),
        _ => Err("Unknown source"),
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn only_fixed_source_ids_can_open() {
        for id in ["storage", "electricity", "population", "materials", "waste"] {
            assert!(super::source(id).unwrap().starts_with("https://"));
        }
        for id in [
            "https://z8.work",
            "file:///etc/passwd",
            "storage?file=secret",
            "storage/",
            "",
            "--help",
        ] {
            assert!(super::source(id).is_err());
        }
    }
}
