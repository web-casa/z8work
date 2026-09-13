//! The reviewed product scope is shared with the frontend; engine discovery does
//! not automatically authorize additional routes.
use crate::OutputFormat;
use serde::Deserialize;
use std::sync::OnceLock;
#[derive(Deserialize)]
struct Scope {
    groups: Vec<RawGroup>,
}
#[derive(Deserialize)]
struct RawGroup {
    id: String,
    inputs: Vec<String>,
    outputs: Vec<OutputFormat>,
    engines: Vec<Engine>,
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Engine {
    Magick,
    Mutool,
    Ffmpeg,
    Ffprobe,
    Pandoc,
}
impl Engine {
    fn name(&self) -> &'static str {
        match self {
            Self::Magick => "magick",
            Self::Mutool => "mutool",
            Self::Ffmpeg => "ffmpeg",
            Self::Ffprobe => "ffprobe",
            Self::Pandoc => "pandoc",
        }
    }
}
pub(crate) struct Group {
    pub id: String,
    pub inputs: Vec<String>,
    pub outputs: Vec<OutputFormat>,
    pub engines: Vec<&'static str>,
}
pub(crate) fn groups() -> &'static [Group] {
    static GROUPS: OnceLock<Vec<Group>> = OnceLock::new();
    GROUPS.get_or_init(|| {
        let scope: Scope =
            serde_json::from_str(include_str!("../../../packaging/desktop/v1-scope.json"))
                .expect("Embedded format scope must be valid");
        scope
            .groups
            .into_iter()
            .map(|g| Group {
                id: g.id,
                inputs: g.inputs,
                outputs: g.outputs,
                engines: g.engines.iter().map(Engine::name).collect(),
            })
            .collect()
    })
}
pub(crate) fn group(extension: &str) -> Option<&'static Group> {
    groups()
        .iter()
        .find(|g| g.inputs.iter().any(|s| s.eq_ignore_ascii_case(extension)))
}
pub(crate) fn required(extension: &str) -> &'static [&'static str] {
    group(extension)
        .map(|g| g.engines.as_slice())
        .unwrap_or(&[])
}
pub(crate) fn outputs(extension: &str) -> Vec<OutputFormat> {
    group(extension)
        .map(|g| g.outputs.clone())
        .unwrap_or_default()
}
pub(crate) fn image_input(extension: &str) -> bool {
    group(extension).is_some_and(|g| g.id == "images")
}
