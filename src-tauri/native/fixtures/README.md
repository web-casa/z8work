# Native conversion fixtures

`stereo-vorbis.ogg` is a synthetic one-second, 48 kHz stereo signal: 440 Hz left, 880 Hz right, amplitude 0.2. It contains no user data. Generated for this project with FFmpeg 7.1.5 and libvorbis; offered under the repository license.

```sh
ffmpeg -nostdin -v error -f lavfi -i 'aevalsrc=0.2*sin(2*PI*440*t)|0.2*sin(2*PI*880*t):s=48000:d=1' -c:a libvorbis stereo-vorbis.ogg
```

The converter supports Vorbis input, not Vorbis output. A checked-in fixture avoids requiring an unused encoder just to produce a test input. Existing decoding, conversion, channel, duration and signal checks remain in place. The Ogg serial number can vary when regenerating; review and fingerprint the resulting bytes.

SHA-256: `6e87f0ee038a07a62b938d335ea3767681162650d9182c7557c39fbc01e054cb`.

## Pandoc reader fixtures

The document checks validate the product input-to-text reader. They do not
generate DOCX, ODT or EPUB through the bundled Pandoc writer at test time:
that writer needs its own template data and is a different route from the
sandboxed conversion path.

All files below are synthetic, contain no user data, and were generated twice
with the pinned z8-core24-format-matrix:latest build image using Pandoc 3.1.3,
SOURCE_DATE_EPOCH=1757894400, TZ=UTC, a fixed title/date and a fixed UUID
identifier. The two generations had identical SHA-256 values. Rebuild only by
reviewing the source markdown and expected hash change.

| Source and outputs           | SHA-256                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| format-matrix-source.md      | 3b2d30ecb18bc79831d29edb86139fd16af342ee4e127e6f54d6038da6396a17 |
| format-matrix.docx           | e2c9d8f4ca668f9e3664945c8561ecbaa603014ebe0b2c595c84831389f32c37 |
| format-matrix.odt            | 165c8eb4a5126de63aa728ccfe43c51bb8141198c6b6da50bcb13491ff52157a |
| format-matrix.epub           | b192110f655698a34a7c2ea335846d5e036697b73a233905918347507d3b774a |
| document-expansion-source.md | 1bc0c41cbb186fe16086bd7478e8ed0ce0a0903c57a8b1eb56c5c9a49c5306d4 |
| document-expansion.html      | 75a6cfd3080de0d4ea28e56bf8f6e6a93f58943b627dd8cce431fc8dc6c2a5be |
| document-expansion.odt       | e1650595474bd3a183fcabb41709f5a73f76790eaced5d6a0103fe2b9ee736e1 |
| document-expansion.epub      | dc4d4c6ca348961eb0ed4820ab81908a0354c8668a0fa430db679c67e403f614 |

The target-package reader is exercised with sandbox mode, its bundled data
directory and the explicit product reader name. The exact ARM64 evidence is
recorded under docs/desktop/evidence/format-matrix-20260915.
