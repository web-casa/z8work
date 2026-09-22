"""Rebuild the pinned ICNS WASM; requires Rust 1.85.1 + rust-src/wasm target,
wasm-bindgen built from 2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5,
and Binaryen 117. Source must include Cargo.lock, vendor and .cargo/config.toml.
No network access is needed during the Cargo build. Never replaces app assets.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', required=True, type=Path)
parser.add_argument('--wasm-bindgen', required=True, type=Path)
parser.add_argument('--wasm-opt', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
bindgen, optimizer = args.wasm_bindgen.resolve(), args.wasm_opt.resolve()
output.mkdir(parents=True, exist_ok=False)
(output / 'tmp').mkdir()
sysroot = Path(subprocess.check_output(['rustc', '+1.85.1', '--print', 'sysroot'], text=True).strip())
flags = []
for file in ['wasm-bindgen-0.2.100/src/lib.rs', 'icns-0.3.1/src/family.rs', 'icns-0.3.1/src/element.rs', 'once_cell-1.21.3/src/lib.rs']:
    original = 'C:\\Users\\nullptr\\.cargo\\registry\\src\\index.crates.io-1949cf8c6b5b557f\\' + file.replace('/', '\\')
    flags.append(f'--remap-path-prefix={source / "vendor" / file}={original}')
for name in ['boxed.rs', 'slice.rs']:
    file = 'library/alloc/src/' + name
    original = 'C:\\Users\\nullptr\\.rustup\\toolchains\\stable-x86_64-pc-windows-gnu\\lib/rustlib/src/rust\\' + file
    flags.append(f'--remap-path-prefix={sysroot / "lib/rustlib/src/rust" / file}={original}')
env = dict(os.environ, TMPDIR=str(output / 'tmp'), CARGO_TARGET_DIR=str(output / 'target'), CARGO_ENCODED_RUSTFLAGS='\x1f'.join(flags))
subprocess.run(['cargo', '+1.85.1', 'build', '--frozen', '--release', '--target', 'wasm32-unknown-unknown'], cwd=source, env=env, check=True)
generated = output / 'generated'
subprocess.run([str(bindgen), '--target', 'bundler', '--out-dir', str(generated), str(output / 'target/wasm32-unknown-unknown/release/vert_wasm.wasm')], check=True)
wasm = generated / 'vert_wasm_bg.wasm'
subprocess.run([str(optimizer), '-O', str(wasm), '-o', str(output / 'optimized.wasm')], check=True)
wasm.write_bytes((output / 'optimized.wasm').read_bytes())
actual = hashlib.sha256(wasm.read_bytes()).hexdigest()
expected = '5ce6cbfaf8701c82e8dc16a887e01793db962b407897e870849135fe81e24239'
report = {'schema': 1, 'status': 'passed' if actual == expected else 'failed', 'expectedSha256': expected, 'actualSha256': actual, 'byteIdentical': actual == expected, 'sourceCommit': '4f99ef9abad355a390f1e1dfab4769ef815f54f3', 'rust': '1.85.1', 'wasmBindgenCommit': '2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5', 'binaryen': '117', 'optimization': '-O'}
(output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
if actual != expected:
    raise SystemExit('Rebuilt WASM differs from the pinned application asset')
