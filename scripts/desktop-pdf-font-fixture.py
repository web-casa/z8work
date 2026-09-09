#!/usr/bin/env python3
"""Create a deterministic PDF with the project's Host Grotesk font embedded.
Requires fontTools + Brotli. No network, OS font lookup or renderer involved.
Usage: python3 scripts/desktop-pdf-font-fixture.py NEW.pdf
"""
from io import BytesIO
from pathlib import Path
import sys
from fontTools.ttLib import TTFont

font = TTFont('src/lib/assets/font/HostGrotesk-Regular.woff2', recalcTimestamp=False)
font.flavor = None
stream = BytesIO()
font.save(stream)
program = stream.getvalue()
text = 'Z8.Work PDF 2026'
units = font['head'].unitsPerEm
cmap = font.getBestCmap()
glyphs = [font.getGlyphID(cmap[ord(c)]) for c in text]
widths = ' '.join(f'{gid} [{round(font["hmtx"][cmap[ord(c)]][0] * 1000 / units)}]' for gid, c in zip(glyphs, text))
encoded = ''.join(f'{gid:04x}' for gid in glyphs)
contents = f'1 1 1 rg 0 0 240 100 re f\n0 0 0 rg BT /F1 24 Tf 12 40 Td <{encoded}> Tj ET\n'.encode()
objects = [
    b'<< /Type /Catalog /Pages 2 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 100] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    f'<< /Length {len(contents)} >>\nstream\n'.encode() + contents + b'endstream',
    b'<< /Type /Font /Subtype /Type0 /BaseFont /HostGrotesk-Regular /Encoding /Identity-H /DescendantFonts [6 0 R] >>',
    f'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /HostGrotesk-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /DW 1000 /W [{widths}] /CIDToGIDMap /Identity >>'.encode(),
    b'<< /Type /FontDescriptor /FontName /HostGrotesk-Regular /Flags 32 /FontBBox [-1000 -1000 2000 2000] /ItalicAngle 0 /Ascent 1000 /Descent -300 /CapHeight 700 /StemV 80 /FontFile2 8 0 R >>',
    f'<< /Length {len(program)} /Length1 {len(program)} >>\nstream\n'.encode() + program + b'\nendstream',
]
pdf = bytearray(b'%PDF-1.4\n')
offsets = [0]
for index, obj in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n')
xref = len(pdf)
pdf.extend(f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:
    pdf.extend(f'{offset:010} 00000 n \n'.encode())
pdf.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
if len(sys.argv) != 2:
    raise SystemExit(__doc__)
with Path(sys.argv[1]).open('xb') as dest:
    dest.write(pdf)
