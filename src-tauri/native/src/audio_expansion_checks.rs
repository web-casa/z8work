//! Real audio content checks for OGG/Vorbis and AIFF. Not exposed through IPC.
use crate::{
    convert, hash_file, output_formats,
    phase27_smoke::audio_semantics,
    phase2_smoke::{command, name},
    Cancel, Engines, OutputFormat,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
const NEW: [OutputFormat; 2] = [OutputFormat::Ogg, OutputFormat::Aiff];
// Ten fixtures exercise the two original routes; the AIFF and AIF aliases
// additionally exercise the seven original outputs plus AAC and ALAC. Keep
// that deliberate baseline independent of later product-scope expansion.
pub(crate) const FROZEN_ROUTE_COUNT: usize = 38;

fn probe(engines: &Engines, path: &Path) -> Result<Value, String> {
    serde_json::from_str(&command(
        engines,
        "ffprobe",
        &[
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            name(path),
        ],
    )?)
    .map_err(|e| e.to_string())
}
fn shape(
    engines: &Engines,
    path: &Path,
    format: OutputFormat,
    rate: u32,
    channels: u32,
) -> Result<Value, String> {
    let value = probe(engines, path)?;
    let codec = if format == OutputFormat::Ogg {
        "vorbis"
    } else {
        "pcm_s16be"
    };
    let container = if format == OutputFormat::Ogg {
        "ogg"
    } else {
        "aiff"
    };
    let streams = value["streams"]
        .as_array()
        .ok_or("Missing output streams")?;
    if streams.len() != 1
        || streams[0]["codec_name"] != codec
        || streams[0]["sample_rate"] != rate.to_string()
        || streams[0]["channels"] != channels
        || value["format"]["format_name"] != container
    {
        return Err(format!("Audio encoding differs: {value}"));
    }
    for tags in [&value["format"]["tags"], &streams[0]["tags"]] {
        if tags.as_object().is_some_and(|tags| {
            tags.iter()
                .any(|(k, _)| k.eq_ignore_ascii_case("title") || k.eq_ignore_ascii_case("artist"))
        }) {
            return Err("User audio tags survived removal".into());
        }
    }
    Ok(
        json!({"codec":codec,"container":container,"sampleRate":rate,"channels":channels,"tagsRemoved":true}),
    )
}
fn pcm(engines: &Engines, input: &Path, dest: &Path) -> Result<Vec<u8>, String> {
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-i",
            name(input),
            "-map",
            "0:a:0",
            "-c:a",
            "pcm_s16le",
            "-f",
            "s16le",
            name(dest),
        ],
    )?;
    fs::read(dest).map_err(|e| e.to_string())
}
pub fn verify(engines: &Engines) -> Result<Value, String> {
    engines.verify_bundle()?;
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let out = root.path().join("saved");
    fs::create_dir(&out).map_err(|e| e.to_string())?;
    let wav = root.path().join("立体声 source.wav");
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.2*sin(2*PI*440*t)|0.2*sin(2*PI*880*t):s=48000:d=1",
            "-c:a",
            "pcm_s16le",
            "-metadata",
            "title=Z8_PRIVATE_TITLE",
            name(&wav),
        ],
    )?;
    if probe(engines, &wav)?["format"]["tags"]["title"] != "Z8_PRIVATE_TITLE" {
        return Err("Missing metadata fixture".into());
    }
    let mut inputs = vec![wav.clone()];
    for format in [
        OutputFormat::Mp3,
        OutputFormat::Flac,
        OutputFormat::Opus,
        OutputFormat::M4a,
    ] {
        inputs.push(PathBuf::from(
            convert(engines, &wav, &out, format, &Cancel::default())?.path,
        ));
    }
    let ogg = root.path().join("source.ogg");
    fs::write(&ogg, include_bytes!("../fixtures/stereo-vorbis.ogg")).map_err(|e| e.to_string())?;
    inputs.push(ogg);
    let aiff = root.path().join("source.aiff");
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-i",
            name(&wav),
            "-c:a",
            "pcm_s16be",
            name(&aiff),
        ],
    )?;
    let aif = root.path().join("alias.aif");
    fs::copy(&aiff, &aif).map_err(|e| e.to_string())?;
    inputs.extend([aiff.clone(), aif.clone()]);
    for (ext, vc, ac) in [
        ("mp4", "mpeg4", "aac"),
        ("mov", "mpeg4", "aac"),
        ("mkv", "ffv1", "flac"),
        ("webm", "libvpx-vp9", "libopus"),
    ] {
        let video = root.path().join(format!("video.{ext}"));
        command(
            engines,
            "ffmpeg",
            &[
                "-nostdin",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=16x16:r=10",
                "-i",
                name(&wav),
                "-t",
                "1",
                "-c:v",
                vc,
                "-c:a",
                ac,
                name(&video),
            ],
        )?;
        inputs.push(video);
    }
    let mut routes = vec![];
    for input in &inputs {
        let extension = input.extension().unwrap().to_str().unwrap();
        let before = hash_file(input)?;
        for format in output_formats(extension) {
            if !["aiff", "aif"].contains(&extension) && !NEW.contains(&format) {
                continue;
            }
            let result = convert(engines, input, &out, format, &Cancel::default())?;
            let semantic = audio_semantics(engines, input, Path::new(&result.path))?;
            let encoding = if NEW.contains(&format) {
                shape(engines, Path::new(&result.path), format, 48000, 2)?
            } else {
                Value::Null
            };
            if hash_file(input)? != before {
                return Err("Audio source changed".into());
            }
            routes.push(json!({"input":extension,"output":format,"bytes":result.bytes,"decoded":true,"sourceUnchanged":true,"semantic":semantic,"encoding":encoding}));
        }
    }
    let mut boundaries = vec![];
    for rate in [8000, 44100] {
        let input = root.path().join(format!("mono-{rate}.wav"));
        let signal = format!("aevalsrc=0.2*sin(2*PI*440*t):s={rate}:d=1");
        command(
            engines,
            "ffmpeg",
            &[
                "-nostdin",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                &signal,
                "-c:a",
                "pcm_s16le",
                name(&input),
            ],
        )?;
        for format in NEW {
            let result = convert(engines, &input, &out, format, &Cancel::default())?;
            let encoding = shape(engines, Path::new(&result.path), format, rate, 1)?;
            let data = pcm(
                engines,
                Path::new(&result.path),
                &root.path().join(format!("mono-{rate}-{format:?}.pcm")),
            )?;
            let peak = data
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]).unsigned_abs())
                .max()
                .unwrap_or(0);
            if peak < 3000
                || peak > 15000
                || (data.len() as i64 - rate as i64 * 2).abs() > rate as i64 / 5
            {
                return Err("Mono content lost or clipped".into());
            }
            boundaries.push(json!({"check":"mono","format":format,"sampleRate":rate,"passed":true,"peak":peak,"decodedSamples":data.len()/2,"encoding":encoding}));
        }
    }
    // AIFF is explicitly a 16-bit output; verify quantization rather than claiming 24-bit preservation.
    for depth in [16, 24] {
        let input = root.path().join(format!("depth-{depth}.aiff"));
        let codec = format!("pcm_s{depth}be");
        command(
            engines,
            "ffmpeg",
            &[
                "-nostdin",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "aevalsrc=0.1234567*sin(2*PI*440*t):s=96000:d=0.5",
                "-c:a",
                &codec,
                name(&input),
            ],
        )?;
        let result = convert(
            engines,
            &input,
            &out,
            OutputFormat::Aiff,
            &Cancel::default(),
        )?;
        shape(
            engines,
            Path::new(&result.path),
            OutputFormat::Aiff,
            96000,
            1,
        )?;
        let a = pcm(
            engines,
            &input,
            &root.path().join(format!("expected-{depth}.pcm")),
        )?;
        let b = pcm(
            engines,
            Path::new(&result.path),
            &root.path().join(format!("actual-{depth}.pcm")),
        )?;
        if a.is_empty() || a != b {
            return Err("AIFF PCM16 quantization differs".into());
        }
        boundaries.push(
            json!({"check":"pcm16","sourceDepth":depth,"passed":true,"decodedSamples":a.len()/2}),
        );
    }
    let multi = root.path().join("two-tracks.mkv");
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-i",
            name(&wav),
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.2*sin(2*PI*1200*t)|0.2*sin(2*PI*1600*t):s=48000:d=1",
            "-map",
            "0:a",
            "-map",
            "1:a",
            "-c:a",
            "flac",
            name(&multi),
        ],
    )?;
    for format in NEW {
        let result = convert(engines, &multi, &out, format, &Cancel::default())?;
        shape(engines, Path::new(&result.path), format, 48000, 2)?;
        audio_semantics(engines, &multi, Path::new(&result.path))?;
        let data = pcm(
            engines,
            Path::new(&result.path),
            &root.path().join(format!("first-track-{format:?}.pcm")),
        )?;
        let mut rejected = Vec::new();
        for (channel, frequency) in [(0, 1200.0), (1, 1600.0)] {
            let (mut re, mut im) = (0.0f64, 0.0f64);
            for (n, frame) in data.chunks_exact(4).enumerate() {
                let value = i16::from_le_bytes([frame[channel * 2], frame[channel * 2 + 1]]) as f64
                    / 32768.0;
                let phase = std::f64::consts::TAU * frequency * n as f64 / 48000.0;
                re += value * phase.cos();
                im += value * phase.sin();
            }
            let amplitude = 2.0 * re.hypot(im) / (data.len() / 4) as f64;
            if !amplitude.is_finite() || amplitude >= 0.01 {
                return Err("Second audio track leaked into output".into());
            }
            rejected.push(amplitude);
        }
        boundaries.push(json!({"check":"first-track","format":format,"passed":true,"rejectedTrackAmplitude":rejected}));
    }
    let silent_video = root.path().join("no-audio.mp4");
    command(
        engines,
        "ffmpeg",
        &[
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=16x16:r=10:d=1",
            "-c:v",
            "mpeg4",
            name(&silent_video),
        ],
    )?;
    for format in NEW {
        if convert(engines, &silent_video, &out, format, &Cancel::default()).is_ok() {
            return Err("Video without audio was accepted".into());
        }
        boundaries.push(json!({"check":"no-audio","format":format,"passed":true}));
    }
    let mut controls = vec![];
    for input in [&aiff, &aif] {
        let ext = input.extension().unwrap().to_str().unwrap();
        let token = Cancel::default();
        token.cancel();
        if convert(engines, input, &out, OutputFormat::Ogg, &token)
            .err()
            .as_deref()
            != Some("Cancelled")
        {
            return Err("Audio cancellation ignored".into());
        }
        let before = convert(engines, input, &out, OutputFormat::Aiff, &Cancel::default())?;
        let after = convert(engines, input, &out, OutputFormat::Aiff, &Cancel::default())?;
        if before.path == after.path
            || hash_file(Path::new(&before.path))? != hash_file(Path::new(&after.path))?
        {
            return Err("Audio repeated save overwrote output".into());
        }
        let bad = root.path().join(format!("playlist.{ext}"));
        fs::write(&bad, format!("#EXTM3U\n{}\n", wav.display())).map_err(|e| e.to_string())?;
        if convert(engines, &bad, &out, OutputFormat::Ogg, &Cancel::default()).is_ok() {
            return Err("Disguised AIFF playlist accepted".into());
        }
        controls.push(json!({"input":ext,"cancel":true,"collision":true,"playlistRejected":true}));
    }
    if routes.len() != FROZEN_ROUTE_COUNT {
        return Err(format!(
            "Incomplete audio frozen route regression suite: expected {FROZEN_ROUTE_COUNT}, got {}",
            routes.len()
        ));
    }
    Ok(
        json!({"schema":1,"scope":"audio-expansion-3b","platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"engines":engines.info(),"routes":routes,"boundaries":boundaries,"controls":controls}),
    )
}
