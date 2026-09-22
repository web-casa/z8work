use z8_native::preferences::Language;
pub enum Kind {
    Input,
    Output,
    Diagnostic,
}
pub fn title(language: &Language, kind: Kind) -> &'static str {
    match (language, kind) {
        (Language::ZhHans, Kind::Input) => "Z8.Work — 选择输入文件",
        (Language::ZhHans, Kind::Output) => "Z8.Work — 选择保存目录",
        (Language::ZhHans, Kind::Diagnostic) => "Z8.Work — 保存诊断报告",
        (Language::En, Kind::Input) => "Z8.Work — Select input files",
        (Language::En, Kind::Output) => "Z8.Work — Select output folder",
        (Language::En, Kind::Diagnostic) => "Z8.Work — Save diagnostic report",
        (Language::System, Kind::Input) => "Z8.Work — Select input files / 选择输入文件",
        (Language::System, Kind::Output) => "Z8.Work — Select output folder / 选择保存目录",
        (Language::System, Kind::Diagnostic) => "Z8.Work — Save diagnostic report / 保存诊断报告",
    }
}
