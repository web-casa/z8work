# Image conversion fixtures

These small fixtures are generated test patterns, not user photographs. They contain no personal data.

Created with native ImageMagick 7.1.1-43 and its HEIC delegate; the tests themselves only need the checked-in files and magick-wasm.

```sh
convert -size 48x32 gradient:'#234567-#eab878' -depth 8 -quality 80 gradient-8bit.heic
convert -size 48x32 gradient:'#234567-#eab878' -depth 10 -quality 80 gradient-10bit.heic
convert -size 80x64 xc:red -set delay 12 -set dispose none \( -size 16x16 xc:blue -set page 80x64+20+10 -set delay 24 -set dispose none \) -loop 0 -set comment 'animation-metadata' partial.gif
convert -size 32x32 xc:red \( -size 64x64 xc:blue \) multi.ico
```

`partial.gif` deliberately uses a smaller second frame with an offset to catch broken animation composition. `multi.ico` exercises the browser worker's two-image ZIP output.

The current magick-wasm build uses Q8 pixels: the 10-bit HEIC test compares the decoded 8-bit pixels across PNG encoding, not preservation of the source's full 10-bit precision.

`display-p3.icc` is the CC0 Display P3 test profile from Compact-ICC-Profiles. Source, pinned revision and checksum are recorded in [the bundled-profile documentation](../../src/lib/assets/profiles/README.md). Test images using this profile are generated in memory.

`cover.png`, `cover.mp3` and `thumbnail.webm` are synthetic thumbnail fixtures generated with FFmpeg 7.1.5. The MP3 contains one second of silence and an embedded 32 × 32 red PNG. Its ID3 cover occupies a subarray of the metadata buffer, reproducing the byte-offset bug without user data. The WebM is a short blue frame sequence. Browser tests use the checked-in files and do not need native FFmpeg installed.

```sh
ffmpeg -f lavfi -i color=c=red:s=32x32 -frames:v 1 -update 1 cover.png
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -i cover.png -map 0:a -map 1:v -c:a libmp3lame -c:v copy -t 1 -id3v2_version 3 -metadata:s:v title=Cover -metadata:s:v comment='Cover (front)' cover.mp3
ffmpeg -f lavfi -i color=c=blue:s=32x32:d=0.4 -c:v libvpx -an thumbnail.webm
```

The desktop verifier also generates a one-page ICCBased PDF in
`src-tauri/native/src/pdf_color_checks.rs`, using the same Display P3 profile.
Six 48 × 48 point swatches are painted with relative colorimetric intent. At
72 DPI the page is 288 × 48 pixels. Their independent sRGB reference values
come from Display P3 linearization, the P3 → XYZ D65 → sRGB matrices, clipping
and 8-bit sRGB encoding in [W3C CSS Color 4 sample math](https://raw.githubusercontent.com/w3c/csswg-drafts/main/css-color-4/conversions.js).
Each central 16 × 16 region must remain opaque. The maximum channel error is
limited to 8/255 for every output, allowing MuPDF's approximate LCMS transform
and the lossy encoders. A second render with `mutool draw -N` must differ by at
least 30/255, ensuring the unchanged fixture detects disabled ICC. This checks
rendered color, not just the presence of a profile. It is not a print-proofing,
CMYK, HDR or arbitrary-profile conformance suite.
