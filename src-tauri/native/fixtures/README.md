# Native conversion fixtures

`stereo-vorbis.ogg` is a synthetic one-second, 48 kHz stereo signal: 440 Hz left, 880 Hz right, amplitude 0.2. It contains no user data. Generated for this project with FFmpeg 7.1.5 and libvorbis; offered under the repository license.

```sh
ffmpeg -nostdin -v error -f lavfi -i 'aevalsrc=0.2*sin(2*PI*440*t)|0.2*sin(2*PI*880*t):s=48000:d=1' -c:a libvorbis stereo-vorbis.ogg
```

The converter supports Vorbis input, not Vorbis output. A checked-in fixture avoids requiring an unused encoder just to produce a test input. Existing decoding, conversion, channel, duration and signal checks remain in place. The Ogg serial number can vary when regenerating; review and fingerprint the resulting bytes.

SHA-256: `6e87f0ee038a07a62b938d335ea3767681162650d9182c7557c39fbc01e054cb`.
