# Standard sRGB output profile

`srgb.icc` is a standard sRGB profile generated locally with Little CMS 2's
`cmsCreate_sRGBProfile` and `cmsSaveProfileToFile` on 2026-09-13. It is generated
colour-space data, not a downloaded photographer/display vendor profile.

The static BMP/TGA/QOI pipeline applies this profile before discarding profiles
and writing 8-bit samples. Tagged inputs are transformed through ImageMagick's
LCMS delegate; untagged RGB inputs are treated as sRGB. This does not promise
HDR preservation or lossless conversion from wide-gamut/16-bit originals.

Regeneration requires Little CMS 2 and changes the profile creation timestamp;
commit and review the resulting bytes rather than regenerating during builds.
API: <https://github.com/mm2/Little-CMS/blob/master/include/lcms2.h>.
