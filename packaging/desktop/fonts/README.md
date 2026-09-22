# Fixed SVG fallback fonts

The native static-SVG renderer loads only these embedded font files. It does
not enumerate or load fonts installed on the operating system.

| File                        | Source                                                                                                                                                                                                                                                                                  | License                                     | SHA-256                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `HostGrotesk-Regular.ttf`   | Transcoded without glyph edits from [`src/lib/assets/font/HostGrotesk-Regular.woff2`](../../../src/lib/assets/font/HostGrotesk-Regular.woff2), source project [Element-Type/HostGrotesk](https://github.com/Element-Type/HostGrotesk) commit `ab2ba6769119e7ae71aa2fab46eedcb993c670a3` | SIL OFL 1.1, `HostGrotesk-OFL.txt`          | `a914e15f4ecd517fffb27e05cd0a94d14e1bdb3477052fac3364d4194abfdb7b` |
| `DroidSansFallbackFull.ttf` | Android Open Source Project `android-15.0.0_r25`, `frameworks/base/data/fonts/DroidSansFallbackFull.ttf`                                                                                                                                                                                | Apache-2.0, `Android-Apache-2.0-NOTICE.txt` | `2392015530438bafc48edfc4aee6d9de2387f627a6134d8ab3dfcc99d21c8240` |

The original WOFF2 source hash is
`229464c7a47ce1bf7382667f98b5e52037ff0095b1dbaa7283fed7b66b6a6c15`.
The `.ttf` conversion used FontTools only to change the container format; it
did not subset, rename, or modify the font outlines.
