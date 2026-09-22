use super::*;

// Scale the display aspect ratio (including non-square pixels), then emit square
// pixels for WebView. Do not use the source pixel ratio alone or stretch to a square.
const SCALE: &str = "scale=w='max(1,trunc(min(256,256*if(gt(dar,0),dar,a))))':h='max(1,trunc(min(256,256/if(gt(dar,0),dar,a))))',setsar=1";

fn input_options(demuxer: &str) -> Vec<OsString> {
    let mut args = vec![
        text("-v"),
        text("error"),
        text("-max_alloc"),
        text("67108864"),
        text("-threads"),
        text("1"),
        text("-probesize"),
        text("1048576"),
        text("-analyzeduration"),
        text("1000000"),
        text("-protocol_whitelist"),
        text("file"),
        text("-f"),
        text(demuxer),
    ];
    if demuxer == "mov" {
        args.extend([
            text("-enable_drefs"),
            text("0"),
            text("-use_absolute_path"),
            text("0"),
        ]);
    }
    args
}

pub(super) fn render(job: &Job<'_>, input: &Path, output: &Path, ext: &str) -> Result<(), String> {
    let demuxer = media_demuxer(ext).ok_or("Unsupported preview media container")?;
    let cover = !matches!(ext, "mp4" | "mov" | "mkv" | "webm");
    let mut probe_args = input_options(demuxer);
    probe_args.extend([
        text("-select_streams"),
        text("v"),
        text("-show_entries"),
        text("stream=index,codec_type,width,height:stream_disposition=attached_pic"),
        text("-of"),
        text("json"),
        input.as_os_str().to_owned(),
    ]);
    let index = select_stream(&job.run("ffprobe", &probe_args)?, cover)?;
    let mut args = vec![
        text("-nostdin"),
        text("-n"),
        text("-xerror"),
        text("-filter_threads"),
        text("1"),
    ];
    args.extend(input_options(demuxer));
    args.extend([
        text("-i"),
        input.as_os_str().to_owned(),
        text("-map"),
        text(&format!("0:{index}")),
        text("-an"),
        text("-sn"),
        text("-dn"),
        text("-frames:v"),
        text("1"),
        text("-vf"),
        text(SCALE),
        text("-map_metadata"),
        text("-1"),
        text("-map_chapters"),
        text("-1"),
        text("-threads"),
        text("1"),
        text("-c:v"),
        text("png"),
        text("-pix_fmt"),
        text("rgba"),
        text("-fs"),
        text("524289"),
        text("-f"),
        text("image2"),
        text("-update"),
        text("1"),
        output.as_os_str().to_owned(),
    ]);
    job.run("ffmpeg", &args)?;
    Ok(())
}

fn select_stream(probe: &str, cover: bool) -> Result<u32, String> {
    let value: serde_json::Value = serde_json::from_str(probe).map_err(|e| e.to_string())?;
    let streams = value["streams"]
        .as_array()
        .ok_or("Invalid preview stream metadata")?;
    let stream = streams
        .iter()
        .find(|s| {
            s["codec_type"] == "video"
                && (s["disposition"]["attached_pic"].as_u64() == Some(1)) == cover
        })
        .ok_or(if cover {
            "No embedded cover image found"
        } else {
            "No video frame stream found"
        })?;
    let width = stream["width"]
        .as_u64()
        .ok_or("Missing preview source dimensions")?;
    let height = stream["height"]
        .as_u64()
        .ok_or("Missing preview source dimensions")?;
    if !(1..=8000).contains(&width) || !(1..=8000).contains(&height) || width * height > 16_000_000
    {
        return Err("Preview source exceeds the 16 megapixel / 8000 px limit".into());
    }
    stream["index"]
        .as_u64()
        .filter(|i| *i < 1024)
        .map(|i| i as u32)
        .ok_or("Invalid preview stream index".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn stream(index: u32, cover: bool) -> serde_json::Value {
        json!({"index":index,"codec_type":"video","width":720,"height":480,"disposition":{"attached_pic":u8::from(cover)}})
    }
    #[test]
    fn video_skips_album_art_and_audio_requires_attached_picture() {
        let probe = json!({"streams":[stream(1,true),stream(3,false)]}).to_string();
        assert_eq!(select_stream(&probe, false).unwrap(), 3);
        assert_eq!(select_stream(&probe, true).unwrap(), 1);
        assert!(
            select_stream(&json!({"streams":[stream(3,false)]}).to_string(), true)
                .unwrap_err()
                .contains("No embedded")
        );
        assert!(
            select_stream(&json!({"streams":[stream(1,true)]}).to_string(), false)
                .unwrap_err()
                .contains("No video")
        );
    }
    #[test]
    fn rejects_unbounded_or_invalid_frame_metadata() {
        for (key, value) in [
            ("width", json!(0)),
            ("height", json!(8001)),
            ("width", json!(-1)),
            ("index", json!(1024)),
            ("index", json!("1")),
        ] {
            let mut s = stream(1, false);
            s[key] = value;
            assert!(select_stream(&json!({"streams":[s]}).to_string(), false).is_err());
        }
        let mut s = stream(1, false);
        s["width"] = json!(8000);
        s["height"] = json!(8000);
        assert!(select_stream(&json!({"streams":[s]}).to_string(), false).is_err());
        for probe in ["{}", "{\"streams\":[]}", "not JSON"] {
            assert!(select_stream(probe, false).is_err());
        }
    }
    #[test]
    fn media_input_options_force_containers_and_disable_mov_references() {
        for ext in [
            "mp3", "wav", "flac", "ogg", "opus", "m4a", "mp4", "mov", "mkv", "webm",
        ] {
            let demuxer = media_demuxer(ext).unwrap();
            let args = input_options(demuxer);
            assert!(args.windows(2).any(|p| p == [text("-f"), text(demuxer)]));
            assert!(args
                .windows(2)
                .any(|p| p == [text("-protocol_whitelist"), text("file")]));
            if demuxer == "mov" {
                for option in ["-enable_drefs", "-use_absolute_path"] {
                    assert!(args.windows(2).any(|p| p == [text(option), text("0")]));
                }
            }
        }
        for ext in ["m3u8", "concat", "srt", "svg", "mp4.exe"] {
            assert!(media_demuxer(ext).is_none());
        }
    }
}
