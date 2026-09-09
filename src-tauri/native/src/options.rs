use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Quality {
    Small,
    #[default]
    Balanced,
    High,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Options {
    pub quality: Quality,
    pub keep_metadata: bool,
    pub pdf_dpi: u16,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            quality: Quality::Balanced,
            keep_metadata: false,
            pdf_dpi: 144,
        }
    }
}
impl Options {
    pub fn validate(&self) -> Result<(), String> {
        if ![72, 96, 144].contains(&self.pdf_dpi) {
            return Err("PDF DPI must be 72, 96 or 144".into());
        }
        Ok(())
    }
    pub fn image_quality(&self, avif: bool) -> u8 {
        match (self.quality, avif) {
            (Quality::Small, true) => 45,
            (Quality::Balanced, true) => 60,
            (Quality::High, true) => 80,
            (Quality::Small, false) => 65,
            (Quality::Balanced, false) => 80,
            (Quality::High, false) => 92,
        }
    }
}
